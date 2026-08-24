import { useEffect, useState } from 'react';

const MIN_TEXT_SIZE = 90;
const MAX_TEXT_SIZE = 110;

function storedTextSize() {
  const value = Number(localStorage.getItem('chess_text_size'));
  return Number.isFinite(value) && value >= MIN_TEXT_SIZE && value <= MAX_TEXT_SIZE ? value : 100;
}

export function useTextSize() {
  const [textSize, setTextSize] = useState(storedTextSize);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-text-scale', `${textSize}%`);
    localStorage.setItem('chess_text_size', String(textSize));
  }, [textSize]);

  return { textSize, setTextSize };
}