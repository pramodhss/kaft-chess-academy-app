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

/**
 * Pre-filled template for gentle fee payment reminders.
 */
export function buildFeeReminderMessage(studentName: string, amountDue: number | string, month: string): string {
  const cleanMonth = month.trim();
  const amtStr = typeof amountDue === 'number' ? `₹${amountDue.toLocaleString('en-IN')}` : `₹${amountDue}`;
  return `Dear Parent, gentle reminder regarding ${studentName}'s chess academy fee of ${amtStr} for ${cleanMonth}. Kindly ignore if already paid. Thank you! - Kaft Chess Academy`;
}

/**
 * Pre-filled template for student absence check-in.
 */
export function buildAbsenteeMessage(studentName: string, date?: string): string {
  const dateStr = date ? ` on ${date}` : ' today';
  return `Dear Parent, we noticed ${studentName} was marked absent for chess class${dateStr}. Hope everything is fine! - Kaft Chess Academy`;
}
