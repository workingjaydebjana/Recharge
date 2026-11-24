'use client';

import { useState } from 'react';
import { formatINR } from '@/lib/finance.js';
import { apiRequest } from '@/lib/api-client.js';
import { StatusText, formatDateTime } from '@/components/SharedUI.jsx';

export default function AdminOverviewAndReports({
  token,
  overview,
  mode = 'DASHBOARD', // 'DASHBOARD' | 'REPORTS'
  onDateFilterChange,
  onNavigate,
}) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const report = overview?.report || {
    counts: {},
    turnover: {},
    settlement: {},
    walletLiabilities: {},
    platformRevenue: {},
  };

  async function handleApplyFilter(e) {
    e.preventDefault();
    await onDateFilterChange(fromDate, toDate);
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ format: 'csv' });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await apiRequest(`/api/admin/overview?${params.toString()}`, { token });
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quick-recharge-financial-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  if (!overview) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0E163B]">
              {mode === 'REPORTS' ? 'Reports & Financial Analytics' : 'Super Admin Dashboard'}
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">Loading live platform ledger and financial summary...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-white border border-[#EAE7F5] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0E163B]">
            {mode === 'REPORTS' ? 'Reports & Financial Analytics' : 'Super Admin Dashboard'}
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Real-time financial separation between Customer Wallet Liabilities, Gross Turnover, and Platform Revenue.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0E163B] hover:bg-[#19245A] text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
        >
          <i className={`fa-solid ${exporting ? 'fa-spinner fa-spin' : 'fa-file-csv'}`} aria-hidden="true" />
          <span>{exporting ? 'Exporting...' : 'Download CSV Report'}</span>
        </button>
      </div>

      {/* Date Range Filter Bar (Always visible in Reports, compact in Dashboard) */}
      {mode === 'REPORTS' && (
        <form
          onSubmit={handleApplyFilter}
          className="bg-white rounded-2xl border border-[#EAE7F5] p-4 flex flex-wrap items-end gap-3"
        >
          <div>
            <label htmlFor="rep-from" className="block text-xs font-semibold text-[#334155] mb-1">
              From Date
            </label>
            <input
              id="rep-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs font-mono"
            />
          </div>
          <div>
            <label htmlFor="rep-to" className="block text-xs font-semibold text-[#334155] mb-1">
              To Date
            </label>
            <input
              id="rep-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-4 h-10 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-xs font-semibold cursor-pointer"
          >
            Apply Date Filter
          </button>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setFromDate('');
                setToDate('');
                onDateFilterChange('', '');
              }}
              className="px-4 h-10 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#475569] cursor-pointer"
            >
              Reset
            </button>
          )}
        </form>
      )}

      {/* Critical Accounting Separation: Liabilities vs Turnover vs Revenue (2 side-by-side on mobile) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-5">
          <div className="text-[11px] sm:text-xs font-semibold text-[#64748B]">Customer Wallet Liabilities</div>
          <div className="font-mono text-lg sm:text-2xl font-bold text-[#0E163B] tabular-nums mt-1 truncate">
            {formatINR(report.walletLiabilities.totalWalletLiabilities || 0)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-[#64748B] mt-2 space-y-0.5 font-mono">
            <div>Current: {formatINR(report.walletLiabilities.totalCurrentLiability || 0)}</div>
            <div>Pending: {formatINR(report.walletLiabilities.totalPendingLiability || 0)}</div>
            <div>Comm: {formatINR(report.walletLiabilities.totalCommissionLiability || 0)}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-5">
          <div className="text-[11px] sm:text-xs font-semibold text-[#64748B]">Gross Transaction Turnover</div>
          <div className="font-mono text-lg sm:text-2xl font-bold text-[#5B35E5] tabular-nums mt-1 truncate">
            {formatINR(report.turnover.totalGrossTurnover || 0)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-[#64748B] mt-2 space-y-0.5 font-mono">
            <div>Mobile: {formatINR(report.turnover.mobileVolume || 0)}</div>
            <div>DTH: {formatINR(report.turnover.dthVolume || 0)}</div>
            <div>Redeem: {formatINR(report.turnover.redeemVolume || 0)}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-5">
          <div className="text-[11px] sm:text-xs font-semibold text-[#64748B]">Gateway Deposits &amp; Refunds</div>
          <div className="font-mono text-lg sm:text-2xl font-bold text-[#15803D] tabular-nums mt-1 truncate">
            {formatINR(report.settlement.approvedDepositsTotal || 0)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-[#64748B] mt-2 space-y-0.5 font-mono">
            <div>Pending Deposits: {report.counts.pendingDepositsCount || 0}</div>
            <div>Total Refunds: {formatINR(report.settlement.totalRefundedAmount || 0)}</div>
            <div>Commissions Paid: {formatINR(report.settlement.totalCommissionCredited || 0)}</div>
          </div>
        </div>

        <div className="navy-surface rounded-2xl p-3.5 sm:p-5 text-white">
          <div className="text-[11px] sm:text-xs font-semibold text-[#C4B5FD]">Est. Platform Net Margin</div>
          <div className="font-mono text-lg sm:text-2xl font-bold text-white tabular-nums mt-1 truncate">
            {formatINR(report.platformRevenue.estimatedNetPlatformRevenue || 0)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-[#CBD5E1] mt-2 leading-relaxed">
            Separated from customer liabilities. Users: {report.counts.activeUsers || 0} active /{' '}
            {report.counts.suspendedUsers || 0} suspended.
          </div>
        </div>
      </div>

      {/* Operational Counters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl border border-[#EAE7F5] p-4">
          <div className="text-xs text-[#64748B]">Total Transactions</div>
          <div className="font-mono text-xl font-bold text-[#0E163B] tabular-nums mt-1">
            {report.counts.totalTransactions || 0}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#EAE7F5] p-4">
          <div className="text-xs text-[#166534]">Successful</div>
          <div className="font-mono text-xl font-bold text-[#15803D] tabular-nums mt-1">
            {report.counts.successfulCount || 0}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#EAE7F5] p-4">
          <div className="text-xs text-[#92400E]">Pending Investigation</div>
          <div className="font-mono text-xl font-bold text-[#B45309] tabular-nums mt-1">
            {report.counts.pendingCount || 0}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#EAE7F5] p-4">
          <div className="text-xs text-[#991B1B]">Failed</div>
          <div className="font-mono text-xl font-bold text-[#DC2626] tabular-nums mt-1">
            {report.counts.failedCount || 0}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#EAE7F5] p-4">
          <div className="text-xs text-[#64748B]">Open Complaints</div>
          <div className="font-mono text-xl font-bold text-[#5B35E5] tabular-nums mt-1">
            {overview?.openComplaints || 0}
          </div>
        </div>
      </div>

      {/* Recent Activity Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EAE7F5] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0E163B]">Recent Gateway Deposits</h2>
            <button
              type="button"
              onClick={() => onNavigate('DEPOSITS')}
              className="text-xs font-semibold text-[#5B35E5] hover:underline cursor-pointer"
            >
              View all
            </button>
          </div>
          {!(overview?.recentDeposits?.length || overview?.pendingDeposits?.length) ? (
            <div className="p-6 text-xs text-[#64748B] text-center">No deposits recorded yet.</div>
          ) : (
            <div className="divide-y divide-[#EAE7F5] text-xs">
              {(overview.recentDeposits || overview.pendingDeposits).map((d) => (
                <div key={d._id} className="px-5 py-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#0E163B]">
                      {d.userName} {d.userMobile ? `(${d.userMobile})` : ''}
                    </div>
                    <div className="font-mono text-[11px] text-[#64748B]">
                      {d.paymentMode} · {d.referenceNumber}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-[#0E163B] tabular-nums">{formatINR(d.amount)}</div>
                    <StatusText status={d.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EAE7F5] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0E163B]">Latest Platform Transactions</h2>
            <button
              type="button"
              onClick={() => onNavigate('TRANSACTIONS')}
              className="text-xs font-semibold text-[#5B35E5] hover:underline cursor-pointer"
            >
              View all
            </button>
          </div>
          {!overview?.recentTransactions?.length ? (
            <div className="p-6 text-xs text-[#64748B] text-center">No transactions recorded yet.</div>
          ) : (
            <div className="divide-y divide-[#EAE7F5] text-xs">
              {overview.recentTransactions.map((t) => (
                <div key={t._id} className="px-5 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#0E163B] truncate">
                      {t.operatorName} · <span className="font-mono">{t.targetNumber}</span>
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      {t.userName} · {formatDateTime(t.createdAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-[#0E163B] tabular-nums">{formatINR(t.amount)}</div>
                    <StatusText status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
