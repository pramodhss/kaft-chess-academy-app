import { describe, expect, it } from 'vitest';
import { uniqueStudentNames } from './studentRoster';

describe('uniqueStudentNames', () => {
  it('deduplicates names without changing display casing', () => {
    expect(uniqueStudentNames([
      ['Name'], ['Anish Balan B', '', '', '', '', '', '', '', 'Active'], ['anish balan b', '', '', '', '', '', '', '', 'Active'],
    ])).toEqual(['Anish Balan B']);
  });

  it('can restrict the roster to active students', () => {
    expect(uniqueStudentNames([
      ['Name'], ['Active Student', '', '', '', '', '', '', '', 'Active'], ['Blank Status Student'], ['Former Student', '', '', '', '', '', '', '', 'Inactive'],
    ], true)).toEqual(['Active Student', 'Blank Status Student']);
  });
});