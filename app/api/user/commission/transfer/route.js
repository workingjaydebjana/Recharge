import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser, verifyUserWalletPin } from '@/lib/auth.js';
import { createNotification } from '@/lib/notifications.js';
import { cleanString } from '@/lib/security.js';
import { transferCommissionToCurrent } from '@/lib/wallet.js';

export async function POST(req) {
  const auth = await requireUser(req, { allowSuspended: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const amount = Number(body.amount);
    const idempotencyKey = cleanString(body.idempotencyKey, 80);

    const db = await getDb();
    const settings = await db.collection('settings').findOne({ _id: 'platform_settings' });
    const minTransfer = Math.max(50, Number(settings?.minCommissionTransfer ?? 50));

    // Server-side 6-digit Wallet PIN verification before commission transfer
    const pinCheck = await verifyUserWalletPin(auth.user, body.walletPin);
    if (!pinCheck.ok) {
      return NextResponse.json(
        { error: pinCheck.error, code: pinCheck.code },
        { status: pinCheck.status || 400 }
      );
    }

    const result = await transferCommissionToCurrent({
      userId: auth.user._id,
      amount,
      minTransfer,
      idempotencyKey,
      isDemo: true,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.duplicate ? 409 : 400 });
    }

    await createNotification({
      userId: auth.user._id,
      title: 'Commission Transferred (DEMO)',
      message: `₹${result.amount.toFixed(2)} moved from Commission Balance to Current Balance (${result.transferId}).`,
      category: 'COMMISSION',
      referenceId: result.transferId,
    });

    return NextResponse.json({
      ok: true,
      transferId: result.transferId,
      amount: result.amount,
      wallet: result.wallet,
      message: `₹${result.amount.toFixed(2)} transferred to Current Balance successfully.`,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to process commission transfer.' }, { status: 500 });
  }
}
