import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/dashboard/Modal';
import { useToast } from '@/layouts/DashboardLayout';
import { api } from '@/lib/api';

// ============================================
// TIPOS
// ============================================
type ToggleKey =
  | '2fa' | 'ip-block' | 'new-device' | 'sso'
  | 'realtime' | 'daily' | 'scan-done' | 'integrations'
  | 'crawl' | 'auto-pdf';

type Channel = 'email' | 'slack' | 'telegram' | 'webhook';

interface SettingsPayload {
  language: string;
  timezone: string;
  date_format: string;
  channel: Channel;
  session_timeout: number;
  scan_profile: string;
  scan_depth: string;
  rate_limit: number;
  toggles: Record<ToggleKey, boolean>;
}

const DEFAULT_FALLBACK: SettingsPayload = {
  language: 'pt-PT',
  timezone: 'Europe/Lisbon',
  date_format: 'DD/MM/YYYY',
  channel: 'email',
  session_timeout: 30,
  scan_profile: 'owasp_top10',
  scan_depth: 'normal',
  rate_limit: 50,
  toggles: {
    '2fa': true, 'ip-block': true, 'new-device': true, sso: false,
    realtime: true, daily: true, 'scan-done': true, integrations: false,
    crawl: true, 'auto-pdf': true,
  },
};

