import crypto from 'node:crypto';

const WEAK = ['dev-only-secret', 'dev-only-internal-secret', 'change-this-in-production'];

// Fail closed: refuse to start on missing, short, default or shared secrets.
export function loadSecrets(env = process.env) {
  const check = (name) => {
    const v = env[name];
    if (!v) throw new Error(`${name} is not set.`);
    if (v.length < 32) throw new Error(`${name} must be at least 32 characters.`);
    if (WEAK.includes(v)) throw new Error(`${name} is a known default; generate one with openssl rand -hex 32.`);
    return v;
  };
  const JWT_SECRET = check('JWT_SECRET');
  const INTERNAL_SECRET = check('INTERNAL_SERVICE_SECRET');
  if (JWT_SECRET === INTERNAL_SECRET) throw new Error('JWT_SECRET and INTERNAL_SERVICE_SECRET must be different.');
  return { JWT_SECRET, INTERNAL_SECRET };
}

export const safeEqual = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
export const isCode = (v) => typeof v === 'string' && /^\d{6}$/.test(v);
export const newOtp = () => String(crypto.randomInt(100000, 1000000));
// Keyed HMAC so a leaked DB can't be brute-forced over the 10^6 code space without the secret.
export const hashOtp = (secret, email, code) => crypto.createHmac('sha256', secret).update(`otp:${email}:${code}`).digest('hex');

// Fixed-window counter per key; hit() returns false once a key is over max.
// shortcut: per-process memory, resets on restart; use a shared store (Redis) if services ever run >1 replica
export function createLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map();
  return (key) => {
    const t = now();
    let e = hits.get(key);
    if (e && t - e.start >= windowMs) { hits.delete(key); e = undefined; }
    if (!e) {
      if (hits.size >= 10_000) hits.clear();
      e = { start: t, count: 0 };
      hits.set(key, e);
    }
    return ++e.count <= max;
  };
}
