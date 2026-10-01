import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  CircleDot,
  X,
  User,
  Calendar,
  Tag,
  ArrowUpRight,
  Loader2,
  LifeBuoy,
  Copy,
  Check,
  MoreVertical,
  ChevronDown,
  Shield,
  Zap,
  Users,
  BarChart3,
  TrendingUp,
  Headphones,
} from 'lucide-react';
import { databases, client } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface Ticket {
  id: string;
  protocol_number: number;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  client_name: string | null;
  created_by_id: string;
  created_by_name: string;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserHydra {
  id: string;
  name: string;
}

const PRIORITY_CONFIG = {
  low: { label: 'Baixa', dot: 'bg-gray-400' },
  medium: { label: 'Media', dot: 'bg-amber-500' },
  high: { label: 'Alta', dot: 'bg-orange-500' },
  urgent: { label: 'Urgente', dot: 'bg-red-500' },
};

const STATUS_OPTIONS = {
  open: { label: 'Aberto', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  in_progress: { label: 'Em Andamento', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  closed: { label: 'Resolvido', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
};

const CATEGORIES = ['Geral', 'Tecnico', 'Financeiro', 'Comercial', 'Infraestrutura', 'Sistema'];

function formatProtocol(num: number): string {
  return `#SUP-${String(num).padStart(5, '0')}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function Suporte() {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<UserHydra[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest'>('recent');

  useEffect(() => {
    loadTickets();
    loadUsers();

    const ticketsChannel = `databases.${DATABASE_ID}.collections.support_tickets.documents`;
    const unsubscribe = client.subscribe(ticketsChannel, (response: any) => {
      const events: string[] = response.events || [];
      const payload = response.payload;
      if (!payload) return;

      if (events.some((e: string) => e.includes('.create'))) {
        const newT: Ticket = { ...payload, id: payload.$id };
        setTickets((prev) => {
          if (prev.some((t) => t.id === newT.id)) return prev;
          return [newT, ...prev];
        });
      } else if (events.some((e: string) => e.includes('.update'))) {
        const updatedT: Ticket = { ...payload, id: payload.$id };
        setTickets((prev) =>
          prev.map((t) => (t.id === updatedT.id ? { ...t, ...updatedT } : t))
        );
        setSelectedTicket((prev) => (prev?.id === updatedT.id ? { ...prev, ...updatedT } : prev));
      } else if (events.some((e: string) => e.includes('.delete'))) {
        const deletedId = payload.$id;
        setTickets((prev) => prev.filter((t) => t.id !== deletedId));
        setSelectedTicket((prev) => (prev?.id === deletedId ? null : prev));
      }
    });

    return () => {
      try {
        unsubscribe();
      } catch (e) {}
    };
  }, []);

  async function loadTickets() {
    setLoading(true);
    const { documents: data } = await databases.listDocuments(DATABASE_ID, 'support_tickets', [Query.orderDesc('created_at'), Query.limit(100)]);
    const error = null;

    if (!error && data) setTickets(data.map((d: any) => ({ ...d, id: d.$id })) as any);
    setLoading(false);
  }

  async function loadUsers() {
    const { documents: data } = await databases.listDocuments(DATABASE_ID, 'users_hydra', [Query.equal('is_active', true), Query.limit(100)]);
    if (data) setUsers(data.map((d: any) => ({ ...d, id: d.$id })) as any);
  }

  const filteredTickets = tickets.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      t.title.toLowerCase().includes(q) ||
      t.created_by_name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.client_name || '').toLowerCase().includes(q) ||
      formatProtocol(t.protocol_number).toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const sortedTickets = [...filteredTickets].sort((a, b) => {
    if (sortOrder === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const closedCount = tickets.filter((t) => t.status === 'closed').length;
  const slaPercent = tickets.length > 0 ? Math.round((closedCount / tickets.length) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Central de Suporte</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gerencie e acompanhe todos os atendimentos da sua equipe</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-all shadow-lg shadow-blue-600/20 active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" />
            Abrir Ticket
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <KpiBox
            title="Abertos"
            value={openCount}
            icon={<CircleDot className="w-5 h-5" />}
            iconBg="bg-emerald-500"
            active={statusFilter === 'open'}
            onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')}
          />
          <KpiBox
            title="Em Andamento"
            value={inProgressCount}
            icon={<Clock className="w-5 h-5" />}
            iconBg="bg-amber-500"
            active={statusFilter === 'in_progress'}
            onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
          />
          <KpiBox
            title="Resolvidos"
            value={closedCount}
            icon={<CheckCircle2 className="w-5 h-5" />}
            iconBg="bg-emerald-500"
            active={statusFilter === 'closed'}
            onClick={() => setStatusFilter(statusFilter === 'closed' ? 'all' : 'closed')}
          />
          <KpiBox
            title="SLA Atingido"
            value={`${slaPercent}%`}
            icon={<Shield className="w-5 h-5" />}
            iconBg="bg-purple-500"
            active={false}
            onClick={() => {}}
          />
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por protocolo, titulo, cliente, email ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-white dark:bg-[#252830] border border-gray-200 dark:border-gray-700/50 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white dark:bg-[#252830] border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-[#2d3039] transition-colors">
            <Filter className="w-4 h-4" />
            Filtros
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'recent' | 'oldest')}
              className="appearance-none px-4 py-3 pr-9 rounded-xl bg-white dark:bg-[#252830] border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-[#2d3039] transition-colors focus:outline-none cursor-pointer"
            >
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigos</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[140px_1fr_150px_120px_180px_160px_120px_40px] gap-2 px-5 py-3 bg-gray-100 dark:bg-[#1e2128] border-b border-gray-200 dark:border-gray-700/50">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Protocolo</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assunto</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cliente</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prioridade</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Responsavel</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Atualizacao</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</span>
            <span></span>
          </div>

          {/* Table Body */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : sortedTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-[#252830] flex items-center justify-center mb-4">
                <LifeBuoy className="w-8 h-8 text-gray-400 dark:text-gray-600" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {tickets.length === 0 ? 'Nenhum ticket registrado' : 'Nenhum resultado encontrado'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                {tickets.length === 0 ? 'Crie o primeiro ticket clicando em "Abrir Ticket"' : 'Tente alterar os filtros'}
              </p>
            </div>
          ) : (
            <div>
              {sortedTickets.map((ticket) => (
                <TicketTableRow
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => setSelectedTicket(ticket)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination Info */}
        {sortedTickets.length > 0 && (
          <div className="flex flex-col items-center mt-4 text-sm text-gray-500">
            <p>Mostrando {sortedTickets.length} de {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
            <p className="text-xs text-gray-600">Pagina 1 de 1</p>
          </div>
        )}

        {/* Feature Cards */}
        <div className="grid grid-cols-4 gap-4 mt-8">
          <FeatureCard
            icon={<Headphones className="w-5 h-5" />}
            iconBg="bg-orange-500/20"
            iconColor="text-orange-400"
            title="Atendimento Centralizado"
            description="Todos os tickets em um so lugar para melhor organizacao e produtividade."
          />
          <FeatureCard
            icon={<Zap className="w-5 h-5" />}
            iconBg="bg-cyan-500/20"
            iconColor="text-cyan-400"
            title="Respostas Rapidas"
            description="Utilize respostas prontas e automacoes para agilizar o atendimento."
          />
          <FeatureCard
            icon={<Users className="w-5 h-5" />}
            iconBg="bg-purple-500/20"
            iconColor="text-purple-400"
            title="Colaboracao em Equipe"
            description="Atribua tickets, comente e mantenha sua equipe alinhada."
          />
          <FeatureCard
            icon={<BarChart3 className="w-5 h-5" />}
            iconBg="bg-rose-500/20"
            iconColor="text-rose-400"
            title="Relatorios Inteligentes"
            description="Acompanhe metricas e melhore continuamente seus atendimentos."
          />
        </div>
      </div>

      {showCreateModal && user && (
        <CreateTicketModal
          users={users}
          currentUser={user}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); loadTickets(); }}
        />
      )}

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          users={users}
          onClose={() => setSelectedTicket(null)}
          onUpdated={() => { setSelectedTicket(null); loadTickets(); }}
        />
      )}
    </div>
  );
}

function KpiBox({
  title,
  value,
  icon,
  iconBg,
  active,
  onClick,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  iconBg: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative p-5 rounded-2xl border text-left transition-all overflow-hidden ${
        active
          ? 'border-blue-500/50 bg-blue-50 dark:bg-[#252830] ring-1 ring-blue-500/20'
          : 'border-gray-200 dark:border-gray-700/40 bg-white dark:bg-[#22252b] hover:bg-gray-50 dark:hover:bg-[#282b33] hover:border-gray-300 dark:hover:border-gray-600/50'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{title}</span>
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center text-white`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
      <div className="flex items-center gap-1 mt-2">
        <TrendingUp className="w-3 h-3 text-gray-400 dark:text-gray-500" />
        <span className="text-xs text-gray-400 dark:text-gray-500">100% em relacao a ontem</span>
      </div>
      {/* Sparkline decoration */}
      <svg className="absolute bottom-0 left-0 right-0 w-full h-8 opacity-20" viewBox="0 0 200 30" preserveAspectRatio="none">
        <polyline
          points="0,25 20,22 40,18 60,20 80,15 100,17 120,12 140,14 160,10 180,8 200,5"
          fill="none"
          stroke={active ? '#3b82f6' : '#4b5563'}
          strokeWidth="2"
        />
      </svg>
    </button>
  );
}

function TicketTableRow({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const priorityConf = PRIORITY_CONFIG[ticket.priority];
  const statusConf = STATUS_OPTIONS[ticket.status] || STATUS_OPTIONS.open;
  const clientName = ticket.client_name || ticket.created_by_name;

  return (
    <div
      onClick={onClick}
      className="grid grid-cols-[140px_1fr_150px_120px_180px_160px_120px_40px] gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-700/30 hover:bg-gray-50 dark:hover:bg-[#252830] cursor-pointer transition-colors items-center"
    >
      {/* Protocol */}
      <div>
        <span className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400">{formatProtocol(ticket.protocol_number)}</span>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{getTimeAgo(ticket.created_at)}</p>
      </div>

      {/* Subject */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{ticket.title}</p>
        {ticket.description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{ticket.description}</p>
        )}
      </div>

      {/* Client */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-600/30 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300">{getInitials(clientName)}</span>
        </div>
        <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{clientName}</span>
      </div>

      {/* Priority */}
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${priorityConf.dot}`} />
        <span className="text-xs text-gray-600 dark:text-gray-300">{priorityConf.label}</span>
      </div>

      {/* Responsible */}
      <div className="flex items-center gap-2">
        {ticket.assigned_to_name ? (
          <>
            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-600/30 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300">{getInitials(ticket.assigned_to_name)}</span>
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{ticket.assigned_to_name}</span>
          </>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">Nao atribuido</span>
        )}
      </div>

      {/* Updated */}
      <div>
        <p className="text-xs text-gray-600 dark:text-gray-300">{getTimeAgo(ticket.updated_at)}</p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
          {new Date(ticket.updated_at).toLocaleDateString('pt-BR')} {new Date(ticket.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Status */}
      <div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}>
          {statusConf.label}
        </span>
      </div>

      {/* Actions */}
      <div className="flex justify-center">
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="p-1 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}) {
  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-[#22252b] border border-gray-200 dark:border-gray-700/40">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} mb-3`}>
        {icon}
      </div>
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{title}</h4>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

function CreateTicketModal({
  users,
  currentUser,
  onClose,
  onCreated,
}: {
  users: UserHydra[];
  currentUser: { id: string; name: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>('medium');
  const [category, setCategory] = useState('Geral');
  const [clientName, setClientName] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdProtocol, setCreatedProtocol] = useState<string | null>(null);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);

    const assignedUser = users.find((u) => u.id === assignedToId);

    try {
      const protocolNumber = Math.floor(Date.now() / 1000);
      const data = await databases.createDocument(DATABASE_ID, 'support_tickets', ID.unique(), {
        title: title.trim(),
        description: description.trim() || null,
        status: 'open',
        priority,
        category,
        client_name: clientName.trim() || null,
        created_by_id: currentUser.id,
        created_by_name: currentUser.name,
        assigned_to_id: assignedToId || null,
        assigned_to_name: assignedUser?.name || null,
        protocol_number: protocolNumber
      });

      setSaving(false);
      setCreatedProtocol(formatProtocol(protocolNumber));
    } catch (error: any) {
      alert(error?.message || "Erro desconhecido ao gerar protocolo");
      console.error(error);
      setSaving(false);
    }
  }

  if (createdProtocol) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onCreated}>
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-[#22252b] border border-gray-700/50 shadow-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Ticket Criado</h3>
          <p className="text-sm text-gray-400 mb-5">O protocolo foi gerado com sucesso</p>
          <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#1a1d23] border border-gray-700/50 font-mono text-lg font-bold text-blue-400">
            {createdProtocol}
            <CopyButton text={createdProtocol} />
          </div>
          <button
            onClick={onCreated}
            className="w-full mt-6 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors"
          >
            Concluir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-[#22252b] border border-gray-700/50 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Plus className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Novo Ticket</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-700/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
              Titulo do Chamado *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Problema com acesso ao sistema"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1a1d23] border border-gray-700/50 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
              Cliente
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nome do cliente (opcional)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1a1d23] border border-gray-700/50 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
              Descricao
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhe o problema para facilitar o atendimento..."
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1a1d23] border border-gray-700/50 text-white text-sm placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                Prioridade
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                      priority === p
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                        : 'border-gray-700/50 bg-[#1a1d23] text-gray-300 hover:bg-[#1e2128]'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[p].dot}`} />
                    {PRIORITY_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#1a1d23] border border-gray-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
              Atribuir Responsavel
            </label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1a1d23] border border-gray-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
            >
              <option value="">Sem atribuicao</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700/50">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-700/50 rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || saving}
            className="px-5 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all active:scale-[0.97]"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Criando...
              </span>
            ) : 'Gerar Protocolo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketDetailModal({
  ticket,
  users,
  onClose,
  onUpdated,
}: {
  ticket: Ticket;
  users: UserHydra[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState(ticket.status);
  const [assignedToId, setAssignedToId] = useState(ticket.assigned_to_id || '');
  const [saving, setSaving] = useState(false);

  const statusConf = STATUS_OPTIONS[ticket.status] || STATUS_OPTIONS.open;
  const priorityConf = PRIORITY_CONFIG[ticket.priority];

  async function handleUpdate() {
    setSaving(true);
    const assignedUser = users.find((u) => u.id === assignedToId);

    const updates: Record<string, any> = {
      status,
      assigned_to_id: assignedToId || null,
      assigned_to_name: assignedUser?.name || null,
      updated_at: new Date().toISOString(),
    };

    if (status === 'closed' && ticket.status !== 'closed') {
      updates.closed_at = new Date().toISOString();
    } else if (status !== 'closed') {
      updates.closed_at = null;
    }

    let error = null;
    try {
      await databases.updateDocument(DATABASE_ID, 'support_tickets', ticket.id, updates);
    } catch(err) { error = err; }

    setSaving(false);
    if (!error) onUpdated();
  }

  const createdDate = new Date(ticket.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const hasChanges = status !== ticket.status || assignedToId !== (ticket.assigned_to_id || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-[#22252b] border border-gray-700/50 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono font-bold text-blue-400">{formatProtocol(ticket.protocol_number)}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}>
                {statusConf.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={formatProtocol(ticket.protocol_number)} />
              <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-700/50 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
          <div>
            <h3 className="text-base font-bold text-white">{ticket.title}</h3>
            {ticket.description && (
              <p className="text-sm mt-2 leading-relaxed whitespace-pre-wrap text-gray-400">{ticket.description}</p>
            )}
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-[#1a1d23] border border-gray-700/30">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs text-gray-300">{ticket.created_by_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs text-gray-300">{createdDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${priorityConf.dot}`} />
              <span className="text-xs text-gray-300">Prioridade {priorityConf.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs text-gray-300">{ticket.category}</span>
            </div>
            {ticket.client_name && (
              <div className="flex items-center gap-2 col-span-2">
                <Users className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-300">Cliente: {ticket.client_name}</span>
              </div>
            )}
          </div>

          {ticket.closed_at && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Resolvido em {new Date(ticket.closed_at).toLocaleString('pt-BR')}
            </div>
          )}

          {/* Management */}
          <div className="border-t border-gray-700/50 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Gerenciar Ticket</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Ticket['status'])}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#1a1d23] border border-gray-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                >
                  <option value="open">Aberto</option>
                  <option value="in_progress">Em Andamento</option>
                  <option value="closed">Resolvido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Responsavel</label>
                <select
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#1a1d23] border border-gray-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                >
                  <option value="">Nenhum</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700/50">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-700/50 rounded-xl transition-colors">
            Fechar
          </button>
          <button
            onClick={handleUpdate}
            disabled={saving || !hasChanges}
            className="px-5 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all active:scale-[0.97]"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Salvando...
              </span>
            ) : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      className={`p-1.5 rounded-lg transition-colors ${
        copied ? 'text-emerald-400' : 'text-gray-500 hover:bg-gray-700/50 hover:text-gray-300'
      }`}
      title="Copiar protocolo"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min atras`;
  if (diffHours < 24) return `${diffHours}h atras`;
  if (diffDays < 7) return `${diffDays}d atras`;
  return date.toLocaleDateString('pt-BR');
}

export default Suporte