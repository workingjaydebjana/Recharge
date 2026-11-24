import { getDb } from './db.js';
import {
  generateId,
  generateOtpCode,
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyOtpHash,
  verifyPassword,
} from './security.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const OTP_TTL_MS = 1000 * 60 * 5; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;

export const USER_SESSION_COOKIE = 'paysetu_user_session';
export const ADMIN_SESSION_COOKIE = 'paysetu_admin_session';

function isHttpsRequest(req) {
  try {
    const proto = req?.headers?.get?.('x-forwarded-proto') || '';
    if (proto.includes('https')) return true;
    const url = req?.url || '';
    return url.startsWith('https://');
  } catch {
    return false;
  }
}

export function attachSessionCookie(res, cookieName, token, req) {
  const secure = isHttpsRequest(req);
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    sameSite: secure ? 'none' : 'lax',
    secure,
  });
  return res;
}

export function clearSessionCookies(res, req) {
  const secure = isHttpsRequest(req);
  for (const name of [USER_SESSION_COOKIE, ADMIN_SESSION_COOKIE]) {
    res.cookies.set(name, '', {
      httpOnly: true,
      path: '/',
      maxAge: 0,
      sameSite: secure ? 'none' : 'lax',
      secure,
    });
  }
  return res;
}

/**
 * Extract Bearer token from Authorization header, falling back to HttpOnly session cookie.
 */
export function extractBearerToken(req, cookieName = '') {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const val = authHeader.slice(7).trim();
    if (val) return val;
  }
  if (cookieName) {
    try {
      const fromNextCookie = req.cookies?.get?.(cookieName)?.value;
      if (fromNextCookie) return String(fromNextCookie).trim();
    } catch {
      // Fallback to raw Cookie header parsing
    }
    const rawCookie = req.headers.get('cookie') || '';
    const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
    if (match?.[1]) return decodeURIComponent(match[1].trim());
  }
  return '';
}

/**
 * Simple persistent rate limiter per action + identifier.
 */
