'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { formatINR } from '@/lib/finance.js';
import { formatDateTime } from '@/components/SharedUI.jsx';
import { downloadInvoicePdf } from '@/lib/invoice.js';
import WhatsAppInvoiceModal from '@/components/user/WhatsAppInvoiceModal.jsx';

const BURST_PARTICLES = [
  { x: -62, y: -44, size: 7, color: '#A7F3D0', delay: 0.14 },
  { x: 64, y: -40, size: 6, color: '#FDE68A', delay: 0.16 },
  { x: -74, y: 12, size: 5, color: '#FFFFFF', delay: 0.18 },
  { x: 76, y: 10, size: 7, color: '#C4B5FD', delay: 0.15 },
  { x: -42, y: -68, size: 6, color: '#FFFFFF', delay: 0.12 },
  { x: 46, y: -66, size: 5, color: '#A7F3D0', delay: 0.17 },
  { x: -50, y: 46, size: 5, color: '#FDE68A', delay: 0.2 },
  { x: 52, y: 44, size: 6, color: '#FFFFFF', delay: 0.19 },
];

/**
 * Full-screen fintech animated payment confirmation modal (Success / Pending / Failed).
 * Uses motion/react spring animations, expanding rings, burst particles, and structured receipt details.
 */
export default function TransactionResultModal({
  open,
  onClose,
  status = 'SUCCESSFUL', // 'SUCCESSFUL' | 'PENDING' | 'FAILED'
  title = '',
  subtitle = '',
  amount = 0,
  logo = '',
  logoAlt = '',
  details = [], // [{ label, value, mono?: boolean, highlight?: 'green' | 'purple' }]
  transactionId = '',
  redeemCode = '',
  statusMessage = '',
  timestamp = '',
  primaryActionLabel = 'Done',
}) {
  const [copiedKey, setCopiedKey] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [waOpen, setWaOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !waOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, waOpen, onClose]);

  const normalizedStatus = String(status || 'SUCCESSFUL').toUpperCase();
  const isSuccess = normalizedStatus === 'SUCCESSFUL' || normalizedStatus === 'SUCCESS';
  const isFailed = normalizedStatus === 'FAILED' || normalizedStatus === 'REJECTED';

  const theme = isSuccess
    ? {
        heroBg: 'bg-gradient-to-br from-[#047857] via-[#059669] to-[#10B981]',
        ringColor: 'border-white/35',
        badgeBg: 'bg-white text-[#059669]',
        icon: 'fa-solid fa-check',
        defaultTitle: 'Payment Successful',
        pillBg: 'bg-white/15 text-white border-white/25',
        pillText: 'Verified & Completed',
      }
    : isFailed
      ? {
          heroBg: 'bg-gradient-to-br from-[#991B1B] via-[#DC2626] to-[#EF4444]',
          ringColor: 'border-white/30',
          badgeBg: 'bg-white text-[#DC2626]',
          icon: 'fa-solid fa-xmark',
          defaultTitle: 'Transaction Failed',
          pillBg: 'bg-white/15 text-white border-white/25',
          pillText: 'Auto-Refunded to Wallet',
        }
      : {
          heroBg: 'bg-gradient-to-br from-[#92400E] via-[#D97706] to-[#F59E0B]',
          ringColor: 'border-white/30',
          badgeBg: 'bg-white text-[#D97706]',
          icon: 'fa-solid fa-clock',
          defaultTitle: 'Payment Pending',
          pillBg: 'bg-white/15 text-white border-white/25',
          pillText: 'Held Safely in Pending',
        };

  function handleCopy(key, val) {
    if (!val || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(String(val)).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1800);
  }

  const invoicePayload = {
    title: title || theme.defaultTitle,
    provider: logoAlt || subtitle || title || theme.defaultTitle,
    status: normalizedStatus,
    amount,
    transactionId,
    redeemCode,
    statusMessage,
    timestamp: timestamp || new Date().toISOString(),
    details,
  };

  function handleDownloadInvoice() {
    downloadInvoicePdf(invoicePayload);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2200);
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tx-result-modal-title"
        >
          {/* Animated Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#0E163B]/65 backdrop-blur-[3px]"
            aria-hidden="true"
          />

          {/* Animated Receipt Card */}
          <motion.div
            initial={{ opacity: 0, y: 48, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 32, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-white/20 max-h-[92vh] flex flex-col"
          >
            {/* Animated Celebration Hero Header */}
            <div className={`relative ${theme.heroBg} text-white px-6 pt-7 pb-6 text-center overflow-hidden shrink-0`}>
              {/* Subtle ambient radial glow */}
              <div
                className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-white/15 blur-2xl"
                aria-hidden="true"
              />

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close confirmation"
                className="absolute top-3.5 right-3.5 w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
              </button>

              {/* Animated Status Medallion + Ripple Waves + Celebration Burst */}
              <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
                {/* Expanding Ripple 1 */}
                <motion.span
                  initial={{ scale: 0.65, opacity: 0.8 }}
                  animate={{ scale: 1.75, opacity: 0 }}
                  transition={{ duration: 1.15, ease: 'easeOut', repeat: isSuccess ? 2 : Infinity, repeatDelay: 0.4 }}
                  className={`absolute inset-0 rounded-full border-2 ${theme.ringColor}`}
                  aria-hidden="true"
                />
                {/* Expanding Ripple 2 */}
                <motion.span
                  initial={{ scale: 0.7, opacity: 0.6 }}
                  animate={{ scale: 1.45, opacity: 0 }}
                  transition={{ duration: 0.95, delay: 0.2, ease: 'easeOut', repeat: isSuccess ? 2 : Infinity, repeatDelay: 0.6 }}
                  className={`absolute inset-0 rounded-full border-2 ${theme.ringColor}`}
                  aria-hidden="true"
                />

                {/* Geometric burst dots on Success */}
                {isSuccess &&
                  BURST_PARTICLES.map((p, idx) => (
                    <motion.span
                      key={idx}
                      initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                      animate={{
                        x: p.x,
                        y: p.y,
                        scale: [0, 1.25, 0],
                        opacity: [0, 1, 0],
                      }}
                      transition={{ duration: 0.85, delay: p.delay, ease: 'easeOut' }}
                      style={{
                        width: p.size,
                        height: p.size,
                        backgroundColor: p.color,
                      }}
                      className="absolute rounded-full pointer-events-none"
                      aria-hidden="true"
                    />
                  ))}

                {/* Main Medallion Circle */}
                <motion.div
                  initial={{ scale: 0, rotate: isFailed ? -15 : -35 }}
                  animate={{
                    scale: 1,
                    rotate: 0,
                    x: isFailed ? [0, -6, 6, -4, 4, 0] : 0,
                  }}
                  transition={{
                    scale: { type: 'spring', stiffness: 420, damping: 18, delay: 0.06 },
                    rotate: { type: 'spring', stiffness: 300, damping: 20, delay: 0.06 },
                    x: { duration: 0.45, delay: 0.2 },
                  }}
                  className={`relative z-10 w-16 h-16 rounded-full ${theme.badgeBg} shadow-lg flex items-center justify-center ring-4 ring-white/25`}
                >
                  <motion.i
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.16 }}
                    className={`${theme.icon} text-2xl`}
                    aria-hidden="true"
                  />
                </motion.div>
              </div>

              {/* Animated Title & Amount */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: 0.18 }}
                className="relative mt-3.5 space-y-1"
              >
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold tracking-wide uppercase ${theme.pillBg}`}>
                  <span>{theme.pillText}</span>
                </div>
                <h2 id="tx-result-modal-title" className="font-display text-lg sm:text-xl font-bold tracking-tight">
                  {title || theme.defaultTitle}
                </h2>
                {subtitle && <p className="text-xs text-white/85">{subtitle}</p>}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.24 }}
                className="relative mt-3 font-mono text-3xl sm:text-4xl font-bold tracking-tight tabular-nums"
              >
                {formatINR(amount)}
              </motion.div>

              {timestamp && (
                <div className="relative mt-1.5 text-[11px] text-white/75">
                  {formatDateTime(timestamp)}
                </div>
              )}
            </div>

            {/* Scrollable Structured Digital Receipt Body */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.26 }}
              className="p-5 sm:p-6 space-y-4 overflow-y-auto"
            >
              {/* Google Play Assigned Redeem Code Highlight Box (when delivered) */}
              {redeemCode && (
                <div className="rounded-2xl bg-[#F5F3FF] border-2 border-[#DDD6FE] p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#5B35E5]">
                      Your Google Play Redeem Code
                    </div>
                    <div className="font-mono text-sm sm:text-base font-bold text-[#0E163B] break-all mt-0.5">
                      {redeemCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('redeem', redeemCode)}
                    className="px-3.5 py-2 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors"
                  >
                    <i
                      className={`fa-solid ${copiedKey === 'redeem' ? 'fa-check' : 'fa-copy'} mr-1.5`}
                      aria-hidden="true"
                    />
                    {copiedKey === 'redeem' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}

              {/* Receipt Key-Value Details */}
              <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-4 space-y-2.5 text-xs">
                {logo && (
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#EAE7F5]">
                    <span className="text-[#64748B]">Service / Provider</span>
                    <span className="inline-flex items-center gap-2 font-bold text-[#0E163B]">
                      <Image
                        src={logo}
                        alt={logoAlt || 'Provider'}
                        width={22}
                        height={22}
                        referrerPolicy="no-referrer"
                        className="w-5 h-5 rounded-full object-contain bg-white"
                      />
                      <span>{logoAlt}</span>
                    </span>
                  </div>
                )}

                {details
                  .filter((row) => row && row.value !== undefined && row.value !== null && row.value !== '')
                  .map((row, idx) => (
                    <div key={`${row.label}-${idx}`} className="flex items-center justify-between gap-3">
                      <span className="text-[#64748B] shrink-0">{row.label}</span>
                      <span
                        className={`text-right truncate ${
                          row.mono ? 'font-mono font-bold tabular-nums' : 'font-semibold'
                        } ${
                          row.highlight === 'green'
                            ? 'text-[#15803D]'
                            : row.highlight === 'purple'
                              ? 'text-[#5B35E5]'
                              : 'text-[#0E163B]'
                        }`}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}

                {transactionId && (
                  <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[#EAE7F5]">
                    <span className="text-[#64748B] shrink-0">Transaction ID</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('txid', transactionId)}
                      className="inline-flex items-center gap-1.5 font-mono font-semibold text-[#5B35E5] hover:text-[#4324B8] cursor-pointer truncate"
                    >
                      <span className="truncate">{transactionId}</span>
                      <i
                        className={`fa-solid ${copiedKey === 'txid' ? 'fa-check text-[#15803D]' : 'fa-copy'} text-[11px] shrink-0`}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                )}
              </div>

              {statusMessage && (
                <p className="text-[11px] text-[#475569] text-center leading-relaxed px-1">
                  {statusMessage}
                </p>
              )}

              {/* Invoice Download & Send on WhatsApp Buttons */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadInvoice}
                  className="h-11 rounded-xl bg-[#F5F3FF] hover:bg-[#EDE9FE] border border-[#DDD6FE] text-[#5B35E5] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <i
                    className={`fa-solid ${downloaded ? 'fa-check text-[#15803D]' : 'fa-download'} text-xs`}
                    aria-hidden="true"
                  />
                  <span>{downloaded ? 'Downloaded' : 'Download'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWaOpen(true)}
                  className="h-11 rounded-xl bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-brands fa-whatsapp text-sm" aria-hidden="true" />
                  <span>Send on WhatsApp</span>
                </button>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={onClose}
                className="w-full h-11 sm:h-12 rounded-xl bg-[#0E163B] hover:bg-[#19245A] text-white text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <i className="fa-solid fa-check-double text-xs text-[#C4B5FD]" aria-hidden="true" />
                <span>{primaryActionLabel}</span>
              </button>
            </motion.div>
          </motion.div>

          <WhatsAppInvoiceModal
            open={waOpen}
            onClose={() => setWaOpen(false)}
            invoice={invoicePayload}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
