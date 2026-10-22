import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isAuthenticated, isSessionTimedOut, clearAuthFull } from '@/lib/auth';

export const ProtectedRoute = () => {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Timeout de inatividade
  if (isSessionTimedOut()) {
    clearAuthFull();
    return <Navigate to="/login?expired=1" replace />;
  }

  return <Outlet />;
};