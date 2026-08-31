import { describe, expect, it } from 'vitest';
import { formatDateIndian, normalizeDateInput, parseSheetDate } from './dates';
import { buildWhatsAppUrl, cleanIndianPhoneNumber } from './whatsapp';

describe('dates utility', () => {
  it('normalizes various date inputs into YYYY-MM-DD', () => {
    expect(normalizeDateInput('2026-8-2')).toBe('2026-08-02');
    expect(normalizeDateInput('15/08/2026')).toBe('2026-08-15');
    expect(normalizeDateInput('15-08-2026')).toBe('2026-08-15');
    expect(normalizeDateInput('')).toBe('');
  });

  it('formats dates in Indian format', () => {
    expect(formatDateIndian('2026-08-15')).toBe('15 Aug 2026');
    expect(formatDateIndian('')).toBe('Date not set');
  });

  it('parses Google Sheet date serial numbers and strings', () => {
    expect(parseSheetDate('2026-08-15')?.getFullYear()).toBe(2026);
    expect(parseSheetDate('15/08/2026')?.getDate()).toBe(15);
    expect(parseSheetDate(null as any)).toBeNull();
  });
});

describe('whatsapp utility', () => {
  it('cleans 10-digit Indian phone numbers', () => {
    expect(cleanIndianPhoneNumber('+91 98765 43210')).toBe('9876543210');
    expect(cleanIndianPhoneNumber('9876543210')).toBe('9876543210');
    expect(cleanIndianPhoneNumber('')).toBe('');
  });

  it('constructs wa.me URL with phone or fallback', () => {
    const urlWithPhone = buildWhatsAppUrl('9876543210', 'Hello Coach');
    expect(urlWithPhone).toBe('https://wa.me/919876543210?text=Hello%20Coach');

    const urlWithoutPhone = buildWhatsAppUrl('', 'Hello All');
    expect(urlWithoutPhone).toBe('https://wa.me/?text=Hello%20All');
  });
});
