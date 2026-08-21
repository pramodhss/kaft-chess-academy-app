import { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GOOGLE_CLIENT_ID } from './config';
import { useCoachName } from './hooks/useCoachName';
import { Login }                from './pages/Login';
import { Dashboard }            from './pages/Dashboard';
import { Students }             from './pages/Students';
import { Attendance }           from './pages/Attendance';
import { Fees }                 from './pages/Fees';
import { Tournaments }          from './pages/Tournaments';
import { Van }                  from './pages/Van';
import { Timetable }            from './pages/Timetable';
import { More }                 from './pages/More';
import { MonthlyReport }        from './pages/MonthlyReport';
import { UpcomingTournaments }  from './pages/UpcomingTournaments';
import { Resources }            from './pages/Resources';
import { Leaderboard }          from './pages/Leaderboard';
import { StudentProgress }      from './pages/StudentProgress';
import { ErrorBoundary }         from './components/ErrorBoundary';
import { ToastProvider }         from './context/ToastContext';

function CoachNameModal({ onSave }: { onSave: (n: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div className="fixed inset-0 bg-navy/95 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <p className="text-2xl text-center mb-2">♟</p>
        <h2 className="text-xl font-bold text-navy text-center mb-1">Welcome!</h2>
        <p className="text-sm text-gray-500 text-center mb-4">Enter your name so every update is tracked to you.</p>
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && val.trim() && onSave(val)}
          className="input w-full mb-4" placeholder="Your name (e.g. Coach Pramodh)" autoFocus />
        <button onClick={() => val.trim() && onSave(val)} disabled={!val.trim()}
          className="w-full bg-navy text-white py-3 rounded-xl font-semibold disabled:opacity-50">
          Continue
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { isLoggedIn } = useAuth();
  const { showPrompt, saveCoachName } = useCoachName();
  if (!isLoggedIn) return <Login />;
  return (
    <>
      {showPrompt && <CoachNameModal onSave={saveCoachName} />}
      <Routes>
        <Route path="/"                  element={<Dashboard />} />
        <Route path="/students"          element={<Students />} />
        <Route path="/attendance"        element={<Attendance />} />
        <Route path="/fees"              element={<Fees />} />
        <Route path="/tournaments"       element={<Tournaments />} />
        <Route path="/upcoming"          element={<UpcomingTournaments />} />
        <Route path="/van"               element={<Van />} />
        <Route path="/timetable"         element={<Timetable />} />
        <Route path="/resources"         element={<Resources />} />
        <Route path="/monthly-report"    element={<MonthlyReport />} />        <Route path="/leaderboard"      element={<Leaderboard />} />
        <Route path="/progress"         element={<StudentProgress />} />        <Route path="/more"              element={<More />} />
        <Route path="*"                  element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider>
          <ToastProvider>
            <HashRouter>
              <AppRoutes />
            </HashRouter>
          </ToastProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  );
}
