import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  BusinessSettings,
  Customer,
  Expense,
  Invoice,
  InvoiceItem,
  JobCosting,
  Payment,
  PaymentMethod,
} from '../types';
import {
  BLUEPRINT_LIMITS,
  calculateInvoiceTotals,
  calculateJobCostingTotals,
  generateInvoiceNumber,
  round2,
  sanitizeText,
} from '../utils/format';

export function normalizeBusinessName(name?: string | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed || trimmed === 'Netzone Mesh & Interiors') {
    return 'Netzone';
  }
  return trimmed;
}

export function defaultSettingsForUser(
  uid: string,
  email?: string | null
): BusinessSettings {
  return {
    ownerId: uid,
    businessName: 'Netzone',
    address: 'Tamil Nadu, India',
    phone: '',
    email: email || '',
    invoicePrefix: 'NZ',
    currencySymbol: '₹',
    currencyCode: 'INR',
    nextInvoiceSeq: 1,
  };
}

export async function ensureBusinessSettings(
  uid: string,
  email?: string | null
): Promise<BusinessSettings> {
  const path = `settings/${uid}`;
  const ref = doc(db, 'settings', uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as BusinessSettings;
      if (data.businessName === 'Netzone Mesh & Interiors' || !data.businessName?.trim()) {
        await updateDoc(ref, {
          businessName: 'Netzone',
          updatedAt: serverTimestamp(),
        });
        return { ...data, businessName: 'Netzone' };
      }
      return data;
    }
    const defaults = defaultSettingsForUser(uid, email);
    await setDoc(ref, {
      ...defaults,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return defaults;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateBusinessSettings(
  uid: string,
  input: Pick<
    BusinessSettings,
    'businessName' | 'address' | 'phone' | 'email' | 'invoicePrefix' | 'currencySymbol' | 'currencyCode'
  >
): Promise<void> {
  const path = `settings/${uid}`;
  try {
    const ref = doc(db, 'settings', uid);
    await updateDoc(ref, {
      businessName: sanitizeText(input.businessName, 120) || 'Netzone',
      address: sanitizeText(input.address, 300),
      phone: sanitizeText(input.phone, 25),
      email: sanitizeText(input.email, 120),
      invoicePrefix:
        sanitizeText(input.invoicePrefix, 15).toUpperCase() || 'NZ',
      currencySymbol: sanitizeText(input.currencySymbol, 5) || '₹',
      currencyCode: sanitizeText(input.currencyCode, 5).toUpperCase() || 'INR',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateBusinessLogo(
  uid: string,
  input: {
    logoUrl: string;
    logoWhiteUrl: string;
  }
): Promise<void> {
  const logoUrl = (input.logoUrl || '').trim();
  const logoWhiteUrl = (input.logoWhiteUrl || '').trim();
  if (logoUrl.length > 350000 || logoWhiteUrl.length > 350000) {
    throw new Error('Logo image exceeds cloud storage size limit. Please upload a smaller image.');
  }

  const path = `settings/${uid}`;
  try {
    const ref = doc(db, 'settings', uid);
    await updateDoc(ref, {
      logoUrl,
      logoWhiteUrl,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeToSettings(
  uid: string,
  onData: (settings: BusinessSettings) => void
): Unsubscribe {
  const path = `settings/${uid}`;
  return onSnapshot(
    doc(db, 'settings', uid),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as BusinessSettings;
        onData({
          ...data,
          businessName: normalizeBusinessName(data.businessName),
        });
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, path)
  );
}

export function subscribeToCollection<T extends { id: string }>(
  collectionName: string,
  uid: string,
  onData: (items: T[]) => void
): Unsubscribe {
  const q = query(collection(db, collectionName), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<T, 'id'>),
      })) as T[];
      onData(rows);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, collectionName)
  );
}

// --- Customers ---

export async function saveCustomer(
  uid: string,
  data: {
    id?: string;
    name: string;
    phone: string;
    address: string;
    pincode: string;
    notes: string;
  }
): Promise<string> {
  const name = sanitizeText(data.name, BLUEPRINT_LIMITS.maxName);
  const phone = sanitizeText(data.phone, BLUEPRINT_LIMITS.maxPhone);
  const address = sanitizeText(data.address, BLUEPRINT_LIMITS.maxAddress);
  const pincode = sanitizeText(data.pincode, 6);
  const notes = sanitizeText(data.notes, BLUEPRINT_LIMITS.maxNotes);

  if (!name || phone.length < 5 || !address || !BLUEPRINT_LIMITS.pincodePattern.test(pincode)) {
    throw new Error('Please fill valid customer name, phone, address, and 6-digit pincode.');
  }

  if (data.id) {
    const path = `customers/${data.id}`;
    try {
      await updateDoc(doc(db, 'customers', data.id), {
        name,
        phone,
        address,
        pincode,
        notes,
        updatedAt: serverTimestamp(),
      });
      return data.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    const ref = doc(collection(db, 'customers'));
    const path = `customers/${ref.id}`;
    try {
      await setDoc(ref, {
        ownerId: uid,
        name,
        phone,
        address,
        pincode,
        notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const path = `customers/${customerId}`;
  try {
    await deleteDoc(doc(db, 'customers', customerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Normal Invoices & Subcollection Line Items ---

function toInvoiceLockId(invoiceNumber: string): string {
  return (
    invoiceNumber
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_')
      .slice(0, 100) || 'INV'
  );
}

export async function getInvoiceItems(
  uid: string,
  invoice: Invoice
): Promise<InvoiceItem[]> {
  const path = `invoices/${invoice.id}/items`;
  try {
    const q = query(
      collection(db, 'invoices', invoice.id, 'items'),
      where('ownerId', '==', uid)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          const sqFeetVal = Number(data.sqFeet ?? data.quantity) || 0;
          return {
            id: d.id,
            order: Number(data.order) || 0,
            description: String(data.description || ''),
            sqFeet: sqFeetVal,
            unit: String(data.unit || 'sq ft'),
            unitPrice: Number(data.unitPrice) || 0,
            lineTotal: Number(data.lineTotal) || 0,
          };
        })
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    if (Array.isArray(invoice.items) && invoice.items.length > 0) {
      return invoice.items.map((it, idx) => ({
        order: idx,
        description: it.description,
        sqFeet: Number(it.sqFeet ?? it.quantity) || 0,
        unit: it.unit || 'sq ft',
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
      }));
    }
    return [];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export interface CreateNormalInvoicePayload {
  invoiceNumber: string;
  invoicePrefix: string;
  autoAssignIfDuplicate: boolean;
  date: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerPincode: string;
  saveToCustomers?: boolean;
  workSiteAddress: string;
  items: InvoiceItem[];
  discount: number;
  labourCharges: number;
  transportCharges: number;
  advancePaid: number;
  advanceMethod: PaymentMethod;
  advanceReference: string;
  notes: string;
}

export async function createNormalInvoice(
  uid: string,
  payload: CreateNormalInvoicePayload
): Promise<{ invoiceId: string; invoiceNumber: string; customerId: string }> {
  const customerName = sanitizeText(payload.customerName, BLUEPRINT_LIMITS.maxName);
  const customerPhone = sanitizeText(payload.customerPhone, BLUEPRINT_LIMITS.maxPhone);
  const customerAddress = sanitizeText(payload.customerAddress, BLUEPRINT_LIMITS.maxAddress);
  const customerPincode = sanitizeText(payload.customerPincode, 6);
  const workSiteAddress = sanitizeText(payload.workSiteAddress, BLUEPRINT_LIMITS.maxAddress);

  if (!customerName || customerPhone.length < 5 || !customerAddress) {
    throw new Error('Customer name, phone (min 5 chars), and address are required.');
  }
  if (customerPincode && !BLUEPRINT_LIMITS.pincodePattern.test(customerPincode)) {
    throw new Error('Pincode must be 6 digits (or leave blank).');
  }
  if (payload.items.length === 0) {
    throw new Error('At least one product line item is required.');
  }

  const advance = Math.max(0, round2(payload.advancePaid));
  const calc = calculateInvoiceTotals(
    payload.items,
    payload.discount,
    advance,
    payload.labourCharges,
    payload.transportCharges
  );

  if (advance > calc.total) {
    throw new Error('Advance paid cannot exceed the invoice Grand Total.');
  }

  const invoiceRef = doc(collection(db, 'invoices'));
  const settingsRef = doc(db, 'settings', uid);

  const TX_ITEM_LIMIT = 400;
  const txItems = calc.items.slice(0, TX_ITEM_LIMIT);
  const overflowItems = calc.items.slice(TX_ITEM_LIMIT);

  try {
    const result = await runTransaction(db, async (tx) => {
      const settingsSnap = await tx.get(settingsRef);
      const currentSeq = settingsSnap.exists()
        ? Math.max(1, Number(settingsSnap.data().nextInvoiceSeq) || 1)
        : 1;

      let chosenNumber =
        sanitizeText(payload.invoiceNumber, BLUEPRINT_LIMITS.maxInvoiceNumber) ||
        generateInvoiceNumber(payload.invoicePrefix, currentSeq, payload.date);
      let lockId = toInvoiceLockId(chosenNumber);
      let lockRef = doc(db, 'settings', uid, 'invoiceNumbers', lockId);
      let lockSnap = await tx.get(lockRef);

      let nextSeqToStore = currentSeq + 1;

      if (lockSnap.exists()) {
        if (!payload.autoAssignIfDuplicate) {
          throw new Error(
            `Invoice number "${chosenNumber}" already exists. Please enter a unique invoice number.`
          );
        }
        // Automatically advance sequence until an unused invoice number lock is found
        let probeSeq = currentSeq;
        let foundFree = false;
        for (let attempt = 0; attempt < 50; attempt++) {
          const candidate = generateInvoiceNumber(
            payload.invoicePrefix,
            probeSeq,
            payload.date
          );
          const candidateLockRef = doc(
            db,
            'settings',
            uid,
            'invoiceNumbers',
            toInvoiceLockId(candidate)
          );
          const probeSnap = await tx.get(candidateLockRef);
          if (!probeSnap.exists()) {
            chosenNumber = candidate;
            lockId = toInvoiceLockId(candidate);
            lockRef = candidateLockRef;
            nextSeqToStore = probeSeq + 1;
            foundFree = true;
            break;
          }
          probeSeq++;
        }
        if (!foundFree) {
          throw new Error('Unable to allocate a unique invoice number. Please enter one manually.');
        }
      }

      let finalCustomerId = sanitizeText(payload.customerId, 128);
      if (
        !finalCustomerId &&
        payload.saveToCustomers &&
        BLUEPRINT_LIMITS.pincodePattern.test(customerPincode)
      ) {
        const custRef = doc(collection(db, 'customers'));
        finalCustomerId = custRef.id;
        tx.set(custRef, {
          ownerId: uid,
          name: customerName,
          phone: customerPhone,
          address: customerAddress,
          pincode: customerPincode,
          notes: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(lockRef, {
        ownerId: uid,
        invoiceId: invoiceRef.id,
        invoiceNumber: chosenNumber,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(invoiceRef, {
        ownerId: uid,
        invoiceNumber: chosenNumber,
        date: payload.date,
        customerId: finalCustomerId,
        customerName,
        customerPhone,
        customerAddress,
        customerPincode,
        workSiteAddress,
        itemCount: calc.items.length,
        subtotal: calc.subtotal,
        discount: calc.discount,
        labourCharges: calc.labourCharges,
        transportCharges: calc.transportCharges,
        total: calc.total,
        advancePaid: advance,
        paidAmount: calc.paidAmount,
        balanceDue: calc.balanceDue,
        paymentStatus: calc.paymentStatus,
        status: 'active',
        voidReason: '',
        notes: sanitizeText(payload.notes, BLUEPRINT_LIMITS.maxNotes),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const item of txItems) {
        const itemRef = doc(collection(db, 'invoices', invoiceRef.id, 'items'));
        tx.set(itemRef, {
          ownerId: uid,
          invoiceId: invoiceRef.id,
          order: item.order ?? 0,
          description: item.description,
          unit: item.unit || 'sq ft',
          quantity: item.sqFeet,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (advance > 0) {
        const paymentRef = doc(collection(db, 'payments'));
        tx.set(paymentRef, {
          ownerId: uid,
          invoiceId: invoiceRef.id,
          invoiceNumber: chosenNumber,
          customerId: finalCustomerId,
          customerName,
          date: payload.date,
          amount: advance,
          method: payload.advanceMethod,
          isAdvance: true,
          reference: sanitizeText(payload.advanceReference, BLUEPRINT_LIMITS.maxReference),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (settingsSnap.exists()) {
        tx.update(settingsRef, {
          nextInvoiceSeq: nextSeqToStore,
          updatedAt: serverTimestamp(),
        });
      }

      return {
        invoiceId: invoiceRef.id,
        invoiceNumber: chosenNumber,
        customerId: finalCustomerId,
      };
    });

    // Write any overflow line items (>400) in chunked batches of 450
    for (let i = 0; i < overflowItems.length; i += 450) {
      const chunk = overflowItems.slice(i, i + 450);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const itemRef = doc(collection(db, 'invoices', result.invoiceId, 'items'));
        batch.set(itemRef, {
          ownerId: uid,
          invoiceId: result.invoiceId,
          order: item.order ?? 0,
          description: item.description,
          unit: item.unit || 'sq ft',
          quantity: item.sqFeet,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `invoices/${invoiceRef.id}`);
  }
}

export async function updateNormalInvoice(
  uid: string,
  invoice: Invoice,
  payload: {
    date: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    customerPincode: string;
    workSiteAddress: string;
    items: InvoiceItem[];
    discount: number;
    labourCharges: number;
    transportCharges: number;
    notes: string;
  }
): Promise<void> {
  if (invoice.status === 'voided') {
    throw new Error('Voided invoices cannot be edited.');
  }

  const customerName = sanitizeText(payload.customerName, BLUEPRINT_LIMITS.maxName);
  const customerPhone = sanitizeText(payload.customerPhone, BLUEPRINT_LIMITS.maxPhone);
  const customerAddress = sanitizeText(payload.customerAddress, BLUEPRINT_LIMITS.maxAddress);
  const customerPincode = sanitizeText(payload.customerPincode, 6);
  const workSiteAddress = sanitizeText(payload.workSiteAddress, BLUEPRINT_LIMITS.maxAddress);

  if (!customerName || customerPhone.length < 5 || !customerAddress) {
    throw new Error('Customer name, phone (min 5 chars), and address are required.');
  }
  if (customerPincode && !BLUEPRINT_LIMITS.pincodePattern.test(customerPincode)) {
    throw new Error('Pincode must be 6 digits (or leave blank).');
  }
  if (payload.items.length === 0) {
    throw new Error('At least one product line item is required.');
  }

  const calc = calculateInvoiceTotals(
    payload.items,
    payload.discount,
    invoice.paidAmount,
    payload.labourCharges,
    payload.transportCharges
  );

  const path = `invoices/${invoice.id}`;
  try {
    // Load existing subcollection items so we replace cleanly
    const existingItemsSnap = await getDocs(
      query(collection(db, 'invoices', invoice.id, 'items'), where('ownerId', '==', uid))
    );

    const invoiceRef = doc(db, 'invoices', invoice.id);
    const updatePayload: Record<string, unknown> = {
      date: payload.date,
      customerId: sanitizeText(payload.customerId, 128),
      customerName,
      customerPhone,
      customerAddress,
      customerPincode,
      workSiteAddress,
      itemCount: calc.items.length,
      subtotal: calc.subtotal,
      discount: calc.discount,
      labourCharges: calc.labourCharges,
      transportCharges: calc.transportCharges,
      total: calc.total,
      advancePaid: invoice.advancePaid,
      paidAmount: calc.paidAmount,
      balanceDue: calc.balanceDue,
      paymentStatus: calc.paymentStatus,
      status: 'active',
      voidReason: '',
      notes: sanitizeText(payload.notes, BLUEPRINT_LIMITS.maxNotes),
      updatedAt: serverTimestamp(),
    };

    if ('items' in invoice && invoice.items !== undefined) {
      updatePayload.items = deleteField();
    }

    const totalOps = 1 + existingItemsSnap.size + calc.items.length;
    if (totalOps <= 450) {
      const batch = writeBatch(db);
      batch.update(invoiceRef, updatePayload);
      existingItemsSnap.docs.forEach((d) => batch.delete(d.ref));
      for (const item of calc.items) {
        const itemRef = doc(collection(db, 'invoices', invoice.id, 'items'));
        batch.set(itemRef, {
          ownerId: uid,
          invoiceId: invoice.id,
          order: item.order ?? 0,
          description: item.description,
          unit: item.unit || 'sq ft',
          quantity: item.sqFeet,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } else {
      await updateDoc(invoiceRef, updatePayload);
      const oldRefs = existingItemsSnap.docs.map((d) => d.ref);
      for (let i = 0; i < oldRefs.length; i += 450) {
        const batch = writeBatch(db);
        oldRefs.slice(i, i + 450).forEach((r) => batch.delete(r));
        await batch.commit();
      }
      for (let i = 0; i < calc.items.length; i += 450) {
        const batch = writeBatch(db);
        calc.items.slice(i, i + 450).forEach((item) => {
          const itemRef = doc(collection(db, 'invoices', invoice.id, 'items'));
          batch.set(itemRef, {
            ownerId: uid,
            invoiceId: invoice.id,
            order: item.order ?? 0,
            description: item.description,
            unit: item.unit || 'sq ft',
            quantity: item.sqFeet,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function voidNormalInvoice(
  invoiceId: string,
  voidReason: string
): Promise<void> {
  const path = `invoices/${invoiceId}`;
  try {
    await updateDoc(doc(db, 'invoices', invoiceId), {
      status: 'voided',
      voidReason: sanitizeText(voidReason, 300) || 'Voided by user',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteInvoiceAndPayments(
  uid: string,
  invoice: Invoice,
  linkedPayments: Payment[]
): Promise<void> {
  const path = `invoices/${invoice.id}`;
  try {
    const subItemsSnap = await getDocs(
      query(collection(db, 'invoices', invoice.id, 'items'), where('ownerId', '==', uid))
    );
    const lockRef = doc(
      db,
      'settings',
      uid,
      'invoiceNumbers',
      toInvoiceLockId(invoice.invoiceNumber)
    );

    const refsToDelete = [
      ...subItemsSnap.docs.map((d) => d.ref),
      ...linkedPayments.map((p) => doc(db, 'payments', p.id)),
      lockRef,
      doc(db, 'invoices', invoice.id),
    ];

    for (let i = 0; i < refsToDelete.length; i += 450) {
      const batch = writeBatch(db);
      refsToDelete.slice(i, i + 450).forEach((r) => batch.delete(r));
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Payments ---

export async function recordInvoicePayment(
  uid: string,
  invoice: Invoice,
  allPaymentsForInvoice: Payment[],
  payload: {
    date: string;
    amount: number;
    method: PaymentMethod;
    isAdvance: boolean;
    reference: string;
  }
): Promise<void> {
  if (invoice.status === 'voided') {
    throw new Error('Cannot record payments on a voided invoice.');
  }
  const amount = round2(payload.amount);
  if (amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const existingPaid = round2(
    allPaymentsForInvoice.reduce((sum, p) => sum + p.amount, 0)
  );
  const newPaidAmount = round2(existingPaid + amount);
  const newBalanceDue = round2(Math.max(0, invoice.total - newPaidAmount));

  const paymentStatus =
    newBalanceDue <= 0.009 ? 'paid' : newPaidAmount > 0 ? 'partial' : 'unpaid';

  const batch = writeBatch(db);
  const paymentRef = doc(collection(db, 'payments'));

  batch.set(paymentRef, {
    ownerId: uid,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId || '',
    customerName: invoice.customerName,
    date: payload.date,
    amount,
    method: payload.method,
    isAdvance: payload.isAdvance,
    reference: sanitizeText(payload.reference, BLUEPRINT_LIMITS.maxReference),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'invoices', invoice.id), {
    paidAmount: newPaidAmount,
    balanceDue: newBalanceDue,
    paymentStatus,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `payments/${paymentRef.id}`);
  }
}

export async function deletePaymentAndRecalculate(
  payment: Payment,
  invoice: Invoice | undefined,
  allPaymentsForInvoice: Payment[]
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'payments', payment.id));

  if (invoice && invoice.status !== 'voided') {
    const remainingPaid = round2(
      allPaymentsForInvoice
        .filter((p) => p.id !== payment.id)
        .reduce((sum, p) => sum + p.amount, 0)
    );
    const balanceDue = round2(Math.max(0, invoice.total - remainingPaid));
    const paymentStatus =
      invoice.total === 0 || balanceDue <= 0.009
        ? 'paid'
        : remainingPaid > 0
        ? 'partial'
        : 'unpaid';

    batch.update(doc(db, 'invoices', invoice.id), {
      paidAmount: remainingPaid,
      balanceDue,
      paymentStatus,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `payments/${payment.id}`);
  }
}

// --- Material Cost Calculator (Job Costings) ---

export async function saveJobCosting(
  uid: string,
  data: {
    id?: string;
    jobTitle: string;
    date: string;
    customerId: string;
    customerName: string;
    invoiceId: string;
    invoiceNumber: string;
    estimatedSellingPrice: number;
    materials: JobCosting['materials'];
    labourCost: number;
    transportCost: number;
    installationCost: number;
    otherJobCost: number;
    notes: string;
  }
): Promise<string> {
  const jobTitle = sanitizeText(data.jobTitle, BLUEPRINT_LIMITS.maxTitle);
  if (!jobTitle || data.materials.length === 0) {
    throw new Error('Job title and at least one material line are required.');
  }

  const calc = calculateJobCostingTotals(
    data.materials,
    data.labourCost,
    data.transportCost,
    data.installationCost,
    data.otherJobCost,
    data.estimatedSellingPrice
  );

  const payload = {
    jobTitle,
    date: data.date,
    customerId: sanitizeText(data.customerId, 128),
    customerName: sanitizeText(data.customerName, BLUEPRINT_LIMITS.maxName),
    invoiceId: sanitizeText(data.invoiceId, 128),
    invoiceNumber: sanitizeText(data.invoiceNumber, BLUEPRINT_LIMITS.maxInvoiceNumber),
    estimatedSellingPrice: calc.estimatedSellingPrice,
    materials: calc.materials,
    totalMaterialCost: calc.totalMaterialCost,
    labourCost: calc.labourCost,
    transportCost: calc.transportCost,
    installationCost: calc.installationCost,
    otherJobCost: calc.otherJobCost,
    totalJobCost: calc.totalJobCost,
    estimatedProfit: calc.estimatedProfit,
    notes: sanitizeText(data.notes, BLUEPRINT_LIMITS.maxNotes),
    updatedAt: serverTimestamp(),
  };

  if (data.id) {
    const path = `jobCostings/${data.id}`;
    try {
      await updateDoc(doc(db, 'jobCostings', data.id), payload);
      return data.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    const ref = doc(collection(db, 'jobCostings'));
    const path = `jobCostings/${ref.id}`;
    try {
      await setDoc(ref, {
        ownerId: uid,
        ...payload,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function deleteJobCosting(jobId: string): Promise<void> {
  const path = `jobCostings/${jobId}`;
  try {
    await deleteDoc(doc(db, 'jobCostings', jobId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Operating Expenses ---

export async function saveExpense(
  uid: string,
  data: {
    id?: string;
    date: string;
    category: Expense['category'];
    description: string;
    amount: number;
    paymentMode: Expense['paymentMode'];
  }
): Promise<string> {
  const description = sanitizeText(data.description, BLUEPRINT_LIMITS.maxDescription);
  const amount = round2(data.amount);
  if (!description || amount <= 0) {
    throw new Error('Expense description and a positive amount are required.');
  }

  if (data.id) {
    const path = `expenses/${data.id}`;
    try {
      await updateDoc(doc(db, 'expenses', data.id), {
        date: data.date,
        category: data.category,
        description,
        amount,
        paymentMode: data.paymentMode,
        updatedAt: serverTimestamp(),
      });
      return data.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    const ref = doc(collection(db, 'expenses'));
    const path = `expenses/${ref.id}`;
    try {
      await setDoc(ref, {
        ownerId: uid,
        date: data.date,
        category: data.category,
        description,
        amount,
        paymentMode: data.paymentMode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const path = `expenses/${expenseId}`;
  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
