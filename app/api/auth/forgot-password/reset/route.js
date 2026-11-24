import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { verifyOtpRecord } from '@/lib/auth.js';
import { cleanString, hashPassword } from '@/lib/security.js';

export async function POST(req) {
  try {
    const body = await req.json();
    const otpId = cleanString(body.otpId, 60);
    const identifier = cleanString(body.identifier, 120).toLowerCase();
    const code = cleanString(body.code, 10);
    const newPassword = String(body.newPassword || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (!otpId || !identifier || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit verification OTP.' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters long.' }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'New Password and Confirm Password do not match.' }, { status: 400 });
    }

    const verified = await verifyOtpRecord({
      otpId,
      identifier,
      purpose: 'FORGOT_PASSWORD',
      code,
    });

    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: verified.status || 400 });
    }

    const userId = verified.record.payload?.userId;
    if (!userId) {
      return NextResponse.json({ error: 'Invalid recovery request.' }, { status: 400 });
    }

    const db = await getDb();
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() } }
    );
    // Revoke all existing sessions for security
    await db.collection('sessions').deleteMany({ subjectId: userId, role: 'USER' });

    return NextResponse.json({
      ok: true,
      message: 'Password updated successfully. Please log in with your new password.',
    });
  } catch {
    return NextResponse.json({ error: 'Unable to reset password.' }, { status: 500 });
  }
}
