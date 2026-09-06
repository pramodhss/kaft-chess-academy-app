import { describe, expect, it } from 'vitest';
import { formatSchemaIssue, validateSheetHeaders } from './sheetSchema';

describe('validateSheetHeaders', () => {
  it('accepts required headers regardless of case and whitespace', () => {
    expect(validateSheetHeaders('Fees', [' Student ID ', 'AMOUNT DUE'], ['student id', 'amount due'])).toBeNull();
  });

  it('reports missing and duplicate headers with a useful message', () => {
    const issue = validateSheetHeaders('Fees', ['Student ID', 'Student ID'], ['Student ID', 'Amount Due']);
    expect(issue).toEqual({ tabName: 'Fees', missingHeaders: ['Amount Due'], duplicateHeaders: ['student id'] });
    expect(formatSchemaIssue(issue!)).toContain('missing columns: Amount Due');
  });
});