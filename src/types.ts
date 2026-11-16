export type AppTab =
  | 'dashboard'
  | 'customers'
  | 'invoices'
  | 'calculator'
  | 'expenses'
  | 'payments'
  | 'pnl'
  | 'reports'
  | 'settings';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export type PaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque';

export type ExpenseCategory =
  | 'Rent'
  | 'Electricity'
  | 'Salary'
  | 'Transport'
  | 'Tools'
  | 'Miscellaneous';

export type ExpensePaymentMode = 'Cash' | 'UPI' | 'Bank Transfer';

export type MaterialCategory =
  | 'Mosquito Mesh'
  | 'Aluminium Frame'
  | 'Accessories'
  | 'Blinds & Curtains'
  | 'Security Door'
  | 'Other Materials';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent',
  'Electricity',
  'Salary',
  'Transport',
  'Tools',
  'Miscellaneous',
];

export const EXPENSE_PAYMENT_MODES: ExpensePaymentMode[] = [
  'Cash',
  'UPI',
  'Bank Transfer',
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'UPI',
  'Bank Transfer',
  'Cheque',
];

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  'Mosquito Mesh',
  'Aluminium Frame',
  'Accessories',
  'Blinds & Curtains',
  'Security Door',
  'Other Materials',
];

export type InvoiceStatus = 'active' | 'voided';

export const MATERIAL_UNITS = ['sq.ft', 'r.ft', 'nos', 'set', 'mtr', 'kg', 'roll'];

export const PRODUCT_UNITS = [
  'sq ft',
  'pieces',
  'metres',
  'units',
  'r.ft',
  'set',
  'kg',
  'roll',
];

export interface BusinessSettings {
  ownerId: string;
  businessName: string;
  address: string;
  phone: string;
  email: string;
  invoicePrefix: string;
  currencySymbol: string;
  currencyCode: string;
  nextInvoiceSeq: number;
  logoUrl?: string;
  logoWhiteUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Customer {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  address: string;
  pincode: string;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InvoiceItem {
  id?: string;
  order?: number;
  description: string;
  sqFeet: number;
  unit?: string;
  quantity?: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  ownerId: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerPincode: string;
  workSiteAddress?: string;
  itemCount?: number;
  items?: InvoiceItem[];
  subtotal: number;
  discount: number;
  labourCharges?: number;
  transportCharges?: number;
  total: number;
  advancePaid: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus: PaymentStatus;
  status?: InvoiceStatus;
  voidReason?: string;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MaterialLine {
  category: MaterialCategory;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

export interface JobCosting {
  id: string;
  ownerId: string;
  jobTitle: string;
  date: string; // YYYY-MM-DD
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string;
  estimatedSellingPrice: number;
  materials: MaterialLine[];
  totalMaterialCost: number;
  labourCost: number;
  transportCost: number;
  installationCost: number;
  otherJobCost: number;
  totalJobCost: number;
  estimatedProfit: number;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Expense {
  id: string;
  ownerId: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMode: ExpensePaymentMode;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Payment {
  id: string;
  ownerId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  date: string; // YYYY-MM-DD
  amount: number;
  method: PaymentMethod;
  isAdvance: boolean;
  reference: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MonthlyPnLSummary {
  month: string; // YYYY-MM
  invoicedSales: number;
  invoicedCount: number;
  totalDiscounts: number;
  cashCollected: number;
  advanceCollected: number;
  balanceCollected: number;
  paymentCount: number;
  monthPendingReceivables: number;
  totalOutstandingReceivables: number;
  materialCosts: number;
  labourCosts: number;
  jobTransportCosts: number;
  installationCosts: number;
  otherJobCosts: number;
  totalDirectJobCosts: number;
  grossProfit: number;
  operatingExpensesByCategory: Record<ExpenseCategory, number>;
  totalOperatingExpenses: number;
  totalAllCosts: number;
  netProfitAccrual: number;
  netProfitMarginPct: number;
  netCashFlow: number;
}
