'use client';

/**
 * Pure JavaScript PDF 1.4 Invoice Generator & WhatsApp Sharing Helpers.
 * Produces a genuine, standards-compliant PDF document (application/pdf) with
 * zero external libraries so it opens cleanly in Android/iOS PDF viewers and WhatsApp.
 */

function sanitizePdfText(raw) {
  return String(raw ?? '')
    .replace(/₹/g, 'Rs. ')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, ' | ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfLiteral(str) {
  return sanitizePdfText(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function truncateText(str, maxChars) {
  const s = sanitizePdfText(str);
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(3, maxChars - 3))}...`;
}

function formatAmountRs(amount) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return 'Rs. 0.00';
  return `Rs. ${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAmountInr(amount) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatReadableDate(iso) {
  if (!iso) return new Date().toLocaleString('en-IN');
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

/**
 * Normalize customer-facing receipt rows (strips private retailer commission margin
 * so invoices handed to end customers remain commercial-grade).
 */
function getCustomerRows(invoice) {
  const rows = [];
  const provider = invoice.provider || invoice.logoAlt || '';
  if (provider) {
    rows.push({ label: 'Service / Provider', value: provider });
  }

  const rawDetails = Array.isArray(invoice.details) ? invoice.details : [];
  for (const item of rawDetails) {
    if (!item || item.value === undefined || item.value === null || item.value === '') continue;
    if (/commission/i.test(String(item.label || ''))) continue;
    rows.push({
      label: String(item.label),
      value: String(item.value),
    });
  }

  if (invoice.transactionId) {
    rows.push({ label: 'Transaction ID', value: String(invoice.transactionId) });
  }
  rows.push({ label: 'Date & Time', value: formatReadableDate(invoice.timestamp) });

  return rows;
}

export function getInvoiceFilename(invoice) {
  const rawId = String(invoice?.transactionId || Date.now())
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40);
  return `QuickRecharge-Invoice-${rawId || 'Receipt'}.pdf`;
}

/**
 * Build a genuine PDF 1.4 binary Blob (A5 portrait receipt: 420 x 620 pt).
 */
export function buildInvoicePdfBlob(invoice = {}) {
  const pageW = 420;
  const pageH = 620;
  const margin = 28;
  const contentW = pageW - margin * 2;

  const normStatus = String(invoice.status || 'SUCCESSFUL').toUpperCase();
  const isSuccess = normStatus === 'SUCCESSFUL' || normStatus === 'SUCCESS';
  const isFailed = normStatus === 'FAILED' || normStatus === 'REJECTED';

  const statusLabel = isSuccess
    ? 'VERIFIED & PAID'
    : isFailed
    ? 'FAILED / REFUNDED'
    : 'PENDING CONFIRMATION';

  const statusColor = isSuccess
    ? '0.082 0.502 0.239' // #15803D
    : isFailed
    ? '0.863 0.149 0.149' // #DC2626
    : '0.851 0.467 0.024'; // #D97706

  const statusBg = isSuccess
    ? '0.941 0.992 0.957' // #F0FDF4
    : isFailed
    ? '0.996 0.949 0.949' // #FEF2F2
    : '1.000 0.984 0.922'; // #FFFBEB

  const ops = [];

  // White page background
  ops.push('1 1 1 rg');
  ops.push(`0 0 ${pageW} ${pageH} re f`);

  // Outer subtle card border
  ops.push('0.918 0.906 0.961 RG 1 w');
  ops.push(`14 14 ${pageW - 28} ${pageH - 28} re S`);

  // Deep Navy Brand Header Banner (#0E163B)
  const headerH = 92;
  const headerY = pageH - 14 - headerH;
  ops.push('0.055 0.086 0.231 rg');
  ops.push(`14 ${headerY} ${pageW - 28} ${headerH} re f`);

  // Purple accent strip right below header (#5B35E5)
  ops.push('0.357 0.208 0.898 rg');
  ops.push(`14 ${headerY - 4} ${pageW - 28} 4 re f`);

  // Brand title & subtitle inside Navy Header
  ops.push('1 1 1 rg');
  ops.push(`BT /F2 17 Tf ${margin} ${headerY + 56} Td (${escapePdfLiteral('QUICK RECHARGE')}) Tj ET`);
  ops.push('0.769 0.710 0.992 rg');
  ops.push(`BT /F1 9 Tf ${margin} ${headerY + 38} Td (${escapePdfLiteral('OFFICIAL DIGITAL PAYMENT INVOICE')}) Tj ET`);

  const titleText = truncateText(invoice.title || 'Payment Receipt', 44);
  ops.push('0.90 0.93 0.98 rg');
  ops.push(`BT /F2 11 Tf ${margin} ${headerY + 16} Td (${escapePdfLiteral(titleText)}) Tj ET`);

  // Amount & Status Summary Card
  const summaryH = 74;
  const summaryY = headerY - 22 - summaryH;
  ops.push(`${statusBg} rg`);
  ops.push(`${margin} ${summaryY} ${contentW} ${summaryH} re f`);
  ops.push('0.878 0.855 0.965 RG 0.8 w');
  ops.push(`${margin} ${summaryY} ${contentW} ${summaryH} re S`);

  ops.push('0.392 0.455 0.545 rg');
  ops.push(`BT /F1 8.5 Tf ${margin + 14} ${summaryY + 52} Td (${escapePdfLiteral('TOTAL AMOUNT PAID')}) Tj ET`);

  ops.push('0.055 0.086 0.231 rg');
  ops.push(`BT /F2 22 Tf ${margin + 14} ${summaryY + 22} Td (${escapePdfLiteral(formatAmountRs(invoice.amount))}) Tj ET`);

  // Status text right side
  ops.push(`${statusColor} rg`);
  ops.push(`BT /F2 9.5 Tf ${pageW - margin - 118} ${summaryY + 34} Td (${escapePdfLiteral(statusLabel)}) Tj ET`);

  // Optional Redeem Code Highlight Box
  let cursorY = summaryY - 18;
  if (invoice.redeemCode) {
    const codeBoxH = 50;
    cursorY -= codeBoxH;
    ops.push('0.961 0.953 1.000 rg');
    ops.push(`${margin} ${cursorY} ${contentW} ${codeBoxH} re f`);
    ops.push('0.357 0.208 0.898 RG 1.2 w');
    ops.push(`${margin} ${cursorY} ${contentW} ${codeBoxH} re S`);

    ops.push('0.357 0.208 0.898 rg');
    ops.push(`BT /F2 8 Tf ${margin + 12} ${cursorY + 33} Td (${escapePdfLiteral('GOOGLE PLAY REDEEM CODE')}) Tj ET`);
    ops.push('0.055 0.086 0.231 rg');
    ops.push(`BT /F3 13 Tf ${margin + 12} ${cursorY + 13} Td (${escapePdfLiteral(truncateText(invoice.redeemCode, 34))}) Tj ET`);
    cursorY -= 16;
  }

  // Details Section Header
  ops.push('0.392 0.455 0.545 rg');
  ops.push(`BT /F2 8.5 Tf ${margin} ${cursorY} Td (${escapePdfLiteral('TRANSACTION DETAILS')}) Tj ET`);
  cursorY -= 10;

  ops.push('0.88 0.87 0.94 RG 0.8 w');
  ops.push(`${margin} ${cursorY} m ${pageW - margin} ${cursorY} l S`);
  cursorY -= 20;

  const rows = getCustomerRows(invoice);
  const rowStep = 26;

  for (const row of rows) {
    if (cursorY < 76) break;
    const labelSafe = truncateText(row.label, 24);
    const valueSafe = truncateText(row.value, 36);

    ops.push('0.392 0.455 0.545 rg');
    ops.push(`BT /F1 9.5 Tf ${margin + 4} ${cursorY} Td (${escapePdfLiteral(labelSafe)}) Tj ET`);

    ops.push('0.055 0.086 0.231 rg');
    ops.push(`BT /F2 9.5 Tf ${margin + 148} ${cursorY} Td (${escapePdfLiteral(valueSafe)}) Tj ET`);

    ops.push('0.93 0.92 0.97 RG 0.5 w');
    ops.push(`${margin} ${cursorY - 8} m ${pageW - margin} ${cursorY - 8} l S`);

    cursorY -= rowStep;
  }

  // Verified Status Note
  if (invoice.statusMessage && cursorY >= 72) {
    const noteText = truncateText(invoice.statusMessage, 68);
    ops.push('0.392 0.455 0.545 rg');
    ops.push(`BT /F1 8.5 Tf ${margin + 4} ${cursorY - 2} Td (${escapePdfLiteral(noteText)}) Tj ET`);
  }

  // Footer Bar
  ops.push('0.969 0.969 0.988 rg');
  ops.push(`15 15 ${pageW - 30} 44 re f`);
  ops.push('0.918 0.906 0.961 RG 0.6 w');
  ops.push(`15 59 m ${pageW - 15} 59 l S`);

  ops.push('0.392 0.455 0.545 rg');
  ops.push(
    `BT /F1 8 Tf ${margin} 41 Td (${escapePdfLiteral(
      'Computer-generated receipt. No physical signature required.'
    )}) Tj ET`
  );
  ops.push('0.357 0.208 0.898 rg');
  ops.push(
    `BT /F2 8 Tf ${margin} 27 Td (${escapePdfLiteral(
      'Quick Recharge  |  Verified Wallet Ledger Receipt'
    )}) Tj ET`
  );

  const streamContent = `${ops.join('\n')}\n`;

  // Assemble PDF 1.4 objects with exact byte offsets
  const encoder = new TextEncoder();
  const streamBytesLen = encoder.encode(streamContent).length;

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n',
    `7 0 obj\n<< /Length ${streamBytesLen} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(encoder.encode(pdf).length);
    pdf += obj;
  }

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Blob([pdf], { type: 'application/pdf' });
}

/**
 * Trigger an immediate browser file download of the PDF invoice.
 */
export function downloadInvoicePdf(invoice) {
  const filename = getInvoiceFilename(invoice);
  const blob = buildInvoicePdfBlob(invoice);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { filename, blob };
}

/**
 * Create a browser File object for native mobile OS PDF document sharing (Web Share API).
 */
export function createInvoicePdfFile(invoice) {
  const filename = getInvoiceFilename(invoice);
  const blob = buildInvoicePdfBlob(invoice);
  return new File([blob], filename, { type: 'application/pdf' });
}

/**
 * Detect whether the device browser supports native PDF file sharing (Android/iOS Share Sheet -> WhatsApp).
 */
export function canSharePdfFiles() {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const sample = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [sample] });
  } catch {
    return false;
  }
}

/**
 * Format a clean, structured WhatsApp receipt message to accompany the invoice.
 */
export function buildWhatsAppInvoiceMessage(invoice = {}) {
  const normStatus = String(invoice.status || 'SUCCESSFUL').toUpperCase();
  const statusText =
    normStatus === 'SUCCESSFUL' || normStatus === 'SUCCESS'
      ? 'SUCCESSFUL'
      : normStatus === 'FAILED' || normStatus === 'REJECTED'
      ? 'FAILED'
      : 'PENDING';

  const lines = [
    '*QUICK RECHARGE — OFFICIAL RECEIPT*',
    '--------------------------------',
    `*Service:* ${invoice.title || 'Payment Receipt'}`,
    `*Amount:* ${formatAmountInr(invoice.amount)}`,
    `*Status:* ${statusText}`,
  ];

  const rows = getCustomerRows(invoice);
  for (const row of rows) {
    lines.push(`*${row.label}:* ${row.value}`);
  }

  if (invoice.redeemCode) {
    lines.push('--------------------------------');
    lines.push(`*Google Play Redeem Code:* ${invoice.redeemCode}`);
  }

  lines.push('--------------------------------');
  lines.push('Thank you for using Quick Recharge.');
  return lines.join('\n');
}

/**
 * Extract a default 10-digit Indian customer mobile number if present in the receipt.
 */
export function extractDefaultCustomerPhone(invoice = {}) {
  const candidates = [];
  if (invoice.customerPhone) candidates.push(invoice.customerPhone);
  if (invoice.targetNumber) candidates.push(invoice.targetNumber);
  if (Array.isArray(invoice.details)) {
    for (const row of invoice.details) {
      if (row && /mobile|phone|number/i.test(String(row.label || ''))) {
        candidates.push(row.value);
      }
    }
  }
  for (const raw of candidates) {
    const digits = String(raw || '').replace(/\D/g, '');
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
    if (/^[6-9]\d{9}$/.test(last10)) {
      return last10;
    }
  }
  return '';
}

/**
 * Build a standardized invoice object from a MongoDB transaction document (TransactionsView).
 */
export function buildInvoiceFromTransaction(tx = {}) {
  const typeTitle =
    tx.type === 'MOBILE_RECHARGE'
      ? 'Mobile Recharge'
      : tx.type === 'DTH_RECHARGE'
      ? 'DTH Recharge'
      : tx.type === 'ELECTRICITY_BILL'
      ? 'Electricity Bill Payment'
      : tx.type === 'REDEEM_CODE'
      ? 'Google Play Redeem Code'
      : 'Payment Receipt';

  const targetLabel =
    tx.type === 'MOBILE_RECHARGE'
      ? 'Mobile Number'
      : tx.type === 'DTH_RECHARGE'
      ? 'Subscriber ID'
      : tx.type === 'ELECTRICITY_BILL'
      ? 'Consumer ID'
      : 'Order Reference';

  const details = [{ label: targetLabel, value: tx.targetNumber }];
  if (tx.circle) {
    details.push({
      label: tx.type === 'ELECTRICITY_BILL' ? 'State' : 'Circle',
      value: tx.circle,
    });
  }
  if (tx.operatorRef) {
    details.push({ label: 'Operator Ref', value: tx.operatorRef });
  }

  return {
    title: typeTitle,
    provider: tx.operatorName || typeTitle,
    status: tx.status || 'SUCCESSFUL',
    amount: Number(tx.amount || 0),
    transactionId: tx._id || '',
    targetNumber: tx.targetNumber || '',
    redeemCode: tx.redeemCodeValue || '',
    statusMessage: tx.statusMessage || '',
    timestamp: tx.createdAt || new Date().toISOString(),
    details,
  };
}
