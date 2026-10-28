import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Barcode,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Download,
  FileText,
  Headphones,
  Info,
  Layers3,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  QrCode,
  ShieldCheck,
  Sparkles,
  Ticket,
  User,
  Wallet,
  AlertTriangle,
  ExternalLink,
  Send,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, StatCard } from '../components/ui';
import { date, money } from '../utils/format';
import { effectiveChargeStatus } from '../utils/finance';
import type { Charge, Ticket as TicketType } from '../types';

interface LivePortalData {
  client: any;
  tickets: any[];
  charges: any[];
  contracts: any[];
  invoices: any[];
  services: any[];
  asaas?: {
    configured: boolean;
    environment: string;
    customer: any | null;
    payments: any[];
    message: string;
  };
}

export function PortalPage() {
  const { data, session, patch, notify } = useApp();
  const { user: authUser } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();

  const [paymentModalCharge, setPaymentModalCharge] = useState<any | null>(null);

  // Modal para abertura de chamado direto pelo portal
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketCategory, setTicketCategory] = useState('PABX em nuvem');
  const [ticketPriority, setTicketPriority] = useState('Média');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  // Dados reais carregados autoritativamente via endpoint seguro do servidor
  const [liveData, setLiveData] = useState<LivePortalData | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [asaasConsulting, setAsaasConsulting] = useState(false);

  const authPortalClientId =
    typeof window !== 'undefined' ? localStorage.getItem('portal_client_id') : null;
  const authPortalClientEmail =
    typeof window !== 'undefined'
      ? (localStorage.getItem('portal_client_email') || '').toLowerCase().trim()
      : '';
  const authPortalClientName =
    typeof window !== 'undefined' ? localStorage.getItem('portal_client_name') : null;

  const getPortalAuthHeaders = (): Record<string, string> => {
    const portalToken =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('crm_portal_token') || ''
        : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-portal-token': portalToken,
    };
    if (portalToken) {
      headers['Authorization'] = `Bearer ${portalToken}`;
    }
    return headers;
  };

  const handlePortalUnauthorized = (status: number): boolean => {
    if (status === 401 || status === 403) {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('crm_portal_token');
        localStorage.removeItem('portal_client_id');
        localStorage.removeItem('portal_client_email');
        localStorage.removeItem('portal_client_name');
        if (!window.location.pathname.startsWith('/portal-login')) {
          window.location.href = '/portal-login';
        }
      }
      return true;
    }
    return false;
  };

  const handleConsultAsaas = async () => {
    setAsaasConsulting(true);
    try {
      const queryParams = new URLSearchParams();
      if (authPortalClientEmail) queryParams.set('email', authPortalClientEmail);
      if (authPortalClientId) queryParams.set('clientId', authPortalClientId);
      if (tenant?.id) queryParams.set('tenantId', tenant.id);

      const res = await fetch(`/api/portal/asaas?${queryParams.toString()}`, {
        headers: getPortalAuthHeaders(),
        credentials: 'include',
      });
      if (handlePortalUnauthorized(res.status)) return;
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.asaas) {
          setLiveData((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              asaas: json.asaas,
            };
          });
          notify(json.asaas.message || 'Boletos e faturas consultados no Asaas com sucesso!');
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        notify(errJson?.error || 'Não foi possível consultar o Asaas no momento.', 'error');
      }
    } catch (err: any) {
      notify('Erro ao consultar Asaas: ' + (err?.message || 'Erro de rede'), 'error');
    } finally {
      setAsaasConsulting(false);
    }
  };

  // Efeito para carregar os dados reais do banco Appwrite via API segura
  useEffect(() => {
    let alive = true;
    const fetchRealData = async () => {
      try {
        const queryParams = new URLSearchParams();
        if (authPortalClientEmail) queryParams.set('email', authPortalClientEmail);
        if (authPortalClientId) queryParams.set('clientId', authPortalClientId);
        if (tenant?.id) queryParams.set('tenantId', tenant.id);

        const res = await fetch(`/api/portal?${queryParams.toString()}`, {
          headers: getPortalAuthHeaders(),
          credentials: 'include',
        });
        if (handlePortalUnauthorized(res.status)) return;
        if (res.ok) {
          const json = await res.json();
          if (alive && json.success && json.client) {
            setLiveData(json);
          }
        }
      } catch (err) {
        console.warn('[PortalPage] Falha na leitura remota, utilizando cache local:', err);
      } finally {
        if (alive) setLiveLoading(false);
      }
    };

    fetchRealData();
    return () => {
      alive = false;
    };
  }, [authPortalClientEmail, authPortalClientId, tenant?.id]);

  // Enquanto a leitura autoritativa em tempo real estiver em andamento, exibe skeleton loader
  // para evitar exibição de dados falsos ou transitórios.
  if (liveLoading) {
    const greetingName = authPortalClientName
      ? authPortalClientName.split(' ')[0]
      : (authUser?.name?.split(' ')[0] || '');
    return (
      <div className="page-stack animate-fadeIn">
        <PageHeader
          title="Portal do Cliente"
          description={
            authPortalClientName
              ? `${authPortalClientName} · Conectando à sua central de autoatendimento...`
              : 'Conectando à sua central de autoatendimento...'
          }
        />

        {/* Hero Banner Skeleton */}
        <div className="portal-hero">
          <div>
            <span
              className="eyebrow"
              style={{ color: '#8fabc4', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={14} /> CENTRAL DE RELACIONAMENTO & SUPORTE EM TEMPO REAL
            </span>
            <h2>Olá{greetingName ? `, ${greetingName}` : ''}! Sincronizando seu painel...</h2>
            <p>
              Acompanhe o andamento dos seus chamados técnicos, consulte faturas e gerencie serviços com total transparência.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div className="h-10 w-32 rounded-xl bg-white/10 animate-pulse" />
            <div className="h-10 w-36 rounded-xl bg-white/10 animate-pulse" />
          </div>
        </div>

        {/* 4 StatCards Skeleton */}
        <div className="stat-grid animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200/70 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs flex flex-col justify-between h-[110px]"
            >
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-32 rounded bg-slate-200 dark:bg-white/[0.08]" />
                <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-white/[0.05]" />
              </div>
              <div className="h-7 w-24 rounded bg-slate-200 dark:bg-white/[0.08]" />
              <div className="h-3 w-40 rounded bg-slate-100 dark:bg-white/[0.04]" />
            </div>
          ))}
        </div>

        {/* 2 Main Cards Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
          <div className="rounded-2xl border border-slate-200/70 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.05]">
              <div className="h-5 w-48 rounded bg-slate-200 dark:bg-white/[0.08]" />
              <div className="h-8 w-24 rounded-xl bg-slate-100 dark:bg-white/[0.05]" />
            </div>
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-3.5 space-y-2"
                >
                  <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-white/[0.08]" />
                  <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-white/[0.04]" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.05]">
              <div className="h-5 w-48 rounded bg-slate-200 dark:bg-white/[0.08]" />
              <div className="h-8 w-24 rounded-xl bg-slate-100 dark:bg-white/[0.05]" />
            </div>
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-3.5 space-y-2"
                >
                  <div className="flex justify-between">
                    <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-white/[0.08]" />
                    <div className="h-4 w-20 rounded bg-slate-200 dark:bg-white/[0.08]" />
                  </div>
                  <div className="h-3 w-1/3 rounded bg-slate-100 dark:bg-white/[0.04]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Resolução autoritativa do cliente:
  // 1. Prioriza dados ao vivo carregados diretamente do Appwrite pelo endpoint /api/portal
  // 2. Fallbacks estritos baseados na sessão autenticada do usuário (sem atribuir dados de outros clientes)
  const clientFallback =
    (authPortalClientId ? data.clients.find((c) => c.id === authPortalClientId) : undefined) ||
    (session?.clientId ? data.clients.find((c) => c.id === session.clientId) : undefined) ||
    (authPortalClientEmail
      ? data.clients.find(
          (c) =>
            c.email.toLowerCase() === authPortalClientEmail ||
            c.portalAccess?.email?.toLowerCase() === authPortalClientEmail ||
            c.contacts.some((ct) => ct.email.toLowerCase() === authPortalClientEmail),
        )
      : undefined);

  const authenticatedClient =
    clientFallback ||
    (authPortalClientId || session?.role === 'client'
      ? {
          id: authPortalClientId || session?.clientId || 'portal-client',
          name: authPortalClientName || authUser?.name || 'Cliente',
          tradeName: authPortalClientName || authUser?.name || 'Cliente',
          email: authPortalClientEmail || '',
          contacts: [
            {
              id: 'primary',
              name: authPortalClientName || authUser?.name || 'Cliente',
              email: authPortalClientEmail || '',
              primary: true,
              role: 'Titular da Conta',
            },
          ],
          status: 'Ativo',
        }
      : undefined);

  const client = liveData?.client || authenticatedClient;

  if (!client) {
    return (
      <div className="page-stack flex items-center justify-center p-12">
        <EmptyState
          title="Conta não localizada"
          description="Não encontramos os dados cadastrais desta conta de assinante."
          action={<Button onClick={() => navigate('/portal-login')}>Retornar ao Login</Button>}
        />
      </div>
    );
  }

  // Chamados do cliente: prioriza os reais retornados pela API autoritativa
  const allTickets =
    liveData?.tickets !== undefined
      ? liveData.tickets
      : client?.id && data.clients.some((c) => c.id === client.id)
      ? data.tickets.filter((t) => t.clientId === client.id)
      : [];

  // Filtro de chamados em andamento (Em andamento, Aguardando retorno, Novo)
  const inProgressTickets = allTickets.filter((t) =>
    ['Em andamento', 'Aguardando retorno', 'Novo', 'open', 'in_progress'].includes(t.status),
  );

  // Cobranças / Faturas do cliente: prioriza as reais retornadas pela API e enriquece com Asaas
  const rawCharges =
    liveData?.charges !== undefined
      ? liveData.charges
      : client?.id && data.clients.some((c) => c.id === client.id)
      ? data.charges.filter((c) => c.clientId === client.id)
      : [];

  // Mescla e enriquece com dados do Asaas (boletos, links oficiais, Pix e código de barras)
  const allCharges = (() => {
    const list = rawCharges.map((ch: any) => {
      const asaasPay = liveData?.asaas?.payments?.find(
        (p: any) =>
          p.id === ch.id ||
          p.id === ch.asaasPaymentId ||
          p.invoiceNumber === ch.number ||
          (p.id && ch.number && p.id.includes(ch.number.replace(/\D/g, '')))
      );
      if (!asaasPay) return ch;
      return {
        ...ch,
        invoiceUrl: ch.invoiceUrl || asaasPay.invoiceUrl,
        bankSlipUrl: ch.bankSlipUrl || asaasPay.bankSlipUrl,
        pixPayload: ch.pixPayload || asaasPay.pixPayload,
        barcode: ch.barcode || asaasPay.barcode,
        asaasPaymentId: asaasPay.id,
      };
    });

    // Se houver cobranças no Asaas que não existiam na lista principal, adiciona
    if (liveData?.asaas?.payments?.length) {
      liveData.asaas.payments.forEach((p: any) => {
        const exists = list.some(
          (c: any) =>
            c.id === p.id ||
            c.asaasPaymentId === p.id ||
            c.number === p.invoiceNumber ||
            (p.invoiceNumber && c.number === p.invoiceNumber)
        );
        if (!exists) {
          const isOverdue =
            p.status === 'OVERDUE' ||
            (p.dueDate && new Date(`${p.dueDate}T23:59:59Z`).getTime() < Date.now());
          list.push({
            id: p.id,
            number: p.invoiceNumber || p.id,
            description: p.description || 'Cobrança Asaas',
            amount: p.value || 0,
            dueDate: p.dueDate || '',
            status:
              p.status === 'RECEIVED' || p.status === 'CONFIRMED'
                ? 'Pago'
                : isOverdue
                ? 'Vencido'
                : 'Pendente',
            method:
              p.billingType === 'BOLETO'
                ? 'Boleto'
                : p.billingType === 'PIX'
                ? 'PIX'
                : 'Cartão',
            paidAt: p.paymentDate || null,
            asaasPaymentId: p.id,
            invoiceUrl: p.invoiceUrl,
            bankSlipUrl: p.bankSlipUrl,
            pixPayload: p.pixPayload,
            barcode: p.barcode,
          });
        }
      });
    }

    return list;
  })();

  // F35: Precedência estrita de estados terminais antes da regra de vencimento por data
  const getEffectiveChargeStatus = (charge: any): string => {
    const raw = String(charge?.status || 'Pendente').trim();
    const lower = raw.toLowerCase();
    const terminalStatuses = [
      'cancelado',
      'cancelada',
      'estornado',
      'estornada',
      'pago',
      'paga',
      'arquivado',
    ];
    if (terminalStatuses.includes(lower)) {
      if (lower.startsWith('cancel')) return 'Cancelado';
      if (lower.startsWith('pag')) return 'Pago';
      return raw;
    }
    if (charge?.paidAt) return 'Pago';
    const isDuePassed =
      charge?.dueDate && new Date(`${charge.dueDate}T23:59:59Z`).getTime() < Date.now();
    if (isDuePassed) return 'Vencido';
    return raw || 'Pendente';
  };

  // Faturas em aberto (apenas Pendente ou Vencido; excluindo Cancelado/Estornado/Pago/Arquivado)
  const openCharges = allCharges.filter((c: any) => {
    const eff = getEffectiveChargeStatus(c);
    return eff === 'Pendente' || eff === 'Vencido';
  });

  const openChargesTotal = openCharges.reduce((acc: number, c: any) => acc + (Number(c.amount) || 0), 0);

  // Serviços contratados
  const clientServices =
    liveData?.services !== undefined
      ? liveData.services
      : client?.id && data.clients.some((c) => c.id === client.id)
      ? data.services.filter((s) => s.clientId === client.id)
      : [];

  // Contratos & Documentos
  const clientContracts =
    liveData?.contracts !== undefined
      ? liveData.contracts
      : client?.id && data.clients.some((c) => c.id === client.id)
      ? data.documents.filter((d) => d.clientId === client.id && d.shared)
      : [];

  // Contato principal
  const primaryContact = client?.contacts?.find((c: any) => c.primary) || client?.contacts?.[0] || {
    name: client?.tradeName || client?.name || 'Cliente',
    role: 'Representante Legal',
    email: client?.email || '',
    phone: client?.phone || '',
  };

  // F12: Retorna apenas payload PIX emitido pelo provedor (Asaas), sem fabricar strings
  const getPixPayload = (charge: any): string =>
    (
      charge?.pixCopyPaste ||
      charge?.pixPayload ||
      charge?.asaasBilling?.pix?.payload ||
      ''
    ).trim();

  // F12: Retorna apenas linha digitável emitida pelo provedor (Asaas), sem fabricar códigos
  const getBoletoBarcode = (charge: any): string =>
    (
      charge?.barcode ||
      charge?.identificationField ||
      charge?.asaasBilling?.bankSlip?.identificationField ||
      ''
    ).trim();

  const handleCopyPix = (charge: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const pix = getPixPayload(charge);
    if (!pix) {
      notify('Código de pagamento indisponível no provedor. Verifique a integração Asaas.', 'error');
      return;
    }
    navigator.clipboard.writeText(pix);
    notify('Código PIX Copia e Cola copiado com sucesso!');
  };

  const handleCopyBarcode = (charge: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const barcode = getBoletoBarcode(charge);
    if (!barcode) {
      notify('Código de pagamento indisponível no provedor. Verifique a integração Asaas.', 'error');
      return;
    }
    navigator.clipboard.writeText(barcode);
    notify('Linha digitável do boleto copiada com sucesso!');
  };

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketTitle.trim()) {
      notify('Preencha o título do chamado.', 'error');
      return;
    }

    setTicketSubmitting(true);
    try {
      const res = await fetch('/api/portal/tickets', {
        method: 'POST',
        headers: getPortalAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          clientId: client.id,
          title: ticketTitle.trim(),
          category: ticketCategory,
          priority: ticketPriority,
          description: ticketDescription.trim(),
        }),
      });
      if (handlePortalUnauthorized(res.status)) return;

      if (res.ok) {
        const json = await res.json();
        const createdDoc = json.ticket;
        const formattedNewTicket = {
          id: createdDoc.$id,
          protocol: createdDoc.protocol_number || Math.floor(1000 + Math.random() * 9000),
          title: createdDoc.title,
          category: createdDoc.category,
          priority: createdDoc.priority,
          status: 'Novo',
          description: createdDoc.description,
          createdAt: createdDoc.created_at,
          updatedAt: createdDoc.updated_at,
          messages: [
            {
              id: 'msg_initial',
              author: 'Cliente (Portal)',
              text: createdDoc.description || createdDoc.title,
              createdAt: createdDoc.created_at,
            },
          ],
        };

        setLiveData((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            tickets: [formattedNewTicket, ...(prev.tickets || [])],
          };
        });

        notify(`Chamado #${formattedNewTicket.protocol} aberto com sucesso!`);
        setNewTicketModalOpen(false);
        setTicketTitle('');
        setTicketDescription('');
      } else {
        throw new Error('Falha ao registrar chamado no servidor.');
      }
    } catch (err: any) {
      notify(err?.message || 'Erro ao abrir chamado.', 'error');
    } finally {
      setTicketSubmitting(false);
    }
  };

  return (
    <div className="page-stack">
      {/* Cabeçalho do Portal */}
      <PageHeader
        title="Portal do Cliente"
        description={`${client.tradeName || client.name} · Bem-vindo à sua central de autoatendimento e telecomunicações.`}
      />

      {/* Hero Banner Personalizado */}
      <div className="portal-hero">
        <div>
          <span className="eyebrow" style={{ color: '#8fabc4', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} /> CENTRAL DE RELACIONAMENTO & SUPORTE EM TEMPO REAL
          </span>
          <h2>Olá, {primaryContact?.name?.split(' ')[0] || client?.tradeName || client?.name || 'Cliente'}! Como podemos ajudar hoje?</h2>
          <p>
            Acompanhe o andamento dos seus chamados técnicos, consulte e realize o pagamento de faturas em aberto
            e gerencie seus serviços de telefonia com total transparência.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button onClick={() => setNewTicketModalOpen(true)}>
            <Plus size={15} />
            Novo Chamado
          </Button>
          <Button variant="secondary" onClick={() => navigate('/portal/financeiro')}>
            <Wallet size={15} />
            Minhas Faturas
          </Button>
        </div>
      </div>

      {/* Grid de Estatísticas (KPIs) */}
      <div className="stat-grid">
        <StatCard
          label="Chamados em Andamento"
          value={inProgressTickets.length}
          icon={Ticket}
          tone="blue"
          detail={
            inProgressTickets.length > 0
              ? `${inProgressTickets.length} ticket(s) ativo(s) na central`
              : 'Nenhum chamado pendente'
          }
          onClick={() => navigate('/portal/tickets?open=1')}
        />
        <StatCard
          label="Faturas em Aberto"
          value={money(openChargesTotal)}
          icon={Wallet}
          tone={openCharges.length > 0 ? 'amber' : 'green'}
          detail={
            openCharges.length > 0
              ? `${openCharges.length} fatura(s) aguardando pagamento`
              : 'Todas as faturas em dia!'
          }
          onClick={() => navigate('/portal/financeiro')}
        />
        <StatCard
          label="Serviços Ativos"
          value={clientServices.length}
          icon={Layers3}
          tone="green"
          detail={clientServices.length > 0 ? `${clientServices.length} planos e canais ativos` : 'Telefonia em nuvem'}
          onClick={() =>
            document.getElementById('portal-services')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        />
        <StatCard
          label="Documentos & Contratos"
          value={clientContracts.length}
          icon={FileText}
          tone="navy"
          detail={clientContracts.length > 0 ? 'Contrato vigente assinado' : 'Nenhum documento arquivado'}
          onClick={() => navigate('/portal/documentos')}
        />
      </div>

      {/* Grid Principal: Chamados em Andamento + Faturas em Aberto */}
      <div className="grid-2">
        {/* Card: Chamados em Andamento */}
        <Card>
          <div className="card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2>Chamados em Andamento</h2>
                {inProgressTickets.length > 0 && (
                  <span
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#2563eb',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {inProgressTickets.length} ativo(s)
                  </span>
                )}
              </div>
              <p>Solicitações e suporte em atendimento pela nossa equipe técnica</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button size="sm" onClick={() => setNewTicketModalOpen(true)}>
                <Plus size={13} /> Novo
              </Button>
              <Link className="link small" to="/portal/tickets">
                Ver todos <ArrowRight size={12} />
              </Link>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {inProgressTickets.map((t) => {
              const messages = t.messages || [];
              const lastMsg = messages.filter((m: any) => !m.internal).at(-1);
              const isUrgent = t.priority === 'Alta' || t.priority === 'Crítica';

              return (
                <div
                  key={t.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid var(--border, #e6eaf1)',
                    background: 'var(--card-bg, #ffffff)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                  className="hover:border-blue-300 dark:hover:border-blue-700"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background: 'rgba(59, 130, 246, 0.12)',
                          color: '#1d4ed8',
                          padding: '2px 7px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        #{t.protocol || t.number || '1000'}
                      </span>
                      <strong style={{ fontSize: '13px', color: 'var(--foreground, #1e293b)' }}>
                        {t.title}
                      </strong>
                    </div>
                    <Badge status={t.status === 'Novo' ? 'Em andamento' : t.status} />
                  </div>

                  {lastMsg && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--muted, #64748b)',
                        lineHeight: '1.5',
                        background: 'rgba(0,0,0,0.02)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      <strong style={{ color: '#334155' }}>{lastMsg.author}:</strong>{' '}
                      {lastMsg.text.slice(0, 110)}
                      {lastMsg.text.length > 110 ? '…' : ''}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span>Categoria: <strong>{t.category || 'PABX em nuvem'}</strong></span>
                      {isUrgent && (
                        <span style={{ color: '#e11d48', fontWeight: 600 }}>
                          • Prioridade {t.priority}
                        </span>
                      )}
                      <span>• Atualizado em {date(t.updatedAt || t.createdAt)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate(`/portal/tickets/${t.id}`)}
                      style={{ fontSize: '11px', padding: '3px 9px' }}
                    >
                      Ver Chamado
                    </Button>
                  </div>
                </div>
              );
            })}

            {!inProgressTickets.length && (
              <EmptyState
                title="Nenhum chamado em andamento"
                description="Todos os seus atendimentos anteriores foram concluídos com sucesso."
                action={
                  <Button size="sm" onClick={() => setNewTicketModalOpen(true)}>
                    <Plus size={14} /> Abrir Chamado
                  </Button>
                }
              />
            )}
          </div>
        </Card>

        {/* Card: Faturas em Aberto (Cobranças / Boletos) */}
        <Card>
          <div className="card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2>Faturas & Boletos Asaas</h2>
                {liveData?.asaas?.configured ? (
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#059669',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Conectado ao Asaas API v3"
                  >
                    <Sparkles size={11} /> Asaas Conectado ({liveData.asaas.environment})
                  </span>
                ) : (
                  <span
                    style={{
                      background: 'rgba(99, 102, 241, 0.12)',
                      color: '#4f46e5',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Integração Asaas ativa no sistema"
                  >
                    <Sparkles size={11} /> Asaas Integrado
                  </span>
                )}
                {openCharges.length > 0 && (
                  <span
                    style={{
                      background: 'rgba(245, 158, 11, 0.12)',
                      color: '#d97706',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {openCharges.length} pendente(s)
                  </span>
                )}
              </div>
              <p>Boletos bancários e Pix vinculados à sua conta com baixa em tempo real</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                size="sm"
                variant="secondary"
                loading={asaasConsulting}
                onClick={handleConsultAsaas}
                title="Sincronizar faturas e boletos em tempo real com o Asaas"
              >
                <RefreshCw size={12} className={asaasConsulting ? 'animate-spin' : ''} />
                Consultar Asaas
              </Button>
              <Link className="link small" to="/portal/financeiro">
                Histórico <ArrowRight size={12} />
              </Link>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {openCharges.map((c) => {
              const effStatus = getEffectiveChargeStatus(c);
              const isOverdue = effStatus === 'Vencido';
              const hasPix = Boolean(getPixPayload(c));
              const hasBarcode = Boolean(getBoletoBarcode(c));

              return (
                <div
                  key={c.id}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    border: `1px solid ${isOverdue ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.25)'}`,
                    background: isOverdue ? 'rgba(239, 68, 68, 0.02)' : 'rgba(245, 158, 11, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: isOverdue ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.12)',
                            color: isOverdue ? '#dc2626' : '#b45309',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {c.number}
                        </span>
                        <strong style={{ fontSize: '13px', color: 'var(--foreground, #1e293b)' }}>
                          {c.description}
                        </strong>
                      </div>
                      <div style={{ fontSize: '12px', color: isOverdue ? '#dc2626' : '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={13} />
                        <span>Vencimento: <strong>{date(c.dueDate)}</strong></span>
                        {isOverdue && <span style={{ fontWeight: 700, color: '#dc2626' }}>(Vencida)</span>}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '15px', color: isOverdue ? '#dc2626' : '#0f172a', display: 'block', marginBottom: '4px' }}>
                        {money(Number(c.amount) || 0)}
                      </strong>
                      <Badge status={effStatus} />
                    </div>
                  </div>

                  {/* Ações Rápidas: Fatura Asaas, Download PDF Boleto, Copiar PIX, Copiar Código de Barras, Visualizar Boleto */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px dashed rgba(0,0,0,0.06)' }}>
                    {c.invoiceUrl && (
                      <a
                        href={c.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none', fontSize: '12px', padding: '5px 10px' }}
                        title="Abrir fatura oficial do Asaas em nova aba"
                      >
                        <ExternalLink size={13} /> Fatura Asaas
                      </a>
                    )}
                    {c.bankSlipUrl && (
                      <a
                        href={c.bankSlipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none', fontSize: '12px', padding: '5px 10px' }}
                        title="Baixar PDF oficial do Boleto Bancário"
                      >
                        <Download size={13} /> PDF Boleto
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!hasPix}
                      onClick={(e) => handleCopyPix(c, e)}
                      title={
                        hasPix
                          ? 'Copiar código Pix Copia e Cola'
                          : 'Código de pagamento indisponível no provedor. Verifique a integração Asaas.'
                      }
                    >
                      <QrCode size={13} /> Pix Copia e Cola
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!hasBarcode}
                      onClick={(e) => handleCopyBarcode(c, e)}
                      title={
                        hasBarcode
                          ? 'Copiar código de barras do boleto'
                          : 'Código de pagamento indisponível no provedor. Verifique a integração Asaas.'
                      }
                    >
                      <Barcode size={13} /> Código de Barras
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setPaymentModalCharge(c)}
                    >
                      <DollarSign size={13} /> Ver Boleto / Pagar
                    </Button>
                  </div>
                </div>
              );
            })}

            {!openCharges.length && (
              <div
                style={{
                  padding: '24px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  textAlign: 'center',
                }}
              >
                <CheckCircle2 size={32} style={{ color: '#10b981', margin: '0 auto 8px auto' }} />
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#065f46', margin: '0 0 4px 0' }}>
                  Tudo em dia!
                </h3>
                <p style={{ fontSize: '12px', color: '#047857', margin: 0 }}>
                  Você não possui faturas pendentes neste momento. Obrigado por manter sua conta regularizada!
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Grid Inferior: Dados Cadastrais do Cliente + Seus Serviços */}
      <div className="grid-2">
        {/* Card: Dados Cadastrais do Cliente */}
        <Card>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={18} style={{ color: '#4f46e5' }} />
              <div>
                <h2>Dados Cadastrais do Cliente</h2>
                <p>Informações de registro oficial da sua empresa</p>
              </div>
            </div>
            <span
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#059669',
                padding: '3px 9px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <CheckCircle2 size={13} /> Cliente Verificado
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div className="info-row">
              <span style={{ color: '#64748b' }}>Razão Social</span>
              <strong style={{ color: '#1e293b' }}>{client.name}</strong>
            </div>
            <div className="info-row">
              <span style={{ color: '#64748b' }}>Nome Fantasia</span>
              <span>{client.tradeName || client.name}</span>
            </div>
            <div className="info-row">
              <span style={{ color: '#64748b' }}>CNPJ / Documento</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{client.document}</span>
            </div>
            <div className="info-row">
              <span style={{ color: '#64748b' }}>Contato / Representante</span>
              <strong style={{ color: '#1e293b' }}>
                {primaryContact?.name || client?.tradeName || client?.name || 'Cliente'}
                {primaryContact?.role ? ` (${primaryContact.role})` : ''}
              </strong>
            </div>
            <div className="info-row">
              <span style={{ color: '#64748b' }}>E-mail de Contato</span>
              <span style={{ overflowWrap: 'anywhere' }}>
                {primaryContact?.email || client.email}
              </span>
            </div>
            <div className="info-row">
              <span style={{ color: '#64748b' }}>Telefone / Celular</span>
              <span>{primaryContact?.phone || client.phone}</span>
            </div>
            <div className="info-row">
              <span style={{ color: '#64748b' }}>Endereço Completo</span>
              <span>
                {client.street || client.address}, {client.number}
                {client.complement ? ` - ${client.complement}` : ''} • {client.neighborhood} •{' '}
                {client.city}/{client.state} • CEP {client.cep}
              </span>
            </div>
          </div>

          <p className="search-hint" style={{ marginTop: '12px', lineHeight: 1.6 }}>
            Precisa atualizar seus dados cadastrais ou endereço de cobrança?{' '}
            <button
              type="button"
              className="link"
              onClick={() => setNewTicketModalOpen(true)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Abra uma solicitação com o suporte.
            </button>
          </p>
        </Card>

        {/* Card: Seus Serviços Contratados */}
        <div id="portal-services">
          <Card>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers3 size={18} style={{ color: '#0ea5e9' }} />
                <div>
                  <h2>Seus Serviços Contratados</h2>
                  <p>Recursos e planos de telefonia ativos</p>
                </div>
              </div>
              <span
                style={{
                  background: 'rgba(14, 165, 233, 0.1)',
                  color: '#0284c7',
                  padding: '3px 9px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                {clientServices.length} serviço(s)
              </span>
            </div>

            <div className="portal-services">
              {clientServices.map((s: any) => (
                <div className="portal-service" key={s.id}>
                  <div>
                    <strong style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                      {s.name}
                    </strong>
                    <div className="list-item-subtitle" style={{ fontSize: '12px', marginTop: '2px' }}>
                      {s.description || 'Comunicação corporativa'}
                      {s.amount ? ` • ${money(s.amount)}/mês` : s.monthlyValue ? ` • ${money(s.monthlyValue)}/mês` : ''}
                    </div>
                  </div>
                  <Badge status={s.status || 'Ativo'} />
                </div>
              ))}

              {!clientServices.length && (
                <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                  Nenhum serviço registrado no contrato.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal Interativo de Boleto / PIX para Pagamento Imediato */}
      {paymentModalCharge && (
        <Modal
          open={Boolean(paymentModalCharge)}
          title={`Fatura ${paymentModalCharge.number}`}
          onClose={() => setPaymentModalCharge(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Resumo da Fatura */}
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Descrição do Serviço</span>
                <strong style={{ display: 'block', fontSize: '14px', color: '#1e293b', marginTop: '2px' }}>
                  {paymentModalCharge.description}
                </strong>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  <Calendar size={12} /> Vencimento: <strong>{date(paymentModalCharge.dueDate)}</strong>
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Valor Total</span>
                <strong style={{ display: 'block', fontSize: '20px', color: '#0f172a', fontWeight: 700 }}>
                  {money(Number(paymentModalCharge.amount) || 0)}
                </strong>
                <Badge status={getEffectiveChargeStatus(paymentModalCharge)} />
              </div>
            </div>

            {/* Opção 1: PIX Copia e Cola */}
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                background: 'rgba(59, 130, 246, 0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <QrCode size={18} style={{ color: '#2563eb' }} />
                <strong style={{ fontSize: '13px', color: '#1e40af' }}>
                  Pagamento Instantâneo via PIX (Liberação em Segundos)
                </strong>
              </div>
              {getPixPayload(paymentModalCharge) ? (
                <>
                  <p style={{ fontSize: '12px', color: '#3b82f6', margin: '0 0 10px 0' }}>
                    Abra o app do seu banco, escolha <strong>Pix Copia e Cola</strong> e cole o código abaixo:
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={getPixPayload(paymentModalCharge)}
                      style={{
                        flex: 1,
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                      }}
                    />
                    <Button size="sm" onClick={() => handleCopyPix(paymentModalCharge)}>
                      <Copy size={13} /> Copiar PIX
                    </Button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                    Código de pagamento indisponível no provedor. Verifique a integração Asaas.
                  </p>
                  <Button size="sm" variant="secondary" disabled>
                    <Copy size={13} /> Copiar PIX
                  </Button>
                </div>
              )}
            </div>

            {/* Opção 2: Linha Digitável do Boleto Bancário */}
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                background: 'rgba(245, 158, 11, 0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Barcode size={18} style={{ color: '#d97706' }} />
                <strong style={{ fontSize: '13px', color: '#92400e' }}>
                  Linha Digitável do Boleto Bancário
                </strong>
              </div>
              {getBoletoBarcode(paymentModalCharge) ? (
                <>
                  <p style={{ fontSize: '12px', color: '#b45309', margin: '0 0 10px 0' }}>
                    Utilize a linha digitável para pagamento em qualquer banco ou casa lotérica até a data de vencimento.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={getBoletoBarcode(paymentModalCharge)}
                      style={{
                        flex: 1,
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                      }}
                    />
                    <Button size="sm" variant="secondary" onClick={() => handleCopyBarcode(paymentModalCharge)}>
                      <Copy size={13} /> Copiar Código
                    </Button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                    Código de pagamento indisponível no provedor. Verifique a integração Asaas.
                  </p>
                  <Button size="sm" variant="secondary" disabled>
                    <Copy size={13} /> Copiar Código
                  </Button>
                </div>
              )}
            </div>

            {/* Opção 3: Link Oficial Asaas & Download do Boleto em PDF */}
            {(paymentModalCharge.invoiceUrl || paymentModalCharge.bankSlipUrl) && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  background: 'rgba(16, 185, 129, 0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={15} style={{ color: '#059669' }} />
                    <strong style={{ fontSize: '13px', color: '#065f46' }}>
                      Boleto & Fatura Oficial Asaas
                    </strong>
                  </div>
                  <p style={{ fontSize: '12px', color: '#047857', margin: '2px 0 0 0' }}>
                    Acesse a fatura oficial no portal Asaas ou faça o download direto do PDF para impressão.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {paymentModalCharge.invoiceUrl && (
                    <a
                      href={paymentModalCharge.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none', fontSize: '12px', padding: '5px 10px' }}
                    >
                      <ExternalLink size={13} /> Abrir no Asaas
                    </a>
                  )}
                  {paymentModalCharge.bankSlipUrl && (
                    <a
                      href={paymentModalCharge.bankSlipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none', fontSize: '12px', padding: '5px 10px' }}
                    >
                      <Download size={13} /> Baixar PDF
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Dados de Cedente e Sacado */}
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
              <div>
                <strong>Cedente:</strong>{' '}
                {data.settings.company.name || tenant?.name || 'Empresa'} • CNPJ:{' '}
                {data.settings.company.document || (tenant as any)?.document || 'Não informado'}
              </div>
              <div>
                <strong>Sacado:</strong> {client.name} • CNPJ: {client.document}
              </div>
            </div>

            {/* Botões do Modal */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <Button variant="secondary" onClick={() => setPaymentModalCharge(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal para Abrir Novo Chamado */}
      {newTicketModalOpen && (
        <Modal open={newTicketModalOpen} title="Abrir Novo Chamado de Suporte" onClose={() => setNewTicketModalOpen(false)}>
          <form onSubmit={handleCreateTicketSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Assunto / Título do Chamado *
              </label>
              <input
                type="text"
                placeholder="Ex.: Solicitação de novos ramais ou ajuste de rota"
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Categoria *
                </label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#fff',
                  }}
                >
                  <option value="PABX em nuvem">PABX em nuvem</option>
                  <option value="Ramais">Ramais</option>
                  <option value="Tronco SIP">Tronco SIP</option>
                  <option value="URA e atendimento">URA e atendimento</option>
                  <option value="Financeiro">Financeiro / Faturas</option>
                  <option value="Solicitação comercial">Solicitação comercial</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Prioridade *
                </label>
                <select
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#fff',
                  }}
                >
                  <option value="Baixa">Baixa</option>
                  <option value="Média">Média</option>
                  <option value="Alta">Alta</option>
                  <option value="Crítica">Crítica (Urgente)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Descrição Detalhada da Solicitação
              </label>
              <textarea
                rows={4}
                placeholder="Descreva aqui o que você precisa ou a dificuldade encontrada..."
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <Button type="button" variant="secondary" onClick={() => setNewTicketModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={ticketSubmitting}>
                <Send size={14} /> Enviar Chamado
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
