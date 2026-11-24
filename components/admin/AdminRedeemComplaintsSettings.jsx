'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api-client.js';
import { InlineAlert, StatusText, formatDateTime } from '@/components/SharedUI.jsx';

export default function AdminRedeemComplaintsSettings({
  token,
  mode = 'COMPLAINTS', // 'COMPLAINTS' | 'SETTINGS'
  onDataMutated,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Complaints state
  const [complaints, setComplaints] = useState([]);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [statusDrafts, setStatusDrafts] = useState({});

  // Settings state
  const [settings, setSettings] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'COMPLAINTS') {
        const res = await apiRequest('/api/admin/complaints', { token });
        setComplaints(res.complaints || []);
      } else {
        const res = await apiRequest('/api/admin/settings', { token });
        setSettings(res.settings);
        setSystemInfo(res.systemInfo);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, mode]);

  useEffect(() => {
    let cancelled = false;
    const url = mode === 'COMPLAINTS' ? '/api/admin/complaints' : '/api/admin/settings';
    apiRequest(url, { token })
      .then((res) => {
        if (cancelled) return;
        if (mode === 'COMPLAINTS') {
          setComplaints(res.complaints || []);
        } else {
          setSettings(res.settings);
          setSystemInfo(res.systemInfo);
        }
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
  }, [token, mode]);

  async function handleUpdateComplaint(cmp) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await apiRequest('/api/admin/complaints', {
        method: 'PATCH',
        token,
        body: {
          complaintId: cmp._id,
          status: statusDrafts[cmp._id] || 'RESOLVED',
          adminResponse: replyDrafts[cmp._id] || '',
        },
      });
      setSuccess(`Complaint ${cmp._id} updated and user notified.`);
      setReplyDrafts((prev) => ({ ...prev, [cmp._id]: '' }));
      await loadData();
      await onDataMutated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiRequest('/api/admin/settings', {
        method: 'PATCH',
        token,
        body: {
          minCommissionTransfer: settings.minCommissionTransfer,
          minDepositAmount: settings.minDepositAmount,
          maxDepositAmount: settings.maxDepositAmount,
        },
      });
      setSettings(res.settings);
      setSuccess(res.message);
      await onDataMutated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'COMPLAINTS') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0E163B]">Complaint Management</h1>
          <p className="text-xs text-[#64748B] mt-0.5">Review user tickets, post responses, and update resolution statuses.</p>
        </div>

        {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
        {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

        <div className="bg-white rounded-2xl border border-[#EAE7F5] divide-y divide-[#EAE7F5]">
          {loading ? (
            <div className="p-8 text-center text-xs text-[#64748B]">Loading complaints...</div>
          ) : complaints.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">No complaints submitted yet.</div>
          ) : (
            complaints.map((c) => (
              <div key={c._id} className="p-5 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-[#5B35E5] mr-2">{c._id}</span>
                    <span className="font-semibold text-[#0E163B]">{c.subject}</span>
                  </div>
                  <StatusText status={c.status} />
                </div>
                <div className="text-[#64748B]">
                  {c.userName} ({c.userMobile}) · {c.category} {c.referenceId ? `· Ref: ${c.referenceId}` : ''} ·{' '}
                  {formatDateTime(c.createdAt)}
                </div>
                <p className="text-[#334155] bg-[#FAF9FE] border border-[#EAE7F5] rounded-xl p-3">{c.description}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Write Super Admin response..."
                    value={replyDrafts[c._id] ?? ''}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [c._id]: e.target.value }))}
                    className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white"
                  />
                  <select
                    value={statusDrafts[c._id] || c.status}
                    onChange={(e) => setStatusDrafts((prev) => ({ ...prev, [c._id]: e.target.value }))}
                    aria-label={`Status for ${c._id}`}
                    className="h-9 px-2.5 rounded-lg border border-[#E2E8F0] bg-white font-semibold"
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleUpdateComplaint(c)}
                    className="px-4 h-9 rounded-lg bg-[#5B35E5] text-white font-semibold cursor-pointer"
                  >
                    Update Ticket
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0E163B]">Platform Settings</h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          Configure deposit limits, minimum commission transfer threshold, and review infrastructure status.
        </p>
      </div>

      {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
      {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

      {settings && (
        <form onSubmit={handleSaveSettings} className="space-y-6 text-xs">
          <div className="bg-white rounded-2xl border border-[#EAE7F5] p-5 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Min Commission Transfer (₹, floor ₹50)</label>
              <input
                type="number"
                min={50}
                value={settings.minCommissionTransfer ?? 50}
                onChange={(e) => setSettings({ ...settings, minCommissionTransfer: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Min Deposit Amount (₹)</label>
              <input
                type="number"
                min={10}
                value={settings.minDepositAmount ?? 100}
                onChange={(e) => setSettings({ ...settings, minDepositAmount: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Max Deposit Amount (₹)</label>
              <input
                type="number"
                min={100}
                value={settings.maxDepositAmount ?? 100000}
                onChange={(e) => setSettings({ ...settings, maxDepositAmount: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9FE] font-mono"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#EAE7F5] p-5 sm:p-6 space-y-2">
            <h2 className="text-sm font-bold text-[#0E163B]">External Infrastructure Status</h2>
            <div className="text-[#475569] space-y-1">
              <div>
                Database Engine:{' '}
                <strong className="text-[#0E163B]">
                  {systemInfo?.dbMode === 'MONGODB'
                    ? 'Connected to MongoDB (MONGODB_URI)'
                    : 'Local Persistent MongoDB-Compatible Store (Set MONGODB_URI for external Atlas/cluster)'}
                </strong>
              </div>
              <div>
                OTP / SMS Gateway:{' '}
                <strong className="text-[#0E163B]">
                  {systemInfo?.otpProviderConfigured
                    ? 'External OTP Provider Configured'
                    : 'Built-in Verification (Configure OTP_PROVIDER_ENDPOINT & OTP_PROVIDER_API_KEY in server env for SMS)'}
                </strong>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] text-white font-semibold cursor-pointer"
          >
            {saving ? 'Saving Settings...' : 'Save Platform Settings'}
          </button>
        </form>
      )}
    </div>
  );
}
