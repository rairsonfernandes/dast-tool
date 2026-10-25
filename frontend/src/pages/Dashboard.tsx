import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SeverityBadge from '@/components/dashboard/SeverityBadge';
import Modal from '@/components/dashboard/Modal';
import { useToast } from '@/layouts/DashboardLayout';
import { api } from '@/lib/api';

// ============================================
// TIPOS
// ============================================
type FindingStatus = 'pending' | 'fixing' | 'fixed' | 'ignored';

interface Finding {
  id: number;
  severity: 'MEDIUM' | 'LOW';
  title: string;
  cwe: string;
  cvss?: number;
  target: string;
  status: FindingStatus;
  remediation?: string;
  description?: string;
}

interface DashboardEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

interface RadarPoint {
  top: string;
  left: string;
  color: 'green' | 'red' | 'amber';
}

interface DashboardHealth {
  cpu: number;
  ram: number;
  disk: number;
  network: number;
  region: string;
  version: string;
  uptime_days: number;
  last_backup: string;
}

interface DashboardRadar {
  target: string;
  openPorts: number;
  packets: string;
  points: RadarPoint[];
}

interface DashboardStats {
  threatsBlocked: number | null;
  threatsBlockedDelta?: number | null;
  securityScore: number | null;
  activeScans: number;
  criticalVulns: number;
  totalScans: number;
  completedScans: number;
  failedScans: number;
  findings: { severity: string; count: number }[];
  recentEvents: DashboardEvent[];
  health?: DashboardHealth | null;
  radar?: DashboardRadar | null;
}

interface ApiScan {
  id: string;
  url: string;
  status: string;
  created_at?: string;
  completed_at?: string | null;
  duration_seconds?: number | null;
  score?: number | null;
}

/**
 * Payload recebido por SSE. O backend deve enviar JSON.
 * Ex: { type: 'scan.completed', scanId, url, ts }
 *     { type: 'finding.fixed', findingId, status: 'fixed' }
 */
interface RealtimeEvent {
  type: string;
  ts?: number;
  [key: string]: any;
}

// ============================================
// HELPERS
// ============================================
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 25,
  high: 10,
  medium: 4,
  low: 1,
  info: 0,
};

function computeScore(findings: { severity: string; count: number }[]): number | null {
  if (!findings.length) return null;
  const penalty = findings.reduce(
    (acc, f) => acc + (SEVERITY_WEIGHTS[f.severity.toLowerCase()] ?? 0) * f.count,
    0,
  );
  return Math.max(0, 100 - penalty);
}

function mapEventType(type: string): {
  color: string;
  iconColor: string;
  icon: string;
  warn: boolean;
} {
  switch (type) {
    case 'security':
      return { color: 'border-[#FF2E54]', iconColor: 'text-[#FF2E54]', icon: 'fa-shield-halved', warn: true };
    case 'info':
      return { color: 'border-[#FFC107]', iconColor: 'text-[#FFC107]', icon: 'fa-clock', warn: false };
    case 'system':
      return { color: 'border-[#00FF66]', iconColor: 'text-[#00FF66]', icon: 'fa-gear', warn: false };
    case 'scan':
    default:
      return { color: 'border-[#00FF66]', iconColor: 'text-[#00FF66]', icon: 'fa-check', warn: false };
  }
}

function normalizeStatus(s: string | undefined): FindingStatus {
  const v = (s || '').toLowerCase();
  if (v === 'fixing' || v === 'fixed' || v === 'ignored') return v;
  return 'pending';
}

