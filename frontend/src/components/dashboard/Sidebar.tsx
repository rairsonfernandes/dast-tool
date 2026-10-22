import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLogout } from '@/layouts/DashboardLayout';
import { getUser, type User } from '@/lib/auth';

// ============================================
// TIPOS
// ============================================
export type BadgeType = 'neon' | 'critical' | 'purple';

export interface NavItem {
  to: string;
  icon: string;
  label: string;
  /** Se omitido, não mostra badge. Nunca usar valores hardcoded. */
  badge?: string | number;
  badgeType?: BadgeType;
}

interface SidebarProps {
  open: boolean;
  activePath: string;
  onClose: () => void;
}

// ============================================
// NAVEGAÇÃO
// ============================================
const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: 'fa-chart-pie', label: 'Visão geral' },
  { to: '/scans', icon: 'fa-magnifying-glass-chart', label: 'Scans' },
  { to: '/vulnerabilities', icon: 'fa-bug', label: 'Vulnerabilidades' },
  { to: '/reports', icon: 'fa-file-contract', label: 'Relatórios' },
];

const CONFIG_ITEMS: NavItem[] = [
  { to: '/account', icon: 'fa-user-shield', label: 'Conta' },
  { to: '/settings', icon: 'fa-sliders', label: 'Definições' },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin', icon: 'fa-shield-halved', label: 'Admin Console', badge: 'ROOT', badgeType: 'purple' },
];

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

