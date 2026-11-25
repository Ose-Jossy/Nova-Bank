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

export const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const MAX_AMOUNT_KOBO = 100_000_000; // ₦1,000,000

// Naira decimal string/number -> integer kobo, or null. String parsing only, no float math.
export function parseAmount(input) {
  if (typeof input !== 'string' && !(typeof input === 'number' && Number.isFinite(input))) return null;
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(String(input).trim());
  if (!m) return null;
  const kobo = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  return kobo >= 1 && kobo <= MAX_AMOUNT_KOBO ? kobo : null;
}

export const isIdempotencyKey = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);

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
