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

export const generateAccountNumber = () => `NB${crypto.randomInt(1_000_000_000, 10_000_000_000)}`;
export const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;
export const isKoboDelta = (v) => Number.isSafeInteger(v) && v !== 0;
