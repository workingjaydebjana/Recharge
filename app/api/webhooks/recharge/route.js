import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getDb } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';
import { reconcilePendingTransaction } from '@/lib/reconcile.js';
import { cleanString, decryptSecret } from '@/lib/security.js';

/**
 * Recharge Provider Callback / Webhook endpoint.
 * Accepts either:
 * 1) Authenticated Super Admin test callback invocation (for Demo Mode verification)
 * 2) External provider callback authenticated via X-Webhook-Secret matching configured encrypted secret.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const transactionId = cleanString(body.transactionId, 60);
    const status = cleanString(body.status, 20).toUpperCase();
    const operatorRef = cleanString(body.operatorRef, 80);
    const remark = cleanString(body.remark, 250);

    if (!transactionId || !['SUCCESSFUL', 'FAILED'].includes(status)) {
      return NextResponse.json({ error: 'Provide transactionId and status (SUCCESSFUL or FAILED).' }, { status: 400 });
    }

    // Check if invoked by authenticated Super Admin (Webhook Simulator)
    const adminCheck = await requireAdmin(req);
    let actor = null;

    if (adminCheck.ok) {
      actor = {
        type: 'SUPER_ADMIN',
        id: adminCheck.admin._id,
        email: adminCheck.admin.email,
      };
    } else {
      // Verify configured provider webhook secret using constant-time check
      const incomingSecret = req.headers.get('x-webhook-secret') || '';
      if (!incomingSecret) {
        return NextResponse.json({ error: 'Missing webhook authorization.' }, { status: 401 });
      }
      const db = await getDb();
      const tx = await db.collection('transactions').findOne({ _id: transactionId });
      if (!tx) return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });

      const serviceType = tx.type === 'DTH_RECHARGE' ? 'DTH' : 'MOBILE';
      const provider = await db.collection('recharge_providers').findOne({ serviceType });
      const storedSecret = decryptSecret(provider?.webhookSecretEncrypted || '');

      if (!storedSecret) {
        return NextResponse.json({ error: 'Provider webhook secret is not configured.' }, { status: 403 });
      }
      const a = Buffer.from(incomingSecret);
      const b = Buffer.from(storedSecret);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return NextResponse.json({ error: 'Invalid webhook secret.' }, { status: 403 });
      }
      actor = { type: 'WEBHOOK', id: provider?._id || 'PROVIDER_WEBHOOK', email: 'webhook@provider' };
    }

    const res = await reconcilePendingTransaction({
      transactionId,
      newStatus: status,
      operatorRef,
      remark: remark || `Reconciled via provider callback (${status})`,
      actor,
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status || 400 });
    }

    return NextResponse.json({ ok: true, transaction: res.transaction });
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}
