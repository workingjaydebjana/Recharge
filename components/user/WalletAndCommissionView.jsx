'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { formatINR } from '@/lib/finance.js';
import { MOBILE_OPERATORS, DTH_OPERATORS, ELECTRICITY_BOARDS } from '@/lib/constants.js';
import { apiRequest } from '@/lib/api-client.js';
import {
  InlineAlert,
  ModalDialog,
  StatusText,
  formatDateTime,
} from '@/components/SharedUI.jsx';
import { WalletPinConfirmBox } from '@/components/user/WalletPinInput.jsx';
import TransactionResultModal from '@/components/user/TransactionResultModal.jsx';

const OPERATOR_LOGO_MAP = {
  ...[...MOBILE_OPERATORS, ...DTH_OPERATORS, ...ELECTRICITY_BOARDS].reduce((acc, op) => {
    acc[op.code] = op.logo;
    return acc;
  }, {}),
  GOOGLE_PLAY: '/logos/google-play.svg',
};

export default function WalletAndCommissionView({
  token,
  mode = 'WALLET',
  initialWallet = null,
  initialCommissions = null,
  onOpenAddBalance,
  onSuccessRefresh,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Commission transfer state
  const [transferAmount, setTransferAmount] = useState('');
  const [trfConfirmOpen, setTrfConfirmOpen] = useState(false);
  const [walletPin, setWalletPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [trfSubmitting, setTrfSubmitting] = useState(false);
  const [lastTransfer, setLastTransfer] = useState(null);

  const loadWalletData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/user/wallet', { token });
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const syncedCurrentBalance = initialWallet?.currentBalance ?? null;

  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/user/wallet', { token })
      .then((res) => {
        if (!cancelled) setData(res);
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
  }, [token, syncedCurrentBalance]);

  function handleOpenCommissionConfirm(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const num = Number(transferAmount);
    const minTrf = data?.commissionSummary?.minTransfer ?? 50;
    const availComm = Number(
      (data?.wallet || initialWallet)?.commissionBalance || 0
    );
    if (!Number.isFinite(num) || num < minTrf) {
      setError(`Minimum commission transfer amount is ${formatINR(minTrf)}.`);
      return;
    }
    if (num > availComm) {
      setError(`Insufficient Commission Balance (${formatINR(availComm)}).`);
      return;
    }
    setWalletPin('');
    setPinError('');
    setTrfConfirmOpen(true);
  }

  async function handleConfirmCommissionTransfer() {
    if (!/^\d{6}$/.test(walletPin)) {
      setPinError('Enter your 6-digit Wallet PIN to authorize this transfer.');
      return;
    }
    setError('');
    setPinError('');
    setSuccess('');
    setTrfSubmitting(true);
    try {
      const idempotencyKey = `CTRF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await apiRequest('/api/user/commission/transfer', {
        method: 'POST',
        token,
        body: {
          amount: Number(transferAmount),
          walletPin,
          idempotencyKey,
        },
      });
      setSuccess(res.message);
      setLastTransfer({
        transferId: res.transferId,
        amount: res.amount,
        newBalance: res.wallet?.currentBalance,
        message: res.message,
        createdAt: new Date().toISOString(),
      });
      setTransferAmount('');
      setWalletPin('');
      setTrfConfirmOpen(false);
      await loadWalletData();
      await onSuccessRefresh();
    } catch (err) {
      const msg = err?.message || 'Unable to process commission transfer.';
      if (/wallet pin/i.test(msg)) {
        setPinError(msg);
        setWalletPin('');
      } else {
        setTrfConfirmOpen(false);
        setWalletPin('');
        setError(msg);
      }
    } finally {
      setTrfSubmitting(false);
    }
  }

  const wallet = data?.wallet || initialWallet || { currentBalance: 0, pendingBalance: 0, commissionBalance: 0 };
  const commissionsList = data?.commissions || initialCommissions || [];
  const minTransfer = data?.commissionSummary?.minTransfer ?? 50;
  const totalEarned = data?.commissionSummary?.totalEarned || 0;
  const canTransferAll = Number(wallet.commissionBalance || 0) >= minTransfer;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0E163B]">
            {mode === 'COMMISSION' ? 'My Commission' : 'My Wallet & Ledger'}
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            {mode === 'COMMISSION'
              ? 'Track your earnings, review operator margins, and transfer commission to your Current Balance.'
              : 'Manage your three-balance wallet, add balance, and review your permanent ledger.'}
          </p>
        </div>
      </div>

      {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
      {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

      {/* MODE: MY WALLET -> Three Balances (Current, Pending, Commission) */}
      {mode === 'WALLET' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <div className="col-span-2 md:col-span-1 lavender-wash rounded-2xl border border-[#EAE7F5] p-4 sm:p-5 flex items-center justify-between gap-3 md:flex-col md:items-start">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#5B35E5]">Current Balance</div>
              <div className="font-mono text-2xl sm:text-3xl font-bold text-[#0E163B] tabular-nums mt-1">
                {formatINR(wallet.currentBalance)}
              </div>
              <div className="text-[11px] text-[#64748B] mt-1">Available for all services</div>
            </div>
            {onOpenAddBalance && (
              <button
                type="button"
                onClick={onOpenAddBalance}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer md:mt-2"
              >
                <i className="fa-solid fa-plus" aria-hidden="true" />
                <span>Add Balance</span>
              </button>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-5">
            <div className="text-[11px] sm:text-xs font-semibold text-[#64748B]">Pending Balance</div>
            <div className="font-mono text-lg sm:text-2xl font-bold text-[#B45309] tabular-nums mt-1 truncate">
              {formatINR(wallet.pendingBalance)}
            </div>
            <div className="text-[11px] text-[#64748B] mt-1">Held until settled</div>
          </div>
          <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-5">
            <div className="text-[11px] sm:text-xs font-semibold text-[#64748B]">Commission</div>
            <div className="font-mono text-lg sm:text-2xl font-bold text-[#15803D] tabular-nums mt-1 truncate">
              {formatINR(wallet.commissionBalance)}
            </div>
            <div className="text-[11px] text-[#64748B] mt-1 truncate">
              Earned: {formatINR(totalEarned)}
            </div>
          </div>
        </div>
      )}

      {/* MODE: MY COMMISSION -> Dedicated Two-Balance Fintech Showcase (Commission + Current Balance ONLY) */}
      {mode === 'COMMISSION' && (
        <section
          aria-label="Commission and Current Balances"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4"
        >
          {/* Card 1: Commission Balance (Emerald Fintech Card) */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#064E3B] via-[#065F46] to-[#047857] text-white p-5 sm:p-6 shadow-md border border-[#10B981]/25">
            <div
              className="pointer-events-none absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10"
              aria-hidden="true"
            />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A7F3D0]">
                  <i className="fa-solid fa-coins" aria-hidden="true" />
                  <span>Commission Balance</span>
                </span>
                <div
                  data-testid="commission-page-balance"
                  className="font-mono text-3xl sm:text-4xl font-bold tracking-tight tabular-nums mt-2"
                >
                  {formatINR(wallet.commissionBalance)}
                </div>
              </div>
              <span className="w-11 h-11 rounded-2xl bg-white/15 border border-white/15 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-percent text-[#A7F3D0] text-base" aria-hidden="true" />
              </span>
            </div>

            <div className="relative mt-4 pt-3.5 border-t border-white/15 flex items-center justify-between gap-2 text-xs">
              <span className="text-[#D1FAE5]">
                Lifetime Earned:{' '}
                <strong className="font-mono text-white tabular-nums">{formatINR(totalEarned)}</strong>
              </span>
              <span className="text-[11px] font-semibold text-[#A7F3D0] whitespace-nowrap">
                Min ₹{minTransfer} transfer
              </span>
            </div>
          </div>

          {/* Card 2: Current Balance (Deep Navy Destination Wallet Card) */}
          <div className="relative overflow-hidden rounded-3xl navy-surface text-white p-5 sm:p-6 shadow-md border border-[#5B35E5]/30">
            <div
              className="pointer-events-none absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-[#5B35E5]/25"
              aria-hidden="true"
            />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#C4B5FD]">
                  <i className="fa-solid fa-wallet" aria-hidden="true" />
                  <span>Current Balance</span>
                </span>
                <div
                  data-testid="commission-page-current-balance"
                  className="font-mono text-3xl sm:text-4xl font-bold tracking-tight tabular-nums mt-2"
                >
                  {formatINR(wallet.currentBalance)}
                </div>
              </div>
              <span className="w-11 h-11 rounded-2xl bg-white/12 border border-white/15 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-bolt text-[#C4B5FD] text-base" aria-hidden="true" />
              </span>
            </div>

            <div className="relative mt-4 pt-3.5 border-t border-white/12 flex items-center justify-between gap-2 text-xs">
              <span className="text-[#CBD5E1]">Transfer destination wallet</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C4B5FD] whitespace-nowrap">
                <i className="fa-solid fa-circle-check text-[10px]" aria-hidden="true" />
                <span>Ready for recharges</span>
              </span>
            </div>
          </div>
        </section>
      )}

      {/* MODE: MY WALLET -> Clean Add Balance Card + Deposit History + Permanent Ledger */}
      {mode === 'WALLET' && (
        <>
          <section className="bg-white rounded-2xl border border-[#EAE7F5] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="w-11 h-11 rounded-2xl bg-[#F5F3FF] border border-[#DDD6FE] text-[#5B35E5] flex items-center justify-center shrink-0">
                <i className="fa-solid fa-wallet text-base" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#0E163B]">Add Balance to Wallet</h2>
                <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">
                  Enter the amount you want to add and proceed to payment securely.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenAddBalance}
              className="w-full sm:w-auto px-5 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <i className="fa-solid fa-plus" aria-hidden="true" />
              <span>Add Balance</span>
            </button>
          </section>

          {/* Deposit Requests History (shown when records exist) */}
          {!loading && data?.deposits?.length > 0 && (
            <section className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#EAE7F5]">
                <h2 className="text-base font-bold text-[#0E163B]">Deposit History</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9FE] text-[#64748B] border-b border-[#EAE7F5]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Deposit ID</th>
                      <th className="py-3 px-4 font-semibold">Mode &amp; UTR</th>
                      <th className="py-3 px-4 font-semibold text-right">Amount</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Remark</th>
                      <th className="py-3 px-4 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAE7F5]">
                    {data.deposits.map((dep) => (
                      <tr key={dep._id} className="hover:bg-[#FAF9FE]">
                        <td className="py-3 px-4 font-mono font-semibold text-[#0E163B]">{dep._id}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-[#0E163B]">{dep.paymentMode}</span>
                          <span className="text-[#64748B] font-mono ml-2">{dep.referenceNumber}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-[#0E163B] tabular-nums">
                          {formatINR(dep.amount)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusText status={dep.status} />
                        </td>
                        <td className="py-3 px-4 text-[#475569]">{dep.adminRemark || dep.remarks || '—'}</td>
                        <td className="py-3 px-4 text-[#64748B] whitespace-nowrap">{formatDateTime(dep.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Permanent Wallet Ledger */}
          <section className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAE7F5] flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0E163B]">Permanent Wallet Ledger</h2>
              <span className="text-xs text-[#64748B]">Immutable audit trail</span>
            </div>
            {!data?.ledger?.length ? (
              <div className="p-8 text-center text-xs text-[#64748B]">No wallet ledger entries yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9FE] text-[#64748B] border-b border-[#EAE7F5]">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Date</th>
                      <th className="py-3 px-4 font-semibold">Balance</th>
                      <th className="py-3 px-4 font-semibold">Description</th>
                      <th className="py-3 px-4 font-semibold text-right">Amount</th>
                      <th className="py-3 px-4 font-semibold text-right">Balance After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAE7F5]">
                    {data.ledger.map((row) => (
                      <tr key={row._id} className="hover:bg-[#FAF9FE]">
                        <td className="py-3 px-4 text-[#64748B] whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                        <td className="py-3 px-4 font-semibold text-[#0E163B]">{row.balanceType}</td>
                        <td className="py-3 px-4 text-[#334155]">
                          <div>{row.description}</div>
                          <div className="font-mono text-[11px] text-[#94A3B8]">{row.referenceId}</div>
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                            row.direction === 'CREDIT' ? 'text-[#15803D]' : 'text-[#DC2626]'
                          }`}
                        >
                          {row.direction === 'CREDIT' ? '+' : '-'} {formatINR(row.amount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#0E163B] tabular-nums whitespace-nowrap">
                          {formatINR(row.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* MODE: MY COMMISSION -> Transfer to Current Balance + Super Admin Rates Table */}
      {mode === 'COMMISSION' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          <form
            onSubmit={handleOpenCommissionConfirm}
            className="lg:col-span-5 bg-white rounded-3xl border border-[#EAE7F5] p-5 sm:p-6 space-y-4 h-fit shadow-xs"
          >
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#F5F3FF] text-[#5B35E5] flex items-center justify-center shrink-0">
                <i className="fa-solid fa-arrow-right-arrow-left text-sm" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#0E163B]">Transfer to Current Balance</h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Move earned commission into your Current Balance (min <strong>₹{minTransfer}</strong>; bank withdrawal not supported).
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="comm-trf-amount" className="block text-xs font-semibold text-[#334155]">
                  Transfer Amount (₹)
                </label>
                {canTransferAll && (
                  <button
                    type="button"
                    onClick={() => setTransferAmount(String(Number(wallet.commissionBalance).toFixed(2)))}
                    className="text-[11px] font-semibold text-[#5B35E5] hover:underline cursor-pointer"
                  >
                    Use Full Balance
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-[#64748B]">₹</span>
                <input
                  id="comm-trf-amount"
                  type="number"
                  min={minTransfer}
                  step="0.01"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder={`Minimum ${minTransfer}`}
                  required
                  className="w-full h-11 pl-8 pr-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-sm font-semibold tabular-nums text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={trfSubmitting}
              className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <i className={`fa-solid ${trfSubmitting ? 'fa-spinner fa-spin' : 'fa-arrow-right-arrow-left'}`} aria-hidden="true" />
              <span>{trfSubmitting ? 'Transferring...' : 'Transfer to Current Balance'}</span>
            </button>
          </form>

          {/* Read-Only Operator Commission Rates Table (Configured exclusively by Super Admin) */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-[#EAE7F5] overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-[#EAE7F5] flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#0E163B]">Active Commission Structure</h2>
                <p className="text-xs text-[#64748B]">Official operator rates managed by Super Admin.</p>
              </div>
              <span className="w-8 h-8 rounded-xl bg-[#FAF9FE] border border-[#EAE7F5] flex items-center justify-center text-[#94A3B8] shrink-0">
                <i className="fa-solid fa-lock text-xs" aria-hidden="true" />
              </span>
            </div>
            <div className="divide-y divide-[#F1EEF9]">
              {commissionsList.map((rule) => {
                const logoSrc = OPERATOR_LOGO_MAP[rule.operatorCode];
                const isClosed = rule.isActive === false;
                const val = Number(rule.rateValue || 0);
                const isFee = !isClosed && rule.rateType === 'fixed' && val < 0;
                const serviceLabel =
                  rule.serviceType === 'ELECTRICITY'
                    ? 'Electricity Bill'
                    : rule.serviceType === 'DTH'
                      ? 'DTH Recharge'
                      : rule.serviceType === 'REDEEM_CODE'
                        ? 'Redeem Code'
                        : 'Mobile Recharge';
                const modeLabel =
                  rule.rateType === 'fixed'
                    ? isFee
                      ? 'Fixed Service Fee'
                      : 'Fixed Flat ₹'
                    : 'Percentage (%)';

                return (
                  <div
                    key={rule._id}
                    className={`px-4 sm:px-5 py-3 flex items-center justify-between gap-3 transition-colors ${
                      isClosed ? 'bg-[#FEF2F2]/40 opacity-80' : 'hover:bg-[#FAF9FE]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 overflow-hidden ${
                          rule.serviceType === 'ELECTRICITY' && !logoSrc
                            ? 'bg-[#FEF3C7] border-[#FDE68A]'
                            : 'bg-[#FAF9FE] border-[#EAE7F5]'
                        }`}
                      >
                        {logoSrc ? (
                          <Image
                            src={logoSrc}
                            alt={rule.operatorName}
                            width={26}
                            height={26}
                            referrerPolicy="no-referrer"
                            className={`w-6 h-6 object-contain ${isClosed ? 'grayscale' : ''}`}
                          />
                        ) : (
                          <i
                            className={`fa-solid ${
                              rule.serviceType === 'ELECTRICITY'
                                ? 'fa-bolt-lightning text-[#B45309]'
                                : rule.serviceType === 'DTH'
                                  ? 'fa-satellite-dish text-[#5B35E5]'
                                  : rule.serviceType === 'REDEEM_CODE'
                                    ? 'fa-gift text-[#047857]'
                                    : 'fa-mobile-screen-button text-[#5B35E5]'
                            } text-xs`}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs sm:text-sm text-[#0E163B] truncate">
                          {rule.operatorName}
                        </div>
                        <div className="text-[11px] text-[#64748B] flex items-center gap-1.5">
                          <span>{serviceLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>{isClosed ? 'Disabled by Admin' : modeLabel}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {isClosed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[11px] font-bold text-[#DC2626]">
                          <i className="fa-solid fa-ban text-[10px]" aria-hidden="true" />
                          <span>Closed</span>
                        </span>
                      ) : isFee ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] font-mono text-xs font-bold text-[#B45309] tabular-nums">
                          {formatINR(Math.abs(val))} Fee
                        </span>
                      ) : val > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#ECFDF5] border border-[#DCFCE7] font-mono text-xs sm:text-sm font-bold text-[#15803D] tabular-nums">
                          {rule.rateType === 'fixed' ? `+₹${val.toFixed(2)}` : `+${val}%`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] font-mono text-xs font-semibold text-[#64748B] tabular-nums">
                          {rule.rateType === 'fixed' ? '₹0.00' : '0%'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Commission Transfer Wallet PIN Confirmation Modal */}
      <ModalDialog
        open={trfConfirmOpen}
        title="Confirm Commission Transfer"
        onClose={() => !trfSubmitting && setTrfConfirmOpen(false)}
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-4 space-y-2">
            <div className="flex justify-between gap-2">
              <span className="text-[#64748B]">From</span>
              <span className="font-semibold text-[#15803D]">Commission Balance</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#64748B]">To</span>
              <span className="font-semibold text-[#0E163B]">Current Balance</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#EAE7F5]">
              <span className="text-[#64748B]">Transfer Amount</span>
              <span className="font-mono font-bold text-base text-[#0E163B] tabular-nums">
                {formatINR(transferAmount || 0)}
              </span>
            </div>
          </div>

          <WalletPinConfirmBox
            value={walletPin}
            onChange={(val) => {
              setWalletPin(val);
              if (pinError) setPinError('');
            }}
            error={pinError}
            disabled={trfSubmitting}
            onNavigateForgot={() => setTrfConfirmOpen(false)}
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTrfConfirmOpen(false)}
              disabled={trfSubmitting}
              className="flex-1 h-11 rounded-xl border border-[#E2E8F0] font-semibold text-[#475569] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmCommissionTransfer}
              disabled={trfSubmitting || walletPin.length !== 6}
              className="flex-1 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <i className={`fa-solid ${trfSubmitting ? 'fa-spinner fa-spin' : 'fa-check'}`} aria-hidden="true" />
              <span>{trfSubmitting ? 'Transferring...' : 'Confirm Transfer'}</span>
            </button>
          </div>
        </div>
      </ModalDialog>

      <TransactionResultModal
        open={Boolean(lastTransfer)}
        onClose={() => setLastTransfer(null)}
        status="SUCCESSFUL"
        title="Commission Transferred"
        subtitle="Credited to your Current Balance"
        amount={lastTransfer?.amount || 0}
        transactionId={lastTransfer?.transferId || ''}
        timestamp={lastTransfer?.createdAt || ''}
        statusMessage={lastTransfer?.message || ''}
        details={
          lastTransfer
            ? [
                { label: 'From', value: 'Commission Balance', highlight: 'green' },
                { label: 'To', value: 'Current Balance' },
                ...(lastTransfer.newBalance !== undefined
                  ? [{ label: 'Updated Current Balance', value: formatINR(lastTransfer.newBalance), mono: true }]
                  : []),
              ]
            : []
        }
      />
    </div>
  );
}
