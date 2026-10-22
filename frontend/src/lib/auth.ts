// ============================================================
// SENTINEL — Auth Utilities (Production Ready)
// ============================================================

const TOKEN_KEY = 'token';
const USER_KEY = 'sentinel_user';
const ACTIVITY_KEY = 'sentinel_last_activity';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

export type UserRole = 'ADMIN' | 'ANALYST' | 'VIEWER' | 'SUPER_ADMIN';

export interface User {
  id: string | number;
  name?: string;
  email: string;
  role: UserRole;
  tenant_id?: string;
  avatar?: string;
  avatar_url?: string;
  provider?: string | null;
  is_active?: boolean;
  last_login_at?: string | null;
  created_at?: string;
}

// ============================================================
// TOKEN
// ============================================================
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, remember = true): void {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// ============================================================
// USER
// ============================================================
export function getUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Notifica Topbar / Sidebar / qualquer componente que escute
  window.dispatchEvent(new Event('sentinel:auth'));
}

export function removeUser(): void {
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('sentinel:auth'));
}

// ============================================================
// INACTIVITY TIMEOUT
// ============================================================
export function touchActivity(): void {
  localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
}

export function isSessionTimedOut(): boolean {
  const raw = localStorage.getItem(ACTIVITY_KEY);
  if (!raw) return false;
  const last = parseInt(raw, 10);
  if (isNaN(last)) return false;
  return Date.now() - last > INACTIVITY_TIMEOUT_MS;
}

export function clearInactivity(): void {
  localStorage.removeItem(ACTIVITY_KEY);
}

export const INACTIVITY_MS = INACTIVITY_TIMEOUT_MS;

// ============================================================
// SESSION
// ============================================================
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
  // Notifica componentes (Topbar limpa avatar, Sidebar limpa admin, etc.)
  window.dispatchEvent(new Event('sentinel:auth'));
}

export const clearAuthFull = clearAuth;

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearAuth();
      return false;
    }
    return true;
  } catch {
    clearAuth();
    return false;
  }
}

export function isSessionValid(): boolean {
  return isAuthenticated() && !isSessionTimedOut();
}

// ============================================================
// ROLE HELPERS
// ============================================================
export function isAdmin(user?: User | null): boolean {
  const u = user ?? getUser();
  return u?.role === 'ADMIN' || u?.role === 'SUPER_ADMIN';
}

// ============================================================
// Compatibilidade
// ============================================================
export const auth = {
  getToken,
  setToken,
  clear: clearAuth,
  isAuthenticated,
};