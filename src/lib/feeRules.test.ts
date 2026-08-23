import { describe, expect, it } from 'vitest';
import { calculateFeeBalance, calculateRosterPayment, normalizeFeeMonth } from './feeRules';

describe('normalizeFeeMonth', () => {
  it.each([
    ['2026-08', '2026-08'],
    ['2026-8', '2026-08'],
    ['2026-08-01', '2026-08'],
    ['August 2026', '2026-08'],
    ['Aug-2026', '2026-08'],
    ['unknown', 'unknown'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeFeeMonth(value)).toBe(expected);
  });
});

describe('calculateRosterPayment', () => {
  it('calculates a partial payment', () => {
    expect(calculateRosterPayment(undefined, { paid: false, amountDue: '1500', amountPaid: '500' }, 1500))
      .toEqual({ amountPaid: 500, balance: 1000, status: 'Partial' });
  });

  it('marks a checked payment as paid in full', () => {
    expect(calculateRosterPayment(undefined, { paid: true, amountDue: '1500', amountPaid: '0' }, 1500))
      .toEqual({ amountPaid: 1500, balance: 0, status: 'Paid' });
  });

  it('preserves a waiver without inflating collected revenue', () => {
    expect(calculateRosterPayment(
      { paymentStatus: 'Waived', amountPaid: '0' },
      { paid: true, amountDue: '1600', amountPaid: '0' },
      1600,
    )).toEqual({ amountPaid: 0, balance: 0, status: 'Waived' });
  });

  it('preserves overdue while a balance remains', () => {
    expect(calculateRosterPayment(
      { paymentStatus: 'Overdue', amountPaid: '200' },
      { paid: false, amountDue: '1500', amountPaid: '600' },
      1500,
    )).toEqual({ amountPaid: 600, balance: 900, status: 'Overdue' });
  });

  it('clears overdue after payment in full', () => {
    expect(calculateRosterPayment(
      { paymentStatus: 'Overdue', amountPaid: '200' },
      { paid: true, amountDue: '1500', amountPaid: '200' },
      1500,
    )).toEqual({ amountPaid: 1500, balance: 0, status: 'Paid' });
  });
});

describe('calculateFeeBalance', () => {
  it('clears waived balances without counting unpaid money', () => {
    expect(calculateFeeBalance(1500, 0, 'Waived')).toBe(0);
  });

  it('keeps the remaining balance for normal payments', () => {
    expect(calculateFeeBalance(1500, 1000, 'Partial')).toBe(500);
  });
});
