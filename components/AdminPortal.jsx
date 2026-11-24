'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  apiRequest,
  clearAdminToken,
  readAdminToken,
  saveAdminToken,
} from '@/lib/api-client.js';
import AdminAuthView from '@/components/admin/AdminAuthView.jsx';
import AdminOverviewAndReports from '@/components/admin/AdminOverviewAndReports.jsx';
import AdminUsersAndWallets from '@/components/admin/AdminUsersAndWallets.jsx';
import AdminDepositsAndCommissions from '@/components/admin/AdminDepositsAndCommissions.jsx';
import AdminTransactionsAndProviders from '@/components/admin/AdminTransactionsAndProviders.jsx';
import AdminRedeemComplaintsSettings from '@/components/admin/AdminRedeemComplaintsSettings.jsx';

const ADMIN_NAV = [
  { key: 'DASHBOARD', label: 'Dashboard', icon: 'fa-solid fa-gauge-high' },
  { key: 'USERS', label: 'User Management', icon: 'fa-solid fa-users' },
  { key: 'WALLETS', label: 'Wallet & Ledger', icon: 'fa-solid fa-wallet' },
  { key: 'DEPOSITS', label: 'Deposit Management', icon: 'fa-solid fa-money-bill-transfer' },
  { key: 'COMMISSIONS', label: 'Commission Rates', icon: 'fa-solid fa-percent' },
  { key: 'PROVIDERS', label: 'Recharge APIs', icon: 'fa-solid fa-plug' },
  { key: 'TRANSACTIONS', label: 'Transactions', icon: 'fa-solid fa-list-check' },
  { key: 'COMPLAINTS', label: 'Complaints', icon: 'fa-solid fa-headset' },
  { key: 'REPORTS', label: 'Reports & CSV', icon: 'fa-solid fa-chart-line' },
  { key: 'SETTINGS', label: 'Platform Settings', icon: 'fa-solid fa-sliders' },
];

