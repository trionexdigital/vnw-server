import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cents, money, total, financials, stockValues, suggestPayments, requireModulePermission, dateTime } from './domain';
describe('standalone dealer domain', () => {
  it('calculates locked payable, derived commission, charges and profit exactly', () => {
    assert.deepEqual(financials('15000', '22000', '500'), {
      dealer_cost: '15000.00',
      sale_price: '22000.00',
      charges: '500.00',
      commission: '7000.00',
      profit: '6500.00'
    });
    assert.equal(money(cents('0.10') + cents('0.20')), '0.30');
    assert.equal(financials('15.05', '10.01', '0.03').profit, '-5.07');
    assert.equal(total(['90071992547400.01', '0.02']), '90071992547400.03');
  });
  it('rejects negative, malformed, overflowing and zero prices', () => {
    for (const value of ['-1', '0', '1.001', '1e3', 'Infinity', '999999999999999.00', '']) assert.throws(() => cents(value));
    assert.equal(cents('0', true), BigInt(0));
    assert.throws(() => total(['99999999999999.99', '0.01']));
  });
  it('does not inherit employee wildcard permissions', () => {
    assert.throws(() => requireModulePermission('EMPLOYEE', ['*'], 'payments.record'), /Forbidden/);
    assert.throws(() => requireModulePermission('USER', ['payments.record'], 'payments.record'), /Forbidden/);
    requireModulePermission('EMPLOYEE', ['payments.record'], 'payments.record');
    requireModulePermission('ADMIN', [], 'payments.record');
  });
  it('validates dates, readiness, optional remarks and recalculates patterns', () => {
    const base = {
      dealer_id: 1,
      number_value: '8008009307',
      dealer_cost: '100',
      selling_price: '200',
      readiness: 'RTP'
    };
    const row = stockValues(base);
    assert.equal(row.digit_total, 35);
    assert.equal(row.root_sum, 8);
    assert.ok(JSON.parse(row.patterns_json).length > 0);
    assert.notEqual(stockValues({
      ...base,
      number_value: '9876543210'
    }).digit_total, row.digit_total);
    assert.throws(() => stockValues({
      ...base,
      readiness: 'NON_RTP'
    }));
    assert.throws(() => stockValues({
      ...base,
      number_value: '123'
    }));
    assert.throws(() => dateTime('2026-02-30T10:00'));
    assert.equal(stockValues({
      ...base,
      readiness: 'NON_RTP',
      rtp_date: '2026-12-20'
    }).rtp_date, '2026-12-20');
  });
  it('prefers the exact 40000 combination and reports nearest alternatives', () => {
    const rows = ['10000', '15000', '12000', '8000', '20000'].map((dealer_cost, index) => ({
      sale_id: index + 1,
      dealer_cost
    }));
    const exact = suggestPayments(rows, '40000');
    assert.equal(exact.exact, true);
    assert.equal(exact.suggestions[0].total, '40000.00');
    assert.deepEqual(exact.suggestions[0].sale_ids, [3, 4, 5]);
    const alternatives = suggestPayments(rows, '40000.01');
    assert.deepEqual(alternatives.suggestions.map(s => s.total), ['40000.00', '42000.00']);
    const bounded = suggestPayments(rows, '60000', 3);
    assert.equal(bounded.bounded, true);
    for (const suggestion of bounded.suggestions) assert.equal(total(rows.filter(r => suggestion.sale_ids.includes(r.sale_id)).map(r => r.dealer_cost)), suggestion.total);
  });
});
