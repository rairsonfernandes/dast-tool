import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/dashboard/Modal';
import { useToast } from '@/layouts/DashboardLayout';
import { api } from '@/lib/api';

// ============================================
// TIPOS
// ============================================
type Format = 'PDF' | 'CSV';
type ReportType = 'executive' | 'technical' | 'compliance' | 'incident';

interface Report {
  id: string;
  name: string;
  type: string;
  typeColor: string;
  format: Format;
  date: string;
  size: string;
  status: string;
  /** Token assinado devolvido pelo backend — usado para download sem 401 */
  download_token?: string;
}

interface ApiReport {
  id: string;
  name: string;
  type: string;
  format: string;
  file_size_bytes?: number;
  created_at: string;
  status?: string;
  download_token?: string;
}

interface ReportStatDay {
  date: string;
  label: string;
  weekday: string;
  count: number;
}

interface ReportStats {
  days: ReportStatDay[];
  total: number;
  range_days: number;
}

// ============================================
// HELPERS
// ============================================
function typeMeta(t: string): { color: string; label: string } {
  const lower = (t || '').toLowerCase();
  if (lower === 'executive' || lower === 'executivo')
    return { color: 'text-[#00FF66] bg-[#00FF66]/10 border-[#00FF66]/30', label: 'Executivo' };
  if (lower === 'technical' || lower === 'tecnico' || lower === 'técnico')
    return { color: 'text-[#00B0FF] bg-[#00B0FF]/10 border-[#00B0FF]/30', label: 'Técnico' };
  if (lower === 'compliance')
    return { color: 'text-[#FFC107] bg-[#FFC107]/10 border-[#FFC107]/30', label: 'Compliance' };
  if (lower === 'incident' || lower === 'incidente')
    return { color: 'text-[#FF2E54] bg-[#FF2E54]/10 border-[#FF2E54]/30', label: 'Incidente' };
  return { color: 'text-gray-300 bg-gray-500/10 border-gray-500/30', label: t || '—' };
}

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

function fmtSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const TYPE_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'executive', label: 'Executivo — Resumo de Segurança' },
  { value: 'technical', label: 'Técnico — Vulnerabilidades Detalhadas' },
  { value: 'compliance', label: 'Compliance — Inventário & Conformidade' },
  { value: 'incident', label: 'Incidente — Análise Forense' },
];

const PERIOD_OPTIONS = [
  { value: 'last_7_days', label: 'Últimos 7 dias' },
  { value: 'last_30_days', label: 'Últimos 30 dias' },
  { value: 'current_month', label: 'Mês atual' },
  { value: 'all', label: 'Tudo' },
];

