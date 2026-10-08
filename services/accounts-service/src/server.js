import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

const app = express();
app.use(express.json());

const port = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';

// Shared secret that ONLY backend services know, required on service-to-service
// ("internal") routes. This is a lightweight stand-in for a real service-mesh /
// mTLS setup, and a second layer of defense even if a route is ever accidentally
// exposed publicly by a reverse proxy.
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'dev-only-internal-secret';

await mongoose.connect(process.env.MONGO_URL);

const User = mongoose.model('User', new mongoose.Schema({
  fullName: String,
  email: { type: String, unique: true },
  phone: String,
  passwordHash: String,
  isVerified: Boolean,
  verificationCode: String,
  verificationExpires: Date,
  loginCode: String,
  loginCodeExpires: Date,
}, { timestamps: true }));

const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

const sendCode = async (to, code, subject) => {
  if (!mailer) {
    console.log('[NovaBank demo code]', to, code);
    return false;
  }
  await mailer.sendMail({ from: process.env.MAIL_FROM, to, subject, text: `Your NovaBank demo code is ${code}.` });
  return true;
};

const passwordOk = (p) => typeof p === 'string' && p.length >= 8 && /^[A-Za-z0-9@#$%^&*()_+!]+$/.test(p);
const code = () => String(Math.floor(100000 + Math.random() * 900000));

// Middleware: only allow requests carrying the correct internal service secret.
// This route should never be reachable from the public internet, and this
// middleware is the last line of defense if it ever is.
function requireInternal(req, res, next) {
  if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Not authorized for internal access.' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'auth' }));

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body || {};
    if (!fullName || fullName.trim().length < 2) return res.status(422).json({ error: 'Enter your full name.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(422).json({ error: 'Enter a valid email address.' });
    if (!phone || phone.trim().length < 7) return res.status(422).json({ error: 'Enter a valid phone number.' });
    if (!passwordOk(password)) return res.status(422).json({ error: 'Password must be at least 8 characters and use only letters, numbers and @#$%^&*()_+!.' });

    const e = email.trim().toLowerCase();
    if (await User.exists({ email: e })) return res.status(409).json({ error: 'An account with that email already exists.' });

    const verificationCode = code();
    const user = await User.create({
      fullName: fullName.trim(),
      email: e,
      phone: phone.trim(),
      passwordHash: await bcrypt.hash(password, 12),
      isVerified: false,
      verificationCode,
      verificationExpires: new Date(Date.now() + 15 * 60000),
    });

    // Provision an account for this user — a service-to-service call, so it
    // carries the internal secret header.
    await fetch(`${process.env.ACCOUNTS_URL}/internal/provision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ userId: user.id }),
    });

    const sent = await sendCode(e, verificationCode, 'Your NovaBank verification code');
    res.status(201).json({ userId: user.id, emailSent: sent, demoCode: sent ? undefined : verificationCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'We could not create your account. Please try again.' });
  }
});

app.post('/api/v1/auth/verify', async (req, res) => {
  try {
    const { email, code: submittedCode } = req.body || {};
    const u = await User.findOne({
      email: String(email).toLowerCase(),
      verificationCode: submittedCode,
      verificationExpires: { $gt: new Date() },
    });
    if (!u) return res.status(400).json({ error: 'That verification code is invalid or expired.' });

    u.isVerified = true;
    u.verificationCode = undefined;
    u.verificationExpires = undefined;
    await u.save();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const u = await User.findOne({ email: String(email || '').toLowerCase() });
    if (!u || !(await bcrypt.compare(password || '', u.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!u.isVerified) return res.status(403).json({ error: 'Please verify your demo account first.' });

    const loginCode = code();
    u.loginCode = loginCode;
    u.loginCodeExpires = new Date(Date.now() + 10 * 60000);
    await u.save();

    const sent = await sendCode(u.email, loginCode, 'Your NovaBank login code');
    res.json({ emailSent: sent, demoCode: sent ? undefined : loginCode });
  } catch {
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/v1/auth/login/verify', async (req, res) => {
  const { email, code: submittedCode } = req.body || {};
  const u = await User.findOne({
    email: String(email).toLowerCase(),
    loginCode: submittedCode,
    loginCodeExpires: { $gt: new Date() },
  });
  if (!u) return res.status(401).json({ error: 'That login code is invalid or expired.' });

  u.loginCode = undefined;
  u.loginCodeExpires = undefined;
  await u.save();
  res.json({ token: jwt.sign({ userId: u.id, email: u.email }, JWT_SECRET, { expiresIn: '2h' }) });
});

app.get('/api/v1/auth/me', async (req, res) => {
  try {
    const payload = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
    const u = await User.findById(payload.userId);
    if (!u) return res.status(404).json({ error: 'User not found.' });
    res.json({ userId: u.id, fullName: u.fullName, email: u.email, phone: u.phone });
  } catch {
    res.status(401).json({ error: 'Not signed in.' });
  }
});

// INTERNAL ONLY — used by transactions-service to resolve a recipient's userId
// from their email during a transfer. Moved off the public /api/v1/auth/ prefix
// and behind the internal-secret check so it is never reachable from the
// internet, even by accident.
app.get('/internal/user', requireInternal, async (req, res) => {
  const u = await User.findOne({ email: String(req.query.email || '').toLowerCase() });
  if (!u) return res.status(404).json({ error: 'Recipient not found.' });
  res.json({ userId: u.id, email: u.email, fullName: u.fullName });
});

app.listen(port, () => console.log(`auth listening on ${port}`));
