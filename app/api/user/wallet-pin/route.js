import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb, withAtomicLock } from '@/lib/db.js';
import {
  issueOtp,
  requireUser,
  sanitizeUser,
  validateWalletPinFormat,
  verifyOtpRecord,
  verifyUserWalletPin,
} from '@/lib/auth.js';
import { createNotification } from '@/lib/notifications.js';
import {
  cleanString,
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '@/lib/security.js';

const RESET_TOKEN_TTL_MS = 1000 * 60 * 10; // 10 minutes

export async function POST(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const action = cleanString(body.action, 40).toUpperCase();
    const db = await getDb();

    // 1. Set initial 6-digit Wallet PIN (for accounts created before Wallet PIN was required)
    if (action === 'SET_INITIAL') {
      if (auth.user.walletPinHash) {
        return NextResponse.json(
          { error: 'Wallet PIN is already set. Use Change Wallet PIN or Forgot Wallet PIN instead.' },
          { status: 409 }
        );
      }
      const newPinCheck = validateWalletPinFormat(body.newPin);
      if (!newPinCheck.valid) {
        return NextResponse.json({ error: newPinCheck.message }, { status: 400 });
      }
      const confirmPin = cleanString(String(body.confirmPin ?? ''), 10);
      if (newPinCheck.value !== confirmPin) {
        return NextResponse.json({ error: 'Both 6-digit Wallet PIN entries must match.' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const updated = await db.collection('users').findOneAndUpdate(
        { _id: auth.user._id },
        {
          $set: {
            walletPinHash: hashPassword(newPinCheck.value),
            walletPinUpdatedAt: now,
            walletPinFailedAttempts: 0,
            walletPinLockedUntil: null,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );

      await createNotification({
        userId: auth.user._id,
        title: 'Wallet PIN Created',
        message: 'Your 6-digit Wallet PIN has been set successfully to protect all recharges and payments.',
        category: 'SYSTEM',
        referenceId: auth.user._id,
      });

      return NextResponse.json({
        ok: true,
        user: sanitizeUser(updated),
        message: '6-digit Wallet PIN set successfully.',
      });
    }

    // 2. Change Wallet PIN using Old / Current PIN
    if (action === 'CHANGE') {
      const currentCheck = await verifyUserWalletPin(auth.user, body.currentPin);
      if (!currentCheck.ok) {
        return NextResponse.json(
          { error: currentCheck.error, code: currentCheck.code },
          { status: currentCheck.status || 400 }
        );
      }

      const newPinCheck = validateWalletPinFormat(body.newPin);
      if (!newPinCheck.valid) {
        return NextResponse.json({ error: newPinCheck.message }, { status: 400 });
      }
      const confirmPin = cleanString(String(body.confirmPin ?? ''), 10);
      if (newPinCheck.value !== confirmPin) {
        return NextResponse.json({ error: 'New Wallet PIN and Confirm PIN do not match.' }, { status: 400 });
      }
      if (verifyPassword(newPinCheck.value, auth.user.walletPinHash)) {
        return NextResponse.json(
          { error: 'New Wallet PIN must be different from your current Wallet PIN.' },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const updated = await db.collection('users').findOneAndUpdate(
        { _id: auth.user._id },
        {
          $set: {
            walletPinHash: hashPassword(newPinCheck.value),
            walletPinUpdatedAt: now,
            walletPinFailedAttempts: 0,
            walletPinLockedUntil: null,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );

      await createNotification({
        userId: auth.user._id,
        title: 'Wallet PIN Changed',
        message: 'Your 6-digit Wallet PIN was changed securely from Profile Settings.',
        category: 'SYSTEM',
        referenceId: auth.user._id,
      });

      return NextResponse.json({
        ok: true,
        user: sanitizeUser(updated),
        message: 'Wallet PIN changed successfully.',
      });
    }

    // 3. Forgot Wallet PIN -> Step 1: Issue Email OTP to user's locked registered email
    if (action === 'FORGOT_REQUEST_OTP') {
      const email = String(auth.user.email || '').trim().toLowerCase();
      if (!email) {
        return NextResponse.json(
          { error: 'No registered email found on this account.' },
          { status: 400 }
        );
      }

      const otpResult = await issueOtp({
        identifier: email,
        purpose: 'FORGOT_WALLET_PIN',
        payload: { userId: auth.user._id, email },
      });

      if (!otpResult.ok) {
        return NextResponse.json({ error: otpResult.error }, { status: otpResult.status || 400 });
      }

      return NextResponse.json({
        ok: true,
        otpId: otpResult.otpId,
        email,
        expiresAt: otpResult.expiresAt,
        providerConfigured: otpResult.providerConfigured,
        demoOtpCode: otpResult.demoOtpCode,
        notice: otpResult.providerConfigured
          ? `Verification OTP sent to your registered email ${email}.`
          : `Verification OTP generated for ${email}. Enter the 6-digit code below to reset your Wallet PIN.`,
      });
    }

    // 4. Forgot Wallet PIN -> Step 2: Verify Email OTP & issue single-use reset token
    if (action === 'FORGOT_VERIFY_OTP') {
      const otpId = cleanString(body.otpId, 60);
      const code = cleanString(body.code, 10);
      const email = String(auth.user.email || '').trim().toLowerCase();

      if (!otpId || !/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: 'Enter the 6-digit Email OTP code.' }, { status: 400 });
      }

      const verified = await verifyOtpRecord({
        otpId,
        identifier: email,
        purpose: 'FORGOT_WALLET_PIN',
        code,
      });

      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: verified.status || 400 });
      }
      if (verified.record?.payload?.userId !== auth.user._id) {
        return NextResponse.json({ error: 'OTP does not belong to this account.' }, { status: 403 });
      }

      const { rawToken: pinResetToken, tokenHash: pinResetTokenHash } = generateSessionToken();
      const pinResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

      await db.collection('otps').updateOne(
        { _id: otpId },
        {
          $set: {
            pinResetTokenHash,
            pinResetExpiresAt,
            resetCompleted: false,
          },
        }
      );

      return NextResponse.json({
        ok: true,
        otpId,
        pinResetToken,
        message: 'Email OTP verified. Enter your new 6-digit Wallet PIN.',
      });
    }

    // 5. Forgot Wallet PIN -> Step 3: Set New 6-Digit PIN & Confirm PIN using reset token
    if (action === 'FORGOT_RESET') {
      const otpId = cleanString(body.otpId, 60);
      const pinResetToken = cleanString(body.pinResetToken, 128);
      const newPinCheck = validateWalletPinFormat(body.newPin);
      if (!newPinCheck.valid) {
        return NextResponse.json({ error: newPinCheck.message }, { status: 400 });
      }
      const confirmPin = cleanString(String(body.confirmPin ?? ''), 10);
      if (newPinCheck.value !== confirmPin) {
        return NextResponse.json({ error: 'Both 6-digit Wallet PIN entries must match.' }, { status: 400 });
      }
      if (!otpId || !pinResetToken) {
        return NextResponse.json({ error: 'Reset session expired. Please request a new Email OTP.' }, { status: 400 });
      }

      const resetRes = await withAtomicLock(async () => {
        const record = await db.collection('otps').findOne({
          _id: otpId,
          purpose: 'FORGOT_WALLET_PIN',
        });
        if (!record || !record.verified || !record.pinResetTokenHash || record.resetCompleted) {
          return { ok: false, status: 400, error: 'Reset session is invalid or already used. Request a new OTP.' };
        }
        if (record.payload?.userId !== auth.user._id) {
          return { ok: false, status: 403, error: 'Unauthorized Wallet PIN reset attempt.' };
        }
        if (new Date(record.pinResetExpiresAt || 0).getTime() < Date.now()) {
          return { ok: false, status: 400, error: 'Reset session expired. Request a new Email OTP.' };
        }

        const candidateBuf = Buffer.from(hashToken(pinResetToken), 'hex');
        const storedBuf = Buffer.from(String(record.pinResetTokenHash), 'hex');
        if (candidateBuf.length !== storedBuf.length || !crypto.timingSafeEqual(candidateBuf, storedBuf)) {
          return { ok: false, status: 401, error: 'Invalid reset token.' };
        }

        const now = new Date().toISOString();
        const updated = await db.collection('users').findOneAndUpdate(
          { _id: auth.user._id },
          {
            $set: {
              walletPinHash: hashPassword(newPinCheck.value),
              walletPinUpdatedAt: now,
              walletPinFailedAttempts: 0,
              walletPinLockedUntil: null,
              updatedAt: now,
            },
          },
          { returnDocument: 'after' }
        );

        await db.collection('otps').updateOne(
          { _id: otpId },
          { $set: { resetCompleted: true, resetCompletedAt: now, pinResetTokenHash: null } }
        );

        await createNotification({
          userId: auth.user._id,
          title: 'Wallet PIN Reset Successful',
          message: 'Your 6-digit Wallet PIN was reset securely via Email OTP verification.',
          category: 'SYSTEM',
          referenceId: auth.user._id,
        });

        return { ok: true, user: sanitizeUser(updated) };
      });

      if (!resetRes.ok) {
        return NextResponse.json({ error: resetRes.error }, { status: resetRes.status || 400 });
      }

      return NextResponse.json({
        ok: true,
        user: resetRes.user,
        message: 'Wallet PIN reset successfully. You can now use your new 6-digit PIN.',
      });
    }

    return NextResponse.json({ error: 'Invalid Wallet PIN action.' }, { status: 400 });
  } catch (err) {
    console.error('[api/user/wallet-pin] failed:', err);
    return NextResponse.json({ error: 'Unable to process Wallet PIN request.' }, { status: 500 });
  }
}
