import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FilePlus2,
  History,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  PAYMENT_METHODS,
  type BusinessSettings,
  type Customer,
  type Invoice,
  type InvoiceItem,
  type Payment,
  type PaymentMethod,
} from '../types';
import {
  BLUEPRINT_LIMITS,
  calculateInvoiceTotals,
  formatCurrency,
  formatDisplayDate,
  generateInvoiceNumber,
  isInvoiceActive,
  round2,
  todayISO,
} from '../utils/format';
import {
  createNormalInvoice,
  deleteInvoiceAndPayments,
  getInvoiceItems,
  updateNormalInvoice,
  voidNormalInvoice,
} from '../services/firestoreService';
import { downloadInvoicePDF } from '../utils/pdf';
import { useBrandLogos } from '../hooks/useBrandLogos';
import { ConfirmDialog } from './ConfirmDialog';

interface InvoicesProps {
  uid: string;
  invoices: Invoice[];
  customers: Customer[];
  payments: Payment[];
  settings: BusinessSettings;
  onNotify: (message: string, type?: 'success' | 'error') => void;
  onGoToCustomers: () => void;
  newInvoiceSignal?: number;
}

interface DraftMaterialRow {
  description: string;
  sqFeetInput: string;
  rateInput: string;
  unit?: string;
}

const STEPS = [
  { id: 1, title: 'Customer', subtitle: 'Customer & site details' },
  { id: 2, title: 'Materials', subtitle: 'Material, Sq. Feet & rate' },
  { id: 3, title: 'Charges', subtitle: 'Discount, labour & advance' },
  { id: 4, title: 'Review', subtitle: 'Check totals & preview' },
  { id: 5, title: 'Save & PDF', subtitle: 'Save invoice & download' },
] as const;

const createEmptyDraftRow = (description = ''): DraftMaterialRow => ({
  description,
  sqFeetInput: '1',
  rateInput: '0',
  unit: 'sq ft',
});

function sanitizeDecimalInput(raw: string): string {
  // Strip any minus signs or invalid characters; allow positive decimals like 12.5
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function parseNonNegative(raw: string): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return 0;
  return round2(num);
}

