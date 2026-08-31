/**
 * Centralized WhatsApp utilities for opening chats and formatting numbers.
 */

export function cleanIndianPhoneNumber(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-10);
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = cleanIndianPhoneNumber(phone);
  const encodedText = encodeURIComponent(message);
  if (cleanPhone.length === 10) {
    return `https://wa.me/91${cleanPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

export function openWhatsApp(phone: string, message: string): void {
  const url = buildWhatsAppUrl(phone, message);
  window.open(url, '_blank', 'noopener,noreferrer');
}
