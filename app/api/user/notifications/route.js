import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';
import { cleanString } from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = await getDb();
  const notifications = await db
    .collection('notifications')
    .find({ userId: auth.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  return NextResponse.json({ ok: true, notifications });
}

export async function PATCH(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const notificationId = cleanString(body.notificationId, 60);
  const db = await getDb();

  if (notificationId) {
    await db.collection('notifications').updateOne(
      { _id: notificationId, userId: auth.user._id },
      { $set: { isRead: true } }
    );
  } else {
    const unread = await db.collection('notifications').find({ userId: auth.user._id, isRead: false }).toArray();
    for (const item of unread) {
      await db.collection('notifications').updateOne({ _id: item._id }, { $set: { isRead: true } });
    }
  }

  return NextResponse.json({ ok: true });
}
