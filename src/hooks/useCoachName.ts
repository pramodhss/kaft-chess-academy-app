import { createContext, createElement, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
const KEY = 'chess_coach_name';
const RESET_EVENT = 'chess-coach-name-reset';

interface CoachNameContextValue {
  coachName: string;
  showPrompt: boolean;
  saveCoachName: (name: string) => void;
  clearCoachName: () => void;
  setShowPrompt: (show: boolean) => void;
}

const CoachNameContext = createContext<CoachNameContextValue | null>(null);

export function CoachNameProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [name, setName] = useState(() => localStorage.getItem(KEY) ?? '');
  const [showPrompt, setShowPrompt] = useState(() => !localStorage.getItem(KEY));

  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== KEY) return;
      setName(event.newValue ?? '');
      setShowPrompt(!event.newValue);
    };
    const reset = () => {
      setName('');
      setShowPrompt(true);
    };
    window.addEventListener('storage', syncStorage);
    window.addEventListener(RESET_EVENT, reset);
    return () => {
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener(RESET_EVENT, reset);
    };
  }, []);

  const saveCoachName = (newName: string) => {
    const trimmedName = newName.trim();
    localStorage.setItem(KEY, trimmedName);
    setName(trimmedName);
    setShowPrompt(false);
  };
  const clearCoachName = () => {
    localStorage.removeItem(KEY);
    setName('');
    setShowPrompt(true);
  };
  return createElement(CoachNameContext.Provider, {
    value: { coachName: name, showPrompt, saveCoachName, clearCoachName, setShowPrompt },
  }, children);
}

export function useCoachName() {
  const context = useContext(CoachNameContext);
  if (!context) throw new Error('useCoachName must be used within CoachNameProvider.');
  return context;
}
