import test from 'node:test';
import assert from 'node:assert/strict';
import { isCancellationEligible, istDateToUtc } from './prebooks';

test('converts India midnight to the matching UTC instant', () => {
  assert.equal(istDateToUtc('2026-08-15'), '2026-08-14 18:30:00');
});

test('rejects malformed RTP dates', () => {
  assert.throws(() => istDateToUtc('15/08/2026'), /valid RTP availability date/);
});

test('48-hour cancellation is eligible through the exact boundary only', () => {
  const deadline = '2026-08-05 10:00:00';
  assert.equal(isCancellationEligible(deadline, new Date('2026-08-05T09:59:59.999Z')), true);
  assert.equal(isCancellationEligible(deadline, new Date('2026-08-05T10:00:00.000Z')), true);
  assert.equal(isCancellationEligible(deadline, new Date('2026-08-05T10:00:00.001Z')), false);
});
