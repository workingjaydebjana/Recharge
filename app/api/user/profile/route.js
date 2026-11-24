import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser, sanitizeUser } from '@/lib/auth.js';
import { validateIndianMobile } from '@/lib/finance.js';
import { cleanString, hashPassword, verifyPassword } from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ ok: true, user: sanitizeUser(auth.user) });
}

export async function PATCH(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const action = cleanString(body.action, 40) || 'UPDATE_PROFILE';
    const db = await getDb();

    if (action === 'CHANGE_PASSWORD') {
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      const confirmPassword = String(body.confirmPassword || '');

      if (!verifyPassword(currentPassword, auth.user.passwordHash)) {
        return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
      }
      if (newPassword.length < 8) {
        return NextResponse.json({ error: 'New password must be at least 8 characters long.' }, { status: 400 });
      }
      if (newPassword !== confirmPassword) {
        return NextResponse.json({ error: 'New password and confirmation do not match.' }, { status: 400 });
      }

      await db.collection('users').updateOne(
        { _id: auth.user._id },
        { $set: { passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() } }
      );
      return NextResponse.json({ ok: true, message: 'Password changed securely.' });
    }

    // Reject any attempt to modify permanently locked email address
    if (body.email && cleanString(body.email, 120).toLowerCase() !== String(auth.user.email || '').toLowerCase()) {
      return NextResponse.json(
        { error: 'Registered email address is permanently locked and cannot be changed.' },
        { status: 403 }
      );
    }

    // Editable personal details including direct Mobile Number update (no OTP required)
    const fullName = cleanString(body.fullName, 100);
    const shopName = cleanString(body.shopName, 100);
    const state = cleanString(body.state, 60);
    const city = cleanString(body.city, 60);
    const pincode = cleanString(body.pincode, 10).replace(/\D/g, '');
    const address = cleanString(body.address, 220);

    if (fullName.length < 2 || !state || city.length < 2) {
      return NextResponse.json({ error: 'Full Name, State, and City are required.' }, { status: 400 });
    }
    if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) {
      return NextResponse.json({ error: 'Enter a valid 6-digit Indian PIN code.' }, { status: 400 });
    }

    let nextMobile = auth.user.mobile;
    if (body.mobile !== undefined && body.mobile !== null && String(body.mobile).trim() !== '') {
      const mobCheck = validateIndianMobile(cleanString(body.mobile, 15));
      if (!mobCheck.valid) {
        return NextResponse.json({ error: mobCheck.message }, { status: 400 });
      }
      if (mobCheck.value !== auth.user.mobile) {
        const conflict = await db.collection('users').findOne({
          _id: { $ne: auth.user._id },
          mobile: mobCheck.value,
        });
        if (conflict) {
          return NextResponse.json(
            { error: 'That mobile number is already used as another user ID.' },
            { status: 409 }
          );
        }
        nextMobile = mobCheck.value;
      }
    }

    const updated = await db.collection('users').findOneAndUpdate(
      { _id: auth.user._id },
      {
        $set: {
          fullName,
          mobile: nextMobile,
          accountId: nextMobile,
          shopName,
          state,
          city,
          pincode,
          address,
          updatedAt: new Date().toISOString(),
        },
      },
      { returnDocument: 'after' }
    );

    return NextResponse.json({
      ok: true,
      user: sanitizeUser(updated),
      message:
        nextMobile !== auth.user.mobile
          ? `Profile updated! Your Mobile Number & User ID is now ${nextMobile}.`
          : 'Personal details updated successfully.',
    });
  } catch {
    return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
  }
}
