import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSecrets, safeEqual, generateAccountNumber, isId, isKoboDelta } from '../src/lib.js';

const A = 'a'.repeat(64), B = 'b'.repeat(64);
test('loadSecrets fails closed', () => {
  assert.throws(() => loadSecrets({}), /JWT_SECRET/);
  assert.throws(() => loadSecrets({ JWT_SECRET: 'change-this-in-production', INTERNAL_SERVICE_SECRET: B }), /JWT_SECRET/);
  assert.throws(() => loadSecrets({ JWT_SECRET: 'x'.repeat(31), INTERNAL_SERVICE_SECRET: B }), /JWT_SECRET/);
  assert.throws(() => loadSecrets({ JWT_SECRET: A }), /INTERNAL_SERVICE_SECRET/);
  assert.throws(() => loadSecrets({ JWT_SECRET: A, INTERNAL_SERVICE_SECRET: A }), /different/);
  assert.deepEqual(loadSecrets({ JWT_SECRET: A, INTERNAL_SERVICE_SECRET: B }), { JWT_SECRET: A, INTERNAL_SECRET: B });
});

test('generateAccountNumber', () => {
  for (let i = 0; i < 1000; i++) assert.match(generateAccountNumber(), /^NB\d{10}$/);
});

test('isKoboDelta', () => {
  for (const v of [100, -100, 1]) assert.equal(isKoboDelta(v), true);
  for (const v of [0, 1.5, '100', NaN, Infinity, 2 ** 53, null, { $gt: 0 }]) assert.equal(isKoboDelta(v), false);
});

test('isId', () => {
  assert.equal(isId('abc'), true);
  for (const v of ['', 'x'.repeat(201), { $ne: null }, 1, null, undefined]) assert.equal(isId(v), false);
});

test('safeEqual', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'ab'), false);
  assert.equal(safeEqual(undefined, 'abc'), false);
});
