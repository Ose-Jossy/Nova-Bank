import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const port = process.env.PORT || 4002;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'dev-only-internal-secret';

await mongoose.connect(process.env.MONGO_URL);

const Account = mongoose.model('Account', new mongoose.Schema({
  userId: { type: String, unique: true },
  accountNumber: { type: String, unique: true },
  balance: { type: Number, default: 5000 },
  currency: { type: String, default: 'NGN' },
}, { timestamps: true }));

const generateAccountNumber = () => `NB${Math.floor(1000000000 + Math.random() * 8999999999)}`;

// Middleware: verifies a user's JWT for PUBLIC endpoints (called by the frontend).
function requireUser(req, res, next) {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Not signed in.' });
  }
}

// Middleware: verifies the shared secret for INTERNAL endpoints (called only by
// other backend services, never by the frontend/browser directly).
function requireInternal(req, res, next) {
  if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Not authorized for internal access.' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'accounts' }));

// PUBLIC — the only account route the frontend should ever call directly.
// Requires a valid JWT; a user can only ever see their own account.
app.get('/api/v1/accounts/me', requireUser, async (req, res) => {
  const account = await Account.findOne({ userId: req.user.userId });
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  res.json(account);
});

// INTERNAL — called by auth-service right after a user registers.
app.post('/internal/provision', requireInternal, async (req, res) => {
  let account = await Account.findOne({ userId: req.body.userId });
  if (!account) {
    account = await Account.create({ userId: req.body.userId, accountNumber: generateAccountNumber() });
  }
  res.status(201).json(account);
});

// INTERNAL — called by transactions-service to check a sender's balance.
app.get('/internal/by-user/:userId', requireInternal, async (req, res) => {
  const account = await Account.findOne({ userId: req.params.userId });
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  res.json(account);
});

// INTERNAL — called by transactions-service to debit/credit balances during a
// transfer or a mock purchase (airtime, etc).
app.post('/internal/change', requireInternal, async (req, res) => {
  const { userId, delta } = req.body;
  const account = await Account.findOne({ userId });
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  if (account.balance + Number(delta) < 0) return res.status(409).json({ error: 'Insufficient demo balance.' });

  account.balance += Number(delta);
  await account.save();
  res.json(account);
});

app.listen(port, () => console.log(`accounts listening on ${port}`));
