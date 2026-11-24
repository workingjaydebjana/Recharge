import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import {
  USER_SESSION_COOKIE,
  attachSessionCookie,
  createSession,
  requireAdmin,
  sanitizeUser,
} from '@/lib/auth.js';
import { createAuditLog } from '@/lib/notifications.js';
import { cleanString } from '@/lib/security.js';
import { ensureWallet } from '@/lib/wallet.js';

/**
 * Super Admin One-Click Login as User (audited impersonation).
 * Creates a server-side USER session without disturbing the Super Admin session cookie.
 */
export async function POST(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const userId = cleanString(body.userId, 60);
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: userId });
    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
    }

    const wallet = await ensureWallet(user._id);
    const session = await createSession({
      subjectId: user._id,
      role: 'USER',
      meta: {
        mobile: user.mobile,
        impersonatedByAdmin: auth.admin._id,
        impersonatedByEmail: auth.admin.email,
      },
    });

    await createAuditLog({
      adminId: auth.admin._id,
      adminEmail: auth.admin.email,
      action: 'IMPERSONATE_USER',
      targetType: 'USER',
      targetId: user._id,
      details: {
        userFullName: user.fullName,
        userMobile: user.mobile,
        userStatus: user.status,
      },
    });

    const res = NextResponse.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: sanitizeUser(user),
      wallet,
    });
    return attachSessionCookie(res, USER_SESSION_COOKIE, session.token, req);
  } catch {
    return NextResponse.json({ error: 'Unable to log in to user account.' }, { status: 500 });
  }
}
