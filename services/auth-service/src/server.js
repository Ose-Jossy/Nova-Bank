import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { loadSecrets, safeEqual, isEmail, isCode, newOtp, hashOtp, createLimiter } from './lib.js';

const app = express();
app.use(express.json());

const port = process.env.PORT || 4001;
// Throws (and exits) on missing/weak secrets before anything else starts.
const { JWT_SECRET, INTERNAL_SECRET } = loadSecrets();

// Shared secret that ONLY backend services know, required on service-to-service
// ("internal") routes. This is a lightweight stand-in for a real service-mesh /
// mTLS setup, and a second layer of defense even if a route is ever accidentally
// exposed publicly by a reverse proxy.

await mongoose.connect(process.env.MONGO_URL);

const User = mongoose.model('User', new mongoose.Schema({
  fullName: String,
  email: { type: String, unique: true },
  phone: String,
  passwordHash: String,
  isVerified: Boolean,
  verificationCodeHash: String,
  verificationExpires: Date,
  verificationAttempts: { type: Number, default: 0 },
  loginCodeHash: String,
  loginCodeExpires: Date,
  loginAttempts: { type: Number, default: 0 },
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
const authLimit = createLimiter({ max: 10, windowMs: 15 * 60_000 });
const tooMany = (res) => res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });

// Middleware: only allow requests carrying the correct internal service secret.
// This route should never be reachable from the public internet, and this
// middleware is the last line of defense if it ever is.
function requireInternal(req, res, next) {
  if (!safeEqual(req.headers['x-internal-secret'], INTERNAL_SECRET)) {
    return res.status(401).json({ error: 'Not authorized for internal access.' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'auth' }));

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body || {};
    if (typeof fullName !== 'string' || fullName.trim().length < 2) return res.status(422).json({ error: 'Enter your full name.' });
    if (!isEmail(email)) return res.status(422).json({ error: 'Enter a valid email address.' });
    if (typeof phone !== 'string' || phone.trim().length < 7) return res.status(422).json({ error: 'Enter a valid phone number.' });
    if (!passwordOk(password)) return res.status(422).json({ error: 'Password must be at least 8 characters and use only letters, numbers and @#$%^&*()_+!.' });

    const e = email.trim().toLowerCase();
    if (!authLimit(`register:${e}`)) return tooMany(res);
    const exists = () => res.status(409).json({ error: 'An account with that email already exists.' });
    if (await User.exists({ email: e })) return exists();

    const otp = newOtp();
    let user;
    try {
      user = await User.create({
        fullName: fullName.trim(),
        email: e,
        phone: phone.trim(),
        passwordHash: await bcrypt.hash(password, 12),
        isVerified: false,
        verificationCodeHash: hashOtp(JWT_SECRET, e, otp),
        verificationExpires: new Date(Date.now() + 15 * 60000),
      });
    } catch (err) {
      if (err?.code === 11000) return exists();
      throw err;
    }

    // Provision an account for this user — a service-to-service call, so it
    // carries the internal secret header. On failure, remove the user so the
    // email can register again instead of being stuck without an account.
    const provisioned = await fetch(`${process.env.ACCOUNTS_URL}/internal/provision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ userId: user.id }),
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.ok, () => false);
    if (!provisioned) {
      await User.deleteOne({ _id: user._id });
      return res.status(500).json({ error: 'We could not create your account. Please try again.' });
    }

    const sent = await sendCode(e, otp, 'Your NovaBank verification code');
    res.status(201).json({ userId: user.id, emailSent: sent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'We could not create your account. Please try again.' });
  }
});

app.post('/api/v1/auth/verify', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const bad = () => res.status(400).json({ error: 'That verification code is invalid or expired.' });
    // typeof checks before any DB call: blocks {"$ne": null}-style operator injection.
    if (!isEmail(email) || !isCode(code)) return bad();
    const e = email.trim().toLowerCase();
    if (!authLimit(`verify:${e}`)) return tooMany(res);

    // Atomic $inc under $lt: 5 caps guesses per code, race-free (the successful try counts).
    const u = await User.findOneAndUpdate(
      { email: e, isVerified: false, verificationExpires: { $gt: new Date() }, verificationAttempts: { $lt: 5 } },
      { $inc: { verificationAttempts: 1 } }, { new: true });
    if (!u || !safeEqual(u.verificationCodeHash, hashOtp(JWT_SECRET, e, code))) return bad();

    await User.updateOne({ _id: u._id }, { $set: { isVerified: true }, $unset: { verificationCodeHash: 1, verificationExpires: 1, verificationAttempts: 1 } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const invalid = () => res.status(401).json({ error: 'Invalid email or password.' });
    if (!isEmail(email) || typeof password !== 'string') return invalid();
    const e = email.trim().toLowerCase();
    if (!authLimit(`login:${e}`)) return tooMany(res);
    const u = await User.findOne({ email: e });
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) return invalid();
    if (!u.isVerified) return res.status(403).json({ error: 'Please verify your demo account first.' });

    const otp = newOtp();
    u.loginCodeHash = hashOtp(JWT_SECRET, e, otp);
    u.loginCodeExpires = new Date(Date.now() + 10 * 60000);
    u.loginAttempts = 0;
    await u.save();

    const sent = await sendCode(u.email, otp, 'Your NovaBank login code');
    res.json({ emailSent: sent });
  } catch {
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/v1/auth/login/verify', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const bad = () => res.status(401).json({ error: 'That login code is invalid or expired.' });
    if (!isEmail(email) || !isCode(code)) return bad();
    const e = email.trim().toLowerCase();
    if (!authLimit(`login-verify:${e}`)) return tooMany(res);

    const u = await User.findOneAndUpdate(
      { email: e, loginCodeExpires: { $gt: new Date() }, loginAttempts: { $lt: 5 } },
      { $inc: { loginAttempts: 1 } }, { new: true });
    if (!u || !safeEqual(u.loginCodeHash, hashOtp(JWT_SECRET, e, code))) return bad();

    await User.updateOne({ _id: u._id }, { $unset: { loginCodeHash: 1, loginCodeExpires: 1, loginAttempts: 1 } });
    res.json({ token: jwt.sign({ userId: u.id, email: u.email }, JWT_SECRET, { expiresIn: '2h' }) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.get('/api/v1/auth/me', (req, res) => {
  try {
    const payload = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET, { algorithms: ['HS256'] });
    res.json(payload);
  } catch {
    res.status(401).json({ error: 'Not signed in.' });
  }
});

// INTERNAL ONLY — used by transactions-service to resolve a recipient's userId
// from their email during a transfer. Moved off the public /api/v1/auth/ prefix
// and behind the internal-secret check so it is never reachable from the
// internet, even by accident.
app.get('/internal/user', requireInternal, async (req, res) => {
  if (!isEmail(req.query.email)) return res.status(404).json({ error: 'Recipient not found.' });
  const u = await User.findOne({ email: req.query.email.trim().toLowerCase() });
  if (!u) return res.status(404).json({ error: 'Recipient not found.' });
  res.json({ userId: u.id, email: u.email, fullName: u.fullName });
});

app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, () => console.log(`auth listening on ${port}`));
