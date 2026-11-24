'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { DTH_OPERATORS } from '@/lib/constants.js';
import {
  calculateCommission,
  formatINR,
  validateDthSubscriber,
  validateRechargeAmount,
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

export default function DthRechargeView({
  token,
  wallet,
  settings,
  commissions = [],
  recentTransactions,
  onSuccessRefresh,
  onRaiseComplaint,
}) {
  const [operatorCode, setOperatorCode] = useState('TATA_PLAY');
  const [subscriberId, setSubscriberId] = useState('');
  const [amount, setAmount] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [walletPin, setWalletPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);

  const selectedOperator = useMemo(
    () => DTH_OPERATORS.find((op) => op.code === operatorCode) || DTH_OPERATORS[0],
    [operatorCode]
  );

  const dthRulesMap = useMemo(() => {
    const map = {};
    for (const rule of commissions || []) {
      if (rule.serviceType === 'DTH') map[rule.operatorCode] = rule;
    }
    return map;
  }, [commissions]);

  const activeRule = dthRulesMap[operatorCode] || null;
  const isPlatformDisabled = settings?.dthRechargeEnabled === false;
  const isOperatorDisabled = activeRule ? activeRule.isActive === false : false;
  const isServiceClosed = isPlatformDisabled || isOperatorDisabled;

  const pricing = useMemo(
    () => calculateCommission(Number(amount || 0), activeRule),
    [amount, activeRule]
  );

  const dthHistory = useMemo(
    () => (recentTransactions || []).filter((t) => t.type === 'DTH_RECHARGE'),
    [recentTransactions]
  );

  function handleSelectOperator(code) {
    setOperatorCode(code);
    setError('');
  }

  function handleOpenConfirm(e) {
    e.preventDefault();
    setError('');
    if (isPlatformDisabled) {
      setError('DTH Recharge is currently paused by the administrator. Please try again later.');
      return;
    }
    if (isOperatorDisabled) {
      setError(`${selectedOperator.name} DTH recharge is temporarily closed by the administrator.`);
      return;
    }
    const subCheck = validateDthSubscriber(operatorCode, subscriberId);
    if (!subCheck.valid) {
      setError(subCheck.message);
      return;
    }
    const amtCheck = validateRechargeAmount(amount, settings || {});
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
      setPinError('Enter your 6-digit Wallet PIN to authorize this DTH recharge.');
      return;
    }
    setSubmitting(true);
    setError('');
    setPinError('');
    try {
      const idempotencyKey = `DTH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const data = await apiRequest('/api/user/recharge/dth', {
        method: 'POST',
        token,
        body: {
          operatorCode,
          subscriberId: subscriberId.trim(),
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
      await onSuccessRefresh();
    } catch (err) {
      const msg = err?.message || 'Unable to complete DTH recharge.';
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

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0E163B]">DTH Recharge</h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          Instant Indian DTH TV recharge · Available Balance:{' '}
          <span className="font-mono font-semibold text-[#0E163B] tabular-nums">
            {formatINR(wallet?.currentBalance || 0)}
          </span>
        </p>
      </div>

      {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}

      {lastResult && (
        <div className="bg-white rounded-2xl border border-[#DDD6FE] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-bold text-sm text-[#0E163B]">
              DTH Transaction · {lastResult._id}
            </span>
            <StatusText status={lastResult.status} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-[#64748B]">Subscriber ID</div>
              <div className="font-mono font-semibold text-[#0E163B] mt-0.5">{lastResult.targetNumber}</div>
            </div>
            <div>
              <div className="text-[#64748B]">DTH Operator</div>
              <div className="font-semibold text-[#0E163B] mt-0.5">{lastResult.operatorName}</div>
            </div>
            <div>
              <div className="text-[#64748B]">Amount</div>
              <div className="font-mono font-semibold text-[#0E163B] tabular-nums mt-0.5">
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
          <p className="text-xs text-[#475569] bg-[#FAF9FE] border border-[#EAE7F5] rounded-xl px-3.5 py-2.5">
            {lastResult.statusMessage}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Left: Redesigned Clean DTH Recharge Form */}
        <form
          onSubmit={handleOpenConfirm}
          className="lg:col-span-6 bg-white rounded-2xl border border-[#EAE7F5] p-4 sm:p-6 space-y-5"
        >
          {/* Official Brand Logo DTH Operator Selector — Zero Commission Clutter */}
          <div>
            <span className="block text-xs font-semibold text-[#334155] mb-2.5">Select DTH Operator</span>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-2.5">
              {DTH_OPERATORS.map((op) => {
                const active = op.code === operatorCode;
                const opClosed = isPlatformDisabled || dthRulesMap[op.code]?.isActive === false;
                return (
                  <button
                    key={op.code}
                    type="button"
                    onClick={() => handleSelectOperator(op.code)}
                    aria-pressed={active}
                    className={`relative flex flex-col items-center justify-center py-3 px-2 rounded-2xl border-2 transition-all cursor-pointer ${
                      opClosed
                        ? active
                          ? 'border-[#FCA5A5] bg-[#FEF2F2]/70 opacity-85'
                          : 'border-[#F1EEF9] bg-[#F8FAFC] opacity-70 hover:opacity-90'
                        : active
                          ? 'border-[#5B35E5] bg-[#F5F3FF] shadow-xs'
                          : 'border-[#EAE7F5] bg-white hover:border-[#CBD5E1] hover:bg-[#FAF9FE]'
                    }`}
                  >
                    {opClosed ? (
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md bg-[#FEE2E2] text-[#DC2626] text-[9px] font-bold">
                        Closed
                      </span>
                    ) : active ? (
                      <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#5B35E5] text-white flex items-center justify-center">
                        <i className="fa-solid fa-check text-[9px]" aria-hidden="true" />
                      </span>
                    ) : null}
                    <Image
                      src={op.logo}
                      alt={op.name}
                      width={44}
                      height={44}
                      referrerPolicy="no-referrer"
                      className={`w-11 h-11 rounded-full object-contain shadow-xs ${
                        opClosed ? 'grayscale' : ''
                      }`}
                    />
                    <span
                      className={`mt-2 text-[11px] font-bold tracking-tight text-center leading-tight ${
                        opClosed ? 'text-[#94A3B8]' : active ? 'text-[#5B35E5]' : 'text-[#0E163B]'
                      }`}
                    >
                      {op.short}
                    </span>
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
                    ? 'DTH Recharge is currently paused by the administrator. Please check back soon.'
                    : `${selectedOperator.name} recharge is temporarily closed by the administrator. Select another active DTH operator or try again later.`}
                </p>
              </div>
            </div>
          )}

          {/* Subscriber ID */}
          <div>
            <label htmlFor="dth-sub-id" className="block text-xs font-semibold text-[#334155] mb-1.5">
              Subscriber ID / Customer ID
            </label>
            <input
              id="dth-sub-id"
              type="text"
              inputMode="numeric"
              maxLength={12}
              value={subscriberId}
              onChange={(e) => setSubscriberId(e.target.value.replace(/\D/g, ''))}
              placeholder={selectedOperator.idHint}
              required
              className="w-full h-11 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5] outline-none"
            />
            <p className="text-[11px] text-[#64748B] mt-1">{selectedOperator.idHint}</p>
          </div>

          {/* Recharge Amount */}
          <div>
            <label htmlFor="dth-amount" className="block text-xs font-semibold text-[#334155] mb-1.5">
              Recharge Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-[#5B35E5]">₹</span>
              <input
                id="dth-amount"
                type="number"
                inputMode="numeric"
                min={settings?.minRechargeAmount ?? 10}
                max={settings?.maxRechargeAmount ?? 10000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount (e.g. 349)"
                required
                className="w-full h-12 pl-8 pr-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-lg font-bold placeholder:font-sans placeholder:text-sm placeholder:font-normal text-[#0E163B] tabular-nums focus:bg-white focus:border-[#5B35E5] outline-none"
              />
            </div>
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
            disabled={submitting || isServiceClosed}
            className="w-full h-12 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <i className={`fa-solid ${isServiceClosed ? 'fa-ban' : 'fa-satellite-dish'}`} aria-hidden="true" />
            <span>
              {isServiceClosed
                ? `${selectedOperator.short} Temporarily Closed`
                : pricing.serviceCharge > 0 && Number(amount) > 0
                  ? `Proceed to Pay ${formatINR(pricing.totalPayable)}`
                  : 'Proceed to DTH Recharge'}
            </span>
          </button>
        </form>

        {/* Right: Separate DTH Transaction History */}
        <section className="lg:col-span-6 bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-[#EAE7F5] flex items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-bold text-[#0E163B]">DTH Transaction History</h2>
            <span className="text-[11px] font-medium text-[#64748B]">
              {dthHistory.length} {dthHistory.length === 1 ? 'order' : 'orders'}
            </span>
          </div>
          {dthHistory.length > 0 ? (
            dthHistory.map((tx) => (
              <ExpandableTransactionRow key={tx._id} tx={tx} onRaiseComplaint={onRaiseComplaint} />
            ))
          ) : (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No DTH recharge transactions yet.
            </div>
          )}
        </section>
      </div>

      <ModalDialog
        open={confirmOpen}
        title="Confirm DTH Recharge"
        onClose={() => !submitting && setConfirmOpen(false)}
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-xl bg-[#FAF9FE] border border-[#EAE7F5] p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">DTH Operator</span>
              <span className="inline-flex items-center gap-2 font-semibold text-[#0E163B]">
                <Image
                  src={selectedOperator.logo}
                  alt={selectedOperator.name}
                  width={20}
                  height={20}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full object-contain"
                />
                <span>{selectedOperator.name}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Subscriber ID</span>
              <span className="font-mono font-bold text-[#0E163B]">{subscriberId}</span>
            </div>
            {pricing.serviceCharge > 0 && (
              <>
                <div className="flex justify-between pt-2 border-t border-[#EAE7F5]">
                  <span className="text-[#64748B]">Recharge Amount</span>
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
            <div className="flex justify-between pt-2 border-t border-[#EAE7F5]">
              <span className="text-[#64748B]">Payable Amount</span>
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
            ? 'DTH Recharge Successful'
            : lastResult?.status === 'FAILED'
              ? 'DTH Recharge Failed'
              : 'DTH Recharge Pending'
        }
        subtitle={lastResult ? `${lastResult.operatorName} · ID ${lastResult.targetNumber}` : ''}
        amount={lastResult?.amount || 0}
        logo={
          DTH_OPERATORS.find((op) => op.code === lastResult?.operatorCode)?.logo ||
          selectedOperator.logo
        }
        logoAlt={lastResult?.operatorName || selectedOperator.name}
        transactionId={lastResult?._id || ''}
        timestamp={lastResult?.createdAt || ''}
        statusMessage={lastResult?.statusMessage || ''}
        details={
          lastResult
            ? [
                { label: 'Subscriber ID', value: lastResult.targetNumber, mono: true },
                { label: 'Operator Ref', value: lastResult.operatorRef || '', mono: true },
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
