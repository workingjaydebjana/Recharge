'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { apiRequest } from '@/lib/api-client.js';
import { formatINR } from '@/lib/finance.js';
import { MOBILE_OPERATORS, DTH_OPERATORS, ELECTRICITY_BOARDS } from '@/lib/constants.js';
import { DisputeStatusBadge, InlineAlert, ModalDialog, StatusText, formatDateTime } from '@/components/SharedUI.jsx';
import { buildInvoiceFromTransaction, downloadInvoicePdf } from '@/lib/invoice.js';
import WhatsAppInvoiceModal from '@/components/user/WhatsAppInvoiceModal.jsx';

const SERVICE_FILTERS = [
  { key: 'ALL', label: 'All Services', icon: 'fa-solid fa-layer-group' },
  { key: 'MOBILE_RECHARGE', label: 'Mobile', icon: 'fa-solid fa-mobile-screen-button' },
  { key: 'DTH_RECHARGE', label: 'DTH', icon: 'fa-solid fa-satellite-dish' },
  { key: 'ELECTRICITY_BILL', label: 'Electricity', icon: 'fa-solid fa-bolt-lightning' },
  { key: 'REDEEM_CODE', label: 'Redeem', icon: 'fa-solid fa-gift' },
];

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All', dot: 'bg-[#94A3B8]' },
  { key: 'SUCCESSFUL', label: 'Success', dot: 'bg-[#15803D]' },
  { key: 'PENDING', label: 'Pending', dot: 'bg-[#D97706]' },
  { key: 'FAILED', label: 'Failed', dot: 'bg-[#DC2626]' },
];

const OPERATOR_LOGOS = [...MOBILE_OPERATORS, ...DTH_OPERATORS, ...ELECTRICITY_BOARDS].reduce((acc, op) => {
  if (op.logo) {
    acc[op.code] = op.logo;
    acc[op.name.toLowerCase()] = op.logo;
  }
  return acc;
}, {});

function resolveOperatorLogo(tx) {
  if (tx.operatorCode && OPERATOR_LOGOS[tx.operatorCode]) {
    return OPERATOR_LOGOS[tx.operatorCode];
  }
  const nameKey = String(tx.operatorName || '').toLowerCase();
  if (OPERATOR_LOGOS[nameKey]) return OPERATOR_LOGOS[nameKey];
  if (tx.operatorCode === 'GOOGLE_PLAY' || nameKey.includes('google play')) return '/logos/google-play.svg';
  if (nameKey.includes('wbsedcl')) return '/logos/wbsedcl.svg';
  if (nameKey.includes('cesc')) return '/logos/cesc.svg';
  if (nameKey.includes('jio')) return '/logos/jio.svg';
  if (nameKey.includes('airtel') && tx.type === 'DTH_RECHARGE') return '/logos/airtel-dth.svg';
  if (nameKey.includes('airtel')) return '/logos/airtel.svg';
  if (nameKey.includes('vi') || nameKey.includes('vodafone')) return '/logos/vi.svg';
  if (nameKey.includes('bsnl')) return '/logos/bsnl.svg';
  if (nameKey.includes('tata')) return '/logos/tata-play.svg';
  if (nameKey.includes('dish')) return '/logos/dish-tv.svg';
  if (nameKey.includes('d2h') || nameKey.includes('videocon')) return '/logos/d2h.svg';
  if (nameKey.includes('sun')) return '/logos/sun-direct.svg';
  return null;
}

