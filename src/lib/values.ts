export function parseSheetNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const normalized = value.trim().replace(/[₹$,%\s]/g, '').replace(/,/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseSheetPercentage(value: unknown): number {
  const parsed = parseSheetNumber(value);
  const decimal = typeof value === 'string' && value.includes('%') ? parsed / 100 : parsed > 1 ? parsed / 100 : parsed;
  return Math.min(Math.max(decimal, 0), 1);
}