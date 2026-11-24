'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { ELECTRICITY_BOARDS } from '@/lib/constants.js';
import {
  calculateCommission,
  formatINR,
  validateElectricityAmount,
  validateElectricityConsumer,
  validateIndianMobile,
} from '@/lib/finance.js';
import { apiRequest } from '@/lib/api-client.js';
import {
  ExpandableTransactionRow,
  InlineAlert,
  ModalDialog,
  StatusText,
} from '@/components/SharedUI.jsx';
import { WalletPinConfirmBox } from '@/components/user/WalletPinInput.jsx';
import TransactionResultModal from '@/components/user/TransactionResultModal.jsx';

const QUICK_BILL_AMOUNTS = [500, 1000, 1500, 2000, 3000];

export default function ElectricityBillView({
  token,
  wallet,
  settings,
  commissions = [],
  recentTransactions,
  onSuccessRefresh,
  onRaiseComplaint,
}) {
  const [boardCode, setBoardCode] = useState('WBSEDCL');
  const [consumerNumber, setConsumerNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [amount, setAmount] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [walletPin, setWalletPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);

  const selectedBoard = useMemo(
    () => ELECTRICITY_BOARDS.find((b) => b.code === boardCode) || ELECTRICITY_BOARDS[0],
    [boardCode]
  );

  const elecRulesMap = useMemo(() => {
    const map = {};
    for (const rule of commissions || []) {
      if (rule.serviceType === 'ELECTRICITY') map[rule.operatorCode] = rule;
    }
    return map;
  }, [commissions]);

  const activeRule = elecRulesMap[boardCode] || null;
  const isPlatformDisabled = settings?.electricityBillEnabled === false;
  const isBoardDisabled = activeRule ? activeRule.isActive === false : false;
  const isServiceClosed = isPlatformDisabled || isBoardDisabled;

  const pricing = useMemo(
    () => calculateCommission(Number(amount || 0), activeRule),
    [amount, activeRule]
  );

  const electricityHistory = useMemo(
    () => (recentTransactions || []).filter((t) => t.type === 'ELECTRICITY_BILL'),
    [recentTransactions]
  );

  const minBill = Math.max(10, Number(settings?.minRechargeAmount ?? 10));
  const maxBill = Math.max(50000, Number(settings?.maxRechargeAmount ?? 10000));

  function handleSelectBoard(code) {
    setBoardCode(code);
    setError('');
  }

  function handleOpenConfirm(e) {
    e.preventDefault();
    setError('');

    if (isPlatformDisabled) {
      setError('Electricity Bill Payment is currently paused by the administrator. Please try again later.');
      return;
    }
    if (isBoardDisabled) {
      setError(`${selectedBoard.short} bill payment is temporarily closed by the administrator.`);
      return;
    }

    const consumerCheck = validateElectricityConsumer(boardCode, consumerNumber);
    if (!consumerCheck.valid) {
      setError(consumerCheck.message);
      return;
    }

    if (customerMobile.trim()) {
      const mobCheck = validateIndianMobile(customerMobile.trim());
      if (!mobCheck.valid) {
        setError(mobCheck.message);
        return;
      }
    }

    const amtCheck = validateElectricityAmount(amount, settings || {});
    if (!amtCheck.valid) {
      setError(amtCheck.message);
      return;
    }

    const feeCheck = calculateCommission(amtCheck.value, activeRule);
    const totalNeeded = feeCheck.totalPayable || amtCheck.value;
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

  async function handleConfirmSubmit() {
    if (!/^\d{6}$/.test(walletPin)) {
      setPinError('Enter your 6-digit Wallet PIN to authorize this bill payment.');
      return;
    }
    setSubmitting(true);
    setError('');
    setPinError('');
    try {
      const idempotencyKey = `ELEC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const data = await apiRequest('/api/user/recharge/electricity', {
        method: 'POST',
        token,
        body: {
          boardCode,
          consumerNumber: consumerNumber.trim().toUpperCase(),
          customerName: customerName.trim(),
          customerMobile: customerMobile.trim(),
          amount: Number(amount),
          walletPin,
          idempotencyKey,
        },
      });
      setLastResult(data.transaction);
      setConfirmOpen(false);
      setResultModalOpen(true);
      setWalletPin('');
      setAmount('');
      setConsumerNumber('');
      setCustomerName('');
      setCustomerMobile('');
      setShowOptionalDetails(false);
      await onSuccessRefresh();
    } catch (err) {
      const msg = err?.message || 'Unable to process electricity bill payment.';
      if (/wallet pin/i.test(msg)) {
        setPinError(msg);
        setWalletPin('');
      } else {
        setConfirmOpen(false);
        setWalletPin('');
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const hasOptionalFilled = Boolean(customerName.trim() || customerMobile.trim());

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Compact, Balanced Page Header */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#0E163B] tracking-tight">
            Electricity Bill
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5 truncate">
            West Bengal · WBSEDCL &amp; CESC
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

      {/* Instant Digital Payment Receipt Banner */}
      {lastResult && (
        <section className="bg-white rounded-3xl border border-[#DDD6FE] p-4 sm:p-5 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Image
                src={lastResult.operatorCode === 'CESC' ? '/logos/cesc.svg' : '/logos/wbsedcl.svg'}
                alt={lastResult.operatorName || 'Electricity Board'}
                width={36}
                height={36}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-contain shrink-0"
              />
              <div className="min-w-0">
                <div className="font-display font-bold text-sm text-[#0E163B] truncate">
                  Bill Payment Receipt
                </div>
                <div className="font-mono text-[11px] text-[#64748B] truncate">{lastResult._id}</div>
              </div>
            </div>
            <StatusText status={lastResult.status} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#F1EEF9] text-xs">
            <div>
              <div className="text-[#64748B]">Board</div>
              <div className="font-semibold text-[#0E163B] mt-0.5 truncate">{lastResult.operatorName}</div>
            </div>
            <div>
              <div className="text-[#64748B]">Consumer ID</div>
              <div className="font-mono font-semibold text-[#0E163B] mt-0.5">{lastResult.targetNumber}</div>
            </div>
            <div>
              <div className="text-[#64748B]">Amount Paid</div>
              <div className="font-mono font-bold text-[#0E163B] tabular-nums mt-0.5">
                {formatINR(lastResult.amount)}
              </div>
            </div>
            <div>
              <div className="text-[#64748B]">Reference</div>
              <div className="font-mono font-semibold text-[#0E163B] mt-0.5 truncate">
                {lastResult.operatorRef || lastResult._id}
              </div>
            </div>
          </div>

          {lastResult.customerName && (
            <div className="text-xs text-[#475569]">
              Consumer: <strong className="text-[#0E163B]">{lastResult.customerName}</strong>
              {lastResult.customerMobile ? ` · +91 ${lastResult.customerMobile}` : ''}
            </div>
          )}

          <p className="text-xs text-[#475569] bg-[#FAF9FE] border border-[#EAE7F5] rounded-xl px-3.5 py-2.5">
            {lastResult.statusMessage}
          </p>
        </section>
      )}

      {/* Main Responsive 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Primary Payment Card */}
        <form
          onSubmit={handleOpenConfirm}
          className="lg:col-span-7 bg-white rounded-3xl border border-[#EAE7F5] shadow-xs overflow-hidden"
        >
          {/* Sleek Deep Navy Selected Board Strip */}
          <div className="navy-surface px-4 sm:px-6 py-4 text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Image
                src={selectedBoard.logo}
                alt={selectedBoard.name}
                width={40}
                height={40}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-contain shrink-0 ring-2 ring-white/20"
              />
              <div className="min-w-0">
                <div className="font-display font-bold text-sm sm:text-base text-white truncate">
                  {selectedBoard.name}
                </div>
                <div className="text-[11px] text-[#CBD5E1] truncate">
                  {selectedBoard.areaDetail}
                </div>
              </div>
            </div>
            <i className="fa-solid fa-bolt-lightning text-[#FDE68A] text-base shrink-0" aria-hidden="true" />
          </div>

          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            {/* Side-by-Side 2-Column Board Switcher (Always 2 Columns — Mobile & Desktop) */}
            <div>
              <span className="block text-xs font-semibold text-[#334155] mb-2">
                Select Electricity Board
              </span>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {ELECTRICITY_BOARDS.map((board) => {
                  const active = board.code === boardCode;
                  const bClosed = isPlatformDisabled || elecRulesMap[board.code]?.isActive === false;
                  return (
                    <button
                      key={board.code}
                      type="button"
                      onClick={() => handleSelectBoard(board.code)}
                      aria-pressed={active}
                      className={`relative flex items-center gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer min-h-[64px] ${
                        bClosed
                          ? active
                            ? 'border-[#FCA5A5] bg-[#FEF2F2]/70 opacity-85'
                            : 'border-[#F1EEF9] bg-[#F8FAFC] opacity-70 hover:opacity-90'
                          : active
                            ? 'border-[#5B35E5] bg-[#F5F3FF] shadow-xs'
                            : 'border-[#EAE7F5] bg-[#FAF9FE]/60 hover:bg-[#FAF9FE] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <Image
                        src={board.logo}
                        alt={board.short}
                        width={40}
                        height={40}
                        referrerPolicy="no-referrer"
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full object-contain shrink-0 ${
                          bClosed ? 'grayscale' : ''
                        }`}
                      />
                      <div className="min-w-0">
                        <div
                          className={`font-display font-bold text-xs sm:text-sm leading-tight truncate ${
                            bClosed ? 'text-[#94A3B8]' : active ? 'text-[#5B35E5]' : 'text-[#0E163B]'
                          }`}
                        >
                          {board.short}
                        </div>
                        <div className="text-[11px] text-[#64748B] truncate mt-0.5">
                          {bClosed ? 'Temporarily Closed' : board.area}
                        </div>
                      </div>
                      {bClosed ? (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-[#FEE2E2] text-[#DC2626] text-[9px] font-bold">
                          Closed
                        </span>
                      ) : active ? (
                        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#5B35E5] text-white flex items-center justify-center">
                          <i className="fa-solid fa-check text-[8px]" aria-hidden="true" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {isServiceClosed && (
              <div
                role="alert"
                className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-xs text-[#991B1B] flex items-start gap-2.5"
              >
                <i className="fa-solid fa-ban mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-bold">Service Temporarily Closed</div>
                  <p className="mt-0.5 text-[#B91C1C]">
                    {isPlatformDisabled
                      ? 'Electricity Bill Payment is currently paused by the administrator. Please try again later.'
                      : `${selectedBoard.short} bill payment is temporarily closed by the administrator.`}
                  </p>
                </div>
              </div>
            )}

            {/* Consumer ID / Customer ID Field */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="elec-consumer-id" className="text-xs font-semibold text-[#334155]">
                  {selectedBoard.consumerLabel}
                </label>
                <span className="text-[11px] text-[#64748B]">
                  {selectedBoard.idMin}–{selectedBoard.idMax} digits
                </span>
              </div>
              <div className="relative">
                <i
                  className="fa-solid fa-id-card text-[#94A3B8] text-xs absolute left-3.5 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="elec-consumer-id"
                  type="text"
                  inputMode="numeric"
                  maxLength={18}
                  value={consumerNumber}
                  onChange={(e) =>
                    setConsumerNumber(e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase())
                  }
                  placeholder={selectedBoard.idHint}
                  required
                  className="w-full h-12 pl-10 pr-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-sm font-semibold text-[#0E163B] placeholder:font-sans placeholder:font-normal placeholder:text-[#94A3B8] focus:bg-white focus:border-[#5B35E5] focus:ring-2 focus:ring-[#5B35E5]/15 outline-none transition-all"
                />
              </div>
            </div>

            {/* Bill Amount Input + Quick Amount Grid */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="elec-amount" className="text-xs font-semibold text-[#334155]">
                  Bill Amount (₹)
                </label>
                <span className="text-[11px] font-mono text-[#64748B] tabular-nums">
                  ₹{minBill} – ₹{maxBill.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg font-bold text-[#5B35E5]">
                  ₹
                </span>
                <input
                  id="elec-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={minBill}
                  max={maxBill}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter payable bill amount"
                  required
                  className="w-full h-13 pl-9 pr-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-xl font-bold placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-[#94A3B8] text-[#0E163B] tabular-nums focus:bg-white focus:border-[#5B35E5] focus:ring-2 focus:ring-[#5B35E5]/15 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-5 gap-1.5 sm:gap-2 mt-2.5">
                {QUICK_BILL_AMOUNTS.map((preset) => {
                  const active = Number(amount) === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className={`h-9 rounded-xl border font-mono text-[11px] sm:text-xs font-semibold tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[#0E163B] text-white border-[#0E163B]'
                          : 'bg-[#FAF9FE] text-[#334155] border-[#EAE7F5] hover:border-[#5B35E5] hover:text-[#5B35E5]'
                      }`}
                    >
                      ₹{preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Collapsible Optional Customer Receipt Details (Keeps Mobile View Clean & Fast) */}
            <div className="border-t border-[#F1EEF9] pt-3">
              <button
                type="button"
                onClick={() => setShowOptionalDetails((prev) => !prev)}
                aria-expanded={showOptionalDetails}
                className="w-full flex items-center justify-between gap-2 py-1 text-xs font-semibold text-[#475569] hover:text-[#0E163B] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <i className="fa-solid fa-user-pen text-[#5B35E5] text-[11px]" aria-hidden="true" />
                  <span>
                    Add Consumer Name / Mobile{' '}
                    <span className="font-normal text-[#94A3B8]">(Optional)</span>
                  </span>
                  {hasOptionalFilled && !showOptionalDetails && (
                    <i className="fa-solid fa-circle-check text-[#15803D] text-[11px]" aria-hidden="true" />
                  )}
                </span>
                <i
                  className={`fa-solid fa-chevron-down text-[10px] text-[#94A3B8] transition-transform duration-150 ${
                    showOptionalDetails ? 'rotate-180 text-[#5B35E5]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {showOptionalDetails && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label htmlFor="elec-cust-name" className="block text-[11px] font-semibold text-[#475569] mb-1">
                      Consumer Name
                    </label>
                    <input
                      id="elec-cust-name"
                      type="text"
                      maxLength={80}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Name on electricity bill"
                      className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs sm:text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5] outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="elec-cust-mobile" className="block text-[11px] font-semibold text-[#475569] mb-1">
                      Customer Mobile (+91)
                    </label>
                    <input
                      id="elec-cust-mobile"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value.replace(/\D/g, ''))}
                      placeholder="10-digit mobile for receipt"
                      className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-xs sm:text-sm text-[#0E163B] placeholder:font-sans focus:bg-white focus:border-[#5B35E5] outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {!isServiceClosed && pricing.serviceCharge > 0 && Number(amount) > 0 && (
              <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-3.5 py-2.5 text-xs space-y-1">
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

            {/* Primary CTA */}
            <button
              type="submit"
              disabled={submitting || isServiceClosed}
              className="w-full h-12 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <i
                className={`fa-solid ${isServiceClosed ? 'fa-ban' : 'fa-bolt-lightning'}`}
                aria-hidden="true"
              />
              <span>
                {isServiceClosed
                  ? `${selectedBoard.short} Temporarily Closed`
                  : amount && Number(amount) > 0
                    ? `Pay ${formatINR(pricing.totalPayable || amount)} · ${selectedBoard.short}`
                    : `Proceed to Pay ${selectedBoard.short} Bill`}
              </span>
            </button>

            <p className="text-[11px] text-[#64748B] leading-relaxed text-center">
              Double-check your {selectedBoard.consumerLabel} and exact bill amount. Automatic live bill fetch activates when an external BBPS API is configured in Admin Settings.
            </p>
          </div>
        </form>

        {/* Right Column: Live Bill Summary & Payment Assurance */}
        <aside className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-3xl border border-[#EAE7F5] p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#F1EEF9]">
              <h2 className="text-sm font-bold text-[#0E163B]">Payment Summary</h2>
              <span className="text-[11px] font-semibold text-[#5B35E5]">West Bengal</span>
            </div>

            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#64748B]">Provider</dt>
                <dd className="font-semibold text-[#0E163B] text-right truncate">{selectedBoard.short}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#64748B]">Coverage</dt>
                <dd className="font-medium text-[#334155] text-right truncate">{selectedBoard.area}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#64748B]">{selectedBoard.consumerLabel}</dt>
                <dd className="font-mono font-semibold text-[#0E163B] text-right">
                  {consumerNumber.trim() || '—'}
                </dd>
              </div>
              {pricing.serviceCharge > 0 && Number(amount) > 0 && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[#64748B]">Bill Amount</dt>
                    <dd className="font-mono font-semibold text-[#0E163B] tabular-nums">
                      {formatINR(amount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[#B45309]">Fixed Service Charge</dt>
                    <dd className="font-mono font-semibold text-[#B45309] tabular-nums">
                      + {formatINR(pricing.serviceCharge)}
                    </dd>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-dashed border-[#E2E8F0]">
                <dt className="font-semibold text-[#0E163B]">Payable Amount</dt>
                <dd className="font-mono text-base font-bold text-[#5B35E5] tabular-nums">
                  {amount && Number(amount) > 0 ? formatINR(pricing.totalPayable || amount) : '₹0.00'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="lavender-wash rounded-3xl border border-[#EAE7F5] p-4 sm:p-5 space-y-3">
            <h2 className="text-xs font-bold text-[#0E163B] flex items-center gap-2">
              <i className="fa-solid fa-shield-halved text-[#5B35E5]" aria-hidden="true" />
              <span>Protected Wallet Settlement</span>
            </h2>
            <div className="space-y-2 text-xs text-[#475569] leading-relaxed">
              <p>
                <strong className="text-[#0E163B]">WBSEDCL</strong> covers all districts across West Bengal, while{' '}
                <strong className="text-[#0E163B]">CESC</strong> covers Kolkata, Howrah &amp; Hooghly.
              </p>
              <p>
                Every transaction is recorded atomically in your permanent wallet ledger with duplicate protection and instant refund if a bill fails.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Dedicated West Bengal Electricity Bill History */}
      <section className="bg-white rounded-3xl border border-[#EAE7F5] overflow-hidden shadow-xs">
        <div className="px-4 sm:px-5 py-4 border-b border-[#EAE7F5] flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold text-[#0E163B]">Electricity Bill History</h2>
          <span className="text-[11px] font-medium text-[#64748B]">
            {electricityHistory.length} {electricityHistory.length === 1 ? 'bill' : 'bills'}
          </span>
        </div>
        {electricityHistory.length > 0 ? (
          electricityHistory.map((tx) => (
            <ExpandableTransactionRow key={tx._id} tx={tx} onRaiseComplaint={onRaiseComplaint} />
          ))
        ) : (
          <div className="p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center mx-auto">
              <i className="fa-solid fa-bolt-lightning text-sm" aria-hidden="true" />
            </div>
            <div className="font-semibold text-xs sm:text-sm text-[#0E163B]">No electricity bills paid yet</div>
            <p className="text-[11px] text-[#64748B]">
              Your paid WBSEDCL and CESC bills will appear here with full digital receipts.
            </p>
          </div>
        )}
      </section>

      {/* Confirm & Pay Modal */}
      <ModalDialog
        open={confirmOpen}
        title="Confirm Electricity Bill Payment"
        onClose={() => !submitting && setConfirmOpen(false)}
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#64748B]">Electricity Board</span>
              <span className="inline-flex items-center gap-2 font-semibold text-[#0E163B]">
                <Image
                  src={selectedBoard.logo}
                  alt={selectedBoard.short}
                  width={20}
                  height={20}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full object-contain"
                />
                <span>{selectedBoard.short}</span>
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#64748B]">{selectedBoard.consumerLabel}</span>
              <span className="font-mono font-bold text-[#0E163B]">{consumerNumber.trim().toUpperCase()}</span>
            </div>
            {customerName.trim() && (
              <div className="flex justify-between gap-2">
                <span className="text-[#64748B]">Consumer Name</span>
                <span className="font-medium text-[#0E163B]">{customerName.trim()}</span>
              </div>
            )}
            {customerMobile.trim() && (
              <div className="flex justify-between gap-2">
                <span className="text-[#64748B]">Customer Mobile</span>
                <span className="font-mono font-medium text-[#0E163B]">+91 {customerMobile.trim()}</span>
              </div>
            )}
            {pricing.serviceCharge > 0 && (
              <>
                <div className="flex justify-between pt-2 border-t border-[#EAE7F5]">
                  <span className="text-[#64748B]">Bill Amount</span>
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
              <span className="text-[#64748B]">Payable Bill Amount</span>
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
            disabled={submitting}
            onNavigateForgot={() => setConfirmOpen(false)}
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
              className="flex-1 h-11 rounded-xl border border-[#E2E8F0] font-semibold text-[#475569] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={submitting || walletPin.length !== 6}
              className="flex-1 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <i className={`fa-solid ${submitting ? 'fa-spinner fa-spin' : 'fa-check'}`} aria-hidden="true" />
              <span>{submitting ? 'Processing...' : 'Confirm & Pay'}</span>
            </button>
          </div>
        </div>
      </ModalDialog>

      <TransactionResultModal
        open={resultModalOpen && Boolean(lastResult)}
        onClose={() => setResultModalOpen(false)}
        status={lastResult?.status}
        title={
          lastResult?.status === 'SUCCESSFUL'
            ? 'Electricity Bill Paid'
            : lastResult?.status === 'FAILED'
              ? 'Bill Payment Failed'
              : 'Bill Payment Pending'
        }
        subtitle={lastResult ? `${lastResult.operatorName} · Consumer ${lastResult.targetNumber}` : ''}
        amount={lastResult?.amount || 0}
        logo={lastResult?.operatorCode === 'CESC' ? '/logos/cesc.svg' : '/logos/wbsedcl.svg'}
        logoAlt={lastResult?.operatorName || selectedBoard.short}
        transactionId={lastResult?._id || ''}
        timestamp={lastResult?.createdAt || ''}
        statusMessage={lastResult?.statusMessage || ''}
        details={
          lastResult
            ? [
                { label: 'Consumer ID', value: lastResult.targetNumber, mono: true },
                { label: 'State', value: lastResult.circle || 'West Bengal' },
                ...(lastResult.customerName ? [{ label: 'Consumer Name', value: lastResult.customerName }] : []),
                { label: 'Reference', value: lastResult.operatorRef || '', mono: true },
                ...(Number(lastResult.serviceCharge || 0) > 0
                  ? [
                      {
                        label: 'Service Charge',
                        value: `+ ${formatINR(lastResult.serviceCharge)}`,
                        mono: true,
                      },
                      {
                        label: 'Total Debited',
                        value: formatINR(lastResult.totalPayable || lastResult.amount),
                        mono: true,
                      },
                    ]
                  : []),
                ...(Number(lastResult.commissionAmount || 0) > 0
                  ? [
                      {
                        label: 'Commission Earned',
                        value: `+ ${formatINR(lastResult.commissionAmount)}`,
                        mono: true,
                        highlight: 'green',
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
    </div>
  );
}
