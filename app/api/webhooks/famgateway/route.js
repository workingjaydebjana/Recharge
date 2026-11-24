import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { cleanString } from '@/lib/security.js';
import {
  getFamGatewayApiKey,
  settleFamGatewayDeposit,
  verifyFamGatewayWebhookSignature,
} from '@/lib/famgateway.js';

/**
 * Server-to-server FamGateway Webhook Receiver (POST /api/webhooks/famgateway).
 * Verifies X-FamGateway-Signature using timing-safe HMAC-SHA256 against the raw body
 * before atomically crediting the user's Current Balance.
 */
export async function POST(req) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-famgateway-signature') || '';
    const eventHeader = cleanString(req.headers.get('x-famgateway-event') || '', 40).toLowerCase();

    const db = await getDb();
    const apiKey = await getFamGatewayApiKey(db);

    if (!apiKey) {
      return NextResponse.json({ error: 'Gateway secret not configured.' }, { status: 503 });
    }

    if (!verifyFamGatewayWebhookSignature(rawBody, signature, apiKey)) {
      return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
    }

    let payload = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const event = cleanString(String(payload?.event || eventHeader || ''), 40).toLowerCase();
    const status = cleanString(String(payload?.status || ''), 30).toLowerCase();
    const orderId = cleanString(String(payload?.order_id || ''), 60);

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order_id in webhook payload.' }, { status: 400 });
    }

    if (event === 'payment.success' || status === 'success') {
      const settled = await settleFamGatewayDeposit({
        orderId,
        paidAmount: Number(payload?.payable_amount || payload?.amount || 0) || null,
        utr: payload?.utr || '',
        gatewayTransactionId: payload?.transaction_id || '',
        senderName: payload?.sender_name || '',
        paymentTime: payload?.payment_time || '',
        source: 'WEBHOOK',
      });

      if (!settled.ok) {
        return NextResponse.json({ error: settled.error }, { status: settled.status || 400 });
      }

      return NextResponse.json({
        ok: true,
        settled: true,
        alreadySettled: Boolean(settled.alreadySettled),
        orderId,
      });
    }

    return NextResponse.json({ ok: true, ignored: true, event });
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}
