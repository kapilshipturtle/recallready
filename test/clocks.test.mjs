import test from 'node:test';
import assert from 'node:assert/strict';
import { clockStatus } from '../src/lib/clocks.js';
import { DEFAULT_PLAN } from '../src/lib/case.js';

const T0 = '2026-11-14T10:00:00.000Z';
const at = (h) => new Date(Date.parse(T0) + h * 3600e3).toISOString();
const none = { stopSale: null, customerNotice: null, regulatorSummary: null, effectiveness: null, closed: null };

test('unmet 4 h clock is overdue at 5 h', () => {
  const c = clockStatus(T0, DEFAULT_PLAN, none, at(5)).find((x) => x.key === 'stopSale');
  assert.equal(c.status, 'overdue');
  assert.equal(c.dueAt, at(4));
});

test('unmet clock before its due time is due', () => {
  const c = clockStatus(T0, DEFAULT_PLAN, none, at(5)).find((x) => x.key === 'customerNotice');
  assert.equal(c.status, 'due');
});

test('met clock keeps its time', () => {
  const c = clockStatus(T0, DEFAULT_PLAN, { ...none, stopSale: at(3) }, at(9)).find((x) => x.key === 'stopSale');
  assert.equal(c.status, 'met');
  assert.equal(c.metAt, at(3));
});

test('a step met after its due time is marked late', () => {
  const [c] = clockStatus('2026-11-14T00:00:00.000Z', DEFAULT_PLAN, { stopSale: '2026-11-14T06:00:00.000Z' }, '2026-11-14T07:00:00.000Z');
  assert.equal(c.status, 'met');
  assert.equal(c.late, true);
  const [ontime] = clockStatus('2026-11-14T00:00:00.000Z', DEFAULT_PLAN, { stopSale: '2026-11-14T03:00:00.000Z' }, '2026-11-14T07:00:00.000Z');
  assert.equal(ontime.late, false);
});