// ============================================
// HOOK: user reativo a storage + evento custom
// ============================================
function useCurrentUser(): User | null {
  const [user, setUser] = useState<User | null>(() => getUser());

  useEffect(() => {
    const sync = () => setUser(getUser());

    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === 'user' || e.key === 'token' || e.key === 'sentinel:user') {
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
// HOOK: lock de scroll + focus trap + Escape
// ============================================
function useDrawerBehavior(open: boolean, onClose: () => void) {
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { body } = document;

    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const container = asideRef.current;
      if (!container) return;

      const focusables = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    requestAnimationFrame(() => {
      const firstFocusable = asideRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled])'
      );
      firstFocusable?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return asideRef;
}

// ============================================
// SIDEBAR
// ============================================
const Sidebar: React.FC<SidebarProps> = ({ open, activePath, onClose }) => {
  const { requestLogout } = useLogout();
  const user = useCurrentUser();
  const isAdmin = useMemo(() => !!user?.role && ADMIN_ROLES.has(user.role), [user?.role]);
  const asideRef = useDrawerBehavior(open, onClose);
  const navId = useId();

  // O modal de confirmação é do DashboardLayout (useLogout).
  // Aqui só fechamos o drawer e disparamos o pedido.
  const handleLogout = useCallback(() => {
    onClose();
    requestLogout();
  }, [onClose, requestLogout]);

  return (
    <>
      {/* Overlay — apenas mobile, fecha ao clicar fora */}
      {open && (
        <div
          onClick={onClose}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        ref={asideRef}
        aria-label="Navegação principal"
        data-testid="sidebar"
        data-open={open ? 'true' : 'false'}
        className={[
          'fixed inset-y-0 left-0 z-50 flex select-none flex-col',
          // Mobile: ocupa 100% da largura | Desktop (md+): 288px
          'w-full md:w-72',
          'border-r border-[#1A2130] bg-[#0B0E14]',
          'transition-transform duration-300 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Marca */}
        <div className="relative shrink-0 overflow-hidden border-b border-[#1A2130] px-6 py-5">
          <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00FF66]/60 to-transparent" />
          <div className="flex items-center justify-between">
            <Link
              to="/dashboard"
              onClick={onClose}
              className="rounded text-2xl font-black tracking-[0.18em] font-mono text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF66]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
              aria-label="SENTINEL — ir para o dashboard"
            >
              SENTINEL
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar menu"
              aria-controls={navId}
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-[#11151E] hover:text-[#00FF66] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF66]/60 md:hidden"
            >
              <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Navegação */}
        <nav
          id={navId}
          className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-5"
        >
          <SectionLabel icon="fa-layer-group">Navegação</SectionLabel>
          {NAV_ITEMS.map((item) => (
            <SidebarLink
              key={item.to}
              {...item}
              activePath={activePath}
              onNavigate={onClose}
            />
          ))}

          <SectionLabel icon="fa-gear" className="pt-5">
            Configurações
          </SectionLabel>
          {CONFIG_ITEMS.map((item) => (
            <SidebarLink
              key={item.to}
              {...item}
              activePath={activePath}
              onNavigate={onClose}
            />
          ))}

          {isAdmin && (
            <>
              <SectionLabel icon="fa-crown" className="pt-5" tone="purple">
                Administração
              </SectionLabel>
              {ADMIN_ITEMS.map((item) => (
                <SidebarLink
                  key={item.to}
                  {...item}
                  activePath={activePath}
                  onNavigate={onClose}
                  purple
                />
              ))}
            </>
          )}
        </nav>

        {/* Rodapé — TERMINAR SESSÃO */}
        <div className="shrink-0 border-t border-[#1A2130] bg-black/30 p-4">
          <button
            type="button"
            onClick={handleLogout}
            data-testid="logout-button"
            className="logout-menu-btn flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-2.5 text-gray-400 transition-all duration-200 hover:text-[#FF2E54] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2E54]/60"
          >
            <i className="fa-solid fa-right-from-bracket w-5 text-sm" aria-hidden="true" />
            <span className="text-sm font-medium">Terminar sessão</span>
          </button>
        </div>
      </aside>
    </>
  );
};

// ============================================
// SECTION LABEL
// ============================================
const SectionLabel: React.FC<{
  icon: string;
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'purple';
}> = ({ icon, children, className = '', tone = 'default' }) => {
  const isPurple = tone === 'purple';
  return (
    <div
      className={[
        'flex items-center gap-2 px-3 pb-2.5 text-[9px] font-mono font-semibold uppercase tracking-[0.25em]',
        isPurple ? 'text-[#A855F7]/70' : 'text-gray-600',
        className,
      ].join(' ')}
    >
      <i
        className={`fa-solid ${icon} text-[8px] ${isPurple ? 'text-[#A855F7]' : 'text-[#00FF66]/50'}`}
        aria-hidden="true"
      />
      {children}
    </div>
  );
};

// ============================================
// SIDEBAR LINK
// ============================================
interface SidebarLinkProps extends NavItem {
  activePath: string;
  onNavigate: () => void;
  purple?: boolean;
}

const SidebarLink: React.FC<SidebarLinkProps> = memo(
  ({ to, icon, label, activePath, onNavigate, badge, badgeType, purple }) => {
    const active = useMemo(() => {
      if (activePath === to) return true;
      if (!activePath.startsWith(to + '/')) return false;
      return true;
    }, [activePath, to]);

    const activeClass = active
      ? purple
        ? 'active-menu-item-purple'
        : 'active-menu-item'
      : 'hover:text-white hover:bg-[#11151E]';

    const iconColor = active ? '' : 'text-gray-500 group-hover:text-[#00FF66]';

    return (
      <Link
        to={to}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        data-testid={`nav-${to.replace(/\//g, '-')}`}
        className={[
          'nav-item group flex items-center rounded-lg px-4 py-2.5 text-gray-400 transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FF66]/60',
          activeClass,
        ].join(' ')}
      >
        <i
          className={`fa-solid ${icon} w-7 text-base transition-colors ${iconColor}`}
          aria-hidden="true"
        />
        <span className="text-sm font-medium">{label}</span>
        {badge !== undefined && badge !== null && badge !== '' && (
          <Badge type={badgeType}>{badge}</Badge>
        )}
      </Link>
    );
  }
);
SidebarLink.displayName = 'SidebarLink';

// ============================================
// BADGE
// ============================================
const BADGE_STYLES: Record<BadgeType, string> = {
  critical: 'bg-[#FF2E54]/20 text-[#FF2E54] border-[#FF2E54]/30',
  purple: 'bg-[#A855F7]/20 text-[#A855F7] border-[#A855F7]/30',
  neon: 'bg-[#00FF66]/10 text-[#00FF66] border-[#00FF66]/20',
};

const Badge: React.FC<{ type?: BadgeType; children: React.ReactNode }> = ({ type = 'neon', children }) => (
  <span
    className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold ${BADGE_STYLES[type]}`}
  >
    {children}
  </span>
);

export default memo(Sidebar);