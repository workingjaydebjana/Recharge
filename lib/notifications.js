import { getDb } from './db.js';
import { generateId } from './security.js';

export async function createNotification({ userId, title, message, category = 'GENERAL', referenceId = '' }) {
  const db = await getDb();
  const doc = {
    _id: generateId('NTF'),
    userId,
    title,
    message,
    category, // 'RECHARGE' | 'DEPOSIT' | 'REFUND' | 'COMMISSION' | 'REDEEM' | 'COMPLAINT' | 'SYSTEM'
    referenceId,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  await db.collection('notifications').insertOne(doc);
  return doc;
}

export async function createAuditLog({ adminId, adminEmail, action, targetType, targetId, details = {} }) {
  const db = await getDb();
  const doc = {
    _id: generateId('AUD'),
    adminId,
    adminEmail,
    action,
    targetType,
    targetId,
    details,
    createdAt: new Date().toISOString(),
  };
  await db.collection('audit_logs').insertOne(doc);
  return doc;
}
