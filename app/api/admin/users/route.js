import { NextResponse } from 'next/server';
import { getDb, withAtomicLock } from '@/lib/db.js';
import { requireAdmin, sanitizeUser, validateWalletPinFormat } from '@/lib/auth.js';
import { createAuditLog, createNotification } from '@/lib/notifications.js';
import { cleanString, hashPassword } from '@/lib/security.js';
import { adminAdjustWallet, ensureWallet } from '@/lib/wallet.js';

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const search = cleanString(searchParams.get('search') || '', 80).toLowerCase();
  const statusFilter = cleanString(searchParams.get('status') || '', 20).toUpperCase();

  const db = await getDb();
  const allUsers = await db.collection('users').find({}).sort({ createdAt: -1 }).toArray();
  const wallets = await db.collection('wallets').find({}).toArray();
  const transactions = await db.collection('transactions').find({}).toArray();
  const deposits = await db.collection('deposits').find({}).toArray();
  const complaints = await db.collection('complaints').find({}).toArray();
  const rawLedger = await db.collection('wallet_ledger').find({}).sort({ createdAt: -1 }).limit(200).toArray();

  const userMap = Object.fromEntries(allUsers.map((u) => [u._id, u]));
  const walletMap = Object.fromEntries(wallets.map((w) => [w.userId, w]));

  const ledger = rawLedger.map((entry) => {
    const u = userMap[entry.userId];
    return {
      ...entry,
      userName: entry.userName || u?.fullName || 'Unknown User',
      userMobile: entry.userMobile || u?.mobile || u?.accountId || '',
    };
  });

  let users = allUsers;
  if (statusFilter && ['ACTIVE', 'SUSPENDED'].includes(statusFilter)) {
    users = users.filter((u) => u.status === statusFilter);
  }
  if (search) {
    users = users.filter(
      (u) =>
        String(u.fullName || '').toLowerCase().includes(search) ||
        String(u.mobile || '').toLowerCase().includes(search) ||
        String(u.email || '').toLowerCase().includes(search) ||
        String(u._id || '').toLowerCase().includes(search)
    );
  }

  const enriched = users.map((u) => {
    const safe = sanitizeUser(u);
    const w = walletMap[u._id] || { currentBalance: 0, pendingBalance: 0, commissionBalance: 0 };
    const uTx = transactions.filter((t) => t.userId === u._id);
    const uDep = deposits.filter((d) => d.userId === u._id);
    const uCmp = complaints.filter((c) => c.userId === u._id);
    return {
      ...safe,
      wallet: w,
      stats: {
        transactionsCount: uTx.length,
        depositsCount: uDep.length,
        complaintsCount: uCmp.length,
        totalCommissionEarned: Math.round(
          uTx.reduce((sum, t) => sum + Number(t.commissionAmount || 0), 0) * 100
        ) / 100,
      },
    };
  });

  return NextResponse.json({ ok: true, users: enriched, recentLedger: ledger });
}

