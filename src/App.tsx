import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GOOGLE_CLIENT_ID } from './config';
import { Login }       from './pages/Login';
import { Dashboard }   from './pages/Dashboard';
import { Students }    from './pages/Students';
import { Attendance }  from './pages/Attendance';
import { Fees }        from './pages/Fees';
import { Tournaments } from './pages/Tournaments';
import { Van }         from './pages/Van';
import { Timetable }   from './pages/Timetable';
import { More }          from './pages/More';
import { MonthlyReport } from './pages/MonthlyReport';

function AppRoutes() {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Login />;
  return (
    <Routes>
      <Route path="/"            element={<Dashboard />} />
      <Route path="/students"    element={<Students />} />
      <Route path="/attendance"  element={<Attendance />} />
      <Route path="/fees"        element={<Fees />} />
      <Route path="/tournaments" element={<Tournaments />} />
      <Route path="/van"         element={<Van />} />
      <Route path="/timetable"   element={<Timetable />} />
      <Route path="/more"            element={<More />} />
      <Route path="/monthly-report"   element={<MonthlyReport />} />
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