export default function AdminPortal() {
  const [adminSession, setAdminSession] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overview, setOverview] = useState(null);

  const adminToken = adminSession?.token || '';
  const hasAdminSession = Boolean(adminSession);

  useEffect(() => {
    let cancelled = false;
    const savedToken = readAdminToken();
    apiRequest('/api/admin/auth/me', { token: savedToken })
      .then((data) => {
        if (!cancelled && data?.ok && data?.admin) {
          setAdminSession({ token: savedToken, admin: data.admin });
        }
      })
      .catch(() => {
        if (!cancelled && savedToken) {
          clearAdminToken();
        }
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOverview = useCallback(
    async (from = '', to = '') => {
      if (!hasAdminSession) return;
      try {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const query = params.toString() ? `?${params.toString()}` : '';
        const data = await apiRequest(`/api/admin/overview${query}`, { token: adminToken });
        setOverview(data);
      } catch (err) {
        if (err.status === 401) {
          clearAdminToken();
          setAdminSession(null);
        }
      }
    },
    [adminToken, hasAdminSession]
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    if (!hasAdminSession) return undefined;
    let cancelled = false;
    apiRequest('/api/admin/overview', { token: adminToken })
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((err) => {
        if (!cancelled && err.status === 401) {
          clearAdminToken();
          setAdminSession(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adminToken, hasAdminSession]);

  async function handleLogout() {
    await apiRequest('/api/auth/logout', { method: 'POST', token: adminSession?.token || '' }).catch(() => {});
    clearAdminToken();
    setAdminSession(null);
    setOverview(null);
  }

  if (restoring) {
    return (
      <div className="min-h-screen bg-[#F7F7FC] flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 rounded-2xl navy-surface text-white flex items-center justify-center shadow-sm">
          <i className="fa-solid fa-shield-halved text-[#C4B5FD] text-lg" aria-hidden="true" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#475569]">
          <i className="fa-solid fa-spinner fa-spin text-[#5B35E5]" aria-hidden="true" />
          <span>Verifying Super Admin session...</span>
        </div>
      </div>
    );
  }

  if (!adminSession) {
    return (
      <AdminAuthView
        onAdminAuthenticated={(payload) => {
          if (payload?.token) saveAdminToken(payload.token);
          setAdminSession(payload);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7FC] flex flex-col">
      <header className="sticky top-0 z-30 h-14 sm:h-16 navy-surface text-white px-3.5 lg:px-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open admin navigation"
            className="lg:hidden w-9 h-9 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white cursor-pointer shrink-0"
          >
            <i className="fa-solid fa-bars text-sm" aria-hidden="true" />
          </button>
          <span className="font-display font-bold text-sm sm:text-base tracking-tight flex items-center gap-2 whitespace-nowrap truncate">
            <i className="fa-solid fa-shield-halved text-[#C4B5FD]" aria-hidden="true" />
            <span>Quick Recharge Admin</span>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0">
          <span className="hidden md:inline text-[#CBD5E1]">{adminSession.admin?.email}</span>
          <Link
            href="/"
            className="px-2.5 sm:px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold whitespace-nowrap"
          >
            User Portal
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="px-2.5 sm:px-3 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-semibold whitespace-nowrap cursor-pointer"
          >
            <i className="fa-solid fa-right-from-bracket sm:mr-1.5" aria-hidden="true" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex relative">
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-[#0E163B]/55 backdrop-blur-[2px] z-50 lg:hidden"
            aria-hidden="true"
          />
        )}

        <aside
          aria-label="Super Admin navigation"
          className={`fixed inset-y-0 left-0 z-[60] w-[280px] max-w-[84vw] bg-white rounded-r-3xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-250 ease-out lg:sticky lg:top-16 lg:z-20 lg:h-[calc(100vh-4rem)] lg:w-64 lg:max-w-none lg:rounded-none lg:shadow-none lg:border-r lg:border-[#EAE7F5] ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Mobile Drawer Header */}
          <div className="lg:hidden navy-surface text-white px-4 py-4 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-shield-halved text-[#C4B5FD] text-sm" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="font-display font-bold text-sm truncate">Super Admin</div>
                <div className="text-[11px] text-[#CBD5E1] truncate">{adminSession.admin?.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close admin navigation"
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0"
            >
              <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {ADMIN_NAV.map((item) => {
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#0E163B] text-white shadow-xs'
                      : 'text-[#334155] hover:bg-[#F5F3FF] hover:text-[#0E163B]'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      active ? 'bg-white/15 text-[#C4B5FD]' : 'bg-[#F5F3FF] text-[#5B35E5]'
                    }`}
                  >
                    <i className={`${item.icon} text-[11px]`} aria-hidden="true" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-3 border-t border-[#EAE7F5] bg-[#FAF9FE] text-[11px] text-[#64748B] shrink-0">
            <div className="font-semibold text-[#0E163B]">Quick Recharge Console</div>
            <div className="mt-0.5">Role: Sole Super Admin</div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <div key={activeTab}>
            {(activeTab === 'DASHBOARD' || activeTab === 'REPORTS') && (
              <AdminOverviewAndReports
                token={adminSession.token}
                overview={overview}
                mode={activeTab}
                onDateFilterChange={loadOverview}
                onNavigate={setActiveTab}
              />
            )}

            {(activeTab === 'USERS' || activeTab === 'WALLETS') && (
              <AdminUsersAndWallets
                token={adminSession.token}
                mode={activeTab}
                onDataMutated={loadOverview}
              />
            )}

            {(activeTab === 'DEPOSITS' || activeTab === 'COMMISSIONS') && (
              <AdminDepositsAndCommissions
                token={adminSession.token}
                mode={activeTab}
                onDataMutated={loadOverview}
              />
            )}

            {(activeTab === 'TRANSACTIONS' || activeTab === 'PROVIDERS') && (
              <AdminTransactionsAndProviders
                token={adminSession.token}
                mode={activeTab}
                onDataMutated={loadOverview}
              />
            )}

            {(activeTab === 'COMPLAINTS' || activeTab === 'SETTINGS') && (
              <AdminRedeemComplaintsSettings
                token={adminSession.token}
                mode={activeTab}
                onDataMutated={loadOverview}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
