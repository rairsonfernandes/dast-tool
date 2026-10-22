import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/dashboard/Modal';
import Avatar from '@/components/ui/Avatar';
import { useToast } from '@/layouts/DashboardLayout';
import { api } from '@/lib/api';
import './admin.css';

// ============================================
// TIPOS
// ============================================
type Tab = 'overview' | 'users' | 'sessions' | 'system' | 'logs' | 'danger';
type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'ANALYST' | 'VIEWER';

interface AdminUserRow {
  id: number;
  name?: string;
  email: string;
  role: AdminRole | string;
  is_active?: boolean;
  created_at?: string;
  last_access?: string | null;
  avatar?: string | null;
}

interface AdminSessionRow {
  id: string | number;
  user_id?: number;
  user_email?: string;
  user_name?: string;
  user_agent?: string;
  ip?: string;
  ip_address?: string;
  last_active_at?: string;
  created_at?: string;
  is_current?: boolean;
}

interface AuditLogRow {
  id: string | number;
  action?: string;
  message?: string;
  created_at?: string;
  user_id?: number;
  level?: string;
}

interface AdminHealth {
  cpu: number;
  ram: number;
  disk: number;
  network: number;
  region: string;
  version: string;
  uptime_days: number;
  last_backup: string;
}

interface AdminStats {
  users: number;
  active_users: number;
  sessions: number;
  scans: number;
  scans_today: number;
  completed: number;
  pending: number;
  running: number;
  failed: number;
  health?: AdminHealth | null;
}

interface ActivityDay {
  date: string;
  label: string;
  scans: number;
  users: number;
}

interface ConfirmConfig {
  title: string;
  message: string;
  icon: string;
  requireInput?: boolean;
  onConfirm: () => Promise<void> | void;
}

const TAB_LABELS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Visão Geral', icon: 'fa-chart-line' },
  { key: 'users', label: 'Utilizadores', icon: 'fa-users' },
  { key: 'sessions', label: 'Sessões', icon: 'fa-desktop' },
  { key: 'system', label: 'Sistema', icon: 'fa-server' },
  { key: 'logs', label: 'Logs', icon: 'fa-terminal' },
  { key: 'danger', label: 'Perigo', icon: 'fa-triangle-exclamation' },
];

// ============================================
// HELPERS
// ============================================
function roleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `há ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `há ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `há ${days} dia${days > 1 ? 's' : ''}`;
  } catch {
    return '—';
  }
}

function deviceLabel(ua?: string): string {
  if (!ua) return 'Dispositivo desconhecido';
  const s = ua.toLowerCase();
  const os = s.includes('windows') ? 'Windows'
    : s.includes('mac') ? 'macOS'
    : s.includes('iphone') ? 'iPhone'
    : s.includes('android') ? 'Android'
    : s.includes('linux') ? 'Linux'
    : 'Desconhecido';
  const br = s.includes('chrome') ? 'Chrome'
    : s.includes('firefox') ? 'Firefox'
    : s.includes('safari') ? 'Safari'
    : s.includes('edge') ? 'Edge'
    : '';
  return br ? `${os} · ${br}` : os;
}

function deviceIcon(ua?: string): string {
  const s = (ua || '').toLowerCase();
  if (s.includes('iphone') || s.includes('android') || s.includes('mobile')) return 'fa-mobile-screen';
  if (s.includes('ipad') || s.includes('tablet')) return 'fa-tablet-screen-button';
  return 'fa-laptop';
}

