import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';
import { COMPLAINT_CATEGORIES } from '@/lib/constants.js';
import { createNotification } from '@/lib/notifications.js';
import { cleanString, generateId } from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = await getDb();
  const complaints = await db
    .collection('complaints')
    .find({ userId: auth.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  return NextResponse.json({ ok: true, complaints });
}

export async function POST(req) {
  const auth = await requireUser(req, { allowSuspended: true });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const category = cleanString(body.category, 40).toUpperCase();
    const referenceId = cleanString(body.referenceId, 60);
    const subject = cleanString(body.subject, 120);
    const description = cleanString(body.description, 1000);

    const validCats = COMPLAINT_CATEGORIES.map((c) => c.value);
    if (!validCats.includes(category)) {
      return NextResponse.json({ error: 'Select a valid complaint category.' }, { status: 400 });
    }
    if (subject.length < 4) {
      return NextResponse.json({ error: 'Enter a clear complaint subject (minimum 4 characters).' }, { status: 400 });
    }
    if (description.length < 10) {
      return NextResponse.json({ error: 'Describe your issue in at least 10 characters.' }, { status: 400 });
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const complaintDoc = {
      _id: generateId('CMP'),
      userId: auth.user._id,
      userName: auth.user.fullName,
      userMobile: auth.user.mobile,
      category,
      referenceId,
      subject,
      description,
      status: 'OPEN',
      adminResponse: '',
      responses: [],
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('complaints').insertOne(complaintDoc);

    await createNotification({
      userId: auth.user._id,
      title: `Complaint Registered (${complaintDoc._id})`,
      message: `Your complaint "${subject}" has been logged with ID ${complaintDoc._id}.`,
      category: 'COMPLAINT',
      referenceId: complaintDoc._id,
    });

    return NextResponse.json({ ok: true, complaint: complaintDoc }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to submit complaint.' }, { status: 500 });
  }
}
