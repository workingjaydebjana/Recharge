'use client';

import { useState } from 'react';
import { formatINR } from '@/lib/finance.js';

export function formatDateTime(iso) {
  if (!iso) return '—';
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

export function BrandLogo({ compact = false, platformName = 'Quick Recharge' }) {
  return (
    <span className="inline-flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 select-none">
      <span className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl navy-surface text-white shadow-sm shrink-0">
        <i className="fa-solid fa-bolt text-xs sm:text-sm text-[#C4B5FD]" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="font-display text-[15px] sm:text-lg font-bold tracking-tight text-[#0E163B] leading-none">
          {platformName}
        </span>
      )}
    </span>
  );
}

export function StatusText({ status }) {
  const norm = String(status || '').toUpperCase();
  if (['SUCCESSFUL', 'APPROVED', 'ACTIVE', 'ASSIGNED', 'RESOLVED', 'CLOSED', 'AVAILABLE'].includes(norm)) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-[#15803D] whitespace-nowrap">
        <i className="fa-solid fa-circle-check text-[10px] sm:text-[11px]" aria-hidden="true" />
        <span>{norm.charAt(0) + norm.slice(1).toLowerCase()}</span>
      </span>
    );
  }
  if (['PENDING', 'PROCESSING', 'OPEN', 'IN_PROGRESS'].includes(norm)) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-[#B45309] whitespace-nowrap">
        <i className="fa-solid fa-clock text-[10px] sm:text-[11px]" aria-hidden="true" />
        <span>{norm.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-[#DC2626] whitespace-nowrap">
      <i className="fa-solid fa-circle-xmark text-[10px] sm:text-[11px]" aria-hidden="true" />
      <span>{norm.charAt(0) + norm.slice(1).toLowerCase()}</span>
    </span>
  );
}

export function DisputeStatusBadge({ status, compact = false }) {
  const norm = String(status || 'OPEN').toUpperCase();
  const cfg =
    norm === 'RESOLVED'
      ? {
          label: compact ? 'Dispute · Resolved' : 'Resolved',
          icon: 'fa-solid fa-circle-check',
          cls: 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]',
        }
      : norm === 'CLOSED'
      ? {
          label: compact ? 'Dispute · Closed' : 'Closed',
          icon: 'fa-solid fa-circle-check',
          cls: 'bg-[#F1F5F9] border-[#CBD5E1] text-[#475569]',
        }
      : norm === 'IN_PROGRESS'
      ? {
          label: compact ? 'Dispute · Reviewing' : 'In Progress',
          icon: 'fa-solid fa-rotate',
          cls: 'bg-[#EEF2FF] border-[#C7D2FE] text-[#4338CA]',
        }
      : {
          label: compact ? 'Dispute · Open' : 'Open',
          icon: 'fa-solid fa-flag',
          cls: 'bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]',
        };

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold whitespace-nowrap leading-tight ${cfg.cls}`}
    >
      <i className={`${cfg.icon} text-[9px]`} aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
}

export function InlineAlert({ type = 'info', message, onClose }) {
  if (!message) return null;
  const styles = {
    error: 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]',
    success: 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]',
    warning: 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]',
    info: 'bg-[#F5F3FF] border-[#DDD6FE] text-[#3B2696]',
  };
  const icons = {
    error: 'fa-solid fa-circle-exclamation',
    success: 'fa-solid fa-circle-check',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-circle-info',
  };

  return (
    <div
      role="alert"
      className={`rounded-xl border px-3.5 py-3 text-xs sm:text-sm flex items-start justify-between gap-2.5 ${styles[type] || styles.info}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <i className={`${icons[type] || icons.info} mt-0.5 shrink-0`} aria-hidden="true" />
        <span className="leading-relaxed break-words">{message}</span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss message"
          className="opacity-70 hover:opacity-100 transition-opacity p-1 cursor-pointer shrink-0"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function ModalDialog({ open, title, onClose, children, maxWidth = 'max-w-lg' }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-[#0E163B]/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`w-full ${maxWidth} bg-white rounded-2xl border border-[#EAE7F5] shadow-xl overflow-hidden max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#EAE7F5]">
          <h3 className="text-sm sm:text-base font-bold text-[#0E163B]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F5F3FF] hover:text-[#0E163B] transition-colors cursor-pointer"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/**
 * Expandable Transaction Row optimized for mobile & desktop fintech readability.
 */
export function ExpandableTransactionRow({ tx, onRaiseComplaint }) {
  const [expanded, setExpanded] = useState(false);

  const iconInfo =
    tx.type === 'MOBILE_RECHARGE'
      ? { icon: 'fa-solid fa-mobile-screen-button', bg: 'bg-[#EEF2FF] text-[#4338CA]', label: 'Mobile Recharge' }
      : tx.type === 'DTH_RECHARGE'
      ? { icon: 'fa-solid fa-satellite-dish', bg: 'bg-[#F5F3FF] text-[#6D28D9]', label: 'DTH Recharge' }
      : tx.type === 'ELECTRICITY_BILL'
      ? { icon: 'fa-solid fa-bolt-lightning', bg: 'bg-[#FEF3C7] text-[#B45309]', label: 'Electricity Bill' }
      : { icon: 'fa-solid fa-gift', bg: 'bg-[#ECFDF5] text-[#047857]', label: 'Redeem Code' };

  const isFailed = tx.status === 'FAILED';

  return (
    <div className="border-b border-[#EAE7F5] last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="w-full px-3.5 sm:px-5 py-3.5 flex items-center justify-between gap-2.5 sm:gap-3 text-left hover:bg-[#FAF9FE] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 text-sm ${iconInfo.bg}`}>
            <i className={iconInfo.icon} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-xs sm:text-sm text-[#0E163B] truncate">
              {tx.operatorName || iconInfo.label}
            </div>
            <div className="text-[11px] sm:text-xs text-[#64748B] flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
              <span className="font-mono">{tx.targetNumber}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{formatDateTime(tx.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
          <div className="text-right">
            <div
              className={`font-mono font-semibold text-xs sm:text-sm tabular-nums ${
                isFailed ? 'text-[#94A3B8] line-through' : 'text-[#0E163B]'
              }`}
            >
              - {formatINR(tx.amount)}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center justify-end gap-1.5">
              <StatusText status={tx.status} />
              {tx.disputeId && <DisputeStatusBadge status={tx.disputeStatus} compact />}
            </div>
          </div>
          <i
            className={`fa-solid fa-chevron-down text-[10px] sm:text-xs text-[#94A3B8] transition-transform duration-150 ${
              expanded ? 'rotate-180 text-[#5B35E5]' : ''
            }`}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 sm:px-5 pb-4 pt-2.5 bg-[#FAF9FE] border-t border-[#F1EEF9] text-xs space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-[#64748B] text-[11px]">Transaction ID</div>
              <div className="font-mono font-medium text-[#0E163B] mt-0.5 break-all">{tx._id}</div>
            </div>
            <div>
              <div className="text-[#64748B] text-[11px]">Service / Circle</div>
              <div className="font-medium text-[#0E163B] mt-0.5">
                {iconInfo.label}
                {tx.circle ? ` · ${tx.circle}` : ''}
              </div>
            </div>
            <div>
              <div className="text-[#64748B] text-[11px]">Commission Earned</div>
              <div className="font-mono font-medium text-[#15803D] mt-0.5 tabular-nums">
                {Number(tx.commissionAmount || 0) > 0 ? `+ ${formatINR(tx.commissionAmount)}` : '₹0.00'}
              </div>
            </div>
            {tx.operatorRef && (
              <div>
                <div className="text-[#64748B] text-[11px]">Operator Ref</div>
                <div className="font-mono font-medium text-[#0E163B] mt-0.5 break-all">{tx.operatorRef}</div>
              </div>
            )}
            {tx.redeemCodeValue && (
              <div className="col-span-2">
                <div className="text-[#64748B] text-[11px]">Assigned Redeem Code</div>
                <div className="font-mono font-semibold text-[#5B35E5] mt-0.5 break-all">{tx.redeemCodeValue}</div>
              </div>
            )}
          </div>

          {tx.statusMessage && (
            <div className="text-[#475569] bg-white rounded-lg border border-[#EAE7F5] px-3 py-2">
              {tx.statusMessage}
            </div>
          )}

          {tx.disputeId && (
            <div className="rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-[#92400E]">
              <span className="truncate">
                Not Received Request · Token <strong className="font-mono">{tx.disputeId}</strong>
              </span>
              <DisputeStatusBadge status={tx.disputeStatus} />
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[#64748B] text-[11px]">
              {tx.refunded ? 'Refunded to Current Balance' : 'Verified Wallet Ledger Entry'}
            </span>
            {onRaiseComplaint && (
              <button
                type="button"
                onClick={() => onRaiseComplaint(tx)}
                className="inline-flex items-center gap-1.5 text-[#5B35E5] hover:text-[#4324B8] font-semibold cursor-pointer"
              >
                <i className="fa-solid fa-headset" aria-hidden="true" />
                <span>Report Issue</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
