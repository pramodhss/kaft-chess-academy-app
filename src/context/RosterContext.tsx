import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { readSheet, readSheetLive, clearSheetReadCache } from '../lib/sheets';
import { DEFAULT_BATCHES, loadStudentOptions } from '../lib/studentOptions';
import { createHeaderMap, parseStudentRow } from '../lib/schemaMapper';
import { SHEET_ID, TABS } from '../config';
import type { Student } from '../types';

interface RosterContextValue {
  students: Student[];
  batches: string[];
  loading: boolean;
  error: string;
  refreshRoster: (force?: boolean) => Promise<Student[]>;
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  updateStudentInRoster: (student: Student) => void;
  removeStudentFromRoster: (rowIndex: number) => void;
  addStudentToRoster: (student: Student) => void;
}

const RosterContext = createContext<RosterContextValue | null>(null);

export function RosterProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { token, logout } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<string[]>([...DEFAULT_BATCHES]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedRef = useRef(false);

  const refreshRoster = useCallback(async (force = false): Promise<Student[]> => {
    if (!token) return [];
    if (force) {
      clearSheetReadCache(SHEET_ID);
    }
    setLoading(true);
    setError('');
    try {
      const readFn = force ? readSheetLive : readSheet;
      const [rows, options] = await Promise.all([
        readFn(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`),
        loadStudentOptions(token, SHEET_ID, force),
      ]);

      const headerMap = rows.length > 0 ? createHeaderMap(rows[0]) : undefined;
      const parsed = rows
        .slice(1)
        .map((row, index) => parseStudentRow(row, index + 2, headerMap))
        .filter(s => s.name.trim());

      setStudents(parsed);
      setBatches(options.batches.values.length > 0 ? options.batches.values : [...DEFAULT_BATCHES]);
      hasLoadedRef.current = true;
      return parsed;
    } catch (err: any) {
      if (err.message === 'TOKEN_EXPIRED') {
        logout();
        return [];
      }
      setError(err.message || 'Failed to load students roster.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    if (token && !hasLoadedRef.current) {
      void refreshRoster(false);
    }
    if (!token) {
      setStudents([]);
      hasLoadedRef.current = false;
    }
  }, [token, refreshRoster]);

  const updateStudentInRoster = useCallback((updated: Student) => {
    setStudents(prev => prev.map(s => s.rowIndex === updated.rowIndex ? updated : s));
  }, []);

  const removeStudentFromRoster = useCallback((rowIndex: number) => {
    setStudents(prev => prev.filter(s => s.rowIndex !== rowIndex));
  }, []);

  const addStudentToRoster = useCallback((student: Student) => {
    setStudents(prev => [...prev, student]);
  }, []);

  const value = React.useMemo<RosterContextValue>(() => ({
    students,
    batches,
    loading,
    error,
    refreshRoster,
    setStudents,
    updateStudentInRoster,
    removeStudentFromRoster,
    addStudentToRoster,
  }), [
    students,
    batches,
    loading,
    error,
    refreshRoster,
    updateStudentInRoster,
    removeStudentFromRoster,
    addStudentToRoster,
  ]);

  return (
    <RosterContext.Provider value={value}>
      {children}
    </RosterContext.Provider>
  );
}

export function useRoster() {
  const context = useContext(RosterContext);
  if (!context) {
    throw new Error('useRoster must be used within a RosterProvider');
  }
  return context;
}
