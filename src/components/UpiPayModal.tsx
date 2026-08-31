import { useState } from 'react';
import { Check, Copy, ExternalLink, QrCode, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export interface UpiPaymentDetails {
  studentName: string;
  amount: number;
  feeMonth: string;
  receiptNo?: string;
  vpa?: string;
}

function buildUpiPayUrl(details: UpiPaymentDetails): string {
  const vpa = details.vpa || 'kaftchess@upi';
  const name = 'KAFT Chess Academy';
  const receiptSuffix = details.receiptNo ? ` (${details.receiptNo})` : '';
  const note = `${details.studentName} - ${details.feeMonth}${receiptSuffix}`;
  return `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${details.amount}&cu=INR&tn=${encodeURIComponent(note)}`;
}

export function UpiPayModal({
  details,
  onClose,
}: Readonly<{
  details: UpiPaymentDetails;
  onClose: () => void;
}>) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const upiUrl = buildUpiPayUrl(details);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiUrl)}&margin=10`;

  const copyUpiLink = async () => {
    try {
      await navigator.clipboard.writeText(upiUrl);
      setCopied(true);
      toast.success('UPI Payment Link copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy UPI link.');
    }
  };

  return (
    <div className="modal-backdrop items-center justify-center p-4 z-50">
      <div className="modal-panel w-full max-w-sm p-5 text-center relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="Close UPI payment dialog"
        >
          <X size={20} />
        </button>

        <div className="w-12 h-12 bg-green-50 dark:bg-green-950/40 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <QrCode size={24} />
        </div>

        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Scan &amp; Pay via UPI</h3>
        <p className="text-xs text-gray-500 mt-0.5">{details.studentName} · {details.feeMonth}</p>

        <div className="my-4 flex flex-col items-center justify-center p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-100 dark:border-gray-800">
          <img
            src={qrImageUrl}
            alt="UPI QR Code"
            width={180}
            height={180}
            className="rounded-lg shadow-sm bg-white p-1.5"
            loading="lazy"
          />
          <span className="text-2xl font-black text-navy dark:text-white mt-3">
            ₹ {details.amount.toLocaleString('en-IN')}
          </span>
          <span className="text-[11px] text-gray-400 mt-0.5">VPA: {details.vpa || 'kaftchess@upi'}</span>
        </div>

        <div className="space-y-2">
          <a
            href={upiUrl}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
          >
            <ExternalLink size={15} /> Open in UPI App (GPay / PhonePe / Paytm)
          </a>
          <button
            type="button"
            onClick={copyUpiLink}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition-colors"
          >
            {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
            {copied ? 'Link Copied!' : 'Copy UPI Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
