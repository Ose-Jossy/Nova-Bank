import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSecrets, isEmail, parseAmount, isIdempotencyKey, createLimiter, MAX_AMOUNT_KOBO } from '../src/lib.js';

const A = 'a'.repeat(64), B = 'b'.repeat(64);
test('loadSecrets fails closed', () => {
  assert.throws(() => loadSecrets({}), /JWT_SECRET/);
  assert.throws(() => loadSecrets({ JWT_SECRET: 'change-this-in-production', INTERNAL_SERVICE_SECRET: B }), /JWT_SECRET/);
  assert.throws(() => loadSecrets({ JWT_SECRET: 'x'.repeat(31), INTERNAL_SERVICE_SECRET: B }), /JWT_SECRET/);
  assert.throws(() => loadSecrets({ JWT_SECRET: A }), /INTERNAL_SERVICE_SECRET/);
  assert.throws(() => loadSecrets({ JWT_SECRET: A, INTERNAL_SERVICE_SECRET: A }), /different/);
  assert.deepEqual(loadSecrets({ JWT_SECRET: A, INTERNAL_SERVICE_SECRET: B }), { JWT_SECRET: A, INTERNAL_SECRET: B });
});

test('createLimiter fixed window', () => {
  let t = 0;
  const hit = createLimiter({ max: 3, windowMs: 1000, now: () => t });
  assert.equal(hit('k'), true); assert.equal(hit('k'), true); assert.equal(hit('k'), true);
  assert.equal(hit('k'), false);
  assert.equal(hit('other'), true);
  t = 1000;
  assert.equal(hit('k'), true);
});

test('parseAmount (AC-14)', () => {
  const cases = [['100.50', 10050], ['100.5', 10050], [100, 10000], [' 25 ', 2500], ['0.01', 1], ['1000000', MAX_AMOUNT_KOBO],
    ['1000000.01', null], ['1.005', null], ['0', null], ['0.00', null], ['-1', null], ['abc', null], ['1e3', null], ['', null],
    [null, null], [{}, null], [NaN, null], [Infinity, null]];
  for (const [input, want] of cases) assert.equal(parseAmount(input), want, `parseAmount(${JSON.stringify(input)})`);
});

test('isIdempotencyKey', () => {
  assert.equal(isIdempotencyKey('a'.repeat(16)), true);
  assert.equal(isIdempotencyKey('Ab_-'.repeat(16)), true);
  for (const v of ['abc', 'a'.repeat(15), 'a'.repeat(65), 'a'.repeat(15) + '!', undefined, 1234567890123456]) assert.equal(isIdempotencyKey(v), false);
});

test('isEmail rejects non-strings', () => {
  assert.equal(isEmail({ $ne: null }), false);
  assert.equal(isEmail('a@b.co'), true);
});
