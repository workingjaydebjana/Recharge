'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { formatINR } from '@/lib/finance.js';
import {
  apiRequest,
  clearUserToken,
  readUserToken,
  saveUserToken,
} from '@/lib/api-client.js';
import { BrandLogo, formatDateTime } from '@/components/SharedUI.jsx';
import AuthPortal from '@/components/AuthPortal.jsx';
import AddBalanceModal from '@/components/user/AddBalanceModal.jsx';

const PortalContext = createContext(null);

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) {
    throw new Error('usePortal must be used within PortalShell');
  }
  return ctx;
}

const SIDEBAR_ITEMS = [
  { href: '/', label: 'Dashboard', icon: 'fa-solid fa-house' },
  { href: '/mobile-recharge', label: 'Mobile Recharge', icon: 'fa-solid fa-mobile-screen-button' },
  { href: '/dth-recharge', label: 'DTH Recharge', icon: 'fa-solid fa-satellite-dish' },
  { href: '/electricity-bill', label: 'Electricity Bill', icon: 'fa-solid fa-bolt-lightning' },
  { href: '/redeem-code', label: 'Redeem Code', icon: 'fa-solid fa-gift' },
  { href: '/wallet', label: 'My Wallet', icon: 'fa-solid fa-wallet' },
  { href: '/commission', label: 'My Commission', icon: 'fa-solid fa-percent' },
  { href: '/transactions', label: 'Transaction History', icon: 'fa-solid fa-clock-rotate-left' },
  { href: '/complaints', label: 'Complaints & Support', icon: 'fa-solid fa-headset' },
  { href: '/profile', label: 'My Profile', icon: 'fa-solid fa-user' },
];

const MOBILE_BOTTOM_NAV = [
  { href: '/', label: 'Home', icon: 'fa-solid fa-house' },
  { href: '/mobile-recharge', label: 'Mobile', icon: 'fa-solid fa-mobile-screen-button' },
  { href: '/dth-recharge', label: 'DTH', icon: 'fa-solid fa-satellite-dish' },
  { href: '/wallet', label: 'Wallet', icon: 'fa-solid fa-wallet' },
  { href: '/transactions', label: 'History', icon: 'fa-solid fa-clock-rotate-left' },
];

const PREFETCH_ROUTES = [
  '/',
  '/mobile-recharge',
  '/dth-recharge',
  '/electricity-bill',
  '/wallet',
  '/commission',
  '/transactions',
  '/profile',
  '/redeem-code',
  '/complaints',
];

const ROUTE_LABELS = {
  '/': 'Dashboard',
  '/mobile-recharge': 'Mobile Recharge',
  '/dth-recharge': 'DTH Recharge',
  '/electricity-bill': 'Electricity Bill',
  '/redeem-code': 'Redeem Code',
  '/wallet': 'My Wallet',
  '/commission': 'My Commission',
  '/transactions': 'Transaction History',
  '/complaints': 'Complaints & Support',
  '/profile': 'My Profile',
  '/admin': 'Super Admin Panel',
};

