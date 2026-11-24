'use client';

import { useState, useEffect, useCallback } from 'react';
import { COMPLAINT_CATEGORIES, INDIAN_STATES } from '@/lib/constants.js';
import { apiRequest } from '@/lib/api-client.js';
import { InlineAlert, StatusText, formatDateTime } from '@/components/SharedUI.jsx';
import { WalletPinInput } from '@/components/user/WalletPinInput.jsx';

function getInitials(name) {
  const parts = String(name || 'QR')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'QR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatMemberSince(iso) {
  if (!iso) return 'Verified Member';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return 'Verified Member';
  }
}

export default function ProfileAndSupportView({
  token,
  user,
  mode = 'PROFILE', // 'PROFILE' | 'COMPLAINTS'
  prefillComplaintTx = null,
  onUserUpdated,
  onLogout,
}) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  const userDisplayId = user?.accountId || user?.mobile || '';

  // Editable personal details (including direct Mobile Number without OTP)
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [mobile, setMobile] = useState(user?.mobile || '');
  const [shopName, setShopName] = useState(user?.shopName || '');
  const [state, setState] = useState(user?.state || 'West Bengal');
  const [city, setCity] = useState(user?.city || '');
  const [pincode, setPincode] = useState(user?.pincode || '');
  const [address, setAddress] = useState(user?.address || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  // Wallet PIN settings (Create Initial | Change with Old PIN | Forgot via Email OTP)
  const [pinTab, setPinTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('pinTab') === 'forgot') return 'FORGOT';
    }
    return 'CHANGE';
  });
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  // Initial setup (for older accounts without a PIN yet)
  const [initPinStage, setInitPinStage] = useState('ENTER'); // 'ENTER' | 'CONFIRM'
  const [initPin, setInitPin] = useState('');
  const [initConfirmPin, setInitConfirmPin] = useState('');

  // Change with old PIN
  const [oldPin, setOldPin] = useState('');
  const [changeNewPin, setChangeNewPin] = useState('');
  const [changeConfirmPin, setChangeConfirmPin] = useState('');

  // Forgot Wallet PIN via Email OTP
  const [forgotPinOtpStep, setForgotPinOtpStep] = useState(null); // { otpId, email, demoOtpCode, providerConfigured, notice }
  const [forgotPinOtpCode, setForgotPinOtpCode] = useState('');
  const [forgotPinResetToken, setForgotPinResetToken] = useState('');
  const [forgotPinStage, setForgotPinStage] = useState('ENTER'); // 'ENTER' | 'CONFIRM'
  const [forgotNewPin, setForgotNewPin] = useState('');
  const [forgotConfirmPin, setForgotConfirmPin] = useState('');

  // Complaints
  const [complaints, setComplaints] = useState([]);
  const [cmpCategory, setCmpCategory] = useState(prefillComplaintTx?.type || 'MOBILE_RECHARGE');
  const [cmpRef, setCmpRef] = useState(prefillComplaintTx?._id || '');
  const [cmpSubject, setCmpSubject] = useState(
    prefillComplaintTx ? `Issue with ${prefillComplaintTx.operatorName || 'Order'} (${prefillComplaintTx._id})` : ''
  );
  const [cmpDesc, setCmpDesc] = useState('');
  const [submittingCmp, setSubmittingCmp] = useState(false);

  const loadComplaints = useCallback(async () => {
    try {
      const data = await apiRequest('/api/user/complaints', { token });
      setComplaints(data.complaints || []);
    } catch {
      // Handled gracefully
    }
  }, [token]);

  useEffect(() => {
    if (mode !== 'COMPLAINTS') return undefined;
    let cancelled = false;
    apiRequest('/api/user/complaints', { token })
      .then((data) => {
        if (!cancelled) setComplaints(data.complaints || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode, token]);

  async function handleCopyUserId() {
    if (!userDisplayId || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(userDisplayId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Ignore clipboard error
    }
  }

  async function handleSaveBasicProfile(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSavingProfile(true);
    try {
      const data = await apiRequest('/api/user/profile', {
        method: 'PATCH',
        token,
        body: {
          action: 'UPDATE_PROFILE',
          fullName,
          mobile,
          shopName,
          state,
          city,
          pincode,
          address,
        },
      });
      onUserUpdated(data.user);
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSavingPass(true);
    try {
      const data = await apiRequest('/api/user/profile', {
        method: 'PATCH',
        token,
        body: { action: 'CHANGE_PASSWORD', currentPassword, newPassword, confirmPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPass(false);
    }
  }

  async function handleSetInitialWalletPin(e) {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');
    if (initPinStage === 'ENTER') {
      if (!/^\d{6}$/.test(initPin)) {
        setPinError('Enter a 6-digit numeric Wallet PIN.');
        return;
      }
      setInitConfirmPin('');
      setInitPinStage('CONFIRM');
      return;
    }
    if (initPin !== initConfirmPin) {
      setPinError('Both 6-digit PIN entries do not match. Please re-enter.');
      setInitConfirmPin('');
      return;
    }
    setPinBusy(true);
    try {
      const data = await apiRequest('/api/user/wallet-pin', {
        method: 'POST',
        token,
        body: { action: 'SET_INITIAL', newPin: initPin, confirmPin: initConfirmPin },
      });
      if (data.user) onUserUpdated(data.user);
      setInitPin('');
      setInitConfirmPin('');
      setInitPinStage('ENTER');
      setPinSuccess(data.message || '6-digit Wallet PIN set successfully.');
    } catch (err) {
      setPinError(err.message);
    } finally {
      setPinBusy(false);
    }
  }

  async function handleChangeWalletPin(e) {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');
    if (!/^\d{6}$/.test(oldPin) || !/^\d{6}$/.test(changeNewPin) || !/^\d{6}$/.test(changeConfirmPin)) {
      setPinError('All Wallet PIN fields must be 6 numeric digits.');
      return;
    }
    if (changeNewPin !== changeConfirmPin) {
      setPinError('New Wallet PIN and Confirm PIN do not match.');
      setChangeConfirmPin('');
      return;
    }
    setPinBusy(true);
    try {
      const data = await apiRequest('/api/user/wallet-pin', {
        method: 'POST',
        token,
        body: {
          action: 'CHANGE',
          currentPin: oldPin,
          newPin: changeNewPin,
          confirmPin: changeConfirmPin,
        },
      });
      if (data.user) onUserUpdated(data.user);
      setOldPin('');
      setChangeNewPin('');
      setChangeConfirmPin('');
      setPinSuccess(data.message || 'Wallet PIN changed successfully.');
    } catch (err) {
      setPinError(err.message);
      setOldPin('');
    } finally {
      setPinBusy(false);
    }
  }

  async function handleForgotPinRequestOtp() {
    setPinError('');
    setPinSuccess('');
    setPinBusy(true);
    try {
      const data = await apiRequest('/api/user/wallet-pin', {
        method: 'POST',
        token,
        body: { action: 'FORGOT_REQUEST_OTP' },
      });
      setForgotPinOtpStep(data);
      setForgotPinOtpCode('');
      setForgotPinResetToken('');
      setForgotPinStage('ENTER');
      setForgotNewPin('');
      setForgotConfirmPin('');
      setPinSuccess(data.notice);
    } catch (err) {
      setPinError(err.message);
    } finally {
      setPinBusy(false);
    }
  }

  async function handleForgotPinVerifyOtp(e) {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');
    if (!/^\d{6}$/.test(forgotPinOtpCode)) {
      setPinError('Enter the 6-digit Email OTP code.');
      return;
    }
    setPinBusy(true);
    try {
      const data = await apiRequest('/api/user/wallet-pin', {
        method: 'POST',
        token,
        body: {
          action: 'FORGOT_VERIFY_OTP',
          otpId: forgotPinOtpStep.otpId,
          code: forgotPinOtpCode,
        },
      });
      setForgotPinResetToken(data.pinResetToken);
      setForgotPinStage('ENTER');
      setForgotNewPin('');
      setForgotConfirmPin('');
      setPinSuccess(data.message || 'Email OTP verified. Set your new 6-digit Wallet PIN.');
    } catch (err) {
      setPinError(err.message);
    } finally {
      setPinBusy(false);
    }
  }

  async function handleForgotPinResetSubmit(e) {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');
    if (forgotPinStage === 'ENTER') {
      if (!/^\d{6}$/.test(forgotNewPin)) {
        setPinError('Enter a new 6-digit numeric Wallet PIN.');
        return;
      }
      setForgotConfirmPin('');
      setForgotPinStage('CONFIRM');
      return;
    }
    if (forgotNewPin !== forgotConfirmPin) {
      setPinError('Both 6-digit Wallet PIN entries must match.');
      setForgotConfirmPin('');
      return;
    }
    setPinBusy(true);
    try {
      const data = await apiRequest('/api/user/wallet-pin', {
        method: 'POST',
        token,
        body: {
          action: 'FORGOT_RESET',
          otpId: forgotPinOtpStep.otpId,
          pinResetToken: forgotPinResetToken,
          newPin: forgotNewPin,
          confirmPin: forgotConfirmPin,
        },
      });
      if (data.user) onUserUpdated(data.user);
      setForgotPinOtpStep(null);
      setForgotPinOtpCode('');
      setForgotPinResetToken('');
      setForgotPinStage('ENTER');
      setForgotNewPin('');
      setForgotConfirmPin('');
      setPinTab('CHANGE');
      setPinSuccess(data.message || 'Wallet PIN reset successfully.');
    } catch (err) {
      setPinError(err.message);
    } finally {
      setPinBusy(false);
    }
  }

  async function handleSubmitComplaint(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmittingCmp(true);
    try {
      const data = await apiRequest('/api/user/complaints', {
        method: 'POST',
        token,
        body: {
          category: cmpCategory,
          referenceId: cmpRef.trim(),
          subject: cmpSubject.trim(),
          description: cmpDesc.trim(),
        },
      });
      setSuccess(`Complaint registered with ID ${data.complaint._id}.`);
      setCmpRef('');
      setCmpSubject('');
      setCmpDesc('');
      await loadComplaints();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingCmp(false);
    }
  }

  if (mode === 'COMPLAINTS') {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0E163B]">Complaints &amp; Support</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Raise a support ticket for recharges, deposits, pending refunds, wallet, or redeem codes.
          </p>
        </div>

        {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
        {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          <form
            onSubmit={handleSubmitComplaint}
            className="lg:col-span-5 bg-white rounded-3xl border border-[#EAE7F5] p-5 sm:p-6 space-y-4 h-fit shadow-xs"
          >
            <h2 className="text-base font-bold text-[#0E163B]">Register New Complaint</h2>

            <div>
              <label htmlFor="cmp-cat" className="block text-xs font-semibold text-[#334155] mb-1">
                Issue Category
              </label>
              <select
                id="cmp-cat"
                value={cmpCategory}
                onChange={(e) => setCmpCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
              >
                {COMPLAINT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cmp-ref" className="block text-xs font-semibold text-[#334155] mb-1">
                Transaction / Deposit ID (Optional)
              </label>
              <input
                id="cmp-ref"
                type="text"
                value={cmpRef}
                onChange={(e) => setCmpRef(e.target.value)}
                placeholder="e.g. TXN-20261120-..."
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-sm"
              />
            </div>

            <div>
              <label htmlFor="cmp-subject" className="block text-xs font-semibold text-[#334155] mb-1">
                Subject
              </label>
              <input
                id="cmp-subject"
                type="text"
                value={cmpSubject}
                onChange={(e) => setCmpSubject(e.target.value)}
                placeholder="Brief summary of the issue"
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
              />
            </div>

            <div>
              <label htmlFor="cmp-desc" className="block text-xs font-semibold text-[#334155] mb-1">
                Details
              </label>
              <textarea
                id="cmp-desc"
                rows={4}
                value={cmpDesc}
                onChange={(e) => setCmpDesc(e.target.value)}
                placeholder="Explain what happened with date, amount, or reference..."
                required
                className="w-full p-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submittingCmp}
              className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              {submittingCmp ? 'Submitting...' : 'Submit Complaint'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white rounded-3xl border border-[#EAE7F5] overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-[#EAE7F5]">
              <h2 className="text-base font-bold text-[#0E163B]">My Complaints</h2>
            </div>
            {complaints.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">No complaints filed yet.</div>
            ) : (
              <div className="divide-y divide-[#EAE7F5]">
                {complaints.map((c) => (
                  <div key={c._id} className="p-5 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-[#5B35E5]">{c._id}</span>
                      <StatusText status={c.status} />
                    </div>
                    <div className="font-semibold text-sm text-[#0E163B]">{c.subject}</div>
                    <div className="text-[#64748B]">
                      {c.category}
                      {c.referenceId ? ` · Ref: ${c.referenceId}` : ''} · {formatDateTime(c.createdAt)}
                    </div>
                    <p className="text-[#334155] leading-relaxed">{c.description}</p>
                    {c.adminResponse && (
                      <div className="rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] p-3 text-[#3B2696]">
                        <div className="font-semibold text-[#0E163B] mb-0.5">Super Admin Response:</div>
                        <div>{c.adminResponse}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Personal Fintech Identity Hero Card */}
      <section className="relative overflow-hidden rounded-3xl navy-surface text-white p-5 sm:p-7 shadow-md">
        <div
          className="pointer-events-none absolute -right-12 -top-12 w-48 h-48 rounded-full bg-[#5B35E5]/30"
          aria-hidden="true"
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#5B35E5] to-[#7C3AED] border-2 border-white/25 flex items-center justify-center font-display text-lg sm:text-xl font-bold text-white shadow-sm shrink-0">
              {getInitials(user?.fullName)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-2">
                <h1 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-white truncate">
                  {user?.fullName || 'Retailer Account'}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#10B981]/20 border border-[#34D399]/35 text-[11px] font-semibold text-[#A7F3D0]">
                  <i className="fa-solid fa-circle-check text-[10px]" aria-hidden="true" />
                  <span>{user?.status === 'ACTIVE' ? 'Verified' : user?.status || 'Active'}</span>
                </span>
              </div>
              {user?.shopName && (
                <div className="text-xs font-medium text-[#C4B5FD] mt-0.5 truncate">
                  <i className="fa-solid fa-store mr-1.5 text-[11px]" aria-hidden="true" />
                  {user.shopName}
                </div>
              )}
              <div className="mt-1.5 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] sm:text-xs text-[#CBD5E1]">
                <span className="inline-flex items-center gap-1.5">
                  <i className="fa-solid fa-location-dot text-[#C4B5FD]" aria-hidden="true" />
                  <span>
                    {user?.city || 'India'}
                    {user?.state ? `, ${user.state}` : ''}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="fa-solid fa-calendar-check text-[#C4B5FD]" aria-hidden="true" />
                  <span>Member since {formatMemberSince(user?.createdAt)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={handleCopyUserId}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-mono font-semibold text-white transition-colors cursor-pointer"
            >
              <i className={`fa-solid ${copiedId ? 'fa-check text-[#86EFAC]' : 'fa-id-badge text-[#C4B5FD]'}`} aria-hidden="true" />
              <span>{copiedId ? 'User ID Copied' : `ID: ${userDisplayId}`}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </section>

      {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
      {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Editable Personal & Business Details (including Direct Mobile Number Update — No OTP) */}
        <form
          onSubmit={handleSaveBasicProfile}
          className="lg:col-span-7 bg-white rounded-3xl border border-[#EAE7F5] p-5 sm:p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center gap-3 pb-1 border-b border-[#F1EEF9]">
            <span className="w-9 h-9 rounded-xl bg-[#F5F3FF] text-[#5B35E5] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-user-pen text-sm" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#0E163B]">Personal &amp; Business Details</h2>
              <p className="text-xs text-[#64748B]">Update your name, mobile number, shop name, and address directly.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="prof-name" className="block text-xs font-semibold text-[#334155] mb-1">
                Full Name
              </label>
              <input
                id="prof-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
              />
            </div>

            <div>
              <label htmlFor="prof-mobile" className="block text-xs font-semibold text-[#334155] mb-1">
                Mobile Number (+91)
              </label>
              <input
                id="prof-mobile"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="prof-shop" className="block text-xs font-semibold text-[#334155] mb-1">
                Shop / Display Name <span className="text-[#94A3B8] font-normal">(Optional)</span>
              </label>
              <input
                id="prof-shop"
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g., Maa Digital Point"
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
              />
            </div>

            <div>
              <label htmlFor="prof-state" className="block text-xs font-semibold text-[#334155] mb-1">
                State
              </label>
              <select
                id="prof-state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
              >
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prof-city" className="block text-xs font-semibold text-[#334155] mb-1">
                City / Town
              </label>
              <input
                id="prof-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
              />
            </div>

            <div>
              <label htmlFor="prof-pin" className="block text-xs font-semibold text-[#334155] mb-1">
                PIN Code <span className="text-[#94A3B8] font-normal">(Optional)</span>
              </label>
              <input
                id="prof-pin"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit PIN"
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
              />
            </div>

            <div>
              <label htmlFor="prof-address" className="block text-xs font-semibold text-[#334155] mb-1">
                Area / Street Address <span className="text-[#94A3B8] font-normal">(Optional)</span>
              </label>
              <input
                id="prof-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Market, Landmark, Road"
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
              />
            </div>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={savingProfile}
              className="w-full sm:w-auto px-6 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <i className={`fa-solid ${savingProfile ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} aria-hidden="true" />
              <span>{savingProfile ? 'Saving Changes...' : 'Save Personal Details'}</span>
            </button>
          </div>
        </form>

        {/* Right Column: Account Identity (User ID = Mobile Number + Locked Email) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-3xl border border-[#EAE7F5] p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-3 pb-1 border-b border-[#F1EEF9]">
              <span className="w-9 h-9 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] flex items-center justify-center shrink-0">
                <i className="fa-solid fa-id-card text-sm" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#0E163B]">Account Identity</h2>
                <p className="text-xs text-[#64748B]">Your unique User ID and protected email details.</p>
              </div>
            </div>

            <div className="space-y-3.5">
              {/* User ID = Mobile Number */}
              <div className="rounded-2xl lavender-wash border border-[#DDD6FE] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5B35E5]">
                    Your User ID
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyUserId}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5B35E5] hover:underline cursor-pointer"
                  >
                    <i className={`fa-solid ${copiedId ? 'fa-check' : 'fa-copy'} text-[10px]`} aria-hidden="true" />
                    <span>{copiedId ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div
                  data-testid="profile-user-id"
                  className="font-mono text-xl sm:text-2xl font-bold text-[#0E163B] tracking-wide mt-1"
                >
                  {userDisplayId}
                </div>
                <p className="text-[11px] text-[#64748B] mt-1">
                  Your registered mobile number is automatically assigned as your unique User ID.
                </p>
              </div>

              {/* Permanently Locked Email */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="prof-locked-email" className="text-xs font-semibold text-[#334155]">
                    Registered Email Address
                  </label>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#64748B]">
                    <i className="fa-solid fa-lock text-[9px]" aria-hidden="true" />
                    <span>Locked</span>
                  </span>
                </div>
                <input
                  id="prof-locked-email"
                  type="email"
                  value={user?.email || ''}
                  readOnly
                  disabled
                  className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] text-sm text-[#475569] cursor-not-allowed select-all"
                />
                <p className="text-[11px] text-[#64748B] mt-1">
                  Your primary email is permanently locked to your account and cannot be modified.
                </p>
              </div>

              {/* Account Status Summary */}
              <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-3.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-[#475569]">Account Status</span>
                <StatusText status={user?.status} />
              </div>
            </div>
          </div>
        </div>

        {/* Wallet PIN Security Settings (Set / Change with Old PIN / Forgot PIN via Email OTP) */}
        <section
          id="wallet-pin"
          className="lg:col-span-12 bg-white rounded-3xl border border-[#EAE7F5] p-5 sm:p-6 space-y-5 shadow-xs scroll-mt-20"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#F1EEF9]">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] text-[#5B35E5] flex items-center justify-center shrink-0">
                <i className="fa-solid fa-key text-sm" aria-hidden="true" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-[#0E163B]">6-Digit Wallet PIN Security</h2>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                      user?.hasWalletPin
                        ? 'bg-[#ECFDF5] text-[#15803D] border border-[#A7F3D0]'
                        : 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
                    }`}
                  >
                    <i
                      className={`fa-solid ${user?.hasWalletPin ? 'fa-circle-check' : 'fa-triangle-exclamation'} text-[9px]`}
                      aria-hidden="true"
                    />
                    <span>{user?.hasWalletPin ? 'PIN Active' : 'Not Set Yet'}</span>
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Required for every Mobile Recharge, DTH, Electricity Bill, Redeem Code, and Commission Transfer.
                </p>
              </div>
            </div>

            {user?.hasWalletPin && (
              <div className="inline-flex items-center p-1 rounded-xl bg-[#F5F3FF] border border-[#EAE7F5] self-start sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPinTab('CHANGE');
                    setPinError('');
                    setPinSuccess('');
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    pinTab === 'CHANGE'
                      ? 'bg-white text-[#0E163B] shadow-xs'
                      : 'text-[#64748B] hover:text-[#0E163B]'
                  }`}
                >
                  Change with Old PIN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinTab('FORGOT');
                    setPinError('');
                    setPinSuccess('');
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    pinTab === 'FORGOT'
                      ? 'bg-white text-[#0E163B] shadow-xs'
                      : 'text-[#64748B] hover:text-[#0E163B]'
                  }`}
                >
                  Forgot Wallet PIN
                </button>
              </div>
            )}
          </div>

          {pinError && <InlineAlert type="error" message={pinError} onClose={() => setPinError('')} />}
          {pinSuccess && <InlineAlert type="success" message={pinSuccess} onClose={() => setPinSuccess('')} />}

          {/* Case A: Older account without Wallet PIN -> Two-step Set & Confirm */}
          {!user?.hasWalletPin && (
            <form onSubmit={handleSetInitialWalletPin} className="max-w-md space-y-4">
              {initPinStage === 'ENTER' ? (
                <WalletPinInput
                  idPrefix="settings-init-pin-1"
                  label="Step 1: Enter New 6-Digit Wallet PIN"
                  value={initPin}
                  onChange={(val) => {
                    setInitPin(val);
                    if (pinError) setPinError('');
                  }}
                  helperText="Choose a secure 6-digit PIN for authorizing all transactions."
                />
              ) : (
                <WalletPinInput
                  idPrefix="settings-init-pin-2"
                  label="Step 2: Re-enter 6-Digit Wallet PIN to Confirm"
                  value={initConfirmPin}
                  onChange={(val) => {
                    setInitConfirmPin(val);
                    if (pinError) setPinError('');
                  }}
                  disabled={pinBusy}
                  helperText="Enter the exact same 6 digits once more."
                />
              )}

              <div className="flex items-center gap-3">
                {initPinStage === 'CONFIRM' && (
                  <button
                    type="button"
                    disabled={pinBusy}
                    onClick={() => {
                      setInitPinStage('ENTER');
                      setInitConfirmPin('');
                      setPinError('');
                    }}
                    className="px-4 h-11 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#475569] cursor-pointer"
                  >
                    Back
                  </button>
                )}
                <button
                  type="submit"
                  disabled={pinBusy || (initPinStage === 'ENTER' ? initPin.length !== 6 : initConfirmPin.length !== 6)}
                  className="px-6 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <i
                    className={`fa-solid ${pinBusy ? 'fa-spinner fa-spin' : initPinStage === 'ENTER' ? 'fa-arrow-right' : 'fa-shield-halved'}`}
                    aria-hidden="true"
                  />
                  <span>
                    {pinBusy
                      ? 'Saving PIN...'
                      : initPinStage === 'ENTER'
                        ? 'Continue to Confirm PIN'
                        : 'Save 6-Digit Wallet PIN'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Case B: Change Wallet PIN using Old PIN */}
          {user?.hasWalletPin && pinTab === 'CHANGE' && (
            <form onSubmit={handleChangeWalletPin} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <WalletPinInput
                  idPrefix="settings-old-pin"
                  label="Current (Old) 6-Digit PIN"
                  value={oldPin}
                  onChange={(val) => {
                    setOldPin(val);
                    if (pinError) setPinError('');
                  }}
                  disabled={pinBusy}
                />
                <WalletPinInput
                  idPrefix="settings-new-pin"
                  label="New 6-Digit Wallet PIN"
                  value={changeNewPin}
                  onChange={(val) => {
                    setChangeNewPin(val);
                    if (pinError) setPinError('');
                  }}
                  disabled={pinBusy}
                />
                <WalletPinInput
                  idPrefix="settings-confirm-new-pin"
                  label="Confirm New 6-Digit PIN"
                  value={changeConfirmPin}
                  onChange={(val) => {
                    setChangeConfirmPin(val);
                    if (pinError) setPinError('');
                  }}
                  disabled={pinBusy}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={
                    pinBusy ||
                    oldPin.length !== 6 ||
                    changeNewPin.length !== 6 ||
                    changeConfirmPin.length !== 6
                  }
                  className="w-full sm:w-auto px-6 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <i className={`fa-solid ${pinBusy ? 'fa-spinner fa-spin' : 'fa-key'}`} aria-hidden="true" />
                  <span>{pinBusy ? 'Updating Wallet PIN...' : 'Update Wallet PIN'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPinTab('FORGOT');
                    setPinError('');
                    setPinSuccess('');
                  }}
                  className="text-xs font-semibold text-[#5B35E5] hover:underline cursor-pointer"
                >
                  Forgot your old Wallet PIN? Reset via Email OTP
                </button>
              </div>
            </form>
          )}

          {/* Case C: Forgot Wallet PIN via Registered Email OTP */}
          {user?.hasWalletPin && pinTab === 'FORGOT' && (
            <div className="max-w-lg space-y-4">
              {!forgotPinOtpStep && (
                <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-4 sm:p-5 space-y-3.5">
                  <div className="flex items-start gap-3">
                    <span className="w-9 h-9 rounded-xl bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-envelope-circle-check text-sm" aria-hidden="true" />
                    </span>
                    <div className="text-xs text-[#475569] leading-relaxed">
                      <div className="font-bold text-[#0E163B] text-sm">Reset Wallet PIN via Email OTP</div>
                      <p className="mt-0.5">
                        We will send a 6-digit verification OTP to your registered email{' '}
                        <strong className="text-[#0E163B]">{user?.email}</strong> so you can set a fresh 6-digit Wallet PIN without your old PIN.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pinBusy}
                    onClick={handleForgotPinRequestOtp}
                    className="w-full sm:w-auto px-5 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <i className={`fa-solid ${pinBusy ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true" />
                    <span>{pinBusy ? 'Sending Email OTP...' : 'Send Email OTP'}</span>
                  </button>
                </div>
              )}

              {forgotPinOtpStep && !forgotPinResetToken && (
                <form onSubmit={handleForgotPinVerifyOtp} className="space-y-4">
                  {!forgotPinOtpStep.providerConfigured && forgotPinOtpStep.demoOtpCode && (
                    <div className="rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] p-3.5 text-xs text-[#3B2696] space-y-1">
                      <div className="font-semibold text-[#0E163B]">Email Verification OTP Code</div>
                      <div
                        data-testid="demo-forgot-pin-otp"
                        className="font-mono text-lg font-bold tracking-[0.25em] text-[#5B35E5]"
                      >
                        {forgotPinOtpStep.demoOtpCode}
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="forgot-pin-otp" className="block text-xs font-semibold text-[#334155] mb-1.5">
                      Enter 6-Digit Email OTP
                    </label>
                    <input
                      id="forgot-pin-otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={forgotPinOtpCode}
                      onChange={(e) => setForgotPinOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit OTP"
                      required
                      className="w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-base tracking-[0.25em] text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={pinBusy}
                      onClick={() => {
                        setForgotPinOtpStep(null);
                        setForgotPinOtpCode('');
                      }}
                      className="px-4 h-11 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#475569] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pinBusy || forgotPinOtpCode.length !== 6}
                      className="flex-1 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i className={`fa-solid ${pinBusy ? 'fa-spinner fa-spin' : 'fa-arrow-right'}`} aria-hidden="true" />
                      <span>{pinBusy ? 'Verifying OTP...' : 'Verify OTP & Set New PIN'}</span>
                    </button>
                  </div>
                </form>
              )}

              {forgotPinOtpStep && forgotPinResetToken && (
                <form onSubmit={handleForgotPinResetSubmit} className="space-y-4">
                  {forgotPinStage === 'ENTER' ? (
                    <WalletPinInput
                      idPrefix="forgot-reset-pin-1"
                      label="Step 1: Enter New 6-Digit Wallet PIN"
                      value={forgotNewPin}
                      onChange={(val) => {
                        setForgotNewPin(val);
                        if (pinError) setPinError('');
                      }}
                    />
                  ) : (
                    <WalletPinInput
                      idPrefix="forgot-reset-pin-2"
                      label="Step 2: Re-enter New 6-Digit Wallet PIN to Confirm"
                      value={forgotConfirmPin}
                      onChange={(val) => {
                        setForgotConfirmPin(val);
                        if (pinError) setPinError('');
                      }}
                      disabled={pinBusy}
                    />
                  )}

                  <div className="flex items-center gap-3">
                    {forgotPinStage === 'CONFIRM' && (
                      <button
                        type="button"
                        disabled={pinBusy}
                        onClick={() => {
                          setForgotPinStage('ENTER');
                          setForgotConfirmPin('');
                          setPinError('');
                        }}
                        className="px-4 h-11 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#475569] cursor-pointer"
                      >
                        Back
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={
                        pinBusy ||
                        (forgotPinStage === 'ENTER' ? forgotNewPin.length !== 6 : forgotConfirmPin.length !== 6)
                      }
                      className="flex-1 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i
                        className={`fa-solid ${pinBusy ? 'fa-spinner fa-spin' : forgotPinStage === 'ENTER' ? 'fa-arrow-right' : 'fa-check'}`}
                        aria-hidden="true"
                      />
                      <span>
                        {pinBusy
                          ? 'Resetting PIN...'
                          : forgotPinStage === 'ENTER'
                            ? 'Continue to Confirm PIN'
                            : 'Confirm & Reset Wallet PIN'}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </section>

        {/* Account Password & Security */}
        <form
          onSubmit={handleChangePassword}
          className="lg:col-span-12 bg-white rounded-3xl border border-[#EAE7F5] p-5 sm:p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between gap-3 pb-1 border-b border-[#F1EEF9]">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-[#0E163B] text-[#C4B5FD] flex items-center justify-center shrink-0">
                <i className="fa-solid fa-shield-halved text-sm" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-bold text-[#0E163B]">Password &amp; Account Security</h2>
                <p className="text-xs text-[#64748B]">Use a strong password of at least 8 characters to protect your wallet.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EAE7F5] text-[11px] font-semibold text-[#475569] hover:bg-[#FAF9FE] cursor-pointer shrink-0"
            >
              <i className={`fa-solid ${showPasswords ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
              <span>{showPasswords ? 'Hide' : 'Show'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cur-pass" className="block text-xs font-semibold text-[#334155] mb-1">
                Current Password
              </label>
              <input
                id="cur-pass"
                type={showPasswords ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm focus:bg-white focus:border-[#5B35E5]"
              />
            </div>
            <div>
              <label htmlFor="new-pass" className="block text-xs font-semibold text-[#334155] mb-1">
                New Password (min 8 chars)
              </label>
              <input
                id="new-pass"
                type={showPasswords ? 'text' : 'password'}
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm focus:bg-white focus:border-[#5B35E5]"
              />
            </div>
            <div>
              <label htmlFor="cnf-pass" className="block text-xs font-semibold text-[#334155] mb-1">
                Confirm New Password
              </label>
              <input
                id="cnf-pass"
                type={showPasswords ? 'text' : 'password'}
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm focus:bg-white focus:border-[#5B35E5]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingPass}
            className="w-full sm:w-auto px-6 h-11 rounded-xl bg-[#0E163B] hover:bg-[#19245A] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <i className={`fa-solid ${savingPass ? 'fa-spinner fa-spin' : 'fa-lock'}`} aria-hidden="true" />
            <span>{savingPass ? 'Updating Password...' : 'Update Password'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