export async function checkRateLimit(key, limit = 10, windowMs = 15 * 60 * 1000) {
  const db = await getDb();
  const now = Date.now();
  const record = await db.collection('rate_limits').findOne({ _id: key });

  if (!record || record.resetAt < now) {
    await db.collection('rate_limits').updateOne(
      { _id: key },
      { $set: { count: 1, resetAt: now + windowMs, updatedAt: new Date(now).toISOString() } },
      { upsert: true }
    );
    return { allowed: true, remaining: limit - 1 };
  }

  if (record.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  await db.collection('rate_limits').updateOne(
    { _id: key },
    { $inc: { count: 1 }, $set: { updatedAt: new Date(now).toISOString() } }
  );
  return { allowed: true, remaining: limit - record.count - 1 };
}

/**
 * Create a server-side session in MongoDB and return raw Bearer token.
 */
export async function createSession({ subjectId, role, meta = {} }) {
  const db = await getDb();
  const { rawToken, tokenHash } = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.collection('sessions').insertOne({
    _id: generateId('SES'),
    tokenHash,
    subjectId,
    role, // 'USER' | 'SUPER_ADMIN'
    meta,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return { token: rawToken, expiresAt: expiresAt.toISOString() };
}

export async function revokeSession(req) {
  const tokens = [
    extractBearerToken(req),
    extractBearerToken(req, USER_SESSION_COOKIE),
    extractBearerToken(req, ADMIN_SESSION_COOKIE),
  ].filter(Boolean);
  if (tokens.length === 0) return;
  const db = await getDb();
  const uniqueHashes = [...new Set(tokens.map((t) => hashToken(t)))];
  await db.collection('sessions').deleteMany({ tokenHash: { $in: uniqueHashes } });
}

/**
 * Verify authenticated user session on server side.
 */
export async function requireUser(req, options = { allowSuspended: true }) {
  const token = extractBearerToken(req, USER_SESSION_COOKIE);
  if (!token) {
    return { ok: false, status: 401, error: 'Authentication required. Please log in.' };
  }

  const db = await getDb();
  const session = await db.collection('sessions').findOne({
    tokenHash: hashToken(token),
    role: 'USER',
  });

  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    if (session) {
      await db.collection('sessions').deleteOne({ _id: session._id });
    }
    return { ok: false, status: 401, error: 'Session expired. Please log in again.' };
  }

  const user = await db.collection('users').findOne({ _id: session.subjectId });
  if (!user) {
    return { ok: false, status: 401, error: 'User account not found.' };
  }

  if (!options.allowSuspended && user.status !== 'ACTIVE') {
    return {
      ok: false,
      status: 403,
      error: 'Your account is currently suspended. Financial transactions are disabled. Contact support.',
    };
  }

  return { ok: true, user, session };
}

/**
 * Sync SUPER_ADMIN from environment variables if explicitly configured.
 */
export async function getSuperAdminRecord() {
  const db = await getDb();
  const envEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const envPassword = (process.env.SUPER_ADMIN_PASSWORD || '').trim();

  const existing = await db.collection('admins').findOne({ role: 'SUPER_ADMIN' });

  if (envEmail && envPassword) {
    if (!existing) {
      const adminDoc = {
        _id: 'SUPER_ADMIN_PRIMARY',
        role: 'SUPER_ADMIN',
        fullName: 'Platform Super Admin',
        email: envEmail,
        mobile: '9999999999',
        passwordHash: hashPassword(envPassword),
        source: 'ENV',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.collection('admins').insertOne(adminDoc);
      return { admin: adminDoc, envOverride: true };
    }
    return { admin: existing, envOverride: true, envEmail, envPassword };
  }

  return { admin: existing, envOverride: false };
}

/**
 * Verify Super Admin password (env-configured password takes precedence over claimed fallback hash).
 */
export async function verifySuperAdminCredentials(emailOrMobile, password) {
  const { admin, envOverride, envEmail, envPassword } = await getSuperAdminRecord();
  if (!admin) {
    return { ok: false, needsSetup: true, error: 'Super Admin account has not been initialized yet.' };
  }

  const inputId = String(emailOrMobile || '').trim().toLowerCase();
  if (envOverride && envEmail && envPassword) {
    const emailMatches = inputId === envEmail || inputId === admin.email.toLowerCase();
    if (emailMatches && password === envPassword) {
      return { ok: true, admin };
    }
    return { ok: false, error: 'Invalid Super Admin credentials.' };
  }

  const idMatches =
    inputId === String(admin.email || '').toLowerCase() || inputId === String(admin.mobile || '');
  if (!idMatches || !verifyPassword(password, admin.passwordHash)) {
    return { ok: false, error: 'Invalid Super Admin credentials.' };
  }

  return { ok: true, admin };
}

/**
 * Verify authenticated Super Admin session on server side.
 */
export async function requireAdmin(req) {
  const token = extractBearerToken(req, ADMIN_SESSION_COOKIE);
  if (!token) {
    return { ok: false, status: 401, error: 'Super Admin authentication required.' };
  }

  const db = await getDb();
  const session = await db.collection('sessions').findOne({
    tokenHash: hashToken(token),
    role: 'SUPER_ADMIN',
  });

  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    if (session) {
      await db.collection('sessions').deleteOne({ _id: session._id });
    }
    return { ok: false, status: 401, error: 'Admin session expired. Please sign in again.' };
  }

  const admin = await db.collection('admins').findOne({ _id: session.subjectId, role: 'SUPER_ADMIN' });
  if (!admin) {
    return { ok: false, status: 403, error: 'Unauthorized administrator account.' };
  }

  return { ok: true, admin, session };
}

/**
 * Issue a server-generated expiring OTP with rate limiting.
 * Never claims a real SMS/email was delivered when external OTP provider is unconfigured.
 */
export async function issueOtp({ identifier, purpose, payload = null }) {
  const db = await getDb();
  const normalizedId = String(identifier || '').trim().toLowerCase();
  const rl = await checkRateLimit(`otp:${purpose}:${normalizedId}`, 6, 10 * 60 * 1000);
  if (!rl.allowed) {
    return {
      ok: false,
      status: 429,
      error: `Too many OTP requests. Please wait ${rl.retryAfterSec} seconds and try again.`,
    };
  }

  const { code, hash } = generateOtpCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const otpId = generateId('OTP');

  const providerConfigured = Boolean(process.env.OTP_PROVIDER_ENDPOINT && process.env.OTP_PROVIDER_API_KEY);
  let deliveryChannel = 'DEMO_TESTING_MODE';

  if (providerConfigured) {
    // External OTP gateway hook (ready for production SMS/Email provider)
    try {
      const res = await fetch(process.env.OTP_PROVIDER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OTP_PROVIDER_API_KEY}`,
        },
        body: JSON.stringify({ to: normalizedId, otp: code, purpose }),
      });
      if (!res.ok) {
        return { ok: false, status: 502, error: 'Configured OTP provider rejected the request.' };
      }
      deliveryChannel = 'CONFIGURED_PROVIDER';
    } catch {
      return { ok: false, status: 502, error: 'Unable to reach configured OTP provider.' };
    }
  }

  await db.collection('otps').insertOne({
    _id: otpId,
    identifier: normalizedId,
    purpose, // 'REGISTER' | 'FORGOT_PASSWORD' | 'ADMIN_FORGOT_PASSWORD' | 'PROFILE_CHANGE'
    codeHash: hash,
    payload,
    attempts: 0,
    maxAttempts: OTP_MAX_ATTEMPTS,
    verified: false,
    deliveryChannel,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return {
    ok: true,
    otpId,
    expiresAt: expiresAt.toISOString(),
    deliveryChannel,
    providerConfigured,
    // Strictly returned ONLY when external OTP provider is not configured (explicit Demo Testing Mode)
    demoOtpCode: providerConfigured ? undefined : code,
    notice: providerConfigured
      ? 'Verification OTP sent via configured OTP provider.'
      : 'Verification OTP generated. Enter the 6-digit code shown below to complete verification.',
  };
}

/**
 * Verify a previously issued OTP with expiry & attempt-limit enforcement.
 */
export async function verifyOtpRecord({ otpId, identifier, purpose, code }) {
  const db = await getDb();
  const record = await db.collection('otps').findOne({
    _id: String(otpId || ''),
    purpose,
  });

  if (!record) {
    return { ok: false, status: 400, error: 'OTP session not found or expired. Please request a new OTP.' };
  }
  if (record.verified) {
    return { ok: false, status: 400, error: 'This OTP has already been used.' };
  }
  if (identifier && record.identifier !== String(identifier).trim().toLowerCase()) {
    return { ok: false, status: 400, error: 'OTP does not match this mobile/email identifier.' };
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return { ok: false, status: 400, error: 'OTP has expired. Please request a fresh verification code.' };
  }
  if (record.attempts >= record.maxAttempts) {
    return { ok: false, status: 429, error: 'Maximum OTP verification attempts exceeded. Request a new OTP.' };
  }

  const valid = verifyOtpHash(String(code || '').trim(), record.codeHash);
  if (!valid) {
    await db.collection('otps').updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    const left = Math.max(0, record.maxAttempts - (record.attempts + 1));
    return { ok: false, status: 400, error: `Incorrect OTP code. ${left} attempt(s) remaining.` };
  }

  await db.collection('otps').updateOne(
    { _id: record._id },
    { $set: { verified: true, verifiedAt: new Date().toISOString() } }
  );

  return { ok: true, record };
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 1000 * 60 * 10; // 10 minutes lockout after 5 wrong PIN attempts

/**
 * Validate that a Wallet PIN is strictly 6 numeric digits.
 */
export function validateWalletPinFormat(pin) {
  const clean = typeof pin === 'string' || typeof pin === 'number' ? String(pin).trim() : '';
  if (!/^\d{6}$/.test(clean)) {
    return { valid: false, message: 'Wallet PIN must be exactly 6 numeric digits.' };
  }
  return { valid: true, value: clean };
}

/**
 * Verify a user's 6-digit Wallet PIN on the server with brute-force lockout protection.
 */
export async function verifyUserWalletPin(user, rawPin) {
  if (!user || !user._id) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }
  if (!user.walletPinHash) {
    return {
      ok: false,
      status: 400,
      code: 'WALLET_PIN_NOT_SET',
      error: 'Wallet PIN is not set yet. Please create your 6-digit Wallet PIN first.',
    };
  }

  const db = await getDb();
  const now = Date.now();
  const lockedUntilMs = user.walletPinLockedUntil ? new Date(user.walletPinLockedUntil).getTime() : 0;
  if (lockedUntilMs > now) {
    const waitMin = Math.max(1, Math.ceil((lockedUntilMs - now) / 60000));
    return {
      ok: false,
      status: 429,
      code: 'WALLET_PIN_LOCKED',
      error: `Too many wrong Wallet PIN attempts. Try again in ${waitMin} minute(s) or reset via Forgot Wallet PIN in Settings.`,
    };
  }

  const formatCheck = validateWalletPinFormat(rawPin);
  if (!formatCheck.valid) {
    return { ok: false, status: 400, code: 'INVALID_WALLET_PIN', error: formatCheck.message };
  }

  const matched = verifyPassword(formatCheck.value, user.walletPinHash);
  if (!matched) {
    const nextAttempts = Number(user.walletPinFailedAttempts || 0) + 1;
    const isNowLocked = nextAttempts >= PIN_MAX_ATTEMPTS;
    const updateDoc = isNowLocked
      ? {
          walletPinFailedAttempts: 0,
          walletPinLockedUntil: new Date(now + PIN_LOCK_MS).toISOString(),
        }
      : {
          walletPinFailedAttempts: nextAttempts,
        };

    await db.collection('users').updateOne({ _id: user._id }, { $set: updateDoc });

    if (isNowLocked) {
      return {
        ok: false,
        status: 429,
        code: 'WALLET_PIN_LOCKED',
        error: 'Incorrect Wallet PIN entered 5 times. Wallet PIN is locked for 10 minutes. You can reset it via Forgot PIN in Settings.',
      };
    }

    const remaining = PIN_MAX_ATTEMPTS - nextAttempts;
    return {
      ok: false,
      status: 400,
      code: 'WRONG_WALLET_PIN',
      error: `Incorrect 6-digit Wallet PIN. ${remaining} attempt(s) remaining.`,
    };
  }

  if (Number(user.walletPinFailedAttempts || 0) > 0 || user.walletPinLockedUntil) {
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { walletPinFailedAttempts: 0, walletPinLockedUntil: null } }
    );
  }

  return { ok: true };
}

/**
 * Strip sensitive password & wallet PIN hashes before returning user objects to API callers.
 */
export function sanitizeUser(user) {
  if (!user) return null;
  const {
    passwordHash: _removedPassword,
    walletPinHash: _removedPin,
    walletPinFailedAttempts: _removedAttempts,
    walletPinLockedUntil: _removedLocked,
    ...safe
  } = user;
  return {
    ...safe,
    accountId: safe.mobile || safe.accountId || safe._id,
    hasWalletPin: Boolean(user.walletPinHash),
    walletPinUpdatedAt: safe.walletPinUpdatedAt || null,
  };
}
