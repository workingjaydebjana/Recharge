'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { calculateCommission, formatINR } from '@/lib/finance.js';
import { apiRequest } from '@/lib/api-client.js';
import {
  InlineAlert,
  ModalDialog,
  StatusText,
  formatDateTime,
} from '@/components/SharedUI.jsx';
import { WalletPinConfirmBox } from '@/components/user/WalletPinInput.jsx';
import TransactionResultModal from '@/components/user/TransactionResultModal.jsx';
import WhatsAppInvoiceModal from '@/components/user/WhatsAppInvoiceModal.jsx';
import { downloadInvoicePdf } from '@/lib/invoice.js';

const MIN_GP_AMOUNT = 10;
const MAX_GP_AMOUNT = 5000;
const QUICK_AMOUNTS = [10, 50, 100, 200, 500];

function buildGooglePlayInvoice(item) {
  const details = [{ label: 'Voucher Brand', value: 'Google Play (India)' }];
  if (item.customerMobile) {
    details.push({ label: 'Customer Mobile', value: item.customerMobile });
  }
  details.push({
    label: 'Delivery Status',
    value: 'Instant API Code Delivered',
  });
  return {
    title: 'Google Play Redeem Code',
    provider: item.productTitle || 'Google Play Redeem Code',
    status: item.codeValue ? 'SUCCESSFUL' : item.deliveryStatus || 'SUCCESSFUL',
    amount: Number(item.price || item.faceValue || 0),
    transactionId: item.transactionId || item.codeId || '',
    customerPhone: item.customerMobile || '',
    redeemCode: item.codeValue || '',
    statusMessage: item.statusMessage || (item.codeValue ? 'Google Play Redeem Code delivered successfully.' : ''),
    timestamp: item.assignedAt || new Date().toISOString(),
    details,
  };
}

