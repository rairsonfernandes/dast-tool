import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/layouts/DashboardLayout';
import { getUser, clearAuth, setUser as persistUser, type User } from '@/lib/auth';
import { api } from '@/lib/api';
import Modal from '@/components/dashboard/Modal';
import AvatarUploader from '@/components/ui/AvatarUploader';
import './Account.css';

// ============================================
// TIPOS
// ============================================
interface ProfileForm {
  name: string;
  email: string;
  job_title: string;
  phone: string;
  department: string;
}

interface Session {
  id: string | number;
  device?: string;
  ip?: string;
  ip_address?: string;
  location?: string;
  user_agent?: string;
  last_active_at?: string;
  created_at?: string;
  is_current?: boolean;
}

interface ApiKeyRow {
  id: string | number;
  name: string;
  key_prefix?: string;
  key_last_chars?: string;
  key_preview?: string;
  permissions?: string;
  created_at?: string;
  revoked_at?: string | null;
}

// ============================================
// HELPERS
// ============================================
function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function timeAgo(iso?: string): string {
  if (!iso) return 'agora';
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
    return 'agora';
  }
}

function deviceIcon(ua?: string): string {
  const s = (ua || '').toLowerCase();
  if (s.includes('iphone') || s.includes('android') || s.includes('mobile')) return 'fa-mobile-screen';
  if (s.includes('ipad') || s.includes('tablet')) return 'fa-tablet-screen-button';
  return 'fa-laptop';
}

function deviceLabel(ua?: string): string {
  if (!ua) return 'Dispositivo desconhecido';
  const s = ua.toLowerCase();
  const os = s.includes('windows')
    ? 'Windows'
    : s.includes('mac os') || s.includes('macintosh')
    ? 'macOS'
    : s.includes('iphone')
    ? 'iPhone'
    : s.includes('ipad')
    ? 'iPad'
    : s.includes('android')
    ? 'Android'
    : s.includes('linux')
    ? 'Linux'
    : 'Desconhecido';
  const browser = s.includes('chrome')
    ? 'Chrome'
    : s.includes('firefox')
    ? 'Firefox'
    : s.includes('safari')
    ? 'Safari'
    : s.includes('edge')
    ? 'Edge'
    : '';
  return browser ? `${os} · ${browser}` : os;
}

function roleLabel(role?: string): string {
  if (!role) return 'USER';
  return role.replace(/_/g, ' ').toUpperCase();
}

/**
 * Normaliza o user devolvido pelo backend:
 * - se vier `avatar_url` mas não `avatar`, copia
 * - garante que `avatar` está disponível
 */
function normalizeUser(raw: any): User {
  const u: User = { ...raw };
  if (!u.avatar && u.avatar_url) u.avatar = u.avatar_url;
  return u;
}

