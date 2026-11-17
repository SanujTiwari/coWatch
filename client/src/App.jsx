import { BrowserRouter, Routes, Route, Navigate, useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import Navbar from './components/layout/Navbar';
import AnimatedBackground from './components/layout/AnimatedBackground';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Room from './pages/Room';
import CallRoom from './pages/CallRoom';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Friends from './pages/Friends';
import './index.css';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

const InviteRoute = () => {
  const { token } = useParams();
  const { isAuthenticated, loading } = useAuth();
  const [saved, setSaved] = useState(false);
  const valid = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/i.test(token || '');
  useEffect(() => {
    if (valid) {
      sessionStorage.setItem('cowatch_invite', token.toUpperCase());
      setSaved(true);
    }
  }, [token, valid]);
  if (!valid) return <div className="loading-screen">Invalid invite link. <Link to="/">Go home</Link></div>;
  if (loading || !saved) return <div className="loading-screen"><div className="spinner"></div></div>;
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<><Navbar /><Home /></>} />
    <Route path="/login" element={<PublicRoute><Navbar /><Login /></PublicRoute>} />
    <Route path="/register" element={<PublicRoute><Navbar /><Register /></PublicRoute>} />
    <Route path="/dashboard" element={<ProtectedRoute><Navbar /><Dashboard /></ProtectedRoute>} />
    <Route path="/invite/:token" element={<InviteRoute />} />
    <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
    <Route path="/reset-password/:token" element={<PublicRoute><ResetPassword /></PublicRoute>} />
    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
    <Route path="/room/:id" element={<ProtectedRoute><Room /></ProtectedRoute>} />
    <Route path="/call/:id" element={<ProtectedRoute><CallRoom /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CallProvider>
          <AnimatedBackground />
          <AppRoutes />
        </CallProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