export default function RedeemCodeView({
  token,
  wallet,
  settings = null,
  commissions = [],
  onSuccessRefresh,
}) {
  const [customerMobile, setCustomerMobile] = useState('');
  const [amount, setAmount] = useState('');
  const [purchasedCodes, setPurchasedCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastOrder, setLastOrder] = useState(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [walletPin, setWalletPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [purchasing, setPurchasing] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [waInvoice, setWaInvoice] = useState(null);

  const fetchRedeemData = useCallback(async () => {
    try {
      const data = await apiRequest('/api/user/redeem', { token });
      setPurchasedCodes(data.purchasedCodes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/user/redeem', { token })
      .then((data) => {
        if (cancelled) return;
        setPurchasedCodes(data.purchasedCodes || []);
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
  }, [token]);

  const gpRule = useMemo(
    () =>
      (commissions || []).find(
        (r) => r.serviceType === 'REDEEM_CODE' && r.operatorCode === 'GOOGLE_PLAY'
      ) || null,
    [commissions]
  );

  const isServiceClosed =
    settings?.redeemCodeEnabled === false || (gpRule ? gpRule.isActive === false : false);

  const pricing = useMemo(
    () => calculateCommission(Number(amount || 0), gpRule),
    [amount, gpRule]
  );

  function handleOpenConfirm(e) {
    e.preventDefault();
    setError('');

    if (isServiceClosed) {
      setError('Google Play Redeem Code service is temporarily closed by the administrator.');
      return;
    }

    const cleanMobile = customerMobile.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setError('Enter a valid 10-digit customer mobile number (starts with 6–9).');
      return;
    }

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setError('Enter a valid whole rupee amount (e.g., 10, 50, 100, 200, 500).');
      return;
    }
    if (parsed < MIN_GP_AMOUNT || parsed > MAX_GP_AMOUNT) {
      setError(
        `Google Play Redeem Code amount must be between ₹${MIN_GP_AMOUNT} and ₹${MAX_GP_AMOUNT.toLocaleString('en-IN')}.`
      );
      return;
    }
    const feeCheck = calculateCommission(parsed, gpRule);
    const totalNeeded = feeCheck.totalPayable || parsed;
    if (Number(wallet?.currentBalance || 0) < totalNeeded) {
      setError(
        `Insufficient Current Balance (${formatINR(wallet?.currentBalance || 0)}). Total payable is ${formatINR(totalNeeded)}.`
      );
      return;
    }
    setWalletPin('');
    setPinError('');
    setConfirmOpen(true);
  }

  async function handleConfirmPurchase() {
    if (!/^\d{6}$/.test(walletPin)) {
      setPinError('Enter your 6-digit Wallet PIN to authorize this purchase.');
      return;
    }
    setPurchasing(true);
    setError('');
    setPinError('');
    try {
      const cleanMobile = customerMobile.replace(/\D/g, '');
      const idempotencyKey = `GP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const data = await apiRequest('/api/user/redeem', {
        method: 'POST',
        token,
        body: {
          customerMobile: cleanMobile,
          amount: Number(amount),
          walletPin,
          idempotencyKey,
        },
      });
      setLastOrder(data);
      setConfirmOpen(false);
      setResultModalOpen(true);
      setWalletPin('');
      setAmount('');
      setCustomerMobile('');
      await fetchRedeemData();
      await onSuccessRefresh();
    } catch (err) {
      const msg = err?.message || 'Unable to complete redeem code purchase.';
      if (/wallet pin/i.test(msg)) {
        setPinError(msg);
        setWalletPin('');
      } else {
        setConfirmOpen(false);
        setWalletPin('');
        setError(msg);
      }
    } finally {
      setPurchasing(false);
    }
  }

  function handleCopy(codeId, codeValue) {
    if (navigator?.clipboard && codeValue) {
      navigator.clipboard.writeText(codeValue).catch(() => {});
    }
    setCopiedId(codeId);
    setTimeout(() => setCopiedId(''), 1800);
  }

  const parsedAmt = Number(amount);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Compact Page Header */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#0E163B] tracking-tight">
            Google Play Redeem Code
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5 truncate">
            Enter customer mobile &amp; amount for instant code delivery
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] font-medium text-[#64748B]">Wallet Balance</div>
          <div className="font-mono text-sm sm:text-base font-bold text-[#0E163B] tabular-nums">
            {formatINR(wallet?.currentBalance || 0)}
          </div>
        </div>
      </div>

      {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}

      {/* Instant Order Confirmation / Assigned Code Card */}
      {lastOrder?.transaction && (
        <section className="bg-white rounded-3xl border border-[#DDD6FE] p-4 sm:p-5 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Image
                src="/logos/google-play.svg"
                alt="Google Play"
                width={36}
                height={36}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-contain shrink-0"
              />
              <div className="min-w-0">
                <div className="font-display font-bold text-sm text-[#0E163B] truncate">
                  {lastOrder.transaction.operatorName}
                </div>
                <div className="font-mono text-[11px] text-[#64748B] truncate">
                  {lastOrder.transaction.customerMobile
                    ? `+91 ${lastOrder.transaction.customerMobile} · `
                    : ''}
                  {lastOrder.transaction._id}
                </div>
              </div>
            </div>
            <StatusText status={lastOrder.transaction.status} />
          </div>

          {lastOrder.assignedCode?.codeValue && (
            <div className="rounded-2xl bg-[#F5F3FF] border border-[#DDD6FE] p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5B35E5]">
                  Your Google Play Code
                </div>
                <div className="font-mono text-sm sm:text-base font-bold text-[#0E163B] break-all mt-0.5">
                  {lastOrder.assignedCode.codeValue}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('latest', lastOrder.assignedCode.codeValue)}
                className="px-3.5 py-2 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-xs font-semibold shrink-0 cursor-pointer"
              >
                <i
                  className={`fa-solid ${copiedId === 'latest' ? 'fa-check' : 'fa-copy'} mr-1.5`}
                  aria-hidden="true"
                />
                {copiedId === 'latest' ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {/* Quick Download PDF & Send on WhatsApp Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() =>
                downloadInvoicePdf(
                  buildGooglePlayInvoice({
                    productTitle: lastOrder.transaction.operatorName,
                    codeValue: lastOrder.assignedCode?.codeValue || '',
                    customerMobile: lastOrder.transaction.customerMobile || '',
                    price: lastOrder.transaction.amount,
                    transactionId: lastOrder.transaction._id,
                    deliveryStatus: lastOrder.transaction.status,
                    statusMessage: lastOrder.transaction.statusMessage,
                    assignedAt: lastOrder.transaction.createdAt,
                  })
                )
              }
              className="h-10 rounded-xl bg-[#FAF9FE] hover:bg-[#F5F3FF] border border-[#DDD6FE] text-[#5B35E5] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <i className="fa-solid fa-download" aria-hidden="true" />
              <span>Download</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setWaInvoice(
                  buildGooglePlayInvoice({
                    productTitle: lastOrder.transaction.operatorName,
                    codeValue: lastOrder.assignedCode?.codeValue || '',
                    customerMobile: lastOrder.transaction.customerMobile || '',
                    price: lastOrder.transaction.amount,
                    transactionId: lastOrder.transaction._id,
                    deliveryStatus: lastOrder.transaction.status,
                    statusMessage: lastOrder.transaction.statusMessage,
                    assignedAt: lastOrder.transaction.createdAt,
                  })
                )
              }
              className="h-10 rounded-xl bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <i className="fa-brands fa-whatsapp text-sm" aria-hidden="true" />
              <span>Send on WhatsApp</span>
            </button>
          </div>

          <p className="text-xs text-[#475569] bg-[#FAF9FE] border border-[#EAE7F5] rounded-xl px-3.5 py-2.5">
            {lastOrder.transaction.statusMessage}
          </p>
        </section>
      )}

      {/* Main 2-Column Layout: Fixed Google Play Form + Purchased Codes History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Left: Locked Google Play Redeem Code Card */}
        <form
          onSubmit={handleOpenConfirm}
          className="lg:col-span-6 bg-white rounded-3xl border border-[#EAE7F5] shadow-xs overflow-hidden"
        >
          {/* Fixed Google Play Deep Navy Header (Non-Changeable) */}
          <div className="navy-surface px-4 sm:px-6 py-4 text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Image
                src="/logos/google-play.svg"
                alt="Google Play"
                width={44}
                height={44}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-full object-contain shrink-0 ring-2 ring-white/20 bg-white"
              />
              <div className="min-w-0">
                <div className="font-display font-bold text-sm sm:text-base text-white truncate">
                  Google Play Redeem Code
                </div>
                <div className="text-[11px] text-[#CBD5E1] truncate">
                  Official Play Store Recharge Code · India (₹)
                </div>
              </div>
            </div>
            <i className="fa-solid fa-lock text-[#C4B5FD] text-xs shrink-0" aria-hidden="true" />
          </div>

          <div className="p-4 sm:p-6 space-y-5">
            {isServiceClosed && (
              <div
                role="alert"
                className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-xs text-[#991B1B] flex items-start gap-2.5"
              >
                <i className="fa-solid fa-ban mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-bold">Service Temporarily Closed</div>
                  <p className="mt-0.5 text-[#B91C1C]">
                    Google Play Redeem Code purchases are temporarily closed by the administrator. Please check back later.
                  </p>
                </div>
              </div>
            )}

            {/* Customer Mobile Number (Required for Delivery & WhatsApp Share) */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="gp-customer-mobile" className="text-xs font-semibold text-[#334155]">
                  Customer Mobile Number
                </label>
                <span className="text-[11px] text-[#64748B]">10-digit Indian mobile</span>
              </div>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-xs font-mono font-bold text-[#5B35E5] select-none">
                  +91
                </span>
                <input
                  id="gp-customer-mobile"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Enter 10-digit mobile number"
                  required
                  className="w-full h-12 pl-12 pr-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-base font-semibold placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-[#94A3B8] text-[#0E163B] focus:bg-white focus:border-[#5B35E5] focus:ring-2 focus:ring-[#5B35E5]/15 outline-none transition-all"
                />
              </div>
            </div>

            {/* Direct Amount Input */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="gp-amount" className="text-xs font-semibold text-[#334155]">
                  Enter Amount (₹)
                </label>
                <span className="text-[11px] font-mono text-[#64748B] tabular-nums">
                  ₹{MIN_GP_AMOUNT} – ₹{MAX_GP_AMOUNT.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg font-bold text-[#5B35E5]">
                  ₹
                </span>
                <input
                  id="gp-amount"
                  type="number"
                  inputMode="numeric"
                  min={MIN_GP_AMOUNT}
                  max={MAX_GP_AMOUNT}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount (e.g. 100)"
                  required
                  className="w-full h-13 pl-9 pr-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-xl font-bold placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-[#94A3B8] text-[#0E163B] tabular-nums focus:bg-white focus:border-[#5B35E5] focus:ring-2 focus:ring-[#5B35E5]/15 outline-none transition-all"
                />
              </div>

              {/* Quick Tap Amount Buttons */}
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2 mt-2.5">
                {QUICK_AMOUNTS.map((preset) => {
                  const active = Number(amount) === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className={`h-9 rounded-xl border font-mono text-[11px] sm:text-xs font-semibold tabular-nums transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1 ${
                        active
                          ? 'bg-[#0E163B] text-white border-[#0E163B]'
                          : 'bg-[#FAF9FE] text-[#334155] border-[#EAE7F5] hover:border-[#5B35E5] hover:text-[#5B35E5]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#86EFAC]' : 'bg-[#15803D]'}`}
                        aria-hidden="true"
                      />
                      <span>₹{preset}</span>
                    </button>
                  );
                })}
              </div>

              {amount && Number.isInteger(parsedAmt) && parsedAmt >= MIN_GP_AMOUNT && parsedAmt <= MAX_GP_AMOUNT && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                  <span className="text-[#15803D] font-semibold inline-flex items-center gap-1.5">
                    <i className="fa-solid fa-bolt" aria-hidden="true" />
                    <span>Instant Google Play code delivery ready for ₹{parsedAmt.toLocaleString('en-IN')}</span>
                  </span>
                </div>
              )}
              {!isServiceClosed && pricing.serviceCharge > 0 && Number(amount) > 0 && (
                <div className="mt-2.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-3.5 py-2.5 text-xs space-y-1">
                  <div className="flex justify-between text-[#92400E]">
                    <span>Fixed Service Charge</span>
                    <span className="font-mono font-semibold tabular-nums">
                      + {formatINR(pricing.serviceCharge)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-[#0E163B] pt-1 border-t border-[#FDE68A]">
                    <span>Total Payable from Wallet</span>
                    <span className="font-mono tabular-nums">{formatINR(pricing.totalPayable)}</span>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={purchasing || isServiceClosed}
              className="w-full h-12 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <i className={`fa-solid ${isServiceClosed ? 'fa-ban' : 'fa-gift'}`} aria-hidden="true" />
              <span>
                {isServiceClosed
                  ? 'Google Play Code Temporarily Closed'
                  : amount && Number(amount) >= MIN_GP_AMOUNT
                    ? pricing.serviceCharge > 0
                      ? `Pay ${formatINR(pricing.totalPayable)} · Get ₹${Number(amount).toLocaleString('en-IN')} Code`
                      : `Get ₹${Number(amount).toLocaleString('en-IN')} Google Play Code`
                    : 'Buy Google Play Redeem Code'}
              </span>
            </button>

            <p className="text-[11px] text-[#64748B] leading-relaxed text-center">
              Protected by atomic wallet ledger. Google Play Redeem Codes for any amount (₹10 – ₹5,000) deliver immediately after payment and can be shared on WhatsApp in one tap.
            </p>
          </div>
        </form>

        {/* Right: My Google Play Redeem Codes History */}
        <section className="lg:col-span-6 bg-white rounded-3xl border border-[#EAE7F5] overflow-hidden shadow-xs">
          <div className="px-4 sm:px-5 py-4 border-b border-[#EAE7F5] flex items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-bold text-[#0E163B]">My Google Play Codes</h2>
            <span className="text-[11px] text-[#64748B] font-mono">
              {purchasedCodes.length} {purchasedCodes.length === 1 ? 'order' : 'orders'}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              <i className="fa-solid fa-spinner fa-spin mr-2 text-[#5B35E5]" aria-hidden="true" />
              Loading your Google Play codes...
            </div>
          ) : purchasedCodes.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-[#F5F3FF] flex items-center justify-center mx-auto">
                <Image
                  src="/logos/google-play.svg"
                  alt="Google Play"
                  width={28}
                  height={28}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 object-contain"
                />
              </div>
              <div className="font-semibold text-xs sm:text-sm text-[#0E163B]">No Google Play codes yet</div>
              <p className="text-[11px] text-[#64748B] max-w-xs mx-auto">
                Enter customer mobile number &amp; amount on the left to get your Google Play Redeem Code.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#F1EEF9]">
              {purchasedCodes.map((item) => {
                const itemInvoice = buildGooglePlayInvoice(item);
                return (
                  <div
                    key={item.codeId}
                    className="p-4 sm:px-5 space-y-2.5 hover:bg-[#FAF9FE] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Image
                          src="/logos/google-play.svg"
                          alt="Google Play"
                          width={32}
                          height={32}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full object-contain shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-xs sm:text-sm text-[#0E163B] truncate">
                            {item.productTitle}
                          </div>
                          <div className="text-[11px] text-[#64748B] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                            {item.customerMobile && (
                              <>
                                <span className="font-mono font-medium text-[#334155]">
                                  +91 {item.customerMobile}
                                </span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span className="font-mono">{item.transactionId}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatDateTime(item.assignedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-xs sm:text-sm text-[#0E163B] tabular-nums">
                          {formatINR(item.price || item.faceValue)}
                        </div>
                        <div className="mt-0.5">
                          <StatusText status={item.deliveryStatus} />
                        </div>
                      </div>
                    </div>

                    {item.codeValue ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] px-3 py-2">
                          <code className="font-mono text-xs font-bold text-[#4C28D4] truncate">
                            {item.codeValue}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopy(item.codeId, item.codeValue)}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#DDD6FE] hover:bg-[#EDE9FE] text-[11px] font-semibold text-[#5B35E5] whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <i
                              className={`fa-solid ${copiedId === item.codeId ? 'fa-check text-[#15803D]' : 'fa-copy'} mr-1`}
                              aria-hidden="true"
                            />
                            {copiedId === item.codeId ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => downloadInvoicePdf(itemInvoice)}
                            className="h-8 rounded-lg bg-white hover:bg-[#F5F3FF] border border-[#DDD6FE] text-[#5B35E5] text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <i className="fa-solid fa-download text-[10px]" aria-hidden="true" />
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setWaInvoice(itemInvoice)}
                            className="h-8 rounded-lg bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <i className="fa-brands fa-whatsapp text-xs" aria-hidden="true" />
                            <span>Send on WhatsApp</span>
                          </button>
                        </div>
                      </div>
                    ) : item.statusMessage ? (
                      <p className="text-[11px] text-[#64748B] bg-[#FAF9FE] border border-[#EAE7F5] rounded-xl px-3 py-2">
                        {item.statusMessage}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Confirmation Modal */}
      <ModalDialog
        open={confirmOpen}
        title="Confirm Google Play Redeem Code"
        onClose={() => !purchasing && setConfirmOpen(false)}
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#64748B]">Voucher</span>
              <span className="inline-flex items-center gap-2 font-semibold text-[#0E163B]">
                <Image
                  src="/logos/google-play.svg"
                  alt="Google Play"
                  width={20}
                  height={20}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full object-contain"
                />
                <span>Google Play Redeem Code</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#64748B]">Customer Mobile</span>
              <span className="font-mono font-semibold text-[#0E163B]">+91 {customerMobile}</span>
            </div>
            {pricing.serviceCharge > 0 && (
              <>
                <div className="flex justify-between pt-2 border-t border-[#EAE7F5]">
                  <span className="text-[#64748B]">Code Value</span>
                  <span className="font-mono font-semibold text-[#0E163B] tabular-nums">
                    {formatINR(amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#B45309]">Fixed Service Charge</span>
                  <span className="font-mono font-semibold text-[#B45309] tabular-nums">
                    + {formatINR(pricing.serviceCharge)}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between pt-2.5 border-t border-[#EAE7F5]">
              <span className="text-[#64748B]">Payable from Current Balance</span>
              <span className="font-mono font-bold text-base text-[#0E163B] tabular-nums">
                {formatINR(pricing.totalPayable || amount)}
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
            disabled={purchasing}
            onNavigateForgot={() => setConfirmOpen(false)}
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={purchasing}
              className="flex-1 h-11 rounded-xl border border-[#E2E8F0] font-semibold text-[#475569] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmPurchase}
              disabled={purchasing || walletPin.length !== 6}
              className="flex-1 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <i className={`fa-solid ${purchasing ? 'fa-spinner fa-spin' : 'fa-check'}`} aria-hidden="true" />
              <span>{purchasing ? 'Processing...' : 'Confirm & Pay'}</span>
            </button>
          </div>
        </div>
      </ModalDialog>

      <TransactionResultModal
        open={resultModalOpen && Boolean(lastOrder?.transaction)}
        onClose={() => setResultModalOpen(false)}
        status={lastOrder?.transaction?.status}
        title={
          lastOrder?.assignedCode?.codeValue
            ? 'Google Play Code Ready'
            : 'Redeem Order Successful'
        }
        subtitle={
          lastOrder?.transaction?.customerMobile
            ? `${lastOrder.transaction.operatorName} · +91 ${lastOrder.transaction.customerMobile}`
            : lastOrder?.transaction?.operatorName || 'Google Play Redeem Code'
        }
        amount={lastOrder?.transaction?.amount || 0}
        logo="/logos/google-play.svg"
        logoAlt="Google Play Redeem Code"
        redeemCode={lastOrder?.assignedCode?.codeValue || ''}
        transactionId={lastOrder?.transaction?._id || ''}
        timestamp={lastOrder?.transaction?.createdAt || ''}
        statusMessage={lastOrder?.transaction?.statusMessage || ''}
        details={
          lastOrder?.transaction
            ? [
                { label: 'Voucher Brand', value: 'Google Play (India)' },
                ...(lastOrder.transaction.customerMobile
                  ? [{ label: 'Customer Mobile', value: lastOrder.transaction.customerMobile, mono: true }]
                  : []),
                {
                  label: 'Delivery Status',
                  value: 'Instant API Code Delivered',
                  highlight: 'green',
                },
                ...(Number(lastOrder.transaction.serviceCharge || 0) > 0
                  ? [
                      {
                        label: 'Service Charge',
                        value: `+ ${formatINR(lastOrder.transaction.serviceCharge)}`,
                        mono: true,
                      },
                      {
                        label: 'Total Debited',
                        value: formatINR(lastOrder.transaction.totalPayable || lastOrder.transaction.amount),
                        mono: true,
                      },
                    ]
                  : []),
                ...(Number(lastOrder.transaction.commissionAmount || 0) > 0
                  ? [
                      {
                        label: 'Commission Earned',
                        value: `+ ${formatINR(lastOrder.transaction.commissionAmount)}`,
                        mono: true,
                        highlight: 'green',
                      },
                    ]
                  : []),
              ]
            : []
        }
      />

      <WhatsAppInvoiceModal
        open={Boolean(waInvoice)}
        onClose={() => setWaInvoice(null)}
        invoice={waInvoice}
      />
    </div>
  );
}