function getDateGroupLabel(iso) {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function formatTimeOnly(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function ReceiptCard({ tx, expanded, onToggle, onRaiseComplaint, onOpenDispute, onOpenWhatsApp }) {
  const [copiedField, setCopiedField] = useState('');
  const [downloaded, setDownloaded] = useState(false);

  const logoSrc = resolveOperatorLogo(tx);
  const serviceMeta =
    tx.type === 'MOBILE_RECHARGE'
      ? { icon: 'fa-solid fa-mobile-screen-button', bg: 'bg-[#EEF2FF] text-[#4338CA]', label: 'Mobile Recharge' }
      : tx.type === 'DTH_RECHARGE'
      ? { icon: 'fa-solid fa-satellite-dish', bg: 'bg-[#F5F3FF] text-[#6D28D9]', label: 'DTH Recharge' }
      : tx.type === 'ELECTRICITY_BILL'
      ? { icon: 'fa-solid fa-bolt-lightning', bg: 'bg-[#FEF3C7] text-[#B45309]', label: 'Electricity Bill' }
      : { icon: 'fa-solid fa-gift', bg: 'bg-[#ECFDF5] text-[#047857]', label: 'Redeem Code' };

  const normStatus = String(tx.status || '').toUpperCase();
  const accentStrip =
    normStatus === 'SUCCESSFUL'
      ? 'bg-[#15803D]'
      : normStatus === 'PENDING'
      ? 'bg-[#D97706]'
      : 'bg-[#DC2626]';
  const isFailed = normStatus === 'FAILED';

  async function handleCopy(label, value) {
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopiedField(label);
      setTimeout(() => setCopiedField(''), 1800);
    } catch {
      // Ignore clipboard failure
    }
  }

  return (
    <article
      className={`relative bg-white rounded-2xl border transition-all overflow-hidden ${
        expanded
          ? 'border-[#5B35E5] shadow-md ring-2 ring-[#5B35E5]/10'
          : 'border-[#EAE7F5] hover:border-[#D4CCEE] shadow-2xs'
      }`}
    >
      {/* Left Vertical Status Accent Bar */}
      <span className={`absolute inset-y-0 left-0 w-1 ${accentStrip}`} aria-hidden="true" />

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full pl-4 pr-3.5 sm:pl-5 sm:pr-5 py-3.5 sm:py-4 flex items-center justify-between gap-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          {logoSrc ? (
            <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#FAF9FE] border border-[#EAE7F5] flex items-center justify-center shrink-0 overflow-hidden">
              <Image
                src={logoSrc}
                alt={tx.operatorName || serviceMeta.label}
                width={30}
                height={30}
                referrerPolicy="no-referrer"
                className="w-7 h-7 object-contain"
              />
            </span>
          ) : (
            <span className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 text-sm ${serviceMeta.bg}`}>
              <i className={serviceMeta.icon} aria-hidden="true" />
            </span>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-display font-bold text-xs sm:text-sm text-[#0E163B] truncate">
                {tx.operatorName || serviceMeta.label}
              </span>
              <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wide text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] px-1.5 py-0.5 rounded-md shrink-0">
                {serviceMeta.label}
              </span>
            </div>
            <div className="mt-0.5 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-[#64748B]">
              <span className="font-mono font-medium text-[#334155]">{tx.targetNumber}</span>
              <span aria-hidden="true">·</span>
              <span>{formatTimeOnly(tx.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          <div className="text-right">
            <div
              className={`font-mono font-bold text-sm sm:text-base tabular-nums ${
                isFailed ? 'text-[#94A3B8] line-through' : 'text-[#0E163B]'
              }`}
            >
              {formatINR(tx.amount)}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center justify-end gap-1.5">
              {Number(tx.commissionAmount || 0) > 0 && !isFailed && (
                <span className="hidden sm:inline font-mono text-[10px] font-semibold text-[#15803D]">
                  +{formatINR(tx.commissionAmount)}
                </span>
              )}
              <StatusText status={tx.status} />
              {tx.disputeId && <DisputeStatusBadge status={tx.disputeStatus} compact />}
            </div>
          </div>
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              expanded ? 'bg-[#F5F3FF] text-[#5B35E5]' : 'bg-[#F8FAFC] text-[#94A3B8]'
            }`}
          >
            <i
              className={`fa-solid fa-chevron-down text-[10px] transition-transform duration-150 ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </span>
        </div>
      </button>

      {/* Compact Live Request Token & State Strip (visible even when collapsed) */}
      {tx.disputeId && !expanded && (
        <div
          className={`pl-4 pr-3.5 sm:pl-5 sm:pr-5 py-2 border-t text-[11px] flex items-center justify-between gap-2 ${
            ['RESOLVED', 'CLOSED'].includes(String(tx.disputeStatus || '').toUpperCase())
              ? 'bg-[#F0FDF4]/80 border-[#DCFCE7] text-[#166534]'
              : String(tx.disputeStatus || '').toUpperCase() === 'IN_PROGRESS'
              ? 'bg-[#EEF2FF]/80 border-[#E0E7FF] text-[#3730A3]'
              : 'bg-[#FFFBEB]/85 border-[#FEF3C7] text-[#92400E]'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <i className="fa-solid fa-flag text-[10px] shrink-0" aria-hidden="true" />
            <span className="font-semibold shrink-0">Request Raised</span>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span className="font-mono text-[10px] font-semibold truncate">{tx.disputeId}</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide shrink-0">
            {String(tx.disputeStatus || 'OPEN').replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Expandable Digital Receipt Drawer */}
      {expanded && (
        <div className="pl-4 pr-3.5 sm:pl-5 sm:pr-5 pb-4 pt-3 bg-[#FAF9FE] border-t border-dashed border-[#DDD6FE] text-xs space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1 bg-white rounded-xl border border-[#EAE7F5] p-2.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8]">Transaction ID</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-[#0E163B] truncate">{tx._id}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('id', tx._id)}
                  className="text-[10px] font-semibold text-[#5B35E5] hover:underline shrink-0 cursor-pointer"
                >
                  {copiedField === 'id' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#EAE7F5] p-2.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8]">Date &amp; Time</div>
              <div className="mt-1 font-medium text-[11px] text-[#0E163B]">{formatDateTime(tx.createdAt)}</div>
            </div>

            <div className="bg-white rounded-xl border border-[#EAE7F5] p-2.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8]">Commission</div>
              <div className="mt-1 font-mono font-bold text-xs text-[#15803D] tabular-nums">
                {Number(tx.commissionAmount || 0) > 0 ? `+ ${formatINR(tx.commissionAmount)}` : '₹0.00'}
              </div>
            </div>

            {tx.circle && (
              <div className="bg-white rounded-xl border border-[#EAE7F5] p-2.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8]">Circle</div>
                <div className="mt-1 font-medium text-[11px] text-[#0E163B]">{tx.circle}</div>
              </div>
            )}

            {tx.operatorRef && (
              <div className="bg-white rounded-xl border border-[#EAE7F5] p-2.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[#94A3B8]">Operator Ref</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-[#0E163B] truncate">{tx.operatorRef}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('op', tx.operatorRef)}
                    className="text-[10px] font-semibold text-[#5B35E5] hover:underline shrink-0 cursor-pointer"
                  >
                    {copiedField === 'op' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {tx.redeemCodeValue && (
              <div className="col-span-2 sm:col-span-3 bg-[#F5F3FF] rounded-xl border border-[#DDD6FE] p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[#5B35E5]">
                    Assigned Redeem Code
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-[#0E163B] break-all">
                    {tx.redeemCodeValue}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('code', tx.redeemCodeValue)}
                  className="px-3 py-1.5 rounded-lg bg-[#5B35E5] text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                >
                  {copiedField === 'code' ? 'Copied' : 'Copy Code'}
                </button>
              </div>
            )}
          </div>

          {tx.statusMessage && (
            <div className="rounded-xl bg-white border border-[#EAE7F5] px-3 py-2 text-[11px] text-[#475569] flex items-start gap-2">
              <i className="fa-solid fa-circle-info text-[#5B35E5] mt-0.5 shrink-0" aria-hidden="true" />
              <span>{tx.statusMessage}</span>
            </div>
          )}

          {tx.disputeId && (() => {
            const dState = String(tx.disputeStatus || 'OPEN').toUpperCase();
            const isResolved = dState === 'RESOLVED' || dState === 'CLOSED';
            const isReviewing = dState === 'IN_PROGRESS' || isResolved;
            const tone = isResolved
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
              : dState === 'IN_PROGRESS'
              ? 'bg-[#EEF2FF] border-[#C7D2FE] text-[#3730A3]'
              : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]';

            return (
              <div className={`rounded-xl border p-3 space-y-2.5 text-[11px] ${tone}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <i className="fa-solid fa-flag shrink-0" aria-hidden="true" />
                    <span className="font-bold truncate">Not Received Request Raised</span>
                  </div>
                  <DisputeStatusBadge status={dState} />
                </div>

                <div className="flex items-center justify-between gap-2 bg-white/80 rounded-lg px-2.5 py-1.5 border border-black/5">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70 mr-1.5">
                      Token:
                    </span>
                    <span className="font-mono font-bold text-[#0E163B] break-all">{tx.disputeId}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('dispute', tx.disputeId)}
                    className="text-[10px] font-semibold text-[#5B35E5] hover:underline shrink-0 cursor-pointer"
                  >
                    {copiedField === 'dispute' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                {/* 3-Step Request State Tracker */}
                <div className="grid grid-cols-3 gap-1.5 pt-0.5 text-[10px] font-semibold">
                  <div className="flex items-center gap-1">
                    <i className="fa-solid fa-circle-check text-[#15803D]" aria-hidden="true" />
                    <span className="truncate">1. Requested</span>
                  </div>
                  <div className={`flex items-center gap-1 ${isReviewing ? 'opacity-100' : 'opacity-45'}`}>
                    <i
                      className={`fa-solid ${
                        isResolved
                          ? 'fa-circle-check text-[#15803D]'
                          : isReviewing
                          ? 'fa-rotate text-[#4338CA]'
                          : 'fa-circle-dot'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">2. Reviewing</span>
                  </div>
                  <div className={`flex items-center gap-1 ${isResolved ? 'opacity-100' : 'opacity-45'}`}>
                    <i
                      className={`fa-solid ${isResolved ? 'fa-circle-check text-[#15803D]' : 'fa-circle-dot'}`}
                      aria-hidden="true"
                    />
                    <span className="truncate">3. {dState === 'CLOSED' ? 'Closed' : 'Resolved'}</span>
                  </div>
                </div>

                {tx.disputeAdminResponse && (
                  <div className="rounded-lg bg-white/90 border border-black/5 px-2.5 py-2 text-[#334155]">
                    <span className="font-semibold text-[#0E163B]">Support Update: </span>
                    {tx.disputeAdminResponse}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Invoice Download & Send on WhatsApp Strip */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                downloadInvoicePdf(buildInvoiceFromTransaction(tx));
                setDownloaded(true);
                setTimeout(() => setDownloaded(false), 2000);
              }}
              className="h-9 rounded-xl bg-white hover:bg-[#F5F3FF] border border-[#DDD6FE] text-[#5B35E5] text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <i
                className={`fa-solid ${downloaded ? 'fa-check text-[#15803D]' : 'fa-download'}`}
                aria-hidden="true"
              />
              <span>{downloaded ? 'Downloaded' : 'Download'}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenWhatsApp && onOpenWhatsApp(tx)}
              className="h-9 rounded-xl bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <i className="fa-brands fa-whatsapp text-xs" aria-hidden="true" />
              <span>Send on WhatsApp</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#64748B]">
              <i className="fa-solid fa-shield-halved text-[#15803D]" aria-hidden="true" />
              <span>{tx.refunded ? 'Refunded to Current Balance' : 'Verified Wallet Ledger Entry'}</span>
            </span>

            <div className="flex items-center justify-end gap-2 shrink-0">
              {normStatus === 'SUCCESSFUL' &&
                (tx.disputeId ? (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap ${
                      ['RESOLVED', 'CLOSED'].includes(String(tx.disputeStatus || '').toUpperCase())
                        ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                        : 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]'
                    }`}
                  >
                    <i
                      className={`fa-solid ${
                        ['RESOLVED', 'CLOSED'].includes(String(tx.disputeStatus || '').toUpperCase())
                          ? 'fa-circle-check'
                          : 'fa-clock'
                      }`}
                      aria-hidden="true"
                    />
                    <span>
                      {['RESOLVED', 'CLOSED'].includes(String(tx.disputeStatus || '').toUpperCase())
                        ? 'Dispute Resolved'
                        : 'Dispute Raised'}
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenDispute && onOpenDispute(tx)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] hover:bg-[#FEF3C7] text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                    <span>Not Received</span>
                  </button>
                ))}

              {onRaiseComplaint && (
                <button
                  type="button"
                  onClick={() => onRaiseComplaint(tx)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DDD6FE] text-[#5B35E5] hover:bg-[#F5F3FF] text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  <i className="fa-solid fa-headset" aria-hidden="true" />
                  <span>Report Issue</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default function TransactionsView({
  token,
  initialStatus = 'ALL',
  initialTransactions = null,
  onRaiseComplaint,
}) {
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState(initialStatus || 'ALL');
  const [search, setSearch] = useState('');
  const [transactions, setTransactions] = useState(() =>
    initialStatus === 'ALL' && Array.isArray(initialTransactions) ? initialTransactions : []
  );
  const [loading, setLoading] = useState(() =>
    !(initialStatus === 'ALL' && Array.isArray(initialTransactions) && initialTransactions.length > 0)
  );
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [disputeTx, setDisputeTx] = useState(null);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState('');
  const [disputeSuccess, setDisputeSuccess] = useState('');
  const [waInvoice, setWaInvoice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (serviceFilter !== 'ALL') params.set('type', serviceFilter);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());

    apiRequest(`/api/user/transactions?${params.toString()}`, { token })
      .then((data) => {
        if (!cancelled) {
          setTransactions(data.transactions || []);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, serviceFilter, statusFilter, search, refreshKey]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setRefreshKey((n) => n + 1);
  }, []);

  const handleOpenDispute = useCallback((tx) => {
    setDisputeTx(tx);
    setDisputeNote('');
    setDisputeError('');
  }, []);

  const handleCloseDispute = useCallback(() => {
    if (disputeSubmitting) return;
    setDisputeTx(null);
    setDisputeNote('');
    setDisputeError('');
  }, [disputeSubmitting]);

  async function handleSubmitDispute(e) {
    e.preventDefault();
    if (!disputeTx || disputeSubmitting) return;
    setDisputeSubmitting(true);
    setDisputeError('');
    try {
      const data = await apiRequest('/api/user/transactions/dispute', {
        method: 'POST',
        token,
        body: {
          transactionId: disputeTx._id,
          note: disputeNote.trim(),
        },
      });
      const updated = data.transaction;
      setTransactions((prev) =>
        prev.map((item) =>
          item._id === disputeTx._id
            ? {
                ...item,
                disputeId: updated?.disputeId || data.dispute?._id,
                disputeStatus: updated?.disputeStatus || 'OPEN',
                disputedAt: updated?.disputedAt || new Date().toISOString(),
              }
            : item
        )
      );
      setDisputeSuccess(
        data.message || `Not Received dispute (${data.dispute?._id}) submitted for operator verification.`
      );
      setDisputeTx(null);
      setDisputeNote('');
    } catch (err) {
      setDisputeError(err.message || 'Unable to submit Not Received dispute.');
    } finally {
      setDisputeSubmitting(false);
    }
  }

  const stats = useMemo(() => {
    let totalVolume = 0;
    let successCount = 0;
    let totalCommission = 0;
    for (const tx of transactions) {
      if (tx.status !== 'FAILED') {
        totalVolume += Number(tx.amount || 0);
      }
      if (tx.status === 'SUCCESSFUL') {
        successCount += 1;
        totalCommission += Number(tx.commissionAmount || 0);
      }
    }
    return {
      totalCount: transactions.length,
      totalVolume,
      successCount,
      totalCommission,
    };
  }, [transactions]);

  const groupedTransactions = useMemo(() => {
    const groups = [];
    const map = new Map();
    for (const tx of transactions) {
      const label = getDateGroupLabel(tx.createdAt);
      if (!map.has(label)) {
        const entry = { label, items: [] };
        map.set(label, entry);
        groups.push(entry);
      }
      map.get(label).items.push(tx);
    }
    return groups;
  }, [transactions]);

  const hasActiveFilters = serviceFilter !== 'ALL' || statusFilter !== 'ALL' || search.trim().length > 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0E163B]">Transaction History</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Tap any receipt to view reference IDs, operator details, commission earned, or raise support.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#EAE7F5] hover:border-[#5B35E5] text-xs font-semibold text-[#0E163B] shadow-2xs transition-colors shrink-0 cursor-pointer"
        >
          <i className={`fa-solid fa-arrows-rotate text-[#5B35E5] ${loading ? 'fa-spin' : ''}`} aria-hidden="true" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Unique Navy-Lavender Live Summary Ribbon */}
      <section className="navy-surface rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-white grid grid-cols-3 gap-2.5 sm:gap-4 shadow-sm">
        <div className="rounded-xl bg-white/8 border border-white/10 p-2.5 sm:p-3.5">
          <div className="text-[10px] sm:text-[11px] font-medium text-[#CBD5E1] flex items-center gap-1.5">
            <i className="fa-solid fa-indian-rupee-sign text-[#C4B5FD]" aria-hidden="true" />
            <span className="truncate">Volume</span>
          </div>
          <div className="font-mono text-sm sm:text-xl font-bold tabular-nums mt-1 truncate">
            {formatINR(stats.totalVolume)}
          </div>
        </div>
        <div className="rounded-xl bg-white/8 border border-white/10 p-2.5 sm:p-3.5">
          <div className="text-[10px] sm:text-[11px] font-medium text-[#CBD5E1] flex items-center gap-1.5">
            <i className="fa-solid fa-circle-check text-[#86EFAC]" aria-hidden="true" />
            <span className="truncate">Successful</span>
          </div>
          <div className="font-mono text-sm sm:text-xl font-bold tabular-nums mt-1">
            {stats.successCount}
            <span className="text-[11px] font-normal text-[#94A3B8]"> / {stats.totalCount}</span>
          </div>
        </div>
        <div className="rounded-xl bg-white/8 border border-white/10 p-2.5 sm:p-3.5">
          <div className="text-[10px] sm:text-[11px] font-medium text-[#CBD5E1] flex items-center gap-1.5">
            <i className="fa-solid fa-coins text-[#86EFAC]" aria-hidden="true" />
            <span className="truncate">Earned</span>
          </div>
          <div className="font-mono text-sm sm:text-xl font-bold text-[#86EFAC] tabular-nums mt-1 truncate">
            {formatINR(stats.totalCommission)}
          </div>
        </div>
      </section>

      {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
      {disputeSuccess && (
        <InlineAlert type="success" message={disputeSuccess} onClose={() => setDisputeSuccess('')} />
      )}

      {/* Modern Unified Search & Filter Dock */}
      <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div className="relative">
          <i
            className="fa-solid fa-magnifying-glass text-[#94A3B8] text-xs sm:text-sm absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, mobile number, DTH ID, consumer ID, or board..."
            aria-label="Search transactions"
            className="w-full h-10 pl-9 pr-9 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs sm:text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5] transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg text-[#94A3B8] hover:text-[#0E163B] flex items-center justify-center cursor-pointer"
            >
              <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Service Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {SERVICE_FILTERS.map((f) => {
              const active = serviceFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setServiceFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#5B35E5] text-white border-[#5B35E5] shadow-xs'
                      : 'bg-[#FAF9FE] text-[#475569] border-[#EAE7F5] hover:border-[#C4B5FD] hover:text-[#0E163B]'
                  }`}
                >
                  <i className={`${f.icon} text-[11px]`} aria-hidden="true" />
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>

          {/* Status Filter Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#0E163B] text-white border-[#0E163B]'
                      : 'bg-white text-[#475569] border-[#EAE7F5] hover:border-[#CBD5E1]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : f.dot}`} aria-hidden="true" />
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Date-Grouped Receipt Feed */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-[#EAE7F5] p-10 text-center text-xs text-[#64748B]">
          <i className="fa-solid fa-spinner fa-spin mr-2 text-[#5B35E5]" aria-hidden="true" />
          Loading your transactions...
        </div>
      ) : groupedTransactions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#EAE7F5] p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F3FF] text-[#5B35E5] flex items-center justify-center mx-auto">
            <i className="fa-solid fa-receipt text-lg" aria-hidden="true" />
          </div>
          <div>
            <div className="font-display font-bold text-sm text-[#0E163B]">No matching transactions found</div>
            <p className="text-xs text-[#64748B] mt-1 max-w-xs mx-auto">
              {hasActiveFilters
                ? 'Try resetting your search or switching service and status filters.'
                : 'Completed Mobile, DTH, Electricity Bill, and Redeem Code orders will appear here as digital receipts.'}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setServiceFilter('ALL');
                setStatusFilter('ALL');
                setSearch('');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] text-xs font-semibold text-[#5B35E5] hover:bg-[#EDE9FE] cursor-pointer"
            >
              <i className="fa-solid fa-rotate-left text-[11px]" aria-hidden="true" />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groupedTransactions.map((group) => (
            <section key={group.label} className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                  {group.label}
                </span>
                <span className="text-[11px] font-medium text-[#94A3B8]">
                  {group.items.length} {group.items.length === 1 ? 'order' : 'orders'}
                </span>
              </div>
              <div className="space-y-2.5">
                {group.items.map((tx) => (
                  <ReceiptCard
                    key={tx._id}
                    tx={tx}
                    expanded={expandedId === tx._id}
                    onToggle={() => setExpandedId((prev) => (prev === tx._id ? null : tx._id))}
                    onRaiseComplaint={onRaiseComplaint}
                    onOpenDispute={handleOpenDispute}
                    onOpenWhatsApp={(item) => setWaInvoice(buildInvoiceFromTransaction(item))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* WhatsApp Invoice Modal */}
      <WhatsAppInvoiceModal
        open={Boolean(waInvoice)}
        onClose={() => setWaInvoice(null)}
        invoice={waInvoice}
      />

      {/* Not Received Dispute Modal */}
      <ModalDialog
        open={Boolean(disputeTx)}
        title="Recharge Not Received?"
        onClose={handleCloseDispute}
        maxWidth="max-w-md"
      >
        {disputeTx && (
          <form onSubmit={handleSubmitDispute} className="space-y-4">
            <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-3.5 py-2.5 text-xs text-[#92400E] flex items-start gap-2.5">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0 text-[#D97706]" aria-hidden="true" />
              <span className="leading-relaxed">
                This receipt shows <strong>Successful</strong>, but the recharge or benefit was not credited to the
                customer&apos;s phone/account. Submit a priority dispute for operator verification.
              </span>
            </div>

            <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm text-[#0E163B] truncate">
                    {disputeTx.operatorName || disputeTx.type}
                  </div>
                  <div className="font-mono text-[#475569] mt-0.5">{disputeTx.targetNumber}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-base text-[#0E163B] tabular-nums">
                    {formatINR(disputeTx.amount)}
                  </div>
                  <StatusText status={disputeTx.status} />
                </div>
              </div>

              <div className="pt-2 border-t border-dashed border-[#DDD6FE] grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[#94A3B8] uppercase text-[10px] font-semibold block">Transaction ID</span>
                  <span className="font-mono font-semibold text-[#0E163B] break-all">{disputeTx._id}</span>
                </div>
                <div>
                  <span className="text-[#94A3B8] uppercase text-[10px] font-semibold block">Operator Ref</span>
                  <span className="font-mono font-semibold text-[#0E163B] break-all">
                    {disputeTx.operatorRef || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="dispute-note"
                className="block text-xs font-semibold text-[#0E163B] mb-1.5"
              >
                Additional Details <span className="font-normal text-[#94A3B8]">(Optional)</span>
              </label>
              <textarea
                id="dispute-note"
                rows={3}
                maxLength={500}
                value={disputeNote}
                onChange={(e) => setDisputeNote(e.target.value)}
                placeholder="Example: Checked customer phone balance and SMS, recharge plan was not activated."
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] px-3.5 py-2.5 text-xs sm:text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5] transition-colors resize-none"
              />
            </div>

            {disputeError && (
              <InlineAlert type="error" message={disputeError} onClose={() => setDisputeError('')} />
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleCloseDispute}
                disabled={disputeSubmitting}
                className="px-4 py-2.5 rounded-xl bg-white border border-[#E2E8F0] text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={disputeSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D97706] hover:bg-[#B45309] disabled:opacity-60 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <i
                  className={`fa-solid ${disputeSubmitting ? 'fa-spinner fa-spin' : 'fa-flag'}`}
                  aria-hidden="true"
                />
                <span>{disputeSubmitting ? 'Submitting...' : 'Submit Not Received Dispute'}</span>
              </button>
            </div>
          </form>
        )}
      </ModalDialog>
    </div>
  );
}
