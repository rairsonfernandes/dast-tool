import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SeverityBadge from '@/components/dashboard/SeverityBadge';
import Modal from '@/components/dashboard/Modal';
import { useToast } from '@/layouts/DashboardLayout';
import { api } from '@/lib/api';

// ============================================
// TIPOS
// ============================================
type ApiSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type ApiScanStatus = 'queued' | 'pending' | 'running' | 'completed' | 'failed' | 'paused';
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

interface ApiScan {
  id: string;
  url: string;
  target_url?: string;
  status: ApiScanStatus;
  profile: string;
  score: number | null;
  progress: number;
  duration_seconds?: number | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  modules_total?: number | null;
  modules_completed?: number | null;
  result?: {
    vulnerabilities?: any[];
    logs?: { time?: string; level?: string; message: string }[];
    modules?: { name: string; ok: boolean; duration_s: number; error?: string | null }[];
    findings_total?: number;
    findings_by_severity?: Record<string, number>;
    errors?: any[];
    modules_available?: string[];
  } | null;
}

interface ApiVuln {
  id: string;
  scan_id?: string;
  severity: ApiSeverity;
  title?: string;
  description?: string;
  cwe?: string;
  cvss?: number | null;
  affected_url?: string;
  remediation?: string;
  status?: string;
}

interface RealtimeEvent {
  type: string;
  ts?: number;
  [key: string]: any;
}

// ============================================
// HELPERS
// ============================================
const SEV_MAP: Record<ApiSeverity, Severity> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
};

const STATUS_LABEL: Record<ApiScanStatus, string> = {
  queued: 'Em fila',
  pending: 'Pendente',
  running: 'Em curso',
  completed: 'Concluído',
  failed: 'Falhou',
  paused: 'Pausado',
};

const STATUS_STYLE: Record<ApiScanStatus, { text: string; dot: string }> = {
  queued: { text: 'text-gray-400', dot: 'bg-gray-400' },
  pending: { text: 'text-[#FFC107]', dot: 'bg-[#FFC107]' },
  running: { text: 'text-[#FFC107]', dot: 'bg-[#FFC107] animate-pulse' },
  completed: { text: 'text-[#00FF66]', dot: 'bg-[#00FF66]' },
  failed: { text: 'text-[#FF2E54]', dot: 'bg-[#FF2E54]' },
  paused: { text: 'text-gray-400', dot: 'bg-gray-400' },
};

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('pt-PT');
  } catch {
    return '—';
  }
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const REFRESH_EVENT_TYPES = new Set([
  'scan.started',
  'scan.progress',
  'scan.completed',
  'scan.failed',
  'scan.cancelled',
  'scan.paused',
  'scan.resumed',
  'scan.deleted',
  'vulnerability.created',
  'vulnerability.updated',
  'mitigation.started',
  'mitigation.completed',
  'mitigation.failed',
]);

