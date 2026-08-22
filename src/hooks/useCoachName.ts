import { useEffect, useState } from 'react';
const KEY = 'chess_coach_name';
const EVENT = 'chess-coach-name-change';

interface CoachNameChange {
  name: string;
  showPrompt: boolean;
}

function notify(change: CoachNameChange) {
  window.dispatchEvent(new CustomEvent<CoachNameChange>(EVENT, { detail: change }));
}

export function useCoachName() {
  const [name, setName] = useState(() => localStorage.getItem(KEY) ?? '');
  const [showPrompt, setShowPrompt] = useState(() => !localStorage.getItem(KEY));

  useEffect(() => {
    const sync = (event: Event) => {
      const change = (event as CustomEvent<CoachNameChange>).detail;
      setName(change.name);
      setShowPrompt(change.showPrompt);
    };
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const save = (newName: string) => {
    const trimmedName = newName.trim();
    localStorage.setItem(KEY, trimmedName);
    notify({ name: trimmedName, showPrompt: false });
  };
  const clear = () => {
    localStorage.removeItem(KEY);
    notify({ name: '', showPrompt: true });
  };
  const requestPrompt = (nextShowPrompt: boolean) => {
    notify({ name: localStorage.getItem(KEY) ?? '', showPrompt: nextShowPrompt });
  };
  return { coachName: name, showPrompt, saveCoachName: save, clearCoachName: clear, setShowPrompt: requestPrompt };
}
