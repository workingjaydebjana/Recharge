import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { issueOtp } from '@/lib/auth.js';
import { cleanString } from '@/lib/security.js';

export async function POST(req) {
  try {
    const body = await req.json();
    const identifier = cleanString(body.identifier, 120);
    if (!identifier) {
      return NextResponse.json({ error: 'Enter your registered email address or mobile number.' }, { status: 400 });
    }

    const db = await getDb();
    const normalized = identifier.toLowerCase();
    const user = await db.collection('users').findOne({
      $or: [{ mobile: identifier }, { email: normalized }],
    });

    if (!user) {
      return NextResponse.json({ error: 'No registered account found with that mobile number or email.' }, { status: 404 });
    }

    const otpResult = await issueOtp({
      identifier: normalized,
      purpose: 'FORGOT_PASSWORD',
      payload: { userId: user._id },
    });

    if (!otpResult.ok) {
      return NextResponse.json({ error: otpResult.error }, { status: otpResult.status || 400 });
    }

    return NextResponse.json({
      ok: true,
      otpId: otpResult.otpId,
      expiresAt: otpResult.expiresAt,
      deliveryChannel: otpResult.deliveryChannel,
      providerConfigured: otpResult.providerConfigured,
      demoOtpCode: otpResult.demoOtpCode,
      notice: otpResult.notice,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to send password recovery OTP.' }, { status: 500 });
  }
}
