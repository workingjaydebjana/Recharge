import crypto from 'node:crypto';
import { getDb, withAtomicLock } from './db.js';
import { roundMoney } from './finance.js';
import { creditCurrentBalance, ensureWallet } from './wallet.js';
import { createNotification } from './notifications.js';
import { cleanString, decryptSecret } from './security.js';

const FAMGATEWAY_BASE_URL = 'https://famgateway.in';
const FAMGATEWAY_HOST = 'famgateway.in';
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Resolve FamGateway API key strictly on the server:
 * 1. Primary: process.env.FAMGATEWAY_API_KEY (never NEXT_PUBLIC_)
 * 2. Secondary: AES-256-GCM encrypted Super Admin provider config in MongoDB
 */
export async function getFamGatewayApiKey(dbInstance = null) {
  const envKey = String(process.env.FAMGATEWAY_API_KEY || '').trim();
  if (envKey) return envKey;

  const db = dbInstance || (await getDb());
  const provider = await db.collection('recharge_providers').findOne({ _id: 'PROVIDER_FAMGATEWAY_UPI' });
  if (provider?.apiKeyEncrypted) {
    const decrypted = decryptSecret(provider.apiKeyEncrypted);
    if (decrypted) return decrypted.trim();
  }
  return '';
}

/**
 * Validate URLs returned by FamGateway to prevent open redirects or unsafe schemes.
 */
function sanitizeFamGatewayUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === FAMGATEWAY_HOST) {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

function sanitizeUpiIntent(rawIntent) {
  const str = String(rawIntent || '').trim();
  if (str.toLowerCase().startsWith('upi://pay?')) {
    return str;
  }
  return '';
}

/**
 * Resolve canonical public origin for webhook & checkout return URLs.
 */
export function resolveAppOrigin(req) {
  const envUrl = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && /^https?:\/\//i.test(envUrl) && !/localhost|127\.0\.0\.1/i.test(envUrl)) {
    return envUrl;
  }
  if (req) {
    const fwdProto = req.headers.get('x-forwarded-proto') || 'https';
    const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    if (fwdHost && !/localhost|127\.0\.0\.1/i.test(fwdHost)) {
      return `${fwdProto.split(',')[0].trim()}://${fwdHost.split(',')[0].trim()}`;
    }
  }
  return envUrl || 'http://localhost:3000';
}

/**
 * Create a dynamic UPI payment order via FamGateway REST API (POST /api/create-order).
 */
