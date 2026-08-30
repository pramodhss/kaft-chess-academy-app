import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useToast } from '../context/ToastContext';

/** Shared icon-button used everywhere a section/row can be copied for WhatsApp —
 * keeps the copy affordance's size, icon and feedback identical across the app. */
export function CopyButton({ text, label, className }: Readonly<{ text: string; label: string; className?: string }>) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('Copied — ready to paste in WhatsApp.');
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => toast.error('Could not copy. Check clipboard permission and try again.'));
  };

  return (
    <button type="button" onClick={copy} aria-label={label} title={label}
      className={className ?? 'icon-button'}>
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
    </button>
  );
}