// ============================================
// COMPONENTE
// ============================================
const Settings = () => {
  const { showToast } = useToast();

  const [settings, setSettings] = useState<SettingsPayload>(DEFAULT_FALLBACK);
  const [initial, setInitial] = useState<SettingsPayload>(DEFAULT_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testing, setTesting] = useState(false);

  // ============================================
  // FETCH
  // ============================================
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<any>('/api/settings');
      // Remove theme/density do payload se existirem (compat)
      const merged: SettingsPayload = {
        language: data.language ?? DEFAULT_FALLBACK.language,
        timezone: data.timezone ?? DEFAULT_FALLBACK.timezone,
        date_format: data.date_format ?? DEFAULT_FALLBACK.date_format,
        channel: data.channel ?? DEFAULT_FALLBACK.channel,
        session_timeout: data.session_timeout ?? DEFAULT_FALLBACK.session_timeout,
        scan_profile: data.scan_profile ?? DEFAULT_FALLBACK.scan_profile,
        scan_depth: data.scan_depth ?? DEFAULT_FALLBACK.scan_depth,
        rate_limit: data.rate_limit ?? DEFAULT_FALLBACK.rate_limit,
        toggles: { ...DEFAULT_FALLBACK.toggles, ...(data.toggles ?? {}) },
      };
      setSettings(merged);
      setInitial(merged);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Falha ao carregar definições.');
      setSettings(DEFAULT_FALLBACK);
      setInitial(DEFAULT_FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ============================================
  // DERIVADOS
  // ============================================
  const unsaved = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initial),
    [settings, initial],
  );

  // ============================================
  // AÇÕES
  // ============================================
  const update = <K extends keyof SettingsPayload>(key: K, value: SettingsPayload[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const toggle = (key: ToggleKey) => {
    setSettings((s) => ({
      ...s,
      toggles: { ...s.toggles, [key]: !s.toggles[key] },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put<any>('/api/settings', settings);
      const merged: SettingsPayload = {
        language: data.language ?? DEFAULT_FALLBACK.language,
        timezone: data.timezone ?? DEFAULT_FALLBACK.timezone,
        date_format: data.date_format ?? DEFAULT_FALLBACK.date_format,
        channel: data.channel ?? DEFAULT_FALLBACK.channel,
        session_timeout: data.session_timeout ?? DEFAULT_FALLBACK.session_timeout,
        scan_profile: data.scan_profile ?? DEFAULT_FALLBACK.scan_profile,
        scan_depth: data.scan_depth ?? DEFAULT_FALLBACK.scan_depth,
        rate_limit: data.rate_limit ?? DEFAULT_FALLBACK.rate_limit,
        toggles: { ...DEFAULT_FALLBACK.toggles, ...(data.toggles ?? {}) },
      };
      setSettings(merged);
      setInitial(merged);
      showToast('Definições guardadas com sucesso.', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao guardar definições.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const { data } = await api.post<any>('/api/settings/reset');
      const merged: SettingsPayload = {
        language: data.language ?? DEFAULT_FALLBACK.language,
        timezone: data.timezone ?? DEFAULT_FALLBACK.timezone,
        date_format: data.date_format ?? DEFAULT_FALLBACK.date_format,
        channel: data.channel ?? DEFAULT_FALLBACK.channel,
        session_timeout: data.session_timeout ?? DEFAULT_FALLBACK.session_timeout,
        scan_profile: data.scan_profile ?? DEFAULT_FALLBACK.scan_profile,
        scan_depth: data.scan_depth ?? DEFAULT_FALLBACK.scan_depth,
        rate_limit: data.rate_limit ?? DEFAULT_FALLBACK.rate_limit,
        toggles: { ...DEFAULT_FALLBACK.toggles, ...(data.toggles ?? {}) },
      };
      setSettings(merged);
      setInitial(merged);
      setResetOpen(false);
      showToast('Definições repostas aos valores predefinidos.', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao repor definições.', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data } = await api.get<any>('/api/settings');
      showToast(`Backend devolveu ${Object.keys(data).length} chaves.`, 'info');
      // eslint-disable-next-line no-console
      console.log('[Settings] GET /api/settings →', data);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao testar.', 'error');
    } finally {
      setTesting(false);
    }
  };

  // ============================================
  // ESTADOS
  // ============================================
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 font-mono text-xs">
        <i className="fa-solid fa-spinner animate-spin mr-2" /> A carregar definições…
      </div>
    );
  }

  if (error) {
    return (
      <div className="cyber-card rounded-2xl p-8 text-center">
        <i className="fa-solid fa-triangle-exclamation text-[#FF2E54] text-3xl mb-3" />
        <p className="text-white font-semibold mb-1">Não foi possível carregar as definições</p>
        <p className="text-gray-400 text-xs font-mono mb-4">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676]"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      {/* Título + ações */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Definições do Sistema</h2>
          <p className="text-sm text-gray-400 mt-1">
            Ajuste os parâmetros de segurança, notificações e preferências do SENTINEL.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-3 py-2.5 bg-[#11151E] border border-[#1A2130] text-gray-300 text-sm font-semibold rounded-lg hover:border-[#00FF66] hover:text-[#00FF66] transition-all disabled:opacity-60"
            title="Testar GET /api/settings"
          >
            {testing ? <i className="fa-solid fa-spinner animate-spin" /> : <i className="fa-solid fa-flask" />}
          </button>
          <button
            onClick={handleSave}
            disabled={!unsaved || saving}
            className="px-4 py-2.5 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <i className="fa-solid fa-spinner animate-spin" />
            ) : (
              <i className="fa-solid fa-floppy-disk" />
            )}
            {saving ? 'A guardar…' : 'Guardar Tudo'}
          </button>
        </div>
      </div>

      {/* GRID PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUNA ESQUERDA */}
        <div className="lg:col-span-2 space-y-6">
          {/* SEGURANÇA */}
          <div className="cyber-card rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 pb-5 border-b border-[#1A2130] mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
                <i className="fa-solid fa-shield-halved text-base" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Segurança</h3>
                <p className="text-xs text-gray-400 font-mono">Proteção da conta e dos dados</p>
              </div>
            </div>

            <div className="divide-y divide-[#1A2130]/60">
              {[
                { k: '2fa' as ToggleKey, title: 'Autenticação de Dois Fatores (2FA)', desc: 'Exigir código de verificação adicional no login.' },
                { k: 'ip-block' as ToggleKey, title: 'Bloqueio Automático de IP', desc: 'Ativar regras de firewall após 3 tentativas inválidas.' },
                { k: 'new-device' as ToggleKey, title: 'Alertas de Novo Dispositivo', desc: 'Receber email quando um novo dispositivo iniciar sessão.' },
                { k: 'sso' as ToggleKey, title: 'Single Sign-On (SSO)', desc: 'Integração com Google Workspace / Azure AD.' },
              ].map((item) => (
                <div key={item.k} className="setting-row flex items-center justify-between">
                  <div className="pr-4">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                  <div
                    onClick={() => toggle(item.k)}
                    role="switch"
                    aria-checked={settings.toggles[item.k]}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle(item.k);
                      }
                    }}
                    className={`toggle-switch ${settings.toggles[item.k] ? 'active' : ''}`}
                  />
                </div>
              ))}

              <div className="setting-row flex items-center justify-between">
                <div className="pr-4">
                  <p className="text-sm font-semibold text-white">Timeout de Sessão</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Encerrar sessão automaticamente após inatividade.
                  </p>
                </div>
                <select
                  value={settings.session_timeout}
                  onChange={(e) => update('session_timeout', Number(e.target.value))}
                  className="neon-select px-3 py-1.5 rounded-lg text-xs font-mono w-32"
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1 hora</option>
                  <option value={240}>4 horas</option>
                </select>
              </div>
            </div>
          </div>

          {/* NOTIFICAÇÕES */}
          <div className="cyber-card rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 pb-5 border-b border-[#1A2130] mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
                <i className="fa-solid fa-bell text-base" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Notificações</h3>
                <p className="text-xs text-gray-400 font-mono">Alertas e comunicação</p>
              </div>
            </div>

            <div className="divide-y divide-[#1A2130]/60">
              {[
                { k: 'realtime' as ToggleKey, title: 'Notificações em Tempo Real', desc: 'Alertas instantâneos de ameaças críticas.' },
                { k: 'daily' as ToggleKey, title: 'Resumo Diário por Email', desc: 'Relatório resumido de eventos enviado às 09:00.' },
                { k: 'scan-done' as ToggleKey, title: 'Alertas de Scan Concluído', desc: 'Notificar sempre que um scan terminar.' },
                { k: 'integrations' as ToggleKey, title: 'Integração Telegram / Slack', desc: 'Enviar alertas para canais externos.' },
              ].map((item) => (
                <div key={item.k} className="setting-row flex items-center justify-between">
                  <div className="pr-4">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                  <div
                    onClick={() => toggle(item.k)}
                    role="switch"
                    aria-checked={settings.toggles[item.k]}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle(item.k);
                      }
                    }}
                    className={`toggle-switch ${settings.toggles[item.k] ? 'active' : ''}`}
                  />
                </div>
              ))}

              <div className="setting-row">
                <p className="text-sm font-semibold text-white mb-2">Canal Preferido</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { c: 'email' as Channel, icon: 'fa-envelope', label: 'Email', brand: false },
                    { c: 'slack' as Channel, icon: 'fa-slack', label: 'Slack', brand: true },
                    { c: 'telegram' as Channel, icon: 'fa-telegram', label: 'Telegram', brand: true },
                    { c: 'webhook' as Channel, icon: 'fa-link', label: 'Webhook', brand: false },
                  ].map((opt) => (
                    <button
                      key={opt.c}
                      onClick={() => update('channel', opt.c)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all ${
                        settings.channel === opt.c
                          ? 'bg-[#00FF66]/15 border-[#00FF66]/40 text-[#00FF66]'
                          : 'bg-[#11151E] border-[#1A2130] text-gray-300 hover:border-[#00FF66]'
                      }`}
                    >
                      <i
                        className={`fa-${opt.brand ? 'brands' : 'solid'} ${opt.icon} mr-1.5 text-[10px]`}
                      />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SCAN PADRÃO */}
          <div className="cyber-card rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 pb-5 border-b border-[#1A2130] mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
                <i className="fa-solid fa-magnifying-glass-chart text-base" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Configuração Padrão de Scans</h3>
                <p className="text-xs text-gray-400 font-mono">Aplicado a novos scans</p>
              </div>
            </div>

            <div className="divide-y divide-[#1A2130]/60">
              <div className="setting-row flex items-center justify-between">
                <div className="pr-4">
                  <p className="text-sm font-semibold text-white">Perfil de Scan Padrão</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Aplicado automaticamente quando não especificado.
                  </p>
                </div>
                <select
                  value={settings.scan_profile}
                  onChange={(e) => update('scan_profile', e.target.value)}
                  className="neon-select px-3 py-1.5 rounded-lg text-xs font-mono w-44"
                >
                  <option value="owasp_top10">OWASP Top 10</option>
                  <option value="full">Completo</option>
                  <option value="api">API</option>
                  <option value="infra">Infraestrutura</option>
                </select>
              </div>

              <div className="setting-row flex items-center justify-between">
                <div className="pr-4">
                  <p className="text-sm font-semibold text-white">Profundidade Padrão</p>
                  <p className="text-xs text-gray-400 mt-0.5">Balanço entre rapidez e detalhe.</p>
                </div>
                <select
                  value={settings.scan_depth}
                  onChange={(e) => update('scan_depth', e.target.value)}
                  className="neon-select px-3 py-1.5 rounded-lg text-xs font-mono w-44"
                >
                  <option value="normal">Normal</option>
                  <option value="deep">Profundo</option>
                  <option value="fast">Rápido</option>
                </select>
              </div>

              {[
                { k: 'crawl' as ToggleKey, title: 'Rastrear Links Automaticamente', desc: 'Crawl de endpoints e formulários durante o scan.' },
                { k: 'auto-pdf' as ToggleKey, title: 'Gerar PDF Automaticamente', desc: 'Criar relatório PDF ao final de cada scan.' },
              ].map((item) => (
                <div key={item.k} className="setting-row flex items-center justify-between">
                  <div className="pr-4">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                  <div
                    onClick={() => toggle(item.k)}
                    role="switch"
                    aria-checked={settings.toggles[item.k]}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle(item.k);
                      }
                    }}
                    className={`toggle-switch ${settings.toggles[item.k] ? 'active' : ''}`}
                  />
                </div>
              ))}

              <div className="setting-row flex items-center justify-between">
                <div className="pr-4">
                  <p className="text-sm font-semibold text-white">Rate Limiting</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Limite de requisições por segundo para evitar bloqueios.
                  </p>
                </div>
                <select
                  value={settings.rate_limit}
                  onChange={(e) => update('rate_limit', Number(e.target.value))}
                  className="neon-select px-3 py-1.5 rounded-lg text-xs font-mono w-32"
                >
                  <option value={10}>10 req/s</option>
                  <option value={50}>50 req/s</option>
                  <option value={100}>100 req/s</option>
                  <option value={0}>Sem limite</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA */}
        <div className="lg:col-span-1 space-y-6">
          {/* IDIOMA & REGIÃO */}
          <div className="cyber-card rounded-2xl p-6">
            <div className="flex items-center gap-3 pb-5 border-b border-[#1A2130] mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
                <i className="fa-solid fa-globe text-base" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Idioma & Região</h3>
                <p className="text-xs text-gray-400 font-mono">Localização</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Idioma
                </label>
                <select
                  value={settings.language}
                  onChange={(e) => update('language', e.target.value)}
                  className="neon-select w-full px-3 py-2 rounded-lg text-xs font-mono"
                >
                  <option value="pt-PT">Português (PT)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español</option>
                  <option value="fr-FR">Français</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Fuso Horário
                </label>
                <select
                  value={settings.timezone}
                  onChange={(e) => update('timezone', e.target.value)}
                  className="neon-select w-full px-3 py-2 rounded-lg text-xs font-mono"
                >
                  <option value="Europe/Lisbon">Europe/Lisbon (UTC+0)</option>
                  <option value="Europe/Madrid">Europe/Madrid (UTC+1)</option>
                  <option value="America/New_York">America/New_York (UTC-5)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Formato de Data
                </label>
                <select
                  value={settings.date_format}
                  onChange={(e) => update('date_format', e.target.value)}
                  className="neon-select w-full px-3 py-2 rounded-lg text-xs font-mono"
                >
                  <option value="DD/MM/YYYY">DD/MM/AAAA</option>
                  <option value="MM/DD/YYYY">MM/DD/AAAA</option>
                  <option value="YYYY-MM-DD">AAAA-MM-DD</option>
                </select>
              </div>
            </div>
          </div>

          {/* RESET */}
          <div className="cyber-card rounded-2xl p-6">
            <div className="flex items-center gap-3 pb-5 border-b border-[#1A2130] mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#FFC107]/10 border border-[#FFC107]/30 flex items-center justify-center text-[#FFC107]">
                <i className="fa-solid fa-rotate-left text-base" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Repor Definições</h3>
                <p className="text-xs text-gray-400 font-mono">Valores originais</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Repor todas as definições do sistema para os valores predefinidos.
            </p>
            <button
              onClick={() => setResetOpen(true)}
              className="w-full py-2.5 bg-[#FFC107]/10 hover:bg-[#FFC107] hover:text-black border border-[#FFC107]/30 text-[#FFC107] text-xs font-mono font-bold rounded-lg transition-all"
            >
              <i className="fa-solid fa-rotate-left mr-1.5 text-[10px]" /> Repor Definições
            </button>
          </div>
        </div>
      </div>

      {/* BOTÃO GUARDAR (sticky bottom) */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#11151E]/50 border border-[#1A2130]">
        <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
          <i className="fa-solid fa-circle-info text-[#00FF66] text-[10px]" />
          <span className={unsaved ? 'text-[#FFC107]' : ''}>
            {unsaved
              ? 'Tem alterações não guardadas.'
              : 'Nenhuma alteração desde a última gravação.'}
          </span>
        </p>
        <button
          onClick={handleSave}
          disabled={!unsaved || saving}
          className="px-5 py-2.5 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <i className="fa-solid fa-spinner animate-spin" />
          ) : (
            <i className="fa-solid fa-floppy-disk" />
          )}
          {saving ? 'A guardar…' : 'Guardar Alterações'}
        </button>
      </div>

      {/* MODAL RESET */}
      <Modal
        open={resetOpen}
        onClose={() => !resetting && setResetOpen(false)}
        title="REPOR DEFINIÇÕES?"
        icon="fa-rotate-left"
        iconColor="text-[#FFC107]"
        maxWidth="max-w-sm"
        footer={
          <>
            <button
              onClick={() => setResetOpen(false)}
              disabled={resetting}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="px-4 py-2 bg-[#FFC107] hover:bg-amber-500 text-black text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50"
            >
              {resetting ? 'A repor…' : 'Repor'}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300 text-center">
          Todas as definições voltarão aos valores predefinidos.
        </p>
      </Modal>
    </>
  );
};

export default Settings;