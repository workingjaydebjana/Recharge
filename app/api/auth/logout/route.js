import { NextResponse } from 'next/server';
import { clearSessionCookies, revokeSession } from '@/lib/auth.js';

export async function POST(req) {
  await revokeSession(req);
  const res = NextResponse.json({ ok: true });
  return clearSessionCookies(res, req);
}