export async function PATCH(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const action = cleanString(body.action, 40).toUpperCase();
    const userId = cleanString(body.userId, 60);

    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: userId });
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    if (action === 'SET_STATUS') {
      const nextStatus = cleanString(body.status, 20).toUpperCase();
      if (!['ACTIVE', 'SUSPENDED'].includes(nextStatus)) {
        return NextResponse.json({ error: 'Status must be ACTIVE or SUSPENDED.' }, { status: 400 });
      }

      await db.collection('users').updateOne(
        { _id: userId },
        { $set: { status: nextStatus, updatedAt: new Date().toISOString() } }
      );

      await createNotification({
        userId,
        title: nextStatus === 'SUSPENDED' ? 'Account Suspended' : 'Account Activated',
        message:
          nextStatus === 'SUSPENDED'
            ? 'Your account has been suspended by the Super Admin. Financial transactions are temporarily blocked.'
            : 'Your account has been reactivated by the Super Admin.',
        category: 'SYSTEM',
        referenceId: userId,
      });

      await createAuditLog({
        adminId: auth.admin._id,
        adminEmail: auth.admin.email,
        action: nextStatus === 'SUSPENDED' ? 'SUSPEND_USER' : 'ACTIVATE_USER',
        targetType: 'USER',
        targetId: userId,
        details: { userMobile: user.mobile, nextStatus },
      });

      return NextResponse.json({ ok: true, status: nextStatus });
    }

    if (action === 'ADJUST_WALLET') {
      const balanceType = cleanString(body.balanceType, 20).toUpperCase();
      const direction = cleanString(body.direction, 15).toUpperCase();
      const amount = Number(body.amount);
      const reason = cleanString(body.reason, 200);

      if (!['CURRENT', 'PENDING', 'COMMISSION'].includes(balanceType)) {
        return NextResponse.json({ error: 'Invalid balance type.' }, { status: 400 });
      }
      if (!['CREDIT', 'DEBIT'].includes(direction)) {
        return NextResponse.json({ error: 'Direction must be CREDIT or DEBIT.' }, { status: 400 });
      }
      if (reason.length < 4) {
        return NextResponse.json({ error: 'Provide a clear audit reason (minimum 4 characters).' }, { status: 400 });
      }

      const adj = await adminAdjustWallet({
        userId,
        balanceType,
        direction,
        amount,
        reason,
        adminId: auth.admin.email,
      });
      if (!adj.ok) return NextResponse.json({ error: adj.error }, { status: 400 });

      await createNotification({
        userId,
        title: `Wallet ${direction === 'CREDIT' ? 'Credited' : 'Debited'} by Admin`,
        message: `₹${Number(amount).toFixed(2)} ${direction === 'CREDIT' ? 'credited to' : 'debited from'} ${balanceType} Balance. Reason: ${reason}`,
        category: 'DEPOSIT',
        referenceId: adj.adjustmentId,
      });

      await createAuditLog({
        adminId: auth.admin._id,
        adminEmail: auth.admin.email,
        action: 'ADMIN_WALLET_ADJUSTMENT',
        targetType: 'WALLET',
        targetId: userId,
        details: { balanceType, direction, amount, reason, adjustmentId: adj.adjustmentId },
      });

      const wallet = await ensureWallet(userId);
      return NextResponse.json({ ok: true, wallet, adjustmentId: adj.adjustmentId });
    }

    if (action === 'RESET_PASSWORD') {
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      if (newPassword.length < 6 || newPassword.length > 72) {
        return NextResponse.json(
          { error: 'New password must be between 6 and 72 characters.' },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      await db.collection('users').updateOne(
        { _id: userId },
        {
          $set: {
            passwordHash: hashPassword(newPassword),
            passwordUpdatedAt: now,
            updatedAt: now,
          },
        }
      );

      await createNotification({
        userId,
        title: 'Password Updated by Administrator',
        message: 'Your login password has been reset by the Super Admin. Use the new password on your next sign-in.',
        category: 'SYSTEM',
        referenceId: userId,
      });

      await createAuditLog({
        adminId: auth.admin._id,
        adminEmail: auth.admin.email,
        action: 'RESET_USER_PASSWORD',
        targetType: 'USER',
        targetId: userId,
        details: { userMobile: user.mobile },
      });

      return NextResponse.json({ ok: true, passwordUpdatedAt: now });
    }

    if (action === 'RESET_WALLET_PIN') {
      const pinCheck = validateWalletPinFormat(body.newPin);
      if (!pinCheck.valid) {
        return NextResponse.json({ error: pinCheck.message }, { status: 400 });
      }

      const now = new Date().toISOString();
      await db.collection('users').updateOne(
        { _id: userId },
        {
          $set: {
            walletPinHash: hashPassword(pinCheck.value),
            walletPinUpdatedAt: now,
            walletPinFailedAttempts: 0,
            walletPinLockedUntil: null,
            updatedAt: now,
          },
        }
      );

      await createNotification({
        userId,
        title: 'Wallet PIN Updated by Administrator',
        message: 'Your 6-digit Wallet PIN has been set/reset by the Super Admin.',
        category: 'SYSTEM',
        referenceId: userId,
      });

      await createAuditLog({
        adminId: auth.admin._id,
        adminEmail: auth.admin.email,
        action: 'RESET_USER_WALLET_PIN',
        targetType: 'USER',
        targetId: userId,
        details: { userMobile: user.mobile },
      });

      return NextResponse.json({ ok: true, walletPinUpdatedAt: now });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'User management operation failed.' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json().catch(() => ({}));
    const userId = cleanString(body.userId, 60);
    const confirmation = cleanString(body.confirmation, 20).toUpperCase();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }
    if (confirmation !== 'DELETE') {
      return NextResponse.json(
        { error: 'Please type DELETE to confirm permanent account deletion.' },
        { status: 400 }
      );
    }

    const result = await withAtomicLock(async () => {
      const db = await getDb();
      const user = await db.collection('users').findOne({ _id: userId });
      if (!user) {
        return { ok: false, status: 404, error: 'User account not found.' };
      }

      const wallet = await db.collection('wallets').findOne({ userId });
      const identifiers = [user.mobile, String(user.email || '').toLowerCase()].filter(Boolean);

      // Permanently delete all active sessions & user-linked data
      const sessionsRes = await db.collection('sessions').deleteMany({ subjectId: userId, role: 'USER' });
      const notifRes = await db.collection('notifications').deleteMany({ userId });
      const complaintsRes = await db.collection('complaints').deleteMany({ userId });
      const depositsRes = await db.collection('deposits').deleteMany({ userId });
      const txRes = await db.collection('transactions').deleteMany({ userId });
      const ledgerRes = await db.collection('wallet_ledger').deleteMany({ userId });
      const redeemRes = await db.collection('redeem_codes').deleteMany({ assignedUserId: userId });
      if (identifiers.length > 0) {
        await db.collection('otps').deleteMany({ identifier: { $in: identifiers } });
      }
      await db.collection('wallets').deleteMany({ userId });
      await db.collection('users').deleteOne({ _id: userId });

      const deletedCounts = {
        sessions: sessionsRes?.deletedCount || 0,
        notifications: notifRes?.deletedCount || 0,
        complaints: complaintsRes?.deletedCount || 0,
        deposits: depositsRes?.deletedCount || 0,
        transactions: txRes?.deletedCount || 0,
        ledgerEntries: ledgerRes?.deletedCount || 0,
        assignedRedeemCodes: redeemRes?.deletedCount || 0,
      };

      await createAuditLog({
        adminId: auth.admin._id,
        adminEmail: auth.admin.email,
        action: 'DELETE_USER_PERMANENT',
        targetType: 'USER',
        targetId: userId,
        details: {
          fullName: user.fullName,
          mobile: user.mobile,
          email: user.email,
          finalBalances: {
            currentBalance: Number(wallet?.currentBalance || 0),
            pendingBalance: Number(wallet?.pendingBalance || 0),
            commissionBalance: Number(wallet?.commissionBalance || 0),
          },
          deletedCounts,
        },
      });

      return {
        ok: true,
        deletedUserId: userId,
        deletedFullName: user.fullName,
        deletedMobile: user.mobile,
        deletedCounts,
      };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Unable to permanently delete user account.' }, { status: 500 });
  }
}
