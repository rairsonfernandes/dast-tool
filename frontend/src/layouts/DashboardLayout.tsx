import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';
import Toast from '@/components/dashboard/Toast';
import Modal from '@/components/dashboard/Modal';
import { clearAuth, isSessionTimedOut } from '@/lib/auth';
import { usePageMeta } from '@/lib/usePageMeta';

// ============================================================
// Contextos
// ============================================================
interface ToastContextValue {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}
const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });
export const useToast = () => useContext(ToastContext);

interface LogoutContextValue {
  requestLogout: () => void;
}
const LogoutContext = createContext<LogoutContextValue>({ requestLogout: () => {} });
export const useLogout = () => useContext(LogoutContext);

// ============================================================
// Titles por rota
// ============================================================
const routeTitles: Record<string, string> = {
  '/dashboard': 'VISÃO GERAL',
  '/scans': 'SCANS',
  '/vulnerabilities': 'VULNERABILIDADES',
  '/reports': 'RELATÓRIOS',
  '/settings': 'DEFINIÇÕES',
  '/account': 'CONTA',
  '/admin': 'ADMIN CONSOLE',
};

// ============================================================
// Layout
// ============================================================
const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<
    { id: number; message: string; type: 'success' | 'error' | 'info' }[]
  >([]);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // SEO / <title> dinâmico
  usePageMeta();

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
    },
    []
  );

  const requestLogout = useCallback(() => setLogoutOpen(true), []);

  const confirmLogout = () => {
    setLogoutOpen(false);
    clearAuth();
    showToast('Sessão encerrada com segurança.', 'success');
    setTimeout(() => navigate('/login', { replace: true }), 400);
  };

  // Watchdog de inatividade (verifica a cada 60s)
  useEffect(() => {
    const check = () => {
      if (isSessionTimedOut()) {
        clearAuth();
        showToast('A tua sessão expirou por inatividade.', 'error');
        setTimeout(() => navigate('/login?expired=1', { replace: true }), 600);
      }
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [navigate, showToast]);

  // Rota ativa e breadcrumb
  const activePath =
    Object.keys(routeTitles)
      .filter((p) => location.pathname === p || location.pathname.startsWith(p + '/'))
      .sort((a, b) => b.length - a.length)[0] || location.pathname;

  const breadcrumb =
    routeTitles[activePath] || location.pathname.replace('/', '').toUpperCase();

  return (
    <ToastContext.Provider value={{ showToast }}>
      <LogoutContext.Provider value={{ requestLogout }}>
        <div className="dashboard-root min-h-screen bg-[#070709] text-slate-200 font-sans">
          <Sidebar
            open={sidebarOpen}
            activePath={activePath}
            onClose={() => setSidebarOpen(false)}
          />
          <div className="flex-1 flex flex-col min-w-0 min-h-screen ml-0 md:ml-72 transition-all duration-300">
            <Topbar
              onOpenSidebar={() => setSidebarOpen(true)}
              breadcrumb={breadcrumb}
            />
            <main className="flex-1 overflow-y-auto bg-[#070709]">
              <div className="p-5 md:p-8 space-y-6 max-w-7xl w-full mx-auto">
                <Outlet />
              </div>
            </main>
          </div>

          {/* Toasts */}
          <div className="fixed top-5 right-5 z-[60] flex flex-col gap-3 pointer-events-none">
            {toasts.map((t) => (
              <Toast key={t.id} message={t.message} type={t.type} />
            ))}
          </div>

          {/* Modal de logout */}
          <Modal
            open={logoutOpen}
            onClose={() => setLogoutOpen(false)}
            title="TERMINAR SESSÃO?"
            icon="fa-right-from-bracket"
            iconColor="text-[#FF2E54]"
            maxWidth="max-w-sm"
            footer={
              <>
                <button
                  onClick={() => setLogoutOpen(false)}
                  className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmLogout}
                  className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-lg"
                >
                  Sair do Sistema
                </button>
              </>
            }
          >
            <p className="text-xs text-gray-300 text-center">
              A sua sessão atual no SENTINEL será encerrada e requererá nova autenticação.
            </p>
          </Modal>
        </div>
      </LogoutContext.Provider>
    </ToastContext.Provider>
  );
};

export default DashboardLayout;