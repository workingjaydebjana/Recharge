import { NextResponse } from 'next/server';
import { ensureAllCommissionRules, getDb } from '@/lib/db.js';
import { requireUser, sanitizeUser } from '@/lib/auth.js';
import { ensureWallet } from '@/lib/wallet.js';

export async function GET(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = await getDb();
  const wallet = await ensureWallet(auth.user._id);
  const settings = await db.collection('settings').findOne({ _id: 'platform_settings' });
  const commissions = await ensureAllCommissionRules(db);
  const unreadNotifications = await db
    .collection('notifications')
    .countDocuments({ userId: auth.user._id, isRead: false });

  const recentTransactions = await db
    .collection('transactions')
    .find({ userId: auth.user._id })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();

  const allUserTx = await db.collection('transactions').find({ userId: auth.user._id }).toArray();
  const summary = {
    total: allUserTx.length,
    successful: allUserTx.filter((t) => t.status === 'SUCCESSFUL').length,
    pending: allUserTx.filter((t) => t.status === 'PENDING' || t.status === 'PROCESSING').length,
    failed: allUserTx.filter((t) => t.status === 'FAILED').length,
  };

  const activeMobileProvider = await db
    .collection('recharge_providers')
    .findOne({ serviceType: 'MOBILE', isActive: true, isConfigured: true, mode: 'LIVE' });
  const activeDthProvider = await db
    .collection('recharge_providers')
    .findOne({ serviceType: 'DTH', isActive: true, isConfigured: true, mode: 'LIVE' });
  const superAdmin = await db
    .collection('admins')
    .findOne({ role: 'SUPER_ADMIN' }, { projection: { fullName: 1, email: 1, mobile: 1 } });

  const adminContact = {
    platformName: settings?.platformName || 'Quick Recharge',
    adminName: superAdmin?.fullName || 'Super Administrator',
    supportEmail: settings?.supportEmail || superAdmin?.email || 'support@quickrecharge.in',
    supportPhone: settings?.supportPhone || superAdmin?.mobile || '+91 1800-000-0000',
    supportHours: settings?.supportHours || 'Mon–Sat, 9:00 AM – 8:00 PM IST',
  };

  return NextResponse.json({
    ok: true,
    user: sanitizeUser(auth.user),
    wallet,
    unreadNotifications,
    recentTransactions,
    summary,
    commissions,
    settings,
    adminContact,
    impersonatedByAdmin: Boolean(auth.session?.meta?.impersonatedByAdmin),
    providerStatus: {
      mobileLive: Boolean(activeMobileProvider),
      dthLive: Boolean(activeDthProvider),
    },
  });
}