// ============================================
// COMPONENTE
// ============================================
const ScanDetail = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { showToast } = useToast();

  const [scan, setScan] = useState<ApiScan | null>(null);
  const [vulns, setVulns] = useState<ApiVuln[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const sseRef = useRef<EventSource | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const loadRef = useRef<() => Promise<void>>();
  const scanStatusRef = useRef<ApiScanStatus | undefined>(undefined);

  // ============================================
  // FETCH
  // ============================================
  const load = useCallback(async () => {
    if (!id) return;
    setError(null);

    try {
      const scanRes = await api.get<ApiScan>(`/api/scans/${id}`);
      const scanData = scanRes.data;
      setScan(scanData);
      scanStatusRef.current = scanData.status;

      try {
        const { data } = await api.get<ApiVuln[] | { items: ApiVuln[] }>(
          `/api/scans/${id}/vulnerabilities`,
        );
        const list = Array.isArray(data) ? data : data.items ?? [];
        setVulns(list);
      } catch {
        try {
          const { data } = await api.get<{ items: ApiVuln[] }>('/api/vulnerabilities');
          const all = data?.items ?? [];
          setVulns(all.filter((v) => v.scan_id === scanData.id));
        } catch {
          setVulns([]);
        }
      }

      setLastUpdated(new Date());
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Falha ao carregar o scan.';
      setError(msg);
      setScan(null);
      setVulns([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  loadRef.current = load;

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      loadRef.current?.();
    }, 300);
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ============================================
  // REALTIME — SSE + fallback polling
  // ============================================
  useEffect(() => {
    if (!id) return;

    let disposed = false;
    let pollTimer: number | null = null;

    const startPollingFallback = () => {
      if (pollTimer != null) return;
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadRef.current?.();
        }
      }, 5_000);
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

          const thisScanId = String(id);
          const isThisScan = payload.scanId != null && String(payload.scanId) === thisScanId;

          if (isThisScan) {
            if (payload.type === 'scan.progress') {
              setScan((prev) =>
                prev
                  ? {
                      ...prev,
                      progress:
                        typeof payload!.progress === 'number'
                          ? payload!.progress
                          : prev.progress,
                      status: (payload!.status as ApiScanStatus) ?? prev.status,
                    }
                  : prev,
              );
            }

            if (
              payload.type === 'scan.paused' ||
              payload.type === 'scan.resumed' ||
              payload.type === 'scan.started'
            ) {
              const newStatus: ApiScanStatus =
                payload.type === 'scan.paused'
                  ? 'paused'
                  : 'running';
              setScan((prev) => (prev ? { ...prev, status: newStatus } : prev));
            }

            if (payload.type === 'scan.completed' || payload.type === 'scan.failed') {
              setScan((prev) =>
                prev
                  ? {
                      ...prev,
                      status: payload!.type === 'scan.completed' ? 'completed' : 'failed',
                      progress: 100,
                      score: payload!.score ?? prev.score,
                      completed_at: payload!.completed_at ?? prev.completed_at,
                      duration_seconds: payload!.duration_seconds ?? prev.duration_seconds,
                    }
                  : prev,
              );
              if (payload.type === 'scan.completed') {
                showToast('Scan concluído.', 'success');
              } else {
                showToast('Scan falhou.', 'error');
              }
            }
          }

          if (payload.type === 'scan.deleted' && isThisScan) {
            showToast('Este scan foi eliminado.', 'error');
            nav('/scans');
            return;
          }

          if (
            payload.type === 'vulnerability.created' ||
            payload.type === 'vulnerability.updated' ||
            payload.type === 'mitigation.completed' ||
            payload.type === 'mitigation.failed'
          ) {
            if (payload.scanId == null || isThisScan) {
              scheduleRefresh();
            }
          }

          if (REFRESH_EVENT_TYPES.has(payload.type)) {
            if (
              payload.scanId == null &&
              scanStatusRef.current &&
              ['completed', 'failed'].includes(scanStatusRef.current)
            ) {
              return;
            }
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

    const onVisible = () => {
      if (document.visibilityState === 'visible') loadRef.current?.();
    };
    const onFocus = () => loadRef.current?.();

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
  }, [id, nav, scheduleRefresh, showToast]);

  // ============================================
  // AÇÕES (FIX AQUI)
  // ============================================
  const handleExport = async () => {
    if (!scan) return;
    setExporting(true);
    const API_URL = import.meta.env.VITE_API_URL || 'https://dast-tool-backend.onrender.com';

    try {
      const { data } = await api.post<{ id: string; download_token?: string }>('/api/reports', {
        type: 'technical',
        format: 'PDF',
        scan_id: scan.id,
      });
      const token = data.download_token;
      // Constrói o URL absoluto para o Render (evita 404 no Vercel)
      const url = token
        ? `${API_URL}/api/reports/${data.id}/download?token=${encodeURIComponent(token)}`
        : `${API_URL}/api/reports/${data.id}/download`;
      window.open(url, '_blank');
      showToast('Relatório gerado.', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao gerar relatório.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleTogglePause = async () => {
    if (!scan) return;
    setToggling(true);
    const endpoint = scan.status === 'paused' ? 'resume' : 'pause';
    const optimisticStatus: ApiScanStatus = endpoint === 'pause' ? 'paused' : 'running';

    setScan((prev) => (prev ? { ...prev, status: optimisticStatus } : prev));

    try {
      const { data } = await api.post<ApiScan>(`/api/scans/${scan.id}/${endpoint}`);
      setScan(data);
      showToast(
        endpoint === 'pause' ? 'Scan pausado.' : 'Scan retomado.',
        endpoint === 'pause' ? 'info' : 'success',
      );
      await load();
    } catch (err: any) {
      setScan((prev) => (prev ? { ...prev, status: scan.status } : prev));
      showToast(err?.response?.data?.error || 'Falha ao alterar estado.', 'error');
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!scan) return;
    setDeleting(true);
    try {
      if (scan.status === 'running') {
        try {
          await api.post(`/api/scans/${scan.id}/pause`);
        } catch {
          /* ignora */
        }
      }
      await api.delete(`/api/scans/${scan.id}`);
      showToast('Scan eliminado.', 'success');
      nav('/scans');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao eliminar scan.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ============================================
  // DERIVADOS
  // ============================================
  const vulnCount = vulns.length;
  const durationLabel = scan?.duration_seconds != null ? `${scan.duration_seconds}s` : '—';
  const scoreLabel = scan?.score ?? '—';
  const statusLabel = scan ? STATUS_LABEL[scan.status] : '—';

  const modulesLabel = useMemo(() => {
    if (scan?.modules_total != null) {
      const done = scan.modules_completed ?? 0;
      return `${done}/${scan.modules_total}`;
    }
    const mods = scan?.result?.modules;
    if (Array.isArray(mods) && mods.length > 0) {
      const ok = mods.filter((m) => m.ok).length;
      return `${ok}/${mods.length}`;
    }
    return '—';
  }, [scan]);

  const logs = useMemo(() => {
    const fromBackend = scan?.result?.logs;
    if (fromBackend && fromBackend.length) return fromBackend;

    if (!scan) return [];
    const out: { time: string; level: string; message: string }[] = [];

    out.push({
      time: fmtTime(scan.started_at || scan.created_at),
      level: 'INFO',
      message: `Scan iniciado — target=${scan.target_url || scan.url}`,
    });

    if (scan.profile) {
      out.push({ time: '—', level: 'INFO', message: `Perfil=${scan.profile}` });
    }

    const mods = scan.result?.modules;
    if (Array.isArray(mods) && mods.length > 0) {
      for (const m of mods) {
        out.push({
          time: `${m.duration_s ?? 0}s`,
          level: m.ok ? 'INFO' : 'ERROR',
          message: `Módulo ${m.name} — ${m.ok ? 'OK' : `FALHA: ${m.error || 'erro'}`}`,
        });
      }
    }

    if (vulnCount > 0) {
      out.push({
        time: '—',
        level: 'WARN',
        message: `${vulnCount} finding${vulnCount === 1 ? '' : 's'} detetado${vulnCount === 1 ? '' : 's'}`,
      });
    }

    if (scan.error_message) {
      out.push({ time: fmtTime(scan.completed_at), level: 'ERROR', message: scan.error_message });
    }

    out.push({
      time: fmtTime(scan.completed_at),
      level: scan.status === 'failed' ? 'ERROR' : 'INFO',
      message: `Scan ${statusLabel.toLowerCase()}`,
    });

    return out;
  }, [scan, vulnCount, statusLabel]);

  const vulnsBySeverity = useMemo(() => {
    const counts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const v of vulns) counts[v.severity] = (counts[v.severity] || 0) + 1;
    return counts;
  }, [vulns]);

  // ============================================
  // ESTADOS
  // ============================================
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 font-mono text-xs">
        <i className="fa-solid fa-spinner animate-spin mr-2" /> A carregar scan…
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="cyber-card rounded-2xl p-8 text-center">
        <i className="fa-solid fa-triangle-exclamation text-[#FF2E54] text-3xl mb-3" />
        <p className="text-white font-semibold mb-1">Não foi possível carregar o scan</p>
        <p className="text-gray-400 text-xs font-mono mb-4">{error || 'Scan não encontrado.'}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => nav('/scans')} className="px-4 py-2 bg-[#11151E] border border-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-lg">Voltar</button>
          <button onClick={load} className="px-4 py-2 bg-[#00FF66] text-black text-xs font-mono font-bold rounded-lg">Tentar novamente</button>
        </div>
      </div>
    );
  }

  const st = STATUS_STYLE[scan.status];
  const canToggle = scan.status === 'running' || scan.status === 'paused';
  const isRunning = scan.status === 'running';
  const target = scan.target_url || scan.url;

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      {/* Topo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => nav('/scans')} className="px-4 py-2 bg-[#11151E] border border-[#1A2130] hover:border-[#00FF66] hover:text-[#00FF66] text-gray-300 text-xs font-mono font-bold rounded-lg flex items-center gap-2 transition-all">
            <i className="fa-solid fa-arrow-left text-[10px]" /> Voltar
          </button>
          <div
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-bold tracking-wider flex items-center gap-1.5 ${
              realtimeConnected
                ? 'bg-[#00FF66]/10 border-[#00FF66]/40 text-[#00FF66]'
                : 'bg-[#FFC107]/10 border-[#FFC107]/40 text-[#FFC107]'
            }`}
            title={
              realtimeConnected
                ? 'Ligado ao stream de eventos (SSE)'
                : 'SSE indisponível — a usar polling a cada 5s'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                realtimeConnected ? 'bg-[#00FF66] animate-pulse' : 'bg-[#FFC107]'
              }`}
            />
            {realtimeConnected ? 'REALTIME' : 'POLLING'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canToggle && (
            <button onClick={handleTogglePause} disabled={toggling} className={`px-4 py-2.5 font-semibold text-sm rounded-lg flex items-center gap-2 transition-all disabled:opacity-60 ${scan.status === 'paused' ? 'bg-[#00FF66] text-black hover:bg-[#00E676] shadow-[0_0_20px_rgba(0,255,102,0.3)]' : 'bg-[#FFC107] text-black hover:bg-amber-400'}`}>
              {toggling ? <i className="fa-solid fa-spinner animate-spin" /> : <i className={`fa-solid ${scan.status === 'paused' ? 'fa-play' : 'fa-pause'}`} />}
              {toggling ? 'A processar…' : scan.status === 'paused' ? 'Retomar' : 'Pausar'}
            </button>
          )}
          <button onClick={() => setDeleteOpen(true)} className="px-4 py-2.5 bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] font-semibold text-sm rounded-lg flex items-center gap-2 transition-all">
            <i className="fa-solid fa-trash" /> Eliminar
          </button>
          <button onClick={handleExport} disabled={exporting} className="px-4 py-2.5 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676] flex items-center gap-2 disabled:opacity-60 transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)]">
            {exporting ? <i className="fa-solid fa-spinner animate-spin" /> : <i className="fa-solid fa-file-pdf" />}
            {exporting ? 'A gerar…' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Título */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold text-white break-all">Scan — {target}</h2>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
            <span className={`inline-flex items-center gap-1.5 font-mono ${st.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
              {statusLabel}
            </span>
            <span className="text-gray-500 font-mono text-xs">Criado em {fmtDateTime(scan.created_at)}</span>
            {scan.completed_at && (
              <span className="text-gray-500 font-mono text-xs">Concluído em {fmtDateTime(scan.completed_at)}</span>
            )}
            {lastUpdated && (
              <span className="text-gray-500 font-mono text-xs">
                · atualizado {lastUpdated.toLocaleTimeString('pt-PT')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progresso */}
      {isRunning && (
        <div className="cyber-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-[#FFC107] flex items-center gap-2">
              <i className="fa-solid fa-spinner animate-spin" /> A executar…
            </span>
            <span className="text-xs font-mono font-bold text-[#FFC107]">{scan.progress ?? 0}%</span>
          </div>
          <div className="h-2 w-full bg-black rounded-full overflow-hidden border border-[#1A2130]">
            <div className="h-full rounded-full bg-[#FFC107] transition-all duration-500 progress-shimmer" style={{ width: `${scan.progress ?? 0}%` }} />
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cyber-card rounded-2xl p-5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Score</span>
          <div className="text-3xl font-mono font-bold mt-2 text-[#00FF66]">{scoreLabel}</div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Duração</span>
          <div className="text-3xl font-mono font-bold mt-2 text-white">{durationLabel}</div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Módulos</span>
          <div className="text-3xl font-mono font-bold mt-2 text-white">{modulesLabel}</div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Vulnerabilidades</span>
          <div className="text-3xl font-mono font-bold mt-2 text-[#FFC107]">{vulnCount}</div>
          {vulnCount > 0 && (
            <div className="flex items-center gap-2 mt-2 text-[10px] font-mono flex-wrap">
              {vulnsBySeverity.critical > 0 && <span className="text-[#FF2E54]">C:{vulnsBySeverity.critical}</span>}
              {vulnsBySeverity.high > 0 && <span className="text-[#FF8800]">H:{vulnsBySeverity.high}</span>}
              {vulnsBySeverity.medium > 0 && <span className="text-[#FFC107]">M:{vulnsBySeverity.medium}</span>}
              {vulnsBySeverity.low > 0 && <span className="text-[#00B0FF]">L:{vulnsBySeverity.low}</span>}
              {vulnsBySeverity.info > 0 && <span className="text-gray-400">I:{vulnsBySeverity.info}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Erro */}
      {scan.error_message && (
        <div className="cyber-card rounded-2xl p-4 border-[#FF2E54]/30">
          <p className="text-xs font-mono text-[#FF2E54] flex items-start gap-2">
            <i className="fa-solid fa-circle-exclamation mt-0.5" />
            <span>{scan.error_message}</span>
          </p>
        </div>
      )}

      {/* Log */}
      <div className="cyber-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <i className="fa-solid fa-terminal text-[#00FF66]" /> Log de Execução
          </h3>
          <span className="text-[10px] font-mono text-gray-500">{logs.length} {logs.length === 1 ? 'entrada' : 'entradas'}</span>
        </div>
        <div className="p-4 font-mono text-xs space-y-1 max-h-[400px] overflow-y-auto bg-black/60 rounded-xl border border-[#1A2130]">
          {logs.length ? logs.map((l, i) => {
            const lvl = (l.level || 'INFO').toUpperCase();
            const color = lvl === 'ERROR' || lvl === 'CRITICAL' ? 'text-[#FF2E54]' : lvl === 'WARN' || lvl === 'WARNING' ? 'text-[#FFC107]' : 'text-[#00FF66]';
            return (
              <div key={i} className="flex gap-3 py-1">
                <span className="text-gray-600 shrink-0 w-16">{l.time || '—'}</span>
                <span className={`shrink-0 w-16 ${color}`}>[{lvl}]</span>
                <span className="text-gray-300 break-all">{l.message}</span>
              </div>
            );
          }) : (
            <div className="text-gray-500 text-center py-4">Sem logs registados.</div>
          )}
        </div>
      </div>

      {/* Tabela de vulnerabilidades */}
      <div className="cyber-card rounded-2xl overflow-hidden">
        <div className="px-6 md:px-8 py-5 border-b border-[#1A2130]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
            <i className="fa-solid fa-bug text-[#00FF66]" /> Vulnerabilidades{' '}
            <span className="text-xs font-mono text-gray-500 font-normal">({vulnCount})</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse admin-table">
            <thead>
              <tr className="bg-black/50 text-[10px] font-mono uppercase text-gray-500 tracking-wider border-b border-[#1A2130]">
                <th className="py-3.5 px-6 font-bold">Severidade</th>
                <th className="py-3.5 px-4 font-bold">Título</th>
                <th className="py-3.5 px-4 font-bold">CWE</th>
                <th className="py-3.5 px-4 font-bold">CVSS</th>
                <th className="py-3.5 px-4 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2130]/60 text-xs">
              {vulns.map((v) => (
                <tr key={v.id}>
                  <td className="py-4 px-6 whitespace-nowrap">
                    <SeverityBadge severity={SEV_MAP[v.severity] || 'INFO'} />
                  </td>
                  <td className="py-4 px-4">
                    <p className="font-semibold text-white">{v.title || v.description || '—'}</p>
                    {v.affected_url && (
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5 break-all">{v.affected_url}</p>
                    )}
                  </td>
                  <td className="py-4 px-4 font-mono text-gray-400 text-[11px]">{v.cwe || '—'}</td>
                  <td className="py-4 px-4 font-mono text-gray-400 text-[11px]">{v.cvss ?? '—'}</td>
                  <td className="py-4 px-4">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      {v.status || 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
              {vulns.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500 font-mono text-xs">Nenhuma vulnerabilidade para este scan.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal eliminar */}
      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="ELIMINAR SCAN"
        icon="fa-trash"
        iconColor="text-[#FF2E54]"
        maxWidth="max-w-md"
        footer={
          <>
            <button onClick={() => setDeleteOpen(false)} disabled={deleting} className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50">Cancelar</button>
            <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 bg-[#FF2E54] hover:bg-red-600 text-white text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50 inline-flex items-center gap-2">
              {deleting && <i className="fa-solid fa-spinner animate-spin" />}
              {deleting ? 'A eliminar…' : 'Eliminar'}
            </button>
          </>
        }
      >
        <p className="text-xs text-gray-300">
          Eliminar o scan de <strong className="text-white break-all">{target}</strong>?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2">
          Todas as {vulnCount} vulnerabilidades associadas serão removidas. Ação irreversível.
        </p>
      </Modal>
    </>
  );
};

export default ScanDetail;