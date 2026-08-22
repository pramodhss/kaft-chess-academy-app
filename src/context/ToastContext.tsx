import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { AlertTriangle, Check, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: string; msg: string; type: ToastType }

const ToastCtx = createContext<{ show: (msg: string, type: ToastType) => void }>(null!);

export function ToastProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((msg: string, type: ToastType) => {
    nextId.current += 1;
    const id = `${Date.now()}-${nextId.current}`;
    setToasts(prev => [...prev.slice(-2), { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const icons = { success: Check, error: AlertTriangle, info: Info };
  const colors = {
    success: 'toast-success',
    error:   'toast-error',
    info:    'toast-info',
  };
  const titles = { success: 'Changes saved', error: 'Could not save', info: 'Update' };
  const contextValue = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={contextValue}>
      {children}
      <div className="fixed top-safe left-4 right-4 z-[100] flex flex-col items-center gap-2 pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top,0px) + 64px)' }}>
        {toasts.map(t => (
          <output key={t.id} aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            className={`${colors[t.type]} toast-card pointer-events-auto`}>
            <span className="toast-icon" aria-hidden="true">
              {React.createElement(icons[t.type], { size: 18, strokeWidth: 2.25 })}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase opacity-70">
                {titles[t.type]}
              </p>
              <p className="text-sm font-semibold leading-snug">{t.msg}</p>
            </div>
          </output>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const { show } = useContext(ToastCtx);
  return {
    success: (msg: string) => show(msg, 'success'),
    error:   (msg: string) => show(msg, 'error'),
    info:    (msg: string) => show(msg, 'info'),
  };
}
