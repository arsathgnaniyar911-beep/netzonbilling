import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import {
  PAYMENT_METHODS,
  type BusinessSettings,
  type Invoice,
  type Payment,
  type PaymentMethod,
} from '../types';
import {
  BLUEPRINT_LIMITS,
  formatCurrency,
  formatDisplayDate,
  isInvoiceActive,
  round2,
  todayISO,
} from '../utils/format';
import {
  deletePaymentAndRecalculate,
  recordInvoicePayment,
} from '../services/firestoreService';
import { ConfirmDialog } from './ConfirmDialog';

interface PaymentsProps {
  uid: string;
  invoices: Invoice[];
  payments: Payment[];
  settings: BusinessSettings;
  onNotify: (message: string, type?: 'success' | 'error') => void;
  openRecordSignal?: number;
}

export function Payments({
  uid,
  invoices,
  payments,
  settings,
  onNotify,
  openRecordSignal = 0,
}: PaymentsProps) {
  const [viewMode, setViewMode] = useState<'balances' | 'receipts'>('balances');
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const [modalInvoice, setModalInvoice] = useState<Invoice | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [isAdvance, setIsAdvance] = useState(false);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sym = settings.currencySymbol || '₹';

  const activeInvoices = useMemo(
    () => invoices.filter(isInvoiceActive),
    [invoices]
  );

  const voidedInvoiceIds = useMemo(
    () => new Set(invoices.filter((i) => !isInvoiceActive(i)).map((i) => i.id)),
    [invoices]
  );

  const activePayments = useMemo(
    () => payments.filter((p) => !voidedInvoiceIds.has(p.invoiceId)),
    [payments, voidedInvoiceIds]
  );

  const outstandingInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeInvoices
      .filter((inv) => inv.balanceDue > 0.009)
      .filter((inv) => {
        if (!q) return true;
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q) ||
          inv.customerPhone.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.balanceDue - a.balanceDue);
  }, [activeInvoices, search]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...activePayments]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((p) => {
        if (monthFilter && !p.date.startsWith(monthFilter)) return false;
        if (
          q &&
          !p.invoiceNumber.toLowerCase().includes(q) &&
          !p.customerName.toLowerCase().includes(q) &&
          !(p.reference || '').toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
  }, [activePayments, search, monthFilter]);

  const totalOutstanding = useMemo(
    () => round2(activeInvoices.reduce((s, inv) => s + inv.balanceDue, 0)),
    [activeInvoices]
  );

  const totalCollectedAllTime = useMemo(
    () => round2(activePayments.reduce((s, p) => s + p.amount, 0)),
    [activePayments]
  );

  const totalCollectedShown = useMemo(
    () => round2(filteredPayments.reduce((s, p) => s + p.amount, 0)),
    [filteredPayments]
  );

  const openCollectForInvoice = (inv: Invoice) => {
    setModalInvoice(inv);
    setSelectedInvoiceId(inv.id);
    setDate(todayISO());
    setAmount(String(inv.balanceDue));
    setMethod('UPI');
    setIsAdvance(false);
    setReference('');
  };

  useEffect(() => {
    if (openRecordSignal > 0) {
      const firstOpen = activeInvoices
        .filter((inv) => inv.balanceDue > 0.009)
        .sort((a, b) => b.balanceDue - a.balanceDue)[0];
      if (firstOpen) {
        openCollectForInvoice(firstOpen);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRecordSignal]);

  const openGeneralCollect = () => {
    const first = outstandingInvoices[0];
    if (!first) {
      onNotify('All invoices are already paid in full.', 'error');
      return;
    }
    openCollectForInvoice(first);
  };

  const handleInvoiceSelectChange = (id: string) => {
    setSelectedInvoiceId(id);
    const inv = invoices.find((i) => i.id === id) || null;
    setModalInvoice(inv);
    if (inv) {
      setAmount(String(inv.balanceDue));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const targetInv = invoices.find((i) => i.id === selectedInvoiceId);
    if (!targetInv) {
      onNotify('Please select a valid invoice.', 'error');
      return;
    }
    const payAmt = round2(Number(amount));
    if (!Number.isFinite(payAmt) || payAmt <= 0) {
      onNotify('Payment amount must be greater than zero.', 'error');
      return;
    }
    if (payAmt > targetInv.balanceDue + 0.01) {
      onNotify(
        `Amount exceeds remaining balance due (${formatCurrency(targetInv.balanceDue, sym)}).`,
        'error'
      );
      return;
    }

    const existingForInvoice = payments.filter((p) => p.invoiceId === targetInv.id);
    setSaving(true);
    try {
      await recordInvoicePayment(uid, targetInv, existingForInvoice, {
        date,
        amount: payAmt,
        method,
        isAdvance,
        reference,
      });
      onNotify('Payment recorded and invoice balance updated.', 'success');
      setModalInvoice(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to record payment.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!deleteTarget) return;
    const parentInvoice = invoices.find((i) => i.id === deleteTarget.invoiceId);
    const allForInvoice = payments.filter((x) => x.invoiceId === deleteTarget.invoiceId);
    setDeleting(true);
    try {
      await deletePaymentAndRecalculate(deleteTarget, parentInvoice, allForInvoice);
      onNotify('Payment removed and invoice balance recalculated.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete payment.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Separate Cash Collected vs Outstanding Balances Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">
            Total Cash Collected
          </p>
          <p className="mt-2 text-2xl font-semibold text-[#16805D] font-mono-num">
            {formatCurrency(totalCollectedAllTime, sym)}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {activePayments.length} receipt{activePayments.length === 1 ? '' : 's'} logged
          </p>
        </div>

        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">
            Pending Customer Balances
          </p>
          <p className="mt-2 text-2xl font-semibold text-[#D99722] font-mono-num">
            {formatCurrency(totalOutstanding, sym)}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            Across {activeInvoices.filter((i) => i.balanceDue > 0.009).length} open invoice(s)
          </p>
        </div>

        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">
            Receipts in View
          </p>
          <p className="mt-2 text-2xl font-semibold text-[#0B1F3A] font-mono-num">
            {formatCurrency(totalCollectedShown, sym)}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {filteredPayments.length} receipt{filteredPayments.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Mode Switch + Search + CTA */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 flex-1">
          <div className="flex items-center gap-1 p-1 bg-[#E8EFF8] rounded-lg self-start">
            <button
              type="button"
              onClick={() => setViewMode('balances')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'balances'
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-[#172338] hover:bg-white/70'
              }`}
            >
              Pending Balances ({outstandingInvoices.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('receipts')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                viewMode === 'receipts'
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-[#172338] hover:bg-white/70'
              }`}
            >
              Receipts ({activePayments.length})
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice # or customer..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
            />
          </div>

          {viewMode === 'receipts' && (
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="min-h-[42px] px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg"
            />
          )}
        </div>

        <button
          type="button"
          onClick={openGeneralCollect}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Record Payment</span>
        </button>
      </div>

      {/* Outstanding Balances */}
      {viewMode === 'balances' ? (
        <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          {outstandingInvoices.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-[#0B1F3A]">
                No pending customer balances
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                All issued invoices are paid in full.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-[#DCE4EF]">
                {outstandingInvoices.map((inv) => (
                  <div key={inv.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono-num text-sm font-semibold text-[#0B1F3A]">
                          {inv.invoiceNumber}
                        </p>
                        <p className="text-sm font-medium text-[#172338]">{inv.customerName}</p>
                        <p className="text-xs text-[#64748B]">
                          {inv.customerPhone} · {formatDisplayDate(inv.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="block text-[11px] text-[#64748B]">Due</span>
                        <span className="font-mono-num text-sm font-bold text-[#D99722]">
                          {formatCurrency(inv.balanceDue, sym)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCollectForInvoice(inv)}
                      className="w-full min-h-[42px] px-4 py-2 text-xs font-medium text-white bg-[#0B1F3A] hover:bg-[#163A63] rounded-lg cursor-pointer"
                    >
                      Collect Payment
                    </button>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#DCE4EF] bg-[#F4F7FB] text-xs text-[#64748B]">
                      <th className="text-left font-medium px-4 py-3">Invoice #</th>
                      <th className="text-left font-medium px-4 py-3">Date</th>
                      <th className="text-left font-medium px-4 py-3">Customer</th>
                      <th className="text-right font-medium px-4 py-3">Invoiced</th>
                      <th className="text-right font-medium px-4 py-3">Collected</th>
                      <th className="text-right font-medium px-4 py-3">Balance Due</th>
                      <th className="text-right font-medium px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE4EF]/60">
                    {outstandingInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[#E8EFF8]/50">
                        <td className="px-4 py-3 font-mono-num font-medium text-[#0B1F3A] whitespace-nowrap">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3 font-mono-num text-xs text-[#64748B] whitespace-nowrap">
                          {formatDisplayDate(inv.date)}
                        </td>
                        <td className="px-4 py-3 text-[#172338]">
                          {inv.customerName}
                          <span className="block text-xs text-[#64748B]">
                            {inv.customerPhone}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#172338] whitespace-nowrap">
                          {formatCurrency(inv.total, sym)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#16805D] whitespace-nowrap">
                          {formatCurrency(inv.paidAmount, sym)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-semibold text-[#D99722] whitespace-nowrap">
                          {formatCurrency(inv.balanceDue, sym)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openCollectForInvoice(inv)}
                            className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-white bg-[#0B1F3A] hover:bg-[#163A63] rounded-md cursor-pointer"
                          >
                            Collect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Payment Receipts Ledger */
        <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          {filteredPayments.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-[#0B1F3A]">
                No payment receipts recorded
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                Payments collected against invoices will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-[#DCE4EF]">
                {filteredPayments.map((p) => (
                  <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono-num text-sm font-semibold text-[#0B1F3A]">
                        {p.invoiceNumber}
                      </p>
                      <p className="text-sm text-[#172338]">{p.customerName}</p>
                      <p className="text-xs text-[#64748B]">
                        {formatDisplayDate(p.date)} · {p.method}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-sm font-semibold text-[#16805D]">
                        {formatCurrency(p.amount, sym)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        title="Delete receipt"
                        className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-2 text-[#D64545] bg-[#D64545]/10 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#DCE4EF] bg-[#F4F7FB] text-xs text-[#64748B]">
                      <th className="text-left font-medium px-4 py-3">Date</th>
                      <th className="text-left font-medium px-4 py-3">Invoice #</th>
                      <th className="text-left font-medium px-4 py-3">Customer</th>
                      <th className="text-left font-medium px-4 py-3">Method &amp; Type</th>
                      <th className="text-left font-medium px-4 py-3">Reference</th>
                      <th className="text-right font-medium px-4 py-3">Amount</th>
                      <th className="text-right font-medium px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE4EF]/60">
                    {filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-[#E8EFF8]/50">
                        <td className="px-4 py-3 font-mono-num text-xs text-[#64748B] whitespace-nowrap">
                          {formatDisplayDate(p.date)}
                        </td>
                        <td className="px-4 py-3 font-mono-num text-[#0B1F3A] font-medium whitespace-nowrap">
                          {p.invoiceNumber}
                        </td>
                        <td className="px-4 py-3 text-[#172338]">{p.customerName}</td>
                        <td className="px-4 py-3 text-xs text-[#172338] whitespace-nowrap">
                          {p.method} · {p.isAdvance ? 'Advance' : 'Balance Payment'}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#64748B]">
                          {p.reference || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-semibold text-[#16805D] whitespace-nowrap">
                          {formatCurrency(p.amount, sym)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            title="Delete receipt &amp; recalculate balance"
                            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#D64545] hover:bg-[#D64545]/10 rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Record Payment Modal */}
      {modalInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071629]/60">
          <div className="bg-white border border-[#DCE4EF] rounded-xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#DCE4EF]">
              <h2 className="text-lg font-semibold text-[#0B1F3A]">Record Payment</h2>
              <button
                type="button"
                onClick={() => setModalInvoice(null)}
                className="p-2 text-[#64748B] hover:text-[#0B1F3A] rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Invoice *
                </label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => handleInvoiceSelectChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-white"
                >
                  {outstandingInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {inv.customerName} (Due:{' '}
                      {formatCurrency(inv.balanceDue, sym)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-[#F4F7FB] border border-[#DCE4EF] rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between text-[#64748B]">
                  <span>Invoice Total</span>
                  <span className="font-mono-num text-[#172338]">
                    {formatCurrency(modalInvoice.total, sym)}
                  </span>
                </div>
                <div className="flex justify-between text-[#64748B]">
                  <span>Already Paid</span>
                  <span className="font-mono-num text-[#16805D]">
                    {formatCurrency(modalInvoice.paidAmount, sym)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-[#D99722]">
                  <span>Remaining Balance Due</span>
                  <span className="font-mono-num">
                    {formatCurrency(modalInvoice.balanceDue, sym)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Amount ({sym}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    max={modalInvoice.balanceDue}
                    step="any"
                    onKeyDown={(ev) => {
                      if (['-', '+', 'e', 'E'].includes(ev.key)) ev.preventDefault();
                    }}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-white"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-[#172338] pb-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAdvance}
                    onChange={(e) => setIsAdvance(e.target.checked)}
                    className="w-4 h-4 rounded border-[#DCE4EF] text-[#0B1F3A] focus:ring-[#163A63]"
                  />
                  <span>Mark as Advance</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Reference / Notes (Optional)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.maxReference}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="GPay / PhonePe ref or receipt #"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg"
                />
              </div>

              <div className="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalInvoice(null)}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#172338] bg-[#E8EFF8] hover:bg-[#DCE4EF] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-[#0B1F3A] hover:bg-[#163A63] disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Payment Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Payment Receipt?"
        message={
          deleteTarget
            ? `Are you sure you want to delete this ${formatCurrency(
                deleteTarget.amount,
                sym
              )} payment receipt for ${deleteTarget.invoiceNumber}? The invoice balance due will be recalculated.`
            : ''
        }
        confirmLabel="Delete Receipt"
        busy={deleting}
        onConfirm={handleConfirmDeletePayment}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
