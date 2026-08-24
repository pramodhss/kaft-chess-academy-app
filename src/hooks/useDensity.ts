import { useEffect, useState } from 'react';

export type Density = 'comfortable' | 'compact';

export function useDensity() {
  const [density, setDensity] = useState<Density>(() => localStorage.getItem('chess_density') === 'compact' ? 'compact' : 'comfortable');

  useEffect(() => {
    document.documentElement.classList.toggle('compact', density === 'compact');
    localStorage.setItem('chess_density', density);
  }, [density]);

  return {
    density,
    toggleDensity: () => setDensity(current => current === 'compact' ? 'comfortable' : 'compact'),
  };
}