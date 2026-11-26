import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { loadSecrets, isEmail, parseAmount, isIdempotencyKey, createLimiter } from './lib.js';

const app = express();
app.use(express.json());

const port = process.env.PORT || 4003;
// Throws (and exits) on missing/weak secrets before anything else starts.
const { JWT_SECRET, INTERNAL_SECRET } = loadSecrets();
const accountsUrl = process.env.ACCOUNTS_URL;
const authUrl = process.env.AUTH_URL;

await mongoose.connect(process.env.MONGO_URL);

const schema = new mongoose.Schema({
  userId: String,
  type: String, // 'transfer' | 'airtime'
  direction: String, // 'debit' | 'credit'
  amount: Number, // integer kobo
  currency: { type: String, default: 'NGN' },
  description: String,
  opId: String,
  metadata: Object,
}, { timestamps: true });
// One ledger row per (operation, user): makes ledger writes idempotent on retry.
schema.index({ opId: 1, userId: 1 }, { unique: true, partialFilterExpression: { opId: { $type: 'string' } } });
const Transaction = mongoose.model('Transaction', schema);
await Transaction.init();

const getUser = (req) => {
  try {
    return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
};

// Every service-to-service call carries this header so the receiving service
// knows the request genuinely came from another backend service, not a
// stranger on the internet.
const internalHeaders = { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET };

// Internal call with a timeout; callers must check status before trusting body.
const internal = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: internalHeaders, signal: AbortSignal.timeout(5000) });
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => ({})) };
};

const record = async (row) => {
  const q = { opId: row.opId, userId: row.userId };
  try {
    return await Transaction.findOneAndUpdate(q, { $setOnInsert: row }, { upsert: true, new: true });
  } catch (err) {
    if (err?.code !== 11000) throw err; // concurrent upsert of the same row: it exists now
    return Transaction.findOne(q);
  }
};

const txLimit = createLimiter({ max: 30, windowMs: 60_000 });
const tooMany = (res) => res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
const badKey = (res) => res.status(400).json({ error: 'Missing or invalid Idempotency-Key header.' });
const badAmount = (res) => res.status(422).json({ error: 'Enter a valid amount.' });
const insufficient = (res) => res.status(409).json({ error: 'Insufficient demo balance.' });
const RECIPIENT_FAIL = "We couldn't complete this transfer. Check the details and try again.";

app.get('/health', (req, res) => res.json({ ok: true, service: 'transactions' }));

app.get('/api/v1/transactions/history', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const history = await Transaction.find({ userId: user.userId }).sort({ createdAt: -1 }).limit(100);
  res.json(history);
});

app.post('/api/v1/transactions/transfer', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  if (!txLimit(user.userId)) return tooMany(res);
  const key = req.get('idempotency-key');
  if (!isIdempotencyKey(key)) return badKey(res);
  const body = req.body ?? {};
  const amount = parseAmount(body.amount);
  if (amount === null) return badAmount(res);
  if (!isEmail(body.recipientEmail)) return res.status(422).json({ error: RECIPIENT_FAIL });

  try {
    const r = await internal(`${authUrl}/internal/user?email=${encodeURIComponent(body.recipientEmail)}`);
    if (r.status === 404) return res.status(422).json({ error: RECIPIENT_FAIL });
    if (!r.ok || typeof r.body.userId !== 'string') throw new Error(`auth /internal/user returned ${r.status}`);
    const recipient = r.body;
    if (recipient.userId === user.userId) return res.status(422).json({ error: "You can't send money to yourself." });

    const opId = `${user.userId}:${key}`;
    // The only money-moving call: accounts applies both legs exactly once per opId.
    const t = await internal(`${accountsUrl}/internal/transfer`, {
      method: 'POST',
      body: JSON.stringify({ transferId: opId, fromUserId: user.userId, toUserId: recipient.userId, amount }),
    });
    if (t.status === 409 && t.body.code === 'INSUFFICIENT') return insufficient(res);
    if (t.status === 409 && t.body.code === 'KEY_REUSED') return res.status(409).json({ error: t.body.error });
    if (t.status === 422 && t.body.code === 'NO_RECIPIENT') return res.status(422).json({ error: RECIPIENT_FAIL });
    if (!t.ok || t.body.status !== 'done') throw new Error(`accounts /internal/transfer returned ${t.status}`);

    // Money has moved; on failure here the client retries with the same key, accounts replays, upserts finish the ledger.
    const base = { type: 'transfer', amount, currency: 'NGN', opId };
    const tx = await record({ ...base, userId: user.userId, direction: 'debit', description: `Transfer to ${recipient.email}` });
    await record({ ...base, userId: recipient.userId, direction: 'credit', description: `Transfer from ${user.email}` });
    res.status(t.body.replayed ? 200 : 201).json(tx);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Transfer could not be completed.' });
  }
});

const PROVIDERS = ['MTN', 'GLO', 'Airtel', '9mobile'];

app.post('/api/v1/transactions/airtime', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  if (!txLimit(user.userId)) return tooMany(res);
  const key = req.get('idempotency-key');
  if (!isIdempotencyKey(key)) return badKey(res);
  const body = req.body ?? {};
  const amount = parseAmount(body.amount);
  if (amount === null) return badAmount(res);
  if (!PROVIDERS.includes(body.provider)) return res.status(422).json({ error: 'Choose a valid provider.' });

  try {
    // Namespaced apart from transfer opIds so a reused key can't make a transfer's debit look already applied.
    const opId = `${user.userId}:airtime:${key}`;
    const c = await internal(`${accountsUrl}/internal/change`, {
      method: 'POST',
      body: JSON.stringify({ userId: user.userId, delta: -amount, opId }),
    });
    if (c.status === 409) return insufficient(res);
    if (!c.ok || typeof c.body.applied !== 'boolean') throw new Error(`accounts /internal/change returned ${c.status}`);

    const description = `${body.provider} airtime (Demo)`;
    const tx = await record({ userId: user.userId, type: 'airtime', direction: 'debit', amount, currency: 'NGN', description, opId });
    if (tx.amount !== amount || tx.description !== description) {
      return res.status(409).json({ error: 'This request was already used for a different purchase.' });
    }
    res.status(c.body.applied ? 201 : 200).json(tx);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Airtime purchase could not be completed.' });
  }
});

app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, () => console.log(`transactions listening on ${port}`));
