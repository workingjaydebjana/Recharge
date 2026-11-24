import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser, verifyUserWalletPin } from '@/lib/auth.js';
import { createNotification } from '@/lib/notifications.js';
import { cleanString } from '@/lib/security.js';
import { purchaseGooglePlayByAmountAtomic, purchaseRedeemCodeAtomic } from '@/lib/wallet.js';

export async function GET(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = await getDb();

  // Only return Google Play assigned codes + recent Google Play redeem transactions for THIS user
  const allProducts = await db.collection('redeem_products').find({}).toArray();
  const productLookup = Object.fromEntries(allProducts.map((p) => [p._id, p]));

  const myAssignedCodes = await db
    .collection('redeem_codes')
    .find({ assignedUserId: auth.user._id, status: 'ASSIGNED' })
    .sort({ assignedAt: -1 })
    .toArray();

  const myRedeemTxs = await db
    .collection('transactions')
    .find({ userId: auth.user._id, type: 'REDEEM_CODE' })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  const txLookup = Object.fromEntries(myRedeemTxs.map((t) => [t._id, t]));

  const assignedTxIds = new Set();
  const purchasedCodes = myAssignedCodes
    .filter((c) => {
      const prod = productLookup[c.productId];
      if (!prod) return true;
      return /google\s*play/i.test(String(prod.brand || prod.title || ''));
    })
    .map((c) => {
      if (c.assignedTransactionId) assignedTxIds.add(c.assignedTransactionId);
      const prod = productLookup[c.productId];
      const linkedTx = c.assignedTransactionId ? txLookup[c.assignedTransactionId] : null;
      const faceVal = prod?.faceValue || c.faceValue || linkedTx?.faceValue || linkedTx?.amount || 0;
      return {
        codeId: c._id,
        codeValue: c.codeValue,
        productId: c.productId,
        productTitle: prod?.title || (faceVal ? `Google Play Redeem Code ₹${faceVal}` : 'Google Play Redeem Code'),
        brand: 'Google Play',
        faceValue: faceVal,
        price: prod?.price || c.price || linkedTx?.amount || faceVal,
        customerMobile:
          c.assignedCustomerMobile ||
          linkedTx?.customerMobile ||
          (/^[6-9]\d{9}$/.test(String(linkedTx?.targetNumber || '')) ? linkedTx.targetNumber : ''),
        transactionId: c.assignedTransactionId,
        assignedAt: c.assignedAt,
        deliveryStatus: 'ASSIGNED',
      };
    });

  // Also include pending or non-code Google Play redeem orders so user always sees full order history
  const orders = myRedeemTxs
    .filter((tx) => !assignedTxIds.has(tx._id))
    .map((tx) => ({
      codeId: tx._id,
      codeValue: tx.redeemCodeValue || '',
      productId: tx.productId || 'GOOGLE_PLAY',
      productTitle: tx.operatorName || `Google Play Redeem Code ₹${tx.amount}`,
      brand: 'Google Play',
      faceValue: tx.faceValue || tx.amount,
      price: tx.amount,
      customerMobile:
        tx.customerMobile ||
        (/^[6-9]\d{9}$/.test(String(tx.targetNumber || '')) ? tx.targetNumber : ''),
      transactionId: tx._id,
      assignedAt: tx.createdAt,
      deliveryStatus: tx.status,
      statusMessage: tx.statusMessage || '',
    }));

  const history = [...purchasedCodes, ...orders].sort(
    (a, b) => new Date(b.assignedAt || 0).getTime() - new Date(a.assignedAt || 0).getTime()
  );

  return NextResponse.json({
    ok: true,
    product: {
      code: 'GOOGLE_PLAY',
      title: 'Google Play Redeem Code',
      brand: 'Google Play',
      minAmount: 10,
      maxAmount: 5000,
    },
    purchasedCodes: history,
  });
}

export async function POST(req) {
  const auth = await requireUser(req, { allowSuspended: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const amountRaw = body.amount !== undefined && body.amount !== null ? Number(body.amount) : null;
    const customerMobile = cleanString(body.customerMobile, 20).replace(/\D/g, '').slice(-10);
    const productId = cleanString(body.productId, 60);
    const idempotencyKey = cleanString(body.idempotencyKey, 100);

    if (amountRaw !== null && !/^[6-9]\d{9}$/.test(customerMobile)) {
      return NextResponse.json(
        { error: 'Enter a valid 10-digit customer mobile number (starts with 6–9).' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const settings = await db.collection('settings').findOne({ _id: 'platform_settings' });
    if (settings?.maintenanceMode) {
      return NextResponse.json({ error: 'Platform is in maintenance mode.' }, { status: 503 });
    }
    if (settings && settings.redeemCodeEnabled === false) {
      return NextResponse.json({ error: 'Google Play Redeem Code service is temporarily disabled by administrator.' }, { status: 503 });
    }
    const gpRule = await db.collection('commissions').findOne({
      serviceType: 'REDEEM_CODE',
      operatorCode: 'GOOGLE_PLAY',
    });
    if (gpRule && gpRule.isActive === false) {
      return NextResponse.json(
        { error: 'Google Play Redeem Code service is temporarily disabled by administrator.' },
        { status: 503 }
      );
    }

    // Server-side 6-digit Wallet PIN verification before wallet debit
    const pinCheck = await verifyUserWalletPin(auth.user, body.walletPin);
    if (!pinCheck.ok) {
      return NextResponse.json(
        { error: pinCheck.error, code: pinCheck.code },
        { status: pinCheck.status || 400 }
      );
    }

    let result;
    if (amountRaw !== null && Number.isFinite(amountRaw)) {
      result = await purchaseGooglePlayByAmountAtomic({
        userId: auth.user._id,
        userName: auth.user.fullName,
        userMobile: auth.user.mobile,
        customerMobile,
        amount: amountRaw,
        idempotencyKey,
      });
    } else if (productId) {
      result = await purchaseRedeemCodeAtomic({
        userId: auth.user._id,
        productId,
        idempotencyKey,
      });
    } else {
      return NextResponse.json(
        { error: 'Enter a valid Google Play Redeem Code amount (₹10 – ₹5,000).' },
        { status: 400 }
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || (result.duplicate ? 409 : 400) }
      );
    }

    if (result.assignedCode) {
      await createNotification({
        userId: auth.user._id,
        title: 'Google Play Redeem Code Delivered',
        message: `${result.assignedCode.productTitle} generated and delivered instantly via API (${result.transaction._id}). Copy your code from Redeem Code.`,
        category: 'REDEEM',
        referenceId: result.transaction._id,
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to complete Google Play redeem code order.' }, { status: 500 });
  }
}
