'use client';

import { useState } from 'react';
import Link from 'next/link';
import { INDIAN_STATES } from '@/lib/constants.js';
import { apiRequest } from '@/lib/api-client.js';
import { BrandLogo, InlineAlert } from '@/components/SharedUI.jsx';
import { WalletPinInput } from '@/components/user/WalletPinInput.jsx';

export default function AuthPortal({ onAuthenticated }) {
  const [mode, setMode] = useState('LOGIN'); // 'LOGIN' | 'REGISTER' | 'FORGOT'
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Login state
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register state
  const [regForm, setRegForm] = useState({
    fullName: '',
    mobile: '',
    email: '',
    state: 'West Bengal',
    city: '',
    password: '',
    confirmPassword: '',
  });
  const [showRegPass, setShowRegPass] = useState(false);
  const [regOtpStep, setRegOtpStep] = useState(null); // { otpId, email, notice, demoOtpCode }
  const [regOtpCode, setRegOtpCode] = useState('');
  // Step 3 after Email OTP verification: Set 6-digit Wallet PIN (Enter -> Confirm)
  const [regPinStep, setRegPinStep] = useState(null); // { otpId, pinSetupToken, email, mobile }
  const [regPinStage, setRegPinStage] = useState('ENTER'); // 'ENTER' | 'CONFIRM'
  const [regWalletPin, setRegWalletPin] = useState('');
  const [regConfirmWalletPin, setRegConfirmWalletPin] = useState('');

  // Forgot password state
  const [forgotId, setForgotId] = useState('');
  const [forgotOtpStep, setForgotOtpStep] = useState(null);
  const [forgotOtpCode, setForgotOtpCode] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotConfirmPass, setForgotConfirmPass] = useState('');
  const [showForgotPass, setShowForgotPass] = useState(false);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setSuccess('');
    setRegOtpStep(null);
    setRegPinStep(null);
    setRegPinStage('ENTER');
    setRegWalletPin('');
    setRegConfirmWalletPin('');
    setForgotOtpStep(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  };

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!loginId.trim() || !loginPassword) {
      setError('Enter your registered mobile number or email and password.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { identifier: loginId.trim(), password: loginPassword },
      });
      onAuthenticated({ token: data.token, user: data.user, wallet: data.wallet });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterRequestOtp(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const data = await apiRequest('/api/auth/register/request-otp', {
        method: 'POST',
        body: regForm,
      });
      setRegOtpStep(data);
      setRegOtpCode('');
      setSuccess(data.notice);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterVerifyOtp(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const data = await apiRequest('/api/auth/register/verify-otp', {
        method: 'POST',
        body: {
          otpId: regOtpStep.otpId,
          email: (regOtpStep.email || regForm.email).trim().toLowerCase(),
          code: regOtpCode.trim(),
        },
      });
      setRegPinStep(data);
      setRegPinStage('ENTER');
      setRegWalletPin('');
      setRegConfirmWalletPin('');
      setSuccess('Email OTP verified! Now set your 6-digit Wallet PIN.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleRegPinContinue(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(regWalletPin)) {
      setError('Please enter a 6-digit numeric Wallet PIN.');
      return;
    }
    setRegConfirmWalletPin('');
    setRegPinStage('CONFIRM');
  }

  async function handleRegCompleteWithPin(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(regConfirmWalletPin)) {
      setError('Please re-enter all 6 digits to confirm your Wallet PIN.');
      return;
    }
    if (regWalletPin !== regConfirmWalletPin) {
      setError('Both 6-digit Wallet PIN entries do not match. Please re-enter.');
      setRegConfirmWalletPin('');
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest('/api/auth/register/complete', {
        method: 'POST',
        body: {
          otpId: regPinStep.otpId,
          pinSetupToken: regPinStep.pinSetupToken,
          walletPin: regWalletPin,
          confirmWalletPin: regConfirmWalletPin,
        },
      });
      onAuthenticated({ token: data.token, user: data.user, wallet: data.wallet });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotRequestOtp(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!forgotId.trim()) {
      setError('Enter your registered mobile number or email.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest('/api/auth/forgot-password/request-otp', {
        method: 'POST',
        body: { identifier: forgotId.trim() },
      });
      setForgotOtpStep(data);
      setForgotOtpCode('');
      setSuccess(data.notice);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotReset(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest('/api/auth/forgot-password/reset', {
        method: 'POST',
        body: {
          otpId: forgotOtpStep.otpId,
          identifier: forgotId.trim(),
          code: forgotOtpCode.trim(),
          newPassword: forgotNewPass,
          confirmPassword: forgotConfirmPass,
        },
      });
      setMode('LOGIN');
      setForgotOtpStep(null);
      setLoginId(forgotId.trim());
      setLoginPassword('');
      setSuccess(data.message || 'Password updated. Please log in with your new password.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7FC]">
      {/* Clean 3-Zone Top Bar */}
      <header className="w-full bg-white/95 backdrop-blur border-b border-[#EAE7F5] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          <BrandLogo platformName="Quick Recharge" />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#475569]">
            <a href="#services" className="hover:text-[#0E163B] transition-colors whitespace-nowrap">
              Services
            </a>
            <a href="#wallet-system" className="hover:text-[#0E163B] transition-colors whitespace-nowrap">
              Three-Balance Wallet
            </a>
            <a href="#security" className="hover:text-[#0E163B] transition-colors whitespace-nowrap">
              Platform Security
            </a>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] text-[#4C28D4] hover:bg-[#EDE9FE] transition-colors whitespace-nowrap"
            >
              <i className="fa-solid fa-shield-halved" aria-hidden="true" />
              <span>Admin Panel</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Split Fintech Hero + Real Authentication Card (Auth card appears FIRST on mobile) */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3.5 sm:px-6 py-5 sm:py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
          {/* Feature Overview (Below auth card on mobile, Left column on desktop) */}
          <section className="order-2 lg:order-1 lg:col-span-6 space-y-4 sm:space-y-6">
            <div className="lavender-wash rounded-3xl border border-[#EAE7F5] p-5 sm:p-8 space-y-4">
              <div className="text-xs font-semibold text-[#5B35E5] flex items-center gap-2">
                <i className="fa-solid fa-indian-rupee-sign" aria-hidden="true" />
                <span>Indian Retailer &amp; Everyday Recharge Platform</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-[#0E163B] leading-tight">
                Fast, transparent Mobile, DTH, Electricity &amp; Redeem payments in ₹.
              </h1>
              <p className="text-xs sm:text-base text-[#475569] leading-relaxed">
                Built for Indian retailers and everyday users with a permanent three-balance wallet ledger, transparent commissions, and clear status tracking on every rupee.
              </p>

              {/* Four Services Grid (Symmetrical 2x2) */}
              <div id="services" className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-4">
                  <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center mb-2.5">
                    <i className="fa-solid fa-mobile-screen-button" aria-hidden="true" />
                  </div>
                  <div className="font-display font-semibold text-xs sm:text-sm text-[#0E163B]">Mobile Recharge</div>
                  <p className="text-[11px] sm:text-xs text-[#64748B] mt-1">Jio, Airtel, Vi &amp; BSNL across 23 circles.</p>
                </div>
                <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-4">
                  <div className="w-9 h-9 rounded-xl bg-[#F5F3FF] text-[#6D28D9] flex items-center justify-center mb-2.5">
                    <i className="fa-solid fa-satellite-dish" aria-hidden="true" />
                  </div>
                  <div className="font-display font-semibold text-xs sm:text-sm text-[#0E163B]">DTH Recharge</div>
                  <p className="text-[11px] sm:text-xs text-[#64748B] mt-1">Tata Play, Airtel DTH, Dish TV &amp; Sun.</p>
                </div>
                <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-4">
                  <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center mb-2.5">
                    <i className="fa-solid fa-bolt-lightning" aria-hidden="true" />
                  </div>
                  <div className="font-display font-semibold text-xs sm:text-sm text-[#0E163B]">Electricity Bill</div>
                  <p className="text-[11px] sm:text-xs text-[#64748B] mt-1">WBSEDCL &amp; CESC (West Bengal) electricity bills.</p>
                </div>
                <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-4">
                  <div className="w-9 h-9 rounded-xl bg-[#ECFDF5] text-[#047857] flex items-center justify-center mb-2.5">
                    <i className="fa-solid fa-gift" aria-hidden="true" />
                  </div>
                  <div className="font-display font-semibold text-xs sm:text-sm text-[#0E163B]">Redeem Code</div>
                  <p className="text-[11px] sm:text-xs text-[#64748B] mt-1">Google Play redeem codes directly from wallet.</p>
                </div>
              </div>
            </div>

            {/* Deep Navy Highlight Strip */}
            <div id="wallet-system" className="navy-surface rounded-2xl p-4 sm:p-6 text-white space-y-3.5">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#C4B5FD] shrink-0">
                  <i className="fa-solid fa-wallet" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white">Three-Balance Wallet Ledger</h2>
                  <p className="text-xs text-[#CBD5E1]">Every rupee movement is atomically recorded.</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-1 text-[11px] sm:text-xs">
                <div className="rounded-xl bg-white/8 p-2.5 sm:p-3">
                  <div className="text-[#C4B5FD] font-semibold">Current</div>
                  <div className="text-[#E2E8F0] mt-0.5">Ready for all recharges.</div>
                </div>
                <div className="rounded-xl bg-white/8 p-2.5 sm:p-3">
                  <div className="text-[#FDE68A] font-semibold">Pending</div>
                  <div className="text-[#E2E8F0] mt-0.5">Held safely while confirming.</div>
                </div>
                <div className="rounded-xl bg-white/8 p-2.5 sm:p-3">
                  <div className="text-[#86EFAC] font-semibold">Commission</div>
                  <div className="text-[#E2E8F0] mt-0.5">Transfer at min ₹50.</div>
                </div>
              </div>
            </div>

            <div id="security" className="rounded-2xl bg-white border border-[#EAE7F5] p-4 sm:p-5 text-xs text-[#475569] space-y-1.5">
              <div className="font-semibold text-[#0E163B] flex items-center gap-2 text-sm">
                <i className="fa-solid fa-shield-halved text-[#5B35E5]" aria-hidden="true" />
                <span>Verified Ledger &amp; Account Security</span>
              </div>
              <p className="leading-relaxed">
                Protected with salted password hashing, OTP-verified registration, duplicate transaction prevention, and an immutable MongoDB wallet ledger.
              </p>
            </div>
          </section>

          {/* Authentication Card (Appears FIRST on mobile, Right column on desktop) */}
          <section className="order-1 lg:order-2 lg:col-span-6">
            <div className="bg-white rounded-3xl border border-[#EAE7F5] shadow-sm p-4 sm:p-8">
              {/* Segmented Auth Mode Tabs */}
              <div className="flex items-center gap-1 p-1 bg-[#F5F3FF] rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN')}
                  className={`flex-none px-4 sm:flex-1 py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer text-center whitespace-nowrap ${
                    mode === 'LOGIN'
                      ? 'bg-white text-[#0E163B] shadow-sm'
                      : 'text-[#64748B] hover:text-[#0E163B]'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('REGISTER')}
                  className={`flex-1 px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer text-center whitespace-nowrap ${
                    mode === 'REGISTER'
                      ? 'bg-white text-[#0E163B] shadow-sm'
                      : 'text-[#64748B] hover:text-[#0E163B]'
                  }`}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('FORGOT')}
                  className={`flex-1 px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer text-center whitespace-nowrap ${
                    mode === 'FORGOT'
                      ? 'bg-white text-[#0E163B] shadow-sm'
                      : 'text-[#64748B] hover:text-[#0E163B]'
                  }`}
                >
                  Forgot Password
                </button>
              </div>

              {error && (
                <div className="mb-4">
                  <InlineAlert type="error" message={error} onClose={() => setError('')} />
                </div>
              )}
              {success && (
                <div className="mb-4">
                  <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />
                </div>
              )}

              {/* LOGIN FORM */}
              {mode === 'LOGIN' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#0E163B]">Sign in to your account</h2>
                    <p className="text-xs text-[#64748B] mt-1">
                      Use your registered 10-digit Indian mobile number or email address.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="login-identifier" className="block text-xs font-semibold text-[#334155] mb-1.5">
                      Mobile Number or Email
                    </label>
                    <div className="relative">
                      <i
                        className="fa-solid fa-user text-[#94A3B8] text-sm absolute left-3.5 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id="login-identifier"
                        type="text"
                        value={loginId}
                        onChange={(e) => setLoginId(e.target.value)}
                        placeholder="9876543210 or name@example.com"
                        autoComplete="username"
                        required
                        className="w-full h-11 pl-10 pr-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="login-password" className="block text-xs font-semibold text-[#334155]">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode('FORGOT')}
                        className="text-xs font-semibold text-[#5B35E5] hover:text-[#4324B8] cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <i
                        className="fa-solid fa-lock text-[#94A3B8] text-sm absolute left-3.5 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id="login-password"
                        type={showLoginPass ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        className="w-full h-11 pl-10 pr-11 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPass((v) => !v)}
                        aria-label={showLoginPass ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#0E163B] cursor-pointer"
                      >
                        <i className={`fa-solid ${showLoginPass ? 'fa-eye-slash' : 'fa-eye'} text-sm`} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-right-to-bracket'}`} aria-hidden="true" />
                    <span>{loading ? 'Signing in...' : 'Login to Dashboard'}</span>
                  </button>

                  <p className="text-center text-xs text-[#64748B] pt-2">
                    New to Quick Recharge?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('REGISTER')}
                      className="font-semibold text-[#5B35E5] hover:underline cursor-pointer"
                    >
                      Create New Account
                    </button>
                  </p>
                </form>
              )}

              {/* REGISTRATION STEP INDICATOR */}
              {mode === 'REGISTER' && (
                <div className="mb-5 grid grid-cols-3 gap-2 text-[11px] font-semibold">
                  {[
                    { num: 1, label: 'Details', active: !regOtpStep && !regPinStep, done: Boolean(regOtpStep || regPinStep) },
                    { num: 2, label: 'Email OTP', active: Boolean(regOtpStep && !regPinStep), done: Boolean(regPinStep) },
                    { num: 3, label: 'Wallet PIN', active: Boolean(regPinStep), done: false },
                  ].map((st) => (
                    <div
                      key={st.num}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border ${
                        st.active
                          ? 'bg-[#F5F3FF] border-[#5B35E5] text-[#5B35E5]'
                          : st.done
                            ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#15803D]'
                            : 'bg-[#FAF9FE] border-[#EAE7F5] text-[#94A3B8]'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-current/15 flex items-center justify-center text-[10px]">
                        {st.done ? <i className="fa-solid fa-check text-[9px]" aria-hidden="true" /> : st.num}
                      </span>
                      <span className="truncate">{st.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* REGISTRATION STEP 1: DETAILS */}
              {mode === 'REGISTER' && !regOtpStep && !regPinStep && (
                <form onSubmit={handleRegisterRequestOtp} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#0E163B]">Create your retailer account</h2>
                    <p className="text-xs text-[#64748B] mt-1">
                      Verify your email OTP and set your 6-digit Wallet PIN to activate your account.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="sm:col-span-2">
                      <label htmlFor="reg-name" className="block text-xs font-semibold text-[#334155] mb-1">
                        Full Name
                      </label>
                      <input
                        id="reg-name"
                        type="text"
                        value={regForm.fullName}
                        onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                        placeholder="e.g., Rahul Sharma"
                        required
                        className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-mobile" className="block text-xs font-semibold text-[#334155] mb-1">
                        Mobile Number (+91)
                      </label>
                      <input
                        id="reg-mobile"
                        type="tel"
                        maxLength={10}
                        value={regForm.mobile}
                        onChange={(e) => setRegForm({ ...regForm, mobile: e.target.value.replace(/\D/g, '') })}
                        placeholder="10-digit mobile"
                        required
                        className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-email" className="block text-xs font-semibold text-[#334155] mb-1">
                        Email Address
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        value={regForm.email}
                        onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                        placeholder="you@example.com"
                        required
                        className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-state" className="block text-xs font-semibold text-[#334155] mb-1">
                        State
                      </label>
                      <select
                        id="reg-state"
                        value={regForm.state}
                        onChange={(e) => setRegForm({ ...regForm, state: e.target.value })}
                        required
                        className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                      >
                        {INDIAN_STATES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="reg-city" className="block text-xs font-semibold text-[#334155] mb-1">
                        City
                      </label>
                      <input
                        id="reg-city"
                        type="text"
                        value={regForm.city}
                        onChange={(e) => setRegForm({ ...regForm, city: e.target.value })}
                        placeholder="e.g., Kolkata"
                        required
                        className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-pass" className="block text-xs font-semibold text-[#334155] mb-1">
                        Password (min 8 chars)
                      </label>
                      <div className="relative">
                        <input
                          id="reg-pass"
                          type={showRegPass ? 'text' : 'password'}
                          value={regForm.password}
                          onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                          placeholder="Create password"
                          minLength={8}
                          required
                          className="w-full h-10 pl-3.5 pr-10 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPass((v) => !v)}
                          aria-label={showRegPass ? 'Hide password' : 'Show password'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[#64748B] cursor-pointer"
                        >
                          <i className={`fa-solid ${showRegPass ? 'fa-eye-slash' : 'fa-eye'} text-xs`} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reg-confirm" className="block text-xs font-semibold text-[#334155] mb-1">
                        Confirm Password
                      </label>
                      <input
                        id="reg-confirm"
                        type={showRegPass ? 'text' : 'password'}
                        value={regForm.confirmPassword}
                        onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                        placeholder="Re-enter password"
                        minLength={8}
                        required
                        className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true" />
                    <span>{loading ? 'Sending Email OTP...' : 'Continue to Email OTP Verification'}</span>
                  </button>
                </form>
              )}

              {/* REGISTRATION STEP 2: EMAIL OTP VERIFICATION */}
              {mode === 'REGISTER' && regOtpStep && !regPinStep && (
                <form onSubmit={handleRegisterVerifyOtp} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#0E163B]">Verify Email OTP</h2>
                    <p className="text-xs text-[#64748B] mt-1">
                      Verifying email address{' '}
                      <span className="font-semibold text-[#0E163B]">{regOtpStep.email || regForm.email}</span>.
                    </p>
                  </div>

                  {!regOtpStep.providerConfigured && regOtpStep.demoOtpCode && (
                    <div className="rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] p-4 text-xs text-[#3B2696] space-y-1.5">
                      <div className="font-semibold flex items-center gap-2 text-[#0E163B]">
                        <i className="fa-solid fa-envelope-open-text text-[#5B35E5]" aria-hidden="true" />
                        <span>Instant Email Verification OTP</span>
                      </div>
                      <p>Enter this expiring 6-digit code below to proceed to Wallet PIN setup:</p>
                      <div
                        data-testid="demo-register-otp"
                        className="font-mono text-lg font-bold tracking-[0.25em] text-[#5B35E5] bg-white rounded-lg border border-[#DDD6FE] px-3 py-2 inline-block"
                      >
                        {regOtpStep.demoOtpCode}
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="reg-otp-input" className="block text-xs font-semibold text-[#334155] mb-1.5">
                      Enter 6-Digit Email OTP
                    </label>
                    <input
                      id="reg-otp-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={regOtpCode}
                      onChange={(e) => setRegOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit Email OTP"
                      required
                      className="w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-base tracking-[0.25em] text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setRegOtpStep(null)}
                      className="px-4 h-11 rounded-xl border border-[#E2E8F0] text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading || regOtpCode.length !== 6}
                      className="flex-1 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-arrow-right'}`} aria-hidden="true" />
                      <span>{loading ? 'Verifying OTP...' : 'Verify OTP & Set Wallet PIN'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* REGISTRATION STEP 3: DEDICATED 6-DIGIT WALLET PIN SETUP (ENTER -> RE-ENTER CONFIRM) */}
              {mode === 'REGISTER' && regPinStep && (
                <form
                  onSubmit={regPinStage === 'ENTER' ? handleRegPinContinue : handleRegCompleteWithPin}
                  className="space-y-5"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-11 h-11 rounded-2xl navy-surface text-[#C4B5FD] flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-shield-halved text-base" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="text-xl font-bold text-[#0E163B]">
                        {regPinStage === 'ENTER' ? 'Set 6-Digit Wallet PIN' : 'Confirm 6-Digit Wallet PIN'}
                      </h2>
                      <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                        {regPinStage === 'ENTER'
                          ? 'Create a 6-digit security PIN. You will need this PIN for every recharge, bill payment, and redeem code.'
                          : 'Re-enter the same 6-digit Wallet PIN once more to confirm and activate your account.'}
                      </p>
                    </div>
                  </div>

                  {regPinStage === 'ENTER' ? (
                    <WalletPinInput
                      idPrefix="reg-wallet-pin-1"
                      label="Enter New 6-Digit Wallet PIN"
                      value={regWalletPin}
                      onChange={(val) => {
                        setRegWalletPin(val);
                        if (error) setError('');
                      }}
                      helperText="Use 6 numeric digits (0–9). You can change or reset it anytime from Profile Settings."
                    />
                  ) : (
                    <WalletPinInput
                      idPrefix="reg-wallet-pin-2"
                      label="Re-enter 6-Digit Wallet PIN to Confirm"
                      value={regConfirmWalletPin}
                      onChange={(val) => {
                        setRegConfirmWalletPin(val);
                        if (error) setError('');
                      }}
                      disabled={loading}
                      helperText="Must match the 6-digit Wallet PIN you just entered."
                    />
                  )}

                  <div className="flex items-center gap-3">
                    {regPinStage === 'CONFIRM' && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setRegPinStage('ENTER');
                          setRegConfirmWalletPin('');
                          setError('');
                        }}
                        className="px-4 h-11 rounded-xl border border-[#E2E8F0] text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] cursor-pointer"
                      >
                        Back
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={
                        loading ||
                        (regPinStage === 'ENTER' ? regWalletPin.length !== 6 : regConfirmWalletPin.length !== 6)
                      }
                      className="flex-1 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i
                        className={`fa-solid ${
                          loading
                            ? 'fa-spinner fa-spin'
                            : regPinStage === 'ENTER'
                              ? 'fa-arrow-right'
                              : 'fa-user-check'
                        }`}
                        aria-hidden="true"
                      />
                      <span>
                        {loading
                          ? 'Creating Account...'
                          : regPinStage === 'ENTER'
                            ? 'Continue & Confirm PIN'
                            : 'Confirm Wallet PIN & Create Account'}
                      </span>
                    </button>
                  </div>
                </form>
              )}

              {/* FORGOT PASSWORD FLOW */}
              {mode === 'FORGOT' && !forgotOtpStep && (
                <form onSubmit={handleForgotRequestOtp} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#0E163B]">Recover your password</h2>
                    <p className="text-xs text-[#64748B] mt-1">
                      Enter your registered mobile number or email to receive a password reset OTP.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="forgot-id" className="block text-xs font-semibold text-[#334155] mb-1.5">
                      Registered Mobile Number or Email
                    </label>
                    <input
                      id="forgot-id"
                      type="text"
                      value={forgotId}
                      onChange={(e) => setForgotId(e.target.value)}
                      placeholder="9876543210 or name@example.com"
                      required
                      className="w-full h-11 px-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm text-[#0E163B] focus:bg-white focus:border-[#5B35E5]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-key'}`} aria-hidden="true" />
                    <span>{loading ? 'Sending OTP...' : 'Send Recovery OTP'}</span>
                  </button>
                </form>
              )}

              {mode === 'FORGOT' && forgotOtpStep && (
                <form onSubmit={handleForgotReset} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#0E163B]">Verify OTP &amp; Set New Password</h2>
                    <p className="text-xs text-[#64748B] mt-1">
                      Account: <span className="font-mono font-semibold text-[#0E163B]">{forgotId}</span>
                    </p>
                  </div>

                  {!forgotOtpStep.providerConfigured && forgotOtpStep.demoOtpCode && (
                    <div className="rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] p-3.5 text-xs text-[#3B2696] space-y-1">
                      <div className="font-semibold text-[#0E163B]">Verification OTP Code</div>
                      <div className="font-mono text-base font-bold tracking-[0.2em] text-[#5B35E5]">
                        {forgotOtpStep.demoOtpCode}
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="forgot-otp" className="block text-xs font-semibold text-[#334155] mb-1">
                      6-Digit OTP
                    </label>
                    <input
                      id="forgot-otp"
                      type="text"
                      maxLength={6}
                      value={forgotOtpCode}
                      onChange={(e) => setForgotOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter OTP"
                      required
                      className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-sm tracking-[0.2em]"
                    />
                  </div>

                  <div>
                    <label htmlFor="forgot-new-pass" className="block text-xs font-semibold text-[#334155] mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        id="forgot-new-pass"
                        type={showForgotPass ? 'text' : 'password'}
                        value={forgotNewPass}
                        onChange={(e) => setForgotNewPass(e.target.value)}
                        placeholder="Minimum 8 characters"
                        minLength={8}
                        required
                        className="w-full h-10 pl-3.5 pr-10 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowForgotPass((v) => !v)}
                        aria-label={showForgotPass ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[#64748B] cursor-pointer"
                      >
                        <i className={`fa-solid ${showForgotPass ? 'fa-eye-slash' : 'fa-eye'} text-xs`} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="forgot-confirm-pass" className="block text-xs font-semibold text-[#334155] mb-1">
                      Confirm New Password
                    </label>
                    <input
                      id="forgot-confirm-pass"
                      type={showForgotPass ? 'text' : 'password'}
                      value={forgotConfirmPass}
                      onChange={(e) => setForgotConfirmPass(e.target.value)}
                      placeholder="Re-enter new password"
                      minLength={8}
                      required
                      className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
                  >
                    {loading ? 'Updating Password...' : 'Verify OTP & Reset Password'}
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
