import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser, verifyUserWalletPin } from '@/lib/auth.js';
import { INDIAN_CIRCLES } from '@/lib/constants.js';
import {
  calculateCommission,
  findMobileOperator,
  validateIndianMobile,
  validateRechargeAmount,
} from '@/lib/finance.js';
import { createNotification } from '@/lib/notifications.js';
import { executeRechargeWithProvider } from '@/lib/recharge-provider.js';
import { cleanString, generateId } from '@/lib/security.js';
import {
  holdForRecharge,
  refundRechargeFailure,
  settleRechargeSuccess,
} from '@/lib/wallet.js';

export async function POST(req) {
  const auth = await requireUser(req, { allowSuspended: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const mobileRaw = cleanString(body.mobileNumber, 15);
    const operatorCode = cleanString(body.operatorCode, 30).toUpperCase();
    const circle = cleanString(body.circle, 80);
    const amountRaw = Number(body.amount);
    const demoOutcome = cleanString(body.demoOutcome, 20).toUpperCase() || 'SUCCESSFUL';
    const idempotencyKey = cleanString(body.idempotencyKey, 100) || generateId('MIDEMP');

    const db = await getDb();
    const settings = await db.collection('settings').findOne({ _id: 'platform_settings' });
    if (settings?.maintenanceMode) {
      return NextResponse.json(
        { error: 'Platform is currently in maintenance mode. Recharges are temporarily paused.' },
        { status: 503 }
      );
    }
    if (settings && settings.mobileRechargeEnabled === false) {
      return NextResponse.json(
        { error: 'Mobile Recharge service is currently disabled by administrator.' },
        { status: 503 }
      );
    }

    const mobCheck = validateIndianMobile(mobileRaw);
    if (!mobCheck.valid) return NextResponse.json({ error: mobCheck.message }, { status: 400 });

    const operator = findMobileOperator(operatorCode);
    if (!operator) {
      return NextResponse.json({ error: 'Select a valid Indian mobile operator.' }, { status: 400 });
    }
    if (!INDIAN_CIRCLES.includes(circle)) {
      return NextResponse.json({ error: 'Select a valid telecom circle / state.' }, { status: 400 });
    }

    const amtCheck = validateRechargeAmount(amountRaw, settings || {});
    if (!amtCheck.valid) return NextResponse.json({ error: amtCheck.message }, { status: 400 });

    // Server-side 6-digit Wallet PIN verification before any funds are held
    const pinCheck = await verifyUserWalletPin(auth.user, body.walletPin);
    if (!pinCheck.ok) {
      return NextResponse.json(
        { error: pinCheck.error, code: pinCheck.code },
        { status: pinCheck.status || 400 }
      );
    }

    // Duplicate idempotency check
    const existingTx = await db.collection('transactions').findOne({ idempotencyKey });
    if (existingTx) {
      return NextResponse.json(
        { error: 'Duplicate recharge request blocked by idempotency protection.', transaction: existingTx },
        { status: 409 }
      );
    }

    const transactionId = generateId('TXN');
    const amount = amtCheck.value;

    // Fetch Super Admin configured commission / service rule (read-only for users)
    const commRule = await db.collection('commissions').findOne({
      serviceType: 'MOBILE',
      operatorCode: operator.code,
    });
    if (commRule && commRule.isActive === false) {
      return NextResponse.json(
        { error: `${operator.name} recharge service is temporarily disabled by administrator.` },
        { status: 503 }
      );
    }
    const commCalc = calculateCommission(amount, commRule);
    const totalPayable = commCalc.totalPayable;

    // Step 1: Atomic hold (Current Balance -> Pending Balance) for base + any fixed service charge
    const holdRes = await holdForRecharge({
      userId: auth.user._id,
      amount: totalPayable,
      transactionId,
      idempotencyKey,
      description:
        commCalc.serviceCharge > 0
          ? `Mobile Recharge ${operator.name} (${mobCheck.value}) incl. ₹${commCalc.serviceCharge.toFixed(2)} service charge`
          : `Mobile Recharge ${operator.name} (${mobCheck.value})`,
      isDemo: true,
    });

    if (!holdRes.ok) {
      return NextResponse.json({ error: holdRes.error }, { status: holdRes.duplicate ? 409 : 400 });
    }

    const now = new Date().toISOString();
    const txDoc = {
      _id: transactionId,
      userId: auth.user._id,
      userName: auth.user.fullName,
      userMobile: auth.user.mobile,
      type: 'MOBILE_RECHARGE',
      operatorCode: operator.code,
      operatorName: operator.name,
      targetNumber: mobCheck.value,
      circle,
      amount,
      serviceCharge: commCalc.serviceCharge,
      totalPayable,
      commissionAmount: 0,
      expectedCommission: commCalc.commissionAmount,
      commissionRateType: commCalc.rateType,
      commissionRateValue: commCalc.rateValue,
      commissionCredited: false,
      refunded: false,
      status: 'PROCESSING',
      providerMode: 'DEMO',
      isDemo: true,
      idempotencyKey,
      providerRef: '',
      operatorRef: '',
      statusMessage: 'Processing recharge request...',
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('transactions').insertOne(txDoc);

    // Step 2: Execute via configured Live Provider or explicit DEMO Mode Simulator
    const providerRes = await executeRechargeWithProvider({
      serviceType: 'MOBILE',
      operatorCode: operator.code,
      targetNumber: mobCheck.value,
      circle,
      amount,
      transactionId,
      demoOutcome,
    });

    let finalWallet = holdRes.wallet;
    let finalFields = {
      status: providerRes.status,
      providerMode: providerRes.providerMode,
      providerName: providerRes.providerName,
      providerRef: providerRes.providerRef,
      operatorRef: providerRes.operatorRef,
      isDemo: providerRes.isDemo,
      statusMessage: providerRes.statusMessage,
      updatedAt: new Date().toISOString(),
    };

    if (providerRes.status === 'SUCCESSFUL') {
      const settle = await settleRechargeSuccess({
        userId: auth.user._id,
        amount: totalPayable,
        commissionAmount: commCalc.commissionAmount,
        transactionId,
        description: `Mobile Recharge ${operator.name} (${mobCheck.value})`,
        isDemo: providerRes.isDemo,
      });
      if (settle.ok) {
        finalWallet = settle.wallet;
        finalFields.commissionAmount = commCalc.commissionAmount;
        finalFields.commissionCredited = commCalc.commissionAmount > 0;
      }
      await createNotification({
        userId: auth.user._id,
        title: `Mobile Recharge Successful${providerRes.isDemo ? ' (DEMO)' : ''}`,
        message: `${operator.name} recharge of ₹${amount.toFixed(2)} for ${mobCheck.value} completed.${commCalc.serviceCharge > 0 ? ` Service charge ₹${commCalc.serviceCharge.toFixed(2)} applied.` : ''}${commCalc.commissionAmount > 0 ? ` Commission ₹${commCalc.commissionAmount.toFixed(2)} credited.` : ''}`,
        category: 'RECHARGE',
        referenceId: transactionId,
      });
    } else if (providerRes.status === 'FAILED') {
      const refund = await refundRechargeFailure({
        userId: auth.user._id,
        amount: totalPayable,
        transactionId,
        description: `Mobile Recharge ${operator.name} (${mobCheck.value})`,
        isDemo: providerRes.isDemo,
      });
      if (refund.ok) {
        finalWallet = refund.wallet;
        finalFields.refunded = true;
        finalFields.refundedAt = new Date().toISOString();
      }
      await createNotification({
        userId: auth.user._id,
        title: `Mobile Recharge Failed & Refunded${providerRes.isDemo ? ' (DEMO)' : ''}`,
        message: `${operator.name} recharge of ₹${amount.toFixed(2)} for ${mobCheck.value} failed. ₹${totalPayable.toFixed(2)} automatically refunded to Current Balance.`,
        category: 'REFUND',
        referenceId: transactionId,
      });
    } else {
      // PENDING -> remains held in Pending Balance until provider callback or Super Admin reconciliation
      await createNotification({
        userId: auth.user._id,
        title: `Mobile Recharge Pending${providerRes.isDemo ? ' (DEMO)' : ''}`,
        message: `${operator.name} recharge of ₹${amount.toFixed(2)} for ${mobCheck.value} is Pending. Amount held safely in Pending Balance until confirmed.`,
        category: 'RECHARGE',
        referenceId: transactionId,
      });
    }

    const updatedTx = await db.collection('transactions').findOneAndUpdate(
      { _id: transactionId },
      { $set: finalFields },
      { returnDocument: 'after' }
    );

    return NextResponse.json({
      ok: true,
      transaction: updatedTx,
      wallet: finalWallet,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to process mobile recharge request.' }, { status: 500 });
  }
}
