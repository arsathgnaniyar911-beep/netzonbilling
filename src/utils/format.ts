import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type Invoice,
  type InvoiceItem,
  type JobCosting,
  type MaterialLine,
  type MonthlyPnLSummary,
  type Payment,
  type PaymentStatus,
} from '../types';

export const BLUEPRINT_LIMITS = {
  idPattern: /^[a-zA-Z0-9_-]+$/,
  datePattern: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  pincodePattern: /^[0-9]{6}$/,
  maxItems: 30,
  maxName: 120,
  maxPhone: 20,
  maxAddress: 300,
  maxNotes: 500,
  maxTitle: 160,
  maxDescription: 250,
  maxInvoiceNumber: 40,
  maxPrefix: 15,
  maxReference: 120,
};

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentMonthISO(): string {
  return todayISO().slice(0, 7);
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const absFormatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return `${safe < 0 ? '-' : ''}${symbol}${absFormatted}`;
}

export function formatCurrencyCompact(amount: number, symbol = '₹'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const absFormatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(Math.abs(safe)));
  return `${safe < 0 ? '-' : ''}${symbol}${absFormatted}`;
}

export function formatPDFMoney(amount: number, code = 'Rs.'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const absFormatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return `${safe < 0 ? '-' : ''}${code} ${absFormatted}`;
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr || !BLUEPRINT_LIMITS.datePattern.test(dateStr)) return dateStr || '-';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMonthLabel(monthStr: string): string {
  if (!monthStr || !/^[0-9]{4}-[0-9]{2}$/.test(monthStr)) return monthStr || 'All Months';
  const [y, m] = monthStr.split('-').map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function isDateInFilter(
  dateStr: string,
  monthFilter: string,
  fromDate: string,
  toDate: string
): boolean {
  if (!dateStr) return false;
  if (monthFilter && monthFilter !== 'all' && !dateStr.startsWith(monthFilter)) {
    return false;
  }
  if (fromDate && dateStr < fromDate) return false;
  if (toDate && dateStr > toDate) return false;
  return true;
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function sanitizeText(value: string, maxLen: number): string {
  return (value || '').trim().slice(0, maxLen);
}

export function isInvoiceActive(inv: Pick<Invoice, 'status'>): boolean {
  return inv.status !== 'voided';
}

export function calculateInvoiceTotals(
  items: InvoiceItem[],
  discountInput: number,
  paidAmountInput: number,
  labourChargesInput = 0,
  transportChargesInput = 0
): {
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  labourCharges: number;
  transportCharges: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus: PaymentStatus;
} {
  const cleanItems = items.map((item, idx) => {
    const rawSqFeet = Number(item.sqFeet ?? item.quantity ?? 0);
    const sqFeet = Math.max(0.01, round2(rawSqFeet));
    const unitPrice = Math.max(0, round2(item.unitPrice));
    return {
      id: item.id,
      order: idx,
      description: sanitizeText(item.description, 200) || 'Material',
      sqFeet,
      unit: sanitizeText(item.unit || 'sq ft', 20) || 'sq ft',
      unitPrice,
      lineTotal: round2(sqFeet * unitPrice),
    };
  });

  const subtotal = round2(cleanItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const discount = Math.min(subtotal, Math.max(0, round2(discountInput)));
  const labourCharges = Math.max(0, round2(labourChargesInput));
  const transportCharges = Math.max(0, round2(transportChargesInput));
  const total = round2(Math.max(0, subtotal - discount + labourCharges + transportCharges));
  const paidAmount = Math.max(0, round2(paidAmountInput));
  const balanceDue = round2(Math.max(0, total - paidAmount));

  let paymentStatus: PaymentStatus = 'unpaid';
  if (total === 0 || balanceDue <= 0.009) {
    paymentStatus = 'paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'partial';
  }

  return {
    items: cleanItems,
    subtotal,
    discount,
    labourCharges,
    transportCharges,
    total,
    paidAmount,
    balanceDue,
    paymentStatus,
  };
}

export function calculateJobCostingTotals(
  materials: MaterialLine[],
  labourCost: number,
  transportCost: number,
  installationCost: number,
  otherJobCost: number,
  estimatedSellingPrice: number
) {
  const cleanMaterials = materials.slice(0, BLUEPRINT_LIMITS.maxItems).map((m) => {
    const qty = Math.max(0.01, round2(m.quantity));
    const unitCost = Math.max(0, round2(m.unitCost));
    return {
      category: m.category,
      name: sanitizeText(m.name, 120) || 'Material',
      quantity: qty,
      unit: sanitizeText(m.unit, 20) || 'nos',
      unitCost,
      totalCost: round2(qty * unitCost),
    };
  });

  const totalMaterialCost = round2(
    cleanMaterials.reduce((sum, m) => sum + m.totalCost, 0)
  );
  const labour = Math.max(0, round2(labourCost));
  const transport = Math.max(0, round2(transportCost));
  const installation = Math.max(0, round2(installationCost));
  const other = Math.max(0, round2(otherJobCost));
  const totalJobCost = round2(totalMaterialCost + labour + transport + installation + other);
  const selling = Math.max(0, round2(estimatedSellingPrice));
  const estimatedProfit = round2(selling - totalJobCost);

  return {
    materials: cleanMaterials,
    totalMaterialCost,
    labourCost: labour,
    transportCost: transport,
    installationCost: installation,
    otherJobCost: other,
    totalJobCost,
    estimatedSellingPrice: selling,
    estimatedProfit,
  };
}

export function computeMonthlyPnL(
  month: string,
  invoices: Invoice[],
  payments: Payment[],
  jobCostings: JobCosting[],
  expenses: Expense[]
): MonthlyPnLSummary {
  const activeInvoices = invoices.filter(isInvoiceActive);
  const voidedInvoiceIds = new Set(
    invoices.filter((inv) => !isInvoiceActive(inv)).map((inv) => inv.id)
  );
  const activePayments = payments.filter((p) => !voidedInvoiceIds.has(p.invoiceId));

  const monthInvoices = activeInvoices.filter((inv) => inv.date.startsWith(month));
  const monthPayments = activePayments.filter((p) => p.date.startsWith(month));
  const monthJobs = jobCostings.filter((j) => j.date.startsWith(month));
  const monthExpenses = expenses.filter((e) => e.date.startsWith(month));

  const invoicedSales = round2(monthInvoices.reduce((s, inv) => s + inv.total, 0));
  const totalDiscounts = round2(monthInvoices.reduce((s, inv) => s + inv.discount, 0));
  const monthPendingReceivables = round2(
    monthInvoices.reduce((s, inv) => s + inv.balanceDue, 0)
  );
  const totalOutstandingReceivables = round2(
    activeInvoices.reduce((s, inv) => s + inv.balanceDue, 0)
  );

  const cashCollected = round2(monthPayments.reduce((s, p) => s + p.amount, 0));
  const advanceCollected = round2(
    monthPayments.filter((p) => p.isAdvance).reduce((s, p) => s + p.amount, 0)
  );
  const balanceCollected = round2(
    monthPayments.filter((p) => !p.isAdvance).reduce((s, p) => s + p.amount, 0)
  );

  const materialCosts = round2(monthJobs.reduce((s, j) => s + j.totalMaterialCost, 0));
  const labourCosts = round2(monthJobs.reduce((s, j) => s + j.labourCost, 0));
  const jobTransportCosts = round2(monthJobs.reduce((s, j) => s + j.transportCost, 0));
  const installationCosts = round2(monthJobs.reduce((s, j) => s + j.installationCost, 0));
  const otherJobCosts = round2(monthJobs.reduce((s, j) => s + j.otherJobCost, 0));
  const totalDirectJobCosts = round2(
    materialCosts + labourCosts + jobTransportCosts + installationCosts + otherJobCosts
  );

  const operatingExpensesByCategory = EXPENSE_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = 0;
    return acc;
  }, {} as Record<ExpenseCategory, number>);

  for (const exp of monthExpenses) {
    operatingExpensesByCategory[exp.category] = round2(
      (operatingExpensesByCategory[exp.category] || 0) + exp.amount
    );
  }

  const totalOperatingExpenses = round2(
    monthExpenses.reduce((s, e) => s + e.amount, 0)
  );

  const grossProfit = round2(invoicedSales - totalDirectJobCosts);
  const totalAllCosts = round2(totalDirectJobCosts + totalOperatingExpenses);
  const netProfitAccrual = round2(invoicedSales - totalAllCosts);
  const netProfitMarginPct =
    invoicedSales > 0 ? round2((netProfitAccrual / invoicedSales) * 100) : 0;
  const netCashFlow = round2(cashCollected - totalAllCosts);

  return {
    month,
    invoicedSales,
    invoicedCount: monthInvoices.length,
    totalDiscounts,
    cashCollected,
    advanceCollected,
    balanceCollected,
    paymentCount: monthPayments.length,
    monthPendingReceivables,
    totalOutstandingReceivables,
    materialCosts,
    labourCosts,
    jobTransportCosts,
    installationCosts,
    otherJobCosts,
    totalDirectJobCosts,
    grossProfit,
    operatingExpensesByCategory,
    totalOperatingExpenses,
    totalAllCosts,
    netProfitAccrual,
    netProfitMarginPct,
    netCashFlow,
  };
}

export function generateInvoiceNumber(prefix: string, seq: number, dateStr?: string): string {
  const cleanPrefix = (prefix || 'NZ').replace(/[^a-zA-Z0-9-]/g, '').toUpperCase() || 'NZ';
  const year =
    dateStr && /^[0-9]{4}/.test(dateStr) ? dateStr.slice(0, 4) : String(new Date().getFullYear());
  return `${cleanPrefix}-INV-${year}-${String(seq).padStart(3, '0')}`;
}
