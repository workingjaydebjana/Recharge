import { getDb, withAtomicLock } from './db.js';
import { calculateCommission } from './finance.js';
import { createAuditLog, createNotification } from './notifications.js';
import { refundRechargeFailure, settleRechargeSuccess } from './wallet.js';

/**
 * Reconcile a PENDING or PROCESSING recharge transaction into SUCCESSFUL or FAILED.
 * Enforces strict atomicity, single commission credit, and duplicate-refund prevention.
 */
export async function reconcilePendingTransaction({
  transactionId,
  newStatus, // 'SUCCESSFUL' | 'FAILED'
  operatorRef = '',
  remark = '',
  actor = { type: 'WEBHOOK', id: 'PROVIDER_WEBHOOK', email: 'webhook@system' },
}) {
  return withAtomicLock(async () => {
    const db = await getDb();
    const targetStatus = String(newStatus || '').toUpperCase();
    if (!['SUCCESSFUL', 'FAILED'].includes(targetStatus)) {
      return { ok: false, status: 400, error: 'Resolution status must be SUCCESSFUL or FAILED.' };
    }

    const tx = await db.collection('transactions').findOne({ _id: transactionId });
    if (!tx) {
      return { ok: false, status: 404, error: 'Transaction not found.' };
    }
    if (!['PENDING', 'PROCESSING'].includes(tx.status)) {
      return {
        ok: false,
        status: 409,
        error: `Transaction is already finalized as ${tx.status}. Original record preserved.`,
      };
    }

    const now = new Date().toISOString();

    if (targetStatus === 'SUCCESSFUL') {
      // Lookup Super Admin commission rule if not already computed
      const serviceType =
        tx.type === 'DTH_RECHARGE'
          ? 'DTH'
          : tx.type === 'ELECTRICITY_BILL'
            ? 'ELECTRICITY'
            : tx.type === 'REDEEM_CODE'
              ? 'REDEEM_CODE'
              : 'MOBILE';
      const rule = await db.collection('commissions').findOne({
        serviceType,
        operatorCode: tx.operatorCode,
      });
      const commCalc = calculateCommission(tx.amount, rule);
      const heldTotal = Number(tx.totalPayable || tx.amount);

      const settleRes = await settleRechargeSuccess({
        userId: tx.userId,
        amount: heldTotal,
        commissionAmount: commCalc.commissionAmount,
        transactionId: tx._id,
        description: `${tx.operatorName} recharge for ${tx.targetNumber}`,
        isDemo: tx.isDemo !== false,
      });

      if (!settleRes.ok) {
        return { ok: false, status: 409, error: settleRes.error };
      }

      const updatedTx = await db.collection('transactions').findOneAndUpdate(
        { _id: tx._id },
        {
          $set: {
            status: 'SUCCESSFUL',
            commissionAmount: commCalc.commissionAmount,
            commissionRateType: commCalc.rateType,
            commissionRateValue: commCalc.rateValue,
            commissionCredited: commCalc.commissionAmount > 0,
            operatorRef: operatorRef || tx.operatorRef || `RECON-${tx._id.slice(-6)}`,
            statusMessage:
              remark || 'Transaction confirmed Successful. Commission credited to Commission Balance.',
            reconciledBy: actor.id,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' }
      );

      await createNotification({
        userId: tx.userId,
        title: 'Recharge Successful',
        message: `${tx.operatorName} recharge of ₹${Number(tx.amount).toFixed(2)} for ${tx.targetNumber} is confirmed Successful.${commCalc.commissionAmount > 0 ? ` Commission ₹${commCalc.commissionAmount.toFixed(2)} credited.` : ''}`,
        category: 'RECHARGE',
        referenceId: tx._id,
      });

      if (actor.type === 'SUPER_ADMIN') {
        await createAuditLog({
          adminId: actor.id,
          adminEmail: actor.email,
          action: 'RECONCILE_TRANSACTION_SUCCESS',
          targetType: 'TRANSACTION',
          targetId: tx._id,
          details: { amount: tx.amount, heldTotal, commissionCredited: commCalc.commissionAmount, remark },
        });
      }

      return { ok: true, transaction: updatedTx, wallet: settleRes.wallet };
    }

    // FAILED -> Automatic atomic refund of full held amount (base + any service fee) from Pending to Current Balance
    const heldTotal = Number(tx.totalPayable || tx.amount);
    const refundRes = await refundRechargeFailure({
      userId: tx.userId,
      amount: heldTotal,
      transactionId: tx._id,
      description: `${tx.operatorName} failed recharge (${tx.targetNumber})`,
      isDemo: tx.isDemo !== false,
    });

    if (!refundRes.ok) {
      return { ok: false, status: 409, error: refundRes.error };
    }

    const updatedTx = await db.collection('transactions').findOneAndUpdate(
      { _id: tx._id },
      {
        $set: {
          status: 'FAILED',
          commissionAmount: 0,
          commissionCredited: false,
          refunded: true,
          refundedAt: now,
          statusMessage:
            remark || 'Transaction confirmed Failed. Refund credited to Current Balance.',
          reconciledBy: actor.id,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    await createNotification({
      userId: tx.userId,
      title: 'Recharge Failed & Refunded',
      message: `${tx.operatorName} recharge of ₹${Number(tx.amount).toFixed(2)} for ${tx.targetNumber} failed. Full amount refunded to Current Balance.`,
      category: 'REFUND',
      referenceId: tx._id,
    });

    if (actor.type === 'SUPER_ADMIN') {
      await createAuditLog({
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'RECONCILE_TRANSACTION_FAILED_REFUND',
        targetType: 'TRANSACTION',
        targetId: tx._id,
        details: { amount: tx.amount, refunded: true, remark },
      });
    }

    return { ok: true, transaction: updatedTx, wallet: refundRes.wallet };
  });
}
