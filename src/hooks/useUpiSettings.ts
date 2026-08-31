import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'chess_upi_settings';
const EVENT_KEY = 'chess-upi-settings-changed';

export interface UpiSettings {
  enabled: boolean;
  vpa: string;
}

const DEFAULT_SETTINGS: UpiSettings = {
  enabled: true,
  vpa: 'kaftchess@upi',
};

function loadStoredUpiSettings(): UpiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
        vpa: typeof parsed.vpa === 'string' && parsed.vpa.trim() ? parsed.vpa.trim() : DEFAULT_SETTINGS.vpa,
      };
    }
  } catch { /* fallback to defaults */ }
  return { ...DEFAULT_SETTINGS };
}

export function useUpiSettings() {
  const [settings, setSettings] = useState<UpiSettings>(loadStoredUpiSettings);

  useEffect(() => {
    const handleUpdate = () => {
      setSettings(loadStoredUpiSettings());
    };
    window.addEventListener(EVENT_KEY, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(EVENT_KEY, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const saveSettings = useCallback((next: Partial<UpiSettings>) => {
    setSettings(current => {
      const updated: UpiSettings = {
        ...current,
        ...next,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        window.dispatchEvent(new Event(EVENT_KEY));
      } catch { /* localStorage quota */ }
      return updated;
    });
  }, []);

  const setUpiEnabled = useCallback((enabled: boolean) => {
    saveSettings({ enabled });
  }, [saveSettings]);

  const setUpiVpa = useCallback((vpa: string) => {
    saveSettings({ vpa: vpa.trim() || DEFAULT_SETTINGS.vpa });
  }, [saveSettings]);

  return {
    upiEnabled: settings.enabled,
    upiVpa: settings.vpa,
    setUpiEnabled,
    setUpiVpa,
  };
}
