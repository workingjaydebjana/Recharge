import { NextResponse } from 'next/server';
import { ensureAllCommissionRules, getDb, withAtomicLock } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';
import { roundMoney } from '@/lib/finance.js';
import { createAuditLog } from '@/lib/notifications.js';
import { cleanString } from '@/lib/security.js';

function validateCommissionPayload(item) {
  const ruleId = cleanString(item?.ruleId || item?._id, 60);
  const rateType = cleanString(item?.rateType, 20).toLowerCase();
  const rawValue = Number(item?.rateValue);
  const rateValue = roundMoney(rawValue);
  const isActive = Boolean(item?.isActive);

  if (!ruleId || !['percentage', 'fixed'].includes(rateType)) {
    return { ok: false, error: 'Each rule must include a valid ruleId and rateType (percentage or fixed).' };
  }
  if (!Number.isFinite(rawValue)) {
    return { ok: false, error: `Invalid numeric rate value for ${ruleId}.` };
  }
  if (rateType === 'percentage') {
    if (rateValue < 0) {
      return {
        ok: false,
        error: 'Percentage (%) commission cannot be negative. Switch to Fixed Amount (₹) to set a minus service charge.',
      };
    }
    if (rateValue > 25) {
      return { ok: false, error: 'Percentage commission cannot exceed 25%.' };
    }
  } else {
    // Fixed amount: positive = fixed commission, negative = fixed service fee
    if (rateValue < -500 || rateValue > 500) {
      return { ok: false, error: 'Fixed amount must be between -₹500 and +₹500.' };
    }
  }

  return { ok: true, ruleId, rateType, rateValue, isActive };
}

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = await getDb();
  const commissions = await ensureAllCommissionRules(db);
  return NextResponse.json({ ok: true, commissions });
}

export async function PUT(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const rulesInput = Array.isArray(body?.rules) ? body.rules : [];
    if (rulesInput.length === 0) {
      return NextResponse.json({ error: 'Provide at least one commission rule to save.' }, { status: 400 });
    }

    const validated = [];
    for (const item of rulesInput) {
      const check = validateCommissionPayload(item);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      validated.push(check);
    }

    const result = await withAtomicLock(async () => {
      const db = await getDb();
      const now = new Date().toISOString();
      const changes = [];

      for (const item of validated) {
        const existing = await db.collection('commissions').findOne({ _id: item.ruleId });
        if (!existing) continue;

        const hasChanged =
          existing.rateType !== item.rateType ||
          roundMoney(existing.rateValue) !== item.rateValue ||
          Boolean(existing.isActive) !== item.isActive;

        if (!hasChanged) continue;

        await db.collection('commissions').updateOne(
          { _id: item.ruleId },
          {
            $set: {
              rateType: item.rateType,
              rateValue: item.rateValue,
              isActive: item.isActive,
              updatedBy: auth.admin.email,
              updatedAt: now,
            },
          }
        );

        changes.push({
          ruleId: item.ruleId,
          operatorName: existing.operatorName,
          previous: {
            rateType: existing.rateType,
            rateValue: existing.rateValue,
            isActive: existing.isActive,
          },
          updated: {
            rateType: item.rateType,
            rateValue: item.rateValue,
            isActive: item.isActive,
          },
        });
      }

      if (changes.length > 0) {
        await createAuditLog({
          adminId: auth.admin._id,
          adminEmail: auth.admin.email,
          action: 'BULK_UPDATE_COMMISSION_RULES',
          targetType: 'COMMISSION',
          targetId: 'ALL_SERVICES',
          details: { updatedCount: changes.length, changes },
        });
      }

      const commissions = await ensureAllCommissionRules(db);
      return { commissions, updatedCount: changes.length };
    });

    return NextResponse.json({
      ok: true,
      updatedCount: result.updatedCount,
      commissions: result.commissions,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to save commission and service settings.' }, { status: 500 });
  }
}

export async function PATCH(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const check = validateCommissionPayload(body);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const db = await getDb();
    const existing = await db.collection('commissions').findOne({ _id: check.ruleId });
    if (!existing) return NextResponse.json({ error: 'Commission rule not found.' }, { status: 404 });

    const updated = await db.collection('commissions').findOneAndUpdate(
      { _id: check.ruleId },
      {
        $set: {
          rateType: check.rateType,
          rateValue: check.rateValue,
          isActive: check.isActive,
          updatedBy: auth.admin.email,
          updatedAt: new Date().toISOString(),
        },
      },
      { returnDocument: 'after' }
    );

    await createAuditLog({
      adminId: auth.admin._id,
      adminEmail: auth.admin.email,
      action: 'UPDATE_COMMISSION_RULE',
      targetType: 'COMMISSION',
      targetId: check.ruleId,
      details: {
        operatorName: existing.operatorName,
        previous: { rateType: existing.rateType, rateValue: existing.rateValue, isActive: existing.isActive },
        updated: { rateType: check.rateType, rateValue: check.rateValue, isActive: check.isActive },
      },
    });

    return NextResponse.json({ ok: true, commission: updated });
  } catch {
    return NextResponse.json({ error: 'Unable to update commission rate.' }, { status: 500 });
  }
}
