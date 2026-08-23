export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function phoneValidationError(value: string, label: string, required = false): string {
  const trimmed = value.trim();
  if (!trimmed) return required ? `${label} is required.` : '';
  if (!/^\d+$/.test(trimmed)) return `${label} must contain numbers only.`;
  if (trimmed.length < 7 || trimmed.length > 15) return `${label} must contain 7 to 15 digits.`;
  return '';
}

export function emailValidationError(value: string, label = 'Email'): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const atIndex = trimmed.indexOf('@');
  const domain = atIndex < 0 ? '' : trimmed.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf('.');
  const invalid = trimmed.length > 254
    || trimmed.includes(' ')
    || atIndex < 1
    || atIndex !== trimmed.lastIndexOf('@')
    || atIndex > 64
    || dotIndex < 1
    || dotIndex > domain.length - 3
    || domain.includes('..');
  if (invalid) {
    return `Enter a valid ${label.toLowerCase()} address.`;
  }
  return '';
}

export function integerRangeValidationError(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^\d+$/.test(trimmed)) return `${label} must be a whole number.`;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return `${label} must be between ${minimum} and ${maximum}.`;
  }
  return '';
}

export function dateValidationError(value: string, label: string): string {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return `Enter a valid ${label.toLowerCase()}.`;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return `Enter a valid ${label.toLowerCase()}.`;
  }
  return '';
}

export function moneyValidationError(value: string, label: string, required = false): string {
  const trimmed = value.trim();
  if (!trimmed) return required ? `${label} is required.` : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return `${label} must be a valid non-negative amount with up to 2 decimal places.`;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return `${label} must be a valid amount.`;
  return '';
}
