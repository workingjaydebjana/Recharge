'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatINR } from '@/lib/finance.js';
import {
  buildWhatsAppInvoiceMessage,
  canSharePdfFiles,
  createInvoicePdfFile,
  downloadInvoicePdf,
  extractDefaultCustomerPhone,
  getInvoiceFilename,
} from '@/lib/invoice.js';

/**
 * Customer WhatsApp Number input dialog that prepares the real PDF Invoice
 * and launches WhatsApp cleanly (both direct customer chat + native PDF share on mobile).
 */
export default function WhatsAppInvoiceModal({ open, onClose, invoice }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [sharingPdf, setSharingPdf] = useState(false);

  const defaultPhone = invoice ? extractDefaultCustomerPhone(invoice) : '';
  const supportsFileShare = open ? canSharePdfFiles() : false;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const effectivePhone = phone !== '' ? phone : defaultPhone;
  const filename = invoice ? getInvoiceFilename(invoice) : 'QuickRecharge-Invoice.pdf';

  function handleClose() {
    setPhone('');
    setError('');
    setStatusNote('');
    onClose();
  }

  async function handleContinue(e) {
    e.preventDefault();
    if (!invoice) return;
    setError('');
    setStatusNote('');

    const digits = String(effectivePhone || '').replace(/\D/g, '');
    const normalized = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;

    if (!/^[6-9]\d{9}$/.test(normalized)) {
      setError('Enter a valid 10-digit customer WhatsApp mobile number.');
      return;
    }

    // 1. Download the genuine PDF invoice document to the device so it's ready to attach
    downloadInvoicePdf(invoice);

    // 2. Open the exact customer's WhatsApp chat directly via an anchor click (no window.open)
    const message = buildWhatsAppInvoiceMessage(invoice);
    const waUrl = `https://wa.me/91${normalized}?text=${encodeURIComponent(message)}`;
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setStatusNote(
      `Invoice PDF (${filename}) saved and WhatsApp opened for +91 ${normalized}. In WhatsApp, tap Attach -> Document to send the PDF file, or use "Share PDF Directly" below.`
    );
  }

  async function handleNativePdfShare() {
    if (!invoice || sharingPdf) return;
    setError('');
    setStatusNote('');
    setSharingPdf(true);
    try {
      const pdfFile = createInvoicePdfFile(invoice);
      const message = buildWhatsAppInvoiceMessage(invoice);
      await navigator.share({
        title: `Quick Recharge Invoice (${invoice.transactionId || ''})`,
        text: message,
        files: [pdfFile],
      });
      setStatusNote('PDF invoice shared successfully.');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError('Unable to open native PDF share on this browser. Please use Continue above.');
      }
    } finally {
      setSharingPdf(false);
    }
  }

  return (
    <AnimatePresence>
      {open && invoice && (
        <div
          className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wa-invoice-modal-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-[#0E163B]/65 backdrop-blur-[2px]"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: 36, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="relative z-10 w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl border border-[#EAE7F5] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#0E163B] via-[#172357] to-[#15803D] text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <i className="fa-brands fa-whatsapp text-lg text-[#86EFAC]" aria-hidden="true" />
                </span>
                <div>
                  <h3 id="wa-invoice-modal-title" className="font-display font-bold text-sm sm:text-base leading-tight">
                    Send Invoice on WhatsApp
                  </h3>
                  <p className="text-[11px] text-white/80 mt-0.5">
                    PDF receipt + instant customer chat
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close WhatsApp dialog"
                className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleContinue} className="p-5 space-y-4">
              {/* Attached PDF Document Preview Card */}
              <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-3 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-file-pdf text-base" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] font-bold text-[#0E163B] truncate">{filename}</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center gap-1.5">
                    <span className="truncate">{invoice.provider || invoice.title}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-semibold text-[#0E163B] shrink-0">
                      {formatINR(invoice.amount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Customer WhatsApp Number Input */}
              <div>
                <label
                  htmlFor="customer-whatsapp-number"
                  className="block text-xs font-semibold text-[#0E163B] mb-1.5"
                >
                  Customer WhatsApp Number
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-mono font-bold text-[#475569] select-none">
                    +91
                  </span>
                  <input
                    id="customer-whatsapp-number"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={effectivePhone}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setPhone(clean);
                      if (error) setError('');
                    }}
                    placeholder="Enter 10-digit WhatsApp number"
                    autoFocus
                    className="w-full h-12 pl-12 pr-4 rounded-xl border-2 border-[#EAE7F5] focus:border-[#15803D] bg-[#FAF9FE] focus:bg-white font-mono text-sm font-semibold text-[#0E163B] outline-none transition-colors"
                  />
                </div>
                <p className="text-[11px] text-[#64748B] mt-1.5">
                  Downloads the PDF invoice and opens WhatsApp directly for this customer.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B] flex items-start gap-2"
                >
                  <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {statusNote && (
                <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2.5 text-[11px] text-[#166534] leading-relaxed flex items-start gap-2">
                  <i className="fa-solid fa-circle-check mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{statusNote}</span>
                </div>
              )}

              <div className="space-y-2 pt-0.5">
                <button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <i className="fa-brands fa-whatsapp text-base" aria-hidden="true" />
                  <span>Continue to WhatsApp</span>
                </button>

                {supportsFileShare && (
                  <button
                    type="button"
                    disabled={sharingPdf}
                    onClick={handleNativePdfShare}
                    className="w-full h-10 rounded-xl bg-[#F5F3FF] hover:bg-[#EDE9FE] border border-[#DDD6FE] text-[#5B35E5] text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <i
                      className={`fa-solid ${sharingPdf ? 'fa-spinner fa-spin' : 'fa-file-arrow-up'}`}
                      aria-hidden="true"
                    />
                    <span>Share PDF Document Directly</span>
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
