import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  attachSessionCookie,
  checkRateLimit,
  createSession,
  verifySuperAdminCredentials,
} from '@/lib/auth.js';
import { createAuditLog } from '@/lib/notifications.js';
import { cleanString } from '@/lib/security.js';

export async function POST(req) {
  try {
    const body = await req.json();
    const identifier = cleanString(body.identifier, 120);
    const password = String(body.password || '');

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Enter Super Admin email/mobile and password.' }, { status: 400 });
    }

    const rl = await checkRateLimit(`admin-login:${identifier.toLowerCase()}`, 8, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many admin login attempts. Wait ${rl.retryAfterSec} seconds.` },
        { status: 429 }
      );
    }

    const check = await verifySuperAdminCredentials(identifier, password);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error, needsSetup: Boolean(check.needsSetup) },
        { status: check.needsSetup ? 409 : 401 }
      );
    }

    const session = await createSession({
      subjectId: check.admin._id,
      role: 'SUPER_ADMIN',
      meta: { email: check.admin.email },
    });

    await createAuditLog({
      adminId: check.admin._id,
      adminEmail: check.admin.email,
      action: 'SUPER_ADMIN_LOGIN',
      targetType: 'ADMIN',
      targetId: check.admin._id,
      details: {},
    });

    const res = NextResponse.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      admin: {
        _id: check.admin._id,
        role: check.admin.role,
        fullName: check.admin.fullName,
        email: check.admin.email,
        mobile: check.admin.mobile,
      },
    });
    return attachSessionCookie(res, ADMIN_SESSION_COOKIE, session.token, req);
  } catch {
    return NextResponse.json({ error: 'Admin login failed.' }, { status: 500 });
  }
}