function isRouteActive(currentPath, href) {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function PortalShell({ children }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const navTimeoutRef = useRef(null);

  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [meData, setMeData] = useState({
    user: null,
    wallet: null,
    unreadNotifications: 0,
    recentTransactions: [],
    summary: { total: 0, successful: 0, pending: 0, failed: 0 },
    commissions: [],
    settings: null,
    adminContact: null,
    impersonatedByAdmin: false,
    providerStatus: { mobileLive: false, dthLive: false },
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [addBalanceOpen, setAddBalanceOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Derived instant route-transition state (clears automatically when pathname arrives)
  const [navState, setNavState] = useState(null);
  const isNavigating = Boolean(navState && navState.from === pathname && navState.target !== pathname);
  const activeVisualPath = isNavigating ? navState.target : pathname;
  const targetLabel = isNavigating ? ROUTE_LABELS[navState.target] || 'Page' : '';

  const startNavigation = useCallback(
    (targetPath) => {
      if (!targetPath || targetPath === pathname) return;
      setNavState({ from: pathname, target: targetPath });
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = setTimeout(() => {
        setNavState((prev) => (prev && prev.target === targetPath ? null : prev));
      }, 10000);
    },
    [pathname]
  );

  // Clean up safety timer on unmount
  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
  }, []);

  // Reset scroll cleanly on route change so no page inherits scroll from another route
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [pathname]);

  // Background staggered route prefetching right after login so every tab opens fast
  const isAuthenticated = Boolean(session);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const timers = [];
    const routesToWarm = PREFETCH_ROUTES.filter((r) => r !== pathname);
    routesToWarm.forEach((route, idx) => {
      const id = setTimeout(() => {
        try {
          router.prefetch(route);
        } catch {
          // Ignore prefetch errors
        }
      }, 250 + idx * 180);
      timers.push(id);
    });
    return () => {
      timers.forEach((id) => clearTimeout(id));
    };
  }, [isAuthenticated, pathname, router]);

  // Lock background scroll & support Escape key when mobile drawer is open
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
      const onKeyDown = (e) => {
        if (e.key === 'Escape') setSidebarOpen(false);
      };
      window.addEventListener('keydown', onKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', onKeyDown);
      };
    }
    document.body.style.overflow = '';
    return undefined;
  }, [sidebarOpen]);

  // Restore server-verified user session once on mount (HttpOnly cookie + localStorage fallback)
  useEffect(() => {
    let cancelled = false;
    const savedToken = readUserToken();

    apiRequest('/api/auth/me', { token: savedToken })
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && data?.user) {
          setSession({ token: savedToken, user: data.user, wallet: data.wallet });
          setMeData(data);
        }
      })
      .catch(() => {
        if (!cancelled && savedToken) {
          clearUserToken();
        }
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const closeMenus = useCallback(() => {
    setSidebarOpen(false);
    setNotifOpen(false);
    setProfileMenuOpen(false);
  }, []);

  // Capture ANY internal <Link> click anywhere in the portal for instant 0ms loading feedback
  const handleGlobalLinkClickCapture = useCallback(
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = e.target?.closest?.('a[href]');
      if (!anchor) return;
      if (anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      const rawHref = anchor.getAttribute('href') || '';
      if (!rawHref.startsWith('/') || rawHref.startsWith('//')) return;

      const cleanTarget = rawHref.split('?')[0].split('#')[0] || '/';
      if (cleanTarget !== pathname) {
        closeMenus();
        startNavigation(cleanTarget);
      }
    },
    [pathname, closeMenus, startNavigation]
  );

  const handleLogout = useCallback(() => {
    clearUserToken();
    setSession(null);
    setSidebarOpen(false);
    setNotifOpen(false);
    setProfileMenuOpen(false);
    setNavState(null);
  }, []);

  const sessionToken = session?.token || '';

  const handleSignOut = useCallback(async () => {
    closeMenus();
    await apiRequest('/api/auth/logout', { method: 'POST', token: sessionToken }).catch(() => {});
    handleLogout();
  }, [closeMenus, sessionToken, handleLogout]);

  const refreshMe = useCallback(async () => {
    const activeToken = sessionToken || readUserToken();
    try {
      const data = await apiRequest('/api/auth/me', { token: activeToken });
      setMeData(data);
      setSession((prev) =>
        prev
          ? { ...prev, user: data.user, wallet: data.wallet }
          : { token: activeToken, user: data.user, wallet: data.wallet }
      );
    } catch (err) {
      if (err.status === 401) {
        handleLogout();
      }
    }
  }, [sessionToken, handleLogout]);

  // Re-verify account status whenever user navigates between routes or returns to tab
  const lastVerifiedPathRef = useRef(pathname);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    const activeToken = sessionToken || readUserToken();

    const syncStatus = () => {
      apiRequest('/api/auth/me', { token: activeToken })
        .then((data) => {
          if (cancelled || !data?.ok || !data?.user) return;
          setMeData(data);
          setSession((prev) =>
            prev
              ? { ...prev, user: data.user, wallet: data.wallet }
              : { token: activeToken, user: data.user, wallet: data.wallet }
          );
        })
        .catch((err) => {
          if (!cancelled && err?.status === 401) {
            handleLogout();
          }
        });
    };

    if (lastVerifiedPathRef.current !== pathname) {
      lastVerifiedPathRef.current = pathname;
      syncStatus();
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, pathname, sessionToken, handleLogout]);

  const handleAuthenticated = useCallback(async (authPayload) => {
    if (authPayload?.token) {
      saveUserToken(authPayload.token);
    }
    setSession(authPayload);
    setMeData((prev) => ({
      ...prev,
      user: authPayload.user,
      wallet: authPayload.wallet,
    }));
    try {
      const fullData = await apiRequest('/api/auth/me', { token: authPayload.token });
      setMeData(fullData);
    } catch {
      // Initial auth payload is already set
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiRequest('/api/user/notifications', { token: sessionToken });
      setNotifications(data.notifications || []);
    } catch {
      // Ignore transient errors
    }
  }, [sessionToken]);

  async function handleToggleNotifications() {
    const next = !notifOpen;
    setNotifOpen(next);
    setProfileMenuOpen(false);
    if (next) {
      await loadNotifications();
    }
  }

  async function handleMarkAllRead() {
    await apiRequest('/api/user/notifications', { method: 'PATCH', token: sessionToken, body: {} });
    await loadNotifications();
    await refreshMe();
  }

  const updateUser = useCallback((updatedUser) => {
    setMeData((prev) => ({ ...prev, user: updatedUser }));
    setSession((prev) => (prev ? { ...prev, user: updatedUser } : prev));
  }, []);

  const raiseComplaint = useCallback(
    (tx) => {
      closeMenus();
      startNavigation('/complaints');
      if (!tx?._id) {
        router.push('/complaints');
        return;
      }
      const params = new URLSearchParams();
      params.set('ref', tx._id);
      if (tx.type) params.set('type', tx.type);
      if (tx.operatorName) params.set('op', tx.operatorName);
      router.push(`/complaints?${params.toString()}`);
    },
    [closeMenus, startNavigation, router]
  );

  const openAddBalance = useCallback(() => {
    setAddBalanceOpen(true);
  }, []);

  const contextValue = useMemo(
    () => ({
      session,
      token: sessionToken,
      meData,
      refreshMe,
      openAddBalance,
      raiseComplaint,
      updateUser,
      signOut: handleSignOut,
    }),
    [session, sessionToken, meData, refreshMe, openAddBalance, raiseComplaint, updateUser, handleSignOut]
  );

  if (restoring) {
    return (
      <div className="min-h-screen bg-[#F7F7FC] flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 rounded-2xl navy-surface text-white flex items-center justify-center shadow-sm">
          <i className="fa-solid fa-bolt text-[#C4B5FD] text-lg" aria-hidden="true" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#475569]">
          <i className="fa-solid fa-spinner fa-spin text-[#5B35E5]" aria-hidden="true" />
          <span>Loading Quick Recharge...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthPortal onAuthenticated={handleAuthenticated} />;
  }

  const platformName = meData.settings?.platformName || meData.adminContact?.platformName || 'Quick Recharge';
  const currentUser = meData.user || session.user;
  const isSuspended = currentUser?.status === 'SUSPENDED';

  if (isSuspended) {
    const adminName = meData.adminContact?.adminName || 'Super Administrator';
    const supportEmail = meData.adminContact?.supportEmail || meData.settings?.supportEmail || 'support@quickrecharge.in';
    const supportPhone = meData.adminContact?.supportPhone || meData.settings?.supportPhone || '+91 1800-000-0000';
    const supportHours = meData.adminContact?.supportHours || meData.settings?.supportHours || 'Mon–Sat, 9:00 AM – 8:00 PM IST';

    const handleCheckSuspensionStatus = async () => {
      setCheckingStatus(true);
      await refreshMe();
      setCheckingStatus(false);
    };

    return (
      <div className="min-h-screen bg-[#F7F7FC] flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#FECACA] shadow-xl overflow-hidden">
          {/* Top Warning Banner */}
          <div className="bg-gradient-to-br from-[#0E163B] via-[#1B224F] to-[#7F1D1D] px-6 py-7 text-center text-white">
            <div className="w-16 h-16 rounded-2xl bg-[#DC2626]/20 border border-[#FCA5A5]/40 text-[#FCA5A5] flex items-center justify-center mx-auto shadow-inner">
              <i className="fa-solid fa-ban text-2xl" aria-hidden="true" />
            </div>
            <span className="inline-flex items-center gap-1.5 mt-4 px-3 py-1 rounded-full bg-[#DC2626]/25 border border-[#FCA5A5]/30 text-[11px] font-semibold uppercase tracking-wider text-[#FECACA]">
              <i className="fa-solid fa-lock text-[10px]" aria-hidden="true" />
              <span>Access Restricted</span>
            </span>
            <h1 className="font-display text-xl sm:text-2xl font-bold mt-3 tracking-tight">
              Your Account Has Been Suspended
            </h1>
            <p className="text-xs sm:text-sm text-[#E2E8F0] mt-2 leading-relaxed">
              Your {platformName} account is currently suspended by the administrator. You cannot open any portal pages or perform transactions until it is reactivated.
            </p>
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            {/* Suspended Account Details */}
            <div className="rounded-2xl bg-[#FAF9FE] border border-[#EAE7F5] p-3.5 text-xs space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Account Information
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#64748B]">Account Holder</span>
                <span className="font-semibold text-[#0E163B] truncate">{currentUser?.fullName || 'Retailer'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#64748B]">Account ID / Mobile</span>
                <span className="font-mono font-semibold text-[#0E163B]">
                  {currentUser?.accountId || currentUser?.mobile || '—'}
                </span>
              </div>
              {currentUser?.email && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B]">Email</span>
                  <span className="font-mono text-[11px] text-[#334155] truncate">{currentUser.email}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#EAE7F5]">
                <span className="text-[#64748B]">Account Status</span>
                <span className="inline-flex items-center gap-1 font-bold text-[#DC2626]">
                  <i className="fa-solid fa-circle-xmark text-[11px]" aria-hidden="true" />
                  <span>SUSPENDED</span>
                </span>
              </div>
            </div>

            {/* Administrator Contact Details */}
            <div className="rounded-2xl bg-[#F5F3FF] border border-[#DDD6FE] p-4 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-[#4C28D4] font-bold">
                <i className="fa-solid fa-shield-halved text-sm" aria-hidden="true" />
                <span>Administrator Contact Details</span>
              </div>
              <p className="text-[11px] text-[#475569] leading-relaxed">
                Please contact the Super Admin with your Account ID to review and reactivate your account.
              </p>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B] flex items-center gap-1.5">
                    <i className="fa-solid fa-user-shield text-[#5B35E5] w-3.5" aria-hidden="true" />
                    <span>Admin</span>
                  </span>
                  <span className="font-semibold text-[#0E163B]">{adminName}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B] flex items-center gap-1.5">
                    <i className="fa-solid fa-phone text-[#5B35E5] w-3.5" aria-hidden="true" />
                    <span>Phone</span>
                  </span>
                  <a
                    href={`tel:${String(supportPhone).replace(/\s+/g, '')}`}
                    className="font-mono font-bold text-[#5B35E5] hover:underline"
                  >
                    {supportPhone}
                  </a>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B] flex items-center gap-1.5">
                    <i className="fa-solid fa-envelope text-[#5B35E5] w-3.5" aria-hidden="true" />
                    <span>Email</span>
                  </span>
                  <a
                    href={`mailto:${supportEmail}`}
                    className="font-mono font-semibold text-[#5B35E5] hover:underline truncate max-w-[200px]"
                  >
                    {supportEmail}
                  </a>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#64748B] flex items-center gap-1.5">
                    <i className="fa-solid fa-clock text-[#5B35E5] w-3.5" aria-hidden="true" />
                    <span>Hours</span>
                  </span>
                  <span className="text-[#334155] font-medium text-right">{supportHours}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleCheckSuspensionStatus}
                disabled={checkingStatus}
                className="h-11 rounded-xl bg-[#5B35E5] hover:bg-[#4C28D4] disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <i
                  className={`fa-solid ${checkingStatus ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`}
                  aria-hidden="true"
                />
                <span>{checkingStatus ? 'Checking...' : 'Refresh Status'}</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="h-11 rounded-xl border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>

            {meData.impersonatedByAdmin && (
              <Link
                href="/admin"
                className="w-full h-10 rounded-xl navy-surface text-white text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
              >
                <i className="fa-solid fa-shield-halved text-[#C4B5FD]" aria-hidden="true" />
                <span>Return to Super Admin Panel</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <PortalContext.Provider value={contextValue}>
      <div
        onClickCapture={handleGlobalLinkClickCapture}
        className="min-h-screen bg-[#F7F7FC] flex flex-col overflow-x-clip"
      >
        {/* Instant Top Route-Transition Progress Bar */}
        {isNavigating && (
          <div
            role="progressbar"
            aria-label={`Loading ${targetLabel}`}
            className="fixed top-0 inset-x-0 z-[80] h-[3px] bg-[#EDE9FE] overflow-hidden pointer-events-none"
          >
            <div className="h-full w-2/3 bg-gradient-to-r from-[#5B35E5] via-[#7C3AED] to-[#A78BFA] route-progress-bar" />
          </div>
        )}

        {/* Admin Impersonation Session Banner */}
        {meData.impersonatedByAdmin && (
          <div className="bg-[#0E163B] text-white px-3 sm:px-6 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <i className="fa-solid fa-user-shield text-[#C4B5FD] shrink-0" aria-hidden="true" />
              <span className="truncate">
                Logged in via Super Admin as{' '}
                <strong className="font-semibold text-white">{currentUser?.fullName}</strong> (
                <span className="font-mono text-[#CBD5E1]">{currentUser?.mobile}</span>)
              </span>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#5B35E5] hover:bg-[#4C28D4] text-white text-[11px] font-semibold shrink-0 transition-colors"
            >
              <i className="fa-solid fa-arrow-left text-[10px]" aria-hidden="true" />
              <span>Back to Admin</span>
            </Link>
          </div>
        )}

        {/* Compact, Non-Overflowing Top Navigation Bar */}
        <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white/95 backdrop-blur border-b border-[#EAE7F5] px-2.5 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 my-auto">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[#EAE7F5] flex items-center justify-center text-[#0E163B] hover:bg-[#F5F3FF] cursor-pointer shrink-0 my-auto"
            >
              <i className="fa-solid fa-bars text-sm" aria-hidden="true" />
            </button>
            <Link
              href="/"
              onClick={closeMenus}
              className="min-w-0 flex items-center"
              aria-label="Go to Dashboard"
            >
              <BrandLogo platformName={platformName} />
            </Link>
          </div>

          {/* Right Utility Cluster: Wallet Balance + Notifications + Compact Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 my-auto">
            <Link
              href="/wallet"
              onClick={closeMenus}
              className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-[#F5F3FF] border border-[#DDD6FE] text-[#0E163B] hover:bg-[#EDE9FE] transition-colors"
            >
              <i className="fa-solid fa-wallet text-[#5B35E5] text-[11px] sm:text-xs" aria-hidden="true" />
              <span className="hidden sm:inline text-xs text-[#64748B]">Balance:</span>
              <span className="font-mono text-xs sm:text-sm font-bold tabular-nums">
                {formatINR(meData.wallet?.currentBalance || 0)}
              </span>
            </Link>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={handleToggleNotifications}
                aria-label="Notifications"
                className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[#EAE7F5] flex items-center justify-center text-[#334155] hover:bg-[#F5F3FF] cursor-pointer"
              >
                <i className="fa-solid fa-bell text-xs sm:text-sm" aria-hidden="true" />
                {meData.unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#DC2626] text-white font-mono text-[10px] font-bold flex items-center justify-center">
                    {meData.unreadNotifications}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 bg-white rounded-2xl border border-[#EAE7F5] shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#EAE7F5] flex items-center justify-between">
                    <span className="font-display font-bold text-xs text-[#0E163B]">Notifications</span>
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[11px] font-semibold text-[#5B35E5] hover:underline cursor-pointer"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#F1EEF9]">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#64748B]">No notifications yet.</div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n._id} className={`p-3.5 text-xs ${n.isRead ? 'bg-white' : 'bg-[#FAF9FE]'}`}>
                          <div className="font-semibold text-[#0E163B]">{n.title}</div>
                          <p className="text-[#475569] mt-0.5 leading-relaxed">{n.message}</p>
                          <div className="text-[10px] text-[#94A3B8] mt-1">{formatDateTime(n.createdAt)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((v) => !v);
                  setNotifOpen(false);
                }}
                aria-label="Account profile menu"
                className="w-9 h-9 sm:w-auto sm:h-10 sm:px-2.5 rounded-xl border border-[#EAE7F5] hover:bg-[#F5F3FF] flex items-center justify-center sm:gap-2 text-xs font-semibold text-[#0E163B] cursor-pointer"
              >
                <span className="w-7 h-7 rounded-lg navy-surface text-white flex items-center justify-center text-[11px]">
                  <i className="fa-solid fa-user" aria-hidden="true" />
                </span>
                <span className="hidden md:inline max-w-[110px] truncate">{meData.user?.fullName}</span>
                <span className="hidden sm:inline-flex items-center text-[10px] text-[#64748B]">
                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                </span>
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-[#EAE7F5] shadow-xl z-40 p-2 text-xs">
                  <div className="px-3 py-2 border-b border-[#F1EEF9] mb-1">
                    <div className="font-bold text-[#0E163B] truncate">{meData.user?.fullName}</div>
                    <div className="font-mono text-[11px] text-[#64748B]">ID: {meData.user?.accountId || meData.user?.mobile}</div>
                  </div>
                  <Link
                    href="/profile"
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F5F3FF] text-[#334155] font-medium flex items-center gap-2"
                  >
                    <i className="fa-solid fa-user-gear w-4 text-[#5B35E5]" aria-hidden="true" />
                    <span>My Profile &amp; Security</span>
                  </Link>
                  <Link
                    href="/complaints"
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F5F3FF] text-[#334155] font-medium flex items-center gap-2"
                  >
                    <i className="fa-solid fa-headset w-4 text-[#5B35E5]" aria-hidden="true" />
                    <span>Support &amp; Complaints</span>
                  </Link>
                  <Link
                    href="/admin"
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F5F3FF] text-[#334155] font-medium flex items-center gap-2"
                  >
                    <i className="fa-solid fa-shield-halved w-4 text-[#5B35E5]" aria-hidden="true" />
                    <span>Super Admin Panel</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#FEF2F2] text-[#DC2626] font-semibold flex items-center gap-2 mt-1 border-t border-[#F1EEF9] pt-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-right-from-bracket w-4" aria-hidden="true" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 flex relative">
          {/* Full-Screen Mobile Drawer Backdrop */}
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-[#0E163B]/55 backdrop-blur-[2px] z-50 lg:hidden transition-opacity"
              aria-hidden="true"
            />
          )}

          {/* Full-Height Mobile Fintech Drawer / Sticky Desktop Sidebar */}
          <aside
            aria-label="Primary user navigation"
            className={`fixed inset-y-0 left-0 z-[60] w-[288px] max-w-[84vw] bg-white rounded-r-3xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-250 ease-out lg:sticky lg:top-16 lg:z-20 lg:h-[calc(100vh-4rem)] lg:w-64 lg:max-w-none lg:rounded-none lg:shadow-none lg:border-r lg:border-[#EAE7F5] ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
            }`}
          >
            {/* Mobile Drawer Navy Identity & Balance Header */}
            <div className="lg:hidden navy-surface text-white px-4 pt-4 pb-4 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Link href="/" onClick={closeMenus} className="flex items-center">
                    <BrandLogo platformName={platformName} />
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close navigation menu"
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                >
                  <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-[#5B35E5] text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
                  {String(meData.user?.fullName || 'R').charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-white truncate">
                    {meData.user?.fullName || 'Retailer'}
                  </div>
                  <div className="font-mono text-[11px] text-[#CBD5E1] truncate">
                    ID: {meData.user?.accountId || meData.user?.mobile || '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3.5">
                <Link
                  href="/wallet"
                  onClick={closeMenus}
                  className="text-left rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-2.5 py-2 transition-colors"
                >
                  <div className="text-[10px] uppercase tracking-wider text-[#CBD5E1]">Current</div>
                  <div className="font-mono font-bold text-xs text-white tabular-nums mt-0.5 truncate">
                    {formatINR(meData.wallet?.currentBalance || 0)}
                  </div>
                </Link>
                <Link
                  href="/commission"
                  onClick={closeMenus}
                  className="text-left rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-2.5 py-2 transition-colors"
                >
                  <div className="text-[10px] uppercase tracking-wider text-[#CBD5E1]">Commission</div>
                  <div className="font-mono font-bold text-xs text-[#86EFAC] tabular-nums mt-0.5 truncate">
                    {formatINR(meData.wallet?.commissionBalance || 0)}
                  </div>
                </Link>
              </div>
            </div>

            {/* Clean Continuous Navigation — Real Next.js Links with Instant Loading Indicator */}
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {SIDEBAR_ITEMS.map((item) => {
                const active = isRouteActive(activeVisualPath, item.href);
                const itemLoading = isNavigating && isRouteActive(navState.target, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenus}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] font-semibold transition-all whitespace-nowrap ${
                      active
                        ? 'bg-[#5B35E5] text-white shadow-sm'
                        : 'text-[#334155] hover:bg-[#F5F3FF] hover:text-[#0E163B]'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-[#F5F3FF] text-[#5B35E5]'
                      }`}
                    >
                      <i
                        className={`${itemLoading ? 'fa-solid fa-spinner fa-spin' : item.icon} text-xs`}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {active && !itemLoading && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" aria-hidden="true" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Compact Sidebar Footer */}
            <div className="p-3 border-t border-[#EAE7F5] bg-[#FAF9FE] space-y-2 shrink-0 text-xs">
              <div className="hidden lg:flex items-center justify-between rounded-xl bg-white border border-[#EAE7F5] px-3 py-2.5">
                <div>
                  <div className="text-[11px] text-[#64748B]">Commission</div>
                  <div className="font-mono font-bold text-sm text-[#15803D] tabular-nums">
                    {formatINR(meData.wallet?.commissionBalance || 0)}
                  </div>
                </div>
                <Link
                  href="/commission"
                  onClick={closeMenus}
                  className="text-[11px] font-semibold text-[#5B35E5] hover:underline"
                >
                  Transfer
                </Link>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] font-semibold hover:bg-[#FEE2E2] transition-colors cursor-pointer"
              >
                <i className="fa-solid fa-right-from-bracket text-xs" aria-hidden="true" />
                <span>Logout</span>
              </button>
            </div>
          </aside>

          {/* Main Content Viewport with Instant Loading Overlay during Route Change */}
          <main className="relative flex-1 min-w-0 px-3.5 pt-4 pb-24 sm:px-6 sm:pt-6 lg:p-8 max-w-6xl mx-auto w-full">
            <div className={`transition-opacity duration-150 ${isNavigating ? 'opacity-45 pointer-events-none select-none' : 'opacity-100'}`}>
              {children}
            </div>

            {isNavigating && (
              <div
                aria-live="polite"
                className="fixed inset-x-0 top-16 bottom-20 lg:left-64 lg:bottom-0 z-20 flex items-center justify-center pointer-events-none px-4"
              >
                <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur border border-[#DDD6FE] shadow-lg text-xs sm:text-sm font-semibold text-[#0E163B]">
                  <span className="w-7 h-7 rounded-xl bg-[#F5F3FF] text-[#5B35E5] flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden="true" />
                  </span>
                  <span>Opening {targetLabel}...</span>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Native Fintech-Style Floating Bottom Navigation Bar (Mobile & Tablet) */}
        <nav
          aria-label="Quick mobile navigation"
          className="fixed bottom-3 inset-x-3 z-30 lg:hidden navy-surface rounded-2xl p-1.5 shadow-xl border border-white/10"
        >
          <div className="grid grid-cols-5 gap-1">
            {MOBILE_BOTTOM_NAV.map((item) => {
              const active = isRouteActive(activeVisualPath, item.href);
              const itemLoading = isNavigating && isRouteActive(navState.target, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenus}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-colors ${
                    active
                      ? 'bg-[#5B35E5] text-white shadow-sm'
                      : 'text-[#CBD5E1] hover:text-white'
                  }`}
                >
                  <i
                    className={`${itemLoading ? 'fa-solid fa-spinner fa-spin' : item.icon} text-sm`}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] font-semibold mt-1 leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Clean Add Balance Modal */}
        <AddBalanceModal
          isOpen={addBalanceOpen}
          onClose={() => setAddBalanceOpen(false)}
          token={sessionToken}
          currentBalance={meData.wallet?.currentBalance || 0}
          onSuccessRefresh={refreshMe}
        />
      </div>
    </PortalContext.Provider>
  );
}
