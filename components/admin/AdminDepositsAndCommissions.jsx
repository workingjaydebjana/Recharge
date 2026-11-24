'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { formatINR, roundMoney } from '@/lib/finance.js';
import { MOBILE_OPERATORS, DTH_OPERATORS, ELECTRICITY_BOARDS } from '@/lib/constants.js';
import { apiRequest } from '@/lib/api-client.js';
import { InlineAlert, StatusText, formatDateTime } from '@/components/SharedUI.jsx';

const SERVICE_SECTIONS = [
  {
    key: 'MOBILE',
    title: 'Mobile Recharge',
    subtitle: 'Prepaid mobile operators across India',
    icon: 'fa-mobile-screen-button',
    accentBg: 'bg-[#EEF2FF]',
    accentText: 'text-[#4338CA]',
  },
  {
    key: 'DTH',
    title: 'DTH Recharge',
    subtitle: 'Indian DTH TV operators',
    icon: 'fa-satellite-dish',
    accentBg: 'bg-[#F5F3FF]',
    accentText: 'text-[#6D28D9]',
  },
  {
    key: 'ELECTRICITY',
    title: 'Electricity Bill',
    subtitle: 'West Bengal electricity boards (WBSEDCL & CESC)',
    icon: 'fa-bolt-lightning',
    accentBg: 'bg-[#FEF3C7]',
    accentText: 'text-[#B45309]',
  },
  {
    key: 'REDEEM_CODE',
    title: 'Redeem Code',
    subtitle: 'Google Play digital voucher service',
    icon: 'fa-gift',
    accentBg: 'bg-[#ECFDF5]',
    accentText: 'text-[#047857]',
  },
];

const OPERATOR_LOGO_MAP = {
  ...[...MOBILE_OPERATORS, ...DTH_OPERATORS, ...ELECTRICITY_BOARDS].reduce((acc, item) => {
    acc[item.code] = item.logo;
    return acc;
  }, {}),
  GOOGLE_PLAY: '/logos/google-play.svg',
};

function isRuleDirty(current, original) {
  if (!original) return true;
  return (
    current.rateType !== original.rateType ||
    roundMoney(current.rateValue) !== roundMoney(original.rateValue) ||
    Boolean(current.isActive) !== Boolean(original.isActive)
  );
}

function getRulePreview(rule) {
  if (!rule.isActive) {
    return {
      tone: 'closed',
      icon: 'fa-ban',
      text: 'Service Temporarily Closed — blocked on User Portal & API',
    };
  }
  const num = Number(rule.rateValue);
  if (!Number.isFinite(num) || num === 0) {
    return {
      tone: 'neutral',
      icon: 'fa-minus',
      text: 'Zero commission & zero service charge (₹0.00)',
    };
  }
  if (rule.rateType === 'fixed') {
    if (num < 0) {
      const fee = Math.abs(num);
      return {
        tone: 'fee',
        icon: 'fa-circle-minus',
        text: `Flat Service Charge: ${formatINR(fee)} charged to user on every order (₹0 commission)`,
      };
    }
    return {
      tone: 'commission',
      icon: 'fa-coins',
      text: `Flat Commission: +${formatINR(num)} per order regardless of amount`,
    };
  }
  if (num < 0) {
    return {
      tone: 'fee',
      icon: 'fa-triangle-exclamation',
      text: 'Percentage (%) cannot be negative — use Fixed Amount (₹) for minus charge',
    };
  }
  const per100 = roundMoney(num);
  const per1000 = roundMoney((1000 * num) / 100);
  return {
    tone: 'commission',
    icon: 'fa-percent',
    text: `Percentage Commission: ${formatINR(per100)} per ₹100 (${formatINR(per1000)} on ₹1,000)`,
  };
}