export function Invoices({
  uid,
  invoices,
  customers,
  payments,
  settings,
  onNotify,
  onGoToCustomers,
  newInvoiceSignal = 0,
}: InvoicesProps) {
  const [workspaceTab, setWorkspaceTab] = useState<'editor' | 'history'>('editor');
  const [step, setStep] = useState<number>(1);

  // History Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [recordFilter, setRecordFilter] = useState<'all' | 'active' | 'voided'>('all');
  const [monthFilter, setMonthFilter] = useState('');

  // Active Editing / Draft State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState(() =>
    generateInvoiceNumber(settings.invoicePrefix, settings.nextInvoiceSeq || 1, todayISO())
  );
  const [numberEditedManually, setNumberEditedManually] = useState(false);
  const [date, setDate] = useState(todayISO());

  // Step 1: Customer & Work Site Fields
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPincode, setCustomerPincode] = useState('');
  const [saveToCustomers, setSaveToCustomers] = useState(false);
  const [workSiteAddress, setWorkSiteAddress] = useState('');

  // Step 2: Material Line Items (Sq. Feet based)
  const [rows, setRows] = useState<DraftMaterialRow[]>([
    {
      description: 'Mosquito Mesh',
      sqFeetInput: '1',
      rateInput: '0',
      unit: 'sq ft',
    },
  ]);

  // Step 3: Charges, Discount & Advance Payment
  const [discount, setDiscount] = useState('0');
  const [labourCharges, setLabourCharges] = useState('0');
  const [transportCharges, setTransportCharges] = useState('0');
  const [advancePaid, setAdvancePaid] = useState('0');
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>('Cash');
  const [advanceReference, setAdvanceReference] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  // Preview, Void & Delete Confirmation Modals
  const [previewData, setPreviewData] = useState<{
    invoice: Invoice;
    items: InvoiceItem[];
    isDraft: boolean;
  } | null>(null);
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { originalLogoSrc } = useBrandLogos(settings);
  const sym = settings.currencySymbol || '₹';

  const editingInvoice = useMemo(
    () => (editingId ? invoices.find((i) => i.id === editingId) || null : null),
    [editingId, invoices]
  );

  // Sync auto-generated invoice number for untouched drafts
  useEffect(() => {
    if (!editingId && !numberEditedManually) {
      setInvoiceNumber(
        generateInvoiceNumber(settings.invoicePrefix, settings.nextInvoiceSeq || 1, date)
      );
    }
  }, [editingId, numberEditedManually, settings.invoicePrefix, settings.nextInvoiceSeq, date]);

  // Reset to a fresh Step 1 invoice when Dashboard "Create Invoice" triggers a signal
  useEffect(() => {
    if (newInvoiceSignal > 0) {
      resetToNewInvoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newInvoiceSignal]);

  const parsedItems: InvoiceItem[] = useMemo(
    () =>
      rows.map((r, idx) => {
        const sqFeet = parseNonNegative(r.sqFeetInput);
        const unitPrice = parseNonNegative(r.rateInput);
        return {
          order: idx,
          description: r.description,
          sqFeet,
          unit: r.unit || 'sq ft',
          unitPrice,
          lineTotal: round2(sqFeet * unitPrice),
        };
      }),
    [rows]
  );

  const liveTotals = useMemo(() => {
    const paidBase = editingInvoice ? editingInvoice.paidAmount : parseNonNegative(advancePaid);
    return calculateInvoiceTotals(
      parsedItems,
      parseNonNegative(discount),
      paidBase,
      parseNonNegative(labourCharges),
      parseNonNegative(transportCharges)
    );
  }, [parsedItems, discount, labourCharges, transportCharges, advancePaid, editingInvoice]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...invoices]
      .sort((a, b) => b.date.localeCompare(a.date) || b.invoiceNumber.localeCompare(a.invoiceNumber))
      .filter((inv) => {
        const active = isInvoiceActive(inv);
        if (recordFilter === 'active' && !active) return false;
        if (recordFilter === 'voided' && active) return false;
        if (statusFilter !== 'all' && inv.paymentStatus !== statusFilter) return false;
        if (monthFilter && !inv.date.startsWith(monthFilter)) return false;
        if (
          q &&
          !inv.invoiceNumber.toLowerCase().includes(q) &&
          !inv.customerName.toLowerCase().includes(q) &&
          !inv.customerPhone.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
  }, [invoices, search, statusFilter, recordFilter, monthFilter]);

  const handleSelectSavedCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    if (!custId) {
      setSaveToCustomers(false);
      return;
    }
    const found = customers.find((c) => c.id === custId);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone);
      setCustomerAddress(found.address);
      setCustomerPincode(found.pincode || '');
      setSaveToCustomers(false);
    }
  };

  const resetToNewInvoice = (seqOverride?: number) => {
    const nextDate = todayISO();
    setEditingId(null);
    setNumberEditedManually(false);
    setInvoiceNumber(
      generateInvoiceNumber(
        settings.invoicePrefix,
        seqOverride ?? (settings.nextInvoiceSeq || 1),
        nextDate
      )
    );
    setDate(nextDate);
    setSelectedCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerPincode('');
    setSaveToCustomers(false);
    setWorkSiteAddress('');
    setRows([createEmptyDraftRow('Mosquito Mesh')]);
    setDiscount('0');
    setLabourCharges('0');
    setTransportCharges('0');
    setAdvancePaid('0');
    setAdvanceMethod('Cash');
    setAdvanceReference('');
    setNotes('');
    setStep(1);
    setWorkspaceTab('editor');
  };

  const handleEditInvoice = async (inv: Invoice) => {
    if (!isInvoiceActive(inv)) {
      onNotify('Voided invoices cannot be edited. You can preview or download PDF.', 'error');
      return;
    }
    setLoadingInvoiceId(inv.id);
    try {
      const loadedItems = await getInvoiceItems(uid, inv);
      setEditingId(inv.id);
      setNumberEditedManually(true);
      setInvoiceNumber(inv.invoiceNumber);
      setDate(inv.date);
      setSelectedCustomerId(inv.customerId || '');
      setCustomerName(inv.customerName);
      setCustomerPhone(inv.customerPhone);
      setCustomerAddress(inv.customerAddress);
      setCustomerPincode(inv.customerPincode || '');
      setSaveToCustomers(false);
      setWorkSiteAddress(inv.workSiteAddress || '');
      setRows(
        loadedItems.length > 0
          ? loadedItems.map((it) => ({
              description: it.description,
              sqFeetInput: String(it.sqFeet ?? it.quantity ?? 1),
              rateInput: String(it.unitPrice ?? 0),
              unit: it.unit || 'sq ft',
            }))
          : [createEmptyDraftRow()]
      );
      setDiscount(String(inv.discount || 0));
      setLabourCharges(String(inv.labourCharges || 0));
      setTransportCharges(String(inv.transportCharges || 0));
      setAdvancePaid(String(inv.advancePaid || 0));
      setNotes(inv.notes || '');
      setStep(1);
      setWorkspaceTab('editor');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to load invoice items.', 'error');
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const handleRowChange = (
    idx: number,
    field: 'description' | 'sqFeetInput' | 'rateInput',
    value: string
  ) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (field === 'description') return { ...row, description: value };
        if (field === 'sqFeetInput') return { ...row, sqFeetInput: sanitizeDecimalInput(value) };
        return { ...row, rateInput: sanitizeDecimalInput(value) };
      })
    );
  };

  const addMaterialRow = () => {
    if (rows.length >= BLUEPRINT_LIMITS.maxItems) {
      onNotify(`Maximum ${BLUEPRINT_LIMITS.maxItems} material rows per invoice.`, 'error');
      return;
    }
    setRows((prev) => [...prev, createEmptyDraftRow()]);
  };

  const removeMaterialRow = (idx: number) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const buildDraftPreview = (): { invoice: Invoice; items: InvoiceItem[]; isDraft: boolean } => {
    const cleanPincode = customerPincode.replace(/\D/g, '').slice(0, 6);
    const inv: Invoice = {
      id: editingInvoice?.id || 'draft-preview',
      ownerId: uid,
      invoiceNumber: invoiceNumber.trim() || 'DRAFT',
      date,
      customerId: selectedCustomerId,
      customerName: customerName.trim() || 'Customer',
      customerPhone: customerPhone.trim() || '-',
      customerAddress: customerAddress.trim() || '-',
      customerPincode: cleanPincode,
      workSiteAddress: workSiteAddress.trim(),
      itemCount: liveTotals.items.length,
      items: liveTotals.items,
      subtotal: liveTotals.subtotal,
      discount: liveTotals.discount,
      labourCharges: liveTotals.labourCharges,
      transportCharges: liveTotals.transportCharges,
      total: liveTotals.total,
      advancePaid: editingInvoice ? editingInvoice.advancePaid : parseNonNegative(advancePaid),
      paidAmount: liveTotals.paidAmount,
      balanceDue: liveTotals.balanceDue,
      paymentStatus: liveTotals.paymentStatus,
      status: editingInvoice?.status || 'active',
      voidReason: editingInvoice?.voidReason || '',
      notes: notes.trim(),
    };
    return { invoice: inv, items: liveTotals.items, isDraft: !editingInvoice };
  };

  const validateStep = (targetStep: number): boolean => {
    if (targetStep === 1) {
      if (!invoiceNumber.trim()) {
        onNotify('Please enter an invoice number.', 'error');
        return false;
      }
      if (!date || !BLUEPRINT_LIMITS.datePattern.test(date)) {
        onNotify('Please select a valid invoice date.', 'error');
        return false;
      }
      if (!customerName.trim() || customerPhone.trim().length < 5 || !customerAddress.trim()) {
        onNotify('Please enter customer name, phone number, and address.', 'error');
        return false;
      }
      if (customerPincode.trim() && !BLUEPRINT_LIMITS.pincodePattern.test(customerPincode.trim())) {
        onNotify('Pincode must be 6 digits (or leave blank).', 'error');
        return false;
      }
      if (
        saveToCustomers &&
        !selectedCustomerId &&
        !BLUEPRINT_LIMITS.pincodePattern.test(customerPincode.trim())
      ) {
        onNotify('To save customer to directory, please enter a 6-digit pincode.', 'error');
        return false;
      }
    }

    if (targetStep === 2) {
      if (rows.length === 0) {
        onNotify('Please add at least one material row.', 'error');
        return false;
      }
      const badRow = rows.find((r) => {
        const sqft = parseNonNegative(r.sqFeetInput);
        const rate = parseNonNegative(r.rateInput);
        return !r.description.trim() || sqft <= 0 || rate < 0;
      });
      if (badRow) {
        onNotify(
          'Each material row needs a material name, positive Sq. Feet, and a valid Rate / Sq. Ft.',
          'error'
        );
        return false;
      }
    }

    if (targetStep === 3) {
      if (parseNonNegative(discount) > liveTotals.subtotal) {
        onNotify('Discount cannot be higher than the material subtotal.', 'error');
        return false;
      }
      if (!editingInvoice && parseNonNegative(advancePaid) > liveTotals.total) {
        onNotify('Advance paid cannot exceed the Grand Total.', 'error');
        return false;
      }
    }

    return true;
  };

  const validateAllBeforeSave = (): boolean => {
    if (!validateStep(1)) {
      setStep(1);
      return false;
    }
    if (!validateStep(2)) {
      setStep(2);
      return false;
    }
    if (!validateStep(3)) {
      setStep(3);
      return false;
    }
    return true;
  };

  const goNextStep = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(5, s + 1));
  };

  const handleSaveInvoice = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!validateAllBeforeSave()) return;

    setSaving(true);
    try {
      if (editingInvoice) {
        await updateNormalInvoice(uid, editingInvoice, {
          date,
          customerId: selectedCustomerId,
          customerName,
          customerPhone,
          customerAddress,
          customerPincode: customerPincode.trim(),
          workSiteAddress,
          items: parsedItems,
          discount: parseNonNegative(discount),
          labourCharges: parseNonNegative(labourCharges),
          transportCharges: parseNonNegative(transportCharges),
          notes,
        });
        onNotify(`Invoice ${editingInvoice.invoiceNumber} updated successfully.`, 'success');
      } else {
        const res = await createNormalInvoice(uid, {
          invoiceNumber: invoiceNumber.trim(),
          invoicePrefix: settings.invoicePrefix,
          autoAssignIfDuplicate: !numberEditedManually,
          date,
          customerId: selectedCustomerId,
          customerName,
          customerPhone,
          customerAddress,
          customerPincode: customerPincode.trim(),
          saveToCustomers,
          workSiteAddress,
          items: parsedItems,
          discount: parseNonNegative(discount),
          labourCharges: parseNonNegative(labourCharges),
          transportCharges: parseNonNegative(transportCharges),
          advancePaid: parseNonNegative(advancePaid),
          advanceMethod,
          advanceReference,
          notes,
        });
        // Keep saved invoice bound to editingId so re-saving updates rather than duplicating
        setEditingId(res.invoiceId);
        setInvoiceNumber(res.invoiceNumber);
        setNumberEditedManually(true);
        if (res.customerId) {
          setSelectedCustomerId(res.customerId);
        }
        setSaveToCustomers(false);
        onNotify(`Invoice ${res.invoiceNumber} saved! You can now download its PDF.`, 'success');
      }
      setStep(5);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save invoice.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewCurrent = () => {
    setPreviewData(buildDraftPreview());
  };

  const handlePreviewExisting = async (inv: Invoice) => {
    setLoadingInvoiceId(inv.id);
    try {
      const loadedItems = await getInvoiceItems(uid, inv);
      setPreviewData({ invoice: inv, items: loadedItems, isDraft: false });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load invoice items.', 'error');
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const handleDownloadCurrentPDF = async () => {
    const draft = buildDraftPreview();
    try {
      await downloadInvoicePDF(draft.invoice, settings, draft.items);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to generate PDF.', 'error');
    }
  };

  const handleDownloadExistingPDF = async (inv: Invoice) => {
    setLoadingInvoiceId(inv.id);
    try {
      const loadedItems = await getInvoiceItems(uid, inv);
      await downloadInvoicePDF(inv, settings, loadedItems);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to generate PDF.', 'error');
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const triggerPrintWithLogoReady = () => {
    if (originalLogoSrc) {
      const img = new Image();
      img.onload = () => {
        setTimeout(() => window.print(), 120);
      };
      img.onerror = () => {
        setTimeout(() => window.print(), 120);
      };
      img.src = originalLogoSrc;
    } else {
      setTimeout(() => window.print(), 160);
    }
  };

  const handlePrintCurrent = () => {
    setPreviewData(buildDraftPreview());
    triggerPrintWithLogoReady();
  };

  const handlePrintExisting = async (inv: Invoice) => {
    setLoadingInvoiceId(inv.id);
    try {
      const loadedItems = await getInvoiceItems(uid, inv);
      setPreviewData({ invoice: inv, items: loadedItems, isDraft: false });
      triggerPrintWithLogoReady();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to prepare print view.', 'error');
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const handleConfirmVoid = async (e: FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidNormalInvoice(voidTarget.id, voidReason);
      if (editingId === voidTarget.id) {
        resetToNewInvoice();
      }
      if (previewData?.invoice.id === voidTarget.id) {
        setPreviewData(null);
      }
      onNotify(
        `Invoice ${voidTarget.invoiceNumber} voided and excluded from sales totals.`,
        'success'
      );
      setVoidTarget(null);
      setVoidReason('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to void invoice.', 'error');
    } finally {
      setVoiding(false);
    }
  };

  const handleConfirmDeleteVoided = async () => {
    if (!deleteTarget) return;
    const linked = payments.filter((p) => p.invoiceId === deleteTarget.id);
    setDeleting(true);
    try {
      await deleteInvoiceAndPayments(uid, deleteTarget, linked);
      if (previewData?.invoice.id === deleteTarget.id) setPreviewData(null);
      onNotify(`Voided invoice ${deleteTarget.invoiceNumber} permanently deleted.`, 'success');
      setDeleteTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete invoice.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const preventInvalidNumberKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['-', '+', 'e', 'E'].includes(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Switcher Bar */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#DCE4EF] rounded-xl p-3.5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#E8EFF8] rounded-lg">
          <button
            type="button"
            onClick={() => setWorkspaceTab('editor')}
            className={`min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer ${
              workspaceTab === 'editor'
                ? 'bg-[#0B1F3A] text-white'
                : 'text-[#172338] hover:bg-white/70'
            }`}
          >
            <FilePlus2 className="w-4 h-4" />
            <span>{editingInvoice ? `Editing ${editingInvoice.invoiceNumber}` : 'Create Invoice'}</span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceTab('history')}
            className={`min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors cursor-pointer ${
              workspaceTab === 'history'
                ? 'bg-[#0B1F3A] text-white'
                : 'text-[#172338] hover:bg-white/70'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Invoice History ({invoices.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => resetToNewInvoice()}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#0B1F3A] bg-[#E8EFF8] hover:bg-[#DCE4EF] rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Invoice</span>
          </button>
        </div>
      </div>

      {/* 5-STEP NORMAL INVOICE WORKSPACE */}
      {workspaceTab === 'editor' && (
        <form onSubmit={handleSaveInvoice} className="no-print space-y-5">
          {/* Stepper Navigation + Live Running Total */}
          <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 sm:p-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)] space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-[#0B1F3A]">
                  {editingInvoice
                    ? `Invoice ${editingInvoice.invoiceNumber}`
                    : `New Invoice · ${invoiceNumber}`}
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Follow the 5 simple steps below to create a Normal Invoice (without GST).
                </p>
              </div>
              <div className="flex items-center gap-4 bg-[#F4F7FB] border border-[#DCE4EF] rounded-lg px-4 py-2.5">
                <div>
                  <span className="block text-[11px] text-[#64748B]">Grand Total</span>
                  <span className="text-base font-bold font-mono-num text-[#0B1F3A]">
                    {formatCurrency(liveTotals.total, sym)}
                  </span>
                </div>
                <div className="h-7 w-px bg-[#DCE4EF]" />
                <div>
                  <span className="block text-[11px] text-[#64748B]">Balance Due</span>
                  <span className="text-base font-semibold font-mono-num text-[#D99722]">
                    {formatCurrency(liveTotals.balanceDue, sym)}
                  </span>
                </div>
              </div>
            </div>

            {/* 5 Steps Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {STEPS.map((st) => {
                const isActive = step === st.id;
                const isCompleted = step > st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStep(st.id)}
                    className={`min-h-[52px] text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer flex items-start gap-2.5 ${
                      isActive
                        ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                        : isCompleted
                        ? 'bg-[#E8EFF8] text-[#0B1F3A] border-[#CBD8E8] hover:bg-[#DCE4EF]'
                        : 'bg-white text-[#64748B] border-[#DCE4EF] hover:bg-[#F4F7FB]'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
                        isActive
                          ? 'bg-white text-[#0B1F3A]'
                          : isCompleted
                          ? 'bg-[#16805D] text-white'
                          : 'bg-[#F4F7FB] text-[#64748B]'
                      }`}
                    >
                      {isCompleted ? <Check className="w-3 h-3" /> : st.id}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold truncate">
                        {st.title}
                      </span>
                      <span
                        className={`block text-[11px] truncate ${
                          isActive ? 'text-[#CBD8E8]' : 'text-[#64748B]'
                        }`}
                      >
                        {st.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 1: CUSTOMER & INVOICE DETAILS */}
          {step === 1 && (
            <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 sm:p-6 space-y-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DCE4EF]">
                <div>
                  <h3 className="text-base font-semibold text-[#0B1F3A]">
                    Step 1: Customer &amp; Invoice Details
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Pick an existing customer or type new customer details below.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleSelectSavedCustomer(e.target.value)}
                    className="min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-[#F4F7FB] focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  >
                    <option value="">-- Pick Saved Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                  {customers.length === 0 && (
                    <button
                      type="button"
                      onClick={onGoToCustomers}
                      className="text-xs font-medium text-[#163A63] hover:text-[#0B1F3A] whitespace-nowrap cursor-pointer"
                    >
                      Add Customer
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingInvoice)}
                    maxLength={BLUEPRINT_LIMITS.maxInvoiceNumber}
                    value={invoiceNumber}
                    onChange={(e) => {
                      setInvoiceNumber(e.target.value);
                      setNumberEditedManually(true);
                    }}
                    placeholder="NZ-INV-2026-001"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#0B1F3A] font-medium border border-[#DCE4EF] rounded-lg disabled:bg-[#F4F7FB] focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Invoice Date *
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
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={BLUEPRINT_LIMITS.maxName}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Sundaramoorthy R"
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    minLength={5}
                    maxLength={BLUEPRINT_LIMITS.maxPhone}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 98400 12345"
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Customer Address *
                  </label>
                  <textarea
                    required
                    rows={2}
                    maxLength={BLUEPRINT_LIMITS.maxAddress}
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Door no, street, area, city, Tamil Nadu"
                    className="w-full px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Pincode (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={customerPincode}
                    onChange={(e) =>
                      setCustomerPincode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="e.g. 600042"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Work Site Address (Optional)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.maxAddress}
                  value={workSiteAddress}
                  onChange={(e) => setWorkSiteAddress(e.target.value)}
                  placeholder="Enter installation site address only if different from above"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
              </div>

              {!editingInvoice && !selectedCustomerId && (
                <label className="inline-flex items-center gap-2.5 text-xs text-[#172338] cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={saveToCustomers}
                    onChange={(e) => setSaveToCustomers(e.target.checked)}
                    className="w-4 h-4 rounded border-[#DCE4EF] text-[#0B1F3A] focus:ring-[#163A63]"
                  />
                  <span>Also save this customer to Customer Directory (requires 6-digit pincode)</span>
                </label>
              )}

              <div className="pt-3 border-t border-[#DCE4EF] flex justify-end">
                <button
                  type="button"
                  onClick={goNextStep}
                  className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <span>Next: Add Materials &amp; Sq. Feet</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MATERIALS & SQ. FEET PRODUCT TABLE */}
          {step === 2 && (
            <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
              <div className="px-5 py-4 border-b border-[#DCE4EF] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F4F7FB]">
                <div>
                  <h3 className="text-base font-semibold text-[#0B1F3A]">
                    Step 2: Materials &amp; Sq. Feet ({rows.length} item{rows.length === 1 ? '' : 's'})
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Total = Sq. Feet × Rate / Sq. Ft. Decimal values like 12.5 sq. ft. are supported.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addMaterialRow}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <span>+ Add Material</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#DCE4EF] text-xs text-[#64748B] bg-white">
                      <th className="text-left font-medium px-4 py-3 min-w-[220px]">
                        Material Name
                      </th>
                      <th className="text-right font-medium px-3 py-3 w-36">
                        Sq. Feet
                      </th>
                      <th className="text-right font-medium px-3 py-3 w-40">
                        Rate / Sq. Ft. ({sym})
                      </th>
                      <th className="text-right font-medium px-4 py-3 w-36">
                        Total ({sym})
                      </th>
                      <th className="text-center font-medium px-3 py-3 w-24">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE4EF]/70">
                    {rows.map((row, idx) => {
                      const sqFeet = parseNonNegative(row.sqFeetInput);
                      const rate = parseNonNegative(row.rateInput);
                      const lineTotal = round2(sqFeet * rate);
                      return (
                        <tr key={idx} className="hover:bg-[#F4F7FB]/60">
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              required
                              list="netzone-product-suggestions"
                              maxLength={200}
                              value={row.description}
                              onChange={(e) =>
                                handleRowChange(idx, 'description', e.target.value)
                              }
                              placeholder="e.g. Mosquito Mesh, Aluminium Frame"
                              className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              required
                              min="0.01"
                              step="any"
                              inputMode="decimal"
                              onKeyDown={preventInvalidNumberKey}
                              value={row.sqFeetInput}
                              onChange={(e) =>
                                handleRowChange(idx, 'sqFeetInput', e.target.value)
                              }
                              placeholder="e.g. 120 or 12.5"
                              className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-right text-[#172338] border border-[#DCE4EF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              required
                              min="0"
                              step="any"
                              inputMode="decimal"
                              onKeyDown={preventInvalidNumberKey}
                              value={row.rateInput}
                              onChange={(e) =>
                                handleRowChange(idx, 'rateInput', e.target.value)
                              }
                              placeholder="e.g. 45"
                              className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-right text-[#172338] border border-[#DCE4EF] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num font-semibold text-[#0B1F3A] whitespace-nowrap">
                            {formatCurrency(lineTotal, sym)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              disabled={rows.length <= 1}
                              onClick={() => removeMaterialRow(idx)}
                              title="Remove material row"
                              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center px-2.5 py-2 text-xs font-medium text-[#D64545] bg-[#D64545]/10 hover:bg-[#D64545]/20 disabled:opacity-30 disabled:bg-transparent disabled:text-[#64748B] rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <datalist id="netzone-product-suggestions">
                  <option value="Mosquito Mesh" />
                  <option value="Pleated Mosquito Mesh" />
                  <option value="Aluminium Frame" />
                  <option value="Security Door" />
                  <option value="Window Accessories" />
                  <option value="Roller Blinds" />
                  <option value="Curtain Track & Fittings" />
                </datalist>
              </div>

              <div className="px-5 py-4 bg-[#F4F7FB] border-t border-[#DCE4EF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-sm text-[#172338]">
                  Materials Subtotal:{' '}
                  <strong className="font-mono-num text-[#0B1F3A] text-base">
                    {formatCurrency(liveTotals.subtotal, sym)}
                  </strong>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#DCE4EF] hover:bg-[#E8EFF8] text-[#0B1F3A] text-sm font-medium rounded-lg cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={goNextStep}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg cursor-pointer"
                  >
                    <span>Next: Charges &amp; Advance</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: OPTIONAL DISCOUNT, LABOUR, TRANSPORT & ADVANCE PAYMENT */}
          {step === 3 && (
            <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 sm:p-6 space-y-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
              <div className="pb-3 border-b border-[#DCE4EF]">
                <h3 className="text-base font-semibold text-[#0B1F3A]">
                  Step 3: Optional Charges &amp; Advance Payment
                </h3>
                <p className="text-xs text-[#64748B]">
                  Leave any field at 0 if it does not apply. Grand Total updates automatically.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Discount ({sym}) — Optional
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    onKeyDown={preventInvalidNumberKey}
                    value={discount}
                    onChange={(e) => setDiscount(sanitizeDecimalInput(e.target.value))}
                    placeholder="0"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Labour / Installation ({sym}) — Optional
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    onKeyDown={preventInvalidNumberKey}
                    value={labourCharges}
                    onChange={(e) => setLabourCharges(sanitizeDecimalInput(e.target.value))}
                    placeholder="0"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#172338] mb-1">
                    Transport Charges ({sym}) — Optional
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    onKeyDown={preventInvalidNumberKey}
                    value={transportCharges}
                    onChange={(e) => setTransportCharges(sanitizeDecimalInput(e.target.value))}
                    placeholder="0"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                  />
                </div>
              </div>

              {!editingInvoice ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-[#DCE4EF]">
                  <div>
                    <label className="block text-xs font-medium text-[#172338] mb-1">
                      Advance Paid ({sym}) — Optional
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      onKeyDown={preventInvalidNumberKey}
                      value={advancePaid}
                      onChange={(e) => setAdvancePaid(sanitizeDecimalInput(e.target.value))}
                      placeholder="0"
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono-num text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#172338] mb-1">
                      Payment Mode
                    </label>
                    <select
                      value={advanceMethod}
                      onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)}
                      className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg bg-white"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#172338] mb-1">
                      Payment Reference (Optional)
                    </label>
                    <input
                      type="text"
                      maxLength={BLUEPRINT_LIMITS.maxReference}
                      value={advanceReference}
                      onChange={(e) => setAdvanceReference(e.target.value)}
                      placeholder="e.g. GPay / Receipt #"
                      className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-[#F4F7FB] border border-[#DCE4EF] rounded-lg text-xs text-[#64748B]">
                  Payments collected so far:{' '}
                  <strong className="font-mono-num text-[#16805D]">
                    {formatCurrency(editingInvoice.paidAmount, sym)}
                  </strong>
                  . To add another payment later, use the Payments page so receipts are never double-counted.
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Invoice Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.maxNotes}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Mesh warranty, frame colour, installation date..."
                  className="w-full px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
              </div>

              <div className="pt-3 border-t border-[#DCE4EF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-sm text-[#172338]">
                  Grand Total:{' '}
                  <strong className="font-mono-num text-[#0B1F3A] text-base">
                    {formatCurrency(liveTotals.total, sym)}
                  </strong>{' '}
                  <span className="text-[#64748B] mx-2">·</span>
                  Balance Due:{' '}
                  <strong className="font-mono-num text-[#D99722] text-base">
                    {formatCurrency(liveTotals.balanceDue, sym)}
                  </strong>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#DCE4EF] hover:bg-[#E8EFF8] text-[#0B1F3A] text-sm font-medium rounded-lg cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={goNextStep}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg cursor-pointer"
                  >
                    <span>Next: Review &amp; Preview</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW TOTALS & BALANCE + PREVIEW */}
          {step === 4 && (
            <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 sm:p-6 space-y-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#DCE4EF]">
                <div>
                  <h3 className="text-base font-semibold text-[#0B1F3A]">
                    Step 4: Review Invoice Summary
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Verify customer details, Sq. Feet calculations, and balance before saving.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePreviewCurrent}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-[#0B1F3A] bg-[#E8EFF8] hover:bg-[#DCE4EF] rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview A4 Invoice</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#F4F7FB] border border-[#DCE4EF] rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {originalLogoSrc && (
                    <div className="bg-white border border-[#DCE4EF] rounded-lg p-1.5 shrink-0">
                      <img
                        src={originalLogoSrc}
                        alt={settings.businessName || 'Company logo'}
                        className="h-11 w-auto max-w-[110px] object-contain"
                      />
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-[#64748B]">
                      Invoice &amp; Date
                    </p>
                    <p className="text-sm font-semibold font-mono-num text-[#0B1F3A] mt-1">
                      {invoiceNumber}
                    </p>
                    <p className="text-xs text-[#64748B] mt-0.5">{formatDisplayDate(date)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-[#64748B]">
                    Customer Details
                  </p>
                  <p className="text-sm font-semibold text-[#0B1F3A] mt-1">
                    {customerName || 'Not entered'}
                  </p>
                  <p className="text-xs text-[#172338] mt-0.5">{customerPhone || '-'}</p>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    {customerAddress || '-'}
                    {customerPincode ? ` - ${customerPincode}` : ''}
                  </p>
                </div>
              </div>

              <div className="border border-[#DCE4EF] rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#0B1F3A] text-white text-xs">
                      <th className="text-left font-medium px-4 py-2.5">Material Name</th>
                      <th className="text-right font-medium px-4 py-2.5">Sq. Feet</th>
                      <th className="text-right font-medium px-4 py-2.5">Rate / Sq. Ft.</th>
                      <th className="text-right font-medium px-4 py-2.5">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE4EF]/70">
                    {liveTotals.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2.5 text-[#172338]">{it.description}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num text-[#172338]">
                          {it.sqFeet}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-num text-[#172338]">
                          {formatCurrency(it.unitPrice, sym)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono-num font-semibold text-[#0B1F3A]">
                          {formatCurrency(it.lineTotal, sym)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <div className="w-full max-w-sm bg-[#F4F7FB] border border-[#DCE4EF] rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between text-[#64748B]">
                    <span>Subtotal</span>
                    <span className="font-mono-num text-[#172338]">
                      {formatCurrency(liveTotals.subtotal, sym)}
                    </span>
                  </div>
                  {liveTotals.discount > 0 && (
                    <div className="flex justify-between text-[#64748B]">
                      <span>Discount</span>
                      <span className="font-mono-num text-[#172338]">
                        - {formatCurrency(liveTotals.discount, sym)}
                      </span>
                    </div>
                  )}
                  {liveTotals.labourCharges > 0 && (
                    <div className="flex justify-between text-[#64748B]">
                      <span>Labour / Installation</span>
                      <span className="font-mono-num text-[#172338]">
                        + {formatCurrency(liveTotals.labourCharges, sym)}
                      </span>
                    </div>
                  )}
                  {liveTotals.transportCharges > 0 && (
                    <div className="flex justify-between text-[#64748B]">
                      <span>Transport Charges</span>
                      <span className="font-mono-num text-[#172338]">
                        + {formatCurrency(liveTotals.transportCharges, sym)}
                      </span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-[#DCE4EF] flex justify-between font-bold text-base text-[#0B1F3A]">
                    <span>Grand Total</span>
                    <span className="font-mono-num">{formatCurrency(liveTotals.total, sym)}</span>
                  </div>
                  <div className="flex justify-between text-[#16805D]">
                    <span>{editingInvoice ? 'Total Paid' : 'Advance Paid'}</span>
                    <span className="font-mono-num">
                      {formatCurrency(liveTotals.paidAmount, sym)}
                    </span>
                  </div>
                  <div className="px-3 py-2 bg-[#E8EFF8] rounded-lg flex justify-between font-semibold text-[#0B1F3A]">
                    <span>Balance Due</span>
                    <span className="font-mono-num">
                      {formatCurrency(liveTotals.balanceDue, sym)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#DCE4EF] flex flex-wrap items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#DCE4EF] hover:bg-[#E8EFF8] text-[#0B1F3A] text-sm font-medium rounded-lg cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg cursor-pointer"
                >
                  <span>Next: Save &amp; Download PDF</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: SAVE INVOICE & DOWNLOAD PDF */}
          {step === 5 && (
            <div className="bg-white border border-[#DCE4EF] rounded-xl p-5 sm:p-6 space-y-5 shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
              <div className="pb-3 border-b border-[#DCE4EF]">
                <h3 className="text-base font-semibold text-[#0B1F3A]">
                  Step 5: Save Invoice &amp; Download PDF
                </h3>
                <p className="text-xs text-[#64748B]">
                  Save your invoice to update monthly sales once, then download or print the PDF anytime.
                </p>
              </div>

              {editingInvoice && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-[#16805D]/10 border border-[#16805D]/30">
                  <CheckCircle2 className="w-5 h-5 text-[#16805D] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">
                      Invoice {editingInvoice.invoiceNumber} is saved in your records
                    </p>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Downloading the PDF or printing will never create another invoice or duplicate sales.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#F4F7FB] border border-[#DCE4EF] rounded-xl p-4">
                <div>
                  <p className="text-xs text-[#64748B]">Customer</p>
                  <p className="mt-1 text-sm font-semibold text-[#0B1F3A]">
                    {customerName || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#64748B]">Grand Total</p>
                  <p className="mt-1 text-lg font-bold font-mono-num text-[#0B1F3A]">
                    {formatCurrency(liveTotals.total, sym)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#64748B]">Balance Due</p>
                  <p className="mt-1 text-lg font-bold font-mono-num text-[#D99722]">
                    {formatCurrency(liveTotals.balanceDue, sym)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[46px] inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#163A63] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {saving
                      ? 'Saving...'
                      : editingInvoice
                      ? 'Update Saved Invoice'
                      : 'Save Invoice'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handlePreviewCurrent}
                  className="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0B1F3A] bg-[#E8EFF8] hover:bg-[#DCE4EF] rounded-lg transition-colors cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview A4 Invoice</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCurrentPDF}
                  className="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0B1F3A] bg-white border border-[#DCE4EF] hover:bg-[#F4F7FB] rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintCurrent}
                  className="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0B1F3A] bg-white border border-[#DCE4EF] hover:bg-[#F4F7FB] rounded-lg transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </button>
              </div>

              <div className="pt-3 border-t border-[#DCE4EF] flex flex-wrap items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#DCE4EF] hover:bg-[#E8EFF8] text-[#0B1F3A] text-sm font-medium rounded-lg cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Review</span>
                </button>

                <button
                  type="button"
                  onClick={() => resetToNewInvoice()}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 bg-[#E8EFF8] hover:bg-[#DCE4EF] text-[#0B1F3A] text-sm font-medium rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Another Invoice</span>
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* INVOICE HISTORY WORKSPACE */}
      {workspaceTab === 'history' && (
        <div className="no-print space-y-4">
          {/* Search & Filters */}
          <div className="bg-white border border-[#DCE4EF] rounded-xl p-4 shadow-[0_1px_3px_rgba(11,31,58,0.05)] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 flex-1">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search invoice #, customer, phone..."
                  className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
              </div>

              <input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="min-h-[42px] px-3 py-2 text-sm text-[#172338] bg-white border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
              />

              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#E8EFF8] rounded-lg self-start">
                {(['all', 'unpaid', 'partial', 'paid'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                      statusFilter === st
                        ? 'bg-[#0B1F3A] text-white'
                        : 'text-[#172338] hover:bg-white/70'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#F4F7FB] border border-[#DCE4EF] rounded-lg self-start">
                {(['all', 'active', 'voided'] as const).map((rf) => (
                  <button
                    key={rf}
                    type="button"
                    onClick={() => setRecordFilter(rf)}
                    className={`min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                      recordFilter === rf
                        ? 'bg-[#163A63] text-white'
                        : 'text-[#64748B] hover:text-[#0B1F3A]'
                    }`}
                  >
                    {rf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* History List (Mobile Cards + Desktop Table) */}
          <div className="bg-white border border-[#DCE4EF] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(11,31,58,0.05)]">
            {filteredInvoices.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium text-[#0B1F3A]">
                  {invoices.length === 0 ? 'No invoices saved yet' : 'No matching invoices'}
                </p>
                <p className="mt-1 text-xs text-[#64748B]">
                  Create a normal invoice without GST, download single-invoice PDFs, and track
                  monthly income automatically.
                </p>
                {invoices.length === 0 && (
                  <button
                    type="button"
                    onClick={() => resetToNewInvoice()}
                    className="mt-4 min-h-[44px] px-4 py-2 bg-[#0B1F3A] hover:bg-[#163A63] text-white text-sm font-medium rounded-lg cursor-pointer"
                  >
                    Create First Invoice
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Card List */}
                <div className="md:hidden divide-y divide-[#DCE4EF]">
                  {filteredInvoices.map((inv) => {
                    const active = isInvoiceActive(inv);
                    const isLoadingRow = loadingInvoiceId === inv.id;
                    return (
                      <div
                        key={inv.id}
                        className={`p-4 space-y-3 ${!active ? 'bg-[#F4F7FB]/80 opacity-80' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono-num text-sm font-semibold text-[#0B1F3A]">
                              {inv.invoiceNumber}
                            </p>
                            <p className="text-sm font-medium text-[#172338] mt-0.5">
                              {inv.customerName}
                            </p>
                            <p className="text-xs text-[#64748B]">
                              {inv.customerPhone} · {formatDisplayDate(inv.date)}
                            </p>
                          </div>
                          <span
                            className={`text-xs font-semibold ${
                              !active
                                ? 'text-[#D64545]'
                                : inv.paymentStatus === 'paid'
                                ? 'text-[#16805D]'
                                : inv.paymentStatus === 'partial'
                                ? 'text-[#D99722]'
                                : 'text-[#D64545]'
                            }`}
                          >
                            {!active
                              ? 'Voided'
                              : inv.paymentStatus === 'paid'
                              ? 'Paid'
                              : inv.paymentStatus === 'partial'
                              ? 'Partial'
                              : 'Unpaid'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs bg-[#F4F7FB] rounded-lg p-2.5">
                          <div>
                            <span className="block text-[#64748B]">Total</span>
                            <span className="font-mono-num font-semibold text-[#0B1F3A]">
                              {formatCurrency(inv.total, sym)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[#64748B]">Paid</span>
                            <span className="font-mono-num font-medium text-[#16805D]">
                              {formatCurrency(inv.paidAmount, sym)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[#64748B]">Balance</span>
                            <span className="font-mono-num font-semibold text-[#D99722]">
                              {formatCurrency(inv.balanceDue, sym)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isLoadingRow}
                            onClick={() => handlePreviewExisting(inv)}
                            className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#E8EFF8] text-[#0B1F3A] rounded-lg cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </button>
                          <button
                            type="button"
                            disabled={isLoadingRow}
                            onClick={() => handleDownloadExistingPDF(inv)}
                            className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0B1F3A] text-white rounded-lg cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                          {active ? (
                            <>
                              <button
                                type="button"
                                disabled={isLoadingRow}
                                onClick={() => handleEditInvoice(inv)}
                                className="min-h-[40px] inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium border border-[#DCE4EF] text-[#172338] rounded-lg cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setVoidTarget(inv);
                                  setVoidReason('');
                                }}
                                className="min-h-[40px] inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-[#D64545] border border-[#D64545]/30 rounded-lg cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Void</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(inv)}
                              className="min-h-[40px] inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-[#D64545] border border-[#D64545]/30 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
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
                        <th className="text-left font-medium px-4 py-3">Invoice #</th>
                        <th className="text-left font-medium px-4 py-3">Customer</th>
                        <th className="text-left font-medium px-4 py-3">Date</th>
                        <th className="text-right font-medium px-4 py-3">Grand Total</th>
                        <th className="text-right font-medium px-4 py-3">Amount Paid</th>
                        <th className="text-right font-medium px-4 py-3">Balance Due</th>
                        <th className="text-left font-medium px-4 py-3">Status</th>
                        <th className="text-right font-medium px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE4EF]/60">
                      {filteredInvoices.map((inv) => {
                        const active = isInvoiceActive(inv);
                        const isLoadingRow = loadingInvoiceId === inv.id;
                        return (
                          <tr
                            key={inv.id}
                            className={`hover:bg-[#E8EFF8]/50 ${!active ? 'bg-[#F4F7FB]/70 opacity-75' : ''}`}
                          >
                            <td className="px-4 py-3 font-mono-num font-medium text-[#0B1F3A] whitespace-nowrap">
                              <span>{inv.invoiceNumber}</span>
                              {!active && (
                                <span className="block text-[11px] font-semibold text-[#D64545] uppercase">
                                  Voided
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[#172338]">
                              {inv.customerName}
                              <span className="block text-xs text-[#64748B]">
                                {inv.customerPhone}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono-num text-xs text-[#64748B] whitespace-nowrap">
                              {formatDisplayDate(inv.date)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num font-medium text-[#172338] whitespace-nowrap">
                              {formatCurrency(inv.total, sym)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num text-[#16805D] whitespace-nowrap">
                              {formatCurrency(inv.paidAmount, sym)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono-num text-[#D99722] font-medium whitespace-nowrap">
                              {formatCurrency(inv.balanceDue, sym)}
                            </td>
                            <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">
                              {!active ? (
                                <span className="text-[#D64545]">Voided</span>
                              ) : inv.paymentStatus === 'paid' ? (
                                <span className="text-[#16805D]">Paid</span>
                              ) : inv.paymentStatus === 'partial' ? (
                                <span className="text-[#D99722]">Partial</span>
                              ) : (
                                <span className="text-[#D64545]">Unpaid</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={isLoadingRow}
                                  onClick={() => handlePreviewExisting(inv)}
                                  title="Preview invoice"
                                  className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#0B1F3A] hover:bg-[#E8EFF8] rounded-md cursor-pointer disabled:opacity-40"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isLoadingRow}
                                  onClick={() => handleDownloadExistingPDF(inv)}
                                  title="Download Invoice PDF"
                                  className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#163A63] hover:bg-[#E8EFF8] rounded-md cursor-pointer disabled:opacity-40"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isLoadingRow}
                                  onClick={() => handlePrintExisting(inv)}
                                  title="Print invoice"
                                  className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#0B1F3A] hover:bg-[#E8EFF8] rounded-md cursor-pointer disabled:opacity-40"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                                {active ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isLoadingRow}
                                      onClick={() => handleEditInvoice(inv)}
                                      title="Edit invoice"
                                      className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#0B1F3A] hover:bg-[#E8EFF8] rounded-md cursor-pointer disabled:opacity-40"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setVoidTarget(inv);
                                        setVoidReason('');
                                      }}
                                      title="Void invoice"
                                      className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#D64545] hover:bg-[#D64545]/10 rounded-md cursor-pointer"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(inv)}
                                    title="Permanently delete voided invoice"
                                    className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center p-2 text-[#64748B] hover:text-[#D64545] hover:bg-[#D64545]/10 rounded-md cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
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
        </div>
      )}

      {/* A4 INVOICE PREVIEW & PRINT MODAL */}
      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071629]/70 print:static print:p-0 print:bg-white">
          <div className="bg-white border border-[#DCE4EF] rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col print:border-none print:max-h-none print:w-full shadow-2xl">
            <div className="no-print px-6 py-3.5 border-b border-[#DCE4EF] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#0B1F3A]">
                  A4 Invoice Preview · {previewData.invoice.invoiceNumber}
                </span>
                {previewData.isDraft && (
                  <span className="text-xs font-medium text-[#D99722]">
                    (Draft Preview — Save Invoice in Step 5 to record)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#E8EFF8] hover:bg-[#DCE4EF] text-[#0B1F3A] rounded-md cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadInvoicePDF(
                      previewData.invoice,
                      settings,
                      previewData.items
                    ).catch((err) =>
                      onNotify(
                        err instanceof Error ? err.message : 'PDF download failed.',
                        'error'
                      )
                    )
                  }
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0B1F3A] hover:bg-[#163A63] text-white rounded-md cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewData(null)}
                  aria-label="Close preview"
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center p-1.5 text-[#64748B] hover:text-[#0B1F3A] rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* A4 Printable Sheet */}
            <div className="print-container p-6 sm:p-8 overflow-y-auto space-y-6 bg-white">
              {previewData.invoice.status === 'voided' && (
                <div className="p-3 border border-[#D64545] bg-[#D64545]/10 rounded-lg text-xs font-semibold text-[#D64545] uppercase">
                  Voided Invoice — Excluded from Active Sales &amp; Reports
                  {previewData.invoice.voidReason
                    ? ` · Reason: ${previewData.invoice.voidReason}`
                    : ''}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b-2 border-[#0B1F3A]">
                <div className="flex items-start gap-4">
                  {originalLogoSrc && (
                    <img
                      src={originalLogoSrc}
                      alt={settings.businessName || 'Netzone company logo'}
                      className="h-14 sm:h-16 w-auto max-w-[155px] object-contain shrink-0"
                    />
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-[#0B1F3A]">
                      {settings.businessName}
                    </h2>
                    <p className="text-xs text-[#64748B] mt-1 max-w-sm">
                      {settings.address}
                    </p>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {[settings.phone ? `Phone: ${settings.phone}` : '', settings.email]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="sm:text-right shrink-0">
                  <p className="text-lg font-bold text-[#0B1F3A] tracking-tight">
                    {previewData.invoice.status === 'voided' ? 'VOIDED INVOICE' : 'INVOICE'}
                  </p>
                  <p className="text-sm font-mono-num text-[#163A63] font-medium mt-1">
                    {previewData.invoice.invoiceNumber}
                  </p>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Date: {formatDisplayDate(previewData.invoice.date)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-[#64748B]">BILL TO</p>
                    <p className="text-base font-semibold text-[#0B1F3A] mt-1">
                      {previewData.invoice.customerName}
                    </p>
                    <p className="text-xs text-[#172338] mt-0.5">
                      Phone: {previewData.invoice.customerPhone}
                    </p>
                    <p className="text-xs text-[#64748B] mt-0.5 max-w-sm">
                      {previewData.invoice.customerAddress}
                      {previewData.invoice.customerPincode
                        ? ` - ${previewData.invoice.customerPincode}`
                        : ''}
                    </p>
                  </div>

                  {previewData.invoice.workSiteAddress && (
                    <div>
                      <p className="text-[11px] font-semibold text-[#64748B] uppercase">
                        Work Site Address
                      </p>
                      <p className="text-xs text-[#172338] max-w-sm">
                        {previewData.invoice.workSiteAddress}
                      </p>
                    </div>
                  )}
                </div>

                <div className="sm:text-right">
                  <p className="text-xs font-semibold text-[#64748B]">PAYMENT STATUS</p>
                  <p
                    className={`text-sm font-semibold mt-1 uppercase ${
                      previewData.invoice.status === 'voided'
                        ? 'text-[#D64545]'
                        : previewData.invoice.paymentStatus === 'paid'
                        ? 'text-[#16805D]'
                        : previewData.invoice.paymentStatus === 'partial'
                        ? 'text-[#D99722]'
                        : 'text-[#D64545]'
                    }`}
                  >
                    {previewData.invoice.status === 'voided'
                      ? 'Voided'
                      : previewData.invoice.paymentStatus === 'paid'
                      ? 'Paid'
                      : previewData.invoice.paymentStatus === 'partial'
                      ? 'Partially Paid'
                      : 'Unpaid'}
                  </p>
                </div>
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#0B1F3A] text-white text-xs">
                    <th className="text-left px-3 py-2.5 font-medium">#</th>
                    <th className="text-left px-3 py-2.5 font-medium">Material Name</th>
                    <th className="text-right px-3 py-2.5 font-medium">Sq. Feet</th>
                    <th className="text-right px-3 py-2.5 font-medium">Rate / Sq. Ft.</th>
                    <th className="text-right px-3 py-2.5 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE4EF] border-b border-[#DCE4EF]">
                  {previewData.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2.5 text-[#64748B] font-mono-num">{idx + 1}</td>
                      <td className="px-3 py-2.5 text-[#172338]">
                        {it.description}
                        {it.unit && it.unit !== 'sq ft' && (
                          <span className="ml-1.5 text-xs text-[#64748B]">({it.unit})</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num text-[#172338]">
                        {it.sqFeet ?? it.quantity ?? 0}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num text-[#172338]">
                        {formatCurrency(it.unitPrice, sym)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num font-medium text-[#0B1F3A]">
                        {formatCurrency(it.lineTotal, sym)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-2 text-sm">
                  <div className="flex justify-between text-[#64748B]">
                    <span>Subtotal</span>
                    <span className="font-mono-num text-[#172338]">
                      {formatCurrency(previewData.invoice.subtotal, sym)}
                    </span>
                  </div>
                  {previewData.invoice.discount > 0 && (
                    <div className="flex justify-between text-[#64748B]">
                      <span>Discount</span>
                      <span className="font-mono-num text-[#172338]">
                        - {formatCurrency(previewData.invoice.discount, sym)}
                      </span>
                    </div>
                  )}
                  {(previewData.invoice.labourCharges || 0) > 0 && (
                    <div className="flex justify-between text-[#64748B]">
                      <span>Labour / Installation</span>
                      <span className="font-mono-num text-[#172338]">
                        + {formatCurrency(previewData.invoice.labourCharges || 0, sym)}
                      </span>
                    </div>
                  )}
                  {(previewData.invoice.transportCharges || 0) > 0 && (
                    <div className="flex justify-between text-[#64748B]">
                      <span>Transport Charges</span>
                      <span className="font-mono-num text-[#172338]">
                        + {formatCurrency(previewData.invoice.transportCharges || 0, sym)}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-[#DCE4EF] flex justify-between font-bold text-base text-[#0B1F3A]">
                    <span>Grand Total</span>
                    <span className="font-mono-num">
                      {formatCurrency(previewData.invoice.total, sym)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#16805D]">
                    <span>Paid / Advance</span>
                    <span className="font-mono-num">
                      {formatCurrency(previewData.invoice.paidAmount, sym)}
                    </span>
                  </div>
                  <div className="px-2.5 py-1.5 bg-[#E8EFF8] rounded-md flex justify-between font-semibold text-[#0B1F3A]">
                    <span>Balance Due</span>
                    <span className="font-mono-num">
                      {formatCurrency(previewData.invoice.balanceDue, sym)}
                    </span>
                  </div>
                </div>
              </div>

              {previewData.invoice.notes && (
                <div className="pt-4 border-t border-[#DCE4EF] text-xs text-[#64748B]">
                  <span className="font-semibold text-[#0B1F3A]">Notes: </span>
                  {previewData.invoice.notes}
                </div>
              )}

              <div className="pt-6 border-t border-[#DCE4EF] flex justify-between text-xs text-[#64748B]">
                <span>Normal Invoice (Without GST Breakdown)</span>
                <span>Thank you for your business</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VOID INVOICE CONFIRMATION MODAL */}
      {voidTarget && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071629]/60">
          <div className="bg-white border border-[#DCE4EF] rounded-xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#DCE4EF]">
              <h3 className="text-base font-semibold text-[#0B1F3A]">
                Void Invoice {voidTarget.invoiceNumber}
              </h3>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="p-2 text-[#64748B] hover:text-[#0B1F3A] rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmVoid} className="mt-4 space-y-4">
              <p className="text-xs text-[#64748B] leading-relaxed">
                Voiding marks this invoice as <strong className="text-[#D64545]">Voided</strong>,
                excludes its{' '}
                <strong className="font-mono-num text-[#0B1F3A]">
                  {formatCurrency(voidTarget.total, sym)}
                </strong>{' '}
                from Dashboard sales, outstanding balances, and Monthly P&amp;L reports, while
                keeping it in your history.
              </p>
              <div>
                <label className="block text-xs font-medium text-[#172338] mb-1">
                  Reason for Voiding (Optional)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Cancelled order / Revised measurement"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-[#172338] border border-[#DCE4EF] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#163A63]"
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVoidTarget(null)}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#172338] bg-[#E8EFF8] hover:bg-[#DCE4EF] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voiding}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-[#D64545] hover:bg-[#b83636] disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {voiding ? 'Voiding...' : 'Confirm Void Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PERMANENT DELETE VOIDED INVOICE CONFIRMATION DIALOG */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Permanently Delete Voided Invoice?"
        message={
          deleteTarget
            ? `This will permanently delete voided invoice ${deleteTarget.invoiceNumber} (${deleteTarget.customerName}) and any linked payment receipts. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete Invoice"
        busy={deleting}
        onConfirm={handleConfirmDeleteVoided}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
