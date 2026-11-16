import { useMemo, useState, type FormEvent } from 'react';
import { Search, Plus, Pencil, History, Trash2, X } from 'lucide-react';
import type {
  BusinessSettings,
  Customer,
  Invoice,
  JobCosting,
  Payment,
} from '../types';
import {
  BLUEPRINT_LIMITS,
  formatCurrency,
  formatDisplayDate,
  isInvoiceActive,
} from '../utils/format';
import { deleteCustomer, saveCustomer } from '../services/firestoreService';
import { ConfirmDialog } from './ConfirmDialog';

interface CustomersProps {
  uid: string;
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  jobCostings: JobCosting[];
  settings: BusinessSettings;
  onNotify: (message: string, type?: 'success' | 'error') => void;
}

export function Customers({
  uid,
  customers,
  invoices,
  payments,
  jobCostings,
  settings,
  onNotify,
}: CustomersProps) {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [notes, setNotes] = useState('');

  const sym = settings.currencySymbol || '₹';

  const customerStats = useMemo(() => {
    const map = new Map<
      string,
      { billed: number; paid: number; due: number; invoiceCount: number }
    >();
    for (const inv of invoices) {
      if (!inv.customerId || !isInvoiceActive(inv)) continue;
      const cur = map.get(inv.customerId) || {
        billed: 0,
        paid: 0,
        due: 0,
        invoiceCount: 0,
      };
      cur.billed += inv.total;
      cur.paid += inv.paidAmount;
      cur.due += inv.balanceDue;
      cur.invoiceCount += 1;
      map.set(inv.customerId, cur);
    }
    return map;
  }, [invoices]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.pincode.includes(q) ||
        c.address.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setAddress('');
    setPincode('');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address);
    setPincode(c.pincode);
    setNotes(c.notes || '');
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!BLUEPRINT_LIMITS.pincodePattern.test(pincode.trim())) {
      onNotify('Pincode must be a valid 6-digit Indian pincode (e.g. 600001).', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveCustomer(uid, {
        id: editing?.id,
        name,
        phone,
        address,
        pincode: pincode.trim(),
        notes,
      });
      onNotify(editing ? 'Customer updated.' : 'Customer added.', 'success');
      setModalOpen(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save customer.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (c: Customer) => {
    const hasInvoices = invoices.some((i) => i.customerId === c.id);
    if (hasInvoices) {
      onNotify('Cannot delete a customer with existing invoices.', 'error');
      return;
    }
    setDeleteTarget(c);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomer(deleteTarget.id);
      onNotify('Customer removed.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to remove customer.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const historyData = useMemo(() => {
    if (!historyCustomer) return null;
    const custInvoices = invoices
      .filter((i) => i.customerId === historyCustomer.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const activeCustInvoices = custInvoices.filter(isInvoiceActive);
    const voidedIds = new Set(
      custInvoices.filter((i) => !isInvoiceActive(i)).map((i) => i.id)
    );
    const custPayments = payments
      .filter((p) => p.customerId === historyCustomer.id && !voidedIds.has(p.invoiceId))
      .sort((a, b) => b.date.localeCompare(a.date));
    const custJobs = jobCostings
      .filter((j) => j.customerId === historyCustomer.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const totalBilled = activeCustInvoices.reduce((s, i) => s + i.total, 0);
    const totalPaid = activeCustInvoices.reduce((s, i) => s + i.paidAmount, 0);
    const totalDue = activeCustInvoices.reduce((s, i) => s + i.balanceDue, 0);
    return { custInvoices, custPayments, custJobs, totalBilled, totalPaid, totalDue };
  }, [historyCustomer, invoices, payments, jobCostings]);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, address, or pincode..."
            className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Customer Directory (Mobile Cards + Desktop Table) */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
        {filteredCustomers.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#0B1F3A]">
              {customers.length === 0 ? 'No customers added yet' : 'No matching customers'}
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              Save customer names, phone numbers, addresses, and Tamil Nadu pincodes for quick
              invoicing.
            </p>
            {customers.length === 0 && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 min-h-[44px] px-4 py-2 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg cursor-pointer"
              >
                Add First Customer
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-[#DCE4EF]">
              {filteredCustomers.map((c) => {
                const stat = customerStats.get(c.id) || {
                  billed: 0,
                  paid: 0,
                  due: 0,
                  invoiceCount: 0,
                };
                return (
                  <div key={c.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[#0B1F3A]">{c.name}</p>
                        <p className="text-xs font-mono-num text-[#172338] mt-0.5">{c.phone}</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          {c.address} · PIN {c.pincode}
                        </p>
                      </div>
                      <span className="text-xs text-[#64748B] shrink-0">
                        {stat.invoiceCount} inv
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-[#F4F7FB] rounded-lg p-2.5 text-xs">
                      <div>
                        <span className="block text-[#64748B]">Total Billed</span>
                        <span className="font-mono-num font-semibold text-[#0B1F3A]">
                          {formatCurrency(stat.billed, sym)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[#64748B]">Balance Due</span>
                        <span
                          className={`font-mono-num font-semibold ${
                            stat.due > 0 ? 'text-[#D99722]' : 'text-[#16805D]'
                          }`}
                        >
                          {formatCurrency(stat.due, sym)}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setHistoryCustomer(c)}
                        className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#E8EFF8] text-[#0B1F3A] rounded-lg cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>History</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#DCE4EF] text-[#172338] rounded-lg cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDelete(c)}
                        className="min-h-[40px] inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-[#D64545] border border-[#D64545]/30 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#DCE4EF] bg-[#F4F7FB] text-xs text-[#64748B]">
                    <th className="text-left font-medium px-4 py-3">Customer</th>
                    <th className="text-left font-medium px-4 py-3">Phone</th>
                    <th className="text-left font-medium px-4 py-3">Address &amp; Pincode</th>
                    <th className="text-right font-medium px-4 py-3">Total Billed</th>
                    <th className="text-right font-medium px-4 py-3">Balance Due</th>
                    <th className="text-right font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE4EF]/60">
                  {filteredCustomers.map((c) => {
                    const stat = customerStats.get(c.id) || {
                      billed: 0,
                      paid: 0,
                      due: 0,
                      invoiceCount: 0,
                    };
                    return (
                      <tr key={c.id} className="hover:bg-[#E8EFF8]/50">
                        <td className="px-4 py-3 font-medium text-[#172338]">
                          {c.name}
                          <span className="block text-xs font-normal text-[#64748B]">
                            {stat.invoiceCount} invoice{stat.invoiceCount === 1 ? '' : 's'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono-num text-[#172338] whitespace-nowrap">
                          {c.phone}
                        </td>
                        <td className="px-4 py-3 text-[#64748B] max-w-xs">
                          <span className="line-clamp-1 text-[#172338]">{c.address}</span>
                          <span className="text-xs font-mono-num text-[#64748B]">
                            PIN: {c.pincode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#172338] whitespace-nowrap">
                          {formatCurrency(stat.billed, sym)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono-num font-medium whitespace-nowrap ${
                            stat.due > 0 ? 'text-[#D99722]' : 'text-[#16805D]'
                          }`}
                        >
                          {formatCurrency(stat.due, sym)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setHistoryCustomer(c)}
                              title="View customer history"
                              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#0B1F3A] hover:bg-[#E8EFF8] rounded-md cursor-pointer"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              title="Edit customer"
                              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#0B1F3A] hover:bg-[#E8EFF8] rounded-md cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDelete(c)}
                              title="Delete customer"
                              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#D64545] hover:bg-[#D64545]/10 rounded-md cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071629]/60">
          <div className="bg-white border border-[#DCE4EF] rounded-xl w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#DCE4EF]">
              <h2 className="text-lg font-semibold text-[#0B1F3A]">
                {editing ? 'Edit Customer' : 'Add Customer'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-[#64748B] hover:text-[#0B1F3A] rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.maxName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Karthikeyan S"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    minLength={5}
                    maxLength={BLUEPRINT_LIMITS.maxPhone}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 98400 12345"
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Pincode (6 digits) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="e.g. 600042"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Site / Billing Address *
                </label>
                <textarea
                  required
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.maxAddress}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Door no, street, area, city (Tamil Nadu)"
                  className="w-full px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.maxNotes}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Preferred mesh color, measurement notes..."
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
              </div>

              <div className="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#172338] bg-[#E8EFF8] hover:bg-[#DCE4EF] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-[#0B1F3A] hover:bg-[#163A63] disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer History Modal */}
      {historyCustomer && historyData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071629]/60">
          <div className="bg-white border border-[#DCE4EF] rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-[#DCE4EF] flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0B1F3A]">
                  {historyCustomer.name}
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {historyCustomer.phone} · {historyCustomer.address} · PIN{' '}
                  {historyCustomer.pincode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                className="p-2 text-[#64748B] hover:text-[#0B1F3A] rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border border-[#DCE4EF] rounded-lg p-3.5 bg-[#F4F7FB]">
                  <p className="text-xs text-[#64748B]">Total Invoiced</p>
                  <p className="mt-1 text-lg font-semibold font-mono-num text-[#0B1F3A]">
                    {formatCurrency(historyData.totalBilled, sym)}
                  </p>
                </div>
                <div className="border border-[#DCE4EF] rounded-lg p-3.5 bg-[#F4F7FB]">
                  <p className="text-xs text-[#64748B]">Total Collected</p>
                  <p className="mt-1 text-lg font-semibold font-mono-num text-[#16805D]">
                    {formatCurrency(historyData.totalPaid, sym)}
                  </p>
                </div>
                <div className="border border-[#DCE4EF] rounded-lg p-3.5 bg-[#F4F7FB]">
                  <p className="text-xs text-[#64748B]">Balance Due</p>
                  <p className="mt-1 text-lg font-semibold font-mono-num text-[#D99722]">
                    {formatCurrency(historyData.totalDue, sym)}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#0B1F3A] mb-2">
                  Invoices ({historyData.custInvoices.length})
                </h3>
                {historyData.custInvoices.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No invoices for this customer.</p>
                ) : (
                  <div className="border border-[#DCE4EF] rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#F4F7FB] border-b border-[#DCE4EF] text-[#64748B]">
                          <th className="text-left px-3 py-2 font-medium">Invoice #</th>
                          <th className="text-left px-3 py-2 font-medium">Date</th>
                          <th className="text-right px-3 py-2 font-medium">Total</th>
                          <th className="text-right px-3 py-2 font-medium">Paid</th>
                          <th className="text-right px-3 py-2 font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DCE4EF]/60">
                        {historyData.custInvoices.map((inv) => (
                          <tr key={inv.id} className={!isInvoiceActive(inv) ? 'opacity-60' : ''}>
                            <td className="px-3 py-2 font-mono-num text-[#0B1F3A] font-medium">
                              {inv.invoiceNumber}
                              {!isInvoiceActive(inv) && (
                                <span className="ml-1.5 text-[10px] font-semibold text-[#D64545] uppercase">
                                  Voided
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[#64748B]">
                              {formatDisplayDate(inv.date)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono-num text-[#172338]">
                              {formatCurrency(inv.total, sym)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono-num text-[#16805D]">
                              {formatCurrency(inv.paidAmount, sym)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono-num text-[#D99722]">
                              {formatCurrency(inv.balanceDue, sym)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#0B1F3A] mb-2">
                  Payment Receipts ({historyData.custPayments.length})
                </h3>
                {historyData.custPayments.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No payments recorded yet.</p>
                ) : (
                  <div className="border border-[#DCE4EF] rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#F4F7FB] border-b border-[#DCE4EF] text-[#64748B]">
                          <th className="text-left px-3 py-2 font-medium">Date</th>
                          <th className="text-left px-3 py-2 font-medium">Invoice #</th>
                          <th className="text-left px-3 py-2 font-medium">Method</th>
                          <th className="text-right px-3 py-2 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DCE4EF]/60">
                        {historyData.custPayments.map((p) => (
                          <tr key={p.id}>
                            <td className="px-3 py-2 text-[#64748B]">
                              {formatDisplayDate(p.date)}
                            </td>
                            <td className="px-3 py-2 font-mono-num text-[#0B1F3A]">
                              {p.invoiceNumber}
                            </td>
                            <td className="px-3 py-2 text-[#172338]">
                              {p.method} {p.isAdvance ? '· Advance' : ''}
                            </td>
                            <td className="px-3 py-2 text-right font-mono-num text-[#16805D] font-medium">
                              {formatCurrency(p.amount, sym)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {historyData.custJobs.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-[#0B1F3A] mb-2">
                    Job Costings ({historyData.custJobs.length})
                  </h3>
                  <div className="border border-[#DCE4EF] rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#F4F7FB] border-b border-[#DCE4EF] text-[#64748B]">
                          <th className="text-left px-3 py-2 font-medium">Date</th>
                          <th className="text-left px-3 py-2 font-medium">Job</th>
                          <th className="text-right px-3 py-2 font-medium">Job Cost</th>
                          <th className="text-right px-3 py-2 font-medium">Est. Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DCE4EF]/60">
                        {historyData.custJobs.map((j) => (
                          <tr key={j.id}>
                            <td className="px-3 py-2 text-[#64748B]">
                              {formatDisplayDate(j.date)}
                            </td>
                            <td className="px-3 py-2 text-[#172338]">{j.jobTitle}</td>
                            <td className="px-3 py-2 text-right font-mono-num">
                              {formatCurrency(j.totalJobCost, sym)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono-num text-[#16805D]">
                              {formatCurrency(j.estimatedProfit, sym)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Customer Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Customer?"
        message={
          deleteTarget
            ? `Are you sure you want to remove "${deleteTarget.name}" (${deleteTarget.phone}) from your customer directory?`
            : ''
        }
        confirmLabel="Delete Customer"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
