import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import {
  USER_SESSION_COOKIE,
  attachSessionCookie,
  checkRateLimit,
  createSession,
  sanitizeUser,
} from '@/lib/auth.js';
import { cleanString, verifyPassword } from '@/lib/security.js';
import { ensureWallet } from '@/lib/wallet.js';

export async function POST(req) {
  try {
    const body = await req.json();
    const identifier = cleanString(body.identifier, 120);
    const password = String(body.password || '');

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Enter your registered mobile number or email and password.' }, { status: 400 });
    }

    const normalized = identifier.toLowerCase();
    const rl = await checkRateLimit(`login:${normalized}`, 12, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${rl.retryAfterSec} seconds.` },
        { status: 429 }
      );
    }

    const db = await getDb();
    const user = await db.collection('users').findOne({
      $or: [{ mobile: identifier }, { email: normalized }],
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid mobile number/email or password.' }, { status: 401 });
    }

    const wallet = await ensureWallet(user._id);
    const session = await createSession({
      subjectId: user._id,
      role: 'USER',
      meta: { mobile: user.mobile },
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
    return NextResponse.json({ error: 'Login failed due to a server error.' }, { status: 500 });
  }
}
