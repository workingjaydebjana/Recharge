import crypto from 'node:crypto';
import { getDb, withAtomicLock } from './db.js';
import { calculateCommission, roundMoney, validateCommissionTransfer } from './finance.js';
import { generateId } from './security.js';

const GP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateGooglePlayVoucherCode() {
  const bytes = crypto.randomBytes(16);
  let raw = '';
  for (let i = 0; i < 16; i += 1) {
    raw += GP_CODE_ALPHABET[bytes[i] % GP_CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/**
 * Ensure a three-balance wallet document exists for a user.
 */
export async function ensureWallet(userId) {
  const db = await getDb();
  const existing = await db.collection('wallets').findOne({ userId });
  if (existing) return existing;

  const now = new Date().toISOString();
  const wallet = {
    _id: generateId('WAL'),
    userId,
    currentBalance: 0,
    pendingBalance: 0,
    commissionBalance: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection('wallets').insertOne(wallet);
  return wallet;
}

/**
 * Write an immutable ledger entry for every single wallet balance mutation.
 */
async function appendLedger(db, entry) {
  const doc = {
    _id: generateId('LED'),
    userId: entry.userId,
    balanceType: entry.balanceType, // 'CURRENT' | 'PENDING' | 'COMMISSION'
    direction: entry.direction, // 'CREDIT' | 'DEBIT'
    amount: roundMoney(entry.amount),
    balanceBefore: roundMoney(entry.balanceBefore),
    balanceAfter: roundMoney(entry.balanceAfter),
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    idempotencyKey: entry.idempotencyKey || generateId('IDEMP'),
    description: entry.description,
    isDemo: entry.isDemo !== false,
    createdAt: new Date().toISOString(),
  };
  await db.collection('wallet_ledger').insertOne(doc);
  return doc;
}

/**
 * Credit Current Balance (used for approved deposits or audited admin adjustments).
 */
export async function creditCurrentBalance({
  userId,
  amount,
  referenceType,
  referenceId,
  idempotencyKey,
  description,
  isDemo = true,
}) {
  return withAtomicLock(async () => {
    const db = await getDb();
    const amt = roundMoney(amount);
    if (amt <= 0) throw new Error('Credit amount must be greater than zero.');

    if (idempotencyKey) {
      const dup = await db.collection('wallet_ledger').findOne({ idempotencyKey });
      if (dup) {
        const w = await ensureWallet(userId);
        return { wallet: w, ledger: dup, duplicate: true };
      }
    }

    const before = await ensureWallet(userId);
    const updated = await db.collection('wallets').findOneAndUpdate(
      { userId },
      {
        $inc: { currentBalance: amt },
        $set: { updatedAt: new Date().toISOString() },
      },
      { returnDocument: 'after' }
    );

    const ledger = await appendLedger(db, {
      userId,
      balanceType: 'CURRENT',
      direction: 'CREDIT',
      amount: amt,
      balanceBefore: before.currentBalance,
      balanceAfter: updated.currentBalance,
      referenceType,
      referenceId,
      idempotencyKey,
      description,
      isDemo,
    });

    return { wallet: updated, ledger, duplicate: false };
  });
}

/**
 * Atomically hold funds from Current Balance -> Pending Balance when a recharge starts.
 */
export async function holdForRecharge({
  userId,
  amount,
  transactionId,
  idempotencyKey,
  description,
  isDemo = true,
}) {
  return withAtomicLock(async () => {
    const db = await getDb();
    const amt = roundMoney(amount);
    if (amt <= 0) throw new Error('Recharge amount must be greater than zero.');

    const debitKey = `${idempotencyKey}:HOLD_DEBIT`;
    const dup = await db.collection('wallet_ledger').findOne({ idempotencyKey: debitKey });
    if (dup) {
      return { ok: false, duplicate: true, error: 'Duplicate recharge request detected.' };
    }

    const before = await ensureWallet(userId);
    if (roundMoney(before.currentBalance) < amt) {
      return {
        ok: false,
        error: `Insufficient Current Balance. Available: ₹${roundMoney(before.currentBalance).toFixed(2)}, Required: ₹${amt.toFixed(2)}.`,
      };
    }

    const updated = await db.collection('wallets').findOneAndUpdate(
      { userId, currentBalance: { $gte: amt } },
      {
        $inc: { currentBalance: -amt, pendingBalance: amt },
        $set: { updatedAt: new Date().toISOString() },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return { ok: false, error: 'Insufficient Current Balance for atomic hold.' };
    }

    await appendLedger(db, {
      userId,
      balanceType: 'CURRENT',
      direction: 'DEBIT',
      amount: amt,
      balanceBefore: before.currentBalance,
      balanceAfter: updated.currentBalance,
      referenceType: 'RECHARGE_HOLD',
      referenceId: transactionId,
      idempotencyKey: debitKey,
      description: `${description} (Moved to Pending Balance)`,
      isDemo,
    });

    await appendLedger(db, {
      userId,
      balanceType: 'PENDING',
      direction: 'CREDIT',
      amount: amt,
      balanceBefore: before.pendingBalance,
      balanceAfter: updated.pendingBalance,
      referenceType: 'RECHARGE_HOLD',
      referenceId: transactionId,
      idempotencyKey: `${idempotencyKey}:HOLD_PENDING`,
      description: `${description} (Held under processing)`,
      isDemo,
    });

    return { ok: true, wallet: updated };
  });
}

/**
 * Atomically settle a confirmed SUCCESSFUL recharge:
 * - Releases held Pending Balance
 * - Credits Commission Balance (strictly once, idempotent)
 */
export async function settleRechargeSuccess({
  userId,
  amount,
  commissionAmount = 0,
  transactionId,
  description,
  isDemo = true,
}) {
  return withAtomicLock(async () => {
    const db = await getDb();
    const amt = roundMoney(amount);
    const comm = roundMoney(commissionAmount);
    const settleKey = `SETTLE_SUCCESS:${transactionId}`;

    const existing = await db.collection('wallet_ledger').findOne({ idempotencyKey: settleKey });
    if (existing) {
      const w = await ensureWallet(userId);
      return { ok: true, duplicate: true, wallet: w };
    }

    const before = await ensureWallet(userId);
    const incOps = { pendingBalance: -amt };
    if (comm > 0) incOps.commissionBalance = comm;

    const updated = await db.collection('wallets').findOneAndUpdate(
      { userId, pendingBalance: { $gte: amt } },
      {
        $inc: incOps,
        $set: { updatedAt: new Date().toISOString() },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return { ok: false, error: 'Pending balance mismatch during recharge settlement.' };
    }

    await appendLedger(db, {
      userId,
      balanceType: 'PENDING',
      direction: 'DEBIT',
      amount: amt,
      balanceBefore: before.pendingBalance,
      balanceAfter: updated.pendingBalance,
      referenceType: 'RECHARGE_SETTLEMENT',
      referenceId: transactionId,
      idempotencyKey: settleKey,
      description: `${description} (Settled Successful)`,
      isDemo,
    });

    if (comm > 0) {
      await appendLedger(db, {
        userId,
        balanceType: 'COMMISSION',
        direction: 'CREDIT',
        amount: comm,
        balanceBefore: before.commissionBalance,
        balanceAfter: updated.commissionBalance,
        referenceType: 'COMMISSION_CREDIT',
        referenceId: transactionId,
        idempotencyKey: `COMM_CREDIT:${transactionId}`,
        description: `Commission earned for ${transactionId}`,
        isDemo,
      });
    }

    return { ok: true, duplicate: false, wallet: updated };
  });
}

/**
 * Atomically refund a confirmed FAILED recharge from Pending Balance -> Current Balance.
 * Enforces strict duplicate-refund prevention via idempotency key.
 */
export async function refundRechargeFailure({
  userId,
  amount,
  transactionId,
  description,
  isDemo = true,
}) {
  return withAtomicLock(async () => {
    const db = await getDb();
    const amt = roundMoney(amount);
    const refundKey = `REFUND_FAILED:${transactionId}`;

    const existing = await db.collection('wallet_ledger').findOne({ idempotencyKey: refundKey });
    if (existing) {
      const w = await ensureWallet(userId);
      return { ok: true, duplicate: true, wallet: w };
    }

    const before = await ensureWallet(userId);
    const updated = await db.collection('wallets').findOneAndUpdate(
      { userId, pendingBalance: { $gte: amt } },
      {
        $inc: { pendingBalance: -amt, currentBalance: amt },
        $set: { updatedAt: new Date().toISOString() },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return { ok: false, error: 'Pending balance mismatch while processing automatic refund.' };
    }

    await appendLedger(db, {
      userId,
      balanceType: 'PENDING',
      direction: 'DEBIT',
      amount: amt,
      balanceBefore: before.pendingBalance,
      balanceAfter: updated.pendingBalance,
      referenceType: 'RECHARGE_REFUND_RELEASE',
      referenceId: transactionId,
      idempotencyKey: `${refundKey}:PENDING`,
      description: `${description} (Released from Pending)`,
      isDemo,
    });

    await appendLedger(db, {
      userId,
      balanceType: 'CURRENT',
      direction: 'CREDIT',
      amount: amt,
      balanceBefore: before.currentBalance,
      balanceAfter: updated.currentBalance,
      referenceType: 'RECHARGE_REFUND',
      referenceId: transactionId,
      idempotencyKey: refundKey,
      description: `Automatic Refund for Failed Transaction ${transactionId}`,
      isDemo,
    });

    return { ok: true, duplicate: false, wallet: updated };
  });
}

/**
 * Transfer Commission Balance -> Current Balance (minimum ₹50 enforced).
 */
export async function transferCommissionToCurrent({
  userId,
  amount,
  minTransfer = 50,
  idempotencyKey,
  isDemo = true,
}) {
  return withAtomicLock(async () => {
    const db = await getDb();
    const transferId = generateId('TRF');
    const key = idempotencyKey || `COMM_TRF:${transferId}`;

    const dup = await db.collection('wallet_ledger').findOne({ idempotencyKey: `${key}:DEBIT` });
    if (dup) {
      return { ok: false, duplicate: true, error: 'Duplicate commission transfer request.' };
    }

    const before = await ensureWallet(userId);
    const check = validateCommissionTransfer(amount, before.commissionBalance, minTransfer);
    if (!check.valid) {
      return { ok: false, error: check.message };
    }

    const amt = check.value;
    const updated = await db.collection('wallets').findOneAndUpdate(
      { userId, commissionBalance: { $gte: amt } },
      {
        $inc: { commissionBalance: -amt, currentBalance: amt },
        $set: { updatedAt: new Date().toISOString() },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return { ok: false, error: 'Insufficient Commission Balance.' };
    }

    await appendLedger(db, {
      userId,
      balanceType: 'COMMISSION',
      direction: 'DEBIT',
      amount: amt,
      balanceBefore: before.commissionBalance,
      balanceAfter: updated.commissionBalance,
      referenceType: 'COMMISSION_TRANSFER',
      referenceId: transferId,
      idempotencyKey: `${key}:DEBIT`,
      description: `Commission transferred to Current Balance (${transferId})`,
      isDemo,
    });

    await appendLedger(db, {
      userId,
      balanceType: 'CURRENT',
      direction: 'CREDIT',
      amount: amt,
      balanceBefore: before.currentBalance,
      balanceAfter: updated.currentBalance,
      referenceType: 'COMMISSION_TRANSFER',
      referenceId: transferId,
      idempotencyKey: `${key}:CREDIT`,
      description: `Received from Commission Balance (${transferId})`,
      isDemo,
    });

    return { ok: true, transferId, amount: amt, wallet: updated };
  });
}

/**
 * Atomically assign ONE available redeem code and deduct Current Balance ONLY after assignment succeeds.
 */
export async function purchaseRedeemCodeAtomic({
  userId,
  productId,
  idempotencyKey,
}) {
  return withAtomicLock(async () => {
    const db = await getDb();
    const key = idempotencyKey || generateId('RIDEMP');

    const existingTx = await db.collection('transactions').findOne({ idempotencyKey: key });
    if (existingTx) {
      return { ok: false, duplicate: true, error: 'Duplicate redeem code purchase prevented.' };
    }

    const product = await db.collection('redeem_products').findOne({ _id: productId, isActive: true });
    if (!product) {
      return { ok: false, status: 404, error: 'Selected redeem code product is unavailable.' };
    }

    const price = roundMoney(product.price);
    const beforeWallet = await ensureWallet(userId);
    if (roundMoney(beforeWallet.currentBalance) < price) {
      return {
        ok: false,
        status: 400,
        error: `Insufficient Current Balance. Need ₹${price.toFixed(2)}, available ₹${roundMoney(beforeWallet.currentBalance).toFixed(2)}.`,
      };
    }

    const transactionId = generateId('TXN');
    const now = new Date().toISOString();

    // Step 1: Atomically claim an AVAILABLE code so two users can NEVER receive the same code.
    const assignedCode = await db.collection('redeem_codes').findOneAndUpdate(
      { productId: product._id, status: 'AVAILABLE' },
      {
        $set: {
          status: 'ASSIGNED',
          assignedUserId: userId,
          assignedTransactionId: transactionId,
          assignedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!assignedCode) {
      return { ok: false, status: 409, error: 'Out of stock. No available codes remaining for this product.' };
    }

    // Step 2: Deduct Current Balance ONLY after code assignment succeeded.
    const updatedWallet = await db.collection('wallets').findOneAndUpdate(
      { userId, currentBalance: { $gte: price } },
      {
        $inc: { currentBalance: -price },
        $set: { updatedAt: now },
      },
      { returnDocument: 'after' }
    );

    if (!updatedWallet) {
      // Roll back code assignment if balance check failed concurrently
      await db.collection('redeem_codes').updateOne(
        { _id: assignedCode._id },
        {
          $set: {
            status: 'AVAILABLE',
            assignedUserId: null,
            assignedTransactionId: null,
            assignedAt: null,
          },
        }
      );
      return { ok: false, status: 400, error: 'Wallet deduction failed due to insufficient balance.' };
    }

    await appendLedger(db, {
      userId,
      balanceType: 'CURRENT',
      direction: 'DEBIT',
      amount: price,
      balanceBefore: beforeWallet.currentBalance,
      balanceAfter: updatedWallet.currentBalance,
      referenceType: 'REDEEM_CODE_PURCHASE',
      referenceId: transactionId,
      idempotencyKey: `${key}:DEBIT`,
      description: `Purchased ${product.title}`,
      isDemo: product.isDemo !== false,
    });

    const txDoc = {
      _id: transactionId,
      userId,
      type: 'REDEEM_CODE',
      operatorCode: product.brand,
      operatorName: product.title,
      targetNumber: assignedCode._id,
      productId: product._id,
      redeemCodeId: assignedCode._id,
      redeemCodeValue: assignedCode.codeValue,
      amount: price,
      faceValue: product.faceValue,
      commissionAmount: 0,
      commissionCredited: false,
      refunded: false,
      status: 'SUCCESSFUL',
      providerMode: product.isDemo !== false ? 'STANDARD' : 'LIVE',
      isDemo: product.isDemo !== false,
      idempotencyKey: key,
      providerRef: assignedCode._id,
      statusMessage: 'Redeem code assigned successfully.',
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('transactions').insertOne(txDoc);

    return {
      ok: true,
      transaction: txDoc,
      assignedCode: {
        codeId: assignedCode._id,
        codeValue: assignedCode.codeValue,
        productTitle: product.title,
        brand: product.brand,
        faceValue: product.faceValue,
        price,
        isDemo: product.isDemo !== false,
        assignedAt: now,
      },
      wallet: updatedWallet,
    };
  });
}

/**
 * Purchase a Google Play Redeem Code strictly by user-entered INR amount (₹10 – ₹5,000).
 * Atomically deducts Current Balance, credits applicable commission, and instantaneously
 * generates and delivers a unique voucher code via API (never held as Pending).
 */
export async function purchaseGooglePlayByAmountAtomic({
  userId,
  userName = '',
  userMobile = '',
  customerMobile = '',
  amount,
  idempotencyKey,
}) {
  return withAtomicLock(async () => {
    const db = await getDb();
    const key = idempotencyKey || generateId('GPIDEMP');
    const amt = roundMoney(amount);
    const cleanCustomerMobile = String(customerMobile || '').replace(/\D/g, '').slice(-10);

    if (!/^[6-9]\d{9}$/.test(cleanCustomerMobile)) {
      return {
        ok: false,
        status: 400,
        error: 'Enter a valid 10-digit customer mobile number (starts with 6–9).',
      };
    }

    if (!Number.isFinite(amt) || amt < 10 || amt > 5000 || !Number.isInteger(amt)) {
      return {
        ok: false,
        status: 400,
        error: 'Enter a valid Google Play amount between ₹10 and ₹5,000 (whole rupees).',
      };
    }

    const existingTx = await db.collection('transactions').findOne({ idempotencyKey: key });
    if (existingTx) {
      return { ok: false, duplicate: true, status: 409, error: 'Duplicate Google Play redeem request prevented.' };
    }

    const gpRule = await db.collection('commissions').findOne({
      serviceType: 'REDEEM_CODE',
      operatorCode: 'GOOGLE_PLAY',
    });
    if (gpRule && gpRule.isActive === false) {
      return {
        ok: false,
        status: 503,
        error: 'Google Play Redeem Code service is temporarily disabled by administrator.',
      };
    }
    const commCalc = calculateCommission(amt, gpRule);
    const totalPayable = commCalc.totalPayable;

    const beforeWallet = await ensureWallet(userId);
    if (roundMoney(beforeWallet.currentBalance) < totalPayable) {
      return {
        ok: false,
        status: 400,
        error: `Insufficient Current Balance. Need ₹${totalPayable.toFixed(2)}, available ₹${roundMoney(beforeWallet.currentBalance).toFixed(2)}.`,
      };
    }

    const transactionId = generateId('TXN');
    const now = new Date().toISOString();

    // Atomically debit Current Balance and issue instant API-generated Google Play voucher code
    const incWallet = { currentBalance: -totalPayable };
    if (commCalc.commissionAmount > 0) {
      incWallet.commissionBalance = commCalc.commissionAmount;
    }
    const updatedWallet = await db.collection('wallets').findOneAndUpdate(
      { userId, currentBalance: { $gte: totalPayable } },
      {
        $inc: incWallet,
        $set: { updatedAt: now },
      },
      { returnDocument: 'after' }
    );

    if (!updatedWallet) {
      return { ok: false, status: 400, error: 'Wallet deduction failed due to insufficient balance.' };
    }

    const generatedCodeId = generateId('GPCODE');
    const generatedCodeValue = generateGooglePlayVoucherCode();
    const productId = `GP_INSTANT_${amt}`;

    await appendLedger(db, {
      userId,
      balanceType: 'CURRENT',
      direction: 'DEBIT',
      amount: totalPayable,
      balanceBefore: beforeWallet.currentBalance,
      balanceAfter: updatedWallet.currentBalance,
      referenceType: 'REDEEM_CODE_PURCHASE',
      referenceId: transactionId,
      idempotencyKey: `${key}:DEBIT`,
      description:
        commCalc.serviceCharge > 0
          ? `Google Play Redeem Code ₹${amt} (incl. ₹${commCalc.serviceCharge.toFixed(2)} service charge)`
          : `Google Play Redeem Code ₹${amt}`,
      isDemo: true,
    });

    if (commCalc.commissionAmount > 0) {
      await appendLedger(db, {
        userId,
        balanceType: 'COMMISSION',
        direction: 'CREDIT',
        amount: commCalc.commissionAmount,
        balanceBefore: beforeWallet.commissionBalance,
        balanceAfter: updatedWallet.commissionBalance,
        referenceType: 'COMMISSION_CREDIT',
        referenceId: transactionId,
        idempotencyKey: `COMM_CREDIT:${transactionId}`,
        description: `Commission earned for ${transactionId}`,
        isDemo: true,
      });
    }

    await db.collection('redeem_codes').insertOne({
      _id: generatedCodeId,
      productId,
      brand: 'Google Play',
      faceValue: amt,
      price: amt,
      codeValue: generatedCodeValue,
      status: 'ASSIGNED',
      assignedUserId: userId,
      assignedCustomerMobile: cleanCustomerMobile,
      assignedTransactionId: transactionId,
      assignedAt: now,
      isDemo: true,
      createdAt: now,
    });

    const txDoc = {
      _id: transactionId,
      userId,
      userName,
      userMobile,
      customerMobile: cleanCustomerMobile,
      type: 'REDEEM_CODE',
      operatorCode: 'GOOGLE_PLAY',
      operatorName: `Google Play Redeem Code ₹${amt}`,
      targetNumber: cleanCustomerMobile,
      productId,
      redeemCodeId: generatedCodeId,
      redeemCodeValue: generatedCodeValue,
      amount: amt,
      serviceCharge: commCalc.serviceCharge,
      totalPayable,
      faceValue: amt,
      commissionAmount: commCalc.commissionAmount,
      commissionRateType: commCalc.rateType,
      commissionRateValue: commCalc.rateValue,
      commissionCredited: commCalc.commissionAmount > 0,
      refunded: false,
      status: 'SUCCESSFUL',
      providerMode: 'STANDARD',
      isDemo: true,
      idempotencyKey: key,
      providerRef: generatedCodeId,
      operatorRef: generatedCodeId,
      statusMessage: `Google Play Redeem Code (₹${amt}) generated and delivered instantly for ${cleanCustomerMobile}.`,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('transactions').insertOne(txDoc);

    return {
      ok: true,
      deliveryStatus: 'ASSIGNED',
      transaction: txDoc,
      assignedCode: {
        codeId: generatedCodeId,
        codeValue: generatedCodeValue,
        customerMobile: cleanCustomerMobile,
        productTitle: `Google Play Redeem Code ₹${amt}`,
        brand: 'Google Play',
        faceValue: amt,
        price: totalPayable,
        isDemo: true,
        assignedAt: now,
      },
      wallet: updatedWallet,
    };
  });
}

/**
 * Audited Super Admin balance adjustment (always writes permanent ledger entry).
 */
export async function adminAdjustWallet({
  userId,
  balanceType,
  direction,
  amount,
  reason,
  adminId,
}) {
  return withAtomicLock(async () => {
    const db = await getDb();
    const amt = roundMoney(amount);
    if (amt <= 0) return { ok: false, error: 'Adjustment amount must be greater than zero.' };

    const fieldMap = {
      CURRENT: 'currentBalance',
      PENDING: 'pendingBalance',
      COMMISSION: 'commissionBalance',
    };
    const field = fieldMap[balanceType];
    if (!field) return { ok: false, error: 'Invalid balance type.' };

    const before = await ensureWallet(userId);
    const delta = direction === 'CREDIT' ? amt : -amt;
    if (direction === 'DEBIT' && roundMoney(before[field]) < amt) {
      return { ok: false, error: `Cannot debit ₹${amt.toFixed(2)} — insufficient ${balanceType} balance.` };
    }

    const filter = direction === 'DEBIT' ? { userId, [field]: { $gte: amt } } : { userId };
    const updated = await db.collection('wallets').findOneAndUpdate(
      filter,
      {
        $inc: { [field]: delta },
        $set: { updatedAt: new Date().toISOString() },
      },
      { returnDocument: 'after' }
    );

    if (!updated) return { ok: false, error: 'Atomic balance adjustment failed.' };

    const adjId = generateId('ADJ');
    const ledger = await appendLedger(db, {
      userId,
      balanceType,
      direction,
      amount: amt,
      balanceBefore: before[field],
      balanceAfter: updated[field],
      referenceType: 'ADMIN_ADJUSTMENT',
      referenceId: adjId,
      idempotencyKey: `ADMIN_ADJ:${adjId}`,
      description: `Admin ${direction.toLowerCase()} (${adminId}): ${reason}`,
      isDemo: true,
    });

    return { ok: true, adjustmentId: adjId, wallet: updated, ledger };
  });
}
