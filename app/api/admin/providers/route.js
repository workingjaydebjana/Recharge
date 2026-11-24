import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';
import { createAuditLog } from '@/lib/notifications.js';
import {
  cleanString,
  encryptSecret,
  maskSecret,
  validateSafeExternalUrl,
} from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = await getDb();
  const providers = await db.collection('recharge_providers').find({}).toArray();

  // Never send plaintext or encrypted API secrets to the browser
  const sanitized = providers.map((p) => ({
    _id: p._id,
    name: p.name,
    serviceType: p.serviceType,
    baseUrl: p.baseUrl,
    hasApiKey: Boolean(p.apiKeyEncrypted),
    apiKeyMasked: maskSecret(Boolean(p.apiKeyEncrypted)),
    hasApiSecret: Boolean(p.apiSecretEncrypted),
    apiSecretMasked: maskSecret(Boolean(p.apiSecretEncrypted)),
    hasWebhookSecret: Boolean(p.webhookSecretEncrypted),
    webhookSecretMasked: maskSecret(Boolean(p.webhookSecretEncrypted)),
    mode: p.mode || 'DEMO',
    isConfigured: Boolean(p.isConfigured),
    isActive: Boolean(p.isActive),
    updatedAt: p.updatedAt,
  }));

  return NextResponse.json({ ok: true, providers: sanitized });
}

export async function PATCH(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const providerId = cleanString(body.providerId, 60);
    const name = cleanString(body.name, 100);
    const baseUrl = cleanString(body.baseUrl, 250);
    const mode = cleanString(body.mode, 10).toUpperCase() === 'LIVE' ? 'LIVE' : 'DEMO';
    const isActive = Boolean(body.isActive);
    const apiKeyRaw = cleanString(body.apiKey, 200);
    const apiSecretRaw = cleanString(body.apiSecret, 200);
    const webhookSecretRaw = cleanString(body.webhookSecret, 200);

    const db = await getDb();
    const existing = await db.collection('recharge_providers').findOne({ _id: providerId });
    if (!existing) return NextResponse.json({ error: 'Provider record not found.' }, { status: 404 });

    if (baseUrl) {
      const urlCheck = validateSafeExternalUrl(baseUrl);
      if (!urlCheck.valid) {
        return NextResponse.json({ error: urlCheck.message }, { status: 400 });
      }
    }

    const nextApiKeyEnc = apiKeyRaw ? encryptSecret(apiKeyRaw) : existing.apiKeyEncrypted;
    const nextApiSecretEnc = apiSecretRaw ? encryptSecret(apiSecretRaw) : existing.apiSecretEncrypted;
    const nextWebhookEnc = webhookSecretRaw ? encryptSecret(webhookSecretRaw) : existing.webhookSecretEncrypted;

    const isConfigured = Boolean(baseUrl && nextApiKeyEnc);
    if (mode === 'LIVE' && isActive && !isConfigured) {
      return NextResponse.json(
        { error: 'Cannot activate LIVE mode without a valid external Provider Base URL and API Key.' },
        { status: 400 }
      );
    }

    await db.collection('recharge_providers').updateOne(
      { _id: providerId },
      {
        $set: {
          name: name || existing.name,
          baseUrl,
          apiKeyEncrypted: nextApiKeyEnc,
          apiSecretEncrypted: nextApiSecretEnc,
          webhookSecretEncrypted: nextWebhookEnc,
          mode,
          isConfigured,
          isActive,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    await createAuditLog({
      adminId: auth.admin._id,
      adminEmail: auth.admin.email,
      action: 'UPDATE_RECHARGE_PROVIDER',
      targetType: 'RECHARGE_PROVIDER',
      targetId: providerId,
      details: {
        name: name || existing.name,
        mode,
        isActive,
        isConfigured,
        credentialsUpdated: Boolean(apiKeyRaw || apiSecretRaw || webhookSecretRaw),
      },
    });

    return NextResponse.json({ ok: true, message: 'Recharge API provider configuration saved securely.' });
  } catch {
    return NextResponse.json({ error: 'Unable to save provider settings.' }, { status: 500 });
  }
}
