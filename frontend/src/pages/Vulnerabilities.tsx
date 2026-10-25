import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SeverityBadge from '@/components/dashboard/SeverityBadge';
import Modal from '@/components/dashboard/Modal';
import { useToast } from '@/layouts/DashboardLayout';
import { api } from '@/lib/api';

// ============================================
// CONFIG
// ============================================
const API_URL = import.meta.env.VITE_API_URL || '';

// ============================================
// TIPOS
// ============================================
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
type VulnStatus = 'pending' | 'fixing' | 'fixed' | 'ignored';

interface Vuln {
  id: string;
  severity: Severity;
  title: string;
  cwe: string;
  cvss: number | null;
  description: string;
  target: string;
  discovered: string;
  status: VulnStatus;
  remediation: string;
}

interface ApiVuln {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title?: string;
  type?: string;
  description?: string;
  cwe?: string;
  cvss?: number | null;
  affected_url?: string;
  url?: string;
  discovered_at?: string;
  created_at?: string;
  status?: string;
  remediation?: string;
}

/** Payload SSE. Ex: { type: 'vulnerability.updated', vulnerabilityId, status } */
interface RealtimeEvent {
  type: string;
  ts?: number;
  [key: string]: any;
}

const SEV_MAP: Record<string, Severity> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
};

const STATUS_LABEL: Record<VulnStatus, string> = {
  pending: 'Pendente',
  fixing: 'Em correção',
  fixed: 'Corrigido',
  ignored: 'Ignorado',
};

const STATUS_STYLE: Record<VulnStatus, { text: string; dot: string }> = {
  pending: { text: 'text-amber-400/90', dot: 'bg-amber-400 animate-pulse' },
  fixing: { text: 'text-[#FFC107]', dot: 'bg-[#FFC107] animate-pulse' },
  fixed: { text: 'text-[#00FF66]', dot: 'bg-[#00FF66]' },
  ignored: { text: 'text-gray-500', dot: 'bg-gray-500' },
};

