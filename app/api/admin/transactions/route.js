import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';
import { reconcilePendingTransaction } from '@/lib/reconcile.js';
import { cleanString } from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const type = cleanString(searchParams.get('type') || '', 30).toUpperCase();
  const status = cleanString(searchParams.get('status') || '', 20).toUpperCase();
  const search = cleanString(searchParams.get('search') || '', 80).toLowerCase();

  const filter = {};
  if (['MOBILE_RECHARGE', 'DTH_RECHARGE', 'REDEEM_CODE'].includes(type)) filter.type = type;
  if (['PROCESSING', 'PENDING', 'SUCCESSFUL', 'FAILED'].includes(status)) filter.status = status;

  const db = await getDb();
  let transactions = await db.collection('transactions').find(filter).sort({ createdAt: -1 }).limit(300).toArray();

  if (search) {
    transactions = transactions.filter(
      (t) =>
        String(t._id || '').toLowerCase().includes(search) ||
        String(t.targetNumber || '').toLowerCase().includes(search) ||
        String(t.userName || '').toLowerCase().includes(search) ||
        String(t.userMobile || '').toLowerCase().includes(search) ||
        String(t.operatorName || '').toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ ok: true, transactions });
}

export async function PATCH(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const transactionId = cleanString(body.transactionId, 60);
    const newStatus = cleanString(body.newStatus, 20).toUpperCase();
    const operatorRef = cleanString(body.operatorRef, 80);
    const remark = cleanString(body.remark, 250);

    const res = await reconcilePendingTransaction({
      transactionId,
      newStatus,
      operatorRef,
      remark,
      actor: {
        type: 'SUPER_ADMIN',
        id: auth.admin._id,
        email: auth.admin.email,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status || 400 });
    }

    return NextResponse.json({ ok: true, transaction: res.transaction });
  } catch {
    return NextResponse.json({ error: 'Transaction reconciliation failed.' }, { status: 500 });
  }
}
