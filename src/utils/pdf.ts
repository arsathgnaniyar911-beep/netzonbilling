import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  BusinessSettings,
  Expense,
  Invoice,
  InvoiceItem,
  JobCosting,
  MonthlyPnLSummary,
  Payment,
} from '../types';
import {
  formatDisplayDate,
  formatMonthLabel,
  formatPDFMoney,
  isInvoiceActive,
} from './format';
import {
  DEFAULT_BRAND_LOGO_PATH,
  generateWhiteLogoFromUrl,
  loadLogoForPDF,
} from './logo';

// Navy Blue + White Theme Palette for PDFs
const PRIMARY_NAVY: [number, number, number] = [11, 31, 58]; // #0B1F3A
const SECONDARY_NAVY: [number, number, number] = [22, 58, 99]; // #163A63
const MAIN_TEXT: [number, number, number] = [23, 35, 56]; // #172338
const SECONDARY_TEXT: [number, number, number] = [100, 116, 139]; // #64748B
const LIGHT_BG: [number, number, number] = [244, 247, 251]; // #F4F7FB
const LIGHT_BLUE: [number, number, number] = [232, 239, 248]; // #E8EFF8
const BORDER_COLOR: [number, number, number] = [220, 228, 239]; // #DCE4EF
const SUCCESS_COLOR: [number, number, number] = [22, 128, 93]; // #16805D
const WARNING_COLOR: [number, number, number] = [217, 151, 34]; // #D99722
const ERROR_COLOR: [number, number, number] = [214, 69, 69]; // #D64545

let cachedPoppinsRegular: string | null = null;
let cachedPoppinsBold: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function ensurePoppinsFont(doc: jsPDF): Promise<string> {
  try {
    if (!cachedPoppinsRegular) {
      const res = await fetch('/fonts/Poppins-Regular.ttf');
      if (res.ok) {
        cachedPoppinsRegular = arrayBufferToBase64(await res.arrayBuffer());
      }
    }
    if (!cachedPoppinsBold) {
      const res = await fetch('/fonts/Poppins-Bold.ttf');
      if (res.ok) {
        cachedPoppinsBold = arrayBufferToBase64(await res.arrayBuffer());
      }
    }

    if (cachedPoppinsRegular && cachedPoppinsBold) {
      doc.addFileToVFS('Poppins-Regular.ttf', cachedPoppinsRegular);
      doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal');
      doc.addFileToVFS('Poppins-Bold.ttf', cachedPoppinsBold);
      doc.addFont('Poppins-Bold.ttf', 'Poppins', 'bold');
      doc.setFont('Poppins', 'normal');
      return 'Poppins';
    }
  } catch {
    // Fallback only if static font files cannot be loaded
  }
  doc.setFont('helvetica', 'normal');
  return 'helvetica';
}

function fitProportionalBox(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const safeW = Math.max(1, naturalW);
  const safeH = Math.max(1, naturalH);
  const ratio = Math.min(maxW / safeW, maxH / safeH);
  return {
    width: Math.max(4, Number((safeW * ratio).toFixed(2))),
    height: Math.max(4, Number((safeH * ratio).toFixed(2))),
  };
}

