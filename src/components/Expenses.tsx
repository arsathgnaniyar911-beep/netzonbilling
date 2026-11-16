import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Search, Plus, Pencil, Trash2, X } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_MODES,
  type BusinessSettings,
  type Expense,
  type ExpenseCategory,
  type ExpensePaymentMode,
} from '../types';
import {
  BLUEPRINT_LIMITS,
  currentMonthISO,
  formatCurrency,
  formatDisplayDate,
  round2,
  todayISO,
} from '../utils/format';
import { deleteExpense, saveExpense } from '../services/firestoreService';
import { ConfirmDialog } from './ConfirmDialog';

interface ExpensesProps {
  uid: string;
  expenses: Expense[];
  settings: BusinessSettings;
  onNotify: (message: string, type?: 'success' | 'error') => void;
  openAddSignal?: number;
}

export function Expenses({
  uid,
  expenses,
  settings,
  onNotify,
  openAddSignal = 0,
}: ExpensesProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [monthFilter, setMonthFilter] = useState(currentMonthISO());

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<ExpenseCategory>('Rent');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<ExpensePaymentMode>('Cash');

  const sym = settings.currencySymbol || '₹';

  const openCreate = () => {
    setEditing(null);
    setDate(todayISO());
    setCategory('Rent');
    setDescription('');
    setAmount('');
    setPaymentMode('Cash');
    setModalOpen(true);
  };

  useEffect(() => {
    if (openAddSignal > 0) {
      openCreate();
    }
  }, [openAddSignal]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...expenses]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((e) => {
        if (monthFilter && !e.date.startsWith(monthFilter)) return false;
        if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
        if (
          q &&
          !e.description.toLowerCase().includes(q) &&
          !e.category.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
  }, [expenses, search, categoryFilter, monthFilter]);

  const totalFiltered = useMemo(
    () => round2(filteredExpenses.reduce((s, e) => s + e.amount, 0)),
    [filteredExpenses]
  );

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cat of EXPENSE_CATEGORIES) map[cat] = 0;
    for (const e of filteredExpenses) {
      map[e.category] = round2((map[e.category] || 0) + e.amount);
    }
    return map;
  }, [filteredExpenses]);

  const openEdit = (e: Expense) => {
    setEditing(e);
    setDate(e.date);
    setCategory(e.category);
    setDescription(e.description);
    setAmount(String(e.amount));
    setPaymentMode(e.paymentMode);
    setModalOpen(true);
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const num = Number(amount);
    if (!description.trim() || !Number.isFinite(num) || num <= 0) {
      onNotify('Enter a clear description and a positive expense amount.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveExpense(uid, {
        id: editing?.id,
        date,
        category,
        description,
        amount: num,
        paymentMode,
      });
      onNotify(editing ? 'Expense updated.' : 'Expense saved.', 'success');
      setModalOpen(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save expense.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExpense(deleteTarget.id);
      onNotify('Expense deleted.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete expense.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Category Summary Strip */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div>
          <p className="text-xs text-[#64748B]">Total Shown</p>
          <p className="mt-1 text-base font-semibold font-mono-num text-[#0B1F3A]">
            {formatCurrency(totalFiltered, sym)}
          </p>
        </div>
        {EXPENSE_CATEGORIES.map((cat) => (
          <div key={cat}>
            <p className="text-xs text-[#64748B]">{cat}</p>
            <p className="mt-1 text-sm font-medium font-mono-num text-[#172338]">
              {formatCurrency(categoryTotals[cat] || 0, sym)}
            </p>
          </div>
        ))}
      </div>

      {/* Filters & Action */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expense description..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
            />
          </div>

          <div className="flex gap-2">
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="min-h-[42px] px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg"
            />
            {monthFilter && (
              <button
                type="button"
                onClick={() => setMonthFilter('')}
                className="min-h-[42px] px-3.5 py-2 text-xs font-medium bg-[#E8EFF8] hover:bg-[#DCE4EF] text-[#0B1F3A] rounded-lg cursor-pointer"
              >
                All
              </button>
            )}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as 'all' | ExpenseCategory)
            }
            className="min-h-[42px] px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg"
          >
            <option value="all">All Categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Expense</span>
        </button>
      </div>

      {/* Helpful explanation */}
      <p className="text-xs text-[#64748B]">
        Record shop overheads here (rent, electricity, fixed salaries, tools, transport). Per-job
        materials and site labour go in the Cost Calculator so they are never counted twice.
      </p>

      {/* Expenses List (Mobile Cards + Desktop Table) */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
        {filteredExpenses.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#0B1F3A]">
              No expenses found for this period
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              Record shop rent, electricity bills, staff salaries, transport, or tools.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 min-h-[44px] px-4 py-2 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg cursor-pointer"
            >
              Add First Expense
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-[#DCE4EF]">
              {filteredExpenses.map((e) => (
                <div key={e.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-[#0B1F3A]">
                        {e.category}
                      </span>
                      <p className="text-sm font-medium text-[#172338] mt-0.5">
                        {e.description}
                      </p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {formatDisplayDate(e.date)} · {e.paymentMode}
                      </p>
                    </div>
                    <p className="font-mono-num text-sm font-semibold text-[#0B1F3A] whitespace-nowrap">
                      {formatCurrency(e.amount, sym)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(e)}
                      className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#E8EFF8] text-[#0B1F3A] rounded-lg cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(e)}
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
                    <th className="text-left font-medium px-4 py-3">Category</th>
                    <th className="text-left font-medium px-4 py-3">Description</th>
                    <th className="text-left font-medium px-4 py-3">Mode</th>
                    <th className="text-right font-medium px-4 py-3">Amount</th>
                    <th className="text-right font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE4EF]/60">
                  {filteredExpenses.map((e) => (
                    <tr key={e.id} className="hover:bg-[#E8EFF8]/50">
                      <td className="px-4 py-3 font-mono-num text-xs text-[#64748B] whitespace-nowrap">
                        {formatDisplayDate(e.date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#0B1F3A] whitespace-nowrap">
                        {e.category}
                      </td>
                      <td className="px-4 py-3 text-[#172338]">{e.description}</td>
                      <td className="px-4 py-3 text-xs text-[#64748B] whitespace-nowrap">
                        {e.paymentMode}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-medium text-[#172338] whitespace-nowrap">
                        {formatCurrency(e.amount, sym)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            title="Edit expense"
                            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#0B1F3A] hover:bg-[#E8EFF8] rounded-md cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(e)}
                            title="Delete expense"
                            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#D64545] hover:bg-[#D64545]/10 rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Expense Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071629]/60">
          <div className="bg-white border border-[#DCE4EF] rounded-xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#DCE4EF]">
              <h2 className="text-lg font-semibold text-[#0B1F3A]">
                {editing ? 'Edit Expense' : 'Add Expense'}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Date *
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
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-white"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.maxDescription}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Workshop monthly rent / Cutter blades"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Amount ({sym}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    onKeyDown={(ev) => {
                      if (['-', '+', 'e', 'E'].includes(ev.key)) ev.preventDefault();
                    }}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="e.g. 5000"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Payment Mode *
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) =>
                      setPaymentMode(e.target.value as ExpensePaymentMode)
                    }
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-white"
                  >
                    {EXPENSE_PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
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
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Expense?"
        message={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.description}" (${formatCurrency(
                deleteTarget.amount,
                sym
              )})? This will update your Monthly P&L.`
            : ''
        }
        confirmLabel="Delete Expense"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
