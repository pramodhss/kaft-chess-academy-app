import { useState, useEffect } from 'react';

export function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('chess_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('chess_theme', dark ? 'dark' : 'light');
  }, [dark]);

  const toggle = () => setDark(d => !d);
  return { dark, toggle };
}
