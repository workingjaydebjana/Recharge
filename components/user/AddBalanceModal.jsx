'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { formatINR } from '@/lib/finance.js';
import { apiRequest } from '@/lib/api-client.js';

const QUICK_AMOUNTS = [100, 500, 1000, 5000];
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100000;
const POLL_INTERVAL_MS = 3500;

function formatCountdown(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = String(Math.floor(safe / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function AddBalanceModal({
  isOpen,
  onClose,
  token = '',
  currentBalance = 0,
  onSuccessRefresh,
}) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState('ENTER_AMOUNT'); // ENTER_AMOUNT | PAY_UPI | SUCCESS | EXPIRED
  const [order, setOrder] = useState(null);
  const [settledData, setSettledData] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [copiedField, setCopiedField] = useState('');
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const pollingBusyRef = useRef(false);

  const resetModalState = useCallback(() => {
    setAmount('');
    setError('');
    setCreating(false);
    setChecking(false);
    setStep('ENTER_AMOUNT');
    setOrder(null);
    setSettledData(null);
    setSecondsLeft(600);
    setCopiedField('');
    setShowCloseWarning(false);
    pollingBusyRef.current = false;
  }, []);

  const forceClose = useCallback(() => {
    if (creating) return;
    resetModalState();
    onClose();
  }, [creating, resetModalState, onClose]);

  const handleRequestClose = useCallback(() => {
    if (creating) return;
    if (step === 'PAY_UPI') {
      setShowCloseWarning(true);
      return;
    }
    forceClose();
  }, [creating, step, forceClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !creating) {
        if (showCloseWarning) {
          setShowCloseWarning(false);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, creating, showCloseWarning, handleRequestClose]);

  const activeOrderId = order?.orderId || '';

  const checkPaymentStatus = useCallback(
    async (manual = false) => {
      if (!activeOrderId || step !== 'PAY_UPI') return;
      if (pollingBusyRef.current) return;
      pollingBusyRef.current = true;
      if (manual) {
        setChecking(true);
        setError('');
      }
      try {
        const res = await apiRequest(
          `/api/user/wallet/famgateway/status?orderId=${encodeURIComponent(activeOrderId)}`,
          { token }
        );
        if (res.status === 'success') {
          setShowCloseWarning(false);
          setSettledData(res);
          setStep('SUCCESS');
          if (typeof onSuccessRefresh === 'function') {
            await onSuccessRefresh();
          }
        } else if (res.status === 'expired') {
          setShowCloseWarning(false);
          setStep('EXPIRED');
        } else if (manual) {
          setError('Payment not received yet. Complete UPI payment and check again.');
        }
      } catch (err) {
        if (manual) {
          setError(err?.message || 'Unable to verify payment status right now.');
        }
      } finally {
        pollingBusyRef.current = false;
        if (manual) setChecking(false);
      }
    },
    [activeOrderId, step, token, onSuccessRefresh]
  );

  // Live 10-minute session countdown timer
  useEffect(() => {
    if (!isOpen || step !== 'PAY_UPI') return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setShowCloseWarning(false);
          setStep('EXPIRED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, step]);

  // Automated background payment verification polling
  useEffect(() => {
    if (!isOpen || step !== 'PAY_UPI' || !activeOrderId) return undefined;
    const poller = setInterval(() => {
      checkPaymentStatus(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(poller);
  }, [isOpen, step, activeOrderId, checkPaymentStatus]);

  if (!isOpen) return null;

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

  async function handleCreateUpiOrder(e) {
    e.preventDefault();
    if (creating) return;
    setError('');

    const num = Number(amount);
    if (!Number.isFinite(num) || num < MIN_AMOUNT) {
      setError(`Please enter a valid amount of at least ${formatINR(MIN_AMOUNT)}.`);
      return;
    }
    if (num > MAX_AMOUNT) {
      setError(`Maximum UPI top-up per transaction is ${formatINR(MAX_AMOUNT)}.`);
      return;
    }

    setCreating(true);
    try {
      const res = await apiRequest('/api/user/wallet/famgateway/create', {
        method: 'POST',
        token,
        body: { amount: num },
      });
      setOrder(res.order);
      setSecondsLeft(res.order?.expiresInSeconds || 600);
      setStep('PAY_UPI');
    } catch (err) {
      setError(err?.message || 'Unable to generate UPI QR right now. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  const parsedAmount = Number(amount);
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount >= MIN_AMOUNT && parsedAmount <= MAX_AMOUNT;
  const displayedBalance =
    step === 'SUCCESS' && settledData?.wallet?.currentBalance !== undefined
      ? settledData.wallet.currentBalance
      : currentBalance;

  const safeUpiIntent =
    order?.upiIntent && String(order.upiIntent).toLowerCase().startsWith('upi://pay?')
      ? order.upiIntent
      : '';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-balance-modal-title"
    >
      {/* Backdrop */}
      <div
        onClick={handleRequestClose}
        className="fixed inset-0 bg-[#0E163B]/55 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      {/* Modal Sheet */}
      <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-[#EAE7F5] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="navy-surface text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <i className="fa-solid fa-qrcode text-[#C4B5FD] text-sm" aria-hidden="true" />
            </span>
            <div>
              <h2 id="add-balance-modal-title" className="font-display font-bold text-base leading-tight">
                {step === 'PAY_UPI'
                  ? 'Complete UPI Payment'
                  : step === 'SUCCESS'
                  ? 'Payment Verified'
                  : step === 'EXPIRED'
                  ? 'Payment Session Expired'
                  : 'Add Balance via UPI'}
              </h2>
              <p className="text-[11px] text-[#CBD5E1] mt-0.5">
                Current Balance:{' '}
                <span className="font-mono font-semibold text-white">{formatINR(displayedBalance)}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            disabled={creating}
            aria-label="Close add balance modal"
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto">
          {step === 'ENTER_AMOUNT' && (
            <form onSubmit={handleCreateUpiOrder} className="p-5 sm:p-6 space-y-5">
              <div>
                <label htmlFor="add-balance-amount" className="block text-xs font-semibold text-[#334155] mb-2">
                  Enter Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-xl font-bold text-[#5B35E5]">
                    ₹
                  </span>
                  <input
                    id="add-balance-amount"
                    type="number"
                    inputMode="decimal"
                    min={MIN_AMOUNT}
                    max={MAX_AMOUNT}
                    step="any"
                    value={amount}
                    disabled={creating}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="100"
                    className="w-full h-14 pl-10 pr-4 rounded-2xl border-2 border-[#EAE7F5] focus:border-[#5B35E5] bg-[#FAF9FE] font-mono text-2xl font-bold text-[#0E163B] tabular-nums outline-none transition-colors disabled:opacity-60"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#64748B] mt-1.5 px-0.5">
                  <span>0% Fee · Auto-verified UPI credit</span>
                  <span>
                    {formatINR(MIN_AMOUNT)} – {formatINR(MAX_AMOUNT)}
                  </span>
                </div>
              </div>

              {/* Quick Select Chips */}
              <div>
                <div className="text-[11px] font-semibold text-[#64748B] mb-2">Quick Select</div>
                <div className="grid grid-cols-4 gap-2">
                  {QUICK_AMOUNTS.map((preset) => {
                    const selected = Number(amount) === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={creating}
                        onClick={() => {
                          setAmount(String(preset));
                          setError('');
                        }}
                        className={`py-2.5 rounded-xl font-mono text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                          selected
                            ? 'bg-[#5B35E5] text-white border-[#5B35E5] shadow-xs'
                            : 'bg-[#FAF9FE] text-[#0E163B] border-[#EAE7F5] hover:border-[#5B35E5]'
                        }`}
                      >
                        ₹{preset.toLocaleString('en-IN')}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Trust Strip */}
              <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] px-3.5 py-3 flex items-center justify-between gap-2 text-[11px] text-[#475569]">
                <span className="inline-flex items-center gap-1.5">
                  <i className="fa-solid fa-bolt text-[#5B35E5]" aria-hidden="true" />
                  <span>GPay · PhonePe · Paytm · FamPay</span>
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#15803D] shrink-0">
                  <i className="fa-solid fa-shield-halved" aria-hidden="true" />
                  <span>Instant UPI</span>
                </span>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#991B1B] flex items-start gap-2"
                >
                  <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0" aria-hidden="true" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={creating || !hasValidAmount}
                className="w-full h-12 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-55 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {creating ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden="true" />
                    <span>Generating Dynamic UPI QR...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-qrcode text-xs" aria-hidden="true" />
                    <span>
                      {hasValidAmount ? `Pay ${formatINR(parsedAmount)} via UPI` : 'Proceed to UPI Payment'}
                    </span>
                  </>
                )}
              </button>
            </form>
          )}

          {step === 'PAY_UPI' && order && (
            <div className="p-5 sm:p-6 space-y-4">
              {/* Payable Summary + Countdown */}
              <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                    Amount to Pay
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#0E163B] tabular-nums leading-tight mt-0.5">
                    {formatINR(order.amount)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] font-mono text-xs font-bold tabular-nums">
                    <i className="fa-solid fa-clock text-[11px]" aria-hidden="true" />
                    <span>{formatCountdown(secondsLeft)}</span>
                  </span>
                  <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-[#64748B]">
                    <span className="font-mono font-semibold text-[#334155]">{order.orderId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('order', order.orderId)}
                      className="text-[#5B35E5] font-semibold hover:underline cursor-pointer"
                    >
                      {copiedField === 'order' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic UPI QR Box */}
              <div className="rounded-2xl border border-[#DDD6FE] bg-gradient-to-b from-[#FAF9FE] to-white p-4 text-center space-y-3">
                <div className="text-xs font-semibold text-[#0E163B]">
                  Scan with any UPI App to Pay Instantly
                </div>
                <div className="w-[216px] h-[216px] mx-auto rounded-2xl bg-white border border-[#EAE7F5] shadow-xs p-2.5 flex items-center justify-center">
                  <Image
                    src={order.qrUrl}
                    alt={`UPI QR Code for ${formatINR(order.amount)}`}
                    width={196}
                    height={196}
                    referrerPolicy="no-referrer"
                    className="w-[196px] h-[196px] object-contain rounded-lg"
                  />
                </div>

                {order.upiId && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] text-[11px]">
                    <span className="text-[#64748B]">UPI ID:</span>
                    <span className="font-mono font-semibold text-[#0E163B]">{order.upiId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('upi', order.upiId)}
                      className="text-[#5B35E5] font-semibold hover:underline cursor-pointer"
                    >
                      {copiedField === 'upi' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 text-[11px] text-[#5B35E5] font-medium">
                  <i className="fa-solid fa-circle-notch fa-spin text-[10px]" aria-hidden="true" />
                  <span>Auto-verifying payment in real time...</span>
                </div>
              </div>

              {/* Direct UPI App Payment Button */}
              {safeUpiIntent && (
                <a
                  href={safeUpiIntent}
                  className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-mobile-screen-button" aria-hidden="true" />
                  <span>Pay via UPI App</span>
                </a>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2.5 text-xs text-[#92400E] flex items-start gap-2"
                >
                  <i className="fa-solid fa-circle-info mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {/* Manual Check + Cancel */}
              <div className="flex items-center justify-between gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOrder(null);
                    setError('');
                    setStep('ENTER_AMOUNT');
                  }}
                  className="h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#475569] text-xs font-semibold cursor-pointer transition-colors"
                >
                  Change Amount
                </button>
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => checkPaymentStatus(true)}
                  className="flex-1 h-10 rounded-xl bg-[#0E163B] hover:bg-[#1E293B] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2"
                >
                  <i
                    className={`fa-solid ${checking ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'} text-[11px]`}
                    aria-hidden="true"
                  />
                  <span>{checking ? 'Verifying...' : 'I Have Paid · Verify Now'}</span>
                </button>
              </div>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div className="p-5 sm:p-6 space-y-5 text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                className="w-16 h-16 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#15803D] flex items-center justify-center mx-auto shadow-xs"
              >
                <i className="fa-solid fa-circle-check text-3xl" aria-hidden="true" />
              </motion.div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#15803D]">
                  UPI Payment Confirmed
                </div>
                <div className="font-mono text-3xl font-bold text-[#0E163B] tabular-nums mt-1">
                  + {formatINR(settledData?.deposit?.amount ?? order?.amount ?? parsedAmount)}
                </div>
              </div>

              <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-4 text-left text-xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B]">Updated Current Balance</span>
                  <span className="font-mono font-bold text-[#0E163B] tabular-nums">
                    {formatINR(settledData?.wallet?.currentBalance ?? displayedBalance)}
                  </span>
                </div>
                {settledData?.deposit?.utr && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#EAE7F5]">
                    <span className="text-[#64748B]">Bank UTR</span>
                    <span className="font-mono font-semibold text-[#0E163B]">
                      {settledData.deposit.utr}
                    </span>
                  </div>
                )}
                {settledData?.deposit?.senderName && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#EAE7F5]">
                    <span className="text-[#64748B]">Paid By</span>
                    <span className="font-semibold text-[#0E163B]">
                      {settledData.deposit.senderName}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#EAE7F5]">
                  <span className="text-[#64748B]">Order ID</span>
                  <span className="font-mono font-semibold text-[#5B35E5]">
                    {settledData?.deposit?.gatewayOrderId || order?.orderId || '—'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={resetModalState}
                  className="h-11 rounded-xl border border-[#EAE7F5] bg-white hover:bg-[#FAF9FE] text-[#0E163B] text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                >
                  <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                  <span>Add More</span>
                </button>
                <button
                  type="button"
                  onClick={forceClose}
                  className="h-11 rounded-xl bg-[#0E163B] hover:bg-[#1E293B] text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {step === 'EXPIRED' && (
            <div className="p-5 sm:p-6 space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] flex items-center justify-center mx-auto">
                <i className="fa-solid fa-clock text-2xl" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-[#0E163B]">
                  UPI QR Session Expired
                </h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  The 10-minute payment window for order{' '}
                  <span className="font-mono font-semibold text-[#0E163B]">{order?.orderId}</span> has ended.
                  Generate a fresh UPI QR code to add balance.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={forceClose}
                  className="h-11 rounded-xl border border-[#EAE7F5] bg-white hover:bg-[#FAF9FE] text-[#475569] text-xs font-semibold cursor-pointer transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrder(null);
                    setError('');
                    setStep('ENTER_AMOUNT');
                  }}
                  className="h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                >
                  <i className="fa-solid fa-rotate-right text-[11px]" aria-hidden="true" />
                  <span>Generate New QR</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Custom Cancel Payment Confirmation Overlay (Replaces Browser Default Alert) */}
        {showCloseWarning && step === 'PAY_UPI' && (
          <div
            className="absolute inset-0 z-20 bg-[#0E163B]/65 backdrop-blur-[2px] flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-upi-warning-title"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className="w-full max-w-xs bg-white rounded-2xl border border-[#EAE7F5] shadow-2xl p-5 text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] flex items-center justify-center mx-auto">
                <i className="fa-solid fa-triangle-exclamation text-xl" aria-hidden="true" />
              </div>

              <div className="space-y-1.5">
                <h3
                  id="cancel-upi-warning-title"
                  className="font-display font-bold text-base text-[#0E163B]"
                >
                  Cancel UPI Payment?
                </h3>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Your payment session for{' '}
                  <strong className="font-mono text-[#0E163B]">{formatINR(order?.amount || parsedAmount)}</strong>{' '}
                  is still active. If you have already paid in your UPI app, please stay here so we can verify and
                  credit your wallet.
                </p>
              </div>

              <div className="rounded-xl bg-[#FAF9FE] border border-[#EAE7F5] px-3 py-2 flex items-center justify-between text-[11px]">
                <span className="text-[#64748B]">Order ID</span>
                <span className="font-mono font-semibold text-[#0E163B]">{order?.orderId || '—'}</span>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCloseWarning(false)}
                  className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-arrow-left text-[11px]" aria-hidden="true" />
                  <span>Continue Payment</span>
                </button>
                <button
                  type="button"
                  onClick={forceClose}
                  className="w-full h-10 rounded-xl bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] text-[#DC2626] text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                >
                  <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true" />
                  <span>Yes, Cancel &amp; Close</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
