import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';
import { cleanString } from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const status = cleanString(searchParams.get('status') || '', 20).toUpperCase();

  const filter = {};
  if (['PENDING', 'APPROVED', 'REJECTED'].includes(status)) filter.status = status;

  const db = await getDb();
  const [rawDeposits, users] = await Promise.all([
    db.collection('deposits').find(filter).sort({ createdAt: -1 }).limit(200).toArray(),
    db.collection('users').find({}).toArray(),
  ]);

  const userMap = Object.fromEntries(users.map((u) => [u._id, u]));
  const deposits = rawDeposits.map((dep) => {
    const u = userMap[dep.userId];
    return {
      ...dep,
      userName: dep.userName || u?.fullName || 'User',
      userMobile: dep.userMobile || u?.mobile || u?.accountId || '',
    };
  });

  return NextResponse.json({ ok: true, deposits });
}

export async function PATCH(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json(
    {
      error:
        'Manual deposit approval or rejection is disabled. All deposits are verified and credited automatically by the payment gateway.',
    },
    { status: 403 }
  );
}
