'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/finance.js';
import { apiRequest, saveUserToken } from '@/lib/api-client.js';
import { InlineAlert, ModalDialog, StatusText, formatDateTime } from '@/components/SharedUI.jsx';

export default function AdminUsersAndWallets({ token, mode = 'USERS', onDataMutated }) {
  const router = useRouter();

  const [users, setUsers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [impersonatingId, setImpersonatingId] = useState('');

  // Wallet Adjustment Modal
  const [adjustUser, setAdjustUser] = useState(null);
  const [adjBalanceType, setAdjBalanceType] = useState('CURRENT');
  const [adjDirection, setAdjDirection] = useState('CREDIT');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);

  // User Details & Security Modal
  const [detailUser, setDetailUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [lastSetPassword, setLastSetPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [lastSetPin, setLastSetPin] = useState('');
  const [modalNotice, setModalNotice] = useState({ type: '', text: '' });
  const [copiedField, setCopiedField] = useState('');

  // Permanent Delete Account Modal
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      const data = await apiRequest(`/api/admin/users?${params.toString()}`, { token });
      const fetchedUsers = data.users || [];
      setUsers(fetchedUsers);
      setLedger(data.recentLedger || []);
      setDetailUser((prev) =>
        prev ? fetchedUsers.find((u) => u._id === prev._id) || prev : null
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, search, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    apiRequest(`/api/admin/users?${params.toString()}`, { token })
      .then((data) => {
        if (cancelled) return;
        setUsers(data.users || []);
        setLedger(data.recentLedger || []);
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
  }, [token, search, statusFilter]);

  function openDetailsModal(user) {
    setDetailUser(user);
    setNewPassword('');
    setShowNewPassword(false);
    setLastSetPassword('');
    setNewPin('');
    setLastSetPin('');
    setModalNotice({ type: '', text: '' });
    setCopiedField('');
  }

  function openDeleteModal(user) {
    setDeleteUser(user);
    setDeleteConfirmText('');
    setDeleteError('');
  }

  async function handlePermanentDeleteSubmit(e) {
    e.preventDefault();
    if (!deleteUser) return;
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE in the box below to confirm permanent deletion.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    setError('');
    setSuccess('');
    try {
      const data = await apiRequest('/api/admin/users', {
        method: 'DELETE',
        token,
        body: {
          userId: deleteUser._id,
          confirmation: 'DELETE',
        },
      });
      setSuccess(
        `Account ${data.deletedFullName} (${data.deletedMobile}) has been permanently deleted.`
      );
      if (detailUser?._id === deleteUser._id) {
        setDetailUser(null);
      }
      setDeleteUser(null);
      setDeleteConfirmText('');
      await fetchUsers();
      await onDataMutated();
    } catch (err) {
      setDeleteError(err.message || 'Unable to delete account.');
    } finally {
      setDeleting(false);
    }
  }

  function handleCopyText(key, value) {
    if (!value) return;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(String(value)).catch(() => {});
    }
    setCopiedField(key);
    setTimeout(() => setCopiedField(''), 1800);
  }

  async function handleLoginAsUser(user) {
    if (!user?._id) return;
    setImpersonatingId(user._id);
    setError('');
    setSuccess('');
    try {
      const data = await apiRequest('/api/admin/users/impersonate', {
        method: 'POST',
        token,
        body: { userId: user._id },
      });
      if (data?.token) {
        saveUserToken(data.token);
      }
      router.push('/');
    } catch (err) {
      setError(err.message || 'Unable to log in as user.');
      setImpersonatingId('');
    }
  }

  async function handleToggleUserStatus(user) {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setError('');
    setSuccess('');
    try {
      await apiRequest('/api/admin/users', {
        method: 'PATCH',
        token,
        body: { action: 'SET_STATUS', userId: user._id, status: nextStatus },
      });
      setSuccess(`User ${user.fullName} is now ${nextStatus}.`);
      await fetchUsers();
      await onDataMutated();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAdjustSubmit(e) {
    e.preventDefault();
    if (!adjustUser) return;
    setAdjSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiRequest('/api/admin/users', {
        method: 'PATCH',
        token,
        body: {
          action: 'ADJUST_WALLET',
          userId: adjustUser._id,
          balanceType: adjBalanceType,
          direction: adjDirection,
          amount: Number(adjAmount),
          reason: adjReason.trim(),
        },
      });
      setSuccess(`Audited wallet adjustment ${data.adjustmentId} recorded in permanent ledger.`);
      setAdjustUser(null);
      setAdjAmount('');
      setAdjReason('');
      await fetchUsers();
      await onDataMutated();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdjSaving(false);
    }
  }

  async function handleResetPasswordSubmit(e) {
    e.preventDefault();
    if (!detailUser) return;
    if (newPassword.length < 6) {
      setModalNotice({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    setPwdSaving(true);
    setModalNotice({ type: '', text: '' });
    try {
      await apiRequest('/api/admin/users', {
        method: 'PATCH',
        token,
        body: {
          action: 'RESET_PASSWORD',
          userId: detailUser._id,
          newPassword,
        },
      });
      setLastSetPassword(newPassword);
      setNewPassword('');
      setModalNotice({
        type: 'success',
        text: `Login password updated for ${detailUser.fullName}. Copy the new password below if you want to share it.`,
      });
      await fetchUsers();
      await onDataMutated();
    } catch (err) {
      setModalNotice({ type: 'error', text: err.message });
    } finally {
      setPwdSaving(false);
    }
  }

  async function handleResetPinSubmit(e) {
    e.preventDefault();
    if (!detailUser) return;
    const cleanPin = newPin.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanPin)) {
      setModalNotice({ type: 'error', text: 'Wallet PIN must be exactly 6 numeric digits.' });
      return;
    }
    setPinSaving(true);
    setModalNotice({ type: '', text: '' });
    try {
      await apiRequest('/api/admin/users', {
        method: 'PATCH',
        token,
        body: {
          action: 'RESET_WALLET_PIN',
          userId: detailUser._id,
          newPin: cleanPin,
        },
      });
      setLastSetPin(cleanPin);
      setNewPin('');
      setModalNotice({
        type: 'success',
        text: `6-digit Wallet PIN updated for ${detailUser.fullName} and any PIN lockout cleared.`,
      });
      await fetchUsers();
      await onDataMutated();
    } catch (err) {
      setModalNotice({ type: 'error', text: err.message });
    } finally {
      setPinSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0E163B]">
          {mode === 'WALLETS' ? 'Wallet Management & Ledger' : 'User Management'}
        </h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          {mode === 'WALLETS'
            ? 'Inspect all three user wallet balances, perform audited wallet adjustments, and review the immutable ledger.'
            : 'Search retailers, view full details, log in as any user, reset credentials, or activate/suspend accounts.'}
        </p>
      </div>

      {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
      {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

      <div className="bg-white rounded-2xl border border-[#EAE7F5] p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <i className="fa-solid fa-magnifying-glass text-[#94A3B8] text-xs absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Name, Mobile, Email, or User ID..."
            aria-label="Search users"
            className="w-full h-10 pl-9 pr-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter users by status"
          className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs font-semibold"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active Users</option>
          <option value="SUSPENDED">Suspended Users</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#64748B]">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">No registered users found yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9FE] text-[#64748B] border-b border-[#EAE7F5]">
                <tr>
                  <th className="py-3 px-4 font-semibold">User Details</th>
                  <th className="py-3 px-4 font-semibold text-right">Current</th>
                  <th className="py-3 px-4 font-semibold text-right">Pending</th>
                  <th className="py-3 px-4 font-semibold text-right">Commission</th>
                  <th className="py-3 px-4 font-semibold">Activity</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE7F5]">
                {users.map((u) => {
                  const isLoggingIn = impersonatingId === u._id;
                  return (
                    <tr key={u._id} className="hover:bg-[#FAF9FE]">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0E163B]">{u.fullName}</div>
                        <div className="font-mono text-[11px] text-[#64748B]">
                          ID: {u.accountId || u.mobile} · {u.email}
                        </div>
                        <div className="text-[11px] text-[#94A3B8]">
                          {[u.city, u.state].filter(Boolean).join(', ') || 'India'} · Joined {formatDateTime(u.createdAt)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#0E163B] tabular-nums">
                        {formatINR(u.wallet?.currentBalance || 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#B45309] tabular-nums">
                        {formatINR(u.wallet?.pendingBalance || 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#15803D] tabular-nums">
                        {formatINR(u.wallet?.commissionBalance || 0)}
                      </td>
                      <td className="py-3 px-4 text-[#475569] whitespace-nowrap">
                        {u.stats?.transactionsCount || 0} tx · {u.stats?.depositsCount || 0} dep ·{' '}
                        {u.stats?.complaintsCount || 0} cmp
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={u.status} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDetailsModal(u)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-white text-[#0E163B] font-semibold hover:bg-[#F8FAFC] cursor-pointer inline-flex items-center gap-1"
                          >
                            <i className="fa-solid fa-eye text-[11px] text-[#5B35E5]" aria-hidden="true" />
                            <span>Details</span>
                          </button>
                          {mode === 'USERS' && (
                            <button
                              type="button"
                              onClick={() => handleLoginAsUser(u)}
                              disabled={Boolean(impersonatingId)}
                              className="px-2.5 py-1.5 rounded-lg border border-[#0E163B] bg-[#0E163B] text-white font-semibold hover:bg-[#1E293B] disabled:opacity-60 cursor-pointer inline-flex items-center gap-1"
                            >
                              <i
                                className={`fa-solid ${isLoggingIn ? 'fa-spinner fa-spin' : 'fa-right-to-bracket'} text-[11px] text-[#C4B5FD]`}
                                aria-hidden="true"
                              />
                              <span>{isLoggingIn ? 'Opening...' : 'Login'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setAdjustUser(u)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#DDD6FE] bg-[#F5F3FF] text-[#4C28D4] font-semibold hover:bg-[#EDE9FE] cursor-pointer"
                          >
                            Adjust Wallet
                          </button>
                          {mode === 'USERS' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(u)}
                                className={`px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                  u.status === 'ACTIVE'
                                    ? 'border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2]'
                                    : 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7]'
                                }`}
                              >
                                {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteModal(u)}
                                className="px-2.5 py-1.5 rounded-lg border border-[#DC2626] bg-[#DC2626] text-white font-semibold hover:bg-[#B91C1C] cursor-pointer inline-flex items-center gap-1"
                              >
                                <i className="fa-solid fa-trash-can text-[11px]" aria-hidden="true" />
                                <span>Delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Global Permanent Wallet Ledger when in WALLETS mode */}
      {mode === 'WALLETS' && (
        <section className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EAE7F5]">
            <h2 className="text-base font-bold text-[#0E163B]">Global Permanent Wallet Ledger</h2>
          </div>
          {ledger.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">No wallet ledger records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF9FE] text-[#64748B] border-b border-[#EAE7F5]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">User</th>
                    <th className="py-3 px-4 font-semibold">Balance</th>
                    <th className="py-3 px-4 font-semibold">Description</th>
                    <th className="py-3 px-4 font-semibold text-right">Amount</th>
                    <th className="py-3 px-4 font-semibold text-right">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE7F5]">
                  {ledger.map((row) => (
                    <tr key={row._id} className="hover:bg-[#FAF9FE]">
                      <td className="py-3 px-4 text-[#64748B] whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0E163B]">{row.userName || 'Unknown User'}</div>
                        <div className="font-mono text-[11px] text-[#5B35E5]">
                          {row.userMobile || row.userId}
                        </div>
                        {row.userMobile && row.userId && (
                          <div className="font-mono text-[10px] text-[#94A3B8]">{row.userId}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#0E163B]">{row.balanceType}</td>
                      <td className="py-3 px-4 text-[#334155]">{row.description}</td>
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
      )}

      {/* User Full Details & Credentials Management Modal */}
      <ModalDialog
        open={Boolean(detailUser)}
        title={`User Profile & Credentials · ${detailUser?.fullName || ''}`}
        onClose={() => !pwdSaving && !pinSaving && setDetailUser(null)}
        maxWidth="max-w-xl"
      >
        {detailUser && (
          <div className="space-y-4 text-xs">
            {modalNotice.text && (
              <InlineAlert
                type={modalNotice.type === 'error' ? 'error' : 'success'}
                message={modalNotice.text}
                onClose={() => setModalNotice({ type: '', text: '' })}
              />
            )}

            {/* Complete Account Details Grid */}
            <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#EAE7F5]">
                <div>
                  <div className="font-display font-bold text-sm text-[#0E163B]">{detailUser.fullName}</div>
                  <div className="font-mono text-[11px] text-[#64748B]">{detailUser._id}</div>
                </div>
                <StatusText status={detailUser.status} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B]">Account ID / Mobile</div>
                  <div className="font-mono font-semibold text-[#0E163B] mt-0.5 flex items-center gap-1.5">
                    <span>{detailUser.mobile || detailUser.accountId || '—'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyText('mobile', detailUser.mobile)}
                      className="text-[10px] text-[#5B35E5] hover:underline cursor-pointer"
                    >
                      {copiedField === 'mobile' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B]">Email Address</div>
                  <div className="font-mono text-[#0E163B] mt-0.5 break-all">{detailUser.email || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B]">City &amp; State</div>
                  <div className="font-medium text-[#334155] mt-0.5">
                    {[detailUser.city, detailUser.state].filter(Boolean).join(', ') || 'Not provided'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B]">Shop / Business Name</div>
                  <div className="font-medium text-[#334155] mt-0.5">
                    {detailUser.businessName || detailUser.shopName || 'Not provided'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B]">Registered On</div>
                  <div className="text-[#334155] mt-0.5">{formatDateTime(detailUser.createdAt)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B]">Last Updated</div>
                  <div className="text-[#334155] mt-0.5">{formatDateTime(detailUser.updatedAt)}</div>
                </div>
              </div>
            </div>

            {/* Three-Balance Wallet & Activity Summary */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#5B35E5] font-semibold">Current</div>
                <div className="font-mono font-bold text-sm text-[#0E163B] tabular-nums mt-0.5">
                  {formatINR(detailUser.wallet?.currentBalance || 0)}
                </div>
              </div>
              <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#B45309] font-semibold">Pending</div>
                <div className="font-mono font-bold text-sm text-[#B45309] tabular-nums mt-0.5">
                  {formatINR(detailUser.wallet?.pendingBalance || 0)}
                </div>
              </div>
              <div className="rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] p-3">
                <div className="text-[10px] uppercase tracking-wider text-[#15803D] font-semibold">Commission</div>
                <div className="font-mono font-bold text-sm text-[#15803D] tabular-nums mt-0.5">
                  {formatINR(detailUser.wallet?.commissionBalance || 0)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-white border border-[#EAE7F5] py-2 px-1">
                <div className="font-mono font-bold text-sm text-[#0E163B]">{detailUser.stats?.transactionsCount || 0}</div>
                <div className="text-[10px] text-[#64748B]">Transactions</div>
              </div>
              <div className="rounded-xl bg-white border border-[#EAE7F5] py-2 px-1">
                <div className="font-mono font-bold text-sm text-[#0E163B]">{detailUser.stats?.depositsCount || 0}</div>
                <div className="text-[10px] text-[#64748B]">Deposits</div>
              </div>
              <div className="rounded-xl bg-white border border-[#EAE7F5] py-2 px-1">
                <div className="font-mono font-bold text-sm text-[#0E163B]">{detailUser.stats?.complaintsCount || 0}</div>
                <div className="text-[10px] text-[#64748B]">Complaints</div>
              </div>
              <div className="rounded-xl bg-white border border-[#EAE7F5] py-2 px-1">
                <div className="font-mono font-bold text-sm text-[#15803D]">
                  {formatINR(detailUser.stats?.totalCommissionEarned || 0)}
                </div>
                <div className="text-[10px] text-[#64748B]">Total Comm.</div>
              </div>
            </div>

            {/* Password & Wallet PIN Security Section */}
            <div className="rounded-2xl border border-[#EAE7F5] bg-white p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display font-bold text-[#0E163B] flex items-center gap-2">
                  <i className="fa-solid fa-key text-[#5B35E5]" aria-hidden="true" />
                  <span>Login Password &amp; Wallet PIN</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#5B35E5] border border-[#DDD6FE]">
                  Encrypted (scrypt)
                </span>
              </div>

              <div className="rounded-xl bg-[#FAF9FE] border border-[#EAE7F5] p-3 text-[11px] text-[#475569] leading-relaxed">
                <i className="fa-solid fa-shield-halved text-[#5B35E5] mr-1.5" aria-hidden="true" />
                User passwords and Wallet PINs are protected with one-way cryptographic encryption and cannot be read in plaintext. You can set a new Login Password or 6-digit Wallet PIN below, or click <strong>Login as User</strong> to open their account directly.
              </div>

              {/* Reset Login Password Form */}
              <form onSubmit={handleResetPasswordSubmit} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="admin-new-pwd" className="font-semibold text-[#334155]">
                    Set New Login Password
                  </label>
                  <span className="text-[10px] text-[#64748B]">
                    {detailUser.passwordUpdatedAt
                      ? `Updated ${formatDateTime(detailUser.passwordUpdatedAt)}`
                      : 'Protected (One-Way Hash)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      id="admin-new-pwd"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 chars)"
                      minLength={6}
                      maxLength={72}
                      required
                      className="w-full h-10 pl-3 pr-9 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0E163B] cursor-pointer"
                    >
                      <i className={`fa-solid ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={pwdSaving}
                    className="h-10 px-3.5 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white font-semibold cursor-pointer shrink-0"
                  >
                    {pwdSaving ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
                {lastSetPassword && (
                  <div className="rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-[#15803D]">
                      New Password: <code className="font-mono font-bold">{lastSetPassword}</code>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText('pwd', lastSetPassword)}
                      className="px-2 py-1 rounded-lg bg-white border border-[#BBF7D0] text-[#15803D] font-semibold cursor-pointer"
                    >
                      {copiedField === 'pwd' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </form>

              {/* Reset 6-Digit Wallet PIN Form */}
              <form onSubmit={handleResetPinSubmit} className="space-y-2 pt-3 border-t border-[#F1EEF9]">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="admin-new-pin" className="font-semibold text-[#334155]">
                    Set / Reset 6-Digit Wallet PIN
                  </label>
                  <span
                    className={`text-[10px] font-semibold ${
                      detailUser.hasWalletPin ? 'text-[#15803D]' : 'text-[#B45309]'
                    }`}
                  >
                    {detailUser.hasWalletPin ? 'PIN Active (Encrypted)' : 'PIN Not Set'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="admin-new-pin"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit PIN"
                    required
                    className="flex-1 h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs font-mono tracking-widest"
                  />
                  <button
                    type="submit"
                    disabled={pinSaving || newPin.length !== 6}
                    className="h-10 px-3.5 rounded-xl bg-[#0E163B] hover:bg-[#1E293B] disabled:opacity-60 text-white font-semibold cursor-pointer shrink-0"
                  >
                    {pinSaving ? 'Saving...' : 'Update PIN'}
                  </button>
                </div>
                {lastSetPin && (
                  <div className="rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-[#15803D]">
                      New Wallet PIN: <code className="font-mono font-bold tracking-widest">{lastSetPin}</code>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText('pin', lastSetPin)}
                      className="px-2 py-1 rounded-lg bg-white border border-[#BBF7D0] text-[#15803D] font-semibold cursor-pointer"
                    >
                      {copiedField === 'pin' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* Quick Action Footer */}
            <div className={`grid grid-cols-1 ${mode === 'USERS' ? 'sm:grid-cols-3' : ''} gap-2.5 pt-1`}>
              {mode === 'USERS' && (
                <button
                  type="button"
                  onClick={() => handleLoginAsUser(detailUser)}
                  disabled={Boolean(impersonatingId)}
                  className="h-11 rounded-xl bg-[#0E163B] hover:bg-[#1E293B] disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <i
                    className={`fa-solid ${impersonatingId === detailUser._id ? 'fa-spinner fa-spin' : 'fa-right-to-bracket'} text-[#C4B5FD]`}
                    aria-hidden="true"
                  />
                  <span>{impersonatingId === detailUser._id ? 'Opening...' : 'Login as User'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const target = detailUser;
                  setDetailUser(null);
                  setAdjustUser(target);
                }}
                className="h-11 rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] hover:bg-[#EDE9FE] text-[#4C28D4] font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <i className="fa-solid fa-wallet" aria-hidden="true" />
                <span>Adjust Wallet</span>
              </button>
              {mode === 'USERS' && (
                <button
                  type="button"
                  onClick={() => {
                    const target = detailUser;
                    setDetailUser(null);
                    openDeleteModal(target);
                  }}
                  className="h-11 rounded-xl border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <i className="fa-solid fa-trash-can" aria-hidden="true" />
                  <span>Delete Account</span>
                </button>
              )}
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Permanent Account Deletion Confirmation Modal */}
      <ModalDialog
        open={Boolean(deleteUser)}
        title="Permanently Delete Account?"
        onClose={() => !deleting && setDeleteUser(null)}
        maxWidth="max-w-md"
      >
        {deleteUser && (
          <form onSubmit={handlePermanentDeleteSubmit} className="space-y-4 text-xs">
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-4 flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#DC2626] text-white flex items-center justify-center shrink-0">
                <i className="fa-solid fa-triangle-exclamation text-base" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="font-display font-bold text-sm text-[#991B1B]">
                  Irreversible Permanent Deletion
                </div>
                <p className="text-[11px] text-[#7F1D1D] mt-1 leading-relaxed">
                  This will permanently remove this user account, revoke all active login sessions immediately, and erase their wallet, transactions, deposits, complaints, and notifications. This cannot be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <InlineAlert type="error" message={deleteError} onClose={() => setDeleteError('')} />
            )}

            <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-3.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#64748B]">Account Holder</span>
                <span className="font-bold text-[#0E163B] truncate">{deleteUser.fullName}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#64748B]">Mobile / Account ID</span>
                <span className="font-mono font-semibold text-[#0E163B]">
                  {deleteUser.mobile || deleteUser.accountId}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#64748B]">Email</span>
                <span className="font-mono text-[11px] text-[#334155] truncate">{deleteUser.email}</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#EAE7F5]">
                <span className="text-[#64748B]">Current Balance</span>
                <span className="font-mono font-bold text-[#0E163B]">
                  {formatINR(deleteUser.wallet?.currentBalance || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#64748B]">Pending / Commission</span>
                <span className="font-mono text-[#334155]">
                  {formatINR(deleteUser.wallet?.pendingBalance || 0)} /{' '}
                  {formatINR(deleteUser.wallet?.commissionBalance || 0)}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-delete-input" className="block font-semibold text-[#334155] mb-1.5">
                Type <code className="font-mono font-bold text-[#DC2626]">DELETE</code> to confirm permanent removal
              </label>
              <input
                id="confirm-delete-input"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => {
                  setDeleteConfirmText(e.target.value);
                  if (deleteError) setDeleteError('');
                }}
                placeholder="Type DELETE"
                autoComplete="off"
                required
                className="w-full h-11 px-3.5 rounded-xl border border-[#FECACA] bg-white font-mono text-sm font-bold tracking-wider text-[#991B1B] focus:border-[#DC2626] focus:ring-2 focus:ring-[#DC2626]/15 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeleteUser(null)}
                disabled={deleting}
                className="h-11 rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[#334155] font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                className="h-11 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <i
                  className={`fa-solid ${deleting ? 'fa-spinner fa-spin' : 'fa-trash-can'}`}
                  aria-hidden="true"
                />
                <span>{deleting ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Wallet Adjustment Modal */}
      <ModalDialog
        open={Boolean(adjustUser)}
        title={`Audited Wallet Adjustment · ${adjustUser?.fullName || ''}`}
        onClose={() => !adjSaving && setAdjustUser(null)}
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
          <p className="text-[#64748B]">
            Every adjustment writes an immutable record to <code className="font-mono">wallet_ledger</code> and{' '}
            <code className="font-mono">audit_logs</code>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="adj-bal" className="block font-semibold text-[#334155] mb-1">
                Balance Bucket
              </label>
              <select
                id="adj-bal"
                value={adjBalanceType}
                onChange={(e) => setAdjBalanceType(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE]"
              >
                <option value="CURRENT">Current Balance</option>
                <option value="PENDING">Pending Balance</option>
                <option value="COMMISSION">Commission Balance</option>
              </select>
            </div>
            <div>
              <label htmlFor="adj-dir" className="block font-semibold text-[#334155] mb-1">
                Operation
              </label>
              <select
                id="adj-dir"
                value={adjDirection}
                onChange={(e) => setAdjDirection(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE]"
              >
                <option value="CREDIT">Credit (+)</option>
                <option value="DEBIT">Debit (-)</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="adj-amt" className="block font-semibold text-[#334155] mb-1">
              Amount (₹)
            </label>
            <input
              id="adj-amt"
              type="number"
              min="1"
              step="0.01"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              required
              className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono"
            />
          </div>
          <div>
            <label htmlFor="adj-reason" className="block font-semibold text-[#334155] mb-1">
              Audit Reason (Required)
            </label>
            <input
              id="adj-reason"
              type="text"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="e.g. Manual wallet balance reconciliation"
              required
              className="w-full h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE]"
            />
          </div>
          <button
            type="submit"
            disabled={adjSaving}
            className="w-full h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white font-semibold cursor-pointer"
          >
            {adjSaving ? 'Recording Adjustment...' : 'Apply Audited Adjustment'}
          </button>
        </form>
      </ModalDialog>
    </div>
  );
}
