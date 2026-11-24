'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { apiRequest } from '@/lib/api-client.js';

export default function RechargePlansPanel({
  token,
  service = 'MOBILE', // 'MOBILE' | 'DTH'
  operator,
  circle = '',
  selectedAmount = '',
  onSelectPlan,
}) {
  const [plans, setPlans] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');

  const operatorCode = operator?.code || '';
  const queryKey = `${service}:${operatorCode}:${service === 'MOBILE' ? circle : ''}`;
  const loading = Boolean(operatorCode) && loadedKey !== queryKey;

  useEffect(() => {
    if (!operatorCode) return undefined;
    let cancelled = false;
    const params = new URLSearchParams({
      service,
      operator: operatorCode,
    });
    if (service === 'MOBILE' && circle) {
      params.set('circle', circle);
    }

    apiRequest(`/api/plans?${params.toString()}`, { token })
      .then((res) => {
        if (cancelled) return;
        setPlans(res.plans || []);
        setCategories(res.categories || []);
        setFetchedAt(res.fetchedAt || '');
        setActiveCategory('ALL');
        setError('');
        setLoadedKey(queryKey);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Unable to fetch plans right now.');
        setLoadedKey(queryKey);
      });

    return () => {
      cancelled = true;
    };
  }, [token, service, operatorCode, circle, queryKey]);

  const handleManualRefresh = useCallback(async () => {
    if (!operatorCode) return;
    setRefreshing(true);
    setError('');
    try {
      const params = new URLSearchParams({
        service,
        operator: operatorCode,
      });
      if (service === 'MOBILE' && circle) {
        params.set('circle', circle);
      }
      const res = await apiRequest(`/api/plans?${params.toString()}`, { token });
      setPlans(res.plans || []);
      setCategories(res.categories || []);
      setFetchedAt(res.fetchedAt || '');
      setLoadedKey(queryKey);
    } catch (err) {
      setError(err.message || 'Unable to fetch plans right now.');
    } finally {
      setRefreshing(false);
    }
  }, [token, service, operatorCode, circle, queryKey]);

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plans.filter((plan) => {
      if (activeCategory !== 'ALL' && plan.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const haystack = `${plan.amount} ${plan.validity} ${plan.data} ${plan.calls || ''} ${plan.benefits || ''} ${plan.category || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [plans, activeCategory, searchQuery]);

  const updatedLabel = useMemo(() => {
    if (!fetchedAt) return '';
    try {
      return new Date(fetchedAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [fetchedAt]);

  return (
    <section
      id="browse-plans-section"
      className="bg-white rounded-2xl border border-[#EAE7F5] overflow-hidden"
    >
      {/* Top Plans Header with Official Operator Logo + Live Refresh */}
      <div className="px-4 sm:px-5 py-4 border-b border-[#EAE7F5] bg-[#FAF9FE] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {operator?.logo && (
              <Image
                src={operator.logo}
                alt={operator.name}
                width={36}
                height={36}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-contain shrink-0 border border-[#EAE7F5] bg-white"
              />
            )}
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[#0E163B] truncate">
                {operator?.short || operator?.name} Browse Plans
              </h2>
              <div className="text-[11px] text-[#64748B] truncate">
                {service === 'MOBILE' && circle ? `${circle} · ` : ''}
                {plans.length} plans{updatedLabel ? ` · Updated ${updatedLabel}` : ''}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={loading || refreshing}
            aria-label="Refresh operator plans"
            className="h-9 px-3 rounded-xl border border-[#EAE7F5] bg-white hover:border-[#5B35E5] text-[#334155] hover:text-[#5B35E5] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors disabled:opacity-60"
          >
            <i
              className={`fa-solid fa-rotate text-[11px] ${refreshing || loading ? 'fa-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>

        {/* Instant Plan Search Box */}
        <div className="relative">
          <i
            className="fa-solid fa-magnifying-glass text-xs text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              service === 'DTH'
                ? 'Search ₹ amount, HD, Bangla, Sports, 6 Months...'
                : 'Search ₹ amount (e.g. 299), 5G, 84 days, OTT...'
            }
            className="w-full h-10 pl-9 pr-9 rounded-xl border border-[#E2E8F0] bg-white text-xs sm:text-sm text-[#0E163B] placeholder:text-[#94A3B8] focus:border-[#5B35E5] outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg text-[#64748B] hover:text-[#0E163B] flex items-center justify-center cursor-pointer"
            >
              <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Scrollable Category Filter Tabs */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveCategory('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeCategory === 'ALL'
                  ? 'bg-[#5B35E5] text-white shadow-xs'
                  : 'bg-white border border-[#EAE7F5] text-[#475569] hover:border-[#CBD5E1]'
              }`}
            >
              All Plans
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeCategory === cat
                    ? 'bg-[#5B35E5] text-white shadow-xs'
                    : 'bg-white border border-[#EAE7F5] text-[#475569] hover:border-[#CBD5E1]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Plans List Body */}
      <div className="divide-y divide-[#F1EEF9] max-h-[540px] overflow-y-auto">
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="animate-pulse flex items-center justify-between gap-4 py-2">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-28 bg-[#F1EEF9] rounded" />
                  <div className="h-3 w-4/5 bg-[#FAF9FE] rounded" />
                </div>
                <div className="h-9 w-20 bg-[#F1EEF9] rounded-xl" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center space-y-2">
            <div className="text-xs text-[#DC2626] font-semibold">{error}</div>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="px-4 py-2 rounded-xl bg-[#F5F3FF] text-[#5B35E5] text-xs font-semibold cursor-pointer"
            >
              Try Again
            </button>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <i className="fa-solid fa-magnifying-glass text-[#94A3B8] text-lg" aria-hidden="true" />
            <div className="text-xs font-semibold text-[#0E163B]">No matching plans found</div>
            <p className="text-[11px] text-[#64748B]">
              Try searching a different ₹ amount or switch category tabs.
            </p>
          </div>
        ) : (
          filteredPlans.map((plan) => {
            const isSelected = Number(selectedAmount) === Number(plan.amount);
            return (
              <div
                key={plan.id}
                onClick={() => onSelectPlan(plan)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPlan(plan);
                  }
                }}
                className={`p-4 sm:px-5 transition-colors cursor-pointer ${
                  isSelected ? 'bg-[#F5F3FF]' : 'bg-white hover:bg-[#FAF9FE]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Price + Structured Key Specs */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <span className="font-mono text-lg sm:text-xl font-bold text-[#0E163B] tabular-nums">
                        ₹{plan.amount}
                      </span>
                      <span className="text-xs font-semibold text-[#5B35E5]">
                        {plan.data}
                      </span>
                      <span className="text-xs text-[#64748B]">
                        · {plan.validity}
                      </span>
                    </div>

                    <div className="text-[11px] font-medium text-[#334155] mt-1">
                      {plan.calls}
                      {plan.sms ? ` · ${plan.sms}` : ''}
                    </div>

                    <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                      {plan.benefits}
                    </p>
                  </div>

                  {/* Select Action Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPlan(plan);
                    }}
                    className={`min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#5B35E5] text-white shadow-xs'
                        : 'border border-[#DDD6FE] bg-[#FAF9FE] text-[#5B35E5] hover:bg-[#5B35E5] hover:text-white'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <i className="fa-solid fa-check mr-1" aria-hidden="true" />
                        Selected
                      </>
                    ) : (
                      'Select'
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
