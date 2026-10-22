import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AdminRoute } from './AdminRoute';
import DashboardLayout from '@/layouts/DashboardLayout';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import Dashboard from '@/pages/Dashboard';
import Scans from '@/pages/Scans';
import ScanDetail from '@/pages/ScanDetail';
import Vulnerabilities from '@/pages/Vulnerabilities';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import Account from '@/pages/Account';
import Admin from '@/pages/Admin';
import NotFound from '@/pages/NotFound';

export const router = createBrowserRouter([
  // ===== PÃºblicas =====
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/terms', element: <Terms /> },
  { path: '/privacy', element: <Privacy /> },

  // ===== Protegidas (autenticado) =====
  {
    element: <ProtectedRoute />,
    children: [
      // App normal
      {
        element: <DashboardLayout />,
        children: [
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/scans', element: <Scans /> },
          { path: '/scans/:id', element: <ScanDetail /> },
          { path: '/vulnerabilities', element: <Vulnerabilities /> },
          { path: '/reports', element: <Reports /> },
          { path: '/settings', element: <Settings /> },
          { path: '/account', element: <Account /> },
        ],
      },

      // Admin (dupla proteÃ§Ã£o: autenticado + role admin)
      {
        element: <AdminRoute />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              { path: '/admin', element: <Admin /> },
            ],
          },
        ],
      },
    ],
  },

  // ===== 404 =====
  { path: '*', element: <NotFound /> },
]);