import { NextResponse } from 'next/server';
import { getDb, withAtomicLock } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';
import { createNotification } from '@/lib/notifications.js';
import { cleanString, generateId } from '@/lib/security.js';

/**
 * Raise a "Not Received" dispute on a SUCCESSFUL transaction when the
 * wallet receipt shows successful but the benefit did not reach the phone/account.
 * Never alters wallet balances directly; creates a verified high-priority dispute
 * ticket for operator reconciliation and Super Admin resolution.
 */
export async function POST(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const transactionId = cleanString(body.transactionId, 60);
    const note = cleanString(body.note, 500);

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID is required to raise a dispute.' }, { status: 400 });
    }

    const result = await withAtomicLock(async () => {
      const db = await getDb();

      // Strict server-side ownership lookup to prevent IDOR
      const tx = await db.collection('transactions').findOne({
        _id: transactionId,
        userId: auth.user._id,
      });

      if (!tx) {
        return { error: 'Transaction not found in your account.', status: 404 };
      }

      const normStatus = String(tx.status || '').toUpperCase();
      if (normStatus !== 'SUCCESSFUL') {
        return {
          error: 'Not Received disputes can only be raised for Successful transactions.',
          status: 400,
        };
      }

      // Duplicate dispute protection (checks both transaction stamp and complaints collection)
      if (tx.disputeId) {
        return {
          error: `A Not Received dispute (${tx.disputeId}) has already been raised for this transaction.`,
          status: 409,
          disputeId: tx.disputeId,
        };
      }

      const existingDispute = await db.collection('complaints').findOne({
        userId: auth.user._id,
        referenceId: tx._id,
        isDispute: true,
      });

      if (existingDispute) {
        await db.collection('transactions').updateOne(
          { _id: tx._id, userId: auth.user._id },
          {
            $set: {
              disputeId: existingDispute._id,
              disputeStatus: existingDispute.status || 'OPEN',
              disputedAt: existingDispute.createdAt,
            },
          }
        );
        return {
          error: `A Not Received dispute (${existingDispute._id}) has already been raised for this transaction.`,
          status: 409,
          disputeId: existingDispute._id,
        };
      }

      const now = new Date().toISOString();
      const amountFormatted = Number(tx.amount || 0).toFixed(2);
      const operatorLabel = tx.operatorName || tx.type || 'Recharge';
      const disputeId = generateId('DSP');

      const subject = `Not Received Dispute: ${operatorLabel} (₹${amountFormatted})`;
      const baseDetails = `Transaction ${tx._id} for ${tx.targetNumber} (${operatorLabel}, ₹${amountFormatted}${
        tx.operatorRef ? `, Operator Ref: ${tx.operatorRef}` : ''
      }) shows SUCCESSFUL in wallet, but the recharge/benefit was not received on the customer's phone/account.`;
      const description = note ? `${baseDetails} User note: ${note}` : baseDetails;

      const disputeDoc = {
        _id: disputeId,
        userId: auth.user._id,
        userName: auth.user.fullName,
        userMobile: auth.user.mobile,
        category: 'RECHARGE_NOT_RECEIVED',
        isDispute: true,
        priority: 'HIGH',
        referenceId: tx._id,
        transactionMeta: {
          type: tx.type,
          operatorCode: tx.operatorCode || '',
          operatorName: operatorLabel,
          targetNumber: tx.targetNumber || '',
          amount: Number(tx.amount || 0),
          operatorRef: tx.operatorRef || '',
        },
        subject,
        description,
        status: 'OPEN',
        adminResponse: '',
        responses: [],
        createdAt: now,
        updatedAt: now,
      };

      await db.collection('complaints').insertOne(disputeDoc);

      const updatedTx = await db.collection('transactions').findOneAndUpdate(
        { _id: tx._id, userId: auth.user._id },
        {
          $set: {
            disputeId,
            disputeStatus: 'OPEN',
            disputedAt: now,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );

      await createNotification({
        userId: auth.user._id,
        title: `Not Received Dispute Raised (${disputeId})`,
        message: `Your Not Received dispute for ${operatorLabel} (${tx.targetNumber}, ₹${amountFormatted}) has been logged under ticket ${disputeId} for operator verification.`,
        category: 'COMPLAINT',
        referenceId: disputeId,
      });

      return {
        ok: true,
        status: 201,
        dispute: disputeDoc,
        transaction: updatedTx,
        message: `Dispute ${disputeId} submitted successfully. Our support team will verify with the operator and update you.`,
      };
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error, disputeId: result.disputeId || undefined },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        dispute: result.dispute,
        transaction: result.transaction,
        message: result.message,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Unable to submit Not Received dispute right now.' }, { status: 500 });
  }
}
