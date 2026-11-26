import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { loadSecrets, safeEqual, generateAccountNumber, isId, isKoboDelta } from './lib.js';

const app = express();
app.use(express.json());

const port = process.env.PORT || 4002;
// Throws (and exits) on missing/weak secrets before anything else starts.
const { JWT_SECRET, INTERNAL_SECRET } = loadSecrets();

await mongoose.connect(process.env.MONGO_URL);

const Account = mongoose.model('Account', new mongoose.Schema({
  userId: { type: String, unique: true },
  accountNumber: { type: String, unique: true },
  balance: { type: Number, default: 500000 }, // integer kobo (₦5,000.00)
  currency: { type: String, default: 'NGN' },
  // Op ids already applied to this balance, so each leg applies at most once.
  // shortcut: grows by one entry per operation per account; move to a replica set with transactions if accounts get busy
  appliedOps: { type: [String], select: false },
}, { timestamps: true }));

// Transfer intent + status; _id is the caller's transferId (idempotency key).
const Transfer = mongoose.model('Transfer', new mongoose.Schema({
  _id: String,
  fromUserId: String,
  toUserId: String,
  amount: Number,
  status: { type: String, enum: ['pending', 'done', 'failed'] },
  reason: String,
}, { timestamps: true }));

await Promise.all([Account.init(), Transfer.init()]);

// Middleware: verifies a user's JWT for PUBLIC endpoints (called by the frontend).
function requireUser(req, res, next) {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    res.status(401).json({ error: 'Not signed in.' });
  }
}

// Middleware: verifies the shared secret for INTERNAL endpoints (called only by
// other backend services, never by the frontend/browser directly).
function requireInternal(req, res, next) {
  if (!safeEqual(req.headers['x-internal-secret'], INTERNAL_SECRET)) {
    return res.status(401).json({ error: 'Not authorized for internal access.' });
  }
  next();
}

// One atomic single-document update per leg: never overdraws, never applies opId twice.
async function applyDelta(userId, delta, opId) {
  const updated = await Account.findOneAndUpdate(
    { userId, appliedOps: { $ne: opId }, ...(delta < 0 ? { balance: { $gte: -delta } } : {}) },
    { $inc: { balance: delta }, $push: { appliedOps: opId } });
  if (updated) return 'applied';
  const acc = await Account.findOne({ userId }).select('+appliedOps');
  if (!acc) return 'missing';
  return acc.appliedOps.includes(opId) ? 'already' : 'insufficient';
}

const insufficient = (res) => res.status(409).json({ error: 'Insufficient demo balance.', code: 'INSUFFICIENT' });
const failure = (res, reason) => reason === 'insufficient' ? insufficient(res)
  : reason === 'no_sender' ? res.status(404).json({ error: 'Account not found.', code: 'NO_SENDER' })
  : res.status(422).json({ error: 'Recipient account not found.', code: 'NO_RECIPIENT' });

// Runs the remaining legs of a pending transfer. Returns 'done' or a failure reason.
// Throws (leaving it pending, debit recorded) on unexpected errors; a same-key retry or the sweep finishes it.
async function runTransfer(t) {
  const fail = async (reason) => {
    await Transfer.updateOne({ _id: t._id, status: 'pending' }, { status: 'failed', reason });
    return reason;
  };
  if (!(await Account.exists({ userId: t.toUserId }))) return fail('no_recipient');
  const debit = await applyDelta(t.fromUserId, -t.amount, t._id);
  if (debit === 'insufficient') return fail('insufficient');
  if (debit === 'missing') return fail('no_sender');
  if (await applyDelta(t.toUserId, t.amount, t._id) === 'missing') throw new Error(`Transfer ${t._id}: recipient account vanished`);
  await Transfer.updateOne({ _id: t._id }, { status: 'done' });
  return 'done';
}

// Forward recovery for transfers interrupted between legs. Legs are idempotent, so overlap is safe.
async function sweep() {
  const stale = await Transfer.find({ status: 'pending', updatedAt: { $lt: new Date(Date.now() - 60_000) } }).limit(50);
  for (const t of stale) await runTransfer(t).catch(console.error);
}
setInterval(() => sweep().catch(console.error), 60_000).unref();

app.get('/health', (req, res) => res.json({ ok: true, service: 'accounts' }));

// PUBLIC — the only account route the frontend should ever call directly.
// Requires a valid JWT; a user can only ever see their own account.
app.get('/api/v1/accounts/me', requireUser, async (req, res) => {
  const account = await Account.findOne({ userId: req.user.userId });
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  res.json(account);
});

// INTERNAL — called by auth-service right after a user registers. Idempotent.
app.post('/internal/provision', requireInternal, async (req, res) => {
  const { userId } = req.body ?? {};
  if (!isId(userId)) return res.status(422).json({ error: 'Invalid account request.' });
  for (let i = 0; ; i++) {
    try {
      const account = await Account.findOneAndUpdate({ userId },
        { $setOnInsert: { userId, accountNumber: generateAccountNumber() } }, { upsert: true, new: true });
      return res.status(201).json(account);
    } catch (err) {
      // 11000: accountNumber collision or a concurrent provision for the same user.
      if (err?.code !== 11000 || i >= 2) throw err;
    }
  }
});

// INTERNAL — called by transactions-service to check a sender's balance.
app.get('/internal/by-user/:userId', requireInternal, async (req, res) => {
  const account = await Account.findOne({ userId: req.params.userId });
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  res.json(account);
});

// INTERNAL — single idempotent balance change (airtime, etc). delta is integer kobo.
app.post('/internal/change', requireInternal, async (req, res) => {
  const { userId, delta, opId } = req.body ?? {};
  if (!isId(userId) || !isKoboDelta(delta) || !isId(opId)) return res.status(422).json({ error: 'Invalid change request.' });
  const result = await applyDelta(userId, delta, opId);
  if (result === 'missing') return res.status(404).json({ error: 'Account not found.' });
  if (result === 'insufficient') return insufficient(res);
  res.json({ account: await Account.findOne({ userId }), applied: result === 'applied' });
});

// INTERNAL — moves money between two accounts exactly once per transferId.
app.post('/internal/transfer', requireInternal, async (req, res) => {
  const { transferId, fromUserId, toUserId, amount } = req.body ?? {};
  if (!isId(transferId) || !isId(fromUserId) || !isId(toUserId) || !Number.isSafeInteger(amount) || amount <= 0 || fromUserId === toUserId) {
    return res.status(422).json({ error: 'Invalid transfer request.' });
  }
  let t;
  try {
    t = await Transfer.create({ _id: transferId, fromUserId, toUserId, amount, status: 'pending' });
  } catch (err) {
    if (err?.code !== 11000) throw err;
    t = await Transfer.findById(transferId);
    if (t.fromUserId !== fromUserId || t.toUserId !== toUserId || t.amount !== amount) {
      return res.status(409).json({ code: 'KEY_REUSED', error: 'This request was already used for a different transfer.' });
    }
    if (t.status === 'done') return res.json({ transferId, status: 'done', replayed: true });
    if (t.status === 'failed') return failure(res, t.reason);
  }
  const result = await runTransfer(t);
  if (result !== 'done') return failure(res, result);
  res.status(201).json({ transferId, status: 'done', replayed: false });
});

app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, () => console.log(`accounts listening on ${port}`));