// ============================================
// COMPONENTE
// ============================================
const Account = () => {
  const nav = useNavigate();
  const { showToast } = useToast();

  const [user, setUserState] = useState<User | null>(() => {
    const u = getUser() as User | null;
    return u ? normalizeUser(u) : null;
  });
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<ProfileForm>({
    name: '',
    email: '',
    job_title: '',
    phone: '',
    department: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);

  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [newKeyModalOpen, setNewKeyModalOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Session | null>(null);
  const [revokeKeyTarget, setRevokeKeyTarget] = useState<ApiKeyRow | null>(null);
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);

  // ============================================
  // Aplicar user em todo o lado
  // ============================================
  const applyUser = useCallback((raw: any) => {
    const u = normalizeUser(raw);
    setUserState(u);
    try {
      persistUser(u);   // grava no localStorage + emite `sentinel:auth` → Topbar atualiza
    } catch {
      /* noop */
    }
  }, []);

  // ============================================
  // FETCH
  // ============================================
  const loadProfile = useCallback(async () => {
    try {
      const { data } = await api.get<User>('/api/auth/me');
      applyUser(data);
      setForm({
        name: data.name || '',
        email: data.email || '',
        job_title: (data as any).job_title || '',
        phone: (data as any).phone || '',
        department: (data as any).department || '',
      });
    } catch {
      // mantém user do storage
    }
  }, [applyUser]);

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get<Session[] | { items: Session[] }>('/api/auth/me/sessions');
      const list = Array.isArray(data) ? data : data.items ?? [];
      setSessions(list);
    } catch {
      setSessions([]);
    }
  }, []);

  const loadKeys = useCallback(async () => {
    try {
      const { data } = await api.get<ApiKeyRow[] | { items: ApiKeyRow[] }>('/api/auth/me/api-keys');
      const list = Array.isArray(data) ? data : data.items ?? [];
      setApiKeys(list);
    } catch {
      setApiKeys([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadProfile(), loadSessions(), loadKeys()]);
      setLoading(false);
    })();
  }, [loadProfile, loadSessions, loadKeys]);

  // ============================================
  // AÇÕES: perfil
  // ============================================
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      showToast('Nome e email são obrigatórios.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        department: form.department.trim() || null,
        job_title: form.job_title.trim() || null,
      };
      if (form.email.trim().toLowerCase() !== (user?.email || '').toLowerCase()) {
        payload.email = form.email.trim().toLowerCase();
      }
      const { data } = await api.patch<User>('/api/auth/me', payload);
      applyUser(data);
      setForm((f) => ({ ...f, email: data.email }));
      showToast('Perfil atualizado com sucesso.', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao guardar perfil.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleResetForm = () => {
    setForm({
      name: user?.name || '',
      email: user?.email || '',
      job_title: (user as any)?.job_title || '',
      phone: (user as any)?.phone || '',
      department: (user as any)?.department || '',
    });
  };

  // ============================================
  // AÇÕES: avatar (onUpdated do AvatarUploader)
  // ============================================
  const handleAvatarUpdated = useCallback(
    (updated: User) => {
      applyUser(updated);
      showToast('Foto atualizada.', 'success');
    },
    [applyUser, showToast],
  );

  // ============================================
  // AÇÕES: password
  // ============================================
  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      showToast('Password alterada.', 'success');
      setPwModalOpen(false);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Erro ao alterar password.', 'error');
    }
  };

  // ============================================
  // AÇÕES: eliminar conta
  // ============================================
  const handleDeleteAccount = async () => {
    try {
      await api.delete('/api/auth/account', { headers: { 'X-Confirm-Delete': 'yes' } });
      clearAuth();
      showToast('Conta eliminada.', 'success');
      setTimeout(() => nav('/login'), 800);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao eliminar conta.', 'error');
    }
  };

  // ============================================
  // AÇÕES: sessões
  // ============================================
  const handleRevokeSession = async (s: Session) => {
    try {
      await api.delete(`/api/auth/me/sessions/${s.id}`);
      showToast('Sessão terminada.', 'success');
      setRevokeTarget(null);
      await loadSessions();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao terminar sessão.', 'error');
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      await api.delete('/api/auth/me/sessions');
      showToast('Todas as sessões (exceto a atual) foram terminadas.', 'success');
      await loadSessions();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao terminar sessões.', 'error');
    }
  };

  // ============================================
  // AÇÕES: chaves
  // ============================================
  const handleCreateKey = async (name: string, permissions: string) => {
    try {
      const { data } = await api.post('/api/auth/me/api-keys', { name, permissions });
      setCreatedKey({ name: data.name, key: data.key });
      showToast('Chave criada. Copia-a agora.', 'success');
      setNewKeyModalOpen(false);
      await loadKeys();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao criar chave.', 'error');
    }
  };

  const handleRevokeKey = async (k: ApiKeyRow) => {
    try {
      await api.delete(`/api/auth/me/api-keys/${k.id}`);
      showToast('Chave revogada.', 'success');
      setRevokeKeyTarget(null);
      await loadKeys();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao revogar chave.', 'error');
    }
  };

  const copyToClipboard = async (text: string, label = 'Copiado.') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label, 'info');
    } catch {
      showToast('Não foi possível copiar.', 'error');
    }
  };

  // ============================================
  // DERIVADOS
  // ============================================
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Utilizador';
  const memberSince = useMemo(() => fmtDate((user as any)?.created_at), [user]);

  // ============================================
  // RENDER
  // ============================================
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 font-mono text-xs">
        <i className="fa-solid fa-spinner animate-spin mr-2" /> A carregar perfil…
      </div>
    );
  }

  return (
    <>
      {/* Título */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Perfil do Utilizador</h2>
          <p className="text-sm text-gray-400 mt-1">
            Gerencie as suas credenciais, sessões e chaves de acesso.
          </p>
        </div>
      </div>

      {/* CARTÃO DE PERFIL */}
      <div className="cyber-card rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#00FF66]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 relative">
          <AvatarUploader user={user} onUpdated={handleAvatarUpdated} />

          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-2">
              <h3 className="text-2xl font-bold text-white">{displayName}</h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00FF66]/10 border border-[#00FF66]/30 text-[#00FF66] text-[10px] font-mono font-bold tracking-wider self-center md:self-auto w-fit mx-auto md:mx-0">
                <i className="fa-solid fa-shield-halved text-[9px]" /> {roleLabel(user?.role)}
              </span>
            </div>
            {((user as any)?.job_title || (user as any)?.department) && (
              <p className="text-sm font-mono text-gray-400 mb-1">
                {[(user as any)?.job_title, (user as any)?.department].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="text-xs font-mono text-gray-500 mb-4">{user?.email || '—'}</p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 bg-[#11151E] px-3 py-1.5 rounded-lg border border-[#1A2130]">
                <i className="fa-solid fa-calendar text-gray-500 text-[10px]" />
                Membro desde {memberSince}
              </div>
              {user?.provider && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 bg-[#11151E] px-3 py-1.5 rounded-lg border border-[#1A2130]">
                  <i className="fa-brands fa-google text-gray-500 text-[10px]" />
                  Login via {user.provider}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#00FF66] bg-[#00FF66]/10 px-3 py-1.5 rounded-lg border border-[#00FF66]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66] pulse-dot" />
                ONLINE
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GRID: INFO PESSOAIS + SEGURANÇA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info pessoais */}
        <div className="lg:col-span-2 cyber-card rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-3 pb-5 border-b border-[#1A2130] mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
              <i className="fa-solid fa-user-pen text-base" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Informações Pessoais</h3>
              <p className="text-xs text-gray-400 font-mono">Dados básicos da conta</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="neon-input w-full px-4 py-3 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Cargo
                </label>
                <input
                  type="text"
                  value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  placeholder="Ex.: Security Analyst"
                  className="neon-input w-full px-4 py-3 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fa-solid fa-envelope text-gray-500 text-xs" />
                  </div>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="neon-input w-full pl-10 pr-4 py-3 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Telefone
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fa-solid fa-phone text-gray-500 text-xs" />
                  </div>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="neon-input w-full pl-10 pr-4 py-3 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Departamento
              </label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="Ex.: Security Operations Center"
                className="neon-input w-full px-4 py-3 rounded-lg text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1A2130]">
              <button
                type="button"
                onClick={handleResetForm}
                disabled={savingProfile}
                className="px-5 py-2.5 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="px-6 py-2.5 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] disabled:opacity-50 flex items-center gap-2"
              >
                {savingProfile ? (
                  <i className="fa-solid fa-spinner animate-spin" />
                ) : (
                  <i className="fa-solid fa-floppy-disk" />
                )}
                {savingProfile ? 'A guardar…' : 'Guardar Alterações'}
              </button>
            </div>
          </form>
        </div>

        {/* Segurança */}
        <div className="cyber-card rounded-2xl p-6 md:p-8 flex flex-col">
          <div className="flex items-center gap-3 pb-5 border-b border-[#1A2130] mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
              <i className="fa-solid fa-lock text-base" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Segurança</h3>
              <p className="text-xs text-gray-400 font-mono">Estado da conta</p>
            </div>
          </div>

          <div className="space-y-3 flex-1">
            {/* Password */}
            <div className="session-item rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center text-[#00FF66] shrink-0">
                  <i className="fa-solid fa-key text-xs" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Password</p>
                  <p className="text-[10px] font-mono text-gray-500">
                    {user?.provider ? 'Conta OAuth' : 'Definida'}
                  </p>
                </div>
              </div>
              {!user?.provider && (
                <button
                  onClick={() => setPwModalOpen(true)}
                  className="text-[#00FF66] hover:text-[#00E676] text-[10px] font-mono font-bold"
                >
                  Alterar
                </button>
              )}
            </div>

            {/* Método de login */}
            <div className="session-item rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center text-[#00FF66] shrink-0">
                  <i className="fa-solid fa-envelope-circle-check text-xs" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Método de login</p>
                  <p className="text-[10px] font-mono text-gray-500">
                    {user?.provider ? `OAuth · ${user.provider}` : 'Email + password'}
                  </p>
                </div>
              </div>
              <i className="fa-solid fa-circle-check text-[#00FF66] text-sm" />
            </div>

            {/* Role */}
            <div className="session-item rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center text-[#00FF66] shrink-0">
                  <i className="fa-solid fa-user-shield text-xs" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Role</p>
                  <p className="text-[10px] font-mono text-gray-500">{roleLabel(user?.role)}</p>
                </div>
              </div>
            </div>

            {/* Estado */}
            <div className="session-item rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center text-[#00FF66] shrink-0">
                  <i className="fa-solid fa-toggle-on text-xs" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Estado</p>
                  <p className="text-[10px] font-mono text-gray-500">
                    {user?.is_active === false ? 'Inativo' : 'Ativo'}
                  </p>
                </div>
              </div>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  user?.is_active === false ? 'bg-gray-500' : 'bg-[#00FF66] animate-pulse'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* CHAVES DE API */}
      <div className="cyber-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center justify-between pb-5 border-b border-[#1A2130] mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
              <i className="fa-solid fa-key text-base" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Chaves de API</h3>
              <p className="text-xs text-gray-400 font-mono">
                {apiKeys.length} {apiKeys.length === 1 ? 'chave ativa' : 'chaves ativas'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setNewKeyModalOpen(true)}
            className="px-4 py-2 bg-[#00FF66]/10 hover:bg-[#00FF66] hover:text-black border border-[#00FF66]/30 text-[#00FF66] text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-plus text-[10px]" /> Nova Chave
          </button>
        </div>

        <div className="space-y-3">
          {apiKeys.length === 0 && (
            <p className="text-center text-gray-500 font-mono text-xs py-8">
              Ainda não tens chaves de API. Cria a primeira acima.
            </p>
          )}
          {apiKeys.map((k) => {
            const masked =
              k.key_preview ||
              `${k.key_prefix ?? 'sk_'}${'•'.repeat(16)}${k.key_last_chars ?? '••••'}`;
            return (
              <div
                key={k.id}
                className="session-item rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#00FF66]/10 border-[#00FF66]/20 text-[#00FF66] border flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-key text-xs" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{k.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-[10px] text-[#00FF66] px-2 py-0.5 rounded bg-[#070709]/60 border border-[#1A2130] font-mono">
                        {masked}
                      </code>
                      <span className="text-[9px] font-mono text-gray-500 px-1.5 py-0.5 rounded bg-[#11151E] border border-[#1A2130]">
                        {k.permissions || 'read'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] font-mono text-gray-500">
                    Criada {timeAgo(k.created_at)}
                  </span>
                  <button
                    onClick={() => setRevokeKeyTarget(k)}
                    className="px-3 py-1.5 bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-[10px] font-mono font-bold rounded-lg transition-all"
                  >
                    Revogar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SESSÕES ATIVAS */}
      <div className="cyber-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center justify-between pb-5 border-b border-[#1A2130] mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
              <i className="fa-solid fa-desktop text-base" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Sessões Ativas</h3>
              <p className="text-xs text-gray-400 font-mono">
                {sessions.length} {sessions.length === 1 ? 'dispositivo' : 'dispositivos'}
              </p>
            </div>
          </div>
          {sessions.filter((s) => !s.is_current).length > 0 && (
            <button
              onClick={handleRevokeAllSessions}
              className="px-3 py-1.5 bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-[10px] font-mono font-bold rounded-lg transition-all flex items-center gap-1.5"
            >
              <i className="fa-solid fa-power-off text-[9px]" /> Terminar Todas
            </button>
          )}
        </div>

        <div className="space-y-3">
          {sessions.length === 0 && (
            <p className="text-center text-gray-500 font-mono text-xs py-8">
              Nenhuma sessão registada.
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className="session-item rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg ${
                    s.is_current
                      ? 'bg-[#00FF66]/10 border-[#00FF66]/20 text-[#00FF66]'
                      : 'bg-[#11151E] border-[#1A2130] text-gray-400'
                  } border flex items-center justify-center shrink-0`}
                >
                  <i className={`fa-solid ${deviceIcon(s.user_agent)} text-xs`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">
                      {deviceLabel(s.user_agent)}
                    </p>
                    {s.is_current && (
                      <span className="px-1.5 py-0.5 rounded bg-[#00FF66]/10 text-[#00FF66] border border-[#00FF66]/30 text-[8px] font-mono font-bold tracking-wider">
                        ATUAL
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-mono text-gray-500 mt-0.5">
                    {s.location || s.ip || s.ip_address || 'IP desconhecido'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] font-mono ${
                    s.is_current ? 'text-[#00FF66]' : 'text-gray-500'
                  }`}
                >
                  {timeAgo(s.last_active_at || s.created_at)}
                </span>
                {!s.is_current && (
                  <button
                    onClick={() => setRevokeTarget(s)}
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

      {/* ZONA DE PERIGO */}
      <div className="cyber-card danger-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-3 pb-5 border-b border-[#FF2E54]/30 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#FF2E54]/10 border border-[#FF2E54]/30 flex items-center justify-center text-[#FF2E54]">
            <i className="fa-solid fa-triangle-exclamation text-base" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#FF2E54]">Zona de Perigo</h3>
            <p className="text-xs text-gray-400 font-mono">Ações irreversíveis</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-black/40 border border-[#1A2130]">
          <div>
            <p className="text-sm font-semibold text-white mb-1">Eliminar Conta</p>
            <p className="text-xs text-gray-400">
              Todos os dados, histórico de scans e relatórios serão permanentemente removidos.
            </p>
          </div>
          <button
            onClick={() => setDeleteModalOpen(true)}
            className="px-4 py-2.5 bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-xs font-mono font-bold rounded-lg transition-all whitespace-nowrap"
          >
            <i className="fa-solid fa-trash mr-1.5 text-[10px]" /> Eliminar Conta
          </button>
        </div>
      </div>

      {/* ============================================
          MODAIS
      ============================================ */}

      <ChangePasswordModal
        open={pwModalOpen}
        onClose={() => setPwModalOpen(false)}
        onSubmit={handleChangePassword}
      />

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="ELIMINAR CONTA?"
        icon="fa-triangle-exclamation"
        iconColor="text-[#FF2E54]"
        footer={
          <>
            <button
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl"
            >
              Cancelar
            </button>
            <button
              onClick={handleDeleteAccount}
              className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl"
            >
              Eliminar
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300 text-center">
          Esta ação é <strong className="text-[#FF2E54]">permanente e irreversível</strong>.
          Todos os dados serão eliminados.
        </p>
      </Modal>

      <Modal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="TERMINAR SESSÃO?"
        icon="fa-power-off"
        iconColor="text-[#FF2E54]"
        maxWidth="max-w-sm"
        footer={
          <>
            <button
              onClick={() => setRevokeTarget(null)}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl"
            >
              Cancelar
            </button>
            <button
              onClick={() => revokeTarget && handleRevokeSession(revokeTarget)}
              className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl"
            >
              Terminar
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300 text-center">
          A sessão em{' '}
          <strong className="text-white">{deviceLabel(revokeTarget?.user_agent)}</strong> será
          terminada.
        </p>
      </Modal>

      <Modal
        open={!!revokeKeyTarget}
        onClose={() => setRevokeKeyTarget(null)}
        title="REVOGAR CHAVE?"
        icon="fa-key"
        iconColor="text-[#FF2E54]"
        maxWidth="max-w-sm"
        footer={
          <>
            <button
              onClick={() => setRevokeKeyTarget(null)}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl"
            >
              Cancelar
            </button>
            <button
              onClick={() => revokeKeyTarget && handleRevokeKey(revokeKeyTarget)}
              className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl"
            >
              Revogar
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300 text-center">
          A chave <strong className="text-white">{revokeKeyTarget?.name}</strong> deixará de
          funcionar imediatamente.
        </p>
      </Modal>

      <NewApiKeyModal
        open={newKeyModalOpen}
        onClose={() => setNewKeyModalOpen(false)}
        onCreate={handleCreateKey}
      />

      <Modal
        open={!!createdKey}
        onClose={() => setCreatedKey(null)}
        title="CHAVE CRIADA"
        icon="fa-key"
        iconColor="text-[#00FF66]"
        maxWidth="max-w-md"
        footer={
          <button
            onClick={() => setCreatedKey(null)}
            className="px-4 py-2 bg-[#00FF66] text-black text-xs font-mono font-bold rounded-xl"
          >
            Entendido
          </button>
        }
      >
        {createdKey && (
          <div className="space-y-3">
            <p className="text-xs text-gray-300">
              Copia a chave <strong className="text-white">{createdKey.name}</strong> agora. Por
              segurança, <strong className="text-[#FFC107]">não será mostrada novamente</strong>.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono text-[#00FF66] px-3 py-2 rounded-lg bg-black/60 border border-[#1A2130] break-all">
                {createdKey.key}
              </code>
              <button
                onClick={() => copyToClipboard(createdKey.key, 'Chave copiada.')}
                className="px-3 py-2 bg-[#11151E] border border-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-lg hover:border-[#00FF66]"
              >
                <i className="fa-regular fa-copy" />
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

// ============================================
// MODAL: Alterar Password
// ============================================
function ChangePasswordModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (cur: string, nw: string) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setErr('');
    }
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (next.length < 8) {
      setErr('Password deve ter ≥ 8 caracteres.');
      return;
    }
    if (next !== confirm) {
      setErr('Passwords não coincidem.');
      return;
    }
    onSubmit(current, next);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ALTERAR PASSWORD"
      icon="fa-key"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#11151E] text-gray-300 text-xs font-mono font-bold rounded-xl"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            className="px-4 py-2 bg-[#00FF66] text-black text-xs font-mono font-bold rounded-xl"
          >
            Guardar
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
            Password Atual
          </label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="neon-input w-full px-4 py-3 rounded-lg text-sm"
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Nova Password
          </label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            className="neon-input w-full px-4 py-3 rounded-lg text-sm"
            placeholder="Mínimo 8 caracteres"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Confirmar
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="neon-input w-full px-4 py-3 rounded-lg text-sm"
            placeholder="Repetir password"
          />
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// MODAL: Nova chave API
// ============================================
function NewApiKeyModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, permissions: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState('read');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setPermissions('read');
      setErr('');
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) {
      setErr('Nome é obrigatório.');
      return;
    }
    setSubmitting(true);
    try {
      await onCreate(name.trim(), permissions);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="NOVA CHAVE DE API"
      icon="fa-plus"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#11151E] text-gray-300 text-xs font-mono font-bold rounded-xl"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 bg-[#00FF66] text-black text-xs font-mono font-bold rounded-xl disabled:opacity-50"
          >
            {submitting ? 'A criar…' : 'Criar'}
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
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: CI Pipeline, Zapier, …"
            className="neon-input w-full px-4 py-3 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Permissões
          </label>
          <select
            value={permissions}
            onChange={(e) => setPermissions(e.target.value)}
            className="neon-select w-full px-3 py-2.5 rounded-lg text-xs font-mono"
          >
            <option value="read">Read — só leitura</option>
            <option value="read_write">Read/Write — leitura e escrita</option>
            <option value="full">Full — acesso total</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}

export default Account;