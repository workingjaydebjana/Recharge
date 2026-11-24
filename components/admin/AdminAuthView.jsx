'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api-client.js';
import { BrandLogo, InlineAlert } from '@/components/SharedUI.jsx';

export default function AdminAuthView({ onAdminAuthenticated }) {
  const [statusLoading, setStatusLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dbMode, setDbMode] = useState('LOCAL_MONGODB_FALLBACK');
  const [mode, setMode] = useState('LOGIN'); // 'LOGIN' | 'FORGOT'
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // First-Run Claim State
  const [setupForm, setSetupForm] = useState({
    fullName: 'Super Administrator',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
  });

  // Login State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Forgot Password State
  const [forgotId, setForgotId] = useState('');
  const [forgotOtp, setForgotOtp] = useState(null);
  const [forgotCode, setForgotCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    apiRequest('/api/admin/auth/status')
      .then((data) => {
        setNeedsSetup(Boolean(data.needsSetup));
        setDbMode(data.dbMode || 'LOCAL_MONGODB_FALLBACK');
      })
      .catch((err) => setError(err.message))
      .finally(() => setStatusLoading(false));
  }, []);

  async function handleSetupSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/auth/bootstrap', {
        method: 'POST',
        body: setupForm,
      });
      onAdminAuthenticated({ token: data.token, admin: data.admin });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/auth/login', {
        method: 'POST',
        body: { identifier: identifier.trim(), password },
      });
      onAdminAuthenticated({ token: data.token, admin: data.admin });
    } catch (err) {
      if (err.data?.needsSetup) setNeedsSetup(true);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotRequest(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/auth/forgot-password', {
        method: 'POST',
        body: { step: 'REQUEST_OTP', identifier: forgotId.trim() },
      });
      setForgotOtp(data);
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
      const data = await apiRequest('/api/admin/auth/forgot-password', {
        method: 'POST',
        body: {
          step: 'RESET_PASSWORD',
          otpId: forgotOtp.otpId,
          code: forgotCode.trim(),
          newPassword,
          confirmPassword,
        },
      });
      setMode('LOGIN');
      setForgotOtp(null);
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F7FC] flex flex-col">
      <header className="h-16 bg-white border-b border-[#EAE7F5] px-4 sm:px-6 flex items-center justify-between">
        <BrandLogo platformName="Quick Recharge Admin" />
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#334155] hover:bg-[#F5F3FF] whitespace-nowrap"
        >
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          <span>Back to User Portal</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#EAE7F5] shadow-sm p-6 sm:p-8 space-y-5">
          <div className="navy-surface rounded-2xl p-4 text-white flex items-center gap-3.5">
            <span className="w-10 h-10 rounded-xl bg-white/10 text-[#C4B5FD] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-shield-halved text-lg" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-base font-bold">Super Admin Console</h1>
              <p className="text-xs text-[#CBD5E1]">
                Single-owner administrative access · DB: {dbMode === 'MONGODB' ? 'MongoDB' : 'Local Persistent Store'}
              </p>
            </div>
          </div>

          {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
          {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

          {statusLoading ? (
            <div className="py-10 text-center text-xs text-[#64748B]">
              <i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true" />
              Checking Super Admin status...
            </div>
          ) : needsSetup ? (
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[#0E163B]">First-Run Super Admin Setup</h2>
                <p className="text-xs text-[#64748B] mt-1">
                  Initialize the sole Super Admin account. Once claimed, this setup route locks permanently.
                </p>
              </div>
              <div>
                <label htmlFor="adm-setup-name" className="block text-xs font-semibold text-[#334155] mb-1">
                  Full Name
                </label>
                <input
                  id="adm-setup-name"
                  type="text"
                  value={setupForm.fullName}
                  onChange={(e) => setSetupForm({ ...setupForm, fullName: e.target.value })}
                  required
                  className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
                />
              </div>
              <div>
                <label htmlFor="adm-setup-email" className="block text-xs font-semibold text-[#334155] mb-1">
                  Super Admin Email
                </label>
                <input
                  id="adm-setup-email"
                  type="email"
                  value={setupForm.email}
                  onChange={(e) => setSetupForm({ ...setupForm, email: e.target.value })}
                  placeholder="admin@quickrecharge.in"
                  required
                  className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
                />
              </div>
              <div>
                <label htmlFor="adm-setup-mobile" className="block text-xs font-semibold text-[#334155] mb-1">
                  10-Digit Mobile Number
                </label>
                <input
                  id="adm-setup-mobile"
                  type="tel"
                  maxLength={10}
                  value={setupForm.mobile}
                  onChange={(e) => setSetupForm({ ...setupForm, mobile: e.target.value.replace(/\D/g, '') })}
                  placeholder="9876543210"
                  required
                  className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adm-setup-pass" className="block text-xs font-semibold text-[#334155] mb-1">
                    Password (min 8)
                  </label>
                  <input
                    id="adm-setup-pass"
                    type="password"
                    minLength={8}
                    value={setupForm.password}
                    onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })}
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="adm-setup-cnf" className="block text-xs font-semibold text-[#334155] mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="adm-setup-cnf"
                    type="password"
                    minLength={8}
                    value={setupForm.confirmPassword}
                    onChange={(e) => setSetupForm({ ...setupForm, confirmPassword: e.target.value })}
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-sm font-semibold cursor-pointer"
              >
                {loading ? 'Creating Super Admin...' : 'Initialize Super Admin Account'}
              </button>
            </form>
          ) : mode === 'LOGIN' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label htmlFor="adm-id" className="block text-xs font-semibold text-[#334155] mb-1">
                  Super Admin Email or Mobile
                </label>
                <input
                  id="adm-id"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="adm-pass" className="block text-xs font-semibold text-[#334155]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('FORGOT');
                      setError('');
                      setSuccess('');
                    }}
                    className="text-xs font-semibold text-[#5B35E5] hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="adm-pass"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full h-11 pl-3.5 pr-10 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] cursor-pointer"
                  >
                    <i className={`fa-solid ${showPass ? 'fa-eye-slash' : 'fa-eye'} text-sm`} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-[#0E163B] hover:bg-[#19245A] text-white text-sm font-semibold cursor-pointer"
              >
                {loading ? 'Authenticating...' : 'Sign In to Super Admin Panel'}
              </button>
            </form>
          ) : !forgotOtp ? (
            <form onSubmit={handleForgotRequest} className="space-y-4">
              <h2 className="text-lg font-bold text-[#0E163B]">Super Admin Password Recovery</h2>
              <div>
                <label htmlFor="adm-forgot-id" className="block text-xs font-semibold text-[#334155] mb-1">
                  Registered Admin Email or Mobile
                </label>
                <input
                  id="adm-forgot-id"
                  type="text"
                  value={forgotId}
                  onChange={(e) => setForgotId(e.target.value)}
                  required
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('LOGIN')}
                  className="px-4 h-11 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#475569] cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-11 rounded-xl bg-[#5B35E5] text-white text-xs font-semibold cursor-pointer"
                >
                  {loading ? 'Sending...' : 'Request Admin OTP'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleForgotReset} className="space-y-3.5">
              {forgotOtp.demoOtpCode && (
                <div className="rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] p-3 text-xs">
                  Verification OTP: <strong className="font-mono text-[#5B35E5]">{forgotOtp.demoOtpCode}</strong>
                </div>
              )}
              <input
                type="text"
                maxLength={6}
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit OTP"
                aria-label="6-digit OTP"
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] font-mono text-sm"
              />
              <input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 8 chars)"
                aria-label="New password"
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] text-sm"
              />
              <input
                type="password"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                aria-label="Confirm new password"
                required
                className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] text-sm"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-[#5B35E5] text-white text-xs font-semibold cursor-pointer"
              >
                {loading ? 'Resetting...' : 'Reset Super Admin Password'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
