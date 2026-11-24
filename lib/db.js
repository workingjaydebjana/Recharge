import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { MongoClient } from 'mongodb';
import { DEFAULT_COMMISSION_RULES, DEFAULT_PLATFORM_SETTINGS } from './constants.js';
import { generateId } from './security.js';

const lockContext = new AsyncLocalStorage();

const COLLECTION_NAMES = [
  'users',
  'admins',
  'wallets',
  'wallet_ledger',
  'deposits',
  'transactions',
  'commissions',
  'recharge_providers',
  'redeem_products',
  'redeem_codes',
  'complaints',
  'notifications',
  'settings',
  'audit_logs',
  'otps',
  'sessions',
  'rate_limits',
];

const DATA_DIR = path.join(os.tmpdir(), 'paysetu-data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'paysetu-mongodb.json');

const globalStore = globalThis;
if (!globalStore.__paysetuDbState) {
  globalStore.__paysetuDbState = {
    mongoClient: null,
    mongoDb: null,
    localData: null,
    initialized: false,
    mode: process.env.MONGODB_URI ? 'MONGODB' : 'LOCAL_MONGODB_FALLBACK',
    writeLock: Promise.resolve(),
  };
}

function cloneDoc(doc) {
  return doc === null || doc === undefined ? doc : JSON.parse(JSON.stringify(doc));
}

function getNested(obj, dotPath) {
  const parts = String(dotPath).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNested(obj, dotPath, value) {
  const parts = String(dotPath).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (typeof cur[key] !== 'object' || cur[key] === null) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

function matchesFilter(doc, filter = {}) {
  for (const [key, expected] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(expected)) {
      if (!expected.some((sub) => matchesFilter(doc, sub))) return false;
      continue;
    }
    if (key === '$and' && Array.isArray(expected)) {
      if (!expected.every((sub) => matchesFilter(doc, sub))) return false;
      continue;
    }
    const actual = getNested(doc, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof RegExp)) {
      for (const [op, opVal] of Object.entries(expected)) {
        if (op === '$gte' && !(actual >= opVal)) return false;
        if (op === '$gt' && !(actual > opVal)) return false;
        if (op === '$lte' && !(actual <= opVal)) return false;
        if (op === '$lt' && !(actual < opVal)) return false;
        if (op === '$ne' && actual === opVal) return false;
        if (op === '$in' && (!Array.isArray(opVal) || !opVal.includes(actual))) return false;
        if (op === '$nin' && Array.isArray(opVal) && opVal.includes(actual)) return false;
        if (op === '$regex') {
          const re = opVal instanceof RegExp ? opVal : new RegExp(opVal, expected.$options || '');
          if (!re.test(String(actual ?? ''))) return false;
        }
      }
    } else if (expected instanceof RegExp) {
      if (!expected.test(String(actual ?? ''))) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function applyUpdate(doc, update) {
  if (update.$set) {
    for (const [k, v] of Object.entries(update.$set)) {
      setNested(doc, k, cloneDoc(v));
    }
  }
  if (update.$inc) {
    for (const [k, delta] of Object.entries(update.$inc)) {
      const prev = Number(getNested(doc, k) || 0);
      const next = Math.round((prev + Number(delta) + Number.EPSILON) * 100) / 100;
      setNested(doc, k, next);
    }
  }
  if (update.$push) {
    for (const [k, item] of Object.entries(update.$push)) {
      const existing = getNested(doc, k);
      const arr = Array.isArray(existing) ? existing : [];
      arr.push(cloneDoc(item));
      setNested(doc, k, arr);
    }
  }
  return doc;
}

function loadLocalData() {
  if (globalStore.__paysetuDbState.localData) {
    return globalStore.__paysetuDbState.localData;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  let parsed = {};
  if (fs.existsSync(LOCAL_DB_FILE)) {
    try {
      parsed = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
    } catch {
      parsed = {};
    }
  }
  for (const name of COLLECTION_NAMES) {
    if (!Array.isArray(parsed[name])) parsed[name] = [];
  }
  globalStore.__paysetuDbState.localData = parsed;
  return parsed;
}

function persistLocalData() {
  const data = loadLocalData();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${LOCAL_DB_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, LOCAL_DB_FILE);
}

function createLocalCursor(items) {
  let result = items.map(cloneDoc);
  return {
    sort(sortSpec = {}) {
      const entries = Object.entries(sortSpec);
      result.sort((a, b) => {
        for (const [field, dir] of entries) {
          const av = getNested(a, field);
          const bv = getNested(b, field);
          if (av === bv) continue;
          if (av === undefined || av === null) return 1;
          if (bv === undefined || bv === null) return -1;
          if (av < bv) return dir >= 0 ? -1 : 1;
          if (av > bv) return dir >= 0 ? 1 : -1;
        }
        return 0;
      });
      return this;
    },
    limit(n) {
      result = result.slice(0, Number(n));
      return this;
    },
    skip(n) {
      result = result.slice(Number(n));
      return this;
    },
    async toArray() {
      return result.map(cloneDoc);
    },
  };
}

function createLocalCollection(name) {
  return {
    find(filter = {}) {
      const col = loadLocalData()[name] || [];
      const matched = col.filter((doc) => matchesFilter(doc, filter));
      return createLocalCursor(matched);
    },
    async findOne(filter = {}) {
      const col = loadLocalData()[name] || [];
      const found = col.find((doc) => matchesFilter(doc, filter));
      return found ? cloneDoc(found) : null;
    },
    async countDocuments(filter = {}) {
      const col = loadLocalData()[name] || [];
      return col.filter((doc) => matchesFilter(doc, filter)).length;
    },
    async insertOne(doc) {
      const data = loadLocalData();
      const copy = cloneDoc(doc);
      if (!copy._id) copy._id = generateId('DOC');
      data[name].push(copy);
      persistLocalData();
      return { insertedId: copy._id, acknowledged: true };
    },
    async insertMany(docs) {
      const data = loadLocalData();
      const copies = docs.map((d) => {
        const c = cloneDoc(d);
        if (!c._id) c._id = generateId('DOC');
        return c;
      });
      data[name].push(...copies);
      persistLocalData();
      return { insertedCount: copies.length, acknowledged: true };
    },
    async updateOne(filter, update, options = {}) {
      const data = loadLocalData();
      const col = data[name];
      const idx = col.findIndex((doc) => matchesFilter(doc, filter));
      if (idx === -1) {
        if (options.upsert) {
          const base = {};
          for (const [k, v] of Object.entries(filter)) {
            if (!k.startsWith('$') && (typeof v !== 'object' || v === null)) {
              base[k] = v;
            }
          }
          if (!base._id) base._id = generateId('DOC');
          applyUpdate(base, update);
          col.push(base);
          persistLocalData();
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      }
      applyUpdate(col[idx], update);
      persistLocalData();
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const data = loadLocalData();
      const col = data[name];
      const idx = col.findIndex((doc) => matchesFilter(doc, filter));
      if (idx === -1) return null;
      const before = cloneDoc(col[idx]);
      applyUpdate(col[idx], update);
      persistLocalData();
      return options.returnDocument === 'before' ? before : cloneDoc(col[idx]);
    },
    async deleteOne(filter) {
      const data = loadLocalData();
      const col = data[name];
      const idx = col.findIndex((doc) => matchesFilter(doc, filter));
      if (idx === -1) return { deletedCount: 0 };
      col.splice(idx, 1);
      persistLocalData();
      return { deletedCount: 1 };
    },
    async deleteMany(filter = {}) {
      const data = loadLocalData();
      const before = data[name].length;
      data[name] = data[name].filter((doc) => !matchesFilter(doc, filter));
      persistLocalData();
      return { deletedCount: before - data[name].length };
    },
    async createIndex() {
      return 'ok';
    },
  };
}

/**
 * Serialize critical financial operations inside Node process to guarantee atomicity
 * both in local fallback mode and alongside MongoDB conditional updates.
 */
export async function withAtomicLock(fn) {
  if (lockContext.getStore() === true) {
    return fn();
  }
  const prev = globalStore.__paysetuDbState.writeLock;
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  globalStore.__paysetuDbState.writeLock = prev.then(() => next);
  await prev;
  try {
    return await lockContext.run(true, fn);
  } finally {
    release();
  }
}

const SERVICE_SORT_ORDER = {
  MOBILE: 1,
  DTH: 2,
  ELECTRICITY: 3,
  REDEEM_CODE: 4,
};

export async function ensureAllCommissionRules(dbInstance = null, timestamp = null) {
  const db = dbInstance || (await getDb());
  const now = timestamp || new Date().toISOString();
  const existing = await db.collection('commissions').find({}).toArray();
  const existingById = new Map(existing.map((r) => [r._id, r]));

  // Carry over legacy combined ELECTRICITY_DEFAULT rate into WBSEDCL & CESC if migrating
  const legacyElec = existingById.get('ELECTRICITY_ELECTRICITY_DEFAULT') || null;

  for (const rule of DEFAULT_COMMISSION_RULES) {
    const id = `${rule.serviceType}_${rule.operatorCode}`;
    if (!existingById.has(id)) {
      const inherited =
        rule.serviceType === 'ELECTRICITY' && legacyElec
          ? {
              rateType: legacyElec.rateType || rule.rateType,
              rateValue: Number.isFinite(Number(legacyElec.rateValue)) ? Number(legacyElec.rateValue) : rule.rateValue,
              isActive: legacyElec.isActive !== false,
            }
          : {};
      await db.collection('commissions').insertOne({
        _id: id,
        ...rule,
        ...inherited,
        updatedAt: now,
      });
    }
  }

  // Clean up legacy combined ELECTRICITY_DEFAULT once WBSEDCL & CESC exist
  if (legacyElec) {
    await db.collection('commissions').deleteOne({ _id: 'ELECTRICITY_ELECTRICITY_DEFAULT' });
  }

  const all = await db.collection('commissions').find({}).toArray();
  const orderIndex = new Map(
    DEFAULT_COMMISSION_RULES.map((r, i) => [`${r.serviceType}_${r.operatorCode}`, i])
  );
  all.sort((a, b) => {
    const sa = SERVICE_SORT_ORDER[a.serviceType] || 99;
    const sb = SERVICE_SORT_ORDER[b.serviceType] || 99;
    if (sa !== sb) return sa - sb;
    const oa = orderIndex.has(a._id) ? orderIndex.get(a._id) : 999;
    const ob = orderIndex.has(b._id) ? orderIndex.get(b._id) : 999;
    if (oa !== ob) return oa - ob;
    return String(a.operatorName || '').localeCompare(String(b.operatorName || ''));
  });
  return all;
}

async function seedInitialData(db) {
  const now = new Date().toISOString();

  // 1. Platform Settings
  const existingSettings = await db.collection('settings').findOne({ _id: 'platform_settings' });
  if (!existingSettings) {
    await db.collection('settings').insertOne({
      ...DEFAULT_PLATFORM_SETTINGS,
      otpMode: process.env.OTP_PROVIDER_ENDPOINT ? 'CONFIGURED_PROVIDER' : 'STANDARD',
      updatedAt: now,
    });
  } else if (existingSettings.platformName === 'PaySetu') {
    const legacyPatch = {
      platformName: 'Quick Recharge',
      updatedAt: now,
    };
    if (existingSettings.supportEmail === 'support@paysetu.in') {
      legacyPatch.supportEmail = 'support@quickrecharge.in';
    }
    if (existingSettings.depositInstructions) {
      legacyPatch.depositInstructions = {
        ...existingSettings.depositInstructions,
        upiId:
          existingSettings.depositInstructions.upiId === 'paysetu@upi'
            ? 'quickrecharge@upi'
            : existingSettings.depositInstructions.upiId,
        bankName:
          existingSettings.depositInstructions.bankName === 'PaySetu Settlement Bank'
            ? 'Quick Recharge Settlement Bank'
            : existingSettings.depositInstructions.bankName,
        accountName:
          existingSettings.depositInstructions.accountName === 'PaySetu Digital Services Pvt Ltd' ||
          existingSettings.depositInstructions.accountName === 'PaySetu Digital Services'
            ? 'Quick Recharge Digital Services Pvt Ltd'
            : existingSettings.depositInstructions.accountName,
      };
    }
    await db.collection('settings').updateOne({ _id: 'platform_settings' }, { $set: legacyPatch });
  }

  // 2. Super Admin Commission Rules (ensure ALL website services exist cleanly)
  await ensureAllCommissionRules(db, now);

  // 3. Default Recharge Provider Placeholders (Unconfigured / Demo Mode)
  const providerCount = await db.collection('recharge_providers').countDocuments({});
  if (providerCount === 0) {
    await db.collection('recharge_providers').insertMany([
      {
        _id: 'PROVIDER_MOBILE_PRIMARY',
        name: 'Primary Mobile Recharge Gateway',
        serviceType: 'MOBILE',
        baseUrl: '',
        apiKeyEncrypted: '',
        apiSecretEncrypted: '',
        webhookSecretEncrypted: '',
        mode: 'DEMO',
        isConfigured: false,
        isActive: false,
        updatedAt: now,
      },
      {
        _id: 'PROVIDER_DTH_PRIMARY',
        name: 'Primary DTH Recharge Gateway',
        serviceType: 'DTH',
        baseUrl: '',
        apiKeyEncrypted: '',
        apiSecretEncrypted: '',
        webhookSecretEncrypted: '',
        mode: 'DEMO',
        isConfigured: false,
        isActive: false,
        updatedAt: now,
      },
      {
        _id: 'PROVIDER_FAMGATEWAY_UPI',
        name: 'FamGateway Automated UPI',
        serviceType: 'PAYMENT_GATEWAY',
        baseUrl: 'https://famgateway.in',
        apiKeyEncrypted: '',
        apiSecretEncrypted: '',
        webhookSecretEncrypted: '',
        mode: 'LIVE',
        isConfigured: Boolean(process.env.FAMGATEWAY_API_KEY),
        isActive: Boolean(process.env.FAMGATEWAY_API_KEY),
        updatedAt: now,
      },
    ]);
  } else {
    const famProv = await db.collection('recharge_providers').findOne({ _id: 'PROVIDER_FAMGATEWAY_UPI' });
    if (!famProv) {
      await db.collection('recharge_providers').insertOne({
        _id: 'PROVIDER_FAMGATEWAY_UPI',
        name: 'FamGateway Automated UPI',
        serviceType: 'PAYMENT_GATEWAY',
        baseUrl: 'https://famgateway.in',
        apiKeyEncrypted: '',
        apiSecretEncrypted: '',
        webhookSecretEncrypted: '',
        mode: 'LIVE',
        isConfigured: Boolean(process.env.FAMGATEWAY_API_KEY),
        isActive: Boolean(process.env.FAMGATEWAY_API_KEY),
        updatedAt: now,
      });
    }
  }

  // 4. Default Redeem Code Catalog + Initial Inventory
  const productCount = await db.collection('redeem_products').countDocuments({});
  if (productCount === 0) {
    const initialProducts = [
      {
        _id: 'PROD-GPLAY-100',
        title: 'Google Play Recharge Code ₹100',
        brand: 'Google Play',
        category: 'App & Games',
        faceValue: 100,
        price: 98,
        description: 'Digital voucher for Android apps, games, and Play Store subscriptions.',
        isActive: true,
        isDemo: false,
        createdAt: now,
      },
      {
        _id: 'PROD-GPLAY-500',
        title: 'Google Play Recharge Code ₹500',
        brand: 'Google Play',
        category: 'App & Games',
        faceValue: 500,
        price: 490,
        description: 'Digital voucher worth ₹500 for Play Store balance redemption.',
        isActive: true,
        isDemo: false,
        createdAt: now,
      },
      {
        _id: 'PROD-AMZN-250',
        title: 'Amazon Pay Gift Voucher ₹250',
        brand: 'Amazon Pay',
        category: 'Shopping & Bills',
        faceValue: 250,
        price: 245,
        description: 'Amazon Pay e-gift voucher redeemable for shopping and bill payments.',
        isActive: true,
        isDemo: false,
        createdAt: now,
      },
      {
        _id: 'PROD-STEAM-500',
        title: 'Steam Wallet Code ₹500',
        brand: 'Steam',
        category: 'PC Gaming',
        faceValue: 500,
        price: 495,
        description: 'Steam India wallet voucher for PC games and in-game purchases.',
        isActive: true,
        isDemo: false,
        createdAt: now,
      },
    ];
    await db.collection('redeem_products').insertMany(initialProducts);

    const initialCodes = [];
    for (const prod of initialProducts) {
      for (let i = 1; i <= 5; i += 1) {
        const suffix = String(1000 + i * 137).slice(0, 4);
        initialCodes.push({
          _id: generateId('RCD'),
          productId: prod._id,
          codeValue: `PS-${prod.brand.slice(0, 4).toUpperCase().replace(/\s/g, '')}-${prod.faceValue}-${suffix}`,
          status: 'AVAILABLE',
          assignedUserId: null,
          assignedTransactionId: null,
          assignedAt: null,
          isDemo: false,
          createdAt: now,
        });
      }
    }
    await db.collection('redeem_codes').insertMany(initialCodes);
  }

  // Ensure standard quick Google Play denominations (₹10, ₹50, ₹200) exist in inventory for instant assignment
  const standardGpDenoms = [
    { _id: 'PROD-GPLAY-10', faceValue: 10, price: 10 },
    { _id: 'PROD-GPLAY-50', faceValue: 50, price: 50 },
    { _id: 'PROD-GPLAY-200', faceValue: 200, price: 200 },
  ];
  for (const denom of standardGpDenoms) {
    const existsProd = await db.collection('redeem_products').findOne({ _id: denom._id });
    if (!existsProd) {
      await db.collection('redeem_products').insertOne({
        _id: denom._id,
        title: `Google Play Recharge Code ₹${denom.faceValue}`,
        brand: 'Google Play',
        category: 'App & Games',
        faceValue: denom.faceValue,
        price: denom.price,
        description: `Digital voucher worth ₹${denom.faceValue} for Google Play Store balance redemption.`,
        isActive: true,
        isDemo: true,
        createdAt: now,
      });

      const seededCodes = [];
      for (let i = 1; i <= 5; i += 1) {
        const seg1 = String(1000 + denom.faceValue * 7 + i * 131).slice(0, 4);
        const seg2 = String(2000 + denom.faceValue * 3 + i * 257).slice(0, 4);
        seededCodes.push({
          _id: generateId('RCD'),
          productId: denom._id,
          codeValue: `GP${denom.faceValue}-${seg1}-${seg2}-${1000 + i * 173}`,
          status: 'AVAILABLE',
          assignedUserId: null,
          assignedTransactionId: null,
          assignedAt: null,
          isDemo: true,
          createdAt: now,
        });
      }
      await db.collection('redeem_codes').insertMany(seededCodes);
    }
  }
}

async function ensureMongoIndexes(db) {
  try {
    await db.collection('users').createIndex({ mobile: 1 }, { unique: true });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('wallets').createIndex({ userId: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
    await db.collection('wallet_ledger').createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
    await db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true });
  } catch {
    // Ignore duplicate index errors on existing databases
  }
}

function sanitizeMongoDbName(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[/\\."$*<>:|?\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);
  return cleaned || 'paysetu_recharge';
}

export async function getDb() {
  const state = globalStore.__paysetuDbState;
  const mongoUri = (process.env.MONGODB_URI || '').trim();

  if (mongoUri && !state.mongoDb && !state.mongoFailed) {
    if (!state.connectPromise) {
      state.connectPromise = (async () => {
        let client = null;
        try {
          client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
          await client.connect();
          const dbName = sanitizeMongoDbName(process.env.MONGODB_DB_NAME);
          const db = client.db(dbName);
          await db.command({ ping: 1 });
          await ensureMongoIndexes(db);
          state.mongoClient = client;
          state.mongoDb = db;
          state.mode = 'MONGODB';
        } catch (err) {
          console.error(
            'MongoDB connection failed, falling back to local persistent MongoDB-compatible store:',
            err?.message || err
          );
          if (client) {
            try {
              await client.close();
            } catch {
              // ignore close error
            }
          }
          state.mongoFailed = true;
          state.mode = 'LOCAL_MONGODB_FALLBACK';
        } finally {
          state.connectPromise = null;
        }
      })();
    }
    await state.connectPromise;
  }

  const dbHandle = state.mongoDb
    ? {
        mode: 'MONGODB',
        collection: (name) => state.mongoDb.collection(name),
      }
    : {
        mode: 'LOCAL_MONGODB_FALLBACK',
        collection: (name) => createLocalCollection(name),
      };

  if (!state.initialized) {
    if (!state.seedPromise) {
      state.seedPromise = seedInitialData(dbHandle)
        .then(() => {
          state.initialized = true;
        })
        .finally(() => {
          state.seedPromise = null;
        });
    }
    await state.seedPromise;
  }

  return dbHandle;
}

export function getDbMode() {
  return globalStore.__paysetuDbState.mode;
}