function eventsFromScans(scans: ApiScan[]): DashboardEvent[] {
  const out: DashboardEvent[] = [];
  const now = Date.now();

  for (const s of scans.slice(0, 6)) {
    if (s.created_at) {
      const d = new Date(s.created_at);
      const diffMin = Math.round((now - d.getTime()) / 60000);
      const ts =
        diffMin < 1
          ? 'agora'
          : diffMin < 60
          ? `há ${diffMin} min`
          : `${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
      out.push({
        id: `scan-created-${s.id}`,
        type: 'scan',
        message: `Novo scan iniciado para ${s.url}`,
        timestamp: ts,
      });
    }
    if (s.status === 'completed' && s.completed_at) {
      const d = new Date(s.completed_at);
      out.push({
        id: `scan-done-${s.id}`,
        type: 'info',
        message: `Scan concluído em ${s.duration_seconds ?? '?'}s — ${s.url}`,
        timestamp: d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
      });
    }
    if (s.status === 'failed') {
      out.push({
        id: `scan-fail-${s.id}`,
        type: 'security',
        message: `Scan falhou — ${s.url}`,
        timestamp: s.created_at
          ? new Date(s.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
          : '—',
      });
    }
  }

  return out.slice(0, 8);
}

const STATUS_LABEL: Record<FindingStatus, string> = {
  pending: 'Pendente',
  fixing: 'Em correção',
  fixed: 'Corrigido',
  ignored: 'Ignorado',
};

const STATUS_STYLE: Record<FindingStatus, { text: string; dot: string }> = {
  pending: { text: 'text-amber-400/90', dot: 'bg-amber-400 animate-pulse' },
  fixing: { text: 'text-[#FFC107]', dot: 'bg-[#FFC107] animate-pulse' },
  fixed: { text: 'text-[#00FF66]', dot: 'bg-[#00FF66]' },
  ignored: { text: 'text-gray-500', dot: 'bg-gray-500' },
};

/** Tipos de evento SSE que disparam refresh dos dados. */
const REFRESH_EVENT_TYPES = new Set([
  'scan.created',
  'scan.started',
  'scan.completed',
  'scan.failed',
  'scan.cancelled',
  'vulnerability.created',
  'vulnerability.updated',
  'vulnerability.fixed',
  'vulnerability.ignored',
  'finding.fixed',
  'finding.ignored',
  'mitigation.started',
  'mitigation.completed',
  'mitigation.failed',
  'audit.log',
]);

// ============================================
// COMPONENTE
// ============================================
const Dashboard = () => {
  const { showToast } = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<'TODOS' | 'MEDIO' | 'BAIXO'>('TODOS');
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [mitigating, setMitigating] = useState(false);

  // Refs para SSE e debounce de refresh
  const sseRef = useRef<EventSource | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const loadDataRef = useRef<(isRefresh?: boolean) => Promise<void>>();

  // Aviso de redirect de /admin
  useEffect(() => {
    if (params.get('forbidden') === 'admin') {
      showToast('Não tens permissão para aceder ao Admin Console.', 'error');
      const newParams = new URLSearchParams(params);
      newParams.delete('forbidden');
      setParams(newParams, { replace: true });
    }
  }, [params, setParams, showToast]);

  // ============================================
  // FETCH — stats + vulnerabilities + scans
  // ============================================
  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const [statsRes, vulnsRes, scansRes] = await Promise.allSettled([
          api.get<DashboardStats>('/api/dashboard/stats'),
          api.get<{ items: any[] }>('/api/vulnerabilities'),
          api.get<{ items: ApiScan[] }>('/api/scans'),
        ]);

        if (statsRes.status === 'rejected') {
          throw statsRes.reason;
        }

        const d = statsRes.value.data;
        setStats({
          ...d,
          findings: d.findings ?? [],
          recentEvents: d.recentEvents ?? [],
          health: d.health ?? null,
          radar: d.radar ?? null,
          threatsBlocked: d.threatsBlocked ?? null,
          securityScore: d.securityScore ?? null,
        });

        // Eventos: prefere backend (AuditLog). Se vazio, deriva dos scans.
        let evs: DashboardEvent[] = d.recentEvents ?? [];
        if (evs.length === 0 && scansRes.status === 'fulfilled') {
          const scans = scansRes.value.data?.items ?? [];
          evs = eventsFromScans(scans);
        }
        setEvents(evs);

        // Vulnerabilidades → Findings
        const items =
          vulnsRes.status === 'fulfilled' ? vulnsRes.value.data?.items ?? [] : [];

        const mapped: Finding[] = items
          .filter((v: any) => {
            const s = (v.severity || '').toLowerCase();
            return s === 'medium' || s === 'low';
          })
          .slice(0, 10)
          .map((v: any) => ({
            id: v.id,
            severity: (v.severity || '').toLowerCase() === 'medium' ? 'MEDIUM' : 'LOW',
            title: v.title || v.description || 'Finding',
            cwe: v.cwe ? `${v.cwe}${v.cvss != null ? ` · CVSS ${v.cvss}` : ''}` : '',
            cvss: v.cvss,
            target: v.affected_url || v.url || '—',
            status: normalizeStatus(v.status),
            remediation: v.remediation,
            description: v.description,
          }));

        setFindings(mapped);
        setLastUpdated(new Date());

        if (isRefresh) showToast('Dados atualizados.', 'success');
      } catch (err: any) {
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          'Falha ao carregar dados do dashboard.';
        setError(msg);
        setStats(null);
        setFindings([]);
        setEvents([]);
        if (isRefresh) showToast(msg, 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast],
  );

  // Manter ref atualizada (permite usar dentro de handlers sem recriar conexões SSE)
  loadDataRef.current = loadData;

  /** Agenda refresh debounced (evita rajadas de eventos SSE). */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      loadDataRef.current?.(true);
    }, 400);
  }, []);

  // ============================================
  // REALTIME — SSE + fallback polling
  // ============================================
  useEffect(() => {
    let disposed = false;
    let pollTimer: number | null = null;

    const startPollingFallback = () => {
      if (pollTimer != null) return;
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadDataRef.current?.(false);
        }
      }, 15_000);
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
          // Ao (re)conectar, puxa estado fresco (pode ter perdido eventos)
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

          if (REFRESH_EVENT_TYPES.has(payload.type)) {
            scheduleRefresh();

            // Feedback imediato
            if (payload.type === 'scan.completed') {
              showToast('Scan concluído. A atualizar dashboard…', 'success');
            } else if (payload.type === 'scan.failed') {
              showToast('Um scan falhou. A atualizar dashboard…', 'error');
            } else if (payload.type === 'mitigation.completed') {
              showToast('Mitigação concluída.', 'success');
            } else if (payload.type === 'mitigation.failed') {
              showToast('Mitigação falhou.', 'error');
            }
          }

          // Otimização local: aplica já status novo no finding (sem esperar refresh)
          if (
            (payload.type === 'vulnerability.updated' ||
              payload.type === 'finding.fixed' ||
              payload.type === 'mitigation.completed') &&
            payload.findingId != null
          ) {
            const newStatus = normalizeStatus(payload.status);
            setFindings((prev) =>
              prev.map((f) =>
                f.id === Number(payload!.findingId) ? { ...f, status: newStatus } : f,
              ),
            );
            setSelectedFinding((prev) =>
              prev && prev.id === Number(payload!.findingId)
                ? { ...prev, status: newStatus }
                : prev,
            );
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

    // Segurança: se SSE nunca abrir (endpoint inexistente), força polling
    const safety = window.setTimeout(() => {
      if (!disposed && !sseRef.current?.onopen) {
        startPollingFallback();
      }
    }, 20_000);

    // Revalidar ao voltar a ficar visível / focado
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadDataRef.current?.(false);
      }
    };
    const onFocus = () => loadDataRef.current?.(false);

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

  // Carregamento inicial
  useEffect(() => {
    loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================
  // DERIVADOS
  // ============================================
  const filteredFindings = useMemo(
    () =>
      findings.filter((f) =>
        filter === 'TODOS' ? true : filter === 'MEDIO' ? f.severity === 'MEDIUM' : f.severity === 'LOW',
      ),
    [findings, filter],
  );

  const totalFindings = useMemo(
    () => stats?.findings?.reduce((a, b) => a + b.count, 0) ?? findings.length,
    [stats, findings],
  );

  const derivedScore = useMemo<number | null>(() => {
    if (stats?.securityScore != null) return stats.securityScore;
    if (stats?.findings?.length) return computeScore(stats.findings);
    return null;
  }, [stats]);

  const hasScore = derivedScore !== null;

  // ============================================
  // AÇÕES
  // ============================================
  const handleMitigate = async () => {
    if (!selectedFinding) return;
    setMitigating(true);

    // Atualização otimista — reflete "Em correção" imediatamente
    const findingId = selectedFinding.id;
    setFindings((prev) =>
      prev.map((f) => (f.id === findingId ? { ...f, status: 'fixing' } : f)),
    );
    setSelectedFinding((prev) =>
      prev && prev.id === findingId ? { ...prev, status: 'fixing' } : prev,
    );

    try {
      await api.post(`/api/vulnerabilities/${findingId}/fix`);
      showToast('Fluxo de mitigação iniciado com sucesso!', 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao iniciar mitigação.', 'error');
      // Reverter otimismo
      setFindings((prev) =>
        prev.map((f) => (f.id === findingId ? { ...f, status: 'pending' } : f)),
      );
      setSelectedFinding((prev) =>
        prev && prev.id === findingId ? { ...prev, status: 'pending' } : prev,
      );
    } finally {
      setMitigating(false);
    }
  };

  // ============================================
  // ESTADOS
  // ============================================
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 font-mono text-xs">
        <i className="fa-solid fa-spinner animate-spin mr-2" /> A carregar dashboard…
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="cyber-card rounded-2xl p-8 text-center">
        <i className="fa-solid fa-triangle-exclamation text-[#FF2E54] text-3xl mb-3" />
        <p className="text-white font-semibold mb-1">Não foi possível carregar os dados</p>
        <p className="text-gray-400 text-xs font-mono mb-4">{error}</p>
        <button
          onClick={() => loadData(false)}
          className="px-4 py-2 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676]"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const health = stats?.health ?? null;
  const radar = stats?.radar ?? null;

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      {/* Título + Atualizar + Estado realtime */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Visão Geral de Segurança</h2>
          <p className="text-sm text-gray-400 mt-1">
            Monitorização em tempo real das ameaças e integridade dos sistemas.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* Indicador REALTIME / POLLING */}
          <div
            className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono font-bold tracking-wider flex items-center gap-1.5 ${
              realtimeConnected
                ? 'bg-[#00FF66]/10 border-[#00FF66]/40 text-[#00FF66]'
                : 'bg-[#FFC107]/10 border-[#FFC107]/40 text-[#FFC107]'
            }`}
            title={
              realtimeConnected
                ? 'Ligado ao stream de eventos (SSE)'
                : 'SSE indisponível — a usar polling a cada 15s'
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
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="px-4 py-2.5 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <i className={`fa-solid fa-arrows-rotate ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'A atualizar…' : 'Atualizar Dados'}
          </button>
        </div>
      </div>

      {/* 4 METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ameaças Bloqueadas */}
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              Ameaças Bloqueadas
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-shield-virus text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">
            {stats?.threatsBlocked != null ? stats.threatsBlocked.toLocaleString('pt-PT') : '—'}
          </div>
          {stats?.threatsBlockedDelta != null ? (
            <div
              className={`text-[11px] flex items-center gap-1 font-mono ${
                stats.threatsBlockedDelta >= 0 ? 'text-[#00FF66]' : 'text-[#FF2E54]'
              }`}
            >
              <i
                className={`fa-solid fa-arrow-trend-${
                  stats.threatsBlockedDelta >= 0 ? 'up' : 'down'
                }`}
              />
              {stats.threatsBlockedDelta >= 0 ? '+' : ''}
              {stats.threatsBlockedDelta}% nas últimas 24h
            </div>
          ) : (
            <div className="text-[11px] text-gray-500 font-mono">Sem variação registada</div>
          )}
        </div>

        {/* Score */}
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              Score de Segurança
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-gauge-high text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">
            {hasScore ? (
              <>
                {derivedScore}
                <span className="text-base text-gray-500">/100</span>
              </>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </div>
          <div
            className={`text-[11px] flex items-center gap-1 font-mono ${
              hasScore ? 'text-[#00FF66]' : 'text-gray-500'
            }`}
          >
            <i className={`fa-solid ${hasScore ? 'fa-circle-check' : 'fa-circle-minus'}`} />
            {!hasScore
              ? 'Sem scans'
              : derivedScore! >= 90
              ? 'Nível Excelente'
              : derivedScore! >= 70
              ? 'Nível Bom'
              : 'Requer atenção'}
          </div>
        </div>

        {/* Scans */}
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              Scans Totais
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-network-wired text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">{stats?.totalScans ?? 0}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5 font-mono">
            <i className="fa-solid fa-spinner animate-spin text-[#00FF66]" />{' '}
            {stats?.activeScans ?? 0} ativos
          </div>
        </div>

        {/* Vulnerabilidades Críticas */}
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              Vulnerabilidades Críticas
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#FF2E54]/10 border border-[#FF2E54]/30 flex items-center justify-center">
              <i className="fa-solid fa-triangle-exclamation text-[#FF2E54] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-[#FF2E54] mb-1">
            {stats?.criticalVulns ?? 0}
          </div>
          <div className="text-[11px] text-[#FF2E54]/80 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-circle-exclamation" />
            {(stats?.criticalVulns ?? 0) > 0 ? 'Requer atenção imediata' : 'Nenhuma crítica'}
          </div>
        </div>
      </div>

      {/* SECURITY SCORE */}
      <div className="cyber-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center justify-between pb-5 border-b border-[#1A2130]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
              <i className="fa-solid fa-shield-heart text-base" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Security Score</h2>
              <p className="text-xs text-gray-400 font-mono">Avaliação em tempo real</p>
            </div>
          </div>
          {hasScore ? (
            <div
              className={`px-4 py-1.5 rounded-full text-xs font-mono font-bold tracking-widest flex items-center gap-2 ${
                derivedScore! >= 70
                  ? 'bg-[#00FF66]/10 border border-[#00FF66]/40 text-[#00FF66] shadow-[0_0_20px_rgba(0,255,102,0.3)]'
                  : 'bg-[#FFC107]/10 border border-[#FFC107]/40 text-[#FFC107]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  derivedScore! >= 70 ? 'bg-[#00FF66]' : 'bg-[#FFC107]'
                }`}
              />
              {derivedScore! >= 70 ? 'SAUDÁVEL' : 'ATENÇÃO'}
            </div>
          ) : (
            <div className="px-4 py-1.5 rounded-full bg-gray-500/10 border border-gray-500/30 text-gray-400 text-xs font-mono font-bold tracking-widest">
              SEM DADOS
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-center">
          <div className="flex justify-center">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle
                  className="text-[#1A2130]"
                  strokeWidth={8}
                  stroke="currentColor"
                  fill="transparent"
                  r={40}
                  cx={50}
                  cy={50}
                />
                {hasScore && (
                  <>
                    <circle
                      className="text-[#00FF66] opacity-20"
                      strokeWidth={12}
                      stroke="currentColor"
                      fill="transparent"
                      r={40}
                      cx={50}
                      cy={50}
                      strokeDasharray="251.2"
                      strokeDashoffset="0"
                    />
                    <circle
                      className="text-[#00FF66] gauge-circle"
                      strokeWidth={8}
                      stroke="currentColor"
                      fill="transparent"
                      r={40}
                      cx={50}
                      cy={50}
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 - (derivedScore! / 100) * 251.2}
                      strokeLinecap="round"
                    />
                  </>
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {hasScore ? (
                  <>
                    <span className="text-5xl font-black font-mono text-white tracking-tighter">
                      {derivedScore}
                    </span>
                    <span className="text-xs font-mono text-[#00FF66] font-bold border-t border-[#1A2130]/80 pt-1 px-3 mt-0.5">
                      / 100
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-mono text-gray-500">—</span>
                    <span className="text-[10px] font-mono text-gray-500 mt-1">Sem scans</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                icon: 'fa-triangle-exclamation',
                color: 'text-[#FF2E54]',
                label: 'Ameaças Críticas',
                value: `${stats?.criticalVulns ?? 0} críticas`,
              },
              {
                icon: 'fa-circle-check',
                color: 'text-[#00FF66]',
                label: 'Ações de Mitigação',
                value: `${stats?.completedScans ?? 0} resolvidas`,
              },
              {
                icon: 'fa-server',
                color: 'text-[#00FF66]',
                label: 'Infraestrutura',
                value: health ? `${health.cpu}% CPU` : '—',
              },
              {
                icon: 'fa-bug',
                color: 'text-[#FFC107]',
                label: 'Findings Ativos',
                value: `${totalFindings} em aberto`,
              },
            ].map((k, i) => (
              <div key={i} className="kpi-card rounded-xl p-4 flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg bg-current/10 border border-current/20 flex items-center justify-center ${k.color}`}
                >
                  <i className={`fa-solid ${k.icon} text-xs`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                    {k.label}
                  </p>
                  <p
                    className={`text-sm font-semibold truncate ${
                      k.color === 'text-[#00FF66]' ? 'text-[#00FF66]' : 'text-white'
                    }`}
                  >
                    {k.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DISTRIBUIÇÃO DE FINDINGS */}
      <div className="cyber-card rounded-2xl p-6 md:p-8">
        <div className="flex items-center justify-between pb-5 border-b border-[#1A2130]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
              <i className="fa-solid fa-chart-bar text-base" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Distribuição de Findings</h2>
              <p className="text-xs text-gray-400 font-mono">Análise de severidade</p>
            </div>
          </div>
          <div className="px-3.5 py-1.5 rounded-xl bg-[#11151E] border border-[#1A2130] font-mono text-xs font-bold text-gray-300 tracking-wider">
            TOTAL:{' '}
            <span className="text-[#00FF66] font-extrabold text-sm ml-1">{totalFindings}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-6">
          {[
            { label: 'Crítico', key: 'CRITICAL', color: '#FF2E54' },
            { label: 'Alto', key: 'HIGH', color: '#FF8800' },
            { label: 'Médio', key: 'MEDIUM', color: '#FFC107' },
            { label: 'Baixo', key: 'LOW', color: '#00B0FF' },
          ].map((s, i) => {
            const count =
              stats?.findings?.find((f) => f.severity.toUpperCase() === s.key)?.count ?? 0;
            const total = stats?.findings?.reduce((a, b) => a + b.count, 0) || 1;
            const pct = (count / total) * 100;
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-400 font-semibold flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{' '}
                    {s.label}
                  </span>
                  <span className="font-bold" style={{ color: count > 0 ? s.color : '#6B7280' }}>
                    {count}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-[#070709] rounded-full overflow-hidden border border-[#1A2130]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: s.color,
                      boxShadow: pct > 0 ? `0 0 10px ${s.color}80` : 'none',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RADAR + EVENTOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 cyber-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
              <i className="fa-solid fa-radar text-[#00FF66]" /> Radar de Varredura de Rede
            </h3>
            {radar?.target && (
              <span className="text-[10px] font-mono text-gray-400 bg-black/50 px-3 py-1 rounded-full border border-[#1A2130]">
                Live Target: <span className="text-[#00FF66]">{radar.target}</span>
              </span>
            )}
          </div>

          <div className="relative h-72 bg-black/60 rounded-xl border border-[#1A2130]/80 flex items-center justify-center overflow-hidden grid-bg">
            <div className="absolute w-64 h-64 rounded-full border border-[#00FF66]/15" />
            <div className="absolute w-48 h-48 rounded-full border border-[#00FF66]/20" />
            <div className="absolute w-32 h-32 rounded-full border border-[#00FF66]/25" />
            <div className="absolute w-16 h-16 rounded-full border border-[#00FF66]/40" />
            <div className="absolute w-full h-px bg-[#00FF66]/15" />
            <div className="absolute h-full w-px bg-[#00FF66]/15" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="w-32 h-32 origin-center bg-gradient-to-r from-[#00FF66]/25 via-[#00FF66]/5 to-transparent rounded-full radar-spin"
                style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 100%)' }}
              />
            </div>

            {radar?.points?.map((p, i) => {
              const colorClass =
                p.color === 'red'
                  ? 'bg-[#FF2E54] shadow-lg'
                  : p.color === 'amber'
                  ? 'bg-[#FFC107]'
                  : 'bg-[#00FF66] shadow-[0_0_20px_rgba(0,255,102,0.3)]';
              const colorLabel =
                p.color === 'red' ? 'Crítico' : p.color === 'amber' ? 'Médio' : 'OK';
              return (
                <div
                  key={i}
                  className={`absolute w-2 h-2 rounded-full ${colorClass} group cursor-help`}
                  style={{ top: p.top, left: p.left }}
                  title={`Scan ${i + 1} · ${colorLabel}`}
                  aria-label={`Ponto de scan ${i + 1}, severidade ${colorLabel}`}
                >
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black border border-[#1A2130] text-[9px] font-mono text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {colorLabel}
                  </span>
                </div>
              );
            })}

            <span className="absolute bottom-3 left-3 text-[9px] font-mono text-[#00FF66] tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66] animate-ping" />
              SENTINEL-RADAR :: {radar ? 'ONLINE' : 'AGUARDA DADOS'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="flex items-center justify-between bg-black/40 border border-[#1A2130]/60 rounded-lg px-3 py-2">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                Portas Abertas
              </span>
              <span className="text-sm font-mono font-bold text-[#00FF66]">
                {radar?.openPorts ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between bg-black/40 border border-[#1A2130]/60 rounded-lg px-3 py-2">
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                Pacotes Analisados
              </span>
              <span className="text-sm font-mono font-bold text-white">
                {radar?.packets ?? '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="cyber-card rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
              <i className="fa-solid fa-terminal text-[#00FF66]" /> Eventos Recentes
            </h3>
            <span className="text-[9px] font-mono text-gray-500 bg-black/50 px-2 py-0.5 rounded border border-[#1A2130]">
              {events.length ? (realtimeConnected ? 'LIVE' : 'POLL') : 'VAZIO'}
            </span>
          </div>

          <div className="flex-1 space-y-2.5 font-mono text-xs overflow-y-auto max-h-80 pr-1">
            {events.length ? (
              events.map((e) => {
                const m = mapEventType(e.type);
                return (
                  <div key={e.id} className={`p-2.5 rounded-lg bg-black/40 border-l-2 ${m.color}`}>
                    <div
                      className={`text-[10px] flex items-center gap-1.5 ${
                        m.warn ? m.iconColor : 'text-gray-500'
                      }`}
                    >
                      <i className={`fa-solid ${m.icon} text-[9px]`} /> {e.timestamp}
                    </div>
                    <div className="text-gray-200 mt-1 text-[11px]">{e.message}</div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500 text-[11px] text-center py-8">
                Sem eventos recentes. Cria um scan para gerar atividade.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* TABELA DE ACHADOS */}
      <div className="cyber-card rounded-2xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 md:px-8 py-5 border-b border-[#1A2130]">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
              <i className="fa-solid fa-bug text-[#00FF66]" />
              Detalhamento de Achados
              <span className="text-xs font-mono text-gray-500 font-normal">
                ({findings.length})
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Lista de vulnerabilidades e configurações pendentes de análise.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400 hidden sm:inline">FILTRAR:</span>
            <div className="relative">
              <button
                onClick={() => setFilterOpen((o) => !o)}
                className="px-4 py-2 rounded-xl bg-[#11151E] border border-[#1A2130] text-xs font-mono font-bold text-[#00FF66] hover:border-[#00FF66] transition-all flex items-center gap-2"
              >
                <i className="fa-solid fa-filter text-xs" />
                <span>{filter}</span>
                <i className="fa-solid fa-chevron-down text-[10px]" />
              </button>
              {filterOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[#0B0E14] border border-[#1A2130] rounded-xl shadow-2xl z-20 py-2 text-xs font-mono">
                  {(['TODOS', 'MEDIO', 'BAIXO'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setFilter(f);
                        setFilterOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-[#11151E] ${
                        filter === f
                          ? 'text-[#00FF66] font-bold'
                          : f === 'MEDIO'
                          ? 'text-[#FFC107]'
                          : f === 'BAIXO'
                          ? 'text-[#00B0FF]'
                          : 'text-gray-300'
                      }`}
                    >
                      {f === 'MEDIO' ? 'MÉDIO' : f === 'BAIXO' ? 'BAIXO' : 'TODOS'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="admin-table w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/50 text-[10px] font-mono uppercase text-gray-500 tracking-wider border-b border-[#1A2130]">
                <th className="py-3.5 px-6 font-bold">Severidade</th>
                <th className="py-3.5 px-4 font-bold">Título do Finding</th>
                <th className="py-3.5 px-4 font-bold">Ativo Afetado</th>
                <th className="py-3.5 px-4 font-bold">Status</th>
                <th className="py-3.5 px-6 font-bold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2130]/60 text-xs">
              {filteredFindings.map((f) => {
                const st = STATUS_STYLE[f.status];
                return (
                  <tr key={f.id}>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <SeverityBadge severity={f.severity} />
                    </td>
                    <td className="py-4 px-4">
                      <p className="font-semibold text-white">{f.title}</p>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">{f.cwe}</p>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/40 border border-[#1A2130] font-mono text-[11px] text-gray-300">
                        <i className="fa-solid fa-globe text-[9px] text-gray-500" />
                        {f.target}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-medium ${st.text}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {STATUS_LABEL[f.status]}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedFinding(f);
                          setAnalysisOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#00FF66]/10 hover:bg-[#00FF66] hover:text-black border border-[#00FF66]/30 text-[#00FF66] font-mono text-[11px] font-bold transition-all"
                      >
                        Analisar <i className="fa-solid fa-arrow-right text-[9px]" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredFindings.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500 font-mono text-xs">
                    Nenhum finding corresponde ao filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 md:px-8 py-3.5 border-t border-[#1A2130] bg-black/20 flex items-center justify-between text-[10px] font-mono text-gray-500">
          <span>
            A mostrar <span className="text-white font-bold">{filteredFindings.length}</span> de{' '}
            <span className="text-white font-bold">{findings.length}</span> achados
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
      </div>

      {/* MODAL ANÁLISE */}
      <Modal
        open={analysisOpen}
        onClose={() => !mitigating && setAnalysisOpen(false)}
        title="ANÁLISE DE FINDING"
        icon="fa-microchip"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              onClick={() => setAnalysisOpen(false)}
              disabled={mitigating}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50"
            >
              Fechar
            </button>
            <button
              onClick={handleMitigate}
              disabled={
                mitigating ||
                selectedFinding?.status === 'fixed' ||
                selectedFinding?.status === 'fixing'
              }
              className="px-4 py-2 bg-[#00FF66] text-black hover:bg-[#00E676] text-xs font-mono font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] disabled:opacity-50 flex items-center gap-2"
            >
              {mitigating && <i className="fa-solid fa-spinner animate-spin" />}
              {selectedFinding?.status === 'fixed'
                ? 'Já corrigido'
                : selectedFinding?.status === 'fixing'
                ? 'Em correção…'
                : mitigating
                ? 'A mitigar…'
                : 'Iniciar Mitigação'}
            </button>
          </>
        }
      >
        {selectedFinding && (
          <div className="space-y-3 font-mono text-xs">
            <div>
              <span className="text-gray-500 block text-[10px]">TÍTULO DO FINDING:</span>
              <p className="text-white font-bold font-sans text-sm mt-0.5">
                {selectedFinding.title}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <span className="text-gray-500 block text-[10px]">ATIVO AFETADO:</span>
                <p className="text-[#00FF66] font-semibold mt-0.5">{selectedFinding.target}</p>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px]">SEVERIDADE:</span>
                <p
                  className={`font-bold mt-0.5 ${
                    selectedFinding.severity === 'MEDIUM' ? 'text-[#FFC107]' : 'text-[#00B0FF]'
                  }`}
                >
                  {selectedFinding.severity === 'MEDIUM' ? 'MÉDIO' : 'BAIXO'}
                </p>
              </div>
            </div>
            {selectedFinding.description && (
              <div>
                <span className="text-gray-500 block text-[10px]">DESCRIÇÃO:</span>
                <p className="text-gray-300 font-sans text-xs mt-0.5">
                  {selectedFinding.description}
                </p>
              </div>
            )}
            <div className="p-3 rounded-xl bg-black/60 border border-[#1A2130] space-y-1">
              <span className="text-gray-400 font-bold block">RECOMENDAÇÃO DE MITIGAÇÃO:</span>
              <p className="text-gray-300 font-sans text-xs">
                {selectedFinding.remediation || 'Sem recomendação registada.'}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default Dashboard;