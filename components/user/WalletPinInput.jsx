'use client';

import { useRef, useState } from 'react';
import { apiRequest } from '@/lib/api-client.js';
import { usePortal } from '@/components/PortalShell.jsx';

const PIN_LENGTH = 6;

/**
 * Six-box numeric Wallet PIN input with masking toggle, paste support,
 * smooth mobile keyboard entry, and backspace navigation.
 */
export function WalletPinInput({
  idPrefix = 'wallet-pin',
  label = 'Enter 6-Digit Wallet PIN',
  value = '',
  onChange,
  disabled = false,
  error = '',
  helperText = '',
  showToggle = true,
  rightSlot = null,
}) {
  const [showPin, setShowPin] = useState(false);
  const inputRefs = useRef([]);

  const digits = Array.from({ length: PIN_LENGTH }, (_, i) => String(value || '')[i] || '');

  function updateDigits(nextStr) {
    const clean = String(nextStr || '')
      .replace(/\D/g, '')
      .slice(0, PIN_LENGTH);
    onChange(clean);
  }

  function handleDigitChange(index, raw) {
    const cleaned = String(raw || '').replace(/\D/g, '');
    if (!cleaned) {
      const next = [...digits];
      next[index] = '';
      updateDigits(next.join(''));
      return;
    }

    // Handle multi-digit paste or fast typing
    if (cleaned.length > 1) {
      const next = [...digits];
      for (let i = 0; i < cleaned.length && index + i < PIN_LENGTH; i += 1) {
        next[index + i] = cleaned[i];
      }
      const joined = next.join('');
      updateDigits(joined);
      const focusIdx = Math.min(PIN_LENGTH - 1, index + cleaned.length);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = cleaned;
    updateDigits(next.join(''));
    if (index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        updateDigits(next.join(''));
      } else if (index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        updateDigits(next.join(''));
        inputRefs.current[index - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (!pasted) return;
    updateDigits(pasted);
    const focusIdx = Math.min(PIN_LENGTH - 1, pasted.length);
    inputRefs.current[focusIdx]?.focus();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${idPrefix}-0`} className="block text-xs font-semibold text-[#334155]">
          {label}
        </label>
        <div className="flex items-center gap-3">
          {showToggle && (
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#64748B] hover:text-[#0E163B] cursor-pointer"
            >
              <i className={`fa-solid ${showPin ? 'fa-eye-slash' : 'fa-eye'} text-[10px]`} aria-hidden="true" />
              <span>{showPin ? 'Hide' : 'Show'}</span>
            </button>
          )}
          {rightSlot}
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2" onPaste={handlePaste}>
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputRefs.current[idx] = el;
            }}
            id={`${idPrefix}-${idx}`}
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete="off"
            disabled={disabled}
            aria-label={`${label} digit ${idx + 1}`}
            value={digit}
            onChange={(e) => handleDigitChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onFocus={(e) => e.target.select()}
            className={`w-full h-11 sm:h-12 text-center font-mono text-lg font-bold rounded-xl border-2 outline-none transition-colors disabled:opacity-60 ${
              error
                ? 'border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B] focus:border-[#DC2626]'
                : digit
                  ? 'border-[#5B35E5] bg-white text-[#0E163B]'
                  : 'border-[#E2E8F0] bg-[#FAF9FE] text-[#0E163B] focus:bg-white focus:border-[#5B35E5]'
            }`}
          />
        ))}
      </div>

      {helperText && !error && <p className="text-[11px] text-[#64748B]">{helperText}</p>}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[11px] text-[#991B1B] flex items-center gap-2"
        >
          <i className="fa-solid fa-circle-exclamation shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Reusable transaction-confirmation Wallet PIN section.
 * - If user already has a 6-digit Wallet PIN: collects the 6-digit PIN + provides Forgot PIN link.
 * - If an older account has not set a Wallet PIN yet: guides through a 2-step Enter -> Confirm setup inline.
 */
export function WalletPinConfirmBox({
  value = '',
  onChange,
  error = '',
  disabled = false,
}) {
  const { token, meData, updateUser } = usePortal();
  const hasWalletPin = Boolean(meData?.user?.hasWalletPin);

  // Inline first-time setup state (only shown for older accounts without a PIN yet)
  const [setupStep, setSetupStep] = useState('ENTER'); // 'ENTER' | 'CONFIRM'
  const [firstPin, setFirstPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [setupError, setSetupError] = useState('');
  const [savingSetup, setSavingSetup] = useState(false);

  async function handleSaveInitialPin() {
    setSetupError('');
    if (!/^\d{6}$/.test(firstPin)) {
      setSetupError('Enter a 6-digit numeric Wallet PIN.');
      return;
    }
    if (firstPin !== confirmPin) {
      setSetupError('Both 6-digit PIN entries do not match. Please re-enter.');
      setConfirmPin('');
      return;
    }
    setSavingSetup(true);
    try {
      const res = await apiRequest('/api/user/wallet-pin', {
        method: 'POST',
        token,
        body: {
          action: 'SET_INITIAL',
          newPin: firstPin,
          confirmPin,
        },
      });
      if (res.user) updateUser(res.user);
      onChange(firstPin);
      setFirstPin('');
      setConfirmPin('');
      setSetupStep('ENTER');
    } catch (err) {
      setSetupError(err?.message || 'Unable to save Wallet PIN.');
    } finally {
      setSavingSetup(false);
    }
  }

  if (!hasWalletPin) {
    return (
      <div className="rounded-2xl border border-[#DDD6FE] bg-[#F5F3FF]/70 p-3.5 sm:p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-[#5B35E5] text-white flex items-center justify-center shrink-0">
            <i className="fa-solid fa-shield-halved text-xs" aria-hidden="true" />
          </span>
          <div>
            <div className="text-xs font-bold text-[#0E163B]">Set Your 6-Digit Wallet PIN First</div>
            <p className="text-[11px] text-[#475569] mt-0.5 leading-relaxed">
              {setupStep === 'ENTER'
                ? 'Create a 6-digit Wallet PIN to authorize this payment and all future recharges.'
                : 'Re-enter the same 6-digit Wallet PIN to confirm.'}
            </p>
          </div>
        </div>

        {setupStep === 'ENTER' ? (
          <div className="space-y-3">
            <WalletPinInput
              idPrefix="inline-setup-pin-1"
              label="Step 1: Enter 6-Digit Wallet PIN"
              value={firstPin}
              onChange={(val) => {
                setFirstPin(val);
                if (setupError) setSetupError('');
              }}
              error={setupError}
            />
            <button
              type="button"
              disabled={firstPin.length !== 6}
              onClick={() => {
                if (firstPin.length !== 6) {
                  setSetupError('Please enter all 6 digits.');
                  return;
                }
                setSetupError('');
                setConfirmPin('');
                setSetupStep('CONFIRM');
              }}
              className="w-full h-10 rounded-xl bg-[#0E163B] hover:bg-[#19245A] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Continue to Confirm PIN
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <WalletPinInput
              idPrefix="inline-setup-pin-2"
              label="Step 2: Re-enter 6-Digit Wallet PIN"
              value={confirmPin}
              onChange={(val) => {
                setConfirmPin(val);
                if (setupError) setSetupError('');
              }}
              disabled={savingSetup}
              error={setupError}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingSetup}
                onClick={() => {
                  setSetupStep('ENTER');
                  setConfirmPin('');
                  setSetupError('');
                }}
                className="px-3.5 h-10 rounded-xl border border-[#DDD6FE] bg-white text-[#475569] text-xs font-semibold cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={savingSetup || confirmPin.length !== 6}
                onClick={handleSaveInitialPin}
                className="flex-1 h-10 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <i className={`fa-solid ${savingSetup ? 'fa-spinner fa-spin' : 'fa-check'}`} aria-hidden="true" />
                <span>{savingSetup ? 'Saving PIN...' : 'Confirm & Activate PIN'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#EAE7F5] bg-[#FAF9FE] p-3.5 sm:p-4 space-y-2.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#5B35E5]">
        <i className="fa-solid fa-lock" aria-hidden="true" />
        <span>Wallet PIN Authorization Required</span>
      </div>

      <WalletPinInput
        idPrefix="tx-confirm-pin"
        label="Enter 6-Digit Wallet PIN"
        value={value}
        onChange={onChange}
        disabled={disabled}
        error={error}
      />
    </div>
  );
}
