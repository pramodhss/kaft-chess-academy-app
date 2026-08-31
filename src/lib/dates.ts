/**
 * Centralized Date formatting & normalization utilities
 */

import type { SheetValue } from './sheets';

export function normalizeDateInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  const localMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (localMatch) return `${localMatch[3]}-${localMatch[2].padStart(2, '0')}-${localMatch[1].padStart(2, '0')}`;
  return trimmed;
}

export function formatDateIndian(value: string | Date): string {
  if (!value) return 'Date not set';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'Invalid Date';
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(value);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed);
}

export function parseSheetDate(value: SheetValue): Date | null {
  if (typeof value === 'number') {
    const utcDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), 12);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]), 12);
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getCategory(age: string | number): string {
  const a = typeof age === 'number' ? age : Number.parseInt(age, 10);
  if (!a || Number.isNaN(a)) return '';
  if (a <= 6)  return 'Under 7';
  if (a <= 8)  return 'Under 9';
  if (a <= 10) return 'Under 11';
  if (a <= 12) return 'Under 13';
  if (a <= 14) return 'Under 15';
  if (a <= 16) return 'Under 17';
  if (a <= 18) return 'Under 19';
  return 'Open';
}
