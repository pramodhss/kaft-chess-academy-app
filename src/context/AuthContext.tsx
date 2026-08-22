import React, { createContext, useContext, useState, useCallback } from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { SCOPES } from '../config';

interface AuthState {
  token: string | null;
  email: string | null;
  expiresAt: number | null;
}

interface AuthCtx extends AuthState {
  isLoggedIn: boolean;
  login: () => void;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadStored);

  const googleLogin = useGoogleLogin({
    scope: SCOPES,
    onSuccess: async (resp) => {
      const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${resp.access_token}` },
      }).then(r => r.json());
      const next: AuthState = {
        token: resp.access_token,
        email: info.email ?? null,
        expiresAt: Date.now() + resp.expires_in * 1000,
      };
      setAuth(next);
      localStorage.setItem('chess_auth', JSON.stringify(next));
    },
    onError: () => alert('Google login failed. Check your OAuth Client ID in config.ts.'),
  });

  const logout = useCallback(() => {
    googleLogout();
    sessionStorage.removeItem('chess_auth');
    localStorage.removeItem('chess_auth');
    localStorage.removeItem('chess_coach_name');
    if ('caches' in window) void caches.delete('sheets-api');
    setAuth({ token: null, email: null, expiresAt: null });
  }, []);

  const isLoggedIn = !!auth.token && !!auth.expiresAt && Date.now() < auth.expiresAt;

  return (
    <AuthContext.Provider value={{ ...auth, isLoggedIn, login: googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
