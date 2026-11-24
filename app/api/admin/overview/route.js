import { NextResponse } from 'next/server';
import { getDb, getDbMode } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';
import { aggregateFinancialReport, buildSafeCsv } from '@/lib/finance.js';
import { cleanString } from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const from = cleanString(searchParams.get('from') || '', 30);
  const to = cleanString(searchParams.get('to') || '', 30);
  const exportFormat = cleanString(searchParams.get('format') || '', 15).toLowerCase();

  const db = await getDb();
  let transactions = await db.collection('transactions').find({}).sort({ createdAt: -1 }).toArray();
  let deposits = await db.collection('deposits').find({}).sort({ createdAt: -1 }).toArray();
  const wallets = await db.collection('wallets').find({}).toArray();
  const users = await db.collection('users').find({}).toArray();
  const complaints = await db.collection('complaints').find({}).toArray();

  if (from) {
    const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
    if (!Number.isNaN(fromMs)) {
      transactions = transactions.filter((t) => new Date(t.createdAt).getTime() >= fromMs);
      deposits = deposits.filter((d) => new Date(d.createdAt).getTime() >= fromMs);
    }
  }
  if (to) {
    const toMs = new Date(`${to}T23:59:59.999Z`).getTime();
    if (!Number.isNaN(toMs)) {
      transactions = transactions.filter((t) => new Date(t.createdAt).getTime() <= toMs);
      deposits = deposits.filter((d) => new Date(d.createdAt).getTime() <= toMs);
    }
  }

  const report = aggregateFinancialReport({ transactions, deposits, wallets, users });

  if (exportFormat === 'csv') {
    const headers = [
      { key: '_id', label: 'Transaction ID' },
      { key: 'createdAt', label: 'Date (ISO)' },
      { key: 'userName', label: 'User Name' },
      { key: 'userMobile', label: 'User Mobile' },
      { key: 'type', label: 'Service Type' },
      { key: 'operatorName', label: 'Operator / Product' },
      { key: 'targetNumber', label: 'Target Number / Code ID' },
      { key: 'amount', label: 'Amount (INR)' },
      { key: 'commissionAmount', label: 'Commission (INR)' },
      { key: 'status', label: 'Status' },
      { key: 'refunded', label: 'Refunded' },
      { key: 'providerMode', label: 'Mode' },
    ];
    const csv = buildSafeCsv(headers, transactions);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="quick-recharge-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const openComplaints = complaints.filter((c) => ['OPEN', 'IN_PROGRESS'].includes(c.status)).length;
  const recentAuditLogs = await db.collection('audit_logs').find({}).sort({ createdAt: -1 }).limit(10).toArray();

  const userMap = Object.fromEntries(users.map((u) => [u._id, u]));
  const enrichDeposit = (d) => {
    const u = userMap[d.userId];
    return {
      ...d,
      userName: d.userName || u?.fullName || 'User',
      userMobile: d.userMobile || u?.mobile || u?.accountId || '',
    };
  };

  return NextResponse.json({
    ok: true,
    admin: {
      _id: auth.admin._id,
      fullName: auth.admin.fullName,
      email: auth.admin.email,
      mobile: auth.admin.mobile,
      role: auth.admin.role,
    },
    dbMode: getDbMode(),
    report,
    openComplaints,
    recentTransactions: transactions.slice(0, 8),
    recentDeposits: deposits.slice(0, 8).map(enrichDeposit),
    pendingDeposits: deposits.filter((d) => d.status === 'PENDING').slice(0, 8).map(enrichDeposit),
    recentAuditLogs,
  });
}
