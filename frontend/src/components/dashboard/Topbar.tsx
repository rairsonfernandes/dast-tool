import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUser, type User } from '@/lib/auth';
import { useLogout } from '@/layouts/DashboardLayout';

// ============================================
// TIPOS
// ============================================
interface TopbarProps {
  onOpenSidebar: () => void;
  breadcrumb: string;
}

type SystemStatus = 'operational' | 'degraded' | 'down' | 'unknown';

// ============================================
// HOOK: user reativo (storage + evento custom)
// ============================================
function useCurrentUser(): User | null {
  const [user, setUser] = useState<User | null>(() => getUser());

  useEffect(() => {
    const sync = () => setUser(getUser());

    const onStorage = (e: StorageEvent) => {
      if (
        e.key === null ||
        e.key === 'user' ||
        e.key === 'token' ||
        e.key === 'sentinel:user'
      ) {
        sync();
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('sentinel:auth', sync as EventListener);
    sync();

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('sentinel:auth', sync as EventListener);
    };
  }, []);

  return user;
}

// ============================================
// HOOK: health status (60s)
// ============================================
function useSystemStatus(): SystemStatus {
  const [status, setStatus] = useState<SystemStatus>('unknown');

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const controller = new AbortController();
        // 60 segundos é tempo suficiente para o Render acordar do sono profundo
        const timer = setTimeout(() => controller.abort(), 60000);
        
        // URL explícito do Render para nunca falhar no Vercel
        const API_URL = import.meta.env.VITE_API_URL || 'https://dast-tool-backend.onrender.com';
        
        const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
        clearTimeout(timer);
        
        if (cancelled) return;
        if (!res.ok) {
          setStatus('down');
          return;
        }
        const data = await res.json().catch(() => null);
        if (data?.status === 'healthy') setStatus('operational');
        else setStatus('degraded');
      } catch {
        if (!cancelled) setStatus('down');
      }
    };

    check();
    const interval = setInterval(check, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}

// ============================================
// HELPERS
// ============================================
const STATUS_STYLE: Record<SystemStatus, { dot: string; text: string; label: string }> = {
  operational: { dot: 'bg-[#00FF66] animate-ping', text: 'text-[#00FF66]', label: 'OPERACIONAL' },
  degraded: { dot: 'bg-[#FFC107] animate-pulse', text: 'text-[#FFC107]', label: 'DEGRADADO' },
  down: { dot: 'bg-[#FF2E54]', text: 'text-[#FF2E54]', label: 'INDISPONÍVEL' },
  unknown: { dot: 'bg-gray-500 animate-pulse', text: 'text-gray-500', label: 'A VERIFICAR' },
};

function formatRole(role: string | undefined): string {
  if (!role) return 'Analyst';
  return role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getInitials(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return 'U';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_PALETTES = [
  { from: '#00FF66', to: '#00B34A', ring: 'rgba(0,255,102,0.45)', text: '#001A0A' },
  { from: '#00C2FF', to: '#0066CC', ring: 'rgba(0,194,255,0.45)', text: '#001A22' },
  { from: '#A855F7', to: '#6D28D9', ring: 'rgba(168,85,247,0.45)', text: '#1A0A2E' },
  { from: '#FF8800', to: '#C2410C', ring: 'rgba(255,136,0,0.45)', text: '#1A0A00' },
  { from: '#FF2E54', to: '#9F1239', ring: 'rgba(255,46,84,0.45)', text: '#1A0005' },
  { from: '#14B8A6', to: '#0F766E', ring: 'rgba(20,184,166,0.45)', text: '#00110E' },
] as const;

// ============================================
// AVATAR — fallback com iniciais (inline)
// ============================================
interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md';
  online?: boolean;
}

const AVATAR_SIZE = {
  sm: { box: 'w-9 h-9', text: 'text-[11px]', rounded: 'rounded-lg', dot: 'w-2.5 h-2.5' },
  md: { box: 'w-11 h-11', text: 'text-sm', rounded: 'rounded-lg', dot: 'w-3 h-3' },
} as const;

const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'sm', online = false }) => {
  const initials = useMemo(() => getInitials(name), [name]);
  const palette = useMemo(() => {
    const key = (name || 'user').trim().toLowerCase();
    return AVATAR_PALETTES[hashString(key) % AVATAR_PALETTES.length];
  }, [name]);
  const gridId = useMemo(() => `av-${hashString(name || 'user')}`, [name]);

  const s = AVATAR_SIZE[size];

  return (
    <div className={`relative shrink-0 ${s.box}`}>
      {src ? (
        <img
          src={src}
          alt=""
          className={`w-full h-full object-cover ${s.rounded} border border-[#00FF66]/40`}
          style={{ boxShadow: `0 0 20px ${palette.ring}` }}
        />
      ) : (
        <div
          className={`relative w-full h-full ${s.rounded} overflow-hidden`}
          style={{
            background: `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`,
            boxShadow: `0 0 0 1px ${palette.ring}, 0 0 24px ${palette.ring}, inset 0 1px 0 rgba(255,255,255,0.15)`,
          }}
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 40%, transparent 60%)',
            }}
          />
          <svg
            className="absolute inset-0 w-full h-full opacity-[0.12] pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id={`${gridId}-g`} width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M 8 0 L 0 0 0 8" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${gridId}-g)`} />
          </svg>
          <span
            className={`absolute inset-0 flex items-center justify-center font-mono font-black tracking-wider ${s.text}`}
            style={{
              color: palette.text,
              textShadow: '0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            {initials}
          </span>
          <div
            className={`absolute inset-0 ${s.rounded} pointer-events-none`}
            style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }}
          />
        </div>
      )}

      {online && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${s.dot} bg-[#00FF66] border-2 border-[#0B0E14] rounded-full`}
          aria-label="Online"
        >
          <span className="absolute inset-0 rounded-full bg-[#00FF66] animate-ping opacity-75" />
        </span>
      )}
    </div>
  );
};

