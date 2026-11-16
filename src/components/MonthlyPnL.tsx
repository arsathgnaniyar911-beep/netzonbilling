import { useMemo, useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  type BusinessSettings,
  type Expense,
  type Invoice,
  type JobCosting,
  type Payment,
} from '../types';
import {
  computeMonthlyPnL,
  currentMonthISO,
  formatCurrency,
  formatMonthLabel,
} from '../utils/format';

interface MonthlyPnLProps {
  invoices: Invoice[];
  payments: Payment[];
  jobCostings: JobCosting[];
  expenses: Expense[];
  settings: BusinessSettings;
}

export function MonthlyPnL({
  invoices,
  payments,
  jobCostings,
  expenses,
  settings,
}: MonthlyPnLProps) {
  const [month, setMonth] = useState(currentMonthISO());
  const sym = settings.currencySymbol || '₹';

  const summary = useMemo(
    () => computeMonthlyPnL(month, invoices, payments, jobCostings, expenses),
    [month, invoices, payments, jobCostings, expenses]
  );

  return (
    <div className="space-y-6">
      {/* Month Header & Selector */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            Profit &amp; Loss Statement — {formatMonthLabel(month)}
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Invoiced revenue vs. actual cash received, reconciled without double-counting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[#64748B]">Select Month:</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonthISO())}
            className="px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
          />
        </div>
      </div>

      {/* Invoiced Sales vs Cash Received Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">Invoiced Sales (Accrual)</p>
          <p className="mt-2 text-2xl font-semibold font-mono-num text-[#0B1F3A]">
            {formatCurrency(summary.invoicedSales, sym)}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            {summary.invoicedCount} invoice(s) · Discounts:{' '}
            {formatCurrency(summary.totalDiscounts, sym)}
          </p>
        </div>

        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">Cash Received (Actual)</p>
          <p className="mt-2 text-2xl font-semibold font-mono-num text-[#16805D]">
            {formatCurrency(summary.cashCollected, sym)}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            Adv: {formatCurrency(summary.advanceCollected, sym)} · Bal:{' '}
            {formatCurrency(summary.balanceCollected, sym)}
          </p>
        </div>

        <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs font-medium text-[#64748B]">Total Business Costs</p>
          <p className="mt-2 text-2xl font-semibold font-mono-num text-[#172338]">
            {formatCurrency(summary.totalAllCosts, sym)}
          </p>
          <p className="mt-1 text-xs text-[#64748B] tabular-nums">
            Direct Jobs: {formatCurrency(summary.totalDirectJobCosts, sym)} · Overheads:{' '}
            {formatCurrency(summary.totalOperatingExpenses, sym)}
          </p>
        </div>

        <div className="bg-[#0B1F3A] border border-[#071629] rounded-xl p-5 text-white shadow-[0_2px_6px_rgba(11,31,58,0.12)]">
          <p className="text-xs font-medium text-[#CBD8E8]">Net Profit (Invoiced Basis)</p>
          <p
            className={`mt-2 text-2xl font-semibold font-mono-num ${
              summary.netProfitAccrual >= 0 ? 'text-white' : 'text-[#FCA5A5]'
            }`}
          >
            {formatCurrency(summary.netProfitAccrual, sym)}
          </p>
          <p className="mt-1 text-xs text-[#9FB4CE] tabular-nums">
            Margin: {summary.netProfitMarginPct.toFixed(1)}% · Cash Net:{' '}
            {formatCurrency(summary.netCashFlow, sym)}
          </p>
        </div>
      </div>

      {/* Line-by-Line P&L Ledger */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
        <div className="px-5 py-4 border-b border-[#DCE4EF]">
          <h3 className="text-sm font-semibold text-[#0B1F3A]">
            Detailed Monthly Profit &amp; Loss Ledger
          </h3>
        </div>
        <div className="divide-y divide-[#DCE4EF]/60 text-sm">
          {/* Revenue Section */}
          <div className="px-5 py-3 bg-[#F4F7FB] font-semibold text-[#0B1F3A] flex justify-between">
            <span>A. Sales Revenue (Invoiced in {formatMonthLabel(month)})</span>
            <span className="font-mono-num">{formatCurrency(summary.invoicedSales, sym)}</span>
          </div>
          <div className="px-5 py-2.5 flex justify-between text-[#64748B] pl-8">
            <span>Cash Received this month (Advances + Balance Payments)</span>
            <span className="font-mono-num text-[#16805D] font-medium">
              {formatCurrency(summary.cashCollected, sym)}
            </span>
          </div>
          <div className="px-5 py-2.5 flex justify-between text-[#64748B] pl-8">
            <span>Pending Balance from this month&apos;s invoices</span>
            <span className="font-mono-num text-[#D99722] font-medium">
              {formatCurrency(summary.monthPendingReceivables, sym)}
            </span>
          </div>

          {/* Direct Job Costs */}
          <div className="px-5 py-3 bg-[#F4F7FB] font-semibold text-[#0B1F3A] flex justify-between">
            <span>B. Direct Job Costs (From Material Cost Calculator)</span>
            <span className="font-mono-num">
              - {formatCurrency(summary.totalDirectJobCosts, sym)}
            </span>
          </div>
          <div className="px-5 py-2.5 flex justify-between text-[#172338] pl-8">
            <span>Materials (Mesh, Aluminium Frames, Accessories, Blinds)</span>
            <span className="font-mono-num">{formatCurrency(summary.materialCosts, sym)}</span>
          </div>
          <div className="px-5 py-2.5 flex justify-between text-[#172338] pl-8">
            <span>Job Labour Costs</span>
            <span className="font-mono-num">{formatCurrency(summary.labourCosts, sym)}</span>
          </div>
          <div className="px-5 py-2.5 flex justify-between text-[#172338] pl-8">
            <span>Job Transport Costs</span>
            <span className="font-mono-num">
              {formatCurrency(summary.jobTransportCosts, sym)}
            </span>
          </div>
          <div className="px-5 py-2.5 flex justify-between text-[#172338] pl-8">
            <span>Site Installation &amp; Other Job Costs</span>
            <span className="font-mono-num">
              {formatCurrency(summary.installationCosts + summary.otherJobCosts, sym)}
            </span>
          </div>

          {/* Gross Profit */}
          <div className="px-5 py-3 font-semibold text-[#0B1F3A] flex justify-between bg-[#E8EFF8]">
            <span>C. Gross Profit (A - B)</span>
            <span className="font-mono-num">{formatCurrency(summary.grossProfit, sym)}</span>
          </div>

          {/* Operating Expenses */}
          <div className="px-5 py-3 bg-[#F4F7FB] font-semibold text-[#0B1F3A] flex justify-between">
            <span>D. Operating Expenses (Shop &amp; Business Overheads)</span>
            <span className="font-mono-num">
              - {formatCurrency(summary.totalOperatingExpenses, sym)}
            </span>
          </div>
          {EXPENSE_CATEGORIES.map((cat) => (
            <div key={cat} className="px-5 py-2.5 flex justify-between text-[#172338] pl-8">
              <span>{cat}</span>
              <span className="font-mono-num">
                {formatCurrency(summary.operatingExpensesByCategory[cat] || 0, sym)}
              </span>
            </div>
          ))}

          {/* Final Net Profit */}
          <div className="px-5 py-4 bg-[#0B1F3A] text-white font-semibold flex justify-between text-base">
            <span>E. Net Profit (C - D)</span>
            <span
              className={`font-mono-num ${
                summary.netProfitAccrual >= 0 ? 'text-white' : 'text-[#FCA5A5]'
              }`}
            >
              {formatCurrency(summary.netProfitAccrual, sym)}
            </span>
          </div>
        </div>
      </div>

      {/* Anti-Double-Counting Explanation */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 text-xs text-[#64748B] space-y-1.5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
        <p className="font-semibold text-[#0B1F3A] text-sm">
          Accounting Separation &amp; Anti-Double-Counting Rules
        </p>
        <p>
          1. <strong className="text-[#172338]">Sales vs. Cash:</strong> Invoice totals count once under Invoiced Sales.
          Advance payments and later balance settlements are logged in Payments and counted
          separately under Cash Received—never added on top of sales.
        </p>
        <p>
          2. <strong className="text-[#172338]">Job Costs vs. Overheads:</strong> Material, site labour, and job
          transport logged in Cost Calculator are summed in Section B. Workshop rent,
          electricity, fixed salaries, tools, and general expenses logged in Expenses are
          summed in Section D.
        </p>
      </div>
    </div>
  );
}
