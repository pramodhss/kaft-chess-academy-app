import { describe, expect, it } from 'vitest';
import {
  dateValidationError,
  digitsOnly,
  emailValidationError,
  integerRangeValidationError,
  moneyValidationError,
  phoneValidationError,
} from './validation';

describe('digitsOnly', () => {
  it('removes non-numeric phone characters', () => {
    expect(digitsOnly('+91 987-654-3210')).toBe('919876543210');
  });
});

describe('phoneValidationError', () => {
  it('accepts 7 to 15 digits', () => expect(phoneValidationError('9876543210', 'Phone', true)).toBe(''));
  it('rejects letters and punctuation', () => expect(phoneValidationError('987-abc', 'Phone')).toContain('numbers only'));
  it('rejects invalid lengths', () => expect(phoneValidationError('1234', 'Phone')).toContain('7 to 15'));
  it('requires a value when requested', () => expect(phoneValidationError('', 'Phone', true)).toContain('required'));
});

describe('emailValidationError', () => {
  it('accepts a normal email address', () => expect(emailValidationError('parent@example.com')).toBe(''));
  it('accepts a blank optional email', () => expect(emailValidationError('')).toBe(''));
  it('rejects malformed addresses', () => expect(emailValidationError('parent@example')).toContain('valid'));
});

describe('integerRangeValidationError', () => {
  it('accepts an integer in range', () => expect(integerRangeValidationError('1200', 'Rating', 0, 4000)).toBe(''));
  it('rejects decimals and text', () => expect(integerRangeValidationError('12.5', 'Rating', 0, 4000)).toContain('whole number'));
  it('rejects values outside the range', () => expect(integerRangeValidationError('5000', 'Rating', 0, 4000)).toContain('between'));
});

describe('dateValidationError', () => {
  it('accepts a real ISO date', () => expect(dateValidationError('2026-08-23', 'Date')).toBe(''));
  it('rejects impossible dates', () => expect(dateValidationError('2026-02-31', 'Date')).toContain('valid'));
});

describe('moneyValidationError', () => {
  it('accepts whole and decimal amounts', () => {
    expect(moneyValidationError('1500', 'Amount', true)).toBe('');
    expect(moneyValidationError('1500.50', 'Amount', true)).toBe('');
  });
  it('rejects negative and over-precision amounts', () => {
    expect(moneyValidationError('-1', 'Amount')).toContain('non-negative');
    expect(moneyValidationError('1.234', 'Amount')).toContain('non-negative');
  });
});
