import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';
import { ensureWallet } from '@/lib/wallet.js';
import { cleanString } from '@/lib/security.js';
import {
  getFamGatewayApiKey,
  settleFamGatewayDeposit,
  verifyFamGatewayOrder,
} from '@/lib/famgateway.js';

export async function GET(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const orderId = cleanString(searchParams.get('orderId') || '', 60);

    if (!orderId || !/^[A-Za-z0-9_-]{4,60}$/.test(orderId)) {
      return NextResponse.json({ error: 'Valid orderId is required.' }, { status: 400 });
    }

    const db = await getDb();

    // Strict ownership verification to prevent IDOR
    const deposit = await db.collection('deposits').findOne({
      gatewayOrderId: orderId,
      gatewayProvider: 'FAMGATEWAY',
      userId: auth.user._id,
    });

    if (!deposit) {
      return NextResponse.json({ error: 'Payment order not found in your account.' }, { status: 404 });
    }

    if (deposit.status === 'APPROVED') {
      const wallet = await ensureWallet(auth.user._id);
      return NextResponse.json({
        ok: true,
        status: 'success',
        deposit,
        wallet,
      });
    }

    if (deposit.status === 'EXPIRED' || deposit.status === 'REJECTED') {
      return NextResponse.json({
        ok: true,
        status: 'expired',
        deposit,
      });
    }

    const apiKey = await getFamGatewayApiKey(db);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'UPI payment gateway is not configured on the server.' },
        { status: 503 }
      );
    }

    const verified = await verifyFamGatewayOrder({ apiKey, orderId });

    if (verified.status === 'success') {
      const settled = await settleFamGatewayDeposit({
        orderId,
        paidAmount: verified.amount,
        utr: verified.utr,
        gatewayTransactionId: verified.transactionId,
        senderName: verified.senderName,
        paymentTime: verified.paymentTime,
        source: 'VERIFY_API',
      });

      if (!settled.ok) {
        return NextResponse.json({ error: settled.error }, { status: settled.status || 400 });
      }

      return NextResponse.json({
        ok: true,
        status: 'success',
        deposit: settled.deposit,
        wallet: settled.wallet,
      });
    }

    if (verified.status === 'expired') {
      const now = new Date().toISOString();
      const expiredDoc = await db.collection('deposits').findOneAndUpdate(
        { _id: deposit._id, status: 'PENDING' },
        {
          $set: {
            status: 'EXPIRED',
            adminRemark: 'UPI payment session expired before payment confirmation',
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );
      return NextResponse.json({
        ok: true,
        status: 'expired',
        deposit: expiredDoc || deposit,
      });
    }

    return NextResponse.json({
      ok: true,
      status: 'pending',
      deposit,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Unable to verify payment status right now.' },
      { status: 502 }
    );
  }
}
