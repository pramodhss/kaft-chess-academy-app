import { describe, expect, it } from 'vitest';
import {
  buildAbsenteeMessage,
  buildFeeReminderMessage,
  buildWhatsAppUrl,
  cleanIndianPhoneNumber,
} from './whatsapp';

describe('whatsapp utils and templates', () => {
  it('cleans 10-digit Indian phone numbers', () => {
    expect(cleanIndianPhoneNumber('+91 98765 43210')).toBe('9876543210');
    expect(cleanIndianPhoneNumber('09876543210')).toBe('9876543210');
    expect(cleanIndianPhoneNumber('')).toBe('');
  });

  it('builds a direct wa.me URL with country code 91', () => {
    const url = buildWhatsAppUrl('9876543210', 'Hello');
    expect(url).toContain('https://wa.me/919876543210?text=Hello');
  });

  it('generates a well-formatted fee reminder message', () => {
    const msg = buildFeeReminderMessage('Aarav', 1500, 'September 2026');
    expect(msg).toContain('Aarav');
    expect(msg).toContain('₹1,500');
    expect(msg).toContain('September 2026');
    expect(msg).toContain('Kaft Chess Academy');
  });

  it('generates an absentee check-in message', () => {
    const msg = buildAbsenteeMessage('Diya', '22-Sep-2026');
    expect(msg).toContain('Diya');
    expect(msg).toContain('on 22-Sep-2026');
    expect(msg).toContain('Kaft Chess Academy');
  });
});
