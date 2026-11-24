import { NextResponse } from 'next/server';
import { getDb, withAtomicLock } from '@/lib/db.js';
import { verifyOtpRecord } from '@/lib/auth.js';
import { cleanString, generateSessionToken } from '@/lib/security.js';

const PIN_SETUP_TTL_MS = 1000 * 60 * 10; // 10 minutes to finish setting 6-digit Wallet PIN

export async function POST(req) {
  try {
    const body = await req.json();
    const otpId = cleanString(body.otpId, 60);
    const email = cleanString(body.email, 120).toLowerCase();
    const code = cleanString(body.code, 10);

    if (!otpId || !email || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit Email verification OTP code.' }, { status: 400 });
    }

    const result = await withAtomicLock(async () => {
      const verified = await verifyOtpRecord({
        otpId,
        identifier: email,
        purpose: 'REGISTER',
        code,
      });

      if (!verified.ok) {
        return { ok: false, status: verified.status, error: verified.error };
      }

      const payload = verified.record.payload;
      if (!payload || !payload.mobile || !payload.email || !payload.passwordHash) {
        return { ok: false, status: 400, error: 'Registration session expired. Please start again.' };
      }

      const db = await getDb();
      const dup = await db.collection('users').findOne({
        $or: [{ mobile: payload.mobile }, { email: payload.email }],
      });
      if (dup) {
        return { ok: false, status: 409, error: 'Account already exists with this mobile or email.' };
      }

      const { rawToken: pinSetupToken, tokenHash: pinSetupTokenHash } = generateSessionToken();
      const pinSetupExpiresAt = new Date(Date.now() + PIN_SETUP_TTL_MS).toISOString();

      await db.collection('otps').updateOne(
        { _id: otpId },
        {
          $set: {
            pinSetupTokenHash,
            pinSetupExpiresAt,
            accountCreated: false,
          },
        }
      );

      return {
        ok: true,
        otpId,
        pinSetupToken,
        email: payload.email,
        mobile: payload.mobile,
        fullName: payload.fullName,
        message: 'Email OTP verified. Now set your 6-digit Wallet PIN to complete account creation.',
      };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('[api/auth/register/verify-otp] failed:', err);
    return NextResponse.json({ error: 'Unable to verify Email OTP.' }, { status: 500 });
  }
}
