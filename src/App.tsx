import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { X } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GOOGLE_CLIENT_ID } from './config';
import { CoachNameProvider, useCoachName } from './hooks/useCoachName';
import { RosterProvider } from './context/RosterContext';
import { Login }                from './pages/Login';
import { ErrorBoundary }         from './components/ErrorBoundary';
import { PageSkeleton }          from './components/Skeleton';
import { ToastProvider }         from './context/ToastContext';

const loadDashboard = () => import('./pages/Dashboard').then(module => ({ default: module.Dashboard }));
const loadStudents = () => import('./pages/Students').then(module => ({ default: module.Students }));
const loadAttendance = () => import('./pages/Attendance').then(module => ({ default: module.Attendance }));
const loadFees = () => import('./pages/Fees').then(module => ({ default: module.Fees }));
const loadVan = () => import('./pages/Van').then(module => ({ default: module.Van }));
const loadTimetable = () => import('./pages/Timetable').then(module => ({ default: module.Timetable }));
const loadMore = () => import('./pages/More').then(module => ({ default: module.More }));

const Dashboard = lazy(loadDashboard);
const Students = lazy(loadStudents);
const Attendance = lazy(loadAttendance);
const Fees = lazy(loadFees);
const Tournaments = lazy(() => import('./pages/Tournaments').then(module => ({ default: module.Tournaments })));
const Van = lazy(loadVan);
const Timetable = lazy(loadTimetable);
const More = lazy(loadMore);
const MonthlyReport = lazy(() => import('./pages/MonthlyReport').then(module => ({ default: module.MonthlyReport })));
const Resources = lazy(() => import('./pages/Resources').then(module => ({ default: module.Resources })));
const StudentProgress = lazy(() => import('./pages/StudentProgress').then(module => ({ default: module.StudentProgress })));
const Curriculum = lazy(() => import('./pages/Curriculum').then(module => ({ default: module.Curriculum })));
const AdminSettings = lazy(() => import('./pages/AdminSettings').then(module => ({ default: module.AdminSettings })));
const OnlineChess = lazy(() => import('./pages/OnlineChess').then(module => ({ default: module.OnlineChess })));
const MiniTournament = lazy(() => import('./pages/MiniTournament').then(module => ({ default: module.MiniTournament })));
const OperationsCenter = lazy(() => import('./pages/OperationsCenter').then(module => ({ default: module.OperationsCenter })));
const StudentTimeline = lazy(() => import('./pages/StudentTimeline').then(module => ({ default: module.StudentTimeline })));
const ParentPortal = lazy(() => import('./pages/ParentPortal').then(module => ({ default: module.ParentPortal })));

function CoachNameModal({ onSave, onCancel }: Readonly<{ onSave: (n: string) => void; onCancel?: () => void }>) {
  const [val, setVal] = useState('');
  return (
    <div className="modal-backdrop items-center justify-center bg-navy/90 p-6">
      <div className="modal-panel relative w-full max-w-sm p-6" role="dialog" aria-modal="true" aria-labelledby="coach-name-title">
        {onCancel && <button type="button" onClick={onCancel} className="icon-button absolute right-4 top-4" aria-label="Cancel name editing" title="Cancel name editing"><X size={18} aria-hidden="true" /></button>}
        <img src="logo.jpg" alt="Kaft Chess Academy"
          className="w-16 h-16 rounded-xl mx-auto mb-3 object-cover shadow-md" />
        <h2 id="coach-name-title" className="text-xl font-bold text-navy text-center mb-1">{onCancel ? 'Edit coach name' : 'Welcome!'}</h2>
        <p className="text-sm text-gray-500 text-center mb-4">Enter your name so every update is tracked to you.</p>
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && val.trim() && onSave(val)}
          className="input w-full mb-4" placeholder="Your name (e.g. Coach Pramodh)" autoFocus />
        <button type="button" onClick={() => val.trim() && onSave(val)} disabled={!val.trim()}
          className="primary-action w-full">
          Continue
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { isLoggedIn } = useAuth();
  const { coachName, showPrompt, saveCoachName, setShowPrompt } = useCoachName();
  const location = useLocation();

  useEffect(() => {
    if (!isLoggedIn) return;
    const preload = () => {
      void Promise.allSettled([
        loadDashboard(), loadStudents(), loadAttendance(), loadFees(), loadVan(), loadTimetable(), loadMore(),
      ]);
    };
    let cancelPreload: () => void;
    if ('requestIdleCallback' in window) {
      const idleWindow = window.requestIdleCallback(preload, { timeout: 1_500 });
      cancelPreload = () => window.cancelIdleCallback(idleWindow);
    } else {
      const timeout = globalThis.setTimeout(preload, 250);
      cancelPreload = () => globalThis.clearTimeout(timeout);
    }
    return cancelPreload;
  }, [isLoggedIn]);

  if (location.pathname === '/parent') {
    return <Suspense fallback={<PageSkeleton />}><ParentPortal /></Suspense>;
  }

  if (!isLoggedIn) return <Login />;
  return (
    <>
      {showPrompt && <CoachNameModal onSave={saveCoachName} onCancel={coachName ? () => setShowPrompt(false) : undefined} />}
      <Suspense fallback={<PageSkeleton />}><Routes>
        <Route path="/"                  element={<Dashboard />} />
        <Route path="/students"          element={<Students />} />
        <Route path="/attendance"        element={<Attendance />} />
        <Route path="/fees"              element={<Fees />} />
        <Route path="/tournaments"       element={<Tournaments />} />
        <Route path="/upcoming"          element={<Van />} />
        <Route path="/van"               element={<Van />} />
        <Route path="/timetable"         element={<Timetable />} />
        <Route path="/resources"         element={<Resources />} />
        <Route path="/curriculum"        element={<Curriculum />} />
        <Route path="/admin-settings"    element={<AdminSettings />} />
        <Route path="/online-chess"       element={<OnlineChess />} />
        <Route path="/pairing"           element={<MiniTournament />} />
        <Route path="/operations"        element={<OperationsCenter />} />
        <Route path="/timeline"          element={<StudentTimeline />} />
        <Route path="/monthly-report"    element={<MonthlyReport />} />
        <Route path="/leaderboard"       element={<Navigate to="/tournaments?tab=leaderboard" replace />} />
        <Route path="/progress"          element={<StudentProgress />} />
        <Route path="/parent"            element={<ParentPortal />} />
        <Route path="/more"              element={<More />} />
        <Route path="*"                  element={<Navigate to="/" replace />} />
      </Routes></Suspense>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider>
          <ToastProvider>
            <CoachNameProvider>
              <RosterProvider>
                <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <AppRoutes />
                </HashRouter>
              </RosterProvider>
            </CoachNameProvider>
          </ToastProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  );
}
