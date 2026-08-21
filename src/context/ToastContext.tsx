import React, { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: string; msg: string; type: ToastType }

const ToastCtx = createContext<{ show: (msg: string, type: ToastType) => void }>(null!);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((msg: string, type: ToastType) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-2), { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const colors = {
    success: 'bg-green-600 text-white',
    error:   'bg-red-600   text-white',
    info:    'bg-navy      text-white',
  };

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="fixed top-safe left-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top,0px) + 64px)' }}>
        {toasts.map(t => (
          <div key={t.id} className={`${colors[t.type]} flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg animate-chess-slide pointer-events-auto`}>
            <span className="text-lg font-bold w-6 text-center">{icons[t.type]}</span>
            <p className="text-sm font-medium flex-1">{t.msg}</p>
          </div>
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
