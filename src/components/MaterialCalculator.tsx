import { useMemo, useState, type FormEvent } from 'react';
import { Search, Plus, Pencil, Trash2, X } from 'lucide-react';
import {
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS,
  type BusinessSettings,
  type Customer,
  type Invoice,
  type JobCosting,
  type MaterialCategory,
  type MaterialLine,
} from '../types';
import {
  BLUEPRINT_LIMITS,
  calculateJobCostingTotals,
  formatCurrency,
  formatDisplayDate,
  isInvoiceActive,
  round2,
  todayISO,
} from '../utils/format';
import { deleteJobCosting, saveJobCosting } from '../services/firestoreService';
import { ConfirmDialog } from './ConfirmDialog';

interface MaterialCalculatorProps {
  uid: string;
  jobCostings: JobCosting[];
  customers: Customer[];
  invoices: Invoice[];
  settings: BusinessSettings;
  onNotify: (message: string, type?: 'success' | 'error') => void;
}

const DEFAULT_MAT: MaterialLine = {
  category: 'Mosquito Mesh',
  name: '',
  quantity: 1,
  unit: 'sq.ft',
  unitCost: 0,
  totalCost: 0,
};

export function MaterialCalculator({
  uid,
  jobCostings,
  customers,
  invoices,
  settings,
  onNotify,
}: MaterialCalculatorProps) {
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JobCosting | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<JobCosting | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [jobTitle, setJobTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [estimatedSellingPrice, setEstimatedSellingPrice] = useState('0');
  const [materials, setMaterials] = useState<MaterialLine[]>([{ ...DEFAULT_MAT }]);
  const [labourCost, setLabourCost] = useState('0');
  const [transportCost, setTransportCost] = useState('0');
  const [installationCost, setInstallationCost] = useState('0');
  const [otherJobCost, setOtherJobCost] = useState('0');
  const [notes, setNotes] = useState('');

  const sym = settings.currencySymbol || '₹';

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...jobCostings]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((j) => {
        if (monthFilter && !j.date.startsWith(monthFilter)) return false;
        if (
          q &&
          !j.jobTitle.toLowerCase().includes(q) &&
          !j.customerName.toLowerCase().includes(q) &&
          !j.invoiceNumber.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
  }, [jobCostings, search, monthFilter]);

  const liveCalc = useMemo(
    () =>
      calculateJobCostingTotals(
        materials,
        Number(labourCost) || 0,
        Number(transportCost) || 0,
        Number(installationCost) || 0,
        Number(otherJobCost) || 0,
        Number(estimatedSellingPrice) || 0
      ),
    [
      materials,
      labourCost,
      transportCost,
      installationCost,
      otherJobCost,
      estimatedSellingPrice,
    ]
  );

  const openCreate = () => {
    setEditing(null);
    setJobTitle('');
    setDate(todayISO());
    setCustomerId('');
    setInvoiceId('');
    setEstimatedSellingPrice('0');
    setMaterials([
      {
        category: 'Mosquito Mesh',
        name: 'Fiberglass / SS Mesh',
        quantity: 100,
        unit: 'sq.ft',
        unitCost: 0,
        totalCost: 0,
      },
      {
        category: 'Aluminium Frame',
        name: 'Powder Coated Aluminium Profile',
        quantity: 40,
        unit: 'r.ft',
        unitCost: 0,
        totalCost: 0,
      },
    ]);
    setLabourCost('0');
    setTransportCost('0');
    setInstallationCost('0');
    setOtherJobCost('0');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (j: JobCosting) => {
    setEditing(j);
    setJobTitle(j.jobTitle);
    setDate(j.date);
    setCustomerId(j.customerId || '');
    setInvoiceId(j.invoiceId || '');
    setEstimatedSellingPrice(String(j.estimatedSellingPrice));
    setMaterials(j.materials.map((m) => ({ ...m })));
    setLabourCost(String(j.labourCost));
    setTransportCost(String(j.transportCost));
    setInstallationCost(String(j.installationCost));
    setOtherJobCost(String(j.otherJobCost));
    setNotes(j.notes || '');
    setModalOpen(true);
  };

  const handleInvoiceLink = (selectedInvoiceId: string) => {
    setInvoiceId(selectedInvoiceId);
    const inv = invoices.find((i) => i.id === selectedInvoiceId);
    if (inv) {
      setCustomerId(inv.customerId);
      setEstimatedSellingPrice(String(inv.total));
      if (!jobTitle.trim()) {
        setJobTitle(`${inv.customerName} — ${inv.invoiceNumber}`);
      }
    }
  };

  const updateMaterial = (
    idx: number,
    field: keyof MaterialLine,
    value: string
  ) => {
    setMaterials((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        const next = { ...m };
        if (field === 'category') next.category = value as MaterialCategory;
        if (field === 'name') next.name = value;
        if (field === 'unit') next.unit = value;
        if (field === 'quantity') next.quantity = Math.max(0, Number(value) || 0);
        if (field === 'unitCost') next.unitCost = Math.max(0, Number(value) || 0);
        next.totalCost = round2(next.quantity * next.unitCost);
        return next;
      })
    );
  };

  const addMaterialRow = () => {
    if (materials.length >= BLUEPRINT_LIMITS.maxItems) {
      onNotify(`Maximum ${BLUEPRINT_LIMITS.maxItems} material lines per job.`, 'error');
      return;
    }
    setMaterials((prev) => [...prev, { ...DEFAULT_MAT }]);
  };

  const removeMaterialRow = (idx: number) => {
    if (materials.length <= 1) return;
    setMaterials((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim()) {
      onNotify('Please enter a job title.', 'error');
      return;
    }
    if (materials.some((m) => !m.name.trim() || m.quantity <= 0)) {
      onNotify('Every material line needs a name and positive measurement/quantity.', 'error');
      return;
    }

    const cust = customers.find((c) => c.id === customerId);
    const inv = invoices.find((i) => i.id === invoiceId);

    setSaving(true);
    try {
      await saveJobCosting(uid, {
        id: editing?.id,
        jobTitle,
        date,
        customerId: cust?.id || '',
        customerName: cust?.name || inv?.customerName || '',
        invoiceId: inv?.id || '',
        invoiceNumber: inv?.invoiceNumber || '',
        estimatedSellingPrice: Math.max(0, Number(estimatedSellingPrice) || 0),
        materials,
        labourCost: Math.max(0, Number(labourCost) || 0),
        transportCost: Math.max(0, Number(transportCost) || 0),
        installationCost: Math.max(0, Number(installationCost) || 0),
        otherJobCost: Math.max(0, Number(otherJobCost) || 0),
        notes,
      });
      onNotify(editing ? 'Job costing updated.' : 'Job costing saved.', 'success');
      setModalOpen(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save job costing.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteJobCosting(deleteTarget.id);
      onNotify('Job costing deleted.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search job title, customer, or invoice #..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
            />
          </div>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="min-h-[42px] px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
          />
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Job Costing</span>
        </button>
      </div>

      {/* Job Costings (Mobile Cards + Desktop Table) */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
        {filteredJobs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#0B1F3A]">
              {jobCostings.length === 0 ? 'No job costings recorded yet' : 'No matching jobs'}
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              Calculate mosquito mesh, aluminium frames, accessories, labour, transport, and
              installation costs per job to see true profit margins.
            </p>
            {jobCostings.length === 0 && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 min-h-[44px] px-4 py-2 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg cursor-pointer"
              >
                Calculate First Job
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-[#DCE4EF]">
              {filteredJobs.map((j) => (
                <div key={j.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">{j.jobTitle}</p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {formatDisplayDate(j.date)}
                        {j.customerName ? ` · ${j.customerName}` : ''}
                      </p>
                    </div>
                    <span
                      className={`font-mono-num text-sm font-bold whitespace-nowrap ${
                        j.estimatedProfit >= 0 ? 'text-[#16805D]' : 'text-[#D64545]'
                      }`}
                    >
                      {formatCurrency(j.estimatedProfit, sym)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-[#F4F7FB] rounded-lg p-2.5 text-xs">
                    <div>
                      <span className="block text-[#64748B]">Quote</span>
                      <span className="font-mono-num font-semibold text-[#172338]">
                        {formatCurrency(j.estimatedSellingPrice, sym)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[#64748B]">Materials</span>
                      <span className="font-mono-num font-medium text-[#172338]">
                        {formatCurrency(j.totalMaterialCost, sym)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[#64748B]">Total Cost</span>
                      <span className="font-mono-num font-semibold text-[#0B1F3A]">
                        {formatCurrency(j.totalJobCost, sym)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(j)}
                      className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#E8EFF8] text-[#0B1F3A] rounded-lg cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(j)}
                      className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#D64545] border border-[#D64545]/30 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
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
                    <th className="text-left font-medium px-4 py-3">Job Title</th>
                    <th className="text-right font-medium px-4 py-3">Selling Price</th>
                    <th className="text-right font-medium px-4 py-3">Materials</th>
                    <th className="text-right font-medium px-4 py-3">Labour &amp; Site</th>
                    <th className="text-right font-medium px-4 py-3">Total Cost</th>
                    <th className="text-right font-medium px-4 py-3">Est. Profit</th>
                    <th className="text-right font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE4EF]/60">
                  {filteredJobs.map((j) => {
                    const extras =
                      j.labourCost + j.transportCost + j.installationCost + j.otherJobCost;
                    return (
                      <tr key={j.id} className="hover:bg-[#E8EFF8]/50">
                        <td className="px-4 py-3 font-mono-num text-xs text-[#64748B] whitespace-nowrap">
                          {formatDisplayDate(j.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-[#0B1F3A]">{j.jobTitle}</span>
                          <span className="block text-xs text-[#64748B]">
                            {[j.customerName, j.invoiceNumber ? `Inv: ${j.invoiceNumber}` : '']
                              .filter(Boolean)
                              .join(' · ') || `${j.materials.length} material line(s)`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#172338] whitespace-nowrap">
                          {formatCurrency(j.estimatedSellingPrice, sym)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#172338] whitespace-nowrap">
                          {formatCurrency(j.totalMaterialCost, sym)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num text-[#172338] whitespace-nowrap">
                          {formatCurrency(extras, sym)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-num font-medium text-[#0B1F3A] whitespace-nowrap">
                          {formatCurrency(j.totalJobCost, sym)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono-num font-semibold whitespace-nowrap ${
                            j.estimatedProfit >= 0 ? 'text-[#16805D]' : 'text-[#D64545]'
                          }`}
                        >
                          {formatCurrency(j.estimatedProfit, sym)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(j)}
                              title="Edit job costing"
                              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#0B1F3A] hover:bg-[#E8EFF8] rounded-md cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(j)}
                              title="Delete job costing"
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

      {/* Calculator Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071629]/60">
          <div className="bg-white border border-[#DCE4EF] rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-[#DCE4EF] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0B1F3A]">
                {editing ? 'Edit Job Cost Calculation' : 'Material Cost Calculator'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 text-[#64748B] hover:text-[#0B1F3A] rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Job Title / Site Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.maxTitle}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Velachery Villa — 12 Windows & Security Door"
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Job Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Selling / Quote Price ({sym})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={estimatedSellingPrice}
                    onChange={(e) => setEstimatedSellingPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Link to Invoice (Optional — auto-fills price)
                  </label>
                  <select
                    value={invoiceId}
                    onChange={(e) => handleInvoiceLink(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-white"
                  >
                    <option value="">-- Not linked to invoice --</option>
                    {invoices.filter(isInvoiceActive).map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — {inv.customerName} ({formatCurrency(inv.total, sym)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Customer (Optional)
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-white"
                  >
                    <option value="">-- Optional --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Materials List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#172338]">
                    Materials Used (Units × Cost)
                  </span>
                  <button
                    type="button"
                    onClick={addMaterialRow}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#0B1F3A] bg-[#E8EFF8] hover:bg-[#DCE4EF] rounded-lg cursor-pointer"
                  >
                    + Add Material Line
                  </button>
                </div>

                <div className="border border-[#DCE4EF] rounded-lg divide-y divide-[#DCE4EF]">
                  {materials.map((mat, idx) => (
                    <div
                      key={idx}
                      className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                    >
                      <div className="sm:col-span-3">
                        <select
                          value={mat.category}
                          onChange={(e) =>
                            updateMaterial(idx, 'category', e.target.value)
                          }
                          className="w-full min-h-[38px] px-2.5 py-1.5 text-xs text-[#172338] border border-[#DCE4EF] rounded-md bg-white"
                        >
                          {MATERIAL_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          required
                          maxLength={120}
                          value={mat.name}
                          onChange={(e) => updateMaterial(idx, 'name', e.target.value)}
                          placeholder="Material name"
                          className="w-full min-h-[38px] px-2.5 py-1.5 text-xs text-[#172338] border border-[#DCE4EF] rounded-md"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="any"
                          value={mat.quantity}
                          onChange={(e) =>
                            updateMaterial(idx, 'quantity', e.target.value)
                          }
                          placeholder="Qty"
                          className="w-full min-h-[38px] px-2 py-1.5 text-xs font-mono-num text-right text-[#172338] border border-[#DCE4EF] rounded-md"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <select
                          value={mat.unit}
                          onChange={(e) => updateMaterial(idx, 'unit', e.target.value)}
                          className="w-full min-h-[38px] px-1.5 py-1.5 text-xs text-[#172338] border border-[#DCE4EF] rounded-md bg-white"
                        >
                          {MATERIAL_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          required
                          min="0"
                          step="any"
                          value={mat.unitCost}
                          onChange={(e) =>
                            updateMaterial(idx, 'unitCost', e.target.value)
                          }
                          placeholder="Unit Cost"
                          className="w-full min-h-[38px] px-2 py-1.5 text-xs font-mono-num text-right text-[#172338] border border-[#DCE4EF] rounded-md"
                        />
                      </div>
                      <div className="sm:col-span-2 flex items-center justify-between gap-1">
                        <span className="text-xs font-mono-num font-medium text-[#0B1F3A]">
                          {formatCurrency(mat.totalCost, sym)}
                        </span>
                        {materials.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMaterialRow(idx)}
                            className="p-2 text-[#64748B] hover:text-[#D64545] cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Labour, Transport, Installation */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Labour Cost ({sym})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={labourCost}
                    onChange={(e) => setLabourCost(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Transport Cost ({sym})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={transportCost}
                    onChange={(e) => setTransportCost(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Installation Cost ({sym})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={installationCost}
                    onChange={(e) => setInstallationCost(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Other Job Cost ({sym})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={otherJobCost}
                    onChange={(e) => setOtherJobCost(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Job Notes (Optional)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.maxNotes}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Material wastage, frame colour, fitting crew..."
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg"
                />
              </div>

              {/* Live Profitability Summary */}
              <div className="bg-[#0B1F3A] text-white rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-[#B8CAE0]">Total Materials</p>
                  <p className="mt-1 text-base font-semibold font-mono-num">
                    {formatCurrency(liveCalc.totalMaterialCost, sym)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#B8CAE0]">Labour &amp; Site Extras</p>
                  <p className="mt-1 text-base font-semibold font-mono-num">
                    {formatCurrency(
                      liveCalc.labourCost +
                        liveCalc.transportCost +
                        liveCalc.installationCost +
                        liveCalc.otherJobCost,
                      sym
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#B8CAE0]">Total Job Cost</p>
                  <p className="mt-1 text-base font-semibold font-mono-num">
                    {formatCurrency(liveCalc.totalJobCost, sym)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#B8CAE0]">Estimated Profit</p>
                  <p
                    className={`mt-1 text-base font-semibold font-mono-num ${
                      liveCalc.estimatedProfit >= 0
                        ? 'text-white'
                        : 'text-[#FCA5A5]'
                    }`}
                  >
                    {formatCurrency(liveCalc.estimatedProfit, sym)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
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
                  {saving ? 'Saving...' : editing ? 'Update Job Cost' : 'Save Job Cost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Job Costing Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Job Costing?"
        message={
          deleteTarget
            ? `Are you sure you want to delete the job cost calculation "${deleteTarget.jobTitle}" (${formatCurrency(
                deleteTarget.totalJobCost,
                sym
              )})?`
            : ''
        }
        confirmLabel="Delete Job Costing"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
