import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';
import { createAuditLog, createNotification } from '@/lib/notifications.js';
import { cleanString } from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = await getDb();
  const complaints = await db.collection('complaints').find({}).sort({ createdAt: -1 }).limit(200).toArray();
  return NextResponse.json({ ok: true, complaints });
}

export async function PATCH(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const complaintId = cleanString(body.complaintId, 60);
    const status = cleanString(body.status, 20).toUpperCase();
    const adminResponse = cleanString(body.adminResponse, 1000);

    if (!complaintId || !['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
      return NextResponse.json({ error: 'Provide complaintId and valid status.' }, { status: 400 });
    }

    const db = await getDb();
    const existing = await db.collection('complaints').findOne({ _id: complaintId });
    if (!existing) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });

    const now = new Date().toISOString();
    const update = {
      $set: {
        status,
        adminResponse: adminResponse || existing.adminResponse,
        updatedAt: now,
      },
    };
    if (adminResponse) {
      update.$push = {
        responses: {
          by: 'Super Admin',
          message: adminResponse,
          createdAt: now,
        },
      };
    }

    const updated = await db.collection('complaints').findOneAndUpdate(
      { _id: complaintId },
      update,
      { returnDocument: 'after' }
    );

    if (existing.isDispute && existing.referenceId) {
      await db.collection('transactions').updateOne(
        { _id: existing.referenceId, userId: existing.userId },
        {
          $set: {
            disputeStatus: status,
            disputeAdminResponse: adminResponse || existing.adminResponse || '',
            updatedAt: now,
          },
        }
      );
    }

    await createNotification({
      userId: existing.userId,
      title: `${existing.isDispute ? 'Dispute' : 'Complaint'} ${complaintId} Updated (${status})`,
      message: adminResponse
        ? `Super Admin responded to ${complaintId}: ${adminResponse}`
        : `Your ${existing.isDispute ? 'dispute' : 'complaint'} ${complaintId} status is now ${status}.`,
      category: 'COMPLAINT',
      referenceId: complaintId,
    });

    await createAuditLog({
      adminId: auth.admin._id,
      adminEmail: auth.admin.email,
      action: 'UPDATE_COMPLAINT',
      targetType: 'COMPLAINT',
      targetId: complaintId,
      details: { status, adminResponse },
    });

    return NextResponse.json({ ok: true, complaint: updated });
  } catch {
    return NextResponse.json({ error: 'Unable to update complaint.' }, { status: 500 });
  }
}
