'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatINR } from '@/lib/finance.js';
import { apiRequest } from '@/lib/api-client.js';
import { InlineAlert, StatusText, formatDateTime } from '@/components/SharedUI.jsx';

export default function AdminTransactionsAndProviders({
  token,
  mode = 'TRANSACTIONS', // 'TRANSACTIONS' | 'PROVIDERS'
  onDataMutated,
}) {
  const [transactions, setTransactions] = useState([]);
  const [providers, setProviders] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState('');

  // Provider edit form drafts
  const [providerDrafts, setProviderDrafts] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'PROVIDERS') {
        const res = await apiRequest('/api/admin/providers', { token });
        const list = res.providers || [];
        setProviders(list);
        const drafts = {};
        for (const p of list) {
          drafts[p._id] = {
            name: p.name,
            baseUrl: p.baseUrl || '',
            mode: p.mode || 'DEMO',
            isActive: Boolean(p.isActive),
            apiKey: '',
            apiSecret: '',
            webhookSecret: '',
          };
        }
        setProviderDrafts(drafts);
      } else {
        const params = new URLSearchParams();
        if (typeFilter) params.set('type', typeFilter);
        if (statusFilter) params.set('status', statusFilter);
        if (search.trim()) params.set('search', search.trim());
        const res = await apiRequest(`/api/admin/transactions?${params.toString()}`, { token });
        setTransactions(res.transactions || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, mode, typeFilter, statusFilter, search]);

  useEffect(() => {
    let cancelled = false;
    if (mode === 'PROVIDERS') {
      apiRequest('/api/admin/providers', { token })
        .then((res) => {
          if (cancelled) return;
          const list = res.providers || [];
          setProviders(list);
          const drafts = {};
          for (const p of list) {
            drafts[p._id] = {
              name: p.name,
              baseUrl: p.baseUrl || '',
              mode: p.mode || 'DEMO',
              isActive: Boolean(p.isActive),
              apiKey: '',
              apiSecret: '',
              webhookSecret: '',
            };
          }
          setProviderDrafts(drafts);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      apiRequest(`/api/admin/transactions?${params.toString()}`, { token })
        .then((res) => {
          if (!cancelled) setTransactions(res.transactions || []);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [token, mode, typeFilter, statusFilter, search]);

  async function handleReconcile(transactionId, newStatus) {
    setBusyId(transactionId);
    setError('');
    setSuccess('');
    try {
      await apiRequest('/api/admin/transactions', {
        method: 'PATCH',
        token,
        body: {
          transactionId,
          newStatus,
          remark:
            newStatus === 'SUCCESSFUL'
              ? 'Confirmed Successful by Super Admin reconciliation.'
              : 'Marked Failed by Super Admin; automatic refund credited to Current Balance.',
        },
      });
      setSuccess(
        `Transaction ${transactionId} finalized as ${newStatus}${
          newStatus === 'FAILED' ? ' with atomic refund to Current Balance.' : ' with commission credit.'
        }`
      );
      await loadData();
      await onDataMutated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function handleSaveProvider(providerId) {
    setBusyId(providerId);
    setError('');
    setSuccess('');
    try {
      const draft = providerDrafts[providerId];
      const res = await apiRequest('/api/admin/providers', {
        method: 'PATCH',
        token,
        body: { providerId, ...draft },
      });
      setSuccess(res.message);
      await loadData();
      await onDataMutated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  if (mode === 'PROVIDERS') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0E163B]">Recharge API Provider Settings</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Configure external Mobile &amp; DTH provider endpoints. Credentials are AES-256-GCM encrypted at rest and never exposed back to the browser.
          </p>
        </div>

        {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
        {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {providers.map((p) => {
            const draft = providerDrafts[p._id] || {};
            return (
              <div key={p._id} className="bg-white rounded-2xl border border-[#EAE7F5] p-5 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#0E163B]">{p.serviceType} Recharge Provider</h2>
                    <p className="text-xs text-[#64748B]">
                      Status: <strong>{p.isConfigured && p.mode === 'LIVE' && p.isActive ? 'LIVE CONNECTED' : 'SANDBOX (Awaiting Live API Credentials)'}</strong>
                    </p>
                  </div>
                  <StatusText status={p.isConfigured && p.mode === 'LIVE' && p.isActive ? 'ACTIVE' : 'PENDING'} />
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-[#334155] mb-1">Provider Name</label>
                    <input
                      type="text"
                      value={draft.name || ''}
                      onChange={(e) =>
                        setProviderDrafts((prev) => ({
                          ...prev,
                          [p._id]: { ...prev[p._id], name: e.target.value },
                        }))
                      }
                      className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#334155] mb-1">API Endpoint Base URL (https://)</label>
                    <input
                      type="url"
                      placeholder="https://api.your-recharge-provider.in/v1/recharge"
                      value={draft.baseUrl || ''}
                      onChange={(e) =>
                        setProviderDrafts((prev) => ({
                          ...prev,
                          [p._id]: { ...prev[p._id], baseUrl: e.target.value },
                        }))
                      }
                      className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">
                        API Key {p.hasApiKey ? `(Saved: ${p.apiKeyMasked})` : '(Not Set)'}
                      </label>
                      <input
                        type="password"
                        placeholder="Enter new API key to update"
                        value={draft.apiKey || ''}
                        onChange={(e) =>
                          setProviderDrafts((prev) => ({
                            ...prev,
                            [p._id]: { ...prev[p._id], apiKey: e.target.value },
                          }))
                        }
                        className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">
                        Webhook Secret {p.hasWebhookSecret ? '(Saved)' : '(Not Set)'}
                      </label>
                      <input
                        type="password"
                        placeholder="Callback verification secret"
                        value={draft.webhookSecret || ''}
                        onChange={(e) =>
                          setProviderDrafts((prev) => ({
                            ...prev,
                            [p._id]: { ...prev[p._id], webhookSecret: e.target.value },
                          }))
                        }
                        className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 items-center pt-1">
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">Execution Mode</label>
                      <select
                        value={draft.mode || 'DEMO'}
                        onChange={(e) =>
                          setProviderDrafts((prev) => ({
                            ...prev,
                            [p._id]: { ...prev[p._id], mode: e.target.value },
                          }))
                        }
                        className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE]"
                      >
                        <option value="DEMO">Sandbox Mode</option>
                        <option value="LIVE">Live Provider API</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 pt-5 font-semibold text-[#0E163B] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.isActive)}
                        onChange={(e) =>
                          setProviderDrafts((prev) => ({
                            ...prev,
                            [p._id]: { ...prev[p._id], isActive: e.target.checked },
                          }))
                        }
                        className="w-4 h-4 accent-[#5B35E5]"
                      />
                      <span>Enable Provider</span>
                    </label>
                  </div>
                </div>

                <div className="rounded-xl bg-[#FAF9FE] border border-[#EAE7F5] p-3 text-[11px] text-[#475569]">
                  <strong>Webhook Callback Endpoint:</strong>{' '}
                  <code className="font-mono text-[#5B35E5]">POST /api/webhooks/recharge</code> (Header:{' '}
                  <code className="font-mono">X-Webhook-Secret</code>)
                </div>

                <button
                  type="button"
                  disabled={busyId === p._id}
                  onClick={() => handleSaveProvider(p._id)}
                  className="w-full h-10 rounded-xl bg-[#0E163B] hover:bg-[#19245A] text-white text-xs font-semibold cursor-pointer"
                >
                  {busyId === p._id ? 'Encrypting & Saving...' : 'Save Encrypted Provider Settings'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0E163B]">Centralized Transaction Management</h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          Original transaction records are preserved permanently. Pending transactions can be reconciled once to Successful (+ Commission) or Failed (+ Atomic Refund).
        </p>
      </div>

      {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
      {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

      <div className="bg-white rounded-2xl border border-[#EAE7F5] p-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Transaction ID, Number, User, Operator..."
          aria-label="Search transactions"
          className="flex-1 min-w-[200px] h-10 px-3.5 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by service"
          className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs font-semibold"
        >
          <option value="">All Services</option>
          <option value="MOBILE_RECHARGE">Mobile Recharge</option>
          <option value="DTH_RECHARGE">DTH Recharge</option>
          <option value="ELECTRICITY_BILL">Electricity Bill</option>
          <option value="REDEEM_CODE">Redeem Code</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] text-xs font-semibold"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending (Needs Reconciliation)</option>
          <option value="SUCCESSFUL">Successful</option>
          <option value="FAILED">Failed / Refunded</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#64748B]">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">No matching transactions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9FE] text-[#64748B] border-b border-[#EAE7F5]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Transaction / User</th>
                  <th className="py-3 px-4 font-semibold">Service &amp; Target</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount</th>
                  <th className="py-3 px-4 font-semibold text-right">Commission</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Reconciliation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE7F5]">
                {transactions.map((tx) => (
                  <tr key={tx._id} className="hover:bg-[#FAF9FE]">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-[#0E163B]">{tx._id}</div>
                      <div className="text-[#334155]">
                        {tx.userName || tx.userId} {tx.userMobile ? `(${tx.userMobile})` : ''}
                      </div>
                      <div className="text-[11px] text-[#94A3B8]">
                        {formatDateTime(tx.createdAt)} · {tx.providerMode === 'LIVE' ? 'LIVE' : 'STANDARD'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0E163B]">{tx.operatorName}</div>
                      <div className="font-mono text-[#5B35E5]">{tx.targetNumber}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#0E163B] tabular-nums">
                      {formatINR(tx.amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[#15803D] tabular-nums">
                      {formatINR(tx.commissionAmount || 0)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={tx.status} />
                      {tx.refunded && (
                        <div className="text-[10px] text-[#15803D] font-semibold mt-0.5">Refunded Atomically</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {['PENDING', 'PROCESSING'].includes(tx.status) ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === tx._id}
                            onClick={() => handleReconcile(tx._id, 'SUCCESSFUL')}
                            className="px-2.5 py-1.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold cursor-pointer"
                          >
                            Mark Success
                          </button>
                          <button
                            type="button"
                            disabled={busyId === tx._id}
                            onClick={() => handleReconcile(tx._id, 'FAILED')}
                            className="px-2.5 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold cursor-pointer"
                          >
                            Fail &amp; Refund
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#94A3B8]">Finalized</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
