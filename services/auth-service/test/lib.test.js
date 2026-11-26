import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSecrets, safeEqual, isEmail, isCode, newOtp, hashOtp, createLimiter } from '../src/lib.js';

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

test('isCode only accepts a 6-digit string', () => {
  for (const v of [{ $ne: null }, 123456, '12345a', '1234567', '', null, undefined]) assert.equal(isCode(v), false);
  assert.equal(isCode('012345'), true);
});

test('isEmail rejects non-strings', () => {
  for (const v of [{ $ne: null }, ['a@b.co'], 1, null, undefined, 'nope', 'a'.repeat(250) + '@b.co']) assert.equal(isEmail(v), false);
  assert.equal(isEmail(' a@b.co '), true);
});

test('newOtp is 6 digits', () => {
  for (let i = 0; i < 1000; i++) assert.match(newOtp(), /^\d{6}$/);
});

test('hashOtp is deterministic hex and input-bound', () => {
  const h = hashOtp('s', 'a@b.co', '123456');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, hashOtp('s', 'a@b.co', '123456'));
  assert.notEqual(h, hashOtp('s', 'c@b.co', '123456'));
  assert.notEqual(h, hashOtp('s', 'a@b.co', '123457'));
});

test('safeEqual', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual(undefined, 'abc'), false);
  assert.equal(safeEqual(['abc'], 'abc'), false);
});
