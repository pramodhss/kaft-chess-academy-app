import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { SCOPES } from '../config';
import { clearSheetReadCache, SHEETS_READ_CACHE } from '../lib/sheets';

interface AuthState {
  token: string | null;
  email: string | null;
  expiresAt: number | null;
}

interface AuthCtx extends AuthState {
  isLoggedIn: boolean;
  isSessionExpired: boolean;
  login: () => void;
  renewSession: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>(null!);

function loadStored(): AuthState {
  try {
    const s = localStorage.getItem('chess_auth') ?? sessionStorage.getItem('chess_auth');
    if (s) {
      const p: AuthState = JSON.parse(s);
      if (p.expiresAt && Date.now() < p.expiresAt) {
        localStorage.setItem('chess_auth', s);
        sessionStorage.removeItem('chess_auth');
        return p;
      }
    }
  } catch { /* ignore parse errors */ }
  // clear any stale / scope-less token on load
  sessionStorage.removeItem('chess_auth');
  localStorage.removeItem('chess_auth');
  return { token: null, email: null, expiresAt: null };
}

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [auth, setAuth] = useState<AuthState>(loadStored);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  const googleLogin = useGoogleLogin({
    scope: SCOPES,
    onSuccess: async (resp) => {
      try {
        const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${resp.access_token}` },
        }).then(r => r.json());
        const next: AuthState = {
          token: resp.access_token,
          email: info.email ?? null,
          expiresAt: Date.now() + resp.expires_in * 1000,
        };
        setAuth(next);
        setIsSessionExpired(false);
        localStorage.setItem('chess_auth', JSON.stringify(next));
      } catch {
        const next: AuthState = {
          token: resp.access_token,
          email: auth.email,
          expiresAt: Date.now() + resp.expires_in * 1000,
        };
        setAuth(next);
        setIsSessionExpired(false);
        localStorage.setItem('chess_auth', JSON.stringify(next));
      }
    },
    onError: () => alert('Google login failed. Check your OAuth Client ID in config.ts.'),
  });

  const logout = useCallback(() => {
    googleLogout();
    clearSheetReadCache();
    sessionStorage.removeItem('chess_auth');
    localStorage.removeItem('chess_auth');
    localStorage.removeItem('chess_coach_name');
    window.dispatchEvent(new Event('chess-coach-name-reset'));
    if ('caches' in window) void Promise.all([
      caches.delete('sheets-api'),
      caches.delete(SHEETS_READ_CACHE),
    ]);
    setAuth({ token: null, email: null, expiresAt: null });
    setIsSessionExpired(false);
  }, []);

  // Monitor token expiration proactively
  useEffect(() => {
    if (!auth.expiresAt || !auth.token) return;

    const checkExpiration = () => {
      const remainingMs = auth.expiresAt! - Date.now();
      if (remainingMs <= 0) {
        setIsSessionExpired(true);
      }
    };

    const interval = setInterval(checkExpiration, 30_000);
    checkExpiration();
    return () => clearInterval(interval);
  }, [auth.expiresAt, auth.token]);

  const isLoggedIn = Boolean(auth.token);

  const contextValue = React.useMemo<AuthCtx>(() => ({
    ...auth,
    isLoggedIn,
    isSessionExpired,
    login: googleLogin,
    renewSession: googleLogin,
    logout,
  }), [auth, isLoggedIn, isSessionExpired, googleLogin, logout]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      {isSessionExpired && (
        <div className="modal-backdrop items-center justify-center p-4 z-[9999] bg-navy/80">
          <div className="modal-panel max-w-sm p-6 text-center bg-white dark:bg-slate-900 rounded-2xl shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Session Needs Renewal</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Your Google access token has expired. Tap renew to continue saving changes without losing your current screen.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => googleLogin()}
                className="primary-action w-full flex items-center justify-center gap-2"
              >
                <RefreshCw size={15} /> Renew Google Session
              </button>
              <button
                type="button"
                onClick={logout}
                className="text-xs text-gray-400 hover:text-gray-600 py-1"
              >
                Sign out completely
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
