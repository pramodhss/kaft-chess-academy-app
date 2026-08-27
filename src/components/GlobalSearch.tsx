import { useState } from 'react';
import { Search, UserRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { readSheet } from '../lib/sheets';
import { SHEET_ID, TABS } from '../config';

interface SearchStudent {
  name: string;
  batch: string;
  level: string;
  phone: string;
  school: string;
  fideId: string;
}

function toSearchStudent(row: string[]): SearchStudent {
  return { name: row[0] ?? '', batch: row[5] ?? '', level: row[6] ?? '', phone: row[10] ?? '', school: row[21] ?? '', fideId: row[24] ?? '' };
}

export function GlobalSearch() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<SearchStudent[]>([]);
  const [loading, setLoading] = useState(false);

  const show = async () => {
    setOpen(true);
    if (!token || students.length > 0) return;
    setLoading(true);
    try {
      const rows = await readSheet(token, SHEET_ID, `'${TABS.STUDENTS}'!A:AG`);
      setStudents(rows.slice(1).map(toSearchStudent).filter(student => student.name.trim()));
    } finally { setLoading(false); }
  };

  const normalized = query.trim().toLowerCase();
  const results = normalized ? students.filter(student => Object.values(student).some(value => value.toLowerCase().includes(normalized))).slice(0, 8) : [];

  const select = (name: string) => {
    setOpen(false);
    setQuery('');
    navigate(`/students?search=${encodeURIComponent(name)}`);
  };

  return (
    <>
      <button type="button" onClick={show} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10" aria-label="Search students" title="Search students">
        <Search size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="modal-backdrop items-start justify-center pt-20">
          <dialog open aria-labelledby="global-search-title" className="modal-panel m-0 w-full max-w-xl overflow-hidden p-0">
            <div className="flex items-center gap-3 border-b border-gray-100 p-3">
              <Search size={18} className="text-gray-400" aria-hidden="true" />
              <label id="global-search-title" className="sr-only" htmlFor="global-student-search">Search students</label>
              <input id="global-student-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Name, phone, batch, school or FIDE ID" />
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Close search"><X size={18} /></button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {loading && <p className="p-5 text-center text-sm text-gray-400">Loading students…</p>}
              {!loading && !normalized && <p className="p-5 text-center text-sm text-gray-400">Start typing to find a student.</p>}
              {!loading && normalized && results.length === 0 && <p className="p-5 text-center text-sm text-gray-400">No matching students.</p>}
              {results.map(student => (
                <button type="button" key={student.name} onClick={() => select(student.name)} className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-gray-50">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-navy"><UserRound size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-gray-900">{student.name}</span><span className="block truncate text-xs text-gray-400">{[student.batch, student.level, student.phone].filter(Boolean).join(' · ')}</span></span>
                </button>
              ))}
            </div>
          </dialog>
        </div>
      )}
    </>
  );
}