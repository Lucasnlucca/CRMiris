import { useEffect, useState, useRef, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Users,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  ChevronRight,
  ArrowRight,
  FileText,
  Calendar,
  Building,
  Mail,
  Smartphone,
} from 'lucide-react';
import LineChart from '../components/LineChart';
import { databases, client } from '../lib/appwrite';
import { Query } from 'appwrite';
import { ChartDataPoint } from '../types';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';

interface DashboardProps {
  onPageChange?: (page: string, referenceId?: string | null) => void;
}

interface PipelineColumnData {
  id: string;
  name: string;
  position: number;
  color?: string;
  count: number;
  value: number;
  percentage: number;
}

interface DealSummary {
  id: string;
  name: string;
  company?: string;
  value: number;
  column_id: string;
  column_name: string;
  column_color?: string;
  completed: boolean;
  created_at: string;
}

interface RecentClient {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  created_at?: string;
}

function buildChartData(
  records: { ts: string }[],
  period: 'today' | '7days' | '30days'
): ChartDataPoint[] {
  const now = new Date();

  if (period === 'today') {
    const counts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) counts[i] = 0;
    records.forEach((r) => {
      const h = new Date(r.ts).getHours();
      counts[h] = (counts[h] || 0) + 1;
    });
    const result: ChartDataPoint[] = [];
    for (let h = 0; h < 24; h += 3) {
      result.push({
        hour: `${h.toString().padStart(2, '0')}:00`,
        conversations: (counts[h] || 0) + (counts[h + 1] || 0) + (counts[h + 2] || 0),
      });
    }
    return result;
  }

  if (period === '7days') {
    const labels: string[] = [];
    const counts: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      labels.push(key);
      counts[key] = 0;
    }
    records.forEach((r) => {
      const key = new Date(r.ts).toISOString().split('T')[0];
      if (key in counts) counts[key]++;
    });
    return labels.map((key) => {
      const d = new Date(key);
      return {
        hour: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
        conversations: counts[key],
      };
    });
  }

  // 30days → weekly buckets
  const result: ChartDataPoint[] = [];
  const weekCounts: Record<number, number> = {};
  const weekLabels: string[] = [];
  for (let i = 4; i >= 0; i--) {
    const ws = new Date(now);
    ws.setDate(now.getDate() - (i * 6 + 5));
    weekLabels.push(
      `${ws.getDate().toString().padStart(2, '0')}/${(ws.getMonth() + 1).toString().padStart(2, '0')}`
    );
    weekCounts[i] = 0;
  }
  records.forEach((r) => {
    const diff = Math.floor((now.getTime() - new Date(r.ts).getTime()) / 86400000);
    const wi = Math.floor(diff / 6);
    if (wi >= 0 && wi < 5) weekCounts[4 - wi]++;
  });
  weekLabels.forEach((label, idx) => {
    result.push({ hour: label, conversations: weekCounts[idx] });
  });
  return result;
}

