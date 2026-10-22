import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Anexa JWT a todos os pedidos
api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Se 401 e não estiver no login, limpa token e redireciona
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (
      err.response?.status === 401 &&
      !window.location.pathname.startsWith("/login")
    ) {
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ============================================
// OAUTH — inicia o fluxo (Google | GitHub)
// ============================================
export type OAuthProvider = "google" | "github";

export async function startOAuth(provider: OAuthProvider): Promise<void> {
  try {
    const res = await api.get<{ url: string }>(`/api/auth/${provider}/url`);
    if (!res.data?.url) {
      throw new Error("URL de OAuth não devolvido pelo backend");
    }
    window.location.href = res.data.url;
  } catch (err) {
    console.error(`[OAuth ${provider}] falhou:`, err);
    // Fallback: sinaliza erro no URL para o Login.tsx apanhar
    window.location.href = `/login?error=oauth_start_failed`;
  }
}


// ============================================
// EXTENSÕES — compatibilidade com componentes do dashboard
// ============================================

// Auth helpers
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post('/api/auth/register', { name, email, password }),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
  forgotPassword: (email: string) =>
    api.post('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/api/auth/reset-password', { token, password }),
};

// Dashboard
export const dashboardApi = {
  stats: () => api.get('/api/dashboard/stats'),
};

// Vulnerabilities
export const vulnsApi = {
  list: (params?: { severity?: string; search?: string; page?: number }) =>
    api.get('/api/vulnerabilities', { params }),
  get: (id: string | number) => api.get(`/api/vulnerabilities/${id}`),
  fix: (id: string | number) => api.post(`/api/vulnerabilities/${id}/fix`),
};

// Reports
export const reportsApi = {
  list: (params?: { format?: string }) => api.get('/api/reports', { params }),
  create: (data: { type: string; format: 'PDF' | 'CSV'; period: string }) =>
    api.post('/api/reports', data),
  download: (id: string | number) =>
    api.get(`/api/reports/${id}/download`, { responseType: 'blob' }),
};

// Settings
export const settingsApi = {
  get: () => api.get('/api/settings'),
  update: (data: Record<string, unknown>) => api.put('/api/settings', data),
  reset: () => api.post('/api/settings/reset'),
};

// Re-export do teu `scansApi` (que está em lib/scans.ts)
export { scansApi } from './scans';