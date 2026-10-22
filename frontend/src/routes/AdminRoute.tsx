import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isAuthenticated, isSessionTimedOut, clearAuthFull, getUser } from '@/lib/auth';

export const AdminRoute = () => {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isSessionTimedOut()) {
    clearAuthFull();
    return <Navigate to="/login?expired=1" replace />;
  }

  const user = getUser();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  if (!isAdmin) {
    return <Navigate to="/dashboard?forbidden=admin" replace />;
  }

  return <Outlet />;
};