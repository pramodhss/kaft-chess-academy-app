import { describe, expect, it } from 'vitest';
import { parseSheetNumber, parseSheetPercentage } from './values';

describe('parseSheetNumber', () => {
  it.each([
    ['₹ 1,500', 1500],
    ['1,200.50', 1200.5],
    ['75%', 75],
    [900, 900],
    ['', 0],
    ['not a number', 0],
  ])('parses %p as %p', (value, expected) => {
    expect(parseSheetNumber(value)).toBe(expected);
  });
});

describe('parseSheetPercentage', () => {
  it.each([
    ['75%', 0.75],
    ['75', 0.75],
    [0.75, 0.75],
    ['150%', 1],
    ['-10%', 0],
  ])('normalizes %p as %p', (value, expected) => {
    expect(parseSheetPercentage(value)).toBe(expected);
  });
});
