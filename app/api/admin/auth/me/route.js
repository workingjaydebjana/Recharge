import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth.js';

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({
    ok: true,
    admin: {
      _id: auth.admin._id,
      role: auth.admin.role,
      fullName: auth.admin.fullName,
      email: auth.admin.email,
      mobile: auth.admin.mobile,
    },
  });
}
