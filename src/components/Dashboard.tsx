import { useMemo, useState } from 'react';
import {
  ArrowRight,
  FilePlus2,
  FileSpreadsheet,
  Receipt,
  Wallet,
} from 'lucide-react';
import type {
  AppTab,
  BusinessSettings,
  Expense,
  Invoice,
  JobCosting,
  Payment,
} from '../types';
import {
  currentMonthISO,
  formatCurrency,
  formatDisplayDate,
  formatMonthLabel,
  isDateInFilter,
  isInvoiceActive,
  round2,
} from '../utils/format';

interface DashboardProps {
  invoices: Invoice[];
  payments: Payment[];
  jobCostings: JobCosting[];
  expenses: Expense[];
  settings: BusinessSettings;
  onNavigate: (tab: AppTab) => void;
  onQuickCreateInvoice: () => void;
  onQuickAddExpense: () => void;
  onQuickRecordPayment: () => void;
}

export function Dashboard({
  invoices,
  payments,
  jobCostings,
  expenses,
  settings,
  onNavigate,
  onQuickCreateInvoice,
  onQuickAddExpense,
  onQuickRecordPayment,
}: DashboardProps) {
  const [monthFilter, setMonthFilter] = useState<string>(currentMonthISO());
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const sym = settings.currencySymbol || '₹';

  const activeInvoices = useMemo(
    () => invoices.filter(isInvoiceActive),
    [invoices]
  );

  const activePayments = useMemo(() => {
    const voidedIds = new Set(
      invoices.filter((i) => !isInvoiceActive(i)).map((i) => i.id)
    );
    return payments.filter((p) => !voidedIds.has(p.invoiceId));
  }, [invoices, payments]);

  const filtered = useMemo(() => {
    const inv = activeInvoices.filter((i) => isDateInFilter(i.date, monthFilter, fromDate, toDate));
    const pay = activePayments.filter((p) => isDateInFilter(p.date, monthFilter, fromDate, toDate));
    const jobs = jobCostings.filter((j) => isDateInFilter(j.date, monthFilter, fromDate, toDate));
    const exp = expenses.filter((e) => isDateInFilter(e.date, monthFilter, fromDate, toDate));

    const monthlySales = round2(inv.reduce((s, i) => s + i.total, 0));
    const moneyCollected = round2(pay.reduce((s, p) => s + p.amount, 0));
    const periodPending = round2(inv.reduce((s, i) => s + i.balanceDue, 0));
    const allPendingReceivables = round2(activeInvoices.reduce((s, i) => s + i.balanceDue, 0));
    const materialCosts = round2(jobs.reduce((s, j) => s + j.totalMaterialCost, 0));
    const jobExtras = round2(
      jobs.reduce(
        (s, j) => s + j.labourCost + j.transportCost + j.installationCost + j.otherJobCost,
        0
      )
    );
    const operatingExpenses = round2(exp.reduce((s, e) => s + e.amount, 0));
    const otherExpenses = round2(jobExtras + operatingExpenses);
    const totalCosts = round2(materialCosts + otherExpenses);
    const netProfit = round2(monthlySales - totalCosts);

    return {
      inv,
      pay,
      jobs,
      exp,
      monthlySales,
      moneyCollected,
      periodPending,
      allPendingReceivables,
      materialCosts,
      jobExtras,
      operatingExpenses,
      otherExpenses,
      netProfit,
    };
  }, [activeInvoices, activePayments, jobCostings, expenses, monthFilter, fromDate, toDate]);

  // Last 6 months trend for Navy + complementary Blue bar comparison
  const monthlyTrend = useMemo(() => {
    const months: string[] = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months.map((m) => {
      const sales = activeInvoices
        .filter((i) => i.date.startsWith(m))
        .reduce((s, i) => s + i.total, 0);
      const collected = activePayments
        .filter((p) => p.date.startsWith(m))
        .reduce((s, p) => s + p.amount, 0);
      return { month: m, sales: round2(sales), collected: round2(collected) };
    });
  }, [activeInvoices, activePayments]);

  const maxTrend = Math.max(
    1,
    ...monthlyTrend.map((t) => Math.max(t.sales, t.collected))
  );

  const pendingInvoices = useMemo(
    () =>
      activeInvoices
        .filter((i) => i.balanceDue > 0.009)
        .sort((a, b) => b.balanceDue - a.balanceDue)
        .slice(0, 6),
    [activeInvoices]
  );

  const recentInvoices = useMemo(
    () => [...filtered.inv].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [filtered.inv]
  );

  const resetFilters = () => {
    setMonthFilter(currentMonthISO());
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="space-y-6">
      {/* Quick Actions Strip */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0B1F3A]">Quick Actions</h2>
          <p className="text-xs text-[#64748B]">
            Jump straight to your daily billing, expense, payment, or report tasks.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onQuickCreateInvoice}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4 shrink-0" />
            <span>Create Invoice</span>
          </button>
          <button
            type="button"
            onClick={onQuickAddExpense}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#DCE4EF] hover:bg-[#E8EFF8] text-[#0B1F3A] text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Receipt className="w-4 h-4 shrink-0" />
            <span>Add Expense</span>
          </button>
          <button
            type="button"
            onClick={onQuickRecordPayment}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#DCE4EF] hover:bg-[#E8EFF8] text-[#0B1F3A] text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>Record Payment</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#E8EFF8] hover:bg-[#DCE4EF] text-[#0B1F3A] text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>View Reports</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)] flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1">
              Month Filter
            </label>
            <div className="flex gap-2">
              <input
                type="month"
                value={monthFilter === 'all' ? '' : monthFilter}
                onChange={(e) => setMonthFilter(e.target.value || 'all')}
                className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
              />
              <button
                type="button"
                onClick={() => setMonthFilter('all')}
                className={`min-h-[42px] px-3.5 py-2 text-xs font-medium rounded-lg border whitespace-nowrap cursor-pointer transition-colors ${
                  monthFilter === 'all'
                    ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                    : 'bg-white text-[#172338] border-[#DCE4EF] hover:bg-[#E8EFF8]'
                }`}
              >
                All
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
          <span className="text-xs text-[#64748B]">
            Showing:{' '}
            <strong className="text-[#0B1F3A] font-semibold">
              {monthFilter === 'all' ? 'All Months' : formatMonthLabel(monthFilter)}
            </strong>
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="min-h-[42px] px-3.5 py-2 text-xs font-medium text-[#0B1F3A] bg-[#E8EFF8] hover:bg-[#DCE4EF] rounded-lg transition-colors cursor-pointer"
          >
            This Month
          </button>
        </div>
      </div>

      {/* 6 Core Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">Monthly Sales (Billed)</p>
          <p className="mt-2 text-2xl font-semibold text-[#0B1F3A] font-mono-num">
            {formatCurrency(filtered.monthlySales, sym)}
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            {filtered.inv.length} invoice{filtered.inv.length === 1 ? '' : 's'} created
          </p>
        </div>

        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">Money Collected (Cash Received)</p>
          <p className="mt-2 text-2xl font-semibold text-[#16805D] font-mono-num">
            {formatCurrency(filtered.moneyCollected, sym)}
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            {filtered.pay.length} payment receipt{filtered.pay.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">Pending Customer Payments</p>
          <p className="mt-2 text-2xl font-semibold text-[#D99722] font-mono-num">
            {formatCurrency(filtered.allPendingReceivables, sym)}
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            Total due · Period unpaid: {formatCurrency(filtered.periodPending, sym)}
          </p>
        </div>

        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">Material Costs (Jobs)</p>
          <p className="mt-2 text-2xl font-semibold text-[#172338] font-mono-num">
            {formatCurrency(filtered.materialCosts, sym)}
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            Across {filtered.jobs.length} costed job{filtered.jobs.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">Other Expenses &amp; Labour</p>
          <p className="mt-2 text-2xl font-semibold text-[#172338] font-mono-num">
            {formatCurrency(filtered.otherExpenses, sym)}
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] tabular-nums">
            Shop: {formatCurrency(filtered.operatingExpenses, sym)} · Labour/Site:{' '}
            {formatCurrency(filtered.jobExtras, sym)}
          </p>
        </div>

        <div className="bg-[#0B1F3A] border border-[#071629] rounded-xl p-5 text-white shadow-[0_2px_6px_rgba(11,31,58,0.12)]">
          <p className="text-xs font-medium text-[#CBD8E8]">Net Profit (Sales - Costs)</p>
          <p
            className={`mt-2 text-2xl font-semibold font-mono-num ${
              filtered.netProfit >= 0 ? 'text-white' : 'text-[#FCA5A5]'
            }`}
          >
            {formatCurrency(filtered.netProfit, sym)}
          </p>
          <p className="mt-1.5 text-xs text-[#9FB4CE] tabular-nums">
            Profit Margin:{' '}
            {filtered.monthlySales > 0
              ? `${((filtered.netProfit / filtered.monthlySales) * 100).toFixed(1)}%`
              : '0.0%'}
          </p>
        </div>
      </div>

      {/* 6-Month Sales vs Cash Collection Trend */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
          <div>
            <h2 className="text-base font-semibold text-[#0B1F3A]">
              Sales vs. Money Collected (Last 6 Months)
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Compare monthly billed invoices against actual customer payments received.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#172338]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#0B1F3A] rounded-xs inline-block" />
              Billed Sales
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#4E7FB8] rounded-xs inline-block" />
              Money Collected
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 items-end">
          {monthlyTrend.map((row) => {
            const salesH = Math.round((row.sales / maxTrend) * 120);
            const collH = Math.round((row.collected / maxTrend) * 120);
            return (
              <div key={row.month} className="flex flex-col">
                <div className="h-[128px] flex items-end justify-center gap-2 border-b border-[#DCE4EF] pb-1">
                  <div
                    title={`Sales: ${formatCurrency(row.sales, sym)}`}
                    style={{ height: `${Math.max(4, salesH)}px` }}
                    className="w-5 bg-[#0B1F3A] rounded-t-sm"
                  />
                  <div
                    title={`Collected: ${formatCurrency(row.collected, sym)}`}
                    style={{ height: `${Math.max(4, collH)}px` }}
                    className="w-5 bg-[#4E7FB8] rounded-t-sm"
                  />
                </div>
                <p className="mt-2 text-xs font-medium text-[#172338] text-center tabular-nums">
                  {row.month}
                </p>
                <p className="text-[11px] text-[#64748B] text-center font-mono-num truncate">
                  {formatCurrency(row.sales, sym)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-column Actionable Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Customer Balances */}
        <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <div className="px-5 py-4 border-b border-[#DCE4EF] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0B1F3A]">
              Pending Customer Payments
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="min-h-[36px] text-xs font-medium text-[#163A63] hover:text-[#0B1F3A] flex items-center gap-1 cursor-pointer"
            >
              <span>Collect Payment</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {pendingInvoices.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-[#0B1F3A]">
                All invoices are paid in full
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                No pending customer balances right now.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#DCE4EF] text-xs text-[#64748B] bg-[#F4F7FB]">
                    <th className="text-left font-medium px-4 py-2.5">Invoice</th>
                    <th className="text-left font-medium px-4 py-2.5">Customer</th>
                    <th className="text-right font-medium px-4 py-2.5">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE4EF]/60">
                  {pendingInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#E8EFF8]/50">
                      <td className="px-4 py-2.5 font-mono-num text-xs text-[#0B1F3A] font-medium">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-2.5 text-[#172338]">
                        {inv.customerName}
                        <span className="block text-xs text-[#64748B]">
                          {formatDisplayDate(inv.date)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-num font-medium text-[#D99722]">
                        {formatCurrency(inv.balanceDue, sym)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Invoices in Period */}
        <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <div className="px-5 py-4 border-b border-[#DCE4EF] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0B1F3A]">
              Recent Invoices
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('invoices')}
              className="min-h-[36px] text-xs font-medium text-[#163A63] hover:text-[#0B1F3A] flex items-center gap-1 cursor-pointer"
            >
              <span>All Invoices</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-[#0B1F3A]">
                No invoices for this period
              </p>
              <p className="mt-1 text-xs text-[#64748B]">
                Create your first invoice to start tracking sales and payments.
              </p>
              <button
                type="button"
                onClick={onQuickCreateInvoice}
                className="mt-4 min-h-[40px] px-4 py-2 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Create Invoice
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#DCE4EF] text-xs text-[#64748B] bg-[#F4F7FB]">
                    <th className="text-left font-medium px-4 py-2.5">Invoice</th>
                    <th className="text-left font-medium px-4 py-2.5">Customer</th>
                    <th className="text-left font-medium px-4 py-2.5">Status</th>
                    <th className="text-right font-medium px-4 py-2.5">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE4EF]/60">
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#E8EFF8]/50">
                      <td className="px-4 py-2.5 font-mono-num text-xs text-[#0B1F3A] font-medium">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-2.5 text-[#172338]">
                        {inv.customerName}
                        <span className="block text-xs text-[#64748B]">
                          {formatDisplayDate(inv.date)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium">
                        {inv.paymentStatus === 'paid' ? (
                          <span className="text-[#16805D]">Paid</span>
                        ) : inv.paymentStatus === 'partial' ? (
                          <span className="text-[#D99722]">Partial</span>
                        ) : (
                          <span className="text-[#D64545]">Unpaid</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-num font-medium text-[#172338]">
                        {formatCurrency(inv.total, sym)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
