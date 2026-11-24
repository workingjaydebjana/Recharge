import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb, withAtomicLock } from '@/lib/db.js';
import {
  USER_SESSION_COOKIE,
  attachSessionCookie,
  createSession,
  sanitizeUser,
  validateWalletPinFormat,
} from '@/lib/auth.js';
import { createNotification } from '@/lib/notifications.js';
import { cleanString, generateId, hashPassword, hashToken } from '@/lib/security.js';
import { ensureWallet } from '@/lib/wallet.js';

export async function POST(req) {
  try {
    const body = await req.json();
    const otpId = cleanString(body.otpId, 60);
    const pinSetupToken = cleanString(body.pinSetupToken, 128);
    const walletPinRaw = cleanString(body.walletPin, 10);
    const confirmWalletPinRaw = cleanString(body.confirmWalletPin, 10);

    if (!otpId || !pinSetupToken) {
      return NextResponse.json(
        { error: 'Verification session expired. Please restart registration.' },
        { status: 400 }
      );
    }

    const pinCheck = validateWalletPinFormat(walletPinRaw);
    if (!pinCheck.valid) {
      return NextResponse.json({ error: pinCheck.message }, { status: 400 });
    }
    if (pinCheck.value !== confirmWalletPinRaw) {
      return NextResponse.json(
        { error: 'Both 6-digit Wallet PIN entries must match exactly.' },
        { status: 400 }
      );
    }

    const result = await withAtomicLock(async () => {
      const db = await getDb();
      const record = await db.collection('otps').findOne({
        _id: otpId,
        purpose: 'REGISTER',
      });

      if (!record || !record.verified || !record.pinSetupTokenHash) {
        return {
          ok: false,
          status: 400,
          error: 'Email OTP verification is required before setting your Wallet PIN.',
        };
      }
      if (record.accountCreated) {
        return {
          ok: false,
          status: 409,
          error: 'This account has already been created. Please log in.',
        };
      }
      if (new Date(record.pinSetupExpiresAt || 0).getTime() < Date.now()) {
        return {
          ok: false,
          status: 400,
          error: 'Wallet PIN setup session expired. Please register again.',
        };
      }

      const candidateBuf = Buffer.from(hashToken(pinSetupToken), 'hex');
      const storedBuf = Buffer.from(String(record.pinSetupTokenHash), 'hex');
      if (candidateBuf.length !== storedBuf.length || !crypto.timingSafeEqual(candidateBuf, storedBuf)) {
        return {
          ok: false,
          status: 401,
          error: 'Invalid verification session token.',
        };
      }

      const payload = record.payload;
      if (!payload || !payload.mobile || !payload.email || !payload.passwordHash) {
        return { ok: false, status: 400, error: 'Registration details missing. Please start again.' };
      }

      const dup = await db.collection('users').findOne({
        $or: [{ mobile: payload.mobile }, { email: payload.email }],
      });
      if (dup) {
        return { ok: false, status: 409, error: 'Account already exists with this mobile or email.' };
      }

      const now = new Date().toISOString();
      const userId = generateId('USR');
      const userDoc = {
        _id: userId,
        accountId: payload.mobile,
        fullName: payload.fullName,
        mobile: payload.mobile,
        email: payload.email,
        state: payload.state,
        city: payload.city,
        passwordHash: payload.passwordHash,
        walletPinHash: hashPassword(pinCheck.value),
        walletPinUpdatedAt: now,
        walletPinFailedAttempts: 0,
        walletPinLockedUntil: null,
        status: 'ACTIVE',
        emailVerified: true,
        mobileVerified: true,
        createdAt: now,
        updatedAt: now,
      };

      await db.collection('users').insertOne(userDoc);
      await db.collection('otps').updateOne(
        { _id: otpId },
        {
          $set: {
            accountCreated: true,
            completedAt: now,
            pinSetupTokenHash: null,
          },
        }
      );

      const wallet = await ensureWallet(userId);
      const session = await createSession({
        subjectId: userId,
        role: 'USER',
        meta: { mobile: userDoc.mobile },
      });

      await createNotification({
        userId,
        title: 'Welcome to Quick Recharge',
        message: 'Your account and 6-digit Wallet PIN are active. Add balance from My Wallet to start recharging.',
        category: 'SYSTEM',
        referenceId: userId,
      });

      return {
        ok: true,
        user: sanitizeUser(userDoc),
        wallet,
        token: session.token,
        expiresAt: session.expiresAt,
      };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    const res = NextResponse.json(result, { status: 201 });
    return attachSessionCookie(res, USER_SESSION_COOKIE, result.token, req);
  } catch (err) {
    console.error('[api/auth/register/complete] failed:', err);
    return NextResponse.json({ error: 'Unable to complete account creation.' }, { status: 500 });
  }
}
