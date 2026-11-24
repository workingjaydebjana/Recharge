import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { issueOtp } from '@/lib/auth.js';
import { validateIndianMobile } from '@/lib/finance.js';
import { cleanString, hashPassword } from '@/lib/security.js';

export async function POST(req) {
  try {
    const body = await req.json();
    const fullName = cleanString(body.fullName, 100);
    const mobileRaw = cleanString(body.mobile, 15);
    const email = cleanString(body.email, 120).toLowerCase();
    const state = cleanString(body.state, 60);
    const city = cleanString(body.city, 60);
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (fullName.length < 2) {
      return NextResponse.json({ error: 'Please enter your full name (minimum 2 characters).' }, { status: 400 });
    }
    const mobCheck = validateIndianMobile(mobileRaw);
    if (!mobCheck.valid) {
      return NextResponse.json({ error: mobCheck.message }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (!state) {
      return NextResponse.json({ error: 'Please select your state.' }, { status: 400 });
    }
    if (city.length < 2) {
      return NextResponse.json({ error: 'Please enter your city.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Password and Confirm Password do not match.' }, { status: 400 });
    }

    const db = await getDb();
    const existingMobile = await db.collection('users').findOne({ mobile: mobCheck.value });
    if (existingMobile) {
      return NextResponse.json({ error: 'This mobile number is already registered. Please log in.' }, { status: 409 });
    }
    const existingEmail = await db.collection('users').findOne({ email });
    if (existingEmail) {
      return NextResponse.json({ error: 'This email address is already registered. Please log in.' }, { status: 409 });
    }

    // Store hashed registration payload strictly inside pending Email OTP record; user account is NEVER created before verification
    const otpResult = await issueOtp({
      identifier: email,
      purpose: 'REGISTER',
      payload: {
        fullName,
        mobile: mobCheck.value,
        email,
        state,
        city,
        passwordHash: hashPassword(password),
      },
    });

    if (!otpResult.ok) {
      return NextResponse.json({ error: otpResult.error }, { status: otpResult.status || 400 });
    }

    return NextResponse.json({
      ok: true,
      otpId: otpResult.otpId,
      email,
      expiresAt: otpResult.expiresAt,
      deliveryChannel: otpResult.deliveryChannel,
      providerConfigured: otpResult.providerConfigured,
      demoOtpCode: otpResult.demoOtpCode,
      notice: otpResult.providerConfigured
        ? `Email verification OTP sent to ${email}.`
        : `Email verification OTP generated for ${email}. Enter the 6-digit code below to continue to Wallet PIN setup.`,
    });
  } catch (err) {
    console.error('[api/auth/register/request-otp] failed:', err);
    return NextResponse.json({ error: 'Unable to initiate registration verification.' }, { status: 500 });
  }
}