// ============================================
// COMPONENTE
// ============================================
const Admin = () => {
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>('overview');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [sessions, setSessions] = useState<AdminSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLevel, setLogsLevel] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

  const [systemToggles, setSystemToggles] = useState({
    maintenance: false,
    audit: true,
    backup: true,
    ratelimit: true,
    debug: false,
  });

  const [confirmCfg, setConfirmCfg] = useState<ConfirmConfig | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ============================================
  // FETCH
  // ============================================
  const loadStats = useCallback(async () => {
    try {
      const [statsRes, activityRes] = await Promise.allSettled([
        api.get<AdminStats>('/api/admin/stats'),
        api.get<{ days: ActivityDay[] }>('/api/admin/activity?days=7'),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      else setStats(null);
      if (activityRes.status === 'fulfilled') setActivity(activityRes.value.data?.days ?? []);
      else setActivity([]);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadUsers = useCallback(
    async (page = 1, q = '') => {
      setUsersLoading(true);
      try {
        const { data } = await api.get<{ items: AdminUserRow[]; total: number }>(
          '/api/admin/users',
          { params: { page, limit: 50, q: q || undefined } },
        );
        setUsers(data.items ?? []);
        setUsersTotal(data.total ?? 0);
        setUsersPage(page);
      } catch (err: any) {
        showToast(err?.response?.data?.error || 'Falha ao carregar utilizadores.', 'error');
        setUsers([]);
        setUsersTotal(0);
      } finally {
        setUsersLoading(false);
      }
    },
    [showToast],
  );

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const { data } = await api.get<{ items: AdminSessionRow[]; total: number }>(
        '/api/admin/sessions',
      );
      setSessions(data.items ?? []);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao carregar sessões.', 'error');
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [showToast]);

  const loadLogs = useCallback(
    async (page = 1, level = '') => {
      setLogsLoading(true);
      try {
        const { data } = await api.get<{ items: AuditLogRow[]; total: number }>(
          '/api/admin/logs',
          { params: { page, limit: 100, level: level || undefined } },
        );
        setLogs(data.items ?? []);
        setLogsTotal(data.total ?? 0);
        setLogsPage(page);
      } catch (err: any) {
        showToast(err?.response?.data?.error || 'Falha ao carregar logs.', 'error');
        setLogs([]);
        setLogsTotal(0);
      } finally {
        setLogsLoading(false);
      }
    },
    [showToast],
  );

  // ============================================
  // Effects
  // ============================================
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (tab !== 'users') return;
    const t = setTimeout(() => loadUsers(1, search), 250);
    return () => clearTimeout(t);
  }, [tab, search, loadUsers]);

  useEffect(() => {
    if (tab === 'sessions') loadSessions();
  }, [tab, loadSessions]);

  useEffect(() => {
    if (tab === 'logs') loadLogs(1, logsLevel);
  }, [tab, logsLevel, loadLogs]);

  // ============================================
  // AÇÕES
  // ============================================
  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await loadStats();
      if (tab === 'users') await loadUsers(usersPage, search);
      if (tab === 'sessions') await loadSessions();
      if (tab === 'logs') await loadLogs(logsPage, logsLevel);
      showToast('Dados atualizados.', 'success');
    } finally {
      setRefreshing(false);
    }
  };

  const requestConfirm = (cfg: ConfirmConfig) => {
    setConfirmInput('');
    setConfirmCfg(cfg);
  };

  const handleConfirm = async () => {
    if (!confirmCfg) return;
    if (confirmCfg.requireInput && confirmInput.trim().toUpperCase() !== 'CONFIRMAR') return;
    setConfirmBusy(true);
    try {
      await confirmCfg.onConfirm();
      setConfirmCfg(null);
      setConfirmInput('');
    } finally {
      setConfirmBusy(false);
    }
  };

  // -------- Users --------
  const handleCreateUser = async (name: string, email: string, role: AdminRole) => {
    try {
      const { data } = await api.post<AdminUserRow & { temporary_password?: string }>(
        '/api/admin/users',
        { name, email, role },
      );
      setNewUserOpen(false);
      showToast('Utilizador criado.', 'success');
      if (data.temporary_password) {
        setConfirmCfg({
          title: 'PASSWORD TEMPORÁRIA',
          message: `A password temporária de <strong>${data.email}</strong> é:<br><code class="text-[#00FF66] font-mono">${data.temporary_password}</code><br><span class="text-xs text-gray-400">Guarda-a agora. Não será mostrada novamente.</span>`,
          icon: 'fa-key text-[#00FF66]',
          onConfirm: () => undefined,
        });
      }
      await loadUsers(1, search);
      await loadStats();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao criar utilizador.', 'error');
    }
  };

  const handleEditUser = async (
    id: number,
    role: AdminRole,
    isActive: boolean,
    name: string,
  ) => {
    try {
      await api.patch(`/api/admin/users/${id}`, { role, is_active: isActive, name });
      showToast('Utilizador atualizado.', 'success');
      setEditUser(null);
      await loadUsers(usersPage, search);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao atualizar.', 'error');
    }
  };

  const handleDeleteUser = (u: AdminUserRow) => {
    requestConfirm({
      title: 'ELIMINAR UTILIZADOR',
      message: `Eliminar <strong>${u.email}</strong>? Esta ação é irreversível.`,
      icon: 'fa-trash text-[#FF2E54]',
      onConfirm: async () => {
        try {
          await api.delete(`/api/admin/users/${u.id}`);
          showToast('Utilizador eliminado.', 'success');
          await loadUsers(usersPage, search);
          await loadStats();
        } catch (err: any) {
          showToast(err?.response?.data?.error || 'Falha ao eliminar.', 'error');
        }
      },
    });
  };

  // -------- Sessions --------
  const handleRevokeSession = (s: AdminSessionRow) => {
    requestConfirm({
      title: 'TERMINAR SESSÃO',
      message: `Terminar sessão em <strong>${deviceLabel(s.user_agent)}</strong>?`,
      icon: 'fa-power-off text-[#FF2E54]',
      onConfirm: async () => {
        try {
          await api.delete(`/api/admin/sessions/${s.id}`);
          showToast('Sessão terminada.', 'success');
          await loadSessions();
        } catch (err: any) {
          showToast(err?.response?.data?.error || 'Falha ao terminar sessão.', 'error');
        }
      },
    });
  };

  const handleRevokeAllSessions = () => {
    requestConfirm({
      title: 'TERMINAR TODAS AS SESSÕES',
      message: 'Todos os utilizadores (exceto a tua sessão atual) serão desconectados.',
      icon: 'fa-power-off text-[#FF2E54]',
      onConfirm: async () => {
        try {
          await api.delete('/api/admin/sessions');
          showToast('Todas as sessões terminadas.', 'success');
          await loadSessions();
          await loadStats();
        } catch (err: any) {
          showToast(err?.response?.data?.error || 'Falha.', 'error');
        }
      },
    });
  };

  // -------- System --------
  const handleAdminAction = (action: string, title: string, message: string) => {
    requestConfirm({
      title,
      message,
      icon: 'fa-bolt text-[#00FF66]',
      onConfirm: async () => {
        try {
          await api.post(`/api/admin/actions/${action}`);
          showToast(`${title} executado.`, 'success');
          await loadStats();
        } catch (err: any) {
          showToast(err?.response?.data?.error || 'Falha ao executar.', 'error');
        }
      },
    });
  };

  // -------- Danger --------
  const handleDangerAction = (
    action: string,
    title: string,
    message: string,
    requireInput = false,
  ) => {
    requestConfirm({
      title,
      message,
      icon: 'fa-triangle-exclamation text-[#FF2E54]',
      requireInput,
      onConfirm: async () => {
        try {
          await api.post(
            `/api/admin/danger/${action}`,
            {},
            { headers: { 'X-Confirm-Danger': 'yes' } },
          );
          showToast(`${title} executado.`, 'error');
          await loadStats();
        } catch (err: any) {
          showToast(err?.response?.data?.error || 'Falha.', 'error');
        }
      },
    });
  };

  const handleToggle = (key: keyof typeof systemToggles) => {
    setSystemToggles((p) => ({ ...p, [key]: !p[key] }));
    showToast(
      `"${key}" ${!systemToggles[key] ? 'ativado' : 'desativado'} (não guardado).`,
      'info',
    );
  };

  // ============================================
  // DERIVADOS
  // ============================================
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q),
    );
  }, [users, search]);

  const usersTotalPages = Math.max(1, Math.ceil(usersTotal / 50));
  const logsTotalPages = Math.max(1, Math.ceil(logsTotal / 100));

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      {/* Título */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            Admin Console
            <span className="px-2 py-0.5 rounded bg-[#A855F7]/20 border border-[#A855F7]/40 text-[#A855F7] text-[9px] font-mono font-bold tracking-wider">
              ROOT
            </span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Controlo total do sistema, utilizadores, segurança e infraestrutura.
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={refreshing}
          className="self-start md:self-auto px-4 py-2.5 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] flex items-center gap-2 disabled:opacity-60"
        >
          <i className={`fa-solid fa-arrows-rotate ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'A atualizar…' : 'Atualizar'}
        </button>
      </div>

      {/* MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cyber-card admin-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Utilizadores</span>
            <div className="w-8 h-8 rounded-lg bg-[#A855F7]/10 border border-[#A855F7]/20 flex items-center justify-center">
              <i className="fa-solid fa-users text-[#A855F7] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">
            {statsLoading ? '—' : stats?.users ?? 0}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-user-check text-gray-500" /> {stats?.active_users ?? 0} ativos
          </div>
        </div>

        <div className="cyber-card admin-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Sessões Ativas</span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-desktop text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">
            {statsLoading ? '—' : stats?.sessions ?? 0}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-clock text-gray-500" /> Agora
          </div>
        </div>

        <div className="cyber-card admin-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Scans Hoje</span>
            <div className="w-8 h-8 rounded-lg bg-[#00B0FF]/10 border border-[#00B0FF]/20 flex items-center justify-center">
              <i className="fa-solid fa-magnifying-glass-chart text-[#00B0FF] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">
            {statsLoading ? '—' : stats?.scans_today ?? 0}
          </div>
          <div className="text-[11px] text-[#00FF66] flex items-center gap-1 font-mono">
            <i className="fa-solid fa-check" /> {stats?.completed ?? 0} concluídos
          </div>
        </div>

        <div className="cyber-card admin-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Scans Totais</span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-server text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-[#00FF66] mb-1">
            {statsLoading ? '—' : stats?.scans ?? 0}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-clock text-gray-500" /> {stats?.running ?? 0} em curso
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-[#1A2130]">
        {TAB_LABELS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`admin-tab ${tab === t.key ? 'active' : ''}`}
          >
            <i className={`fa-solid ${t.icon} mr-1.5`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ OVERVIEW ============ */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 cyber-card admin-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#A855F7]/10 border border-[#A855F7]/30 flex items-center justify-center text-[#A855F7]">
                  <i className="fa-solid fa-chart-column text-base" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Atividade do Sistema</h3>
                  <p className="text-xs text-gray-400 font-mono">Últimos 7 dias</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <span className="w-2 h-2 rounded-sm bg-[#00FF66]" /> Scans
                </span>
                <span className="flex items-center gap-1.5 text-gray-400">
                  <span className="w-2 h-2 rounded-sm bg-[#A855F7]" /> Users
                </span>
              </div>
            </div>

            {activity.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-500 font-mono text-xs">
                Sem atividade nos últimos 7 dias.
              </div>
            ) : (
              (() => {
                const maxV = Math.max(1, ...activity.map((d) => Math.max(d.scans, d.users)));
                return (
                  <div className="flex items-end justify-between gap-2 sm:gap-3 h-48">
                    {activity.map((d) => (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full h-40 flex items-end justify-center gap-1">
                          <div
                            className="w-3 sm:w-4 rounded-t bg-[#00FF66]/60 transition-all"
                            style={{ height: `${(d.scans / maxV) * 100}%` }}
                            title={`${d.scans} scans`}
                          />
                          <div
                            className="w-3 sm:w-4 rounded-t bg-[#A855F7]/60 transition-all"
                            style={{ height: `${(d.users / maxV) * 100}%` }}
                            title={`${d.users} novos users`}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-gray-500">{d.label}</span>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>

          <div className="cyber-card admin-card rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2">
              <i className="fa-solid fa-heart-pulse text-[#00FF66]" /> Saúde do Sistema
            </h3>
            {stats?.health ? (
              <div className="space-y-4">
                {[
                  { icon: 'fa-microchip', label: 'CPU', value: stats.health.cpu, color: '#00FF66' },
                  { icon: 'fa-memory', label: 'RAM', value: stats.health.ram, color: '#00FF66' },
                  {
                    icon: 'fa-hard-drive',
                    label: 'Disco',
                    value: stats.health.disk,
                    color: stats.health.disk > 75 ? '#FFC107' : '#00FF66',
                  },
                  { icon: 'fa-network-wired', label: 'Rede', value: stats.health.network, color: '#00FF66' },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-300 flex items-center gap-1.5">
                        <i className={`fa-solid ${m.icon} text-[10px]`} style={{ color: m.color }} />
                        {m.label}
                      </span>
                      <span className="text-xs font-mono font-bold" style={{ color: m.color }}>
                        {m.value}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-black rounded-full overflow-hidden border border-[#1A2130]">
                      <div className="h-full rounded-full" style={{ width: `${m.value}%`, background: m.color }} />
                    </div>
                  </div>
                ))}
                <div className="mt-6 pt-5 border-t border-[#1A2130] space-y-2.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Região</span>
                    <span className="text-white font-bold">{stats.health.region}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Versão</span>
                    <span className="text-white font-bold">{stats.health.version}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Uptime</span>
                    <span className="text-[#00FF66] font-bold">{stats.health.uptime_days} dias</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Último backup</span>
                    <span className="text-white font-bold">{stats.health.last_backup}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 font-mono text-xs py-8">
                Sem agente de infraestrutura ligado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ USERS ============ */}
      {tab === 'users' && (
        <div className="cyber-card admin-card rounded-2xl overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 py-5 border-b border-[#1A2130]">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-users text-[#A855F7]" /> Gestão de Utilizadores
              </h3>
              <p className="text-xs text-gray-400 mt-1">{usersTotal} utilizadores registados</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar…"
                  className="neon-input pl-9 pr-3 py-2 rounded-lg text-xs font-mono text-white w-48"
                />
              </div>
              <button
                onClick={() => setNewUserOpen(true)}
                className="px-4 py-2 bg-[#00FF66] text-black font-semibold text-xs rounded-lg hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] flex items-center gap-1.5 whitespace-nowrap"
              >
                <i className="fa-solid fa-plus text-[10px]" /> Novo Utilizador
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="admin-table w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/50 text-[10px] font-mono uppercase text-gray-500 tracking-wider border-b border-[#1A2130]">
                  <th className="py-3.5 px-6 font-bold">Utilizador</th>
                  <th className="py-3.5 px-4 font-bold">Função</th>
                  <th className="py-3.5 px-4 font-bold">Estado</th>
                  <th className="py-3.5 px-4 font-bold">Registado</th>
                  <th className="py-3.5 px-6 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A2130]/60 text-xs">
                {filteredUsers.map((u) => {
                  const displayName = u.name?.trim() || u.email.split('@')[0];
                  return (
                    <tr key={u.id}>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <Avatar name={displayName} src={u.avatar || null} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">{displayName}</p>
                            <p className="text-[10px] text-gray-500 font-mono truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            u.role === 'SUPER_ADMIN'
                              ? 'bg-[#A855F7]/15 text-[#A855F7] border border-[#A855F7]/30'
                              : u.role === 'ADMIN'
                              ? 'bg-[#00B0FF]/15 text-[#00B0FF] border border-[#00B0FF]/30'
                              : 'bg-[#11151E] border border-[#1A2130] text-gray-300'
                          }`}
                        >
                          {u.role === 'SUPER_ADMIN' && <i className="fa-solid fa-crown text-[8px]" />}
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {u.is_active !== false ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#00FF66]/10 text-[#00FF66] border border-[#00FF66]/30 font-mono text-[10px] font-bold">
                            <span className="w-1 h-1 rounded-full bg-[#00FF66]" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/30 font-mono text-[10px] font-bold">
                            <span className="w-1 h-1 rounded-full bg-gray-500" /> Inativo
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-mono text-gray-400 text-[11px]">{timeAgo(u.created_at)}</td>
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <button onClick={() => setEditUser(u)} className="text-gray-500 hover:text-[#00FF66] px-2" title="Editar">
                          <i className="fa-solid fa-pen text-[10px]" />
                        </button>
                        <button onClick={() => handleDeleteUser(u)} className="text-gray-500 hover:text-[#FF2E54] px-2" title="Eliminar">
                          <i className="fa-solid fa-trash text-[10px]" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500 font-mono text-xs">
                      {usersLoading ? 'A carregar…' : 'Nenhum utilizador encontrado.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-3.5 border-t border-[#1A2130] bg-black/20 flex items-center justify-between text-[10px] font-mono text-gray-500">
            <span>
              A mostrar <span className="text-white font-bold">{filteredUsers.length}</span> de{' '}
              <span className="text-white font-bold">{usersTotal}</span> utilizadores
            </span>
            <span className="flex items-center gap-2">
              <button
                onClick={() => loadUsers(Math.max(1, usersPage - 1), search)}
                disabled={usersPage <= 1}
                className="px-2 py-1 rounded bg-[#11151E] border border-[#1A2130] hover:border-[#00FF66] hover:text-[#00FF66] transition-all disabled:opacity-40"
              >
                <i className="fa-solid fa-chevron-left text-[8px]" />
              </button>
              <span className="text-white">{usersPage} / {usersTotalPages}</span>
              <button
                onClick={() => loadUsers(Math.min(usersTotalPages, usersPage + 1), search)}
                disabled={usersPage >= usersTotalPages}
                className="px-2 py-1 rounded bg-[#11151E] border border-[#1A2130] hover:border-[#00FF66] hover:text-[#00FF66] transition-all disabled:opacity-40"
              >
                <i className="fa-solid fa-chevron-right text-[8px]" />
              </button>
            </span>
          </div>
        </div>
      )}

      {/* ============ SESSIONS ============ */}
      {tab === 'sessions' && (
        <div className="cyber-card admin-card rounded-2xl p-6">
          <div className="flex items-center justify-between pb-5 border-b border-[#1A2130] mb-5">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-desktop text-[#A855F7]" /> Sessões Ativas
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                {sessions.length} {sessions.length === 1 ? 'sessão ativa' : 'sessões ativas'}
              </p>
            </div>
            {sessions.length > 0 && (
              <button
                onClick={handleRevokeAllSessions}
                className="px-4 py-2 bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-xs font-mono font-bold rounded-lg transition-all"
              >
                <i className="fa-solid fa-power-off mr-1.5 text-[10px]" /> Terminar Todas
              </button>
            )}
          </div>

          <div className="space-y-3">
            {sessionsLoading && (
              <div className="text-center text-gray-500 font-mono text-xs py-8">
                <i className="fa-solid fa-spinner animate-spin mr-2" /> A carregar…
              </div>
            )}
            {!sessionsLoading && sessions.length === 0 && (
              <div className="text-center text-gray-500 font-mono text-xs py-8">Nenhuma sessão ativa.</div>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl bg-black/40 border border-[#1A2130] flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      s.is_current
                        ? 'bg-[#00FF66]/10 border border-[#00FF66]/20 text-[#00FF66]'
                        : 'bg-[#11151E] border border-[#1A2130] text-gray-400'
                    }`}
                  >
                    <i className={`fa-solid ${deviceIcon(s.user_agent)} text-xs`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">
                        {s.user_name || s.user_email || 'Sessão'}
                      </p>
                      {s.is_current && (
                        <span className="px-1.5 py-0.5 rounded bg-[#00FF66]/10 text-[#00FF66] border border-[#00FF66]/30 text-[8px] font-mono font-bold">
                          ATUAL
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-gray-500 mt-0.5">{deviceLabel(s.user_agent)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-gray-500">{s.ip || '—'}</span>
                  <span className="text-[10px] font-mono text-gray-500">
                    {timeAgo(s.last_active_at || s.created_at)}
                  </span>
                  {!s.is_current && (
                    <button
                      onClick={() => handleRevokeSession(s)}
                      className="text-gray-500 hover:text-[#FF2E54] transition-colors"
                      aria-label="Terminar sessão"
                    >
                      <i className="fa-solid fa-xmark text-xs" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ SYSTEM ============ */}
      {tab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="cyber-card admin-card rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2">
              <i className="fa-solid fa-sliders text-[#A855F7]" /> Configurações Globais
            </h3>
            <div className="divide-y divide-[#1A2130]/60">
              {[
                { k: 'maintenance' as const, title: 'Modo de Manutenção', desc: 'Bloqueia acesso de utilizadores não-admin.' },
                { k: 'audit' as const, title: 'Registo de Auditoria', desc: 'Registar todas as ações administrativas.' },
                { k: 'backup' as const, title: 'Backup Automático', desc: 'Backup diário às 03:00 (UTC).' },
                { k: 'ratelimit' as const, title: 'Rate Limiting Global', desc: 'Limitar pedidos por IP à API pública.' },
                { k: 'debug' as const, title: 'Debug Mode', desc: 'Expõe logs detalhados (não recomendado em produção).' },
              ].map((item) => (
                <div key={item.k} className="setting-row flex items-center justify-between">
                  <div className="pr-4">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                  <div
                    onClick={() => handleToggle(item.k)}
                    className={`toggle-switch ${systemToggles[item.k] ? 'active' : ''}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="cyber-card admin-card rounded-2xl p-6">
            <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2">
              <i className="fa-solid fa-bolt text-[#A855F7]" /> Ações Administrativas
            </h3>
            <div className="space-y-3">
              {[
                { k: 'backup', icon: 'fa-database', color: '#00FF66', title: 'Executar Backup Agora', desc: 'Cópia completa para S3', msg: 'Iniciar backup completo?' },
                { k: 'cache', icon: 'fa-broom', color: '#00B0FF', title: 'Limpar Cache Global', desc: 'Invalida todos os caches', msg: 'Invalidar todos os caches?' },
                { k: 'restart', icon: 'fa-rotate', color: '#FFC107', title: 'Reiniciar Serviços', desc: 'Rolling restart sem downtime', msg: 'Reiniciar serviços agora?' },
                { k: 'migrate', icon: 'fa-arrow-up-from-bracket', color: '#A855F7', title: 'Aplicar Migrações DB', desc: 'Sincronizar schema', msg: 'Aplicar migrações?' },
              ].map((a) => (
                <button
                  key={a.k}
                  onClick={() => handleAdminAction(a.k, a.title, a.msg)}
                  className="w-full p-3.5 rounded-xl bg-[#11151E] hover:bg-[#11151E]/80 border border-[#1A2130] hover:border-[#00FF66] transition-all text-left flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center border"
                      style={{ background: `${a.color}15`, borderColor: `${a.color}33`, color: a.color }}
                    >
                      <i className={`fa-solid ${a.icon} text-sm`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{a.title}</p>
                      <p className="text-[10px] font-mono text-gray-500">{a.desc}</p>
                    </div>
                  </div>
                  <i className="fa-solid fa-arrow-right text-gray-500 group-hover:text-[#00FF66] transition-colors text-xs" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ LOGS ============ */}
      {tab === 'logs' && (
        <div className="cyber-card admin-card rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#1A2130]">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <i className="fa-solid fa-terminal text-[#A855F7]" /> Logs do Sistema
              </h3>
              <p className="text-xs text-gray-400 mt-1">{logsTotal} eventos</p>
            </div>
            <select
              value={logsLevel}
              onChange={(e) => setLogsLevel(e.target.value)}
              className="neon-input px-3 py-1.5 rounded-lg text-xs font-mono text-white"
            >
              <option value="">Todos</option>
              <option value="info">INFO</option>
              <option value="warn">WARN</option>
              <option value="error">ERROR</option>
            </select>
          </div>

          <div className="p-4 font-mono text-xs space-y-1 max-h-[500px] overflow-y-auto bg-black/60">
            {logsLoading && (
              <div className="text-center text-gray-500 py-8">
                <i className="fa-solid fa-spinner animate-spin mr-2" /> A carregar…
              </div>
            )}
            {!logsLoading && logs.length === 0 && <div className="text-center text-gray-500 py-8">Sem logs.</div>}
            {logs.map((l) => {
              const ts = l.created_at ? new Date(l.created_at) : null;
              const time = ts
                ? `${ts.toLocaleTimeString('pt-PT')}.${String(ts.getMilliseconds()).padStart(3, '0')}`
                : '—';
              const lvl = (l.level || (l.action || '').split('.')[0] || 'INFO').toUpperCase();
              const color =
                lvl === 'ERROR' || lvl === 'CRITICAL'
                  ? 'text-[#FF2E54]'
                  : lvl === 'WARN' || lvl === 'WARNING'
                  ? 'text-[#FFC107]'
                  : lvl === 'DEBUG'
                  ? 'text-gray-500'
                  : 'text-[#00FF66]';
              return (
                <div key={l.id} className="flex gap-3 py-1">
                  <span className="text-gray-600 shrink-0">{time}</span>
                  <span className={`shrink-0 ${color}`}>[{lvl}]</span>
                  <span className="text-gray-300">{l.message || l.action || '—'}</span>
                </div>
              );
            })}
          </div>

          <div className="px-6 py-3.5 border-t border-[#1A2130] bg-black/20 flex items-center justify-between text-[10px] font-mono text-gray-500">
            <span>{logs.length} de {logsTotal}</span>
            <span className="flex items-center gap-2">
              <button
                onClick={() => loadLogs(Math.max(1, logsPage - 1), logsLevel)}
                disabled={logsPage <= 1}
                className="px-2 py-1 rounded bg-[#11151E] border border-[#1A2130] hover:border-[#00FF66] disabled:opacity-40"
              >
                <i className="fa-solid fa-chevron-left text-[8px]" />
              </button>
              <span className="text-white">{logsPage} / {logsTotalPages}</span>
              <button
                onClick={() => loadLogs(Math.min(logsTotalPages, logsPage + 1), logsLevel)}
                disabled={logsPage >= logsTotalPages}
                className="px-2 py-1 rounded bg-[#11151E] border border-[#1A2130] hover:border-[#00FF66] disabled:opacity-40"
              >
                <i className="fa-solid fa-chevron-right text-[8px]" />
              </button>
            </span>
          </div>
        </div>
      )}

      {/* ============ DANGER ============ */}
      {tab === 'danger' && (
        <div className="cyber-card danger-card rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-3 pb-5 border-b border-[#FF2E54]/30 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#FF2E54]/10 border border-[#FF2E54]/30 flex items-center justify-center text-[#FF2E54]">
              <i className="fa-solid fa-triangle-exclamation text-base" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#FF2E54]">Zona de Perigo</h3>
              <p className="text-xs text-gray-400 font-mono">Ações irreversíveis de nível ROOT</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { k: 'purge-logs', title: 'Purgar Logs', desc: 'Elimina logs com mais de 30 dias.', label: 'Executar', icon: 'fa-broom', critical: false, confirm: false },
              { k: 'factory-reset', title: 'Repor Sistema de Fábrica', desc: 'Restaura estado inicial. Perda total de dados.', label: 'Repor', icon: 'fa-rotate-left', critical: false, confirm: true },
            ].map((d) => (
              <div
                key={d.k}
                className={`p-4 rounded-xl bg-black/40 border ${
                  d.critical ? 'border-[#FF2E54]/40' : 'border-[#1A2130]'
                } flex flex-col md:flex-row md:items-center justify-between gap-3`}
              >
                <div>
                  <p className={`text-sm font-semibold mb-1 ${d.critical ? 'text-[#FF2E54]' : 'text-white'}`}>
                    {d.title}
                  </p>
                  <p className="text-xs text-gray-400">{d.desc}</p>
                </div>
                <button
                  onClick={() => handleDangerAction(d.k, d.title, d.desc, d.confirm)}
                  className={`px-4 py-2.5 border text-xs font-mono font-bold rounded-lg transition-all whitespace-nowrap ${
                    d.critical
                      ? 'bg-[#FF2E54] hover:bg-red-600 text-white border-[#FF2E54]'
                      : 'bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border-[#FF2E54]/30 text-[#FF2E54]'
                  }`}
                >
                  <i className={`fa-solid ${d.icon} mr-1.5 text-[10px]`} /> {d.label}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ MODAL CONFIRMAÇÃO ============ */}
      <Modal
        open={!!confirmCfg}
        onClose={() => !confirmBusy && setConfirmCfg(null)}
        title={confirmCfg?.title || 'CONFIRMAR AÇÃO'}
        icon="fa-circle-question"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              onClick={() => setConfirmCfg(null)}
              disabled={confirmBusy}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={
                confirmBusy ||
                (confirmCfg?.requireInput ? confirmInput.trim().toUpperCase() !== 'CONFIRMAR' : false)
              }
              className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {confirmBusy && <i className="fa-solid fa-spinner animate-spin" />}
              {confirmBusy ? 'A executar…' : 'Executar'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p
            className="text-xs text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: confirmCfg?.message || '' }}
          />
          {confirmCfg?.requireInput && (
            <div>
              <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Escreve <span className="text-[#FF2E54] font-bold">CONFIRMAR</span>:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="CONFIRMAR"
                disabled={confirmBusy}
                className="neon-input w-full px-4 py-2.5 rounded-lg text-sm text-white font-mono disabled:opacity-50"
              />
            </div>
          )}
        </div>
      </Modal>

      <NewUserModal open={newUserOpen} onClose={() => setNewUserOpen(false)} onSubmit={handleCreateUser} />
      <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSubmit={handleEditUser} />
    </>
  );
};

// ============================================
// MODAL: Novo utilizador
// ============================================
function NewUserModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, email: string, role: AdminRole) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('VIEWER');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setRole('VIEWER');
      setErr('');
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!email.trim()) {
      setErr('Email é obrigatório.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(name.trim(), email.trim().toLowerCase(), role);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="NOVO UTILIZADOR"
      icon="fa-user-plus"
      iconColor="text-[#A855F7]"
      maxWidth="max-w-md"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 bg-[#A855F7] hover:bg-purple-600 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting && <i className="fa-solid fa-spinner animate-spin" />}
            {submitting ? 'A criar…' : 'Criar Utilizador'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {err && (
          <div className="p-2 rounded bg-[#FF2E54]/10 border border-[#FF2E54]/30 text-[#FF2E54] text-[11px] font-mono">
            {err}
          </div>
        )}
        <div>
          <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Nome Completo
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="João Silva"
            className="neon-input w-full px-4 py-3 rounded-lg text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="joao.silva@sentinel.sec"
            required
            className="neon-input w-full px-4 py-3 rounded-lg text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Função
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            className="neon-select w-full px-4 py-3 rounded-lg text-sm font-mono"
          >
            <option value="VIEWER">Viewer</option>
            <option value="ANALYST">Analyst</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// MODAL: Editar utilizador
// ============================================
function EditUserModal({
  user,
  onClose,
  onSubmit,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
  onSubmit: (id: number, role: AdminRole, isActive: boolean, name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('VIEWER');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setRole((user.role as AdminRole) || 'VIEWER');
      setIsActive(user.is_active !== false);
      setSubmitting(false);
    }
  }, [user]);

  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(user.id, role, isActive, name.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="EDITAR UTILIZADOR"
      icon="fa-user-pen"
      iconColor="text-[#A855F7]"
      maxWidth="max-w-md"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 bg-[#A855F7] hover:bg-purple-600 text-white text-xs font-mono font-bold rounded-xl disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting && <i className="fa-solid fa-spinner animate-spin" />}
            {submitting ? 'A guardar…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Email
          </label>
          <input
            type="email"
            value={user.email}
            disabled
            className="neon-input w-full px-4 py-3 rounded-lg text-sm text-gray-400 bg-black/40 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="neon-input w-full px-4 py-3 rounded-lg text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Função
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            className="neon-select w-full px-4 py-3 rounded-lg text-sm font-mono"
          >
            <option value="VIEWER">Viewer</option>
            <option value="ANALYST">Analyst</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded border-[#1A2130] bg-black accent-[#00FF66]"
          />
          <span className="text-xs text-gray-300">Conta ativa</span>
        </label>
      </form>
    </Modal>
  );
}

export default Admin;