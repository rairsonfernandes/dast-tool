import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/layouts/DashboardLayout';
import Modal from '@/components/dashboard/Modal';
import { api } from '@/lib/api';

// ============================================
// TIPOS
// ============================================
type ApiScanStatus = 'queued' | 'pending' | 'running' | 'completed' | 'failed' | 'paused';

interface ApiScan {
  id: string;
  url: string;
  target_url?: string;
  status: ApiScanStatus;
  profile?: string;
  score?: number | null;
  progress?: number;
  created_at: string;
  duration_seconds?: number | null;
  result?: { vulnerabilities?: { severity?: string; type?: string; description?: string }[] } | null;
}

interface ScanRow {
  id: string;
  target: string;
  url: string;
  profile: string;
  status: ApiScanStatus;
  date: string;
  score: number | null;
  progress: number;
  vulnCount: number;
}

interface DashboardStats {
  totalScans: number;
  completedScans: number;
  activeScans: number;
  failedScans: number;
  findings: { severity: string; count: number }[];
}

// ============================================
// HELPERS
// ============================================
function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

const STATUS_LABEL: Record<ApiScanStatus, string> = {
  queued: 'Em fila',
  pending: 'Pendente',
  running: 'Em curso',
  completed: 'Concluído',
  failed: 'Falhou',
  paused: 'Pausado',
};

const STATUS_STYLE: Record<ApiScanStatus, { bg: string; text: string; dot: string; border: string }> = {
  queued:    { bg: 'bg-gray-500/10',   text: 'text-gray-400',   dot: 'bg-gray-400',              border: 'border-gray-500/30' },
  pending:   { bg: 'bg-[#FFC107]/10', text: 'text-[#FFC107]', dot: 'bg-[#FFC107]',              border: 'border-[#FFC107]/30' },
  running:   { bg: 'bg-[#FFC107]/10', text: 'text-[#FFC107]', dot: 'bg-[#FFC107] pulse-dot',    border: 'border-[#FFC107]/30' },
  completed: { bg: 'bg-[#00FF66]/10', text: 'text-[#00FF66]', dot: 'bg-[#00FF66]',              border: 'border-[#00FF66]/30' },
  failed:    { bg: 'bg-[#FF2E54]/10', text: 'text-[#FF2E54]', dot: 'bg-[#FF2E54]',              border: 'border-[#FF2E54]/30' },
  paused:    { bg: 'bg-gray-500/10',   text: 'text-gray-400',   dot: 'bg-gray-400',              border: 'border-gray-500/30' },
};

