import { useState } from 'react';
const KEY = 'chess_coach_name';
export function useCoachName() {
  const [name, setName] = useState(() => localStorage.getItem(KEY) ?? '');
  const [showPrompt, setShowPrompt] = useState(() => !localStorage.getItem(KEY));
  const save = (n: string) => { const t=n.trim(); localStorage.setItem(KEY,t); setName(t); setShowPrompt(false); };
  const clear = () => { localStorage.removeItem(KEY); setName(''); setShowPrompt(true); };
  return { coachName: name, showPrompt, saveCoachName: save, clearCoachName: clear, setShowPrompt };
}
