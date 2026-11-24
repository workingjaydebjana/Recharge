import crypto from 'node:crypto';

const EPHEMERAL_ENC_KEY = crypto.randomBytes(32);

function getEncryptionKey() {
  const envKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (envKey && /^[a-fA-F0-9]{64}$/.test(envKey.trim())) {
    return Buffer.from(envKey.trim(), 'hex');
  }
  if (envKey && envKey.trim().length >= 16) {
    return crypto.createHash('sha256').update(envKey.trim()).digest();
  }
  return EPHEMERAL_ENC_KEY;
}

/**
 * Hash a password securely using scrypt with a unique 16-byte random salt.
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

/**
 * Verify a password against a stored scrypt hash using constant-time comparison.
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.startsWith('scrypt:')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, originalHex] = parts;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (candidate.length !== original.length) return false;
  return crypto.timingSafeEqual(candidate, original);
}

/**
 * Generate a cryptographically secure random token and its SHA-256 hash.
 */
export function generateSessionToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * Generate a cryptographically secure 6-digit OTP and its salted hash.
 */
export function generateOtpCode() {
  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(12).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(code).digest('hex');
  return { code, hash: `${salt}:${hash}` };
}

export function verifyOtpHash(code, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHex] = stored.split(':');
  const candidate = crypto.createHmac('sha256', salt).update(String(code)).digest();
  const original = Buffer.from(originalHex, 'hex');
  if (candidate.length !== original.length) return false;
  return crypto.timingSafeEqual(candidate, original);
}

/**
 * Encrypt sensitive provider API credentials at rest using AES-256-GCM.
 */
export function encryptSecret(plaintext) {
  if (!plaintext) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt stored AES-256-GCM provider credentials only on server side.
 */
export function decryptSecret(ciphertext) {
  if (!ciphertext || !String(ciphertext).startsWith('enc:v1:')) return '';
  try {
    const [, , ivHex, tagHex, dataHex] = String(ciphertext).split(':');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Generate collision-resistant business IDs (e.g., TXN-20261120-A8F3C1).
 */
export function generateId(prefix) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${datePart}-${rand}`;
}

/**
 * Sanitize plain string inputs to block NoSQL operator injection objects.
 */
export function cleanString(input, maxLen = 200) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

/**
 * Validate safe outbound webhook/provider URL to block SSRF to private/loopback targets.
 */
export function validateSafeExternalUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, message: 'Provider URL must use https:// or http://' };
    }
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254'];
    if (
      blockedHosts.includes(host) ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return { valid: false, message: 'Private or loopback hostnames are not allowed for provider API endpoints.' };
    }
    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, message: 'Enter a valid provider endpoint URL.' };
  }
}

/**
 * Mask secret values when returning config summaries to admin UI.
 */
export function maskSecret(hasValue) {
  return hasValue ? '••••••••••••••••' : '';
}

/**
 * Mask a redeem code for admin inventory preview so unused codes stay protected.
 */
export function maskRedeemCode(code) {
  const clean = String(code || '');
  if (clean.length <= 6) return '••••••';
  return `${clean.slice(0, 4)}-••••-${clean.slice(-4)}`;
}
