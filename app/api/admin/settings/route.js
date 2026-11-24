import { NextResponse } from 'next/server';
import { getDb, getDbMode } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';
import { roundMoney } from '@/lib/finance.js';
import { createAuditLog } from '@/lib/notifications.js';
import { DEFAULT_PLATFORM_SETTINGS } from '@/lib/constants.js';

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = await getDb();
  const settings = await db.collection('settings').findOne({ _id: 'platform_settings' });
  const auditLogs = await db.collection('audit_logs').find({}).sort({ createdAt: -1 }).limit(150).toArray();

  return NextResponse.json({
    ok: true,
    settings,
    auditLogs,
    systemInfo: {
      dbMode: getDbMode(),
      otpProviderConfigured: Boolean(process.env.OTP_PROVIDER_ENDPOINT && process.env.OTP_PROVIDER_API_KEY),
    },
  });
}

export async function PATCH(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const db = await getDb();
    const existing = (await db.collection('settings').findOne({ _id: 'platform_settings' })) || {};

    const minDeposit = roundMoney(body.minDepositAmount ?? existing.minDepositAmount ?? DEFAULT_PLATFORM_SETTINGS.minDepositAmount);
    const maxDeposit = roundMoney(body.maxDepositAmount ?? existing.maxDepositAmount ?? DEFAULT_PLATFORM_SETTINGS.maxDepositAmount);
    const minCommTransfer = Math.max(
      50,
      roundMoney(body.minCommissionTransfer ?? existing.minCommissionTransfer ?? DEFAULT_PLATFORM_SETTINGS.minCommissionTransfer)
    );

    if (minDeposit <= 0 || maxDeposit < minDeposit) {
      return NextResponse.json({ error: 'Invalid minimum/maximum deposit limits.' }, { status: 400 });
    }

    const updates = {
      platformName: DEFAULT_PLATFORM_SETTINGS.platformName,
      supportEmail: DEFAULT_PLATFORM_SETTINGS.supportEmail,
      supportPhone: DEFAULT_PLATFORM_SETTINGS.supportPhone,
      supportHours: DEFAULT_PLATFORM_SETTINGS.supportHours,
      mobileRechargeEnabled: true,
      dthRechargeEnabled: true,
      electricityBillEnabled: true,
      redeemCodeEnabled: true,
      minRechargeAmount: DEFAULT_PLATFORM_SETTINGS.minRechargeAmount,
      maxRechargeAmount: DEFAULT_PLATFORM_SETTINGS.maxRechargeAmount,
      minDepositAmount: minDeposit,
      maxDepositAmount: maxDeposit,
      minCommissionTransfer: minCommTransfer,
      maintenanceMode: false,
      depositInstructions: existing.depositInstructions || DEFAULT_PLATFORM_SETTINGS.depositInstructions,
      updatedAt: new Date().toISOString(),
    };

    const saved = await db.collection('settings').findOneAndUpdate(
      { _id: 'platform_settings' },
      { $set: updates },
      { returnDocument: 'after' }
    );

    await createAuditLog({
      adminId: auth.admin._id,
      adminEmail: auth.admin.email,
      action: 'UPDATE_PLATFORM_SETTINGS',
      targetType: 'SETTINGS',
      targetId: 'platform_settings',
      details: {
        minDepositAmount: updates.minDepositAmount,
        maxDepositAmount: updates.maxDepositAmount,
        minCommissionTransfer: updates.minCommissionTransfer,
      },
    });

    return NextResponse.json({ ok: true, settings: saved, message: 'Platform settings saved successfully.' });
  } catch {
    return NextResponse.json({ error: 'Unable to save platform settings.' }, { status: 500 });
  }
}
