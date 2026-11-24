import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';
import { roundMoney } from '@/lib/finance.js';
import { generateId } from '@/lib/security.js';
import {
  createFamGatewayOrder,
  getFamGatewayApiKey,
  resolveAppOrigin,
} from '@/lib/famgateway.js';

const MIN_UPI_TOPUP = 1;
const MAX_UPI_TOPUP = 100000; // Standard NPCI UPI per-transaction limit (₹1,00,000)

export async function POST(req) {
  const auth = await requireUser(req, { allowSuspended: false });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const rawAmount = body?.amount;

    if (
      rawAmount === null ||
      rawAmount === undefined ||
      rawAmount === '' ||
      typeof rawAmount === 'boolean' ||
      typeof rawAmount === 'object'
    ) {
      return NextResponse.json({ error: 'Please enter a valid amount in ₹.' }, { status: 400 });
    }

    const numericAmount = Number(rawAmount);
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_UPI_TOPUP) {
      return NextResponse.json(
        { error: `Minimum UPI add balance amount is ₹${MIN_UPI_TOPUP}.` },
        { status: 400 }
      );
    }

    const amount = roundMoney(numericAmount);
    if (!Number.isFinite(amount) || amount < MIN_UPI_TOPUP || amount > MAX_UPI_TOPUP) {
      return NextResponse.json(
        { error: `UPI top-up amount must be between ₹${MIN_UPI_TOPUP} and ₹${MAX_UPI_TOPUP.toLocaleString('en-IN')}.` },
        { status: 400 }
      );
    }

    const db = await getDb();
    const settings = await db.collection('settings').findOne({ _id: 'platform_settings' });
    if (settings?.maintenanceMode) {
      return NextResponse.json(
        { error: 'Platform is temporarily under maintenance. Please try again shortly.' },
        { status: 503 }
      );
    }

    const apiKey = await getFamGatewayApiKey(db);
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'UPI payment gateway is not configured yet. Please set FAMGATEWAY_API_KEY in server secrets or Super Admin API Providers.',
        },
        { status: 503 }
      );
    }

    const origin = resolveAppOrigin(req);
    const webhookUrl = `${origin}/api/webhooks/famgateway`;
    const redirectUrl = `${origin}/wallet`;

    const order = await createFamGatewayOrder({
      apiKey,
      amount,
      customerName: auth.user.fullName,
      customerEmail: auth.user.email,
      customerPhone: auth.user.mobile,
      redirectUrl,
      webhookUrl,
    });

    const now = new Date().toISOString();
    const depositId = generateId('DEP');

    const depositDoc = {
      _id: depositId,
      userId: auth.user._id,
      userName: auth.user.fullName,
      userMobile: auth.user.mobile,
      amount,
      paymentMode: 'FAMGATEWAY_UPI',
      gatewayProvider: 'FAMGATEWAY',
      gatewayOrderId: order.orderId,
      upiId: order.upiId,
      qrUrl: order.qrUrl,
      checkoutUrl: order.checkoutUrl,
      upiIntent: order.upiIntent,
      createdAtIst: order.createdAtIst,
      expiresAtIst: order.expiresAtIst,
      referenceNumber: order.orderId,
      utr: '',
      gatewayTransactionId: '',
      senderName: '',
      remarks: 'Automated UPI wallet deposit via FamGateway',
      status: 'PENDING',
      adminRemark: '',
      reviewedBy: null,
      reviewedAt: null,
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('deposits').insertOne(depositDoc);

    return NextResponse.json(
      {
        ok: true,
        depositId,
        order: {
          orderId: order.orderId,
          amount,
          upiId: order.upiId,
          qrUrl: order.qrUrl,
          checkoutUrl: order.checkoutUrl,
          upiIntent: order.upiIntent,
          createdAtIst: order.createdAtIst,
          expiresAtIst: order.expiresAtIst,
          expiresInSeconds: 600,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Unable to initiate UPI payment session. Please try again.' },
      { status: 502 }
    );
  }
}