export default function AdminDepositsAndCommissions({ token, mode = 'DEPOSITS', onDataMutated }) {
  const [deposits, setDeposits] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [savedCommissions, setSavedCommissions] = useState([]);
  const [depFilter, setDepFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const reqPromise =
      mode === 'DEPOSITS'
        ? apiRequest(`/api/admin/deposits${depFilter ? `?status=${depFilter}` : ''}`, { token })
        : apiRequest('/api/admin/commissions', { token });
    reqPromise
      .then((res) => {
        if (cancelled) return;
        if (mode === 'DEPOSITS') {
          setDeposits(res.deposits || []);
        } else {
          const list = res.commissions || [];
          setCommissions(list);
          setSavedCommissions(list);
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
  }, [token, mode, depFilter]);

  function updateLocalRule(id, field, value) {
    setError('');
    setSuccess('');
    setCommissions((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r;
        if (field === 'rateType') {
          const nextType = value === 'fixed' ? 'fixed' : 'percentage';
          const currNum = Number(r.rateValue);
          const nextValue =
            nextType === 'percentage' && Number.isFinite(currNum) && currNum < 0 ? 0 : r.rateValue;
          return { ...r, rateType: nextType, rateValue: nextValue };
        }
        return { ...r, [field]: value };
      })
    );
  }

  const savedMap = useMemo(() => {
    const map = {};
    for (const item of savedCommissions) {
      map[item._id] = item;
    }
    return map;
  }, [savedCommissions]);

  const dirtyCount = useMemo(
    () => commissions.filter((r) => isRuleDirty(r, savedMap[r._id])).length,
    [commissions, savedMap]
  );

  const summaryStats = useMemo(() => {
    let activeCount = 0;
    let closedCount = 0;
    let feeCount = 0;
    for (const r of commissions) {
      if (r.isActive) activeCount += 1;
      else closedCount += 1;
      if (r.isActive && r.rateType === 'fixed' && Number(r.rateValue) < 0) feeCount += 1;
    }
    return { total: commissions.length, activeCount, closedCount, feeCount };
  }, [commissions]);

  function handleResetUnsaved() {
    setCommissions(savedCommissions);
    setError('');
    setSuccess('');
  }

  async function handleSaveAllCommissions() {
    setError('');
    setSuccess('');

    // Validate all rules before sending
    for (const rule of commissions) {
      const raw = rule.rateValue === '' || rule.rateValue === null || rule.rateValue === undefined ? 0 : Number(rule.rateValue);
      if (!Number.isFinite(raw)) {
        setError(`Enter a valid numeric rate value for ${rule.operatorName}.`);
        return;
      }
      if (rule.rateType === 'percentage') {
        if (raw < 0) {
          setError(
            `${rule.operatorName}: Percentage (%) cannot be negative. Switch Rate Type to Fixed Amount (₹) to set a minus service charge.`
          );
          return;
        }
        if (raw > 25) {
          setError(`${rule.operatorName}: Percentage commission cannot exceed 25%.`);
          return;
        }
      } else if (raw < -500 || raw > 500) {
        setError(`${rule.operatorName}: Fixed amount must be between -₹500 and +₹500.`);
        return;
      }
    }

    setSavingAll(true);
    try {
      const res = await apiRequest('/api/admin/commissions', {
        method: 'PUT',
        token,
        body: {
          rules: commissions.map((rule) => ({
            ruleId: rule._id,
            rateType: rule.rateType,
            rateValue: rule.rateValue === '' ? 0 : Number(rule.rateValue),
            isActive: Boolean(rule.isActive),
          })),
        },
      });
      const latest = res.commissions || [];
      setCommissions(latest);
      setSavedCommissions(latest);
      const count = Number(res.updatedCount || 0);
      setSuccess(
        count > 0
          ? `Saved changes for ${count} service${count === 1 ? '' : 's'}. All commission rates, fixed fees, and service statuses are now live on the User Portal.`
          : 'All service rates and statuses are already up to date.'
      );
      await onDataMutated();
    } catch (err) {
      setError(err.message || 'Unable to save commission and service settings.');
    } finally {
      setSavingAll(false);
    }
  }

  if (mode === 'COMMISSIONS') {
    return (
      <div className="space-y-5 sm:space-y-6 pb-8">
        {/* Top Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0E163B]">
            Commission &amp; Service Management
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Control commissions, fixed charges, and active status for all website services in one place.
          </p>
        </div>

        {/* Summary Strip & Rule Guide */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          <div className="lg:col-span-5 grid grid-cols-3 gap-2.5">
            <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5">
              <div className="text-[11px] font-semibold text-[#64748B]">Active</div>
              <div className="font-mono text-xl font-bold text-[#15803D] tabular-nums mt-0.5">
                {summaryStats.activeCount}
              </div>
              <div className="text-[10px] text-[#94A3B8]">of {summaryStats.total} services</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5">
              <div className="text-[11px] font-semibold text-[#64748B]">Closed</div>
              <div className="font-mono text-xl font-bold text-[#DC2626] tabular-nums mt-0.5">
                {summaryStats.closedCount}
              </div>
              <div className="text-[10px] text-[#94A3B8]">blocked for users</div>
            </div>
            <div className="bg-white rounded-2xl border border-[#EAE7F5] p-3.5">
              <div className="text-[11px] font-semibold text-[#64748B]">Fee Rules</div>
              <div className="font-mono text-xl font-bold text-[#B45309] tabular-nums mt-0.5">
                {summaryStats.feeCount}
              </div>
              <div className="text-[10px] text-[#94A3B8]">minus fixed ₹</div>
            </div>
          </div>

          <div className="lg:col-span-7 lavender-wash rounded-2xl border border-[#EAE7F5] p-3.5 sm:p-4 text-xs text-[#334155] space-y-1.5">
            <div className="font-bold text-[#0E163B] flex items-center gap-1.5">
              <i className="fa-solid fa-circle-info text-[#5B35E5]" aria-hidden="true" />
              <span>How Pricing &amp; Service Controls Work</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[#475569] leading-relaxed">
              <div>
                <strong className="text-[#0E163B]">Percentage (%):</strong> Non-negative only (0% – 25%). E.g.{' '}
                <span className="font-mono font-semibold text-[#15803D]">2%</span> on ₹100 = ₹2.00 commission.
              </div>
              <div>
                <strong className="text-[#0E163B]">Fixed Amount (₹):</strong> Same flat ₹ on any amount.{' '}
                <span className="font-mono font-semibold text-[#15803D]">+5</span> = ₹5 commission;{' '}
                <span className="font-mono font-semibold text-[#DC2626]">-5</span> = ₹5 user service fee.
              </div>
            </div>
          </div>
        </div>

        {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}
        {success && <InlineAlert type="success" message={success} onClose={() => setSuccess('')} />}

        {loading ? (
          <div className="bg-white rounded-2xl border border-[#EAE7F5] p-10 text-center text-xs text-[#64748B]">
            <i className="fa-solid fa-spinner fa-spin mr-2 text-[#5B35E5]" aria-hidden="true" />
            Loading all platform services...
          </div>
        ) : (
          <div className="space-y-5">
            {SERVICE_SECTIONS.map((section) => {
              const sectionRules = commissions.filter((r) => r.serviceType === section.key);
              if (sectionRules.length === 0) return null;
              const activeInSection = sectionRules.filter((r) => r.isActive).length;

              return (
                <section
                  key={section.key}
                  className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden shadow-xs"
                >
                  {/* Section Header */}
                  <div className="px-4 sm:px-5 py-3.5 bg-[#FAF9FE] border-b border-[#EAE7F5] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-9 h-9 rounded-xl ${section.accentBg} ${section.accentText} flex items-center justify-center shrink-0`}
                      >
                        <i className={`fa-solid ${section.icon} text-sm`} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-sm sm:text-base font-bold text-[#0E163B] truncate">
                          {section.title}
                        </h2>
                        <p className="text-[11px] text-[#64748B] truncate">{section.subtitle}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-[#475569] bg-white border border-[#EAE7F5] px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0">
                      {activeInSection}/{sectionRules.length} Active
                    </span>
                  </div>

                  {/* Responsive Service Cards (Zero Horizontal Scroll on Mobile, Clean Rows on Desktop) */}
                  <div className="divide-y divide-[#F1EEF9]">
                    {sectionRules.map((rule) => {
                      const logoSrc = OPERATOR_LOGO_MAP[rule.operatorCode];
                      const dirty = isRuleDirty(rule, savedMap[rule._id]);
                      const preview = getRulePreview(rule);
                      const isFixed = rule.rateType === 'fixed';

                      return (
                        <div
                          key={rule._id}
                          className={`p-4 sm:px-5 transition-colors ${
                            !rule.isActive
                              ? 'bg-[#FEF2F2]/40'
                              : dirty
                                ? 'bg-[#F5F3FF]/45'
                                : 'bg-white hover:bg-[#FAF9FE]/60'
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
                            {/* Operator Identity + Status Toggle */}
                            <div className="flex items-center justify-between gap-3 lg:min-w-[270px]">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-10 h-10 rounded-xl bg-white border border-[#EAE7F5] flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                                  {logoSrc ? (
                                    <Image
                                      src={logoSrc}
                                      alt={rule.operatorName}
                                      width={28}
                                      height={28}
                                      referrerPolicy="no-referrer"
                                      className="w-7 h-7 object-contain"
                                    />
                                  ) : (
                                    <i
                                      className={`fa-solid ${section.icon} ${section.accentText} text-sm`}
                                      aria-hidden="true"
                                    />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs sm:text-sm text-[#0E163B] truncate">
                                      {rule.operatorName}
                                    </span>
                                    {dirty && (
                                      <span
                                        title="Unsaved change"
                                        className="w-2 h-2 rounded-full bg-[#5B35E5] shrink-0"
                                      />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span
                                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                        rule.isActive
                                          ? 'bg-[#ECFDF5] text-[#15803D] border border-[#BBF7D0]'
                                          : 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                                      }`}
                                    >
                                      <i
                                        className={`fa-solid ${rule.isActive ? 'fa-circle-check' : 'fa-ban'} text-[9px]`}
                                        aria-hidden="true"
                                      />
                                      {rule.isActive ? 'Active' : 'Closed'}
                                    </span>
                                    <span className="font-mono text-[10px] text-[#94A3B8]">
                                      {rule.operatorCode}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Mobile Toggle Switch */}
                              <button
                                type="button"
                                role="switch"
                                aria-checked={Boolean(rule.isActive)}
                                aria-label={`Toggle ${rule.operatorName} availability`}
                                onClick={() => updateLocalRule(rule._id, 'isActive', !rule.isActive)}
                                className={`lg:hidden relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 cursor-pointer ${
                                  rule.isActive ? 'bg-[#15803D]' : 'bg-[#CBD5E1]'
                                }`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                                    rule.isActive ? 'translate-x-6' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            </div>

                            {/* Rate Controls */}
                            <div className="grid grid-cols-12 sm:flex sm:items-center gap-2.5 lg:justify-end">
                              {/* Rate Type Selector */}
                              <div className="col-span-7 sm:w-44">
                                <label
                                  htmlFor={`type-${rule._id}`}
                                  className="block text-[10px] font-semibold uppercase tracking-wide text-[#64748B] mb-1"
                                >
                                  Calculation Mode
                                </label>
                                <select
                                  id={`type-${rule._id}`}
                                  value={rule.rateType}
                                  onChange={(e) => updateLocalRule(rule._id, 'rateType', e.target.value)}
                                  className="w-full h-10 px-2.5 rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold text-[#0E163B] focus:border-[#5B35E5] outline-none"
                                >
                                  <option value="percentage">Percentage (%)</option>
                                  <option value="fixed">Fixed Amount (₹)</option>
                                </select>
                              </div>

                              {/* Rate Value Input */}
                              <div className="col-span-5 sm:w-36">
                                <label
                                  htmlFor={`val-${rule._id}`}
                                  className="block text-[10px] font-semibold uppercase tracking-wide text-[#64748B] mb-1"
                                >
                                  {isFixed ? 'Amount (+ / - ₹)' : 'Rate (0 – 25%)'}
                                </label>
                                <div className="relative">
                                  {isFixed && (
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-[#64748B]">
                                      ₹
                                    </span>
                                  )}
                                  <input
                                    id={`val-${rule._id}`}
                                    type="number"
                                    step="0.05"
                                    min={isFixed ? -500 : 0}
                                    max={isFixed ? 500 : 25}
                                    value={rule.rateValue}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (!isFixed && val !== '' && Number(val) < 0) {
                                        updateLocalRule(rule._id, 'rateValue', 0);
                                        return;
                                      }
                                      updateLocalRule(rule._id, 'rateValue', val);
                                    }}
                                    className={`w-full h-10 rounded-xl border border-[#E2E8F0] bg-white font-mono text-xs sm:text-sm font-bold tabular-nums focus:border-[#5B35E5] outline-none ${
                                      isFixed ? 'pl-7 pr-2.5' : 'pl-3 pr-7'
                                    } ${
                                      isFixed && Number(rule.rateValue) < 0
                                        ? 'text-[#DC2626] border-[#FCA5A5]'
                                        : Number(rule.rateValue) > 0
                                          ? 'text-[#15803D]'
                                          : 'text-[#0E163B]'
                                    }`}
                                  />
                                  {!isFixed && (
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-[#64748B]">
                                      %
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Desktop Toggle Switch */}
                              <div className="hidden lg:flex flex-col items-center pl-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B] mb-1">
                                  Service
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={Boolean(rule.isActive)}
                                  aria-label={`Toggle ${rule.operatorName} availability`}
                                  onClick={() => updateLocalRule(rule._id, 'isActive', !rule.isActive)}
                                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer ${
                                    rule.isActive ? 'bg-[#15803D]' : 'bg-[#CBD5E1]'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                                      rule.isActive ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Live Human-Readable Calculation Preview */}
                          <div
                            className={`mt-2.5 text-[11px] font-medium flex items-center gap-1.5 ${
                              preview.tone === 'closed' || preview.tone === 'fee'
                                ? 'text-[#DC2626]'
                                : preview.tone === 'commission'
                                  ? 'text-[#15803D]'
                                  : 'text-[#64748B]'
                            }`}
                          >
                            <i className={`fa-solid ${preview.icon} text-[10px] shrink-0`} aria-hidden="true" />
                            <span>{preview.text}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {/* Bottom Unified Save Bar (Convenient on Mobile) */}
            <div className="bg-white rounded-2xl border border-[#DDD6FE] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="text-xs text-[#475569]">
                {dirtyCount > 0 ? (
                  <span>
                    You have <strong className="text-[#5B35E5]">{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</strong> across platform services.
                  </span>
                ) : (
                  <span>All {summaryStats.total} service commission &amp; status rules are synced live.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {dirtyCount > 0 && (
                  <button
                    type="button"
                    disabled={savingAll}
                    onClick={handleResetUnsaved}
                    className="h-10 px-4 rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-xs font-semibold text-[#475569] cursor-pointer"
                  >
                    Discard
                  </button>
                )}
                <button
                  type="button"
                  disabled={savingAll}
                  onClick={handleSaveAllCommissions}
                  className="flex-1 sm:flex-initial h-10 px-5 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold shadow-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <i
                    className={`fa-solid ${savingAll ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}
                    aria-hidden="true"
                  />
                  <span>
                    {savingAll
                      ? 'Saving All Changes...'
                      : dirtyCount > 0
                        ? `Save All Changes (${dirtyCount})`
                        : 'Save All Changes'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0E163B]">Deposit Management</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            View all user wallet deposits processed via automated payment gateway. Wallet credits are handled automatically by the gateway.
          </p>
        </div>
        <select
          value={depFilter}
          onChange={(e) => setDepFilter(e.target.value)}
          aria-label="Filter deposits by status"
          className="h-10 px-3 rounded-xl border border-[#E2E8F0] bg-white text-xs font-semibold"
        >
          <option value="">All Deposits</option>
          <option value="APPROVED">Approved / Credited</option>
          <option value="PENDING">Pending</option>
          <option value="REJECTED">Failed / Rejected</option>
        </select>
      </div>

      {error && <InlineAlert type="error" message={error} onClose={() => setError('')} />}

      <div className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#64748B]">Loading deposit records...</div>
        ) : deposits.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">No deposits found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF9FE] text-[#64748B] border-b border-[#EAE7F5]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Deposit &amp; User</th>
                  <th className="py-3 px-4 font-semibold">Payment Ref (UTR)</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Gateway Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE7F5]">
                {deposits.map((dep) => (
                  <tr key={dep._id} className="hover:bg-[#FAF9FE]">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-[#0E163B]">{dep._id}</div>
                      <div className="font-semibold text-[#334155]">
                        {dep.userName || 'User'} {dep.userMobile ? `(${dep.userMobile})` : ''}
                      </div>
                      <div className="text-[11px] text-[#94A3B8]">{formatDateTime(dep.createdAt)}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0E163B]">{dep.paymentMode || 'UPI Gateway'}</div>
                      <div className="font-mono text-[#5B35E5]">{dep.referenceNumber || '—'}</div>
                      {dep.remarks && <div className="text-[11px] text-[#64748B]">{dep.remarks}</div>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-sm text-[#0E163B] tabular-nums">
                      {formatINR(dep.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={dep.status} />
                    </td>
                    <td className="py-3 px-4 text-[#475569]">
                      <div>
                        {dep.adminRemark ||
                          (dep.status === 'APPROVED'
                            ? 'Auto-credited via Payment Gateway'
                            : dep.status === 'PENDING'
                              ? 'Awaiting Payment Gateway confirmation'
                              : 'Payment Failed / Rejected')}
                      </div>
                      {dep.reviewedAt && (
                        <div className="text-[11px] text-[#94A3B8]">{formatDateTime(dep.reviewedAt)}</div>
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