// ============================================
// COMPONENTE
// ============================================
const Scans = () => {
  const nav = useNavigate();
  const { showToast } = useToast();

  const [scans, setScans] = useState<ScanRow[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form
  const [url, setUrl] = useState('');
  const [profile, setProfile] = useState('full');
  const [depth, setDepth] = useState('normal');
  const [optAuth, setOptAuth] = useState(false);
  const [optCookies, setOptCookies] = useState('');
  const [showCookies, setShowCookies] = useState(false);
  const [optCrawl, setOptCrawl] = useState(true);
  const [optReport, setOptReport] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Pausa/retoma em curso
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Seleção + delete
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ScanRow | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteBulkOpen, setDeleteBulkOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ============================================
  // FETCH
  // ============================================
  const mapScan = (s: ApiScan): ScanRow => ({
    id: s.id,
    target: hostOf(s.target_url || s.url),
    url: s.target_url || s.url,
    profile: s.profile || 'owasp_top10',
    status: s.status,
    date: fmtDate(s.created_at),
    score: s.score ?? null,
    progress: s.progress ?? 0,
    vulnCount: s.result?.vulnerabilities?.length ?? 0,
  });

  const fetchScans = useCallback(async () => {
    try {
      const { data } = await api.get<ApiScan[] | { items: ApiScan[] }>('/api/scans');
      const list = Array.isArray(data) ? data : data.items ?? [];
      setScans(list.map(mapScan));
    } catch (err) {
      console.warn('[Scans] falha a listar scans:', err);
      setScans([]);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get<DashboardStats>('/api/dashboard/stats');
      setStats(data);
    } catch (err) {
      console.warn('[Scans] falha a puxar stats:', err);
      setStats(null);
    }
  }, []);

  const refreshAll = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        await Promise.all([fetchScans(), fetchStats()]);
        if (!silent) showToast('Scans atualizados.', 'success');
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [fetchScans, fetchStats, showToast],
  );

  useEffect(() => {
    (async () => {
      await refreshAll(true);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================
  // AÇÕES — Criar
  // ============================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isValidUrl(trimmed)) {
      showToast('Introduz um URL válido (http:// ou https://).', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<ApiScan>('/api/scans', {
        url: trimmed,
        profile,
        depth,
        cookies: optCookies.trim() || undefined,
        options: {
          authenticated: optAuth || !!optCookies.trim(),
          crawl: optCrawl,
          auto_report: optReport,
        },
      });
      showToast(`Scan iniciado para ${trimmed}`, 'success');
      setUrl('');
      setOptAuth(false);
      setOptCookies('');
      setShowCookies(false);
      setOptCrawl(true);
      setOptReport(true);
      setScans((prev) => [mapScan(data), ...prev]);
      fetchStats();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Erro ao iniciar scan.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setUrl('');
    setProfile('full');
    setDepth('normal');
    setOptAuth(false);
    setOptCookies('');
    setShowCookies(false);
    setOptCrawl(true);
    setOptReport(true);
  };

  // ============================================
  // AÇÕES — Pausa/retoma
  // ============================================
  const handleTogglePause = async (scan: ScanRow) => {
    if (busy[scan.id]) return;
    setBusy((b) => ({ ...b, [scan.id]: true }));
    const isPaused = scan.status === 'paused';
    const endpoint = isPaused ? 'resume' : 'pause';

    try {
      const { data } = await api.post<ApiScan>(`/api/scans/${scan.id}/${endpoint}`);
      setScans((prev) =>
        prev.map((s) =>
          s.id === scan.id
            ? { ...s, status: data.status ?? (isPaused ? 'running' : 'paused') }
            : s,
        ),
      );
      showToast(isPaused ? 'Scan retomado.' : 'Scan pausado.', isPaused ? 'success' : 'info');
      fetchStats();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao alterar estado do scan.', 'error');
    } finally {
      setBusy((b) => ({ ...b, [scan.id]: false }));
    }
  };

  // ============================================
  // AÇÕES — Delete
  // ============================================
  const handleDeleteOne = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/scans/${deleteTarget.id}`);
      setScans((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      showToast('Scan eliminado.', 'success');
      setDeleteTarget(null);
      fetchStats();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao eliminar scan.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteBulk = async () => {
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      await api.delete('/api/scans/bulk', {
        data: { ids },
        headers: { 'X-Confirm-Delete': 'yes' },
      });
      setScans((prev) => prev.filter((s) => !selected.has(s.id)));
      setSelected(new Set());
      showToast(`${ids.length} scan(s) eliminado(s).`, 'success');
      setDeleteBulkOpen(false);
      fetchStats();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao eliminar scans.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      await api.delete('/api/scans', {
        headers: { 'X-Confirm-Delete': 'yes' },
      });
      setScans([]);
      setSelected(new Set());
      showToast('Todos os scans foram eliminados.', 'success');
      setDeleteAllOpen(false);
      fetchStats();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao eliminar todos os scans.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ============================================
  // SELEÇÃO
  // ============================================
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === scans.length) return new Set();
      return new Set(scans.map((s) => s.id));
    });
  };

  // ============================================
  // EXPORT
  // ============================================
  const handleExport = async () => {
    try {
      const res = await api.get('/api/scans/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `scans_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Exportação concluída.', 'success');
    } catch {
      showToast('Exportação indisponível.', 'error');
    }
  };

  // ============================================
  // DERIVADOS
  // ============================================
  const totalScans = stats?.totalScans ?? scans.length;
  const completed = stats?.completedScans ?? scans.filter((s) => s.status === 'completed').length;
  const running = stats?.activeScans ?? scans.filter((s) => s.status === 'running').length;

  const { total: vulnCount, critical: critCount, medium: medCount } = useMemo(() => {
    const f = stats?.findings ?? [];
    const get = (sev: string) => f.find((x) => x.severity.toUpperCase() === sev)?.count ?? 0;
    return {
      total: get('CRITICAL') + get('HIGH') + get('MEDIUM') + get('LOW') + get('INFO'),
      critical: get('CRITICAL'),
      medium: get('MEDIUM'),
    };
  }, [stats]);

  const successRate = totalScans > 0 ? Math.round((completed / totalScans) * 100) : 0;
  const allSelected = scans.length > 0 && selected.size === scans.length;
  const someSelected = selected.size > 0;

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      {/* Título + Atualizar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Scans de Segurança</h2>
          <p className="text-sm text-gray-400 mt-1">
            Agende, execute e acompanhe varreduras nas suas aplicações.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setDeleteAllOpen(true)}
            disabled={scans.length === 0}
            className="px-3 py-2.5 bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Eliminar todos os scans"
          >
            <i className="fa-solid fa-trash text-[10px]" />
            <span className="hidden sm:inline">Eliminar Todos</span>
          </button>
          <button
            onClick={() => refreshAll(false)}
            disabled={refreshing}
            className="px-4 py-2.5 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] flex items-center gap-2 disabled:opacity-60"
          >
            <i className={`fa-solid fa-arrows-rotate ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'A atualizar…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* 4 METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Scans Totais</span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-magnifying-glass-chart text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">{totalScans}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-calendar text-gray-500" /> Histórico completo
          </div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Concluídos</span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-circle-check text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-[#00FF66] mb-1">{completed}</div>
          <div className="text-[11px] text-[#00FF66] flex items-center gap-1 font-mono">
            <i className="fa-solid fa-arrow-trend-up" /> {successRate}% sucesso
          </div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Em Execução</span>
            <div className="w-8 h-8 rounded-lg bg-[#FFC107]/10 border border-[#FFC107]/20 flex items-center justify-center">
              <i className="fa-solid fa-spinner animate-spin text-[#FFC107] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-[#FFC107] mb-1">{running}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-clock text-gray-500" /> {running > 0 ? `${running} ativos` : 'Nenhum ativo'}
          </div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Vulnerabilidades</span>
            <div className="w-8 h-8 rounded-lg bg-[#FF2E54]/10 border border-[#FF2E54]/20 flex items-center justify-center">
              <i className="fa-solid fa-bug text-[#FF2E54] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-[#FF2E54] mb-1">{vulnCount}</div>
          <div className="text-[11px] text-[#FF2E54]/80 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-triangle-exclamation" /> {critCount} críticas · {medCount} médias
          </div>
        </div>
      </div>

      {/* NOVO SCAN */}
      <div className="cyber-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center justify-between pb-5 border-b border-[#1A2130]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
              <i className="fa-solid fa-plus text-base" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Novo Scan</h2>
              <p className="text-xs text-gray-400 font-mono">Inicie uma nova varredura de segurança</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div>
            <label className="block text-xs font-mono font-semibold text-gray-300 uppercase tracking-wider mb-2">
              URL da Aplicação <span className="text-[#FF2E54]">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fa-solid fa-link text-gray-500 text-sm" />
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://app.exemplo.com"
                autoComplete="url"
                className={`neon-input w-full pl-11 pr-4 py-3 rounded-lg text-sm font-mono text-white ${
                  url && !isValidUrl(url) ? 'border-[#FF2E54]' : url && isValidUrl(url) ? 'border-[#00FF66]' : ''
                }`}
              />
            </div>
            <p className="mt-2 text-[11px] text-gray-500 font-mono flex items-start gap-1.5 leading-relaxed">
              <i className="fa-solid fa-circle-info text-gray-600 text-[10px] mt-0.5 shrink-0" />
              <span>Apenas URLs com <span className="text-[#00FF66]">http://</span> ou <span className="text-[#00FF66]">https://</span>.</span>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono font-semibold text-gray-300 uppercase tracking-wider mb-2">Perfil de Scan</label>
              <select value={profile} onChange={(e) => setProfile(e.target.value)} className="neon-select w-full pl-4 py-3 rounded-lg text-sm font-mono text-white">
                <option value="full">Completo — OWASP Top 10</option>
                <option value="quick">Rápido — Verificações essenciais</option>
                <option value="api">API — Endpoints REST/GraphQL</option>
                <option value="infra">Infraestrutura — Headers e TLS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono font-semibold text-gray-300 uppercase tracking-wider mb-2">Profundidade</label>
              <select value={depth} onChange={(e) => setDepth(e.target.value)} className="neon-select w-full pl-4 py-3 rounded-lg text-sm font-mono text-white">
                <option value="normal">Normal — Equilibrado</option>
                <option value="deep">Profundo — Mais detalhado</option>
                <option value="fast">Rápido — Menos requisições</option>
              </select>
            </div>
          </div>

          {/* ============================================ */}
          {/* OPÇÕES AVANÇADAS                              */}
          {/* ============================================ */}
          <div className="p-4 rounded-xl bg-black/40 border border-[#1A2130] space-y-3">
            <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
              Opções Avançadas
            </p>

            {/* Autenticação */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={optAuth}
                onChange={(e) => setOptAuth(e.target.checked)}
                className="w-4 h-4 rounded border-[#1A2130] bg-black accent-[#00FF66] cursor-pointer"
              />
              <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                Incluir testes autenticados (requer credenciais)
              </span>
            </label>

            {/* Cookies (só aparecem quando optAuth está marcado) */}
            {optAuth && (
              <div className="pl-7 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCookies((v) => !v)}
                  className="text-[11px] text-[#00B0FF] hover:text-[#00FF66] font-mono transition-colors flex items-center gap-1.5"
                >
                  <i className={`fa-solid ${showCookies ? 'fa-chevron-down' : 'fa-chevron-right'} text-[9px]`} />
                  {showCookies ? 'Esconder' : 'Adicionar'} cookies de sessão
                </button>

                {showCookies && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={optCookies}
                      onChange={(e) => setOptCookies(e.target.value)}
                      placeholder="PHPSESSID=abc123; security=low"
                      className="neon-input w-full px-3 py-2 rounded-lg text-xs font-mono text-white"
                    />
                    <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
                      Formato:{' '}
                      <code className="text-[#00FF66]">nome=valor; nome2=valor2</code>.
                      Copia do DevTools → Application → Cookies após login no alvo.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Crawl */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={optCrawl}
                onChange={(e) => setOptCrawl(e.target.checked)}
                className="w-4 h-4 rounded border-[#1A2130] bg-black accent-[#00FF66] cursor-pointer"
              />
              <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                Rastrear links e endpoints automaticamente
              </span>
            </label>

            {/* Relatório PDF */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={optReport}
                onChange={(e) => setOptReport(e.target.checked)}
                className="w-4 h-4 rounded border-[#1A2130] bg-black accent-[#00FF66] cursor-pointer"
              />
              <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                Gerar relatório PDF ao concluir
              </span>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-[#1A2130]">
            <button
              type="button"
              onClick={handleReset}
              disabled={submitting}
              className="px-5 py-2.5 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
            >
              Limpar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-[#00FF66] text-black rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-spinner animate-spin text-xs" />
                  <span>A iniciar...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-play text-xs" />
                  <span>Iniciar Scan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* SCANS RECENTES */}
      <div className="cyber-card rounded-2xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 md:px-8 py-5 border-b border-[#1A2130]">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
              <i className="fa-solid fa-list-check text-[#00FF66]" /> Scans Recentes
            </h2>
            <p className="text-xs text-gray-400 mt-1">Histórico das últimas varreduras executadas.</p>
          </div>
          <div className="flex items-center gap-2">
            {someSelected && (
              <button
                onClick={() => setDeleteBulkOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-xs font-mono font-bold transition-all flex items-center gap-1.5"
              >
                <i className="fa-solid fa-trash text-[10px]" /> Eliminar ({selected.size})
              </button>
            )}
            <button
              onClick={handleExport}
              className="px-3 py-1.5 rounded-lg bg-[#11151E] border border-[#1A2130] text-xs font-mono font-bold text-gray-300 hover:border-[#00FF66] hover:text-[#00FF66] transition-all"
            >
              <i className="fa-solid fa-download mr-1.5 text-[10px]" /> Exportar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="admin-table w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/50 text-[10px] font-mono uppercase text-gray-500 tracking-wider border-b border-[#1A2130]">
                <th className="py-3.5 px-4 font-bold w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-[#1A2130] bg-black accent-[#00FF66] cursor-pointer"
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="py-3.5 px-4 font-bold">Alvo</th>
                <th className="py-3.5 px-4 font-bold">Perfil</th>
                <th className="py-3.5 px-4 font-bold">Status</th>
                <th className="py-3.5 px-4 font-bold">Data</th>
                <th className="py-3.5 px-4 font-bold">Score</th>
                <th className="py-3.5 px-4 font-bold">Vulns</th>
                <th className="py-3.5 px-6 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2130]/60 text-xs">
              {scans.map((scan) => {
                const st = STATUS_STYLE[scan.status];
                const isPaused = scan.status === 'paused';
                const canToggle = scan.status === 'running' || scan.status === 'paused';
                const isBusy = !!busy[scan.id];
                const isSelected = selected.has(scan.id);
                return (
                  <tr key={scan.id} className={isSelected ? 'bg-[#00FF66]/5' : ''}>
                    <td className="py-4 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(scan.id)}
                        className="w-4 h-4 rounded border-[#1A2130] bg-black accent-[#00FF66] cursor-pointer"
                        aria-label={`Selecionar ${scan.target}`}
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg ${st.bg} ${st.border} ${st.text} border flex items-center justify-center shrink-0`}>
                          <i className="fa-solid fa-globe text-[11px]" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-gray-200 font-medium truncate">{scan.target}</p>
                          <p className="text-[10px] text-gray-500 font-mono truncate">{scan.url}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#11151E] border border-[#1A2130] font-mono text-[10px] text-gray-300">
                        {scan.profile}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${st.bg} ${st.text} border ${st.border} font-mono text-[10px] font-bold`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {STATUS_LABEL[scan.status]}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono text-gray-400 text-[11px]">{scan.date}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold text-sm ${scan.score === null ? 'text-gray-500' : 'text-[#00FF66]'}`}>
                          {scan.score ?? '—'}
                        </span>
                        {scan.status === 'running' && (
                          <div className="w-16 h-1.5 bg-black rounded-full overflow-hidden border border-[#1A2130]">
                            <div
                              className="h-full rounded-full bg-[#FFC107] progress-shimmer"
                              style={{ width: `${scan.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold ${scan.vulnCount > 0 ? 'text-[#FF2E54]' : 'text-gray-500'}`}>
                        <i className="fa-solid fa-bug text-[9px]" /> {scan.vulnCount}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {scan.status === 'completed' && (
                          <button
                            onClick={() => nav(`/scans/${scan.id}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00FF66]/10 hover:bg-[#00FF66] hover:text-black border border-[#00FF66]/30 text-[#00FF66] font-mono text-[10px] font-bold transition-all"
                          >
                            Ver <i className="fa-solid fa-arrow-right text-[9px]" />
                          </button>
                        )}
                        {canToggle && (
                          <button
                            onClick={() => handleTogglePause(scan)}
                            disabled={isBusy}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-mono text-[10px] font-bold transition-all disabled:opacity-50 ${
                              isPaused
                                ? 'bg-[#00FF66]/10 hover:bg-[#00FF66] hover:text-black border-[#00FF66]/30 text-[#00FF66]'
                                : 'bg-[#FFC107]/10 hover:bg-[#FFC107] hover:text-black border-[#FFC107]/30 text-[#FFC107]'
                            }`}
                          >
                            {isBusy ? (
                              <i className="fa-solid fa-spinner animate-spin text-[9px]" />
                            ) : isPaused ? (
                              <>
                                <i className="fa-solid fa-play text-[9px]" /> Retomar
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-pause text-[9px]" /> Pausar
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget(scan)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] font-mono text-[10px] font-bold transition-all"
                          title="Eliminar scan"
                        >
                          <i className="fa-solid fa-trash text-[9px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {scans.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500 font-mono text-xs">
                    {loading ? 'A carregar...' : 'Nenhum scan ainda. Inicia o primeiro acima.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 md:px-8 py-3.5 border-t border-[#1A2130] bg-black/20 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-gray-500">
          <span>
            A mostrar <span className="text-white font-bold">{scans.length}</span> de{' '}
            <span className="text-white font-bold">{totalScans}</span> scans
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66]" /> Atualizado agora
          </span>
        </div>
      </div>

      {/* MODAL — Eliminar 1 */}
      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="ELIMINAR SCAN"
        icon="fa-trash"
        iconColor="text-[#FF2E54]"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDeleteOne}
              disabled={deleting}
              className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {deleting && <i className="fa-solid fa-spinner animate-spin" />}
              {deleting ? 'A eliminar…' : 'Eliminar'}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300">
          Eliminar o scan de <strong className="text-white break-all">{deleteTarget?.target}</strong>?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2">
          Todas as vulnerabilidades associadas serão removidas. Ação irreversível.
        </p>
      </Modal>

      {/* MODAL — Eliminar selecionados */}
      <Modal
        open={deleteBulkOpen}
        onClose={() => !deleting && setDeleteBulkOpen(false)}
        title="ELIMINAR SELECIONADOS"
        icon="fa-trash"
        iconColor="text-[#FF2E54]"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              onClick={() => setDeleteBulkOpen(false)}
              disabled={deleting}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDeleteBulk}
              disabled={deleting}
              className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {deleting && <i className="fa-solid fa-spinner animate-spin" />}
              {deleting ? 'A eliminar…' : `Eliminar ${selected.size}`}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300">
          Eliminar <strong className="text-white">{selected.size}</strong> scan(s) selecionado(s)?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2">
          Todas as vulnerabilidades associadas serão removidas. Ação irreversível.
        </p>
      </Modal>

      {/* MODAL — Eliminar TODOS */}
      <Modal
        open={deleteAllOpen}
        onClose={() => !deleting && setDeleteAllOpen(false)}
        title="ELIMINAR TODOS OS SCANS"
        icon="fa-triangle-exclamation"
        iconColor="text-[#FF2E54]"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              onClick={() => setDeleteAllOpen(false)}
              disabled={deleting}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={deleting}
              className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {deleting && <i className="fa-solid fa-spinner animate-spin" />}
              {deleting ? 'A eliminar…' : 'Eliminar Tudo'}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300">
          Eliminar <strong className="text-[#FF2E54]">TODOS os {scans.length} scans</strong>?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2">
          Todas as vulnerabilidades e histórico serão permanentemente removidos.{' '}
          <strong>Ação irreversível.</strong>
        </p>
      </Modal>
    </>
  );
};

export default Scans;