export async function downloadInvoicePDF(
  invoice: Invoice,
  settings: BusinessSettings,
  itemsOverride?: InvoiceItem[]
): Promise<void> {
  const logoSource = settings.logoUrl?.trim() || DEFAULT_BRAND_LOGO_PATH;
  const logoAsset = await loadLogoForPDF(logoSource);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fontFamily = await ensurePoppinsFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const moneyCode = settings.currencyCode === 'INR' ? 'Rs.' : settings.currencyCode;
  const lineItems =
    itemsOverride && itemsOverride.length > 0
      ? itemsOverride
      : invoice.items && invoice.items.length > 0
      ? invoice.items
      : [];
  const labourCharges = Number(invoice.labourCharges) || 0;
  const transportCharges = Number(invoice.transportCharges) || 0;
  const isVoided = invoice.status === 'voided';

  // Crisp White Invoice Background + Top Navy Accent Bar
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

  doc.setFillColor(...PRIMARY_NAVY);
  doc.rect(0, 0, pageWidth, 2.8, 'F');

  // Top-Left Company Logo (Proportional, Uncropped)
  const logoSize = fitProportionalBox(logoAsset.width, logoAsset.height, 36, 18);
  const logoX = 14;
  const logoY = 8.5;
  doc.addImage(
    logoAsset.dataUrl,
    logoAsset.format,
    logoX,
    logoY,
    logoSize.width,
    logoSize.height,
    undefined,
    'FAST'
  );

  // Header Business Name & Contact Info beside Logo
  const bizX = logoX + logoSize.width + 5;
  const rightMetaReserved = 52;
  const bizTextMaxW = Math.max(52, pageWidth - bizX - rightMetaReserved - 14);

  const displayBusinessName =
    !settings.businessName?.trim() ||
    settings.businessName.trim() === 'Netzone Mesh & Interiors'
      ? 'Netzone'
      : settings.businessName.trim();

  doc.setTextColor(...PRIMARY_NAVY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(14);
  const bizNameLines = doc.splitTextToSize(displayBusinessName, bizTextMaxW);
  doc.text(bizNameLines, bizX, 13);

  const afterNameY = 13 + bizNameLines.length * 5.2;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...SECONDARY_TEXT);
  const addrLinesHeader = settings.address
    ? doc.splitTextToSize(settings.address, bizTextMaxW)
    : [];
  if (addrLinesHeader.length > 0) {
    doc.text(addrLinesHeader, bizX, afterNameY);
  }
  const contactLine = [
    settings.phone ? `Ph: ${settings.phone}` : '',
    settings.email ? settings.email : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  const afterAddrY = afterNameY + addrLinesHeader.length * 4;
  if (contactLine) {
    doc.text(doc.splitTextToSize(contactLine, bizTextMaxW), bizX, afterAddrY);
  }

  // Top-Right Invoice Title, Number & Date
  doc.setTextColor(...PRIMARY_NAVY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(15);
  doc.text(isVoided ? 'VOIDED INVOICE' : 'INVOICE', pageWidth - 14, 13.5, {
    align: 'right',
  });
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...SECONDARY_NAVY);
  doc.text(invoice.invoiceNumber, pageWidth - 14, 19.5, { align: 'right' });
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SECONDARY_TEXT);
  doc.text(`Date: ${formatDisplayDate(invoice.date)}`, pageWidth - 14, 24.5, {
    align: 'right',
  });

  // Navy Divider Bar below Header
  const headerBottomY = Math.max(
    logoY + logoSize.height + 4.5,
    afterAddrY + (contactLine ? 5.5 : 2),
    31
  );
  doc.setFillColor(...PRIMARY_NAVY);
  doc.rect(14, headerBottomY, pageWidth - 28, 0.7, 'F');

  // Bill To & Invoice Status Section
  let y = headerBottomY + 8.5;
  doc.setTextColor(...SECONDARY_TEXT);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(8);
  doc.text('BILL TO', 14, y);
  doc.text('PAYMENT STATUS', pageWidth - 14, y, { align: 'right' });

  y += 5.5;
  doc.setTextColor(...PRIMARY_NAVY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.text(invoice.customerName, 14, y);

  const statusLabel = isVoided
    ? 'VOIDED'
    : invoice.paymentStatus === 'paid'
    ? 'PAID'
    : invoice.paymentStatus === 'partial'
    ? 'PARTIALLY PAID'
    : 'UNPAID';
  const statusColor = isVoided
    ? ERROR_COLOR
    : invoice.paymentStatus === 'paid'
    ? SUCCESS_COLOR
    : invoice.paymentStatus === 'partial'
    ? WARNING_COLOR
    : ERROR_COLOR;
  doc.setTextColor(...statusColor);
  doc.setFontSize(10);
  doc.text(statusLabel, pageWidth - 14, y, { align: 'right' });

  y += 5;
  doc.setTextColor(...MAIN_TEXT);
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9);
  doc.text(`Phone: ${invoice.customerPhone}`, 14, y);
  y += 4.8;
  const fullAddress = invoice.customerPincode
    ? `${invoice.customerAddress} - ${invoice.customerPincode}`
    : invoice.customerAddress;
  const addrLines = doc.splitTextToSize(fullAddress, 115);
  doc.text(addrLines, 14, y);
  y += addrLines.length * 4.8 + 2;

  if (invoice.workSiteAddress && invoice.workSiteAddress.trim()) {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...SECONDARY_TEXT);
    doc.text('WORK SITE ADDRESS', 14, y + 2);
    y += 6;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MAIN_TEXT);
    const siteLines = doc.splitTextToSize(invoice.workSiteAddress.trim(), 130);
    doc.text(siteLines, 14, y);
    y += siteLines.length * 4.8 + 2;
  }

  y += 4;

  // Line Items Table (Normal Invoice - No GST breakdown)
  autoTable(doc, {
    startY: y,
    head: [['#', 'Material Name', 'Sq. Feet', 'Rate / Sq. Ft.', 'Total']],
    body: lineItems.map((item, idx) => {
      const sqFeet = Number(item.sqFeet ?? item.quantity ?? 0);
      const legacyUnitNote =
        item.unit && item.unit !== 'sq ft' ? ` (${item.unit})` : '';
      return [
        String(idx + 1),
        `${item.description}${legacyUnitNote}`,
        String(sqFeet),
        formatPDFMoney(item.unitPrice, moneyCode),
        formatPDFMoney(item.lineTotal, moneyCode),
      ];
    }),
    styles: {
      font: fontFamily,
      fontSize: 8.8,
      cellPadding: 3.2,
      textColor: MAIN_TEXT,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      font: fontFamily,
      fillColor: PRIMARY_NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: LIGHT_BG,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 36, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  // Totals Summary Box
  let finalY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (finalY > pageHeight - 65) {
    doc.addPage();
    finalY = 20;
  }

  const summaryX = pageWidth - 95;
  const valueX = pageWidth - 14;

  doc.setFontSize(9.5);
  doc.setTextColor(...SECONDARY_TEXT);
  doc.setFont(fontFamily, 'normal');
  doc.text('Subtotal', summaryX, finalY);
  doc.setTextColor(...MAIN_TEXT);
  doc.text(formatPDFMoney(invoice.subtotal, moneyCode), valueX, finalY, { align: 'right' });

  let sy = finalY + 6;
  if (invoice.discount > 0) {
    doc.setTextColor(...SECONDARY_TEXT);
    doc.text('Discount', summaryX, sy);
    doc.setTextColor(...MAIN_TEXT);
    doc.text(`- ${formatPDFMoney(invoice.discount, moneyCode)}`, valueX, sy, {
      align: 'right',
    });
    sy += 6;
  }
  if (labourCharges > 0) {
    doc.setTextColor(...SECONDARY_TEXT);
    doc.text('Labour / Installation', summaryX, sy);
    doc.setTextColor(...MAIN_TEXT);
    doc.text(`+ ${formatPDFMoney(labourCharges, moneyCode)}`, valueX, sy, {
      align: 'right',
    });
    sy += 6;
  }
  if (transportCharges > 0) {
    doc.setTextColor(...SECONDARY_TEXT);
    doc.text('Transport Charges', summaryX, sy);
    doc.setTextColor(...MAIN_TEXT);
    doc.text(`+ ${formatPDFMoney(transportCharges, moneyCode)}`, valueX, sy, {
      align: 'right',
    });
    sy += 6;
  }

  doc.setDrawColor(...BORDER_COLOR);
  doc.line(summaryX, sy - 2, valueX, sy - 2);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PRIMARY_NAVY);
  doc.text('Grand Total', summaryX, sy + 2.5);
  doc.text(formatPDFMoney(invoice.total, moneyCode), valueX, sy + 2.5, { align: 'right' });

  sy += 9.5;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...SECONDARY_TEXT);
  doc.text('Advance / Paid', summaryX, sy);
  doc.setTextColor(...SUCCESS_COLOR);
  doc.text(formatPDFMoney(invoice.paidAmount, moneyCode), valueX, sy, { align: 'right' });

  sy += 6.5;
  doc.setFillColor(...LIGHT_BLUE);
  doc.rect(summaryX - 3, sy - 4.5, valueX - summaryX + 6, 7.5, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PRIMARY_NAVY);
  doc.text('Balance Due', summaryX, sy + 0.5);
  doc.text(formatPDFMoney(invoice.balanceDue, moneyCode), valueX, sy + 0.5, { align: 'right' });

  if (invoice.notes || (isVoided && invoice.voidReason)) {
    const notesY = Math.max(finalY, sy + 13);
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...PRIMARY_NAVY);
    doc.text(isVoided && invoice.voidReason ? 'VOID REASON / NOTES' : 'NOTES', 14, notesY);
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MAIN_TEXT);
    const noteBody = [
      isVoided && invoice.voidReason ? `Voided: ${invoice.voidReason}` : '',
      invoice.notes,
    ]
      .filter(Boolean)
      .join('  |  ');
    doc.text(doc.splitTextToSize(noteBody, pageWidth - 28), 14, notesY + 5);
  }

  // Footer
  doc.setDrawColor(...BORDER_COLOR);
  doc.line(14, pageHeight - 18, pageWidth - 14, pageHeight - 18);
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SECONDARY_TEXT);
  doc.text('Thank you for your business. (Normal Invoice - Without GST)', 14, pageHeight - 12);
  doc.text(displayBusinessName, pageWidth - 14, pageHeight - 12, { align: 'right' });

  doc.save(`${invoice.invoiceNumber}.pdf`);
}