export async function createFamGatewayOrder({
  apiKey,
  amount,
  customerName,
  customerEmail,
  customerPhone,
  redirectUrl,
  webhookUrl,
}) {
  if (!apiKey) {
    throw new Error('FamGateway API key is not configured on the server.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const payload = {
      api_key: apiKey,
      amount: Number(roundMoney(amount).toFixed(2)),
    };
    if (customerName) payload.customer_name = cleanString(customerName, 80);
    if (customerEmail) payload.customer_email = cleanString(customerEmail, 120);
    if (customerPhone) payload.customer_phone = cleanString(customerPhone, 20);
    if (redirectUrl) payload.redirect_url = redirectUrl;
    if (webhookUrl) payload.webhook_url = webhookUrl;

    const response = await fetch(`${FAMGATEWAY_BASE_URL}/api/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }

    if (!response.ok || !parsed || String(parsed.status || '').toLowerCase() !== 'success' || !parsed.data?.order_id) {
      const gatewayMsg = parsed?.message || parsed?.error || `Gateway returned HTTP ${response.status}`;
      throw new Error(String(gatewayMsg));
    }

    const d = parsed.data;
    const orderId = cleanString(String(d.order_id || ''), 60);
    if (!/^[A-Za-z0-9_-]{4,60}$/.test(orderId)) {
      throw new Error('Invalid order identifier received from payment gateway.');
    }

    const qrUrl =
      sanitizeFamGatewayUrl(d.qr_url) ||
      `${FAMGATEWAY_BASE_URL}/api/qr-image.php?order_id=${encodeURIComponent(orderId)}`;
    const checkoutUrl =
      sanitizeFamGatewayUrl(d.checkout_url) ||
      `${FAMGATEWAY_BASE_URL}/pay.php?order_id=${encodeURIComponent(orderId)}`;
    const upiIntent = sanitizeUpiIntent(d.upi_intent);

    return {
      orderId,
      qrUrl,
      checkoutUrl,
      upiId: cleanString(String(d.upi_id || ''), 100),
      upiIntent,
      amount: roundMoney(Number(d.payable_amount || d.amount || amount)),
      createdAtIst: cleanString(String(d.created_at_ist || ''), 40),
      expiresAtIst: cleanString(String(d.expires_at_ist || ''), 40),
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Payment gateway timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Authoritative server-to-server order verification against FamGateway.
 * Calls GET /api/verify-order.php first (authenticated with API key).
 */
export async function verifyFamGatewayOrder({ apiKey, orderId }) {
  const cleanId = cleanString(orderId, 60);
  if (!/^[A-Za-z0-9_-]{4,60}$/.test(cleanId)) {
    throw new Error('Invalid order ID.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const verifyUrl = `${FAMGATEWAY_BASE_URL}/api/verify-order.php?api_key=${encodeURIComponent(
      apiKey
    )}&order_id=${encodeURIComponent(cleanId)}`;

    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }

    // Normalize both top-level and nested { status, data: { ... } } responses
    const payload = parsed?.data && typeof parsed.data === 'object' ? { ...parsed, ...parsed.data } : parsed || {};
    const rawStatus = String(payload.payment_status || payload.order_status || payload.status || '').toLowerCase();

    if (rawStatus === 'success' || rawStatus === 'paid' || rawStatus === 'completed') {
      return {
        status: 'success',
        orderId: cleanString(String(payload.order_id || cleanId), 60),
        amount: Number(payload.payable_amount || payload.amount || 0) || null,
        utr: cleanString(String(payload.utr || ''), 60),
        transactionId: cleanString(String(payload.transaction_id || ''), 80),
        senderName: cleanString(String(payload.sender_name || ''), 100),
        paymentTime: cleanString(String(payload.payment_time || ''), 60),
      };
    }

    if (rawStatus === 'expired' || rawStatus === 'failed' || rawStatus === 'cancelled') {
      return {
        status: 'expired',
        orderId: cleanId,
      };
    }

    return {
      status: 'pending',
      orderId: cleanId,
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Verification timed out. Retrying shortly.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify FamGateway HMAC-SHA256 webhook signature using timing-safe comparison.
 * Expected = HMAC_SHA256(raw_post_body_bytes, merchant_api_key)
 */
export function verifyFamGatewayWebhookSignature(rawBodyText, signatureHeader, apiKey) {
  if (!rawBodyText || !signatureHeader || !apiKey) return false;
  const receivedHex = String(signatureHeader).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(receivedHex)) return false;

  const expectedHex = crypto
    .createHmac('sha256', apiKey)
    .update(Buffer.from(rawBodyText, 'utf8'))
    .digest('hex')
    .toLowerCase();

  const receivedBuf = Buffer.from(receivedHex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (receivedBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

/**
 * Atomically settle a verified FamGateway UPI payment into the user's Current Balance.
 * Safe against concurrent webhook + polling calls via withAtomicLock and unique ledger idempotencyKey.
 */
export async function settleFamGatewayDeposit({
  orderId,
  paidAmount = null,
  utr = '',
  gatewayTransactionId = '',
  senderName = '',
  paymentTime = '',
  source = 'VERIFY_API',
}) {
  const cleanOrderId = cleanString(orderId, 60);
  if (!cleanOrderId) {
    return { ok: false, error: 'Missing order ID.', status: 400 };
  }

  return withAtomicLock(async () => {
    const db = await getDb();
    const deposit = await db.collection('deposits').findOne({
      gatewayOrderId: cleanOrderId,
      gatewayProvider: 'FAMGATEWAY',
    });

    if (!deposit) {
      return { ok: false, error: 'Deposit order not found.', status: 404 };
    }

    if (deposit.status === 'APPROVED') {
      const wallet = await ensureWallet(deposit.userId);
      return {
        ok: true,
        alreadySettled: true,
        deposit,
        wallet,
      };
    }

    // Verify amount integrity if gateway reported a numeric paid amount
    const expectedAmount = roundMoney(deposit.amount);
    if (paidAmount !== null && Number.isFinite(Number(paidAmount)) && Number(paidAmount) > 0) {
      const receivedAmount = roundMoney(Number(paidAmount));
      if (receivedAmount + 0.01 < expectedAmount) {
        return {
          ok: false,
          error: `Paid amount (₹${receivedAmount.toFixed(2)}) does not match order amount (₹${expectedAmount.toFixed(2)}).`,
          status: 400,
        };
      }
    }

    const cleanUtr = cleanString(String(utr || ''), 60);
    const cleanTxn = cleanString(String(gatewayTransactionId || ''), 80);
    const cleanSender = cleanString(String(senderName || ''), 100);
    const cleanTime = cleanString(String(paymentTime || ''), 60);

    const creditResult = await creditCurrentBalance({
      userId: deposit.userId,
      amount: expectedAmount,
      referenceType: 'FAMGATEWAY_UPI_DEPOSIT',
      referenceId: deposit._id,
      idempotencyKey: `FAMGW_SETTLE:${cleanOrderId}`,
      description: `UPI Wallet Deposit via FamGateway (${cleanOrderId}${cleanUtr ? ` · UTR ${cleanUtr}` : ''})`,
      isDemo: false,
    });

    const now = new Date().toISOString();
    const updatedDeposit = await db.collection('deposits').findOneAndUpdate(
      { _id: deposit._id },
      {
        $set: {
          status: 'APPROVED',
          utr: cleanUtr || deposit.utr || '',
          referenceNumber: cleanUtr || cleanOrderId,
          gatewayTransactionId: cleanTxn || deposit.gatewayTransactionId || '',
          senderName: cleanSender || deposit.senderName || '',
          paymentTime: cleanTime || deposit.paymentTime || '',
          settlementSource: source,
          adminRemark: `Auto-verified via FamGateway UPI (${source})`,
          reviewedBy: 'FAMGATEWAY_AUTO',
          reviewedAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' }
    );

    if (!creditResult.duplicate) {
      await createNotification({
        userId: deposit.userId,
        title: 'UPI Balance Added Successfully',
        message: `₹${expectedAmount.toFixed(2)} credited to your Current Balance via UPI.${
          cleanUtr ? ` UTR: ${cleanUtr}.` : ''
        } Order: ${cleanOrderId}.`,
        category: 'DEPOSIT',
        referenceId: deposit._id,
      });
    }

    return {
      ok: true,
      alreadySettled: Boolean(creditResult.duplicate),
      deposit: updatedDeposit || deposit,
      wallet: creditResult.wallet,
      ledger: creditResult.ledger,
    };
  });
}