// ============================================
// COMPONENTE
// ============================================
const Reports = () => {
  const { showToast } = useToast();

  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<'ALL' | 'PDF' | 'CSV'>('ALL');
  const [newReportOpen, setNewReportOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Form do modal
  const [genType, setGenType] = useState<ReportType>('executive');
  const [genFormat, setGenFormat] = useState<Format>('PDF');
  const [genPeriod, setGenPeriod] = useState('last_7_days');

  // Seleção + delete
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Report | null>(null);
  const [deleteBulkOpen, setDeleteBulkOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ============================================
  // FETCH
  // ============================================
  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get<ReportStats>('/api/reports/stats?days=7');
      setStats(data);
    } catch (err) {
      console.warn('[Reports] falha a puxar stats:', err);
      setStats(null);
    }
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const [reportsRes] = await Promise.all([
          api.get<{ items: ApiReport[]; total: number }>('/api/reports'),
          loadStats(),
        ]);

        const items = reportsRes.data?.items ?? [];

        const mapped: Report[] = items.map((r) => {
          const meta = typeMeta(r.type);
          const format: Format = (r.format || '').toUpperCase() === 'CSV' ? 'CSV' : 'PDF';
          return {
            id: r.id,
            name: r.name,
            type: meta.label,
            typeColor: meta.color,
            format,
            date: fmtDate(r.created_at),
            size: fmtSize(r.file_size_bytes),
            status: r.status || 'ready',
            download_token: r.download_token,
          };
        });

        setReports(mapped);
        setSelected((prev) => {
          const next = new Set<string>();
          const ids = new Set(mapped.map((m) => m.id));
          for (const id of prev) if (ids.has(id)) next.add(id);
          return next;
        });

        if (isRefresh) showToast('Relatórios atualizados.', 'success');
      } catch (err: any) {
        const msg = err?.response?.data?.error || 'Falha ao carregar relatórios.';
        setError(msg);
        setReports([]);
        setStats(null);
        setSelected(new Set());
        if (isRefresh) showToast(msg, 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadStats, showToast],
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================
  // DERIVADOS
  // ============================================
  const filtered = useMemo(
    () => reports.filter((r) => filter === 'ALL' || r.format === filter),
    [reports, filter],
  );

  const counts = useMemo(
    () => ({
      total: reports.length,
      pdf: reports.filter((r) => r.format === 'PDF').length,
      csv: reports.filter((r) => r.format === 'CSV').length,
    }),
    [reports],
  );

  const byType = useMemo(
    () => ({
      Executivo: reports.filter((r) => r.type === 'Executivo').length,
      'Técnico': reports.filter((r) => r.type === 'Técnico').length,
      Compliance: reports.filter((r) => r.type === 'Compliance').length,
      Incidente: reports.filter((r) => r.type === 'Incidente').length,
    }),
    [reports],
  );

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0;

  // ============================================
  // AÇÕES — Download (fix do 401)
  // ============================================
  const handleDownload = async (r: Report) => {
    try {
      // 1) tenta via fetch + blob (envia Bearer corretamente)
      const res = await api.get(`/api/reports/${r.id}/download`, { responseType: 'blob' });
      const mime = r.format === 'CSV' ? 'text/csv' : 'application/pdf';
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${r.id}.${r.format.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Download de "${r.name}" concluído.`, 'success');
    } catch (err: any) {
      // 2) fallback: abre com download_token na URL (sem 401)
      if (r.download_token) {
        const url = `/api/reports/${r.id}/download?token=${encodeURIComponent(r.download_token)}`;
        window.open(url, '_blank');
        showToast('A abrir download…', 'info');
        return;
      }
      showToast(err?.response?.data?.error || 'Falha ao descarregar.', 'error');
    }
  };

  // ============================================
  // AÇÕES — Gerar
  // ============================================
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post<ApiReport & { download_token?: string }>('/api/reports', {
        type: genType,
        format: genFormat,
        period: genPeriod,
      });
      showToast('Relatório gerado.', 'success');
      setNewReportOpen(false);

      // Se o backend devolveu download_token, abre logo o download
      if (data.download_token) {
        const url = `/api/reports/${data.id}/download?token=${encodeURIComponent(data.download_token)}`;
        window.open(url, '_blank');
      }

      await load(true);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao gerar relatório.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const openNewReport = () => {
    setGenType('executive');
    setGenFormat('PDF');
    setGenPeriod('last_7_days');
    setNewReportOpen(true);
  };

  // ============================================
  // AÇÕES — Delete individual
  // ============================================
  const handleDeleteOne = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/reports/${deleteTarget.id}`);
      setReports((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      showToast('Relatório eliminado.', 'success');
      setDeleteTarget(null);
      loadStats();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao eliminar.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ============================================
  // AÇÕES — Delete bulk
  // ============================================
  const handleDeleteBulk = async () => {
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      await api.delete('/api/reports/bulk', {
        data: { ids },
        headers: { 'X-Confirm-Delete': 'yes' },
      });
      setReports((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      showToast(`${ids.length} relatório(s) eliminado(s).`, 'success');
      setDeleteBulkOpen(false);
      loadStats();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao eliminar.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ============================================
  // AÇÕES — Delete todos
  // ============================================
  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      await api.delete('/api/reports', {
        headers: { 'X-Confirm-Delete': 'yes' },
      });
      setReports([]);
      setSelected(new Set());
      showToast('Todos os relatórios foram eliminados.', 'success');
      setDeleteAllOpen(false);
      loadStats();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Falha ao eliminar todos.', 'error');
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
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((r) => r.id));
    });
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      {/* Título */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Relatórios & Compliance</h2>
          <p className="text-sm text-gray-400 mt-1">
            Exporte relatórios técnicos e executivos em PDF ou CSV.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setDeleteAllOpen(true)}
            disabled={reports.length === 0}
            className="px-3 py-2.5 bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Eliminar todos os relatórios"
          >
            <i className="fa-solid fa-trash text-[10px]" />
            <span className="hidden sm:inline">Eliminar Todos</span>
          </button>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            aria-label="Atualizar relatórios"
            className="px-3 py-2.5 bg-[#11151E] border border-[#1A2130] text-gray-300 text-sm font-semibold rounded-lg hover:border-[#00FF66] hover:text-[#00FF66] transition-all disabled:opacity-60"
          >
            <i className={`fa-solid fa-arrows-rotate ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openNewReport}
            className="px-4 py-2.5 bg-[#00FF66] text-black font-semibold text-sm rounded-lg hover:bg-[#00E676] transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] flex items-center gap-2"
          >
            <i className="fa-solid fa-plus" /> Novo Relatório
          </button>
        </div>
      </div>

      {/* 3 METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              Total
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/20 flex items-center justify-center">
              <i className="fa-solid fa-file-lines text-[#00FF66] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">{counts.total}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-list text-gray-500" /> Relatórios gerados
          </div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">PDF</span>
            <div className="w-8 h-8 rounded-lg bg-[#FF2E54]/10 border border-[#FF2E54]/20 flex items-center justify-center">
              <i className="fa-solid fa-file-pdf text-[#FF2E54] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">{counts.pdf}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-check text-[#00FF66]" /> Disponíveis
          </div>
        </div>
        <div className="cyber-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">CSV</span>
            <div className="w-8 h-8 rounded-lg bg-[#00B0FF]/10 border border-[#00B0FF]/20 flex items-center justify-center">
              <i className="fa-solid fa-file-csv text-[#00B0FF] text-sm" />
            </div>
          </div>
          <div className="text-3xl font-mono font-bold text-white mb-1">{counts.csv}</div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono">
            <i className="fa-solid fa-check text-[#00FF66]" /> Disponíveis
          </div>
        </div>
      </div>

      {/* GRÁFICO */}
      <div className="cyber-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
              <i className="fa-solid fa-chart-column text-base" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Relatórios Gerados</h3>
              <p className="text-xs text-gray-400 font-mono">
                Últimos {stats?.range_days ?? 7} dias
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-gray-500 bg-[#11151E] px-3 py-1.5 rounded-lg border border-[#1A2130]">
            TOTAL: <span className="text-[#00FF66] font-bold">{stats?.total ?? 0}</span>
          </span>
        </div>

        {stats && stats.days.length > 0 ? (
          (() => {
            const maxCount = Math.max(1, ...stats.days.map((d) => d.count));
            const todayIso = new Date().toISOString().slice(0, 10);

            return (
              <div className="flex items-end justify-between gap-2 sm:gap-4 h-40">
                {stats.days.map((d, i) => {
                  const heightPct = (d.count / maxCount) * 100;
                  const isToday = d.date === todayIso;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="w-full h-32 flex items-end justify-center relative">
                        <div className="absolute -top-7 px-2 py-1 rounded-md bg-black border border-[#1A2130] text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          {d.count} {d.count === 1 ? 'relatório' : 'relatórios'}
                        </div>
                        <div
                          className={`w-full max-w-[40px] rounded-t-md transition-all duration-700 ${
                            isToday
                              ? 'bg-[#00FF66] shadow-[0_0_20px_rgba(0,255,102,0.3)]'
                              : d.count === 0
                              ? 'bg-[#1A2130]'
                              : 'bg-[#00FF66]/20 border border-[#00FF66]/30'
                          }`}
                          style={{
                            height: `${d.count === 0 ? 4 : Math.max(8, heightPct)}%`,
                            transitionDelay: `${i * 50}ms`,
                          }}
                          title={`${d.weekday}, ${d.date} — ${d.count}`}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-mono ${
                          isToday ? 'text-[#00FF66] font-bold' : 'text-gray-500'
                        }`}
                      >
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-500 font-mono text-xs">
            {loading ? (
              <>
                <i className="fa-solid fa-spinner animate-spin mr-2" /> A carregar…
              </>
            ) : (
              'Sem relatórios nos últimos 7 dias.'
            )}
          </div>
        )}
      </div>

      {/* DISTRIBUIÇÃO POR TIPO */}
      <div className="cyber-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
            <i className="fa-solid fa-folder-tree text-base" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Distribuição por Tipo</h3>
            <p className="text-xs text-gray-400 font-mono">Relatórios por categoria</p>
          </div>
        </div>

        <div className="space-y-3.5">
          {[
            { label: 'Executivo', count: byType['Executivo'], color: '#00FF66' },
            { label: 'Técnico', count: byType['Técnico'], color: '#00B0FF' },
            { label: 'Compliance', count: byType['Compliance'], color: '#FFC107' },
            { label: 'Incidente', count: byType['Incidente'], color: '#FF2E54' },
          ].map((t, i) => {
            const pct = counts.total > 0 ? (t.count / counts.total) * 100 : 0;
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
                  <span className="text-gray-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-sm" style={{ background: t.color }} />{' '}
                    {t.label}
                  </span>
                  <span className="text-gray-400 font-bold">{t.count}</span>
                </div>
                <div className="h-1.5 w-full bg-[#070709] rounded-full overflow-hidden border border-[#1A2130]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: t.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ERRO */}
      {error && !loading && (
        <div className="cyber-card rounded-2xl p-6 text-center">
          <i className="fa-solid fa-triangle-exclamation text-[#FF2E54] text-2xl mb-2" />
          <p className="text-white font-semibold mb-1">Não foi possível carregar relatórios</p>
          <p className="text-gray-400 text-xs font-mono mb-4">{error}</p>
          <button
            onClick={() => load(false)}
            className="px-4 py-2 bg-[#00FF66] text-black text-xs font-mono font-bold rounded-lg"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* TABELA */}
      <div className="cyber-card rounded-2xl overflow-hidden">
        <div className="px-6 md:px-8 py-5 border-b border-[#1A2130]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                <i className="fa-solid fa-file-contract text-[#00FF66]" /> Relatórios Disponíveis
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Descarregue os relatórios mais recentes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['ALL', 'PDF', 'CSV'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`filter-pill px-3.5 py-1.5 rounded-lg bg-[#11151E] border border-[#1A2130] text-gray-300 text-xs font-mono font-bold transition-all ${
                    filter === f ? 'active' : ''
                  }`}
                >
                  {f === 'ALL' ? 'Todos' : f}
                </button>
              ))}
            </div>
          </div>

          {/* Barra de seleção */}
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
                  <span className="text-[#FFC107]">{selected.size} selecionado(s)</span>
                  <button
                    onClick={() => setDeleteBulkOpen(true)}
                    className="px-3 py-1 rounded-lg bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] text-[10px] font-bold transition-all flex items-center gap-1"
                  >
                    <i className="fa-solid fa-trash text-[9px]" /> Eliminar selecionados
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
                <th className="py-3.5 px-4 font-bold">Relatório</th>
                <th className="py-3.5 px-4 font-bold">Tipo</th>
                <th className="py-3.5 px-4 font-bold">Formato</th>
                <th className="py-3.5 px-4 font-bold">Data</th>
                <th className="py-3.5 px-4 font-bold">Tamanho</th>
                <th className="py-3.5 px-6 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2130]/60 text-xs">
              {filtered.map((r) => {
                const isSelected = selected.has(r.id);
                return (
                  <tr key={r.id} className={isSelected ? 'bg-[#00FF66]/5' : ''}>
                    <td className="py-4 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(r.id)}
                        className="w-4 h-4 rounded border-[#1A2130] bg-black accent-[#00FF66] cursor-pointer"
                        aria-label={`Selecionar ${r.name}`}
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            r.format === 'PDF'
                              ? 'bg-[#FF2E54]/10 border border-[#FF2E54]/20 text-[#FF2E54]'
                              : 'bg-[#00B0FF]/10 border border-[#00B0FF]/20 text-[#00B0FF]'
                          }`}
                        >
                          <i
                            className={`fa-solid ${
                              r.format === 'PDF' ? 'fa-file-pdf' : 'fa-file-csv'
                            } text-sm`}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{r.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-[10px] font-bold ${r.typeColor}`}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${
                          r.format === 'PDF'
                            ? 'bg-[#FF2E54]/10 text-[#FF2E54] border-[#FF2E54]/30'
                            : 'bg-[#00B0FF]/10 text-[#00B0FF] border-[#00B0FF]/30'
                        }`}
                      >
                        <i
                          className={`fa-solid ${
                            r.format === 'PDF' ? 'fa-file-pdf' : 'fa-file-csv'
                          } text-[9px]`}
                        />{' '}
                        {r.format}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono text-gray-400 text-[11px]">{r.date}</td>
                    <td className="py-4 px-4 font-mono text-gray-400 text-[11px]">{r.size}</td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleDownload(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00FF66]/10 hover:bg-[#00FF66] hover:text-black border border-[#00FF66]/30 text-[#00FF66] font-mono text-[10px] font-bold transition-all"
                        >
                          <i className="fa-solid fa-download text-[9px]" /> Download
                        </button>
                        <button
                          onClick={() => setDeleteTarget(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FF2E54]/10 hover:bg-[#FF2E54] hover:text-white border border-[#FF2E54]/30 text-[#FF2E54] font-mono text-[10px] font-bold transition-all"
                          title="Eliminar relatório"
                        >
                          <i className="fa-solid fa-trash text-[9px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500 font-mono text-xs">
                    {loading
                      ? 'A carregar…'
                      : reports.length === 0
                      ? 'Nenhum relatório gerado. Cria o primeiro acima.'
                      : 'Nenhum relatório corresponde ao filtro.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 md:px-8 py-3.5 border-t border-[#1A2130] bg-black/20 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-gray-500">
          <span>
            A mostrar <span className="text-white font-bold">{filtered.length}</span> de{' '}
            <span className="text-white font-bold">{reports.length}</span> relatórios
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66]" /> Atualizado{' '}
            {refreshing ? 'a atualizar…' : 'agora'}
          </span>
        </div>
      </div>

      {/* MODAL NOVO RELATÓRIO */}
      <Modal
        open={newReportOpen}
        onClose={() => !generating && setNewReportOpen(false)}
        title="NOVO RELATÓRIO"
        icon="fa-plus"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              onClick={() => setNewReportOpen(false)}
              disabled={generating}
              className="px-4 py-2 bg-[#11151E] hover:bg-[#1A2130] text-gray-300 text-xs font-mono font-bold rounded-xl transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-[#00FF66] text-black hover:bg-[#00E676] text-xs font-mono font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(0,255,102,0.3)] disabled:opacity-50"
            >
              {generating ? (
                <>
                  <i className="fa-solid fa-spinner animate-spin mr-1.5 text-[10px]" /> A gerar…
                </>
              ) : (
                'Gerar Relatório'
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Tipo de Relatório
            </label>
            <select
              value={genType}
              onChange={(e) => setGenType(e.target.value as ReportType)}
              disabled={generating}
              className="neon-select w-full pl-3 py-2.5 rounded-lg text-xs font-mono disabled:opacity-50"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Formato
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['PDF', 'CSV'] as const).map((f) => (
                <label
                  key={f}
                  className={`flex items-center gap-2 p-3 rounded-lg bg-[#11151E] border cursor-pointer transition-all ${
                    genFormat === f
                      ? 'border-[#00FF66] bg-[#00FF66]/5'
                      : 'border-[#1A2130] hover:border-[#00FF66]'
                  } ${generating ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    checked={genFormat === f}
                    onChange={() => setGenFormat(f)}
                    className="accent-[#00FF66]"
                  />
                  <span className="text-xs text-gray-300">{f}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Período
            </label>
            <select
              value={genPeriod}
              onChange={(e) => setGenPeriod(e.target.value)}
              disabled={generating}
              className="neon-select w-full pl-3 py-2.5 rounded-lg text-xs font-mono disabled:opacity-50"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* MODAL DELETE 1 */}
      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="ELIMINAR RELATÓRIO"
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
          Eliminar <strong className="text-white break-all">{deleteTarget?.name}</strong>?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2">Ação irreversível.</p>
      </Modal>

      {/* MODAL DELETE BULK */}
      <Modal
        open={deleteBulkOpen}
        onClose={() => !deleting && setDeleteBulkOpen(false)}
        title="ELIMINAR SELECIONADOS"
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
          Eliminar <strong className="text-white">{selected.size}</strong> relatório(s) selecionado(s)?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2">Ação irreversível.</p>
      </Modal>

      {/* MODAL DELETE ALL */}
      <Modal
        open={deleteAllOpen}
        onClose={() => !deleting && setDeleteAllOpen(false)}
        title="ELIMINAR TODOS"
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
          Eliminar <strong className="text-[#FF2E54]">TODOS os {reports.length} relatórios</strong>?
        </p>
        <p className="text-xs text-[#FF2E54] mt-2"><strong>Ação irreversível.</strong></p>
      </Modal>
    </>
  );
};

export default Reports;