export async function downloadMonthlyReportPDF(
  month: string,
  summary: MonthlyPnLSummary,
  invoices: Invoice[],
  payments: Payment[],
  jobCostings: JobCosting[],
  expenses: Expense[],
  settings: BusinessSettings
): Promise<void> {
  const whiteSource =
    settings.logoWhiteUrl?.trim() ||
    (await generateWhiteLogoFromUrl(settings.logoUrl?.trim() || DEFAULT_BRAND_LOGO_PATH));
  const whiteLogoAsset = await loadLogoForPDF(whiteSource);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fontFamily = await ensurePoppinsFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const moneyCode = settings.currencyCode === 'INR' ? 'Rs.' : settings.currencyCode;
  const monthLabel = formatMonthLabel(month);

  // Header
  doc.setFillColor(...PRIMARY_NAVY);
  doc.rect(0, 0, pageWidth, 34, 'F');

  const logoSize = fitProportionalBox(whiteLogoAsset.width, whiteLogoAsset.height, 34, 18);
  const logoX = 14;
  const logoY = (34 - logoSize.height) / 2;
  doc.addImage(
    whiteLogoAsset.dataUrl,
    whiteLogoAsset.format,
    logoX,
    logoY,
    logoSize.width,
    logoSize.height,
    undefined,
    'FAST'
  );

  const displayBusinessName =
    !settings.businessName?.trim() ||
    settings.businessName.trim() === 'Netzone Mesh & Interiors'
      ? 'Netzone'
      : settings.businessName.trim();

  const textX = logoX + logoSize.width + 6;
  doc.setTextColor(255, 255, 255);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(14.5);
  doc.text(`${displayBusinessName} — Month-End Report`, textX, 13.5);
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9);
  doc.text(`Reporting Period: ${monthLabel} (${month})`, textX, 20.5);
  doc.text(
    [settings.address, settings.phone].filter(Boolean).join('  |  ') || 'Tamil Nadu, India',
    textX,
    26.5
  );

  doc.setFillColor(...SECONDARY_NAVY);
  doc.rect(0, 34, pageWidth, 1.8, 'F');

  // 1. Financial Summary Table
  doc.setTextColor(...PRIMARY_NAVY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.text('1. Executive Financial Summary', 14, 42);

  autoTable(doc, {
    startY: 45,
    head: [['Metric', 'Amount', 'Notes']],
    body: [
      [
        'Monthly Invoiced Sales',
        formatPDFMoney(summary.invoicedSales, moneyCode),
        `${summary.invoicedCount} invoice(s) issued`,
      ],
      [
        'Actual Cash Collected',
        formatPDFMoney(summary.cashCollected, moneyCode),
        `Adv: ${formatPDFMoney(summary.advanceCollected, moneyCode)} | Bal: ${formatPDFMoney(summary.balanceCollected, moneyCode)}`,
      ],
      [
        'Month Pending Balances',
        formatPDFMoney(summary.monthPendingReceivables, moneyCode),
        `All-time Receivable: ${formatPDFMoney(summary.totalOutstandingReceivables, moneyCode)}`,
      ],
      [
        'Job Material Costs',
        formatPDFMoney(summary.materialCosts, moneyCode),
        'Mosquito mesh, aluminium frames, accessories & materials',
      ],
      [
        'Job Labour, Transport & Install',
        formatPDFMoney(
          summary.labourCosts +
            summary.jobTransportCosts +
            summary.installationCosts +
            summary.otherJobCosts,
          moneyCode
        ),
        'Direct site & installation costs',
      ],
      [
        'Operating Expenses',
        formatPDFMoney(summary.totalOperatingExpenses, moneyCode),
        'Rent, electricity, salary, transport, tools & misc',
      ],
      [
        'Net Profit (Invoiced Basis)',
        formatPDFMoney(summary.netProfitAccrual, moneyCode),
        `Margin: ${summary.netProfitMarginPct.toFixed(1)}%`,
      ],
    ],
    styles: {
      font: fontFamily,
      fontSize: 8.5,
      cellPadding: 3,
      textColor: MAIN_TEXT,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      font: fontFamily,
      fontStyle: 'bold',
      fillColor: PRIMARY_NAVY,
      textColor: [255, 255, 255],
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { cellWidth: 58, fontStyle: 'bold' },
      1: { cellWidth: 40, halign: 'right' },
      2: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  // 2. Job-wise Profitability
  let nextY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setTextColor(...PRIMARY_NAVY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.text('2. Job-Wise Profitability', 14, nextY);

  const monthJobs = jobCostings.filter((j) => j.date.startsWith(month));
  autoTable(doc, {
    startY: nextY + 3,
    head: [['Date', 'Job Title', 'Customer', 'Materials', 'Labour/Site', 'Total Cost', 'Est. Profit']],
    body:
      monthJobs.length > 0
        ? monthJobs.map((j) => [
            formatDisplayDate(j.date),
            j.jobTitle,
            j.customerName || '-',
            formatPDFMoney(j.totalMaterialCost, moneyCode),
            formatPDFMoney(
              j.labourCost + j.transportCost + j.installationCost + j.otherJobCost,
              moneyCode
            ),
            formatPDFMoney(j.totalJobCost, moneyCode),
            formatPDFMoney(j.estimatedProfit, moneyCode),
          ])
        : [['-', 'No job costings recorded for this month', '-', '-', '-', '-', '-']],
    styles: {
      font: fontFamily,
      fontSize: 8,
      cellPadding: 2.5,
      textColor: MAIN_TEXT,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      font: fontFamily,
      fontStyle: 'bold',
      fillColor: PRIMARY_NAVY,
      textColor: [255, 255, 255],
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  // 3. Invoices Issued in Month
  nextY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  if (nextY > 245) {
    doc.addPage();
    nextY = 20;
  }
  doc.setTextColor(...PRIMARY_NAVY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.text('3. Monthly Invoices & Outstanding Balances', 14, nextY);

  const voidedInvoiceIds = new Set(
    invoices.filter((inv) => !isInvoiceActive(inv)).map((inv) => inv.id)
  );
  const monthInvoices = invoices.filter(
    (inv) => isInvoiceActive(inv) && inv.date.startsWith(month)
  );
  autoTable(doc, {
    startY: nextY + 3,
    head: [['Invoice #', 'Date', 'Customer', 'Total', 'Paid', 'Balance Due', 'Status']],
    body:
      monthInvoices.length > 0
        ? monthInvoices.map((inv) => [
            inv.invoiceNumber,
            formatDisplayDate(inv.date),
            inv.customerName,
            formatPDFMoney(inv.total, moneyCode),
            formatPDFMoney(inv.paidAmount, moneyCode),
            formatPDFMoney(inv.balanceDue, moneyCode),
            inv.paymentStatus.toUpperCase(),
          ])
        : [['-', '-', 'No invoices issued for this month', '-', '-', '-', '-']],
    styles: {
      font: fontFamily,
      fontSize: 8,
      cellPadding: 2.5,
      textColor: MAIN_TEXT,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      font: fontFamily,
      fontStyle: 'bold',
      fillColor: PRIMARY_NAVY,
      textColor: [255, 255, 255],
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  // 4. Operating Expenses
  nextY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  if (nextY > 245) {
    doc.addPage();
    nextY = 20;
  }
  doc.setTextColor(...PRIMARY_NAVY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.text('4. Operating Expenses Breakdown', 14, nextY);

  const monthExpenses = expenses.filter((e) => e.date.startsWith(month));
  autoTable(doc, {
    startY: nextY + 3,
    head: [['Date', 'Category', 'Description', 'Mode', 'Amount']],
    body:
      monthExpenses.length > 0
        ? monthExpenses.map((e) => [
            formatDisplayDate(e.date),
            e.category,
            e.description,
            e.paymentMode,
            formatPDFMoney(e.amount, moneyCode),
          ])
        : [['-', '-', 'No operating expenses recorded for this month', '-', '-']],
    styles: {
      font: fontFamily,
      fontSize: 8,
      cellPadding: 2.5,
      textColor: MAIN_TEXT,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      font: fontFamily,
      fontStyle: 'bold',
      fillColor: PRIMARY_NAVY,
      textColor: [255, 255, 255],
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: { 4: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  // 5. Payments Received
  nextY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  if (nextY > 245) {
    doc.addPage();
    nextY = 20;
  }
  doc.setTextColor(...PRIMARY_NAVY);
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11);
  doc.text('5. Payments Collected in Month', 14, nextY);

  const monthPayments = payments.filter(
    (p) => !voidedInvoiceIds.has(p.invoiceId) && p.date.startsWith(month)
  );
  autoTable(doc, {
    startY: nextY + 3,
    head: [['Date', 'Invoice #', 'Customer', 'Method', 'Type', 'Amount']],
    body:
      monthPayments.length > 0
        ? monthPayments.map((p) => [
            formatDisplayDate(p.date),
            p.invoiceNumber,
            p.customerName,
            p.method,
            p.isAdvance ? 'Advance' : 'Payment',
            formatPDFMoney(p.amount, moneyCode),
          ])
        : [['-', '-', 'No payments collected in this month', '-', '-', '-']],
    styles: {
      font: fontFamily,
      fontSize: 8,
      cellPadding: 2.5,
      textColor: MAIN_TEXT,
      lineColor: BORDER_COLOR,
      lineWidth: 0.2,
    },
    headStyles: {
      font: fontFamily,
      fontStyle: 'bold',
      fillColor: PRIMARY_NAVY,
      textColor: [255, 255, 255],
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: { 5: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  doc.save(`Netzone-Report-${month}.pdf`);
}
