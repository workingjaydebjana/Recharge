'use client';

import Link from 'next/link';
import { formatINR } from '@/lib/finance.js';
import { ExpandableTransactionRow } from '@/components/SharedUI.jsx';

export default function DashboardView({
  user,
  wallet,
  settings = null,
  commissions = [],
  summary,
  recentTransactions,
  onOpenAddBalance,
  onRaiseComplaint,
}) {
  const isSuspended = user?.status === 'SUSPENDED';
  const firstName = String(user?.fullName || 'Retailer').split(' ')[0];

  const isCategoryClosed = (serviceType, settingKey) => {
    if (settings?.[settingKey] === false) return true;
    const rules = (commissions || []).filter((r) => r.serviceType === serviceType);
    if (rules.length > 0 && rules.every((r) => r.isActive === false)) return true;
    return false;
  };

  const mobileClosed = isCategoryClosed('MOBILE', 'mobileRechargeEnabled');
  const dthClosed = isCategoryClosed('DTH', 'dthRechargeEnabled');
  const electricityClosed = isCategoryClosed('ELECTRICITY', 'electricityBillEnabled');
  const redeemClosed = isCategoryClosed('REDEEM_CODE', 'redeemCodeEnabled');

  return (
    <div className="space-y-4 sm:space-y-6">
      {isSuspended && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3.5 text-sm text-[#991B1B] flex items-start gap-3"
        >
          <i className="fa-solid fa-ban mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <div className="font-bold text-xs sm:text-sm">Account Suspended</div>
            <p className="text-xs mt-0.5">
              Your account has been suspended by the administrator. Recharges, deposits, and purchases are disabled until reactivated.
            </p>
          </div>
        </div>
      )}

      {/* Mobile-First Premium Fintech Wallet Hero */}
      <section className="lavender-wash rounded-3xl border border-[#EAE7F5] p-4 sm:p-6 space-y-4 sm:space-y-5">
        {/* Top Balance Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#64748B] truncate">
              Hi, {firstName} · {user?.city || 'India'}
            </p>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B35E5] mt-2">
              Current Balance
            </div>
            <div
              data-testid="current-balance-value"
              className="font-mono text-3xl sm:text-4xl font-bold text-[#0E163B] tabular-nums tracking-tight mt-0.5"
            >
              {formatINR(wallet?.currentBalance || 0)}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenAddBalance}
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <i className="fa-solid fa-plus" aria-hidden="true" />
            <span>Add Balance</span>
          </button>
        </div>

        {/* 4 Quick Actions — All 4 Primary Services */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 pt-1">
          <Link
            href="/mobile-recharge"
            className={`flex flex-col items-center gap-1.5 group ${mobileClosed ? 'opacity-65' : ''}`}
          >
            <span className="relative w-12 h-12 rounded-2xl bg-white border border-[#EAE7F5] group-hover:border-[#5B35E5] shadow-xs flex items-center justify-center text-[#4338CA] transition-colors">
              <i className="fa-solid fa-mobile-screen-button text-base" aria-hidden="true" />
              {mobileClosed && (
                <span className="absolute -top-1.5 -right-1.5 px-1 py-0.2 rounded bg-[#DC2626] text-white text-[8px] font-bold">
                  OFF
                </span>
              )}
            </span>
            <span className="text-[11px] sm:text-xs font-semibold text-[#0E163B]">Mobile</span>
          </Link>

          <Link
            href="/dth-recharge"
            className={`flex flex-col items-center gap-1.5 group ${dthClosed ? 'opacity-65' : ''}`}
          >
            <span className="relative w-12 h-12 rounded-2xl bg-white border border-[#EAE7F5] group-hover:border-[#5B35E5] shadow-xs flex items-center justify-center text-[#6D28D9] transition-colors">
              <i className="fa-solid fa-satellite-dish text-base" aria-hidden="true" />
              {dthClosed && (
                <span className="absolute -top-1.5 -right-1.5 px-1 py-0.2 rounded bg-[#DC2626] text-white text-[8px] font-bold">
                  OFF
                </span>
              )}
            </span>
            <span className="text-[11px] sm:text-xs font-semibold text-[#0E163B]">DTH</span>
          </Link>

          <Link
            href="/electricity-bill"
            className={`flex flex-col items-center gap-1.5 group ${electricityClosed ? 'opacity-65' : ''}`}
          >
            <span className="relative w-12 h-12 rounded-2xl bg-white border border-[#EAE7F5] group-hover:border-[#5B35E5] shadow-xs flex items-center justify-center text-[#B45309] transition-colors">
              <i className="fa-solid fa-bolt-lightning text-base" aria-hidden="true" />
              {electricityClosed && (
                <span className="absolute -top-1.5 -right-1.5 px-1 py-0.2 rounded bg-[#DC2626] text-white text-[8px] font-bold">
                  OFF
                </span>
              )}
            </span>
            <span className="text-[11px] sm:text-xs font-semibold text-[#0E163B]">Electricity</span>
          </Link>

          <Link
            href="/redeem-code"
            className={`flex flex-col items-center gap-1.5 group ${redeemClosed ? 'opacity-65' : ''}`}
          >
            <span className="relative w-12 h-12 rounded-2xl bg-white border border-[#EAE7F5] group-hover:border-[#5B35E5] shadow-xs flex items-center justify-center text-[#047857] transition-colors">
              <i className="fa-solid fa-gift text-base" aria-hidden="true" />
              {redeemClosed && (
                <span className="absolute -top-1.5 -right-1.5 px-1 py-0.2 rounded bg-[#DC2626] text-white text-[8px] font-bold">
                  OFF
                </span>
              )}
            </span>
            <span className="text-[11px] sm:text-xs font-semibold text-[#0E163B]">Redeem</span>
          </Link>
        </div>

        {/* Two Professional Side-by-Side Balance Boxes (Pending + Commission) */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Pending Balance Box */}
          <Link
            href="/transactions?status=PENDING"
            className="text-left bg-white rounded-2xl border border-[#EAE7F5] hover:border-[#F59E0B] p-3.5 sm:p-4 transition-colors flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-semibold text-[#64748B]">Pending</span>
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#FFFBEB] text-[#B45309] flex items-center justify-center shrink-0">
                <i className="fa-solid fa-hourglass-half text-xs" aria-hidden="true" />
              </span>
            </div>
            <div
              data-testid="pending-balance-value"
              className="font-mono text-lg sm:text-2xl font-bold text-[#B45309] tabular-nums mt-2 truncate"
            >
              {formatINR(wallet?.pendingBalance || 0)}
            </div>
            <div className="mt-2 pt-2 border-t border-[#F1EEF9] flex items-center justify-between text-[11px] font-semibold text-[#B45309]">
              <span>View Pending</span>
              <i className="fa-solid fa-chevron-right text-[9px]" aria-hidden="true" />
            </div>
          </Link>

          {/* Commission Balance Box */}
          <Link
            href="/commission"
            className="text-left bg-white rounded-2xl border border-[#EAE7F5] hover:border-[#15803D] p-3.5 sm:p-4 transition-colors flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-semibold text-[#64748B]">Commission</span>
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#ECFDF5] text-[#15803D] flex items-center justify-center shrink-0">
                <i className="fa-solid fa-coins text-xs" aria-hidden="true" />
              </span>
            </div>
            <div
              data-testid="commission-balance-value"
              className="font-mono text-lg sm:text-2xl font-bold text-[#15803D] tabular-nums mt-2 truncate"
            >
              {formatINR(wallet?.commissionBalance || 0)}
            </div>
            <div className="mt-2 pt-2 border-t border-[#F1EEF9] flex items-center justify-between text-[11px] font-semibold text-[#15803D]">
              <span>Transfer (Min ₹50)</span>
              <i className="fa-solid fa-chevron-right text-[9px]" aria-hidden="true" />
            </div>
          </Link>
        </div>
      </section>

      {/* Primary Services — 4 Symmetrical Service Cards */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-sm sm:text-base font-bold text-[#0E163B]">Primary Services</h2>
          <span className="text-[11px] sm:text-xs text-[#64748B]">4 Services</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/mobile-recharge"
            className={`text-left bg-white rounded-2xl border p-3.5 sm:p-5 transition-colors group ${
              mobileClosed ? 'border-[#FECACA] bg-[#FEF2F2]/30 opacity-80' : 'border-[#EAE7F5] hover:border-[#5B35E5]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center">
                <i className="fa-solid fa-mobile-screen-button text-sm sm:text-lg" aria-hidden="true" />
              </span>
              {mobileClosed ? (
                <span className="px-2 py-0.5 rounded-md bg-[#FEE2E2] text-[#DC2626] text-[10px] font-bold">
                  Closed
                </span>
              ) : (
                <i
                  className="fa-solid fa-arrow-right text-[11px] text-[#94A3B8] group-hover:text-[#5B35E5] transition-colors"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="font-display font-bold text-xs sm:text-base text-[#0E163B] mt-3">Mobile Recharge</div>
            <p className="text-[11px] sm:text-xs text-[#64748B] mt-0.5 line-clamp-2">
              {mobileClosed ? 'Temporarily closed by administrator.' : 'Jio, Airtel, Vi & BSNL across all circles.'}
            </p>
          </Link>

          <Link
            href="/dth-recharge"
            className={`text-left bg-white rounded-2xl border p-3.5 sm:p-5 transition-colors group ${
              dthClosed ? 'border-[#FECACA] bg-[#FEF2F2]/30 opacity-80' : 'border-[#EAE7F5] hover:border-[#5B35E5]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#F5F3FF] text-[#6D28D9] flex items-center justify-center">
                <i className="fa-solid fa-satellite-dish text-sm sm:text-lg" aria-hidden="true" />
              </span>
              {dthClosed ? (
                <span className="px-2 py-0.5 rounded-md bg-[#FEE2E2] text-[#DC2626] text-[10px] font-bold">
                  Closed
                </span>
              ) : (
                <i
                  className="fa-solid fa-arrow-right text-[11px] text-[#94A3B8] group-hover:text-[#5B35E5] transition-colors"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="font-display font-bold text-xs sm:text-base text-[#0E163B] mt-3">DTH Recharge</div>
            <p className="text-[11px] sm:text-xs text-[#64748B] mt-0.5 line-clamp-2">
              {dthClosed ? 'Temporarily closed by administrator.' : 'Tata Play, Airtel DTH, Dish TV, d2h & Sun.'}
            </p>
          </Link>

          <Link
            href="/electricity-bill"
            className={`text-left bg-white rounded-2xl border p-3.5 sm:p-5 transition-colors group ${
              electricityClosed ? 'border-[#FECACA] bg-[#FEF2F2]/30 opacity-80' : 'border-[#EAE7F5] hover:border-[#5B35E5]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center">
                <i className="fa-solid fa-bolt-lightning text-sm sm:text-lg" aria-hidden="true" />
              </span>
              {electricityClosed ? (
                <span className="px-2 py-0.5 rounded-md bg-[#FEE2E2] text-[#DC2626] text-[10px] font-bold">
                  Closed
                </span>
              ) : (
                <i
                  className="fa-solid fa-arrow-right text-[11px] text-[#94A3B8] group-hover:text-[#5B35E5] transition-colors"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="font-display font-bold text-xs sm:text-base text-[#0E163B] mt-3">Electricity Bill</div>
            <p className="text-[11px] sm:text-xs text-[#64748B] mt-0.5 line-clamp-2">
              {electricityClosed ? 'Temporarily closed by administrator.' : 'WBSEDCL & CESC (West Bengal) electricity bills.'}
            </p>
          </Link>

          <Link
            href="/redeem-code"
            className={`text-left bg-white rounded-2xl border p-3.5 sm:p-5 transition-colors group ${
              redeemClosed ? 'border-[#FECACA] bg-[#FEF2F2]/30 opacity-80' : 'border-[#EAE7F5] hover:border-[#5B35E5]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#ECFDF5] text-[#047857] flex items-center justify-center">
                <i className="fa-solid fa-gift text-sm sm:text-lg" aria-hidden="true" />
              </span>
              {redeemClosed ? (
                <span className="px-2 py-0.5 rounded-md bg-[#FEE2E2] text-[#DC2626] text-[10px] font-bold">
                  Closed
                </span>
              ) : (
                <i
                  className="fa-solid fa-arrow-right text-[11px] text-[#94A3B8] group-hover:text-[#5B35E5] transition-colors"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="font-display font-bold text-xs sm:text-base text-[#0E163B] mt-3">Redeem Code</div>
            <p className="text-[11px] sm:text-xs text-[#64748B] mt-0.5 line-clamp-2">
              {redeemClosed ? 'Temporarily closed by administrator.' : 'Google Play redeem codes directly from wallet.'}
            </p>
          </Link>
        </div>
      </section>

      {/* Transaction Summary (2x2 Side-by-Side Boxes) + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <div className="lg:col-span-4 bg-white rounded-2xl border border-[#EAE7F5] p-4 sm:p-5">
          <h2 className="text-sm sm:text-base font-bold text-[#0E163B] mb-3">Transaction Summary</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <div className="rounded-xl bg-[#FAF9FE] border border-[#F1EEF9] p-3">
              <div className="text-[11px] text-[#64748B]">Total Orders</div>
              <div className="font-mono text-xl sm:text-2xl font-bold text-[#0E163B] tabular-nums mt-0.5">
                {summary?.total || 0}
              </div>
            </div>
            <div className="rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] p-3">
              <div className="text-[11px] text-[#166534]">Successful</div>
              <div className="font-mono text-xl sm:text-2xl font-bold text-[#15803D] tabular-nums mt-0.5">
                {summary?.successful || 0}
              </div>
            </div>
            <div className="rounded-xl bg-[#FFFBEB] border border-[#FEF3C7] p-3">
              <div className="text-[11px] text-[#92400E]">Pending</div>
              <div className="font-mono text-xl sm:text-2xl font-bold text-[#B45309] tabular-nums mt-0.5">
                {summary?.pending || 0}
              </div>
            </div>
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] p-3">
              <div className="text-[11px] text-[#991B1B]">Failed</div>
              <div className="font-mono text-xl sm:text-2xl font-bold text-[#DC2626] tabular-nums mt-0.5">
                {summary?.failed || 0}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#EAE7F5] flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-[#0E163B]">Recent Transactions</h2>
            <Link
              href="/transactions"
              className="text-xs font-semibold text-[#5B35E5] hover:underline"
            >
              See all
            </Link>
          </div>
          {recentTransactions && recentTransactions.length > 0 ? (
            <div>
              {recentTransactions.map((tx) => (
                <ExpandableTransactionRow
                  key={tx._id}
                  tx={tx}
                  onRaiseComplaint={onRaiseComplaint}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center space-y-2.5">
              <div className="w-11 h-11 rounded-2xl bg-[#F5F3FF] text-[#5B35E5] flex items-center justify-center mx-auto">
                <i className="fa-solid fa-receipt text-base" aria-hidden="true" />
              </div>
              <div className="font-semibold text-sm text-[#0E163B]">No transactions yet</div>
              <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                Add money to your Current Balance from My Wallet to start Mobile, DTH, Electricity Bill, or Redeem Code orders.
              </p>
              <button
                type="button"
                onClick={onOpenAddBalance}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5B35E5] text-white text-xs font-semibold hover:bg-[#4C28D4] cursor-pointer"
              >
                <i className="fa-solid fa-plus" aria-hidden="true" />
                <span>Add Balance</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
