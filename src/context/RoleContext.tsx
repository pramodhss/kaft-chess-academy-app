import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { loadRoles, type AppRole } from '../lib/roles';
import { SHEET_ID } from '../config';

const RoleContext = createContext<{ role: AppRole }>({ role: 'admin' });

export function RoleProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { token, email } = useAuth();
  const [role, setRole] = useState<AppRole>('admin');
  useEffect(() => {
    if (!token) return;
    void loadRoles(token, SHEET_ID).then(entries => {
      if (entries.length === 0) { setRole('admin'); return; }
      setRole(entries.find(entry => entry.email.toLowerCase() === email?.toLowerCase())?.role ?? 'viewer');
    });
  }, [token, email]);
  const value = useMemo(() => ({ role }), [role]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() { return useContext(RoleContext); }