export default function Dashboard({ onPageChange }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // KPIs
  const [totalClients, setTotalClients] = useState(0);
  const [totalProposals, setTotalProposals] = useState(0);

  // Revenue & Deals
  const [totalPipelineValue, setTotalPipelineValue] = useState(0);
  const [wonRevenue, setWonRevenue] = useState(0);
  const [wonDealsCount, setWonDealsCount] = useState(0);
  const [totalDealsCount, setTotalDealsCount] = useState(0);

  // Funnel & Lists
  const [funnelColumns, setFunnelColumns] = useState<PipelineColumnData[]>([]);
  const [recentDeals, setRecentDeals] = useState<DealSummary[]>([]);
  const [recentClients, setRecentClients] = useState<RecentClient[]>([]);

  // Chart
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartPeriod, setChartPeriod] = useState<'today' | '7days' | '30days'>('today');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived Metrics
  const winRate = useMemo(() => {
    if (totalDealsCount === 0) return 0;
    return Math.round((wonDealsCount / totalDealsCount) * 100);
  }, [wonDealsCount, totalDealsCount]);

  const avgTicket = useMemo(() => {
    if (wonDealsCount > 0) return wonRevenue / wonDealsCount;
    if (totalDealsCount > 0) return (totalPipelineValue + wonRevenue) / totalDealsCount;
    return 0;
  }, [wonRevenue, wonDealsCount, totalPipelineValue, totalDealsCount]);

  useEffect(() => {
    loadAll();

    const channels = [
      `databases.${DATABASE_ID}.collections.pipeline_deals.documents`,
      `databases.${DATABASE_ID}.collections.pipeline_columns.documents`,
      `databases.${DATABASE_ID}.collections.clients.documents`,
      `databases.${DATABASE_ID}.collections.crm_proposals.documents`,
    ];

    const unsubscribe = client.subscribe(channels, () => {
      loadKpis();
      loadPipelineData();
      loadRecentClients();
    });

    pollRef.current = setInterval(() => {
      loadKpis();
      loadPipelineData();
      loadRecentClients();
    }, 25000);

    return () => {
      try {
        unsubscribe();
      } catch (e) {}
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    loadChart(chartPeriod);
  }, [chartPeriod]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadKpis(), loadPipelineData(), loadRecentClients(), loadChart(chartPeriod)]);
    setLoading(false);
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    await Promise.all([loadKpis(), loadPipelineData(), loadRecentClients(), loadChart(chartPeriod)]);
    setTimeout(() => setRefreshing(false), 500);
  }

  async function loadKpis() {
    const countDocs = async (col: string, q: any[] = []) => {
      try {
        const { total } = await databases.listDocuments(DATABASE_ID, col, [...q, Query.limit(1)]);
        return total;
      } catch (e) {
        return 0;
      }
    };

    const [clientsCount, proposalsCount] = await Promise.all([
      countDocs('clients'),
      countDocs('crm_proposals'),
    ]);

    setTotalClients(clientsCount);
    setTotalProposals(proposalsCount);
  }

  async function loadPipelineData() {
    try {
      const [colsRes, dealsRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, 'pipeline_columns', [Query.orderAsc('position'), Query.limit(100)]),
        databases.listDocuments(DATABASE_ID, 'pipeline_deals', [Query.orderDesc('$createdAt'), Query.limit(300)]),
      ]);

      const cols = colsRes.documents;
      const deals = dealsRes.documents;

      setTotalDealsCount(deals.length);

      // Create lookup map for columns
      const colMap = new Map<string, { name: string; position: number; color?: string }>();
      cols.forEach((c) => {
        colMap.set(c.$id, { name: c.name, position: c.position, color: c.color });
      });

      // Calculate totals
      let totalOpenValue = 0;
      let totalWonValue = 0;
      let wonCount = 0;

      const colStats: Record<string, { count: number; value: number }> = {};
      cols.forEach((c) => {
        colStats[c.$id] = { count: 0, value: 0 };
      });

      deals.forEach((d) => {
        const col = colMap.get(d.column_id);
        const isWon =
          d.completed === true ||
          (col && (col.name.toUpperCase().includes('CONCLU') || col.name.toUpperCase().includes('FECHAD') || col.name.toUpperCase().includes('GANHO')));

        const val = Number(d.value) || 0;

        if (isWon) {
          totalWonValue += val;
          wonCount++;
        } else {
          totalOpenValue += val;
        }

        if (colStats[d.column_id]) {
          colStats[d.column_id].count++;
          colStats[d.column_id].value += val;
        }
      });

      setTotalPipelineValue(totalOpenValue);
      setWonRevenue(totalWonValue);
      setWonDealsCount(wonCount);

      // Prepare funnel columns sorted
      const maxColCount = Math.max(...Object.values(colStats).map((s) => s.count), 1);
      const funnel: PipelineColumnData[] = cols.map((c) => {
        const stat = colStats[c.$id] || { count: 0, value: 0 };
        return {
          id: c.$id,
          name: c.name,
          position: c.position,
          color: c.color,
          count: stat.count,
          value: stat.value,
          percentage: Math.round((stat.count / maxColCount) * 100),
        };
      });

      setFunnelColumns(funnel);

      // Top 5 recent deals with mapped column names
      const recentList: DealSummary[] = deals.slice(0, 5).map((d) => {
        const col = colMap.get(d.column_id);
        return {
          id: d.$id,
          name: d.name || 'Oportunidade sem título',
          company: d.company || d.contact_company || '',
          value: Number(d.value) || 0,
          column_id: d.column_id,
          column_name: col?.name || 'Funil',
          column_color: col?.color,
          completed: !!d.completed,
          created_at: d.$createdAt,
        };
      });

      setRecentDeals(recentList);
    } catch (e) {
      console.error('Error loading pipeline data:', e);
    }
  }

  async function loadRecentClients() {
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, 'clients', [
        Query.orderDesc('$createdAt'),
        Query.limit(6),
      ]);
      setRecentClients(
        documents.map((d) => ({
          id: d.$id,
          name: d.name || 'Cliente sem nome',
          company: d.company || '',
          email: d.email || '',
          phone: d.phone || '',
          created_at: d.$createdAt,
        }))
      );
    } catch (e) {
      console.error('Error loading recent clients:', e);
    }
  }

  async function loadChart(period: 'today' | '7days' | '30days') {
    const now = new Date();
    const startDate = new Date();
    if (period === 'today') startDate.setHours(0, 0, 0, 0);
    else if (period === '7days') {
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }

    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, 'pipeline_deals', [
        Query.greaterThanEqual('$createdAt', startDate.toISOString()),
        Query.limit(500),
      ]);
      const records = documents.map((d) => ({ ts: d.$createdAt }));
      setChartData(buildChartData(records, period));
    } catch (e) {
      console.error('Error loading chart data:', e);
    }
  }

  function formatPhone(p?: string) {
    if (!p) return '—';
    const d = p.replace(/\D/g, '');
    if (d.length >= 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    return p;
  }

  function formatTime(ts?: string) {
    if (!ts) return 'Recente';
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-3">
        <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Carregando métricas executivas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* 1. Header Executivo com Indicadores de Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 px-2 py-0.5 rounded-md">
              Painel Geral
            </span>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Sincronização Ativa</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Visão Geral do Negócio
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Acompanhamento em tempo real de clientes, propostas comerciais e funil de vendas.
          </p>
        </div>

        {/* Controles de Ação Rápida */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200/80 dark:border-white/[0.08] rounded-xl transition-all disabled:opacity-50"
            title="Atualizar dados agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            Atualizar
          </button>

          {onPageChange && (
            <>
              <button
                onClick={() => onPageChange('crm-pipeline')}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#0d1117] hover:border-indigo-500/40 border border-slate-200/80 dark:border-white/[0.08] rounded-xl shadow-xs transition-all"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                Funil Kanban
              </button>
              <button
                onClick={() => onPageChange('crm-contatos')}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 rounded-xl shadow-sm transition-all active:scale-[0.99]"
              >
                <Users className="w-3.5 h-3.5" />
                Clientes & Leads
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Scorecard Executivo — 4 Cards Principais de Receita & Operação */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Valor em Pipeline */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs hover:border-indigo-500/30 transition-all group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Pipeline Aberto
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
              <DollarSign className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
              R$ {totalPipelineValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-white/[0.04]">
              <span className="text-slate-500 dark:text-slate-400">
                {totalDealsCount - wonDealsCount} oportunidades em curso
              </span>
              <span className="font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5">
                Ticket: R$ {Math.round(avgTicket).toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Receita Fechada / Ganhos */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs hover:border-emerald-500/30 transition-all group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Receita Concluída
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold font-mono text-slate-900 dark:text-white tracking-tight">
              R$ {wonRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-white/[0.04]">
              <span className="text-slate-500 dark:text-slate-400">{wonDealsCount} negócios ganhos</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-3 h-3" />
                {winRate}% Win Rate
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Clientes & Base de Contatos */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs hover:border-violet-500/30 transition-all group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Base de Clientes
            </span>
            <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-800/30 flex items-center justify-center text-violet-600 dark:text-violet-400 shadow-xs">
              <Users className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {totalClients.toLocaleString('pt-BR')}
            </h3>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-white/[0.04]">
              <span className="text-slate-500 dark:text-slate-400">Contatos mapeados</span>
              <span className="font-semibold text-violet-600 dark:text-violet-400">Base ativa</span>
            </div>
          </div>
        </div>

        {/* Card 4: Propostas Comerciais */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs hover:border-amber-500/30 transition-all group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Propostas Geradas
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-800/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-xs">
              <FileText className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {totalProposals.toLocaleString('pt-BR')}
            </h3>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-white/[0.04]">
              <span className="text-slate-500 dark:text-slate-400">Documentos comerciais</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">Catálogo ativo</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bloco Analítico Principal: Gráfico de Atividade + Funil de Vendas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico de Evolução (8 colunas) */}
        <div className="lg:col-span-8 bg-white dark:bg-[#121824] rounded-2xl p-6 border border-slate-200/80 dark:border-white/[0.08] shadow-xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Evolução do Pipeline & Negócios
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Novas oportunidades e negociações criadas no período
              </p>
            </div>

            {/* Seletor de Período Integrado */}
            <div className="inline-flex p-1 bg-slate-100 dark:bg-[#0d1117] border border-slate-200/80 dark:border-white/[0.08] rounded-xl self-start sm:self-auto">
              {(
                [
                  { id: 'today', label: 'Hoje' },
                  { id: '7days', label: '7 Dias' },
                  { id: '30days', label: '30 Dias' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setChartPeriod(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    chartPeriod === tab.id
                      ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-[260px]">
            <LineChart
              data={chartData}
              period={chartPeriod}
              onPeriodChange={(p) => setChartPeriod(p)}
              title=""
              color="#6366F1"
              gradientId="executiveGradient"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-4 mt-2 border-t border-slate-100 dark:border-white/[0.04] text-center">
            <div className="p-2">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Período</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {chartData.reduce((acc, curr) => acc + curr.conversations, 0)} msgs
              </p>
            </div>
            <div className="p-2 border-x border-slate-100 dark:border-white/[0.04]">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Pico Registrado</p>
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                {Math.max(...chartData.map((d) => d.conversations), 0)} msgs
              </p>
            </div>
            <div className="p-2">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Status Operação</p>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">100% Online</p>
            </div>
          </div>
        </div>

        {/* Funil de Vendas do Pipeline (4 colunas) */}
        <div className="lg:col-span-4 bg-white dark:bg-[#121824] rounded-2xl p-6 border border-slate-200/80 dark:border-white/[0.08] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Funil de Conversão
                </h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 rounded-md">
                Etapas
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Distribuição de volume e valor financeiro pelas fases do pipeline comercial.
            </p>

            {/* Lista das Etapas do Funil com barras de progresso */}
            <div className="space-y-3.5">
              {funnelColumns.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">Nenhuma etapa cadastrada</div>
              ) : (
                funnelColumns.slice(0, 5).map((col, index) => {
                  return (
                    <div key={col.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-white/[0.08] text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center flex-shrink-0">
                            {index + 1}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {col.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 text-right">
                          <span className="font-bold text-slate-700 dark:text-slate-300">{col.count}</span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                            R$ {col.value > 0 ? col.value.toLocaleString('pt-BR') : '0'}
                          </span>
                        </div>
                      </div>

                      {/* Barra de Progresso elegante */}
                      <div className="h-2 w-full bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(col.percentage, 6)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Botão de Ação Direta para o Pipeline */}
          {onPageChange && (
            <button
              onClick={() => onPageChange('crm-pipeline')}
              className="mt-6 w-full py-2.5 px-4 bg-slate-50 dark:bg-[#0d1117] hover:bg-indigo-50 dark:hover:bg-indigo-950/20 border border-slate-200/80 dark:border-white/[0.08] hover:border-indigo-500/40 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all group"
            >
              Abrir Quadro Kanban Completo
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Bloco Operacional: Oportunidades Quentes + Contatos Recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Oportunidades / Negócios Recentes */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-6 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Negócios & Oportunidades Recentes
              </h3>
            </div>
            {onPageChange && (
              <button
                onClick={() => onPageChange('crm-pipeline')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                Ver todos <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {recentDeals.length === 0 ? (
              <div className="text-center py-10">
                <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Nenhum negócio ativo ainda</p>
                {onPageChange && (
                  <button
                    onClick={() => onPageChange('crm-pipeline')}
                    className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                  >
                    + Criar primeira oportunidade no pipeline
                  </button>
                )}
              </div>
            ) : (
              recentDeals.map((deal) => (
                <div
                  key={deal.id}
                  onClick={() => onPageChange?.('crm-pipeline', deal.id)}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-white/[0.04] bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-100/80 dark:hover:bg-white/[0.05] transition-all cursor-pointer group"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {deal.name}
                      </p>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                        {deal.column_name}
                      </span>
                    </div>
                    {deal.company && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{deal.company}</p>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {formatTime(deal.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Clientes & Contatos Recentes */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-6 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Clientes Recentes
              </h3>
            </div>
            {onPageChange && (
              <button
                onClick={() => onPageChange('crm-contatos')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                Ver todos <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {recentClients.length === 0 ? (
              <div className="text-center py-10">
                <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Nenhum cliente cadastrado ainda</p>
              </div>
            ) : (
              recentClients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => onPageChange?.('crm-contatos')}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-white/[0.04] bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-100/80 dark:hover:bg-white/[0.05] transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 shadow-xs">
                      {(client.name || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {client.name}
                        </p>
                        {client.company && (
                          <span className="text-[10px] text-slate-400 truncate">
                            • {client.company}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {client.email || client.phone || 'Sem contato registrado'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-[10px] text-slate-400">
                      {formatTime(client.created_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. Barra de Saúde & Conectividade do Sistema */}
      <div className="bg-slate-50 dark:bg-[#0d1117] border border-slate-200/80 dark:border-white/[0.06] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-600 dark:text-slate-400 font-medium">Base de Clientes:</span>
            <span className="font-semibold text-slate-900 dark:text-white">Integrada</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-600 dark:text-slate-400 font-medium">Funil de Vendas:</span>
            <span className="font-semibold text-slate-900 dark:text-white">Em Tempo Real</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-slate-600 dark:text-slate-400 font-medium">Appwrite Realtime:</span>
            <span className="font-semibold text-slate-900 dark:text-white">Sincronizado</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Iris Horizon CRM v2.4 Enterprise</span>
        </div>
      </div>
    </div>
  );
}
