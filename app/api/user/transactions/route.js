import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';
import { cleanString } from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const type = cleanString(searchParams.get('type') || '', 30).toUpperCase();
  const status = cleanString(searchParams.get('status') || '', 30).toUpperCase();
  const search = cleanString(searchParams.get('search') || '', 80).toLowerCase();

  const filter = { userId: auth.user._id };
  if (['MOBILE_RECHARGE', 'DTH_RECHARGE', 'REDEEM_CODE'].includes(type)) {
    filter.type = type;
  }
  if (['SUCCESSFUL', 'PENDING', 'PROCESSING', 'FAILED'].includes(status)) {
    filter.status = status;
  }

  const db = await getDb();
  let transactions = await db
    .collection('transactions')
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  if (search) {
    transactions = transactions.filter(
      (t) =>
        String(t._id || '').toLowerCase().includes(search) ||
        String(t.targetNumber || '').toLowerCase().includes(search) ||
        String(t.operatorName || '').toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ ok: true, transactions });
}