// ============================================
// TOPBAR
// ============================================
const Topbar: React.FC<TopbarProps> = ({ onOpenSidebar, breadcrumb }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const user = useCurrentUser();
  const systemStatus = useSystemStatus();
  const { requestLogout } = useLogout();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const displayName =
    user?.name?.trim() || user?.email?.split('@')[0] || 'Utilizador';
  const displayEmail = user?.email || '—';
  const displayRole = formatRole(user?.role);
  const displaySubtitle = `SecOps ${displayRole}`;
  const avatarUrl = user?.avatar || null;
  const status = STATUS_STYLE[systemStatus];

  const handleLogout = useCallback(() => {
    setOpen(false);
    requestLogout();
  }, [requestLogout]);

  return (
    <header className="sticky top-0 z-30 bg-[#0B0E14]/80 backdrop-blur-xl border-b border-[#1A2130] shrink-0">
      <div className="flex items-center justify-between px-6 md:px-8 py-3.5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Abrir menu"
            className="md:hidden text-gray-400 hover:text-[#00FF66] p-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF66]/60"
          >
            <i className="fa-solid fa-bars text-lg" aria-hidden="true" />
          </button>

          <nav
            aria-label="Breadcrumb"
            className="text-xs font-mono text-gray-500 flex items-center gap-2"
          >
            <span className="text-gray-600">SISTEMA</span>
            <i
              className="fa-solid fa-chevron-right text-[8px] text-gray-700"
              aria-hidden="true"
            />
            <span className="text-[#00FF66] font-semibold tracking-wider" aria-current="page">
              {breadcrumb}
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <div
            className="hidden sm:flex items-center gap-2 bg-[#11151E] px-3 py-1.5 rounded-lg border border-[#1A2130] text-[10px] font-mono"
            role="status"
            aria-live="polite"
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
            <span className="text-gray-500">STATUS:</span>
            <span className={`font-bold tracking-wider ${status.text}`}>{status.label}</span>
          </div>

          <div className="w-px h-8 bg-[#1A2130] hidden sm:block" />

          <div className="relative" ref={ref}>
            <button
              ref={menuBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={menuId}
              className="profile-btn flex items-center gap-3 pl-2 pr-3 py-1.5 rounded-xl border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF66]/60"
            >
              <div className="text-right hidden md:block">
                <p className="text-xs font-semibold text-white leading-tight truncate max-w-[140px]">
                  {displayName}
                </p>
                <p className="text-[10px] font-mono text-gray-500 leading-tight">
                  {displaySubtitle}
                </p>
              </div>

              <Avatar
                name={displayName}
                src={avatarUrl}
                size="sm"
                online={systemStatus === 'operational'}
              />

              <i
                className={`fa-solid fa-chevron-down text-[9px] text-gray-500 hidden md:block transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div
                id={menuId}
                role="menu"
                aria-label="Menu do utilizador"
                className="absolute right-0 mt-2 w-64 bg-[#0B0E14] border border-[#1A2130] rounded-xl shadow-2xl overflow-hidden z-50 dropdown-enter"
              >
                <div className="p-4 bg-gradient-to-br from-[#11151E] to-[#0B0E14] border-b border-[#1A2130]">
                  <div className="flex items-center gap-3">
                    <Avatar name={displayName} src={avatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                      <p className="text-[10px] font-mono text-gray-500 truncate">
                        {displayEmail}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 text-[9px] font-mono text-[#00FF66] bg-[#00FF66]/10 px-2 py-1 rounded-full border border-[#00FF66]/20 w-fit">
                    <span className="w-1 h-1 rounded-full bg-[#00FF66] animate-pulse" />
                    SESSÃO ATIVA
                  </div>
                </div>

                <div className="p-2">
                  <Link
                    to="/account"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-[#11151E] transition-colors text-xs focus-visible:outline-none focus-visible:bg-[#11151E] focus-visible:text-white"
                  >
                    <i className="fa-solid fa-user w-4 text-gray-500" aria-hidden="true" />
                    Meu perfil
                  </Link>
                  <Link
                    to="/settings"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-[#11151E] transition-colors text-xs focus-visible:outline-none focus-visible:bg-[#11151E] focus-visible:text-white"
                  >
                    <i className="fa-solid fa-sliders w-4 text-gray-500" aria-hidden="true" />
                    Definições
                  </Link>
                  <a
                    href="mailto:support@sentinel.sec"
                    role="menuitem"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-[#11151E] transition-colors text-xs focus-visible:outline-none focus-visible:bg-[#11151E] focus-visible:text-white"
                  >
                    <i className="fa-solid fa-life-ring w-4 text-gray-500" aria-hidden="true" />
                    Suporte
                  </a>
                  <div className="my-1 border-t border-[#1A2130]" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:text-[#FF2E54] hover:bg-[#FF2E54]/10 transition-colors text-xs focus-visible:outline-none focus-visible:bg-[#FF2E54]/10 focus-visible:text-[#FF2E54]"
                  >
                    <i
                      className="fa-solid fa-right-from-bracket w-4 text-gray-500"
                      aria-hidden="true"
                    />
                    Terminar sessão
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default memo(Topbar);