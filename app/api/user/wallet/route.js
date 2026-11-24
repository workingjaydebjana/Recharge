import { NextResponse } from 'next/server';
import { ensureAllCommissionRules, getDb } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';
import { ensureWallet } from '@/lib/wallet.js';

export async function GET(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = await getDb();
  const wallet = await ensureWallet(auth.user._id);
  const ledger = await db
    .collection('wallet_ledger')
    .find({ userId: auth.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  const deposits = await db
    .collection('deposits')
    .find({ userId: auth.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  const commissionHistory = ledger.filter((l) => l.balanceType === 'COMMISSION');
  const totalCommissionEarned = commissionHistory
    .filter((l) => l.direction === 'CREDIT')
    .reduce((sum, l) => sum + Number(l.amount || 0), 0);

  const settings = await db.collection('settings').findOne({ _id: 'platform_settings' });
  const commissions = await ensureAllCommissionRules(db);

  return NextResponse.json({
    ok: true,
    wallet,
    ledger,
    deposits,
    commissionSummary: {
      totalEarned: Math.round(totalCommissionEarned * 100) / 100,
      available: wallet.commissionBalance,
      minTransfer: settings?.minCommissionTransfer ?? 50,
    },
    commissions,
    settings,
  });
}
