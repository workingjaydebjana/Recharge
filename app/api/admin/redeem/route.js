import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';
import { roundMoney } from '@/lib/finance.js';
import { createAuditLog } from '@/lib/notifications.js';
import { cleanString, generateId, maskRedeemCode } from '@/lib/security.js';

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = await getDb();
  const products = await db.collection('redeem_products').find({}).sort({ createdAt: -1 }).toArray();
  const codes = await db.collection('redeem_codes').find({}).sort({ createdAt: -1 }).toArray();

  const statsMap = {};
  for (const c of codes) {
    if (!statsMap[c.productId]) statsMap[c.productId] = { available: 0, assigned: 0 };
    if (c.status === 'AVAILABLE') statsMap[c.productId].available += 1;
    if (c.status === 'ASSIGNED') statsMap[c.productId].assigned += 1;
  }

  const enrichedProducts = products.map((p) => ({
    ...p,
    availableCount: statsMap[p._id]?.available || 0,
    assignedCount: statsMap[p._id]?.assigned || 0,
  }));

  // Mask unpurchased codes even in admin list to protect inventory from shoulder-surfing/leaks
  const inventoryPreview = codes.slice(0, 100).map((c) => ({
    _id: c._id,
    productId: c.productId,
    maskedCode: maskRedeemCode(c.codeValue),
    status: c.status,
    assignedUserId: c.assignedUserId,
    assignedTransactionId: c.assignedTransactionId,
    assignedAt: c.assignedAt,
    isDemo: c.isDemo !== false,
    createdAt: c.createdAt,
  }));

  return NextResponse.json({ ok: true, products: enrichedProducts, inventory: inventoryPreview });
}

export async function POST(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const action = cleanString(body.action, 30).toUpperCase();
    const db = await getDb();
    const now = new Date().toISOString();

    if (action === 'CREATE_PRODUCT') {
      const title = cleanString(body.title, 120);
      const brand = cleanString(body.brand, 60);
      const category = cleanString(body.category, 60) || 'Digital Voucher';
      const faceValue = roundMoney(body.faceValue);
      const price = roundMoney(body.price);
      const description = cleanString(body.description, 300);

      if (title.length < 3 || brand.length < 2 || faceValue <= 0 || price <= 0) {
        return NextResponse.json({ error: 'Provide valid title, brand, face value, and selling price.' }, { status: 400 });
      }

      const prod = {
        _id: generateId('PROD'),
        title,
        brand,
        category,
        faceValue,
        price,
        description,
        isActive: true,
        isDemo: true,
        createdAt: now,
      };
      await db.collection('redeem_products').insertOne(prod);

      await createAuditLog({
        adminId: auth.admin._id,
        adminEmail: auth.admin.email,
        action: 'CREATE_REDEEM_PRODUCT',
        targetType: 'REDEEM_PRODUCT',
        targetId: prod._id,
        details: { title, brand, price, faceValue },
      });

      return NextResponse.json({ ok: true, product: prod }, { status: 201 });
    }

    if (action === 'ADD_CODES') {
      const productId = cleanString(body.productId, 60);
      const rawCodes = String(body.codesText || '');

      const product = await db.collection('redeem_products').findOne({ _id: productId });
      if (!product) return NextResponse.json({ error: 'Selected product not found.' }, { status: 404 });

      const lines = rawCodes
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 6);

      if (lines.length === 0) {
        return NextResponse.json({ error: 'Enter at least one valid redeem code (minimum 6 characters per line).' }, { status: 400 });
      }

      const uniqueLines = Array.from(new Set(lines));
      const inserted = [];
      let skipped = 0;

      for (const codeValue of uniqueLines) {
        const exists = await db.collection('redeem_codes').findOne({ codeValue });
        if (exists) {
          skipped += 1;
          continue;
        }
        const doc = {
          _id: generateId('RCD'),
          productId: product._id,
          codeValue,
          status: 'AVAILABLE',
          assignedUserId: null,
          assignedTransactionId: null,
          assignedAt: null,
          isDemo: product.isDemo !== false,
          createdAt: now,
        };
        await db.collection('redeem_codes').insertOne(doc);
        inserted.push(doc._id);
      }

      await createAuditLog({
        adminId: auth.admin._id,
        adminEmail: auth.admin.email,
        action: 'ADD_REDEEM_INVENTORY',
        targetType: 'REDEEM_PRODUCT',
        targetId: product._id,
        details: { addedCount: inserted.length, skippedDuplicates: skipped },
      });

      return NextResponse.json({
        ok: true,
        addedCount: inserted.length,
        skippedDuplicates: skipped,
      });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Redeem code management action failed.' }, { status: 500 });
  }
}

export async function PATCH(req) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const productId = cleanString(body.productId, 60);
    const db = await getDb();
    const product = await db.collection('redeem_products').findOne({ _id: productId });
    if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

    const updates = { updatedAt: new Date().toISOString() };
    if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
    if (body.price !== undefined) {
      const p = roundMoney(body.price);
      if (p > 0) updates.price = p;
    }

    const updated = await db.collection('redeem_products').findOneAndUpdate(
      { _id: productId },
      { $set: updates },
      { returnDocument: 'after' }
    );

    await createAuditLog({
      adminId: auth.admin._id,
      adminEmail: auth.admin.email,
      action: 'UPDATE_REDEEM_PRODUCT',
      targetType: 'REDEEM_PRODUCT',
      targetId: productId,
      details: updates,
    });

    return NextResponse.json({ ok: true, product: updated });
  } catch {
    return NextResponse.json({ error: 'Unable to update product.' }, { status: 500 });
  }
}
