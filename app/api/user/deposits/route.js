import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';
import { roundMoney } from '@/lib/finance.js';
import { createNotification } from '@/lib/notifications.js';
import { cleanString, generateId } from '@/lib/security.js';

export async function POST(req) {
  const auth = await requireUser(req, { allowSuspended: false });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const amount = roundMoney(body.amount);
    const paymentMode = cleanString(body.paymentMode, 30);
    const referenceNumber = cleanString(body.referenceNumber, 80);
    const remarks = cleanString(body.remarks, 250);

    const db = await getDb();
    const settings = await db.collection('settings').findOne({ _id: 'platform_settings' });
    const minDep = Number(settings?.minDepositAmount ?? 100);
    const maxDep = Number(settings?.maxDepositAmount ?? 100000);

    if (!Number.isFinite(amount) || amount < minDep || amount > maxDep) {
      return NextResponse.json(
        { error: `Deposit amount must be between ₹${minDep} and ₹${maxDep}.` },
        { status: 400 }
      );
    }
    if (!['UPI', 'IMPS', 'NEFT', 'RTGS', 'BANK_TRANSFER'].includes(paymentMode)) {
      return NextResponse.json({ error: 'Select a valid payment method (UPI, IMPS, NEFT, RTGS).' }, { status: 400 });
    }
    if (referenceNumber.length < 6) {
      return NextResponse.json(
        { error: 'Enter a valid UTR / Transaction Reference Number (at least 6 characters).' },
        { status: 400 }
      );
    }

    // Prevent duplicate submission with the same UTR reference
    const existingRef = await db.collection('deposits').findOne({
      referenceNumber: referenceNumber.toUpperCase(),
      status: { $in: ['PENDING', 'APPROVED'] },
    });
    if (existingRef) {
      return NextResponse.json(
        { error: 'This UTR / Transaction Reference Number has already been submitted.' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const depositDoc = {
      _id: generateId('DEP'),
      userId: auth.user._id,
      userName: auth.user.fullName,
      userMobile: auth.user.mobile,
      amount,
      paymentMode,
      referenceNumber: referenceNumber.toUpperCase(),
      remarks,
      status: 'PENDING', // Strictly requires Super Admin verification before Current Balance credit
      adminRemark: '',
      reviewedBy: null,
      reviewedAt: null,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('deposits').insertOne(depositDoc);

    await createNotification({
      userId: auth.user._id,
      title: 'Deposit Request Submitted (DEMO)',
      message: `Add Money request ${depositDoc._id} for ₹${amount.toFixed(2)} (Ref: ${depositDoc.referenceNumber}) is awaiting Super Admin approval.`,
      category: 'DEPOSIT',
      referenceId: depositDoc._id,
    });

    return NextResponse.json(
      {
        ok: true,
        deposit: depositDoc,
        message: 'Deposit request submitted. Current Balance will be credited only after Super Admin verification.',
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Unable to submit deposit request.' }, { status: 500 });
  }
}
