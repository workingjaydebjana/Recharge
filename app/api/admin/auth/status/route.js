import { NextResponse } from 'next/server';
import { getDb, getDbMode } from '@/lib/db.js';
import { getSuperAdminRecord } from '@/lib/auth.js';

export async function GET() {
  try {
    await getDb();
    const { admin, envOverride } = await getSuperAdminRecord();
    return NextResponse.json({
      ok: true,
      needsSetup: !admin,
      envConfigured: envOverride,
      dbMode: getDbMode(),
      demoMode: true,
    });
  } catch (err) {
    console.error('[api/admin/auth/status] failed:', err);
    return NextResponse.json({ error: 'Unable to check Super Admin status.' }, { status: 500 });
  }
}
