import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type {
  BusinessSettings,
  Expense,
  Invoice,
  JobCosting,
  Payment,
} from '../types';
import {
  computeMonthlyPnL,
  currentMonthISO,
  formatCurrency,
  formatDisplayDate,
  formatMonthLabel,
  isInvoiceActive,
} from '../utils/format';
import { downloadMonthlyReportPDF } from '../utils/pdf';

interface MonthEndReportsProps {
  invoices: Invoice[];
  payments: Payment[];
  jobCostings: JobCosting[];
  expenses: Expense[];
  settings: BusinessSettings;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
}

export function MonthEndReports({
  invoices,
  payments,
  jobCostings,
  expenses,
  settings,
  onNotify,
}: MonthEndReportsProps) {
  const [month, setMonth] = useState(currentMonthISO());
  const [downloading, setDownloading] = useState(false);
  const sym = settings.currencySymbol || '₹';

  const summary = useMemo(
    () => computeMonthlyPnL(month, invoices, payments, jobCostings, expenses),
    [month, invoices, payments, jobCostings, expenses]
  );

  const monthInvoices = useMemo(
    () =>
      invoices
        .filter((i) => isInvoiceActive(i) && i.date.startsWith(month))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [invoices, month]
  );

  const monthJobs = useMemo(
    () =>
      jobCostings
        .filter((j) => j.date.startsWith(month))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [jobCostings, month]
  );

  const monthExpenses = useMemo(
    () =>
      expenses
        .filter((e) => e.date.startsWith(month))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [expenses, month]
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadMonthlyReportPDF(
        month,
        summary,
        invoices,
        payments,
        jobCostings,
        expenses,
        settings
      );
    } catch (err) {
      if (onNotify) {
        onNotify(
          err instanceof Error ? err.message : 'Failed to generate monthly PDF.',
          'error'
        );
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Month Selector & Download Bar */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#0B1F3A]">
            Month-End Business Report — {formatMonthLabel(month)}
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Includes sales, collections, outstanding balances, material costs, expenses,
            job-wise profitability, and net profit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonthISO())}
            className="px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
          />
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] hover:bg-[#163A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Generating PDF...' : 'Download Monthly PDF'}</span>
          </button>
        </div>
      </div>

      {/* Report Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs text-[#64748B]">Sales</p>
          <p className="mt-1 text-base font-semibold font-mono-num text-[#0B1F3A]">
            {formatCurrency(summary.invoicedSales, sym)}
          </p>
        </div>
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs text-[#64748B]">Collections</p>
          <p className="mt-1 text-base font-semibold font-mono-num text-[#16805D]">
            {formatCurrency(summary.cashCollected, sym)}
          </p>
        </div>
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs text-[#64748B]">Month Pending</p>
          <p className="mt-1 text-base font-semibold font-mono-num text-[#D99722]">
            {formatCurrency(summary.monthPendingReceivables, sym)}
          </p>
        </div>
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs text-[#64748B]">Material Costs</p>
          <p className="mt-1 text-base font-semibold font-mono-num text-[#172338]">
            {formatCurrency(summary.materialCosts, sym)}
          </p>
        </div>
        <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <p className="text-xs text-[#64748B]">All Expenses &amp; Labour</p>
          <p className="mt-1 text-base font-semibold font-mono-num text-[#172338]">
            {formatCurrency(
              summary.totalAllCosts - summary.materialCosts,
              sym
            )}
          </p>
        </div>
        <div className="bg-[#0B1F3A] border border-[#071629] rounded-xl p-4 text-white shadow-[0_2px_6px_rgba(11,31,58,0.12)]">
          <p className="text-xs text-[#CBD8E8]">Net Profit</p>
          <p
            className={`mt-1 text-base font-semibold font-mono-num ${
              summary.netProfitAccrual >= 0 ? 'text-white' : 'text-[#FCA5A5]'
            }`}
          >
            {formatCurrency(summary.netProfitAccrual, sym)}
          </p>
        </div>
      </div>

      {/* Job-wise Profitability Preview */}
      <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
        <div className="px-5 py-3.5 border-b border-[#DCE4EF] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0B1F3A]">
            Job-Wise Profitability ({monthJobs.length})
          </h3>
        </div>
        {monthJobs.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#64748B]">
            No job costings recorded in {formatMonthLabel(month)}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#DCE4EF] bg-[#F4F7FB] text-xs text-[#64748B]">
                  <th className="text-left font-medium px-4 py-2.5">Date</th>
                  <th className="text-left font-medium px-4 py-2.5">Job Title</th>
                  <th className="text-left font-medium px-4 py-2.5">Customer</th>
                  <th className="text-right font-medium px-4 py-2.5">Materials</th>
                  <th className="text-right font-medium px-4 py-2.5">Labour/Site</th>
                  <th className="text-right font-medium px-4 py-2.5">Total Cost</th>
                  <th className="text-right font-medium px-4 py-2.5">Est. Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE4EF]/60">
                {monthJobs.map((j) => (
                  <tr key={j.id} className="hover:bg-[#E8EFF8]/50">
                    <td className="px-4 py-2.5 font-mono-num text-xs text-[#64748B]">
                      {formatDisplayDate(j.date)}
                    </td>
                    <td className="px-4 py-2.5 text-[#0B1F3A] font-medium">{j.jobTitle}</td>
                    <td className="px-4 py-2.5 text-[#64748B]">{j.customerName || '-'}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-[#172338]">
                      {formatCurrency(j.totalMaterialCost, sym)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-[#172338]">
                      {formatCurrency(
                        j.labourCost +
                          j.transportCost +
                          j.installationCost +
                          j.otherJobCost,
                        sym
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-[#172338]">
                      {formatCurrency(j.totalJobCost, sym)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono-num font-semibold ${
                        j.estimatedProfit >= 0 ? 'text-[#16805D]' : 'text-[#D64545]'
                      }`}
                    >
                      {formatCurrency(j.estimatedProfit, sym)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Two-Column Month Invoices & Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <div className="px-5 py-3.5 border-b border-[#DCE4EF]">
            <h3 className="text-sm font-semibold text-[#0B1F3A]">
              Invoices Issued ({monthInvoices.length})
            </h3>
          </div>
          {monthInvoices.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#64748B]">
              No invoices issued in {formatMonthLabel(month)}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#DCE4EF] bg-[#F4F7FB] text-[#64748B]">
                    <th className="text-left px-4 py-2.5 font-medium">Invoice #</th>
                    <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                    <th className="text-right px-4 py-2.5 font-medium">Total</th>
                    <th className="text-right px-4 py-2.5 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE4EF]/60">
                  {monthInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-2.5 font-mono-num text-[#0B1F3A] font-medium">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-2.5 text-[#172338]">{inv.customerName}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num text-[#172338]">
                        {formatCurrency(inv.total, sym)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-num text-[#D99722]">
                        {formatCurrency(inv.balanceDue, sym)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
          <div className="px-5 py-3.5 border-b border-[#DCE4EF]">
            <h3 className="text-sm font-semibold text-[#0B1F3A]">
              Operating Expenses ({monthExpenses.length})
            </h3>
          </div>
          {monthExpenses.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#64748B]">
              No operating expenses recorded in {formatMonthLabel(month)}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#DCE4EF] bg-[#F4F7FB] text-[#64748B]">
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Category</th>
                    <th className="text-left px-4 py-2.5 font-medium">Description</th>
                    <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE4EF]/60">
                  {monthExpenses.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2.5 font-mono-num text-[#64748B]">
                        {formatDisplayDate(e.date)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-[#0B1F3A]">
                        {e.category}
                      </td>
                      <td className="px-4 py-2.5 text-[#172338]">{e.description}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num text-[#172338]">
                        {formatCurrency(e.amount, sym)}
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
