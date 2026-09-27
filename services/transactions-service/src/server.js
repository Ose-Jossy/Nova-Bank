import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const port = process.env.PORT || 4003;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'dev-only-internal-secret';
const accountsUrl = process.env.ACCOUNTS_URL;
const authUrl = process.env.AUTH_URL;

await mongoose.connect(process.env.MONGO_URL);

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
  userId: String,
  type: String,
  amount: Number,
  currency: { type: String, default: 'NGN' },
  description: String,
  metadata: Object,
}, { timestamps: true }));

const getUser = (req) => {
  try {
    return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
  } catch {
    return null;
  }
};

// Every service-to-service call carries this header so the receiving service
// knows the request genuinely came from another backend service, not a
// stranger on the internet.
const internalHeaders = { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET };

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

  const amount = Number(req.body.amount);
  if (!(amount > 0)) return res.status(422).json({ error: 'Enter a valid amount.' });

  try {
    const senderAccount = await (await fetch(`${accountsUrl}/internal/by-user/${user.userId}`, { headers: internalHeaders })).json();
    if (senderAccount.balance < amount) return res.status(409).json({ error: 'Insufficient demo balance.' });

    const recipient = await (await fetch(
      `${authUrl}/internal/user?email=${encodeURIComponent(req.body.recipientEmail || '')}`,
      { headers: internalHeaders },
    )).json();
    if (!recipient.userId) return res.status(404).json({ error: 'Recipient not found.' });

    await fetch(`${accountsUrl}/internal/change`, {
      method: 'POST',
      headers: internalHeaders,
      body: JSON.stringify({ userId: user.userId, delta: -amount }),
    });
    await fetch(`${accountsUrl}/internal/change`, {
      method: 'POST',
      headers: internalHeaders,
      body: JSON.stringify({ userId: recipient.userId, delta: amount }),
    });

    const tx = await Transaction.create({
      userId: user.userId,
      type: 'transfer',
      amount,
      currency: 'NGN',
      description: `Transfer to ${recipient.email}`,
    });
    res.status(201).json(tx);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Transfer could not be completed.' });
  }
});

app.post('/api/v1/transactions/airtime', async (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });

  const amount = Number(req.body.amount);
  if (!(amount > 0)) return res.status(422).json({ error: 'Enter a valid amount.' });

  const account = await (await fetch(`${accountsUrl}/internal/by-user/${user.userId}`, { headers: internalHeaders })).json();
  if (account.balance < amount) return res.status(409).json({ error: 'Insufficient demo balance.' });

  await fetch(`${accountsUrl}/internal/change`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({ userId: user.userId, delta: -amount }),
  });

  const tx = await Transaction.create({
    userId: user.userId,
    type: 'airtime',
    amount,
    currency: 'NGN',
    description: `${req.body.provider || 'Mobile'} airtime (Demo)`,
  });
  res.status(201).json(tx);
});

app.listen(port, () => console.log(`transactions listening on ${port}`));
