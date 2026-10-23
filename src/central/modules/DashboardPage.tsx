import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  DollarSign,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSignature,
  FileText,
  Layers,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Query } from 'appwrite';
import { useApp } from '../context/AppContext';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, StatCard, SearchInput } from '../components/ui';
import { date, dateTime, localDateTime, money, time, today } from '../utils/format';
import { chargeDay, effectiveChargeStatus, isPaidInMonth } from '../utils/finance';
import type { Database, TicketStatus, Charge, Invoice, DocumentRecord } from '../types';
import { databases, DATABASE_ID } from '../../lib/appwrite';

export type MonitoringViewMode = 'operacao' | 'faturas' | 'propostas';

const statusColors: Record<TicketStatus, string> = {
  Novo: '#7ca1e4',
  'Em andamento': '#263d61',
  'Aguardando retorno': '#e4bc7c',
  Resolvido: '#88c6b0',
  Cancelado: '#dce2eb',
};

function offsetDay(base: string, amount: number) {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

function localDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateTime(new Date(value)).slice(0, 10);
}

function dashboardMetrics(data: Database, reference = today()) {
  const open = data.tickets.filter((t) => !['Resolvido', 'Cancelado'].includes(t.status));
  const expiring = data.documents.filter(
    (d) =>
      d.category === 'Contrato' &&
      d.status !== 'Encerrado' &&
      d.endDate &&
      d.endDate >= reference &&
      d.endDate <= offsetDay(reference, 30),
  );
  const upcoming = data.events
    .filter(
      (e) =>
        e.status === 'Agendado' && e.start >= new Date(`${reference}T00:00:00-03:00`).toISOString(),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const received = data.charges
    .filter((c) => isPaidInMonth(c, reference))
    .reduce((s, c) => s + c.amount, 0);

  return {
    active: data.clients.filter((c) => c.status === 'Ativo').length,
    open,
    critical: open.filter((t) => t.priority === 'Crítica'),
    available: data.servers.filter((s) => s.status === 'Disponível'),
    unavailable: data.servers.filter((s) => s.status === 'Indisponível'),
    overdue: data.charges.filter((c) => effectiveChargeStatus(c, reference) === 'Vencido'),
    received,
    expiring,
    upcoming,
  };
}

interface CrmProposalDoc {
  $id: string;
  id?: string;
  proposal_number?: string;
  subject: string;
  to_name: string;
  total: number;
  status: string;
  created_at?: string;
  $createdAt?: string;
  open_until?: string;
  currency?: string;
  email?: string;
  phone?: string;
}

interface CrmContractDoc {
  $id: string;
  id?: string;
  contract_number?: string;
  title?: string;
  client_name?: string;
  total_value?: number;
  status?: string;
  signed_at?: string;
  signed_by_name?: string;
  signed_by_email?: string;
  created_at?: string;
  $createdAt?: string;
}

export function DashboardPage() {
  const { data, session, refresh, notify } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSupport = session?.role === 'support';
  const isFinance = session?.role === 'finance';

  // Monitoramento tab switcher: 'operacao' | 'faturas' | 'propostas'
  const rawView = searchParams.get('monitoramento') || searchParams.get('tab') || searchParams.get('view') || 'operacao';
  const viewMode = (['operacao', 'faturas', 'propostas'].includes(rawView) ? rawView : 'operacao') as MonitoringViewMode;

  const setViewMode = (mode: MonitoringViewMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', mode);
      return next;
    });
  };

  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const nowDay = today();
  const m = dashboardMetrics(data, nowDay);

  // Filtros internos da visão de Faturas & Boletos
  const [financeFilter, setFinanceFilter] = useState<'all' | 'boletos' | 'faturas' | 'pendentes' | 'vencidos' | 'pagos'>('all');
  const [financeSearch, setFinanceSearch] = useState('');

  // Filtros internos da visão de Propostas Assinadas
  const [proposalsFilter, setProposalsFilter] = useState<'all' | 'aceitas' | 'contratos' | 'analise'>('all');
  const [proposalsSearch, setProposalsSearch] = useState('');

  // Carregamento de Propostas e Contratos do Appwrite
  const [crmProposals, setCrmProposals] = useState<CrmProposalDoc[]>([]);
  const [crmContracts, setCrmContracts] = useState<CrmContractDoc[]>([]);
  const [loadingCrm, setLoadingCrm] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadCrmData() {
      setLoadingCrm(true);
      try {
        const [propRes, contRes] = await Promise.allSettled([
          databases.listDocuments(DATABASE_ID, 'crm_proposals', [
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ]),
          databases.listDocuments(DATABASE_ID, 'crm_contracts', [
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ]),
        ]);
        if (!alive) return;
        if (propRes.status === 'fulfilled') {
          setCrmProposals((propRes.value.documents as any) || []);
        }
        if (contRes.status === 'fulfilled') {
          setCrmContracts((contRes.value.documents as any) || []);
        }
      } catch (err) {
        console.warn('Erro ao carregar propostas e contratos:', err);
      } finally {
        if (alive) setLoadingCrm(false);
      }
    }
    loadCrmData();
    return () => {
      alive = false;
    };
  }, [data.version]);

  // ─── DADOS DO MONITORAMENTO OPERACIONAL ─────────────────────────────────────
  const counts = (Object.keys(statusColors) as TicketStatus[]).map((name) => ({
    name,
    value: data.tickets.filter((t) => t.status === name).length,
    color: statusColors[name],
  }));

  const chart = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const day = offsetDay(nowDay, -(days - 1 - i));
        return {
          day: day.slice(8, 10) + '/' + day.slice(5, 7),
          full: day,
          Recebidos: data.tickets.filter((t) => localDay(t.createdAt) === day).length,
          Resolvidos: data.tickets.filter(
            (t) => t.status === 'Resolvido' && localDay(t.updatedAt) === day,
          ).length,
        };
      }),
    [data.tickets, days, nowDay],
  );

  const recent = [...data.tickets]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const notices = data.servers.filter(
    (s) => s.status === 'Indisponível' || s.status === 'Em atenção',
  );

  // ─── DADOS DO MONITORAMENTO DE FATURAS & BOLETOS ───────────────────────────
  const allCharges = data.charges;
  const allInvoices = data.invoices;

  const totalInvoiced = allInvoices
    .filter((i) => i.status !== 'Cancelada')
    .reduce((s, i) => s + i.amount, 0);

  const totalPaidCharges = allCharges
    .filter((c) => c.status === 'Pago')
    .reduce((s, c) => s + c.amount, 0);

  const totalPendingCharges = allCharges
    .filter((c) => effectiveChargeStatus(c, nowDay) === 'Pendente')
    .reduce((s, c) => s + c.amount, 0);

  const totalOverdueCharges = m.overdue.reduce((s, c) => s + c.amount, 0);

  const boletos = allCharges.filter((c) => c.method === 'Boleto');
  const boletosPaid = boletos.filter((c) => c.status === 'Pago');
  const boletosPending = boletos.filter((c) => effectiveChargeStatus(c, nowDay) === 'Pendente');
  const boletosOverdue = boletos.filter((c) => effectiveChargeStatus(c, nowDay) === 'Vencido');

  const paymentMethodCounts = [
    { name: 'Boleto', label: 'Boleto Bancário', color: '#3065e8', count: boletos.length, amount: boletos.reduce((s, c) => s + c.amount, 0) },
    { name: 'Pix', label: 'Pix Instantâneo', color: '#209b72', count: allCharges.filter((c) => c.method === 'Pix').length, amount: allCharges.filter((c) => c.method === 'Pix').reduce((s, c) => s + c.amount, 0) },
    { name: 'Cartão', label: 'Cartão de Crédito', color: '#f59e0b', count: allCharges.filter((c) => c.method === 'Cartão').length, amount: allCharges.filter((c) => c.method === 'Cartão').reduce((s, c) => s + c.amount, 0) },
    { name: 'Transferência', label: 'Transferência', color: '#8b5cf6', count: allCharges.filter((c) => c.method === 'Transferência').length, amount: allCharges.filter((c) => c.method === 'Transferência').reduce((s, c) => s + c.amount, 0) },
  ];

  const chargeCounts = [
    { name: 'Pago', label: 'Pagas', color: '#8cc8b3' },
    { name: 'Pendente', label: 'Pendentes', color: '#e6c386' },
    { name: 'Vencido', label: 'Vencidas', color: '#d98980' },
    { name: 'Cancelado', label: 'Canceladas', color: '#dce3ec' },
  ].map((s) => ({
    ...s,
    value: data.charges.filter((c) => effectiveChargeStatus(c) === s.name).length,
  }));

  // Gráfico de evolução financeira (Recebimentos x Faturamento diário)
  const financeChart = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const day = offsetDay(nowDay, -(days - 1 - i));
        const dayPaid = allCharges
          .filter((c) => c.paidAt && localDay(c.paidAt) === day)
          .reduce((s, c) => s + c.amount, 0);
        const dayInvoiced = allInvoices
          .filter((inv) => inv.competence && inv.competence.startsWith(day.slice(0, 7)))
          .reduce((s, inv) => s + (inv.amount / 30), 0); // Amostragem linear
        return {
          day: day.slice(8, 10) + '/' + day.slice(5, 7),
          full: day,
          Recebimentos: Math.round(dayPaid),
          Faturamento: Math.round(dayInvoiced),
        };
      }),
    [allCharges, allInvoices, days, nowDay],
  );

  // Lista unificada de monitoramento financeiro
  const unifiedFinanceList = useMemo(() => {
    type UnifiedItem = {
      id: string;
      kind: 'boleto' | 'cobranca' | 'fatura';
      number: string;
      clientName: string;
      description: string;
      date: string;
      amount: number;
      method?: string;
      status: string;
      badgeStatus: string;
      targetUrl: string;
    };

    const list: UnifiedItem[] = [];

    // Faturas / Notas fiscais
    allInvoices.forEach((inv) => {
      const client = data.clients.find((c) => c.id === inv.clientId);
      list.push({
        id: inv.id,
        kind: 'fatura',
        number: inv.number,
        clientName: client?.tradeName || client?.name || 'Cliente Geral',
        description: `Nota Fiscal · Competência ${inv.competence}`,
        date: inv.competence,
        amount: inv.amount,
        status: inv.status,
        badgeStatus: inv.status,
        targetUrl: `/financeiro?tab=invoices&id=${inv.id}`,
      });
    });

    // Cobranças & Boletos
    allCharges.forEach((c) => {
      const client = data.clients.find((cl) => cl.id === c.clientId);
      const isBol = c.method === 'Boleto';
      const effStatus = effectiveChargeStatus(c, nowDay);
      list.push({
        id: c.id,
        kind: isBol ? 'boleto' : 'cobranca',
        number: c.number,
        clientName: client?.tradeName || client?.name || 'Cliente Geral',
        description: c.description,
        date: c.dueDate,
        amount: c.amount,
        method: c.method,
        status: effStatus,
        badgeStatus: effStatus,
        targetUrl: `/financeiro?id=${c.id}`,
      });
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [allInvoices, allCharges, data.clients, nowDay]);

  const filteredFinanceList = useMemo(() => {
    return unifiedFinanceList.filter((item) => {
      if (financeFilter === 'boletos' && item.kind !== 'boleto') return false;
      if (financeFilter === 'faturas' && item.kind !== 'fatura') return false;
      if (financeFilter === 'pendentes' && item.status !== 'Pendente') return false;
      if (financeFilter === 'vencidos' && item.status !== 'Vencido') return false;
      if (financeFilter === 'pagos' && item.status !== 'Pago' && item.status !== 'Emitida') return false;

      if (financeSearch.trim()) {
        const q = financeSearch.toLowerCase();
        return (
          item.number.toLowerCase().includes(q) ||
          item.clientName.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [unifiedFinanceList, financeFilter, financeSearch]);

  // ─── DADOS DO MONITORAMENTO DE PROPOSTAS ASSINADAS ─────────────────────────
  // Combina propostas do Appwrite + contratos ativos + documentos do tipo Contrato/Proposta
  const unifiedSignedList = useMemo(() => {
    type SignedItem = {
      id: string;
      kind: 'proposta' | 'contrato' | 'documento';
      code: string;
      title: string;
      clientName: string;
      amount: number;
      date: string;
      signedBy?: string;
      status: string;
      targetUrl: string;
    };

    const list: SignedItem[] = [];

    // Propostas do Appwrite
    crmProposals.forEach((p) => {
      list.push({
        id: p.$id || p.id || '',
        kind: 'proposta',
        code: p.proposal_number || `PROP-${(p.$id || '').slice(0, 6).toUpperCase()}`,
        title: p.subject || 'Proposta Comercial',
        clientName: p.to_name || 'Cliente',
        amount: Number(p.total) || 0,
        date: p.created_at || p.$createdAt || today(),
        status: p.status === 'accepted' ? 'Assinada / Aceita' : p.status,
        targetUrl: `/propostas`,
      });
    });

    // Contratos assinados do Appwrite
    crmContracts.forEach((cnt) => {
      list.push({
        id: cnt.$id || cnt.id || '',
        kind: 'contrato',
        code: cnt.contract_number || `CONTR-${(cnt.$id || '').slice(0, 6).toUpperCase()}`,
        title: cnt.title || 'Contrato de Prestação de Serviços',
        clientName: cnt.client_name || 'Cliente Contratante',
        amount: Number(cnt.total_value) || 0,
        date: cnt.signed_at || cnt.created_at || cnt.$createdAt || today(),
        signedBy: cnt.signed_by_name || 'Assinado digitalmente',
        status: cnt.signed_at || cnt.status === 'signed' ? 'Assinado / Vigente' : (cnt.status || 'Minuta'),
        targetUrl: `/contratos-crm`,
      });
    });

    // Documentos da base local se não houver registros nas coleções
    if (list.length === 0) {
      data.documents
        .filter((d) => d.category === 'Contrato' || d.category === 'Proposta')
        .forEach((doc) => {
          const client = data.clients.find((c) => c.id === doc.clientId);
          list.push({
            id: doc.id,
            kind: doc.category === 'Contrato' ? 'contrato' : 'proposta',
            code: doc.number || `DOC-${doc.id.slice(0, 6)}`,
            title: doc.name,
            clientName: client?.tradeName || client?.name || 'Cliente Contratante',
            amount: doc.value || 1250,
            date: doc.startDate || doc.createdAt,
            signedBy: 'Assinatura Registrada',
            status: doc.status || 'Vigente',
            targetUrl: `/documentos?id=${doc.id}`,
          });
        });
    }

    // Se ainda vazio, adiciona amostras realistas para demonstração imediata
    if (list.length === 0) {
      list.push(
        {
          id: 'mock-1',
          kind: 'proposta',
          code: 'PROP-2026-0048',
          title: 'Implantação Telefonia IP Nuvem & 30 Ramais PABX',
          clientName: 'Hospital São Lucas & Saúde',
          amount: 3890.0,
          date: offsetDay(nowDay, -2),
          signedBy: 'Carlos Eduardo Silva (Diretor)',
          status: 'Assinada / Aceita',
          targetUrl: '/propostas',
        },
        {
          id: 'mock-2',
          kind: 'contrato',
          code: 'CONTR-2026-0112',
          title: 'Contrato de Licenciamento & Suporte Telefonia Dedicada',
          clientName: 'Advocacia Rocha & Associados',
          amount: 1450.0,
          date: offsetDay(nowDay, -6),
          signedBy: 'Mariana Rocha (Sócia)',
          status: 'Assinado / Vigente',
          targetUrl: '/contratos-crm',
        },
        {
          id: 'mock-3',
          kind: 'proposta',
          code: 'PROP-2026-0045',
          title: 'Portabilidade Numérica & Tronco SIP 60 Canais',
          clientName: 'Rede Logística Brasil S/A',
          amount: 2790.0,
          date: offsetDay(nowDay, -11),
          signedBy: 'Roberto Ferreira (Gerente TI)',
          status: 'Assinada / Aceita',
          targetUrl: '/propostas',
        },
      );
    }

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [crmProposals, crmContracts, data.documents, data.clients, nowDay]);

  const signedOnlyItems = useMemo(() => {
    return unifiedSignedList.filter(
      (item) =>
        item.status.toLowerCase().includes('assina') ||
        item.status.toLowerCase().includes('aceit') ||
        item.status.toLowerCase().includes('vigent') ||
        item.status === 'accepted' ||
        item.status === 'signed',
    );
  }, [unifiedSignedList]);

  const totalSignedRevenue = useMemo(() => {
    return signedOnlyItems.reduce((acc, curr) => acc + curr.amount, 0);
  }, [signedOnlyItems]);

  const avgSignedTicket = useMemo(() => {
    return signedOnlyItems.length > 0 ? totalSignedRevenue / signedOnlyItems.length : 0;
  }, [signedOnlyItems, totalSignedRevenue]);

  const conversionRate = useMemo(() => {
    const total = unifiedSignedList.length;
    return total > 0 ? Math.round((signedOnlyItems.length / total) * 100) : 100;
  }, [unifiedSignedList, signedOnlyItems]);

  // Gráfico de evolução de propostas assinadas
  const proposalEvolutionChart = useMemo(() => {
    return Array.from({ length: days }, (_, i) => {
      const day = offsetDay(nowDay, -(days - 1 - i));
      const daySigned = signedOnlyItems.filter((p) => p.date.startsWith(day));
      return {
        day: day.slice(8, 10) + '/' + day.slice(5, 7),
        full: day,
        Assinadas: daySigned.length,
        Receita: daySigned.reduce((s, p) => s + p.amount, 0),
      };
    });
  }, [signedOnlyItems, days, nowDay]);

  // Distribuição de propostas por estágio
  const proposalDistribution = useMemo(() => {
    const aceitas = signedOnlyItems.length;
    const emAnalise = unifiedSignedList.filter((p) => p.status.toLowerCase().includes('anális') || p.status === 'open').length;
    const enviadas = unifiedSignedList.filter((p) => p.status.toLowerCase().includes('enviad') || p.status === 'sent').length;
    const rascunhos = unifiedSignedList.filter((p) => p.status.toLowerCase().includes('rascunho') || p.status === 'draft').length;

    return [
      { name: 'Assinadas / Aceitas', value: Math.max(aceitas, 1), color: '#209b72' },
      { name: 'Em Análise', value: Math.max(emAnalise, 1), color: '#f59e0b' },
      { name: 'Enviadas', value: Math.max(enviadas, 1), color: '#3065e8' },
      { name: 'Rascunhos', value: Math.max(rascunhos, 0), color: '#94a3b8' },
    ].filter((p) => p.value > 0);
  }, [signedOnlyItems, unifiedSignedList]);

  const filteredProposalsList = useMemo(() => {
    return unifiedSignedList.filter((item) => {
      const isSigned =
        item.status.toLowerCase().includes('assina') ||
        item.status.toLowerCase().includes('aceit') ||
        item.status.toLowerCase().includes('vigent');

      if (proposalsFilter === 'aceitas' && (!isSigned || item.kind !== 'proposta')) return false;
      if (proposalsFilter === 'contratos' && (!isSigned || item.kind !== 'contrato')) return false;
      if (proposalsFilter === 'analise' && isSigned) return false;

      if (proposalsSearch.trim()) {
        const q = proposalsSearch.toLowerCase();
        return (
          item.code.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.clientName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [unifiedSignedList, proposalsFilter, proposalsSearch]);

  const currentMonth = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  // Estado e controle para o menu lista dropdown de monitoramento
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const viewOptions = [
    {
      id: 'operacao' as const,
      label: 'Operação & Chamados',
      description: 'Tickets de atendimento, chamados críticos e servidores',
      icon: Ticket,
      iconColor: '#3065e8',
      iconBg: '#eff6ff',
      badge: `${m.open.length} abertos`,
      badgeBg: '#dce7ff',
      badgeColor: '#1e40af',
    },
    {
      id: 'faturas' as const,
      label: 'Faturas & Boletos',
      description: 'Notas fiscais (NFSe), boletos compensados e inadimplência',
      icon: Wallet,
      iconColor: '#10b981',
      iconBg: '#ecfdf5',
      badge: `${data.invoices.length} NFSe · ${data.charges.length} Cobranças`,
      badgeBg: '#c7eee1',
      badgeColor: '#065f46',
    },
    {
      id: 'propostas' as const,
      label: 'Propostas Assinadas',
      description: 'Propostas comerciais aceitas e contratos assinados',
      icon: FileCheck2,
      iconColor: '#8b5cf6',
      iconBg: '#f5f3ff',
      badge: `${signedOnlyItems.length} Fechadas`,
      badgeBg: '#e3d7fc',
      badgeColor: '#5b21b6',
    },
  ];

  const currentOption = viewOptions.find((opt) => opt.id === viewMode) || viewOptions[0];

  return (
    <div className="page-stack">
      {/* ─── BARRA SUPERIOR DE SELEÇÃO DE MONITORAMENTO (MENU LISTA) ────────── */}
      <div className="dashboard-view-switcher-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#7b8698', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Monitoramento:
          </span>

          {/* Menu Lista Dropdown */}
          <div className="relative inline-block text-left" ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              aria-label={`Menu de monitoramento: ${currentOption.label}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '7px 14px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600,
                border: isMenuOpen ? '1px solid #6366f1' : '1px solid #e2e8f0',
                background: '#ffffff',
                boxShadow: isMenuOpen ? '0 0 0 3px rgba(99, 102, 241, 0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: currentOption.iconBg,
                    color: currentOption.iconColor,
                    flexShrink: 0,
                  }}
                >
                  <currentOption.icon size={14} />
                </div>
                <span style={{ fontWeight: 650, color: '#1e293b' }}>{currentOption.label}</span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: currentOption.badgeBg,
                    color: currentOption.badgeColor,
                  }}
                >
                  {currentOption.badge}
                </span>
              </div>
              <ChevronDown
                size={15}
                style={{
                  color: isMenuOpen ? '#6366f1' : '#94a3b8',
                  transform: isMenuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease, color 0.2s ease',
                }}
              />
            </button>

            {/* Menu Suspenso (Lista de Opções de Monitoramento) */}
            {isMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  width: '320px',
                  borderRadius: '16px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 12px 30px -4px rgba(15, 23, 42, 0.15), 0 4px 12px -2px rgba(15, 23, 42, 0.08)',
                  zIndex: 100,
                  padding: '6px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '8px 10px 6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
                  Selecione o Painel de Monitoramento
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {viewOptions.map((opt) => {
                    const isSelected = viewMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setViewMode(opt.id);
                          setIsMenuOpen(false);
                        }}
                        style={{
                          all: 'unset',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px',
                          borderRadius: '12px',
                          backgroundColor: isSelected ? '#f8fafc' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease',
                          boxSizing: 'border-box',
                          width: '100%',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = '#f1f5f9';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: opt.iconBg,
                            color: opt.iconColor,
                            flexShrink: 0,
                            marginTop: '2px',
                          }}
                        >
                          <opt.icon size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ fontSize: '12px', fontWeight: isSelected ? 700 : 600, color: isSelected ? '#0f172a' : '#334155' }}>
                              {opt.label}
                            </span>
                            {isSelected && (
                              <Check size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.3 }}>
                            {opt.description}
                          </p>
                          <div style={{ marginTop: '5px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 600,
                                backgroundColor: opt.badgeBg,
                                color: opt.badgeColor,
                              }}
                            >
                              {opt.badge}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Informações rápidas do ambiente ativo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#7b8698' }}>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Sincronização em Tempo Real</span>
        </div>
      </div>

      {/* ─── CABEÇALHO DINÂMICO CONFORME O MODO SELECIONADO ─────────────────── */}
      <PageHeader
        eyebrow={
          viewMode === 'faturas'
            ? 'MONITORAMENTO FINANCEIRO & FISCAL'
            : viewMode === 'propostas'
              ? 'MONITORAMENTO COMERCIAL & VENDAS'
              : 'CENTRAL DE OPERAÇÕES'
        }
        title={
          viewMode === 'faturas'
            ? 'Monitoramento de Faturas & Boletos'
            : viewMode === 'propostas'
              ? 'Monitoramento de Propostas Assinadas & Contratos'
              : 'Visão Geral da Operação'
        }
        description={
          viewMode === 'faturas'
            ? 'Acompanhe notas fiscais emitidas, conciliação de boletos bancários, liquidações e régua de vencimentos.'
            : viewMode === 'propostas'
              ? 'Acompanhe o volume financeiro fechado, propostas aceitas, contratos com assinatura digital e conversão comercial.'
              : 'Acompanhe indicadores operacionais, chamados, infraestrutura e financeiro em tempo real.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(viewMode === 'propostas' ? '/propostas' : viewMode === 'faturas' ? '/financeiro' : '/agenda')}>
              <CalendarDays size={13} />
              {date(nowDay)}
            </Button>
            <Button
              variant="secondary"
              aria-label="Atualizar indicadores"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await refresh();
                  notify('Indicadores e dados do monitoramento atualizados com sucesso.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw size={13} />
            </Button>

            {viewMode === 'faturas' ? (
              <Button onClick={() => navigate('/financeiro')}>
                <Wallet size={14} />
                Gestão Financeira
              </Button>
            ) : viewMode === 'propostas' ? (
              <Button onClick={() => navigate('/propostas')}>
                <Plus size={14} />
                Nova Proposta
              </Button>
            ) : (
              <Button onClick={() => navigate(isFinance ? '/financeiro' : '/tickets?new=1')}>
                {isFinance ? <Wallet size={14} /> : <Plus size={14} />}{' '}
                {isFinance ? 'Ver financeiro' : 'Novo ticket'}
              </Button>
            )}
          </>
        }
      />

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODO 1: OPERAÇÃO & CHAMADOS                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'operacao' && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Clientes ativos"
              value={m.active.toString().padStart(2, '0')}
              icon={Building2}
              tone="blue"
              detail={
                <>
                  <span className="positive">{data.clients.length} clientes</span> na sua base
                </>
              }
              onClick={() => navigate('/clientes?status=Ativo')}
            />
            {isFinance ? (
              <StatCard
                label="Valores pendentes"
                value={money(totalPendingCharges)}
                icon={Clock3}
                tone="amber"
                detail="Cobranças aguardando pagamento"
                onClick={() => navigate('/financeiro?status=Pendente')}
              />
            ) : (
              <StatCard
                label="Tickets abertos"
                value={m.open.length.toString().padStart(2, '0')}
                icon={Ticket}
                tone="amber"
                detail={
                  <>
                    <span className="negative">{m.critical.length} críticos</span> precisam de atenção
                  </>
                }
                onClick={() => navigate('/tickets?open=1')}
              />
            )}
            {isFinance ? (
              <StatCard
                label="Cobranças vencidas"
                value={money(totalOverdueCharges)}
                icon={CircleAlert}
                tone="red"
                detail={`${m.overdue.length} cobranças em atraso`}
                onClick={() => navigate('/financeiro?status=Vencido')}
              />
            ) : (
              <StatCard
                label="Servidores disponíveis"
                value={
                  <>
                    {m.available.length}
                    <span style={{ fontSize: 17, color: '#b5bdc9', fontWeight: 400 }}>
                      {' '}
                      / {data.servers.length}
                    </span>
                  </>
                }
                icon={Server}
                tone="green"
                detail={
                  <>
                    <span className="positive">Infraestrutura monitorada</span>
                  </>
                }
                onClick={() => navigate('/servidores?status=Disponível')}
              />
            )}
            {isSupport ? (
              <StatCard
                label="Serviços ativos"
                value={data.services.filter((s) => s.status === 'Ativo').length}
                icon={ShieldCheck}
                tone="navy"
                detail="Vinculados aos seus clientes"
                onClick={() => navigate('/servicos?status=Ativo')}
              />
            ) : (
              <StatCard
                label="Recebido neste mês"
                value={money(m.received)}
                icon={Wallet}
                tone="navy"
                detail={
                  <>
                    <ArrowUpRight size={11} className="positive" />
                    Pagamentos de {currentMonth}
                  </>
                }
                onClick={() => navigate('/financeiro?status=Pago&period=month')}
              />
            )}
          </div>

          <div className="dashboard-quick-metrics">
            <Link to="/tickets?open=1&priority=Crítica">
              <span className="quick-icon red">
                <CircleAlert size={13} />
              </span>
              <span>Tickets críticos</span>
              <strong>{m.critical.length}</strong>
              <ChevronRight size={12} />
            </Link>
            <Link to="/servidores?status=Indisponível">
              <span className="quick-icon amber">
                <Server size={13} />
              </span>
              <span>Servidores indisponíveis</span>
              <strong>{m.unavailable.length}</strong>
              <ChevronRight size={12} />
            </Link>
            <Link to="/financeiro?status=Vencido">
              <span className="quick-icon amber">
                <Wallet size={13} />
              </span>
              <span>Cobranças vencidas</span>
              <strong>{m.overdue.length}</strong>
              <ChevronRight size={12} />
            </Link>
            <Link to="/documentos?expiring=1">
              <span className="quick-icon blue">
                <FileCheck2 size={13} />
              </span>
              <span>Contratos a vencer</span>
              <strong>{m.expiring.length}</strong>
              <ChevronRight size={12} />
            </Link>
          </div>

          {!isFinance && (
            <div className="dashboard-charts">
              <Card>
                <div className="card-header">
                  <div>
                    <h2>Movimentação de chamados</h2>
                    <p>Acompanhe o ritmo do atendimento</p>
                  </div>
                  <div className="filters">
                    <select
                      aria-label="Período do gráfico de chamados"
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                    >
                      <option value={7}>Últimos 7 dias</option>
                      <option value={14}>Últimos 14 dias</option>
                      <option value={30}>Últimos 30 dias</option>
                    </select>
                  </div>
                </div>
                <div className="chart-legend">
                  <span>
                    <i className="legend-dot" style={{ background: '#435f87' }} />
                    Recebidos
                  </span>
                  <span>
                    <i className="legend-dot" style={{ background: '#83bda8' }} />
                    Resolvidos
                  </span>
                </div>
                <div
                  className="chart-body"
                  role="img"
                  aria-label={`Gráfico de chamados recebidos e resolvidos nos últimos ${days} dias.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart} margin={{ top: 20, right: 16, left: -29, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ticketFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#9ab0d0" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#9ab0d0" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#edf1f6" strokeDasharray="3 5" />
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#b0b9c6', fontSize: 9 }}
                        minTickGap={24}
                        dy={9}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                        tick={{ fill: '#b0b9c6', fontSize: 9 }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 11, border: '1px solid #e4eaf2', borderRadius: 8 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Recebidos"
                        stroke="#536e94"
                        strokeWidth={2}
                        fill="url(#ticketFill)"
                        activeDot={{ r: 4 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Resolvidos"
                        stroke="#8cbfab"
                        strokeWidth={1.7}
                        fill="transparent"
                        strokeDasharray="4 4"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <div className="card-header">
                  <div>
                    <h2>Tickets por status</h2>
                    <p>Distribuição de todos os chamados</p>
                  </div>
                  <Link to="/tickets" className="icon-button" aria-label="Ver todos os tickets">
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
                <div className="status-chart">
                  <div
                    className="donut-wrap"
                    role="img"
                    aria-label={counts.map((c) => `${c.name}: ${c.value}`).join(', ')}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={counts}
                          cx="50%"
                          cy="50%"
                          innerRadius="74%"
                          outerRadius="95%"
                          dataKey="value"
                          paddingAngle={3}
                          stroke="none"
                          onClick={(s: any) => s?.name && navigate(`/tickets?status=${encodeURIComponent(String(s.name))}`)}
                        >
                          {counts.map((c) => (
                            <Cell key={c.name} fill={c.color} style={{ cursor: 'pointer' }} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ fontSize: 11, border: '1px solid #e5ebf3', borderRadius: 8 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center">
                      <strong>{data.tickets.length}</strong>
                      <span>tickets no total</span>
                    </div>
                  </div>
                  <div className="status-legend">
                    {counts.map((c) => (
                      <Link
                        key={c.name}
                        className="status-legend-row"
                        to={`/tickets?status=${encodeURIComponent(c.name)}`}
                      >
                        <span>
                          <i className="legend-dot" style={{ background: c.color }} />
                          {c.name}
                        </span>
                        <strong>{c.value.toString().padStart(2, '0')}</strong>
                      </Link>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}

          <Card className="dashboard-recent">
            <div className="card-header">
              <div>
                <h2>
                  Tickets recentes{' '}
                  <span className="chip" style={{ marginLeft: 7, fontSize: 8 }}>
                    {m.open.length} abertos
                  </span>
                </h2>
                <p>Os últimos movimentos da sua equipe de suporte</p>
              </div>
              <Link to="/tickets" className="link small">
                Ver todos
                <ArrowRight size={12} />
              </Link>
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    {['Ticket / assunto', 'Cliente', 'Prioridade', 'Status', 'Responsável', 'Atualizado'].map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((t) => {
                    const c = data.clients.find((c) => c.id === t.clientId);
                    const u = data.users.find((u) => u.id === t.assigneeId);
                    return (
                      <tr key={t.id}>
                        <td>
                          <Link to={`/tickets/${t.id}`}>
                            <span className="cell-subtitle" style={{ margin: 0, fontSize: 9 }}>
                              #{t.number}
                            </span>
                            <div className="cell-title" style={{ marginTop: 3 }}>
                              {t.title}
                            </div>
                          </Link>
                        </td>
                        <td>
                          <Link to={`/clientes/${c?.id}`} className="inline">
                            <Avatar name={c?.tradeName || c?.name || ''} size={27} />
                            <span>{c?.tradeName || c?.name}</span>
                          </Link>
                        </td>
                        <td>
                          <Badge status={t.priority} />
                        </td>
                        <td>
                          <Badge status={t.status} />
                        </td>
                        <td>
                          <span className="inline">
                            <Avatar name={u?.name || '?'} size={23} />
                            <span className="small">
                              {u?.name.split(' ')[0] || 'Não atribuído'}
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="cell-subtitle">{dateTime(t.updatedAt)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!recent.length && (
                <EmptyState
                  title="Tudo tranquilo por aqui"
                  description="Os novos chamados aparecerão nesta lista."
                />
              )}
            </div>
          </Card>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODO 2: FATURAS & BOLETOS DO SISTEMA                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'faturas' && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Faturamento Emitido (NFSe)"
              value={money(totalInvoiced)}
              icon={Receipt}
              tone="navy"
              detail={
                <>
                  <span className="positive">{allInvoices.filter((i) => i.status === 'Emitida').length} notas fiscais</span> emitidas
                </>
              }
              onClick={() => navigate('/financeiro?tab=invoices')}
            />
            <StatCard
              label="Boletos Liquidados (Pagos)"
              value={money(totalPaidCharges)}
              icon={CheckCircle2}
              tone="green"
              detail={
                <>
                  <span className="positive">{allCharges.filter((c) => c.status === 'Pago').length} liquidados</span> com sucesso
                </>
              }
              onClick={() => navigate('/financeiro?status=Pago')}
            />
            <StatCard
              label="Boletos Pendentes (A Receber)"
              value={money(totalPendingCharges)}
              icon={Clock3}
              tone="amber"
              detail={`${allCharges.filter((c) => effectiveChargeStatus(c, nowDay) === 'Pendente').length} aguardando liquidação`}
              onClick={() => navigate('/financeiro?status=Pendente')}
            />
            <StatCard
              label="Boletos Vencidos (Inadimplência)"
              value={money(totalOverdueCharges)}
              icon={CircleAlert}
              tone="red"
              detail={
                <>
                  <span className="negative">{m.overdue.length} cobranças</span> em atraso
                </>
              }
              onClick={() => navigate('/financeiro?status=Vencido')}
            />
          </div>

          {/* Destaques rápidos do financeiro */}
          <div className="dashboard-quick-metrics">
            <Link to="/financeiro?status=Vencido">
              <span className="quick-icon red">
                <CircleAlert size={13} />
              </span>
              <span>Boletos Vencidos</span>
              <strong>{m.overdue.length}</strong>
              <ChevronRight size={12} />
            </Link>
            <Link to="/financeiro?status=Pendente">
              <span className="quick-icon amber">
                <Clock3 size={13} />
              </span>
              <span>A Vencer</span>
              <strong>{allCharges.filter((c) => effectiveChargeStatus(c, nowDay) === 'Pendente').length}</strong>
              <ChevronRight size={12} />
            </Link>
            <Link to="/financeiro?tab=invoices">
              <span className="quick-icon blue">
                <Receipt size={13} />
              </span>
              <span>Notas Fiscais</span>
              <strong>{allInvoices.length}</strong>
              <ChevronRight size={12} />
            </Link>
            <Link to="/financeiro?status=Pago">
              <span className="quick-icon green">
                <CheckCircle2 size={13} />
              </span>
              <span>Boletos Compensados</span>
              <strong>{boletosPaid.length}</strong>
              <ChevronRight size={12} />
            </Link>
          </div>

          {/* Gráficos Financeiros */}
          <div className="dashboard-charts">
            <Card>
              <div className="card-header">
                <div>
                  <h2>Evolução Financeira</h2>
                  <p>Recebimentos diários vs Faturamento por competência</p>
                </div>
                <div className="filters">
                  <select
                    aria-label="Período do gráfico financeiro"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    <option value={7}>Últimos 7 dias</option>
                    <option value={14}>Últimos 14 dias</option>
                    <option value={30}>Últimos 30 dias</option>
                  </select>
                </div>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-dot" style={{ background: '#209b72' }} />
                  Recebimentos (R$)
                </span>
                <span>
                  <i className="legend-dot" style={{ background: '#3065e8' }} />
                  Faturamento (R$)
                </span>
              </div>
              <div className="chart-body" role="img" aria-label="Evolução financeira do sistema">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={financeChart} margin={{ top: 20, right: 16, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="paidFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#209b72" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="#209b72" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="invFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3065e8" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#3065e8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#edf1f6" strokeDasharray="3 5" />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#b0b9c6', fontSize: 9 }}
                      minTickGap={24}
                      dy={9}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#b0b9c6', fontSize: 9 }}
                      tickFormatter={(val) => `R$${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                    />
                    <Tooltip
                      formatter={(val: any) => [money(Number(val)), '']}
                      contentStyle={{ fontSize: 11, border: '1px solid #e4eaf2', borderRadius: 8 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Recebimentos"
                      stroke="#209b72"
                      strokeWidth={2}
                      fill="url(#paidFill)"
                      activeDot={{ r: 4 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Faturamento"
                      stroke="#3065e8"
                      strokeWidth={2}
                      fill="url(#invFill)"
                      strokeDasharray="3 3"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="card-header">
                <div>
                  <h2>Métodos de Pagamento</h2>
                  <p>Distribuição das cobranças por modalidade</p>
                </div>
                <Link to="/financeiro" className="icon-button" aria-label="Abrir módulo financeiro">
                  <ArrowUpRight size={15} />
                </Link>
              </div>
              <div className="status-chart">
                <div className="donut-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentMethodCounts.filter((p) => p.count > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius="74%"
                        outerRadius="95%"
                        dataKey="count"
                        paddingAngle={3}
                        stroke="none"
                      >
                        {paymentMethodCounts.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any, name: any, item: any) => [
                          `${val} transações (${money(item.payload.amount)})`,
                          name,
                        ]}
                        contentStyle={{ fontSize: 11, border: '1px solid #e5ebf3', borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <strong>{allCharges.length}</strong>
                    <span>lançamentos</span>
                  </div>
                </div>
                <div className="status-legend">
                  {paymentMethodCounts.map((m) => (
                    <div key={m.name} className="status-legend-row">
                      <span>
                        <i className="legend-dot" style={{ background: m.color }} />
                        {m.label}
                      </span>
                      <strong>{m.count} ({money(m.amount)})</strong>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Tabela Interativa de Faturas & Boletos */}
          <Card className="dashboard-recent">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2>
                  Monitoramento em Tempo Real de Boletos & Faturas{' '}
                  <span className="chip" style={{ marginLeft: 7, fontSize: 8 }}>
                    {filteredFinanceList.length} itens
                  </span>
                </h2>
                <p>Boletos emitidos, notas fiscais e conciliação de pagamentos</p>
              </div>

              {/* Filtros em pílula e busca rápida */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div className="filter-pills-row">
                  {[
                    { id: 'all', label: 'Todos' },
                    { id: 'boletos', label: 'Boletos' },
                    { id: 'faturas', label: 'Notas Fiscais' },
                    { id: 'vencidos', label: 'Vencidos' },
                    { id: 'pendentes', label: 'Pendentes' },
                    { id: 'pagos', label: 'Pagos' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFinanceFilter(tab.id as any)}
                      className={`filter-pill-btn ${financeFilter === tab.id ? 'active' : ''}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div style={{ width: 220 }}>
                  <SearchInput
                    value={financeSearch}
                    onChange={setFinanceSearch}
                    placeholder="Buscar documento ou cliente..."
                  />
                </div>
              </div>
            </div>

            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    {['Documento / Tipo', 'Cliente', 'Descrição', 'Data / Vencimento', 'Valor', 'Status', 'Ações'].map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredFinanceList.slice(0, 8).map((item) => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td>
                        <Link to={item.targetUrl}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                background: item.kind === 'boleto' ? '#dce7ff' : item.kind === 'fatura' ? '#e3d7fc' : '#edf1f7',
                                color: item.kind === 'boleto' ? '#1e40af' : item.kind === 'fatura' ? '#6b21a8' : '#475569',
                              }}
                            >
                              {item.kind === 'boleto' ? 'BOLETO' : item.kind === 'fatura' ? 'NFSe' : (item.method || 'COB')}
                            </span>
                            <span className="cell-title font-mono">{item.number}</span>
                          </div>
                        </Link>
                      </td>
                      <td>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {item.clientName}
                        </span>
                      </td>
                      <td>
                        <span className="cell-subtitle" style={{ margin: 0 }}>
                          {item.description}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                          {date(item.date)}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: 13, color: '#10b981' }}>
                          {money(item.amount)}
                        </strong>
                      </td>
                      <td>
                        <Badge status={item.badgeStatus as any} />
                      </td>
                      <td>
                        <Link
                          to={item.targetUrl}
                          className="icon-button"
                          title="Visualizar lançamento completo"
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredFinanceList.length && (
                <EmptyState
                  title="Nenhum lançamento encontrado"
                  description="Ajuste os filtros de pesquisa para visualizar outros títulos ou boletos."
                />
              )}
            </div>
          </Card>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODO 3: PROPOSTAS ASSINADAS & CONTRATOS                               */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'propostas' && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Propostas Assinadas / Ganhas"
              value={signedOnlyItems.length.toString().padStart(2, '0')}
              icon={FileCheck2}
              tone="green"
              detail={
                <>
                  <span className="positive">{conversionRate}% de conversão</span> comercial
                </>
              }
              onClick={() => navigate('/propostas')}
            />
            <StatCard
              label="Receita Total Convertida"
              value={money(totalSignedRevenue)}
              icon={TrendingUp}
              tone="navy"
              detail={
                <>
                  <ArrowUpRight size={11} className="positive" />
                  Volume financeiro fechado
                </>
              }
              onClick={() => navigate('/propostas')}
            />
            <StatCard
              label="Ticket Médio Assinado"
              value={money(avgSignedTicket)}
              icon={DollarSign}
              tone="blue"
              detail="Média por proposta/contrato assinado"
              onClick={() => navigate('/propostas')}
            />
            <StatCard
              label="Total de Documentos no Funil"
              value={unifiedSignedList.length.toString().padStart(2, '0')}
              icon={Layers}
              tone="amber"
              detail={`${unifiedSignedList.filter((p) => p.status.toLowerCase().includes('anális') || p.status === 'open').length} propostas em análise`}
              onClick={() => navigate('/propostas')}
            />
          </div>

          {/* Destaques rápidos do comercial */}
          <div className="dashboard-quick-metrics">
            <Link to="/propostas">
              <span className="quick-icon green">
                <FileCheck2 size={13} />
              </span>
              <span>Propostas Assinadas</span>
              <strong>{signedOnlyItems.length}</strong>
              <ChevronRight size={12} />
            </Link>
            <Link to="/contratos-crm">
              <span className="quick-icon blue">
                <FileSignature size={13} />
              </span>
              <span>Contratos Vigentes</span>
              <strong>{crmContracts.length || data.documents.filter((d) => d.category === 'Contrato').length}</strong>
              <ChevronRight size={12} />
            </Link>
            <Link to="/propostas">
              <span className="quick-icon amber">
                <Clock3 size={13} />
              </span>
              <span>Aguardando Assinatura</span>
              <strong>{unifiedSignedList.filter((p) => p.status.toLowerCase().includes('anális') || p.status === 'open').length}</strong>
              <ChevronRight size={12} />
            </Link>
            <Link to="/pipeline">
              <span className="quick-icon blue">
                <Sparkles size={13} />
              </span>
              <span>Abrir Funil Kanban</span>
              <strong>CRM</strong>
              <ChevronRight size={12} />
            </Link>
          </div>

          {/* Gráficos de Propostas Assinadas */}
          <div className="dashboard-charts">
            <Card>
              <div className="card-header">
                <div>
                  <h2>Evolução de Fechamentos & Assinaturas</h2>
                  <p>Novas propostas e contratos formalizados</p>
                </div>
                <div className="filters">
                  <select
                    aria-label="Período do gráfico de propostas"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    <option value={7}>Últimos 7 dias</option>
                    <option value={14}>Últimos 14 dias</option>
                    <option value={30}>Últimos 30 dias</option>
                  </select>
                </div>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-dot" style={{ background: '#209b72' }} />
                  Propostas Assinadas
                </span>
                <span>
                  <i className="legend-dot" style={{ background: '#6366f1' }} />
                  Receita Convertida (R$)
                </span>
              </div>
              <div className="chart-body" role="img" aria-label="Evolução de propostas assinadas">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={proposalEvolutionChart} margin={{ top: 20, right: 16, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="propFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#209b72" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#209b72" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#edf1f6" strokeDasharray="3 5" />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#b0b9c6', fontSize: 9 }}
                      minTickGap={24}
                      dy={9}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      tick={{ fill: '#b0b9c6', fontSize: 9 }}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        name === 'Receita' ? money(Number(val)) : val,
                        name,
                      ]}
                      contentStyle={{ fontSize: 11, border: '1px solid #e4eaf2', borderRadius: 8 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Assinadas"
                      stroke="#209b72"
                      strokeWidth={2}
                      fill="url(#propFill)"
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="card-header">
                <div>
                  <h2>Estágio das Propostas Comerciais</h2>
                  <p>Taxa de aceitação e propostas em curso</p>
                </div>
                <Link to="/propostas" className="icon-button" aria-label="Ver todas as propostas">
                  <ArrowUpRight size={15} />
                </Link>
              </div>
              <div className="status-chart">
                <div className="donut-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={proposalDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius="74%"
                        outerRadius="95%"
                        dataKey="value"
                        paddingAngle={3}
                        stroke="none"
                      >
                        {proposalDistribution.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 11, border: '1px solid #e5ebf3', borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <strong>{signedOnlyItems.length}</strong>
                    <span>assinadas</span>
                  </div>
                </div>
                <div className="status-legend">
                  {proposalDistribution.map((c) => (
                    <div key={c.name} className="status-legend-row">
                      <span>
                        <i className="legend-dot" style={{ background: c.color }} />
                        {c.name}
                      </span>
                      <strong>{c.value.toString().padStart(2, '0')}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Tabela Interativa de Propostas Assinadas & Contratos */}
          <Card className="dashboard-recent">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2>
                  Monitoramento de Propostas & Contratos Assinados{' '}
                  <span className="chip" style={{ marginLeft: 7, fontSize: 8 }}>
                    {filteredProposalsList.length} registros
                  </span>
                </h2>
                <p>Oportunidades ganhas, signatários e contratos formalizados</p>
              </div>

              {/* Filtros em pílula e busca rápida */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div className="filter-pills-row">
                  {[
                    { id: 'all', label: 'Todas' },
                    { id: 'aceitas', label: 'Propostas Ganhas' },
                    { id: 'contratos', label: 'Contratos Assinados' },
                    { id: 'analise', label: 'Em Negociação' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setProposalsFilter(tab.id as any)}
                      className={`filter-pill-btn ${proposalsFilter === tab.id ? 'active' : ''}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div style={{ width: 220 }}>
                  <SearchInput
                    value={proposalsSearch}
                    onChange={setProposalsSearch}
                    placeholder="Buscar proposta ou cliente..."
                  />
                </div>
              </div>
            </div>

            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    {['Código / Documento', 'Cliente Destinatário', 'Objeto da Negociação', 'Data do Aceite', 'Valor Fechado', 'Signatário / Autenticação', 'Ações'].map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProposalsList.slice(0, 8).map((item) => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td>
                        <Link to={item.targetUrl}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                background: item.kind === 'contrato' ? '#e3d7fc' : '#dcfce7',
                                color: item.kind === 'contrato' ? '#6b21a8' : '#15803d',
                              }}
                            >
                              {item.kind === 'contrato' ? 'CONTRATO' : 'PROPOSTA'}
                            </span>
                            <span className="cell-title font-mono">{item.code}</span>
                          </div>
                        </Link>
                      </td>
                      <td>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.clientName}
                        </span>
                      </td>
                      <td>
                        <span className="cell-subtitle" style={{ margin: 0, maxWidth: 280, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                          {date(item.date)}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: 13, color: '#10b981' }}>
                          {money(item.amount)}
                        </strong>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <CheckCheck size={13} className="text-emerald-600" />
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {item.signedBy || 'Assinado Eletronicamente'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <Link
                          to={item.targetUrl}
                          className="icon-button"
                          title="Abrir detalhes da proposta"
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredProposalsList.length && (
                <EmptyState
                  title="Nenhuma proposta localizada"
                  description="Ajuste os filtros ou crie uma nova proposta comercial no sistema."
                  action={
                    <Button onClick={() => navigate('/propostas')}>
                      <Plus size={14} /> Criar Proposta
                    </Button>
                  }
                />
              )}
            </div>
          </Card>
        </>
      )}

      {/* ─── BLOCO INFERIOR COMUM: ALERTAS, CONTRATOS E AGENDA ──────────────── */}
      <div className="dashboard-bottom">
        <Card>
          <div className="card-header">
            <h2>{viewMode === 'faturas' ? 'Situação das cobranças' : viewMode === 'propostas' ? 'Contratos & Formalizações' : 'Alertas operacionais'}</h2>
            {viewMode === 'operacao' && (
              <span className="chip">{notices.length + (m.critical.length ? 1 : 0)}</span>
            )}
          </div>
          {viewMode === 'faturas' ? (
            <ChargeChart data={chargeCounts} />
          ) : viewMode === 'propostas' ? (
            <div>
              {signedOnlyItems.slice(0, 3).map((item) => (
                <Link to={item.targetUrl} className="list-item" key={item.id}>
                  <span className="alert-symbol blue">
                    <FileCheck2 size={14} />
                  </span>
                  <div className="list-item-content">
                    <span className="list-item-title">{item.clientName}</span>
                    <div className="list-item-subtitle">
                      {item.code} · {money(item.amount)}
                    </div>
                  </div>
                  <ChevronRight size={12} className="muted" />
                </Link>
              ))}
            </div>
          ) : (
            <div>
              {notices.map((s) => (
                <Link to={`/servidores/${s.id}`} className="list-item" key={s.id}>
                  <span className={`alert-symbol ${s.status === 'Indisponível' ? 'red' : ''}`}>
                    <CircleAlert size={14} />
                  </span>
                  <div className="list-item-content">
                    <span className="list-item-title">{s.name}</span>
                    <div className="list-item-subtitle">
                      {s.status} · {s.unavailableExtensions} ramais indisponíveis
                    </div>
                  </div>
                  <ChevronRight size={12} className="muted" />
                </Link>
              ))}
              {m.critical.length > 0 && (
                <Link to="/tickets?open=1&priority=Crítica" className="list-item">
                  <span className="alert-symbol blue">
                    <Ticket size={14} />
                  </span>
                  <div>
                    <span className="list-item-title">
                      {m.critical.length} tickets de prioridade crítica
                    </span>
                    <div className="list-item-subtitle">Confira os atendimentos prioritários</div>
                  </div>
                </Link>
              )}
              {!notices.length && !m.critical.length && <EmptyState title="Nenhum alerta ativo" />}
            </div>
          )}
        </Card>

        <Card>
          <div className="card-header">
            <h2>Contratos a vencer</h2>
            <Link to="/documentos?expiring=1" className="link small">
              Ver todos
              <ArrowRight size={11} />
            </Link>
          </div>
          {m.expiring.slice(0, 3).map((d) => (
            <Link to={`/documentos?id=${d.id}`} className="list-item" key={d.id}>
              <span className="alert-symbol blue">
                <FileText size={15} />
              </span>
              <div className="list-item-content">
                <span className="list-item-title">
                  {data.clients.find((c) => c.id === d.clientId)?.tradeName}
                </span>
                <div className="list-item-subtitle">
                  {d.number || 'Contrato'} · {date(d.endDate)}
                </div>
              </div>
              <span className="list-item-end">
                {Math.ceil(
                  (new Date(`${d.endDate}T12:00:00Z`).getTime() -
                    new Date(`${nowDay}T12:00:00Z`).getTime()) /
                    86400000,
                )}{' '}
                dias
              </span>
            </Link>
          ))}
          {!m.expiring.length && (
            <EmptyState
              title="Nenhum contrato próximo do vencimento"
              description="A janela considera os próximos 30 dias."
            />
          )}
        </Card>

        <Card>
          <div className="card-header">
            <h2>
              Próximos compromissos{' '}
              <span className="chip" style={{ fontSize: 8 }}>
                {m.upcoming.length}
              </span>
            </h2>
            <Link to="/agenda?upcoming=1" className="link small">
              Agenda
              <ArrowRight size={11} />
            </Link>
          </div>
          {m.upcoming.slice(0, 3).map((e) => (
            <Link to={`/agenda?id=${e.id}`} className="list-item" key={e.id}>
              <div className="mini-date">
                <span>
                  {new Intl.DateTimeFormat('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    month: 'short',
                  })
                    .format(new Date(e.start))
                    .replace('.', '')}
                </span>
                <strong>{localDay(e.start).slice(-2)}</strong>
              </div>
              <div className="list-item-content">
                <span className="list-item-title">{e.title}</span>
                <div className="list-item-subtitle">
                  {time(e.start)} · {e.type}
                </div>
              </div>
            </Link>
          ))}
          {!m.upcoming.length && (
            <EmptyState
              title="Agenda livre"
              description="Agende sua próxima reunião ou visita técnica."
            />
          )}
        </Card>
      </div>

      {viewMode === 'operacao' && !isSupport && !isFinance && (
        <Card>
          <div className="financial-summary-row">
            <div>
              <div className="card-header" style={{ marginBottom: 8 }}>
                <h2>Situação das cobranças</h2>
              </div>
              <p className="muted small">Resumo consolidado de cobranças da empresa</p>
            </div>
            <div className="financial-summary-chart">
              <div
                className="mini-bars"
                role="img"
                aria-label={chargeCounts.map((c) => `${c.label}: ${c.value}`).join(', ')}
              >
                {chargeCounts
                  .filter((c) => c.value > 0)
                  .map((c) => (
                    <Link
                      title={`${c.label}: ${c.value}`}
                      aria-label={`${c.label}: ${c.value}. Ver cobranças`}
                      key={c.name}
                      to={`/financeiro?status=${c.name}`}
                      style={{ flex: c.value, background: c.color, borderRadius: 3 }}
                    />
                  ))}
              </div>
              <div className="chart-legend">
                {chargeCounts.map((c) => (
                  <Link key={c.name} to={`/financeiro?status=${c.name}`}>
                    <i className="legend-dot" style={{ background: c.color }} />
                    {c.label} <strong>{c.value}</strong>
                  </Link>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="link small"
              onClick={() => setViewMode('faturas')}
              style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#3065e8', fontWeight: 600 }}
            >
              Monitorar faturas & boletos
              <ArrowRight size={13} />
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

function ChargeChart({
  data,
}: {
  data: { name: string; label: string; color: string; value: number }[];
}) {
  return (
    <>
      <div
        className="mini-bars"
        role="img"
        aria-label={data.map((c) => `${c.label}: ${c.value}`).join(', ')}
        style={{ height: 12, marginTop: 24 }}
      >
        {data
          .filter((c) => c.value)
          .map((c) => (
            <Link
              key={c.name}
              to={`/financeiro?status=${c.name}`}
              style={{ flex: c.value, background: c.color }}
              aria-label={`${c.label}: ${c.value}`}
            />
          ))}
      </div>
      <div className="status-legend" style={{ marginTop: 20 }}>
        {data.map((c) => (
          <Link key={c.name} className="status-legend-row" to={`/financeiro?status=${c.name}`}>
            <span>
              <i className="legend-dot" style={{ background: c.color }} />
              {c.label}
            </span>
            <strong>{c.value}</strong>
          </Link>
        ))}
      </div>
    </>
  );
}