function normalizeStatus(s: string | undefined): VulnStatus {
  const v = (s || '').toLowerCase();
  if (v === 'fixing' || v === 'fixed' || v === 'ignored') return v;
  return 'pending';
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

function sevTextColor(s: Severity): string {
  switch (s) {
    case 'CRITICAL': return 'text-[#FF2E54]';
    case 'HIGH': return 'text-[#FF8800]';
    case 'MEDIUM': return 'text-[#FFC107]';
    case 'LOW': return 'text-[#00B0FF]';
    case 'INFO': return 'text-gray-400';
  }
}

/** Eventos SSE relevantes para esta página. */
const REFRESH_EVENT_TYPES = new Set([
  'vulnerability.created',
  'vulnerability.updated',
  'vulnerability.fixed',
  'vulnerability.ignored',
  'vulnerability.deleted',
  'vulnerability.bulk_deleted',
  'finding.fixed',
  'finding.ignored',
  'mitigation.started',
  'mitigation.completed',
  'mitigation.failed',
  'scan.completed',
]);

// ============================================
// COMPONENTE
// ============================================
const Vulnerabilities = () => {
  const { showToast } = useToast();

  const [vulns, setVulns] = useState<Vuln[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [filter, setFilter] = useState<'ALL' | Severity>('ALL');
  const [search, setSearch] = useState('');
  const [detailsOpen, setDetailsOpen] = useState<Vuln | null>(null);
  const [fixOpen, setFixOpen] = useState<Vuln | null>(null);
  const [fixing, setFixing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Vuln | null>(null);
  const [deleteBulkOpen, setDeleteBulkOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Refs realtime
  const sseRef = useRef<EventSource | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const loadRef = useRef<(isRefresh?: boolean) => Promise<void>>();

  // ============================================
  // FETCH
  // ============================================
  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const { data } = await api.get<{ items: ApiVuln[] }>('/api/vulnerabilities');
        const items = data?.items ?? [];

        const mapped: Vuln[] = items.map((v) => ({
          id: v.id,
          severity: SEV_MAP[(v.severity || '').toLowerCase()] || 'INFO',
          title: v.title || v.type || 'Finding',
          cwe: v.cwe || '—',
          cvss: v.cvss ?? null,
          description: v.description || '—',
          target: v.affected_url || v.url || '—',
          discovered: timeAgo(v.discovered_at || v.created_at),
          status: normalizeStatus(v.status),
          remediation: v.remediation || 'Sem recomendação registada.',
        }));

        setVulns(mapped);
        setSelected((prev) => {
          const next = new Set<string>();
          const ids = new Set(mapped.map((m) => m.id));
          for (const id of prev) if (ids.has(id)) next.add(id);
          return next;
        });

        setLastUpdated(new Date());
        if (isRefresh) showToast('Vulnerabilidades atualizadas.', 'success');
      } catch (err: any) {
        const msg = err?.response?.data?.error || 'Falha ao carregar vulnerabilidades.';
        setError(msg);
        setVulns([]);
        setSelected(new Set());
        if (isRefresh) showToast(msg, 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast],
  );

  loadRef.current = load;

  /** Refresh debounced. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      loadRef.current?.(true);
    }, 400);
  }, []);

  // Carga inicial
  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================
  // REALTIME — SSE + fallback polling
  // ============================================
  useEffect(() => {
    let disposed = false;
    let pollTimer: number | null = null;

    const startPollingFallback = () => {
      if (pollTimer != null) return;
      // 10s: equilíbrio entre frescura e carga
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadRef.current?.(false);
        }
      }, 10_000);
    };

    const stopPollingFallback = () => {
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const connectSSE = () => {
      if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
        startPollingFallback();
        return;
      }

      try {
        const es = new EventSource('/api/realtime/events');
        sseRef.current = es;

        es.onopen = () => {
          if (disposed) return;
          setRealtimeConnected(true);
          stopPollingFallback();
          scheduleRefresh();
        };

        es.onmessage = (evt) => {
          if (disposed) return;
          let payload: RealtimeEvent | null = null;
          try {
            payload = JSON.parse(evt.data);
          } catch {
            return;
          }
          if (!payload) return;

          // ---- Otimizações locais por evento ----
          const vulnIdRaw = payload.vulnerabilityId ?? payload.findingId;
          if (vulnIdRaw != null && payload.status != null) {
            const vulnId = String(vulnIdRaw);
            const newStatus = normalizeStatus(payload.status);
            setVulns((prev) =>
              prev.map((v) => (v.id === vulnId ? { ...v, status: newStatus } : v)),
            );
            // Atualiza o modal aberto, se for a mesma vuln
            setDetailsOpen((prev) =>
              prev && prev.id === vulnId ? { ...prev, status: newStatus } : prev,
            );
          }

          // Remoção imediata
          if (payload.type === 'vulnerability.deleted' && vulnIdRaw != null) {
            const vulnId = String(vulnIdRaw);
            setVulns((prev) => prev.filter((v) => v.id !== vulnId));
            setSelected((prev) => {
              const next = new Set(prev);
              next.delete(vulnId);
              return next;
            });
            setDetailsOpen((prev) => (prev && prev.id === vulnId ? null : prev));
          }

          if (payload.type === 'vulnerability.bulk_deleted' && Array.isArray(payload.ids)) {
            const ids = payload.ids.map(String);
            setVulns((prev) => prev.filter((v) => !ids.includes(v.id)));
            setSelected((prev) => {
              const next = new Set(prev);
              ids.forEach((id) => next.delete(id));
              return next;
            });
          }

          // Toasts em eventos de mitigação
          if (payload.type === 'mitigation.completed') {
            showToast('Mitigação concluída.', 'success');
          } else if (payload.type === 'mitigation.failed') {
            showToast('Mitigação falhou.', 'error');
          } else if (payload.type === 'scan.completed') {
            showToast('Novo scan concluído. Vulnerabilidades atualizadas.', 'info');
          }

          // Qualquer evento relevante → refresh debounced (para consistência total)
          if (REFRESH_EVENT_TYPES.has(payload.type)) {
            scheduleRefresh();
          }
        };

        es.onerror = () => {
          if (disposed) return;
          setRealtimeConnected(false);
          startPollingFallback();
        };
      } catch {
        startPollingFallback();
      }
    };

    connectSSE();

    const safety = window.setTimeout(() => {
      if (!disposed && !sseRef.current) startPollingFallback();
    }, 20_000);

    // Revalidar ao voltar à aba / focar
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadRef.current?.(false);
    };
    const onFocus = () => loadRef.current?.(false);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      disposed = true;
      window.clearTimeout(safety);
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      stopPollingFallback();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [scheduleRefresh, showToast]);

  // ============================================
  // DERIVADOS
  // ============================================
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return vulns.filter((v) => {
      const matchFilter = filter === 'ALL' || v.severity === filter;
      const matchSearch =
        !q ||
        v.title.toLowerCase().includes(q) ||
        v.target.toLowerCase().includes(q) ||
        v.cwe.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [vulns, filter, search]);

  const counts = useMemo(
    () => ({
      total: vulns.length,
      critical: vulns.filter((v) => v.severity === 'CRITICAL').length,
      high: vulns.filter((v) => v.severity === 'HIGH').length,
      medium: vulns.filter((v) => v.severity === 'MEDIUM').length,
      low: vulns.filter((v) => v.severity === 'LOW').length,
      info: vulns.filter((v) => v.severity === 'INFO').length,
      fixed: vulns.filter((v) => v.status === 'fixed').length,
    }),
    [vulns],
  );

  // ============================================
  // AÇÕES
  // ============================================
  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await api.post<{ id: string; download_token?: string }>(
        '/api/reports',
        { type: 'technical', format: 'CSV', period: 'all' },
      );
      const token = data.download_token;
      const url = token
        ? `${API_URL}/api/reports/${data.id}/download?token=${encodeURIComponent(token)}`
        : `${API_URL}/api/reports/${data.id}/download`;
      window.open(url, '_blank');
      showToast('Relatório gerado.', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao exportar.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleConfirmFix = async () => {
    if (!fixOpen) return;
    setFixing(true);
    const target = fixOpen;

    // Otimista — passa já para 'fixing'
    setVulns((prev) =>
      prev.map((v) => (v.id === target.id ? { ...v, status: 'fixing' } : v)),
    );

    try {
      await api.post(`/api/vulnerabilities/${target.id}/fix`);
      showToast(`Correção iniciada para ${target.target}.`, 'success');
      setFixOpen(null);
      await load(true);
    } catch (err: any) {
      // Reverter
      setVulns((prev) =>
        prev.map((v) => (v.id === target.id ? { ...v, status: target.status } : v)),
      );
      showToast(err?.response?.data?.error || 'Falha ao iniciar correção.', 'error');
    } finally {
      setFixing(false);
    }
  };

  const handleUpdateStatus = async (v: Vuln, status: VulnStatus) => {
    const prevStatus = v.status;

    // Otimista — muda já
    setVulns((prev) => prev.map((x) => (x.id === v.id ? { ...x, status } : x)));
    setDetailsOpen((prev) => (prev && prev.id === v.id ? { ...prev, status } : prev));

    try {
      await api.patch(`/api/vulnerabilities/${v.id}`, { status });
      showToast(`Estado atualizado: ${STATUS_LABEL[status]}.`, 'success');
      await load(true);
    } catch (err: any) {
      // Reverter
      setVulns((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: prevStatus } : x)));
      setDetailsOpen((prev) =>
        prev && prev.id === v.id ? { ...prev, status: prevStatus } : prev,
      );
      showToast(err?.response?.data?.error || 'Falha ao atualizar.', 'error');
    }
  };

  const handleDeleteOne = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const target = deleteTarget;

    // Otimista — remove já
    setVulns((prev) => prev.filter((v) => v.id !== target.id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(target.id);
      return next;
    });

    try {
      await api.delete(`/api/vulnerabilities/${target.id}`);
      showToast('Vulnerabilidade eliminada.', 'success');
      setDeleteTarget(null);
    } catch (err: any) {
      // Reverter — reinsere no início
      setVulns((prev) => [target, ...prev]);
      showToast(err?.response?.data?.error || 'Falha ao eliminar.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteBulk = async () => {
    setDeleting(true);
    const snapshot = vulns;
    const ids = Array.from(selected);

    // Otimista
    setVulns((prev) => prev.filter((v) => !selected.has(v.id)));
    setSelected(new Set());

    try {
      await api.delete('/api/vulnerabilities/bulk', {
        data: { ids },
        headers: { 'X-Confirm-Delete': 'yes' },
      });
      showToast(`${ids.length} vulnerabilidade(s) eliminada(s).`, 'success');
      setDeleteBulkOpen(false);
    } catch (err: any) {
      setVulns(snapshot); // reverter
      showToast(err?.response?.data?.error || 'Falha ao eliminar.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    const snapshot = vulns;

    // Otimista
    setVulns([]);
    setSelected(new Set());

    try {
      await api.delete('/api/vulnerabilities', {
        headers: { 'X-Confirm-Delete': 'yes' },
      });
      showToast('Todas as vulnerabilidades foram eliminadas.', 'success');
      setDeleteAllOpen(false);
    } catch (err: any) {
      setVulns(snapshot); // reverter
      showToast(err?.response?.data?.error || 'Falha ao eliminar todas.', 'error');
    } finally {
      setDeleting(false);
    }
  };

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
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((v) => v.id));
    });
  };

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0;

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      {/* Título + Ações */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestão de Vulnerabilidades</h2>
          <p className="text-sm text-gray-400 mt-1">
            Falhas identificadas que necessitam de patch ou mitigação.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          {/* Indicador realtime */}
          <div
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-bold tracking-wider flex items-center gap-1.5 ${
              realtimeConnected
                ? 'bg-[#00FF66]/10 border-[#00FF66]/40 text-[#00FF66]'
                : 'bg-[#FFC107]/10 border-[#FFC107]/40 text-[#FFC107]'
            }`}
            title={
              realtimeConnected
                ? 'Ligado ao stream de eventos (SSE)'
                : 'SSE indisponível — a usar polling a cada 10s'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                realtimeConnected ? 'bg-[#00FF66] animate-pulse' : 'bg-[#FFC107]'
              }`}
            />
            {realtimeConnected ? 'REALTIME' : 'POLLING'}
          </div>

          <button
            onClick={() => setDeleteAllOpen(true)}
            disabled={vulns.length === 0}
            className="px-3 py-2.5 bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Eliminar todas as vulnerabilidades"
          >
            <i className="fa-solid fa-trash text-[10px]" />
            <span className="hidden sm:inline">Eliminar Todas</span>
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="px-3 py-2.5 bg-[#11151E] hover:bg-[#1A2130] border border-[#1A2130] hover:border-[#00FF66] text-gray-300 hover:text-[#00FF66] text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40"
          >
            <i className={`fa-solid fa-arrows-rotate ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2.5 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] flex items-center gap-2 disabled:opacity-60"
          >
            {exporting ? (
              <i className="fa-solid fa-spinner animate-spin" />
            ) : (
              <i className="fa-solid fa-download" />
            )}
            {exporting ? 'A exportar…' : 'Exportar'}
          </button>
        </div>
      </div>

      {/* 4 METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Total</span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-bug text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">{counts.total}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-list text-gray-500" /> {counts.fixed} corrigidas
          </div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Críticas</span>
            <div className="w-8 h-8 rounded-lg bg-[#FF2E54]/10 border border-[#FF2E54]/20 flex items-center justify-center">
              <i className="fa-solid fa-triangle-exclamation text-[#FF2E54] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-[#FF2E54] mb-1">{counts.critical}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className={`fa-solid ${counts.critical === 0 ? 'fa-circle-check text-[#00FF66]' : 'fa-circle-exclamation text-[#FF2E54]'}`} />
            {counts.critical === 0 ? 'Nenhuma crítica' : 'Requer atenção'}
          </div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Médias</span>
            <div className="w-8 h-8 rounded-lg bg-[#FFC107]/10 border border-[#FFC107]/20 flex items-center justify-center">
              <i className="fa-solid fa-circle-exclamation text-[#FFC107] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-[#FFC107] mb-1">{counts.medium}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-clock text-gray-500" /> Pendentes
          </div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Baixas</span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-circle-check text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-[#00FF66] mb-1">{counts.low}</div>
          <div className="text-[11px] text-[#00FF66] flex items-center gap-1 font-mono">
            <i className="fa-solid fa-shield-halved" /> {counts.low === 0 ? 'Nenhuma baixa' : 'Ver detalhes'}
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="cyber-card rounded-2xl p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono font-semibold text-gray-500 uppercase tracking-wider mr-1">Severidade:</span>
            {[
              { key: 'ALL' as const, label: 'Todas', count: counts.total },
              { key: 'CRITICAL' as const, label: 'Crítica', dot: 'bg-[#FF2E54]', count: counts.critical },
              { key: 'HIGH' as const, label: 'Alta', dot: 'bg-[#FF8800]', count: counts.high },
              { key: 'MEDIUM' as const, label: 'Média', dot: 'bg-[#FFC107]', count: counts.medium },
              { key: 'LOW' as const, label: 'Baixa', dot: 'bg-[#00B0FF]', count: counts.low },
              { key: 'INFO' as const, label: 'Info', dot: 'bg-gray-400', count: counts.info },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`filter-pill px-3.5 py-1.5 rounded-lg bg-[#11151E] border border-[#1A2130] text-gray-300 text-xs font-mono font-bold transition-all ${filter === f.key ? 'active' : ''}`}
              >
                {f.dot && <span className={`inline-block w-1.5 h-1.5 rounded-full ${f.dot} mr-1.5`} />}
                {f.label}
                <span className="ml-1.5 text-[10px] opacity-60">({f.count})</span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-72">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <i className="fa-solid fa-magnifying-glass text-gray-500 text-xs" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar (título, ativo, CWE)…"
              className="neon-input w-full pl-9 pr-4 py-2.5 rounded-lg text-xs font-mono text-white"
            />
          </div>
        </div>

        {filtered.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#1A2130] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <label className="flex items-center gap-2 cursor-pointer text-gray-400 hover:text-white">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-[#1A2130] bg-black accent-[#00FF66] cursor-pointer"
              />
              <span>{allSelected ? 'Desmarcar todos' : 'Selecionar todos'}</span>
            </label>
            {someSelected && (
              <div className="flex items-center gap-2">
                <span className="text-[#FFC107]">{selected.size} selecionada(s)</span>
                <button
                  onClick={() => setDeleteBulkOpen(true)}
                  className="px-3 py-1 rounded-lg bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-[10px] font-bold transition-all flex items-center gap-1"
                >
                  <i className="fa-solid fa-trash text-[9px]" /> Eliminar selecionadas
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="px-2 py-1 text-gray-500 hover:text-white"
                >
                  <i className="fa-solid fa-xmark text-[10px]" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ERRO */}
      {error && !loading && (
        <div className="cyber-card rounded-2xl p-6 text-center">
          <i className="fa-solid fa-triangle-exclamation text-[#FF2E54] text-2xl mb-2" />
          <p className="text-white font-semibold mb-1">Não foi possível carregar</p>
          <p className="text-gray-400 text-xs font-mono mb-4">{error}</p>
          <button onClick={() => load(false)} className="px-4 py-2 bg-[#00FF66] text-black text-xs font-mono font-bold rounded-lg">
            Tentar novamente
          </button>
        </div>
      )}

      {/* LISTA */}
      <div className="space-y-3">
        {filtered.map((v) => {
          const st = STATUS_STYLE[v.status];
          const canFix = v.status === 'pending' || v.status === 'ignored';
          const isSelected = selected.has(v.id);
          return (
            <div
              key={v.id}
              className={`vuln-card sev-${v.severity.toLowerCase()} rounded-2xl p-5 md:p-6 ${isSelected ? 'ring-2 ring-[#00FF66]/50' : ''}`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(v.id)}
                    className="mt-1 w-4 h-4 rounded border-[#1A2130] bg-black accent-[#00FF66] cursor-pointer shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2.5">
                      <SeverityBadge severity={v.severity as any} />
                      <span className="px-2 py-0.5 rounded-md bg-black/40 border border-[#1A2130] text-gray-400 font-mono text-[10px]">{v.cwe}</span>
                      {v.cvss != null && (
                        <span className="px-2 py-0.5 rounded-md bg-black/40 border border-[#1A2130] text-gray-400 font-mono text-[10px]">CVSS {v.cvss}</span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-medium ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {STATUS_LABEL[v.status]}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mb-1.5">{v.title}</h3>
                    <p className="text-xs text-gray-400 leading-relaxed mb-3 whitespace-pre-wrap">{v.description}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-gray-500">
                      <span className="inline-flex items-center gap-1.5">
                        <i className="fa-solid fa-globe text-gray-600 text-[10px]" />
                        <span className="px-2 py-0.5 rounded bg-black/40 border border-[#1A2130] text-gray-300 truncate max-w-[280px]">{v.target}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <i className="fa-solid fa-clock text-gray-600 text-[10px]" /> Descoberta {v.discovered}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex lg:flex-col items-stretch lg:items-end gap-2 shrink-0">
                  {canFix && (
                    <button
                      onClick={() => setFixOpen(v)}
                      className="px-4 py-2 rounded-lg bg-[#00FF66]/10 hover:bg-[#00FF66] hover:text-black border border-[#00FF66]/30 text-[#00FF66] font-mono text-[11px] font-bold transition-all inline-flex items-center justify-center gap-1.5"
                    >
                      <i className="fa-solid fa-wrench text-[10px]" /> Corrigir
                    </button>
                  )}
                  {v.status === 'fixing' && (
                    <button
                      onClick={() => handleUpdateStatus(v, 'fixed')}
                      className="px-4 py-2 rounded-lg bg-[#00FF66]/10 hover:bg-[#00FF66] hover:text-black border border-[#00FF66]/30 text-[#00FF66] font-mono text-[11px] font-bold transition-all inline-flex items-center justify-center gap-1.5"
                    >
                      <i className="fa-solid fa-check text-[10px]" /> Marcar corrigido
                    </button>
                  )}
                  {v.status === 'fixed' && (
                    <span className="px-4 py-2 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/30 text-[#00FF66] font-mono text-[11px] font-bold inline-flex items-center justify-center gap-1.5">
                      <i className="fa-solid fa-check text-[10px]" /> Corrigido
                    </span>
                  )}
                  {v.status !== 'ignored' && v.status !== 'fixed' && (
                    <button
                      onClick={() => handleUpdateStatus(v, 'ignored')}
                      className="px-4 py-2 rounded-lg bg-[#11151E] hover:bg-[#1A2130] border border-[#1A2130] text-gray-400 font-mono text-[11px] font-bold transition-all inline-flex items-center justify-center gap-1.5"
                    >
                      <i className="fa-solid fa-ban text-[10px]" /> Ignorar
                    </button>
                  )}
                  <button
                    onClick={() => setDetailsOpen(v)}
                    className="px-4 py-2 rounded-lg bg-[#11151E] hover:bg-[#1A2130] border border-[#1A2130] text-gray-300 font-mono text-[11px] font-bold transition-all inline-flex items-center justify-center gap-1.5"
                  >
                    <i className="fa-solid fa-circle-info text-[10px]" /> Detalhes
                  </button>
                  <button
                    onClick={() => setDeleteTarget(v)}
                    className="px-4 py-2 rounded-lg bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] font-mono text-[11px] font-bold transition-all inline-flex items-center justify-center gap-1.5"
                  >
                    <i className="fa-solid fa-trash text-[10px]" /> Eliminar
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && !error && (
          <div className="cyber-card rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#11151E] border border-[#1A2130] flex items-center justify-center text-gray-600 mx-auto mb-4">
              <i className={`fa-solid ${loading ? 'fa-spinner animate-spin' : 'fa-magnifying-glass'} text-2xl`} />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              {loading ? 'A carregar…' : vulns.length === 0 ? 'Nenhuma vulnerabilidade registada' : 'Nenhum resultado para os filtros'}
            </h3>
            <p className="text-xs text-gray-400">
              {loading ? 'Aguarde um momento.' : vulns.length === 0 ? 'Corre um scan para começar a detetar vulnerabilidades.' : 'Ajusta os filtros ou a pesquisa.'}
            </p>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 text-[10px] font-mono text-gray-500">
        <span>
          A mostrar <span className="text-white font-bold">{filtered.length}</span> de <span className="text-white font-bold">{vulns.length}</span> vulnerabilidades
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              realtimeConnected ? 'bg-[#00FF66] animate-pulse' : 'bg-[#FFC107]'
            }`}
          />
          Última atualização:{' '}
          <span className="text-white font-bold">
            {refreshing
              ? 'a atualizar…'
              : lastUpdated
              ? lastUpdated.toLocaleTimeString('pt-PT')
              : '—'}
          </span>
        </span>
      </div>

      {/* MODAL DETALHES */}
      <Modal
        open={!!detailsOpen}
        onClose={() => setDetailsOpen(null)}
        title="DETALHES DA VULNERABILIDADE"
        icon="fa-microchip"
        maxWidth="max-w-lg"
        footer={
          <>
            <button onClick={() => setDetailsOpen(null)} className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all">Fechar</button>
            {detailsOpen && (detailsOpen.status === 'pending' || detailsOpen.status === 'ignored') && (
              <button
                onClick={() => { const v = detailsOpen; setDetailsOpen(null); setFixOpen(v); }}
                className="px-4 py-2 bg-[#00FF66] text-black hover:bg-[#00E676] text-xs font-mono font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)]"
              >
                Iniciar Correção
              </button>
            )}
          </>
        }
      >
        {detailsOpen && (
          <div className="space-y-3 font-mono text-xs">
            <div>
              <span className="text-gray-500 block text-[10px]">TÍTULO:</span>
              <p className="text-white font-bold font-sans text-sm mt-0.5">{detailsOpen.title}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div>
                <span className="text-gray-500 block text-[10px]">ATIVO:</span>
                <p className="text-[#00FF66] font-semibold mt-0.5 text-[11px] break-all">{detailsOpen.target}</p>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px]">SEVERIDADE:</span>
                <p className={`font-bold mt-0.5 text-[11px] ${sevTextColor(detailsOpen.severity)}`}>{detailsOpen.severity}</p>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px]">CVSS:</span>
                <p className="text-white font-bold mt-0.5 text-[11px]">{detailsOpen.cvss ?? '—'}</p>
              </div>
            </div>
            <div>
              <span className="text-gray-500 block text-[10px]">CWE:</span>
              <p className="text-gray-300 font-semibold mt-0.5 text-[11px]">{detailsOpen.cwe}</p>
            </div>
            <div>
              <span className="text-gray-500 block text-[10px]">STATUS:</span>
              <p className={`font-semibold mt-0.5 text-[11px] ${STATUS_STYLE[detailsOpen.status].text}`}>{STATUS_LABEL[detailsOpen.status]}</p>
            </div>
            <div>
              <span className="text-gray-500 block text-[10px]">DESCRIÇÃO:</span>
              <p className="text-gray-300 font-sans text-xs mt-0.5 whitespace-pre-wrap">{detailsOpen.description}</p>
            </div>
            <div className="p-3 rounded-xl bg-black/60 border border-[#1A2130] space-y-1">
              <span className="text-gray-400 font-bold block text-[10px]">RECOMENDAÇÃO DE MITIGAÇÃO:</span>
              <p className="text-gray-300 font-sans text-xs leading-relaxed whitespace-pre-wrap">{detailsOpen.remediation}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL CORREÇÃO */}
      <Modal
        open={!!fixOpen}
        onClose={() => !fixing && setFixOpen(null)}
        title="INICIAR CORREÇÃO?"
        icon="fa-wrench"
        maxWidth="max-w-sm"
        footer={
          <>
            <button onClick={() => setFixOpen(null)} disabled={fixing} className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50">Cancelar</button>
            <button onClick={handleConfirmFix} disabled={fixing} className="px-4 py-2 bg-[#00FF66] text-black hover:bg-[#00E676] text-xs font-mono font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] disabled:opacity-50 inline-flex items-center gap-2">
              {fixing && <i className="fa-solid fa-spinner animate-spin" />}
              {fixing ? 'A iniciar…' : 'Corrigir'}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300 text-center">
          A correção será aplicada em <strong className="text-[#00FF66] break-all">{fixOpen?.target}</strong>.
        </p>
      </Modal>

      {/* MODAL DELETE 1 */}
      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="ELIMINAR VULNERABILIDADE"
        icon="fa-trash"
        iconColor="text-[#FF2E54]"
        maxWidth="max-w-md"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50">Cancelar</button>
            <button onClick={handleDeleteOne} disabled={deleting} className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50 inline-flex items-center gap-2">
              {deleting && <i className="fa-solid fa-spinner animate-spin" />}
              {deleting ? 'A eliminar…' : 'Eliminar'}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300">
          Eliminar <strong className="text-white break-all">{deleteTarget?.title}</strong>?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2">Ação irreversível.</p>
      </Modal>

      {/* MODAL DELETE BULK */}
      <Modal
        open={deleteBulkOpen}
        onClose={() => !deleting && setDeleteBulkOpen(false)}
        title="ELIMINAR SELECIONADAS"
        icon="fa-trash"
        iconColor="text-[#FF2E54]"
        maxWidth="max-w-md"
        footer={
          <>
            <button onClick={() => setDeleteBulkOpen(false)} disabled={deleting} className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50">Cancelar</button>
            <button onClick={handleDeleteBulk} disabled={deleting} className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50 inline-flex items-center gap-2">
              {deleting && <i className="fa-solid fa-spinner animate-spin" />}
              {deleting ? 'A eliminar…' : `Eliminar ${selected.size}`}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300">
          Eliminar <strong className="text-white">{selected.size}</strong> vulnerabilidade(s) selecionada(s)?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2">Ação irreversível.</p>
      </Modal>

      {/* MODAL DELETE ALL */}
      <Modal
        open={deleteAllOpen}
        onClose={() => !deleting && setDeleteAllOpen(false)}
        title="ELIMINAR TODAS"
        icon="fa-triangle-exclamation"
        iconColor="text-[#FF2E54]"
        maxWidth="max-w-md"
        footer={
          <>
            <button onClick={() => setDeleteAllOpen(false)} disabled={deleting} className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50">Cancelar</button>
            <button onClick={handleDeleteAll} disabled={deleting} className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50 inline-flex items-center gap-2">
              {deleting && <i className="fa-solid fa-spinner animate-spin" />}
              {deleting ? 'A eliminar…' : 'Eliminar Tudo'}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300">
          Eliminar <strong className="text-[#FF2E54]">TODAS as {vulns.length} vulnerabilidades</strong>?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2"><strong>Ação irreversível.</strong> Os scans não são apagados, só as vulnerabilidades.</p>
      </Modal>
    </>
  );
};

export default Vulnerabilities;