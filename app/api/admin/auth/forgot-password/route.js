import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { getSuperAdminRecord, issueOtp, verifyOtpRecord } from '@/lib/auth.js';
import { createAuditLog } from '@/lib/notifications.js';
import { cleanString, hashPassword } from '@/lib/security.js';

export async function POST(req) {
  try {
    const body = await req.json();
    const step = cleanString(body.step, 20);
    const { admin, envOverride } = await getSuperAdminRecord();

    if (!admin) {
      return NextResponse.json({ error: 'Super Admin account is not initialized yet.' }, { status: 404 });
    }
    if (envOverride) {
      return NextResponse.json(
        { error: 'Super Admin credentials are managed via server environment variables (SUPER_ADMIN_PASSWORD).' },
        { status: 400 }
      );
    }

    if (step === 'REQUEST_OTP') {
      const identifier = cleanString(body.identifier, 120).toLowerCase();
      if (identifier !== String(admin.email).toLowerCase() && identifier !== String(admin.mobile)) {
        return NextResponse.json({ error: 'Identifier does not match the registered Super Admin account.' }, { status: 404 });
      }
      const otpRes = await issueOtp({
        identifier: admin.email.toLowerCase(),
        purpose: 'ADMIN_FORGOT_PASSWORD',
        payload: { adminId: admin._id },
      });
      if (!otpRes.ok) return NextResponse.json({ error: otpRes.error }, { status: otpRes.status || 400 });
      return NextResponse.json({ ok: true, ...otpRes });
    }

    if (step === 'RESET_PASSWORD') {
      const otpId = cleanString(body.otpId, 60);
      const code = cleanString(body.code, 10);
      const newPassword = String(body.newPassword || '');
      const confirmPassword = String(body.confirmPassword || '');

      if (newPassword.length < 8) {
        return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
      }
      if (newPassword !== confirmPassword) {
        return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
      }

      const verified = await verifyOtpRecord({
        otpId,
        identifier: admin.email.toLowerCase(),
        purpose: 'ADMIN_FORGOT_PASSWORD',
        code,
      });
      if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status || 400 });

      const db = await getDb();
      await db.collection('admins').updateOne(
        { _id: admin._id },
        { $set: { passwordHash: hashPassword(newPassword), updatedAt: new Date().toISOString() } }
      );
      await db.collection('sessions').deleteMany({ subjectId: admin._id, role: 'SUPER_ADMIN' });

      await createAuditLog({
        adminId: admin._id,
        adminEmail: admin.email,
        action: 'SUPER_ADMIN_PASSWORD_RESET',
        targetType: 'ADMIN',
        targetId: admin._id,
        details: {},
      });

      return NextResponse.json({ ok: true, message: 'Super Admin password reset successfully.' });
    }

    return NextResponse.json({ error: 'Invalid recovery step.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Password recovery failed.' }, { status: 500 });
  }
}
