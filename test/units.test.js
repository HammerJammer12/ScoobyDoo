const test = require('node:test');
const assert = require('node:assert/strict');
const { WEIGHT_UNITS, isWeightUnit, toKg, fromKg, formatWeight } = require('../public/units');

test('WEIGHT_UNITS lists lb and kg', () => {
  assert.deepEqual(WEIGHT_UNITS, ['lb', 'kg']);
});

test('isWeightUnit accepts only lowercase lb and kg', () => {
  assert.equal(isWeightUnit('lb'), true);
  assert.equal(isWeightUnit('kg'), true);
  for (const bad of ['LB', 'pounds', '', undefined, null, 1]) assert.equal(isWeightUnit(bad), false, String(bad));
});

test('toKg converts pounds and rounds to 3 decimals', () => {
  assert.equal(toKg(135, 'lb'), 61.235);
  assert.equal(toKg('135', 'lb'), 61.235);
  assert.equal(toKg(2.5, 'lb'), 1.134);
  assert.equal(toKg(100, 'kg'), 100);
});

test('values typed in lb or kg display back exactly as typed', () => {
  for (const v of [135, 225, 45, 2.5, 315.5]) assert.equal(fromKg(toKg(v, 'lb'), 'lb'), v, `${v} lb`);
  for (const v of [100, 62.5]) assert.equal(fromKg(toKg(v, 'kg'), 'kg'), v, `${v} kg`);
});

test('fromKg rounds to one decimal', () => {
  assert.equal(fromKg(100, 'lb'), 220.5);
});

test('blank or non-numeric weights become null instead of 0 or NaN', () => {
  assert.equal(toKg('', 'lb'), null);
  assert.equal(toKg('  ', 'lb'), null);
  assert.equal(toKg(null, 'lb'), null);
  assert.equal(toKg(undefined, 'kg'), null);
  assert.equal(toKg('abc', 'lb'), null);
  assert.equal(fromKg(null, 'lb'), null);
});

test('formatWeight shows the unit and drops a trailing .0', () => {
  assert.equal(formatWeight(61.235, 'lb'), '135 lb');
  assert.equal(formatWeight(61.235, 'kg'), '61.2 kg');
  assert.equal(formatWeight(100, 'kg'), '100 kg');
  assert.equal(formatWeight(null, 'lb'), '');
});

test('an unknown unit throws instead of guessing', () => {
  assert.throws(() => toKg(1, 'stone'), TypeError);
  assert.throws(() => fromKg(1, 'stone'), TypeError);
});
