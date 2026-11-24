import { NextResponse } from 'next/server';
import { getDb, withAtomicLock } from '@/lib/db.js';
import { createSession, getSuperAdminRecord } from '@/lib/auth.js';
import { validateIndianMobile } from '@/lib/finance.js';
import { createAuditLog } from '@/lib/notifications.js';
import { cleanString, hashPassword } from '@/lib/security.js';

/**
 * One-time atomic bootstrap route to claim the sole Super Admin account
 * when SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD env vars are not set.
 * Permanently locks itself immediately once claimed.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const fullName = cleanString(body.fullName, 100) || 'Super Administrator';
    const email = cleanString(body.email, 120).toLowerCase();
    const mobileRaw = cleanString(body.mobile, 15);
    const password = String(body.password || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid Super Admin email address.' }, { status: 400 });
    }
    const mobCheck = validateIndianMobile(mobileRaw);
    if (!mobCheck.valid) {
      return NextResponse.json({ error: mobCheck.message }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Super Admin password must be at least 8 characters.' }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Password and Confirm Password do not match.' }, { status: 400 });
    }

    const result = await withAtomicLock(async () => {
      const { admin, envOverride } = await getSuperAdminRecord();
      if (admin || envOverride) {
        return {
          ok: false,
          status: 403,
          error: 'Super Admin account is already configured. Only ONE Super Admin account is permitted.',
        };
      }

      const db = await getDb();
      const now = new Date().toISOString();
      const adminDoc = {
        _id: 'SUPER_ADMIN_PRIMARY',
        role: 'SUPER_ADMIN',
        fullName,
        email,
        mobile: mobCheck.value,
        passwordHash: hashPassword(password),
        source: 'FIRST_RUN_CLAIM',
        createdAt: now,
        updatedAt: now,
      };

      await db.collection('admins').insertOne(adminDoc);
      const session = await createSession({
        subjectId: adminDoc._id,
        role: 'SUPER_ADMIN',
        meta: { email: adminDoc.email },
      });

      await createAuditLog({
        adminId: adminDoc._id,
        adminEmail: adminDoc.email,
        action: 'SUPER_ADMIN_INITIALIZED',
        targetType: 'ADMIN',
        targetId: adminDoc._id,
        details: { method: 'FIRST_RUN_CLAIM' },
      });

      return {
        ok: true,
        token: session.token,
        expiresAt: session.expiresAt,
        admin: {
          _id: adminDoc._id,
          role: adminDoc.role,
          fullName: adminDoc.fullName,
          email: adminDoc.email,
          mobile: adminDoc.mobile,
        },
      };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to initialize Super Admin account.' }, { status: 500 });
  }
}
