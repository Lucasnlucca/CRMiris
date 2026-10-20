import { Query, ID } from 'appwrite';
import { databases, client as appwriteClient, DATABASE_ID, currentTenantId } from '../../lib/appwrite';
import { DATABASE_VERSION } from '../data/seed';

const getTenantId = () => currentTenantId;
import type {
  Activity,
  AgendaEvent,
  Attachment,
  Charge,
  ChargeStatus,
  Client,
  CollectionKey,
  Collections,
  Contact,
  Database,
  DocumentCategory,
  DocumentRecord,
  HistoryEntry,
  Invoice,
  Priority,
  Role,
  Server,
  ServerIncident,
  ServerStatus,
  Service,
  Session,
  Settings,
  Ticket,
  TicketMessage,
  TicketStatus,
  User,
} from '../types';
import { localDateTime, newId } from '../utils/format';
import { onlyDigits, validateDocument, validateEmail } from '../utils/validation';
import { fileStore } from './files';
import type { Persistence, StoredState } from './storage';

const COLLECTION_MAP: Record<CollectionKey, string> = {
  clients: 'clients',
  tickets: 'support_tickets',
  servers: 'servers',
  services: 'services',
  documents: 'documents',
  charges: 'charges',
  invoices: 'invoices',
  events: 'events',
  users: 'users_hydra',
  activities: 'activities',
};

const DEFAULT_TICKET_CATEGORIES = [
  'PABX em nuvem',
  'Tronco SIP',
  'Ramais',
  'URA e fila de atendimento',
  'Portabilidade',
  'Financeiro',
  'Solicitação comercial',
];

const DEFAULT_SERVICE_TYPES = [
  'PABX em nuvem',
  'Tronco SIP',
  'Ramais IP',
  'URA e atendimento',
  'Número virtual (DID)',
  'Gravação de chamadas',
  'Suporte gerenciado',
];

const DEFAULT_SETTINGS: Settings = {
  company: {
    name: 'Telefonia Fácil Tecnologia Ltda',
    tradeName: 'Telefonia Fácil',
    document: '',
    phone: '(11) 3199-0000',
    email: 'operacoes@telefoniafacil.com.br',
    address: 'São Paulo — SP',
  },
  ticketCategories: [...DEFAULT_TICKET_CATEGORIES],
  serviceTypes: [...DEFAULT_SERVICE_TYPES],
  density: 'comfortable',
};

const clone = <T>(value: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);

const equal = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const fail = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseClientNotesAndContacts(rawNotes?: string, fallbackContactsJson?: string): {
  cleanNotes: string;
  repMeta: string;
  contacts: Contact[];
} {
  let text = rawNotes || '';
  let repMeta = '';
  let contacts: Contact[] = safeJsonParse<Contact[]>(fallbackContactsJson, []);

  const repMatch = text.match(/\[REP_LEGAL:\s*(\{.*?\})\]/s);
  if (repMatch) {
    repMeta = repMatch[0];
    text = text.replace(/\[REP_LEGAL:\s*\{.*?\}\]\s*/s, '').trim();
  }

  const contactsMatch = text.match(/\[CONTACTS_JSON:\s*(\[.*?\])\]/s);
  if (contactsMatch) {
    if (contacts.length === 0) {
      contacts = safeJsonParse<Contact[]>(contactsMatch[1], []);
    }
    text = text.replace(/\[CONTACTS_JSON:\s*\[.*?\]\]\s*/s, '').trim();
  }

  return { cleanNotes: text.trim(), repMeta, contacts };
}

function encodeClientNotesWithContacts(cleanNotes: string, contacts: Contact[], existingRawNotes?: string): string {
  const { repMeta } = parseClientNotesAndContacts(existingRawNotes);
  const parts: string[] = [];
  const trimmed = (cleanNotes || '')
    .replace(/\[REP_LEGAL:\s*\{.*?\}\]\s*/s, '')
    .replace(/\[CONTACTS_JSON:\s*\[.*?\]\]\s*/s, '')
    .trim();
  if (trimmed) parts.push(trimmed);
  if (repMeta) parts.push(repMeta);
  if (Array.isArray(contacts) && contacts.length > 0) {
    parts.push(`[CONTACTS_JSON: ${JSON.stringify(contacts)}]`);
  }
  return parts.join('\n\n');
}

function mapDocToClient(doc: any): Client {
  const { cleanNotes, contacts } = parseClientNotesAndContacts(doc.notes, doc.contacts_json);
  return {
    id: doc.$id || doc.id,
    personType: doc.person_type === 'PF' ? 'PF' : 'PJ',
    name: doc.name || 'Cliente sem nome',
    tradeName: doc.fantasy_name || doc.name || '',
    document: doc.document || '',
    cep: doc.cep || '',
    address: doc.street || doc.address || '',
    number: doc.number || '',
    complement: doc.complement || '',
    neighborhood: doc.neighborhood || '',
    city: doc.city || '',
    state: doc.state || 'SP',
    phone: doc.phone || doc.whatsapp || doc.phone_landline || '',
    email: doc.email || '',
    status: doc.is_active === false ? 'Inativo' : 'Ativo',
    notes: cleanNotes,
    createdAt: doc.created_at || doc.$createdAt || new Date().toISOString(),
    contacts: Array.isArray(contacts) ? contacts : [],
  };
}

function mapClientToDoc(item: Client, existingNotes?: string): Record<string, any> {
  return {
    name: item.name.trim(),
    fantasy_name: (item.tradeName || item.name).trim(),
    person_type: item.personType || 'PJ',
    document: item.document || '',
    email: item.email || '',
    phone: item.phone || '',
    whatsapp: item.phone || '',
    cep: item.cep || '',
    street: item.address || '',
    number: item.number || '',
    complement: item.complement || '',
    neighborhood: item.neighborhood || '',
    city: item.city || '',
    state: item.state || 'SP',
    is_active: item.status !== 'Inativo',
    notes: encodeClientNotesWithContacts(item.notes, item.contacts, existingNotes),
    created_at: item.createdAt || new Date().toISOString(),
  };
}

function normalizeTicketStatus(raw?: string): TicketStatus {
  switch (raw) {
    case 'Novo':
    case 'Em andamento':
    case 'Aguardando retorno':
    case 'Resolvido':
    case 'Cancelado':
      return raw;
    case 'open':
      return 'Novo';
    case 'in_progress':
      return 'Em andamento';
    case 'closed':
      return 'Resolvido';
    default:
      return 'Novo';
  }
}

function normalizeTicketPriority(raw?: string): Priority {
  switch (raw) {
    case 'Baixa':
    case 'Média':
    case 'Alta':
    case 'Crítica':
      return raw;
    case 'low':
      return 'Baixa';
    case 'medium':
    case 'Media':
      return 'Média';
    case 'high':
      return 'Alta';
    case 'urgent':
      return 'Crítica';
    default:
      return 'Média';
  }
}

function mapDocToTicket(doc: any, clients: Client[], indexFallback: number): Ticket {
  const rawNum = Number(doc.protocol_number);
  const number =
    Number.isFinite(rawNum) && rawNum > 0
      ? rawNum > 1000000
        ? 1000 + (rawNum % 9000)
        : rawNum
      : 1001 + indexFallback;

  let clientId = doc.client_id || '';
  if (!clientId && doc.client_name) {
    const lower = String(doc.client_name).toLowerCase();
    const matched = clients.find(
      (c) => c.name.toLowerCase().includes(lower) || c.tradeName.toLowerCase().includes(lower)
    );
    if (matched) clientId = matched.id;
  }
  // F13: Não forçar atribuição a clients[0]. Se não identificado, manter vazio para indicar chamado não-vinculado.

  const createdAt = doc.created_at || doc.$createdAt || new Date().toISOString();
  const updatedAt = doc.updated_at || doc.$updatedAt || createdAt;
  const messages = safeJsonParse<TicketMessage[]>(doc.messages_json, []);
  const history = safeJsonParse<HistoryEntry[]>(doc.history_json, []);
  const attachments = safeJsonParse<Attachment[]>(doc.attachments_json, []);

  return {
    id: doc.$id || doc.id,
    number,
    title: doc.title || doc.subject || 'Chamado técnico',
    description: doc.description || '',
    clientId,
    category: doc.category || 'PABX em nuvem',
    priority: normalizeTicketPriority(doc.priority),
    status: normalizeTicketStatus(doc.status),
    assigneeId: doc.assigned_to_id || '',
    createdAt,
    updatedAt,
    ...(doc.due_at ? { dueAt: doc.due_at } : {}),
    ...(doc.server_id ? { serverId: doc.server_id } : {}),
    messages: Array.isArray(messages) ? messages : [],
    history: Array.isArray(history) ? history : [],
    attachments: Array.isArray(attachments) ? attachments : [],
  };
}

function mapTicketToDoc(item: Ticket, clients: Client[], users: User[], actorId?: string, actorName?: string): Record<string, any> {
  const client = clients.find((c) => c.id === item.clientId);
  const assignee = users.find((u) => u.id === item.assigneeId);
  const isClosed = item.status === 'Resolvido' || item.status === 'Cancelado';

  return {
    protocol_number: item.number,
    title: item.title.trim(),
    subject: item.title.trim(),
    description: item.description || '',
    client_id: item.clientId || '',
    client_name: client ? client.tradeName || client.name : '',
    server_id: item.serverId || '',
    category: item.category || 'PABX em nuvem',
    priority: item.priority,
    status: item.status,
    assigned_to_id: item.assigneeId || null,
    assigned_to_name: assignee ? assignee.name : null,
    created_by_id: actorId || item.assigneeId || null,
    created_by_name: actorName || (assignee ? assignee.name : 'Equipe'),
    due_at: item.dueAt || null,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString(),
    closed_at: isClosed ? item.updatedAt || new Date().toISOString() : null,
    messages_json: JSON.stringify(item.messages || []),
    history_json: JSON.stringify(item.history || []),
    attachments_json: JSON.stringify(item.attachments || []),
  };
}

function mapDocToServer(doc: any): Server {
  return {
    id: doc.$id || doc.id,
    name: doc.name || 'Servidor',
    type: (['PABX', 'Telefonia', 'Aplicação', 'Outro'].includes(doc.type) ? doc.type : 'PABX') as Server['type'],
    platform: doc.platform || 'Yeastar P-Series',
    domain: doc.domain || '',
    ...(doc.port ? { port: Number(doc.port) } : {}),
    environment: doc.environment || 'Produção',
    clientIds: safeJsonParse<string[]>(doc.client_ids_json, []),
    status: (['Disponível', 'Indisponível', 'Em atenção', 'Sem dados'].includes(doc.status)
      ? doc.status
      : 'Disponível') as ServerStatus,
    lastCheck: doc.last_check || doc.$updatedAt || new Date().toISOString(),
    registeredExtensions: Number(doc.registered_extensions) || 0,
    unavailableExtensions: Number(doc.unavailable_extensions) || 0,
    uptime: Number(doc.uptime) || 0,
    notes: doc.notes || '',
    incidents: safeJsonParse<ServerIncident[]>(doc.incidents_json, []),
  };
}

function mapServerToDoc(item: Server): Record<string, any> {
  return {
    name: item.name.trim(),
    type: item.type || 'PABX',
    platform: item.platform || '',
    domain: item.domain.trim(),
    port: item.port ?? null,
    environment: item.environment || 'Produção',
    status: item.status || 'Disponível',
    last_check: item.lastCheck || new Date().toISOString(),
    registered_extensions: Number(item.registeredExtensions) || 0,
    unavailable_extensions: Number(item.unavailableExtensions) || 0,
    uptime: Number(item.uptime) || 0,
    notes: item.notes || '',
    client_ids_json: JSON.stringify(item.clientIds || []),
    incidents_json: JSON.stringify(item.incidents || []),
  };
}

function mapDocToService(doc: any): Service {
  return {
    id: doc.$id || doc.id,
    clientId: doc.client_id || '',
    ...(doc.server_id ? { serverId: doc.server_id } : {}),
    name: doc.name || 'Serviço',
    type: doc.type || 'PABX em nuvem',
    status: (['Ativo', 'Suspenso', 'Cancelado'].includes(doc.status) ? doc.status : 'Ativo') as Service['status'],
    extensions: Number(doc.extensions) || 0,
    channels: Number(doc.channels) || 0,
    monthlyValue: Number(doc.monthly_value) || 0,
    notes: doc.notes || '',
  };
}

function mapServiceToDoc(item: Service): Record<string, any> {
  return {
    client_id: item.clientId,
    server_id: item.serverId || '',
    name: item.name.trim(),
    type: item.type || 'PABX em nuvem',
    status: item.status || 'Ativo',
    extensions: Number(item.extensions) || 0,
    channels: Number(item.channels) || 0,
    monthly_value: Number(item.monthlyValue) || 0,
    notes: item.notes || '',
  };
}

function mapDocToDocumentRecord(doc: any): DocumentRecord {
  return {
    id: doc.$id || doc.id,
    clientId: doc.client_id || '',
    name: doc.name || 'Documento',
    type: doc.type || 'application/pdf',
    size: Number(doc.size) || 0,
    category: (doc.category || 'Contrato') as DocumentCategory,
    createdAt: doc.created_at || doc.$createdAt || new Date().toISOString(),
    responsibleId: doc.responsible_id || '',
    notes: doc.notes || '',
    shared: Boolean(doc.shared),
    ...(doc.number ? { number: doc.number } : {}),
    ...(doc.start_date ? { startDate: doc.start_date } : {}),
    ...(doc.end_date ? { endDate: doc.end_date } : {}),
    ...(doc.status ? { status: doc.status } : {}),
    ...(doc.value !== null && doc.value !== undefined ? { value: Number(doc.value) } : {}),
    ...(doc.renewal ? { renewal: doc.renewal } : {}),
  };
}

function mapDocumentRecordToDoc(item: DocumentRecord): Record<string, any> {
  return {
    client_id: item.clientId,
    name: item.name.trim(),
    type: item.type || 'application/pdf',
    size: Number(item.size) || 0,
    category: item.category || 'Contrato',
    created_at: item.createdAt || new Date().toISOString(),
    responsible_id: item.responsibleId || '',
    notes: item.notes || '',
    shared: Boolean(item.shared),
    number: item.number || null,
    start_date: item.startDate || null,
    end_date: item.endDate || null,
    status: item.status || null,
    value: item.value !== undefined ? Number(item.value) : null,
    renewal: item.renewal || null,
  };
}

function mapDocToCharge(doc: any): Charge {
  return {
    id: doc.$id || doc.id,
    number: doc.number || 'COB-0001',
    clientId: doc.client_id || '',
    description: doc.description || '',
    amount: Number(doc.amount) || 0,
    dueDate: doc.due_date || new Date().toISOString().slice(0, 10),
    ...(doc.paid_at ? { paidAt: doc.paid_at } : {}),
    method: (['Pix', 'Boleto', 'Cartão', 'Transferência'].includes(doc.method) ? doc.method : 'Pix') as Charge['method'],
    status: (['Pendente', 'Pago', 'Vencido', 'Cancelado'].includes(doc.status) ? doc.status : 'Pendente') as ChargeStatus,
    reference: doc.reference || '',
  };
}

function mapChargeToDoc(item: Charge): Record<string, any> {
  return {
    number: item.number.trim(),
    client_id: item.clientId,
    description: item.description.trim(),
    amount: Number(item.amount) || 0,
    due_date: item.dueDate,
    paid_at: item.status === 'Pago' ? item.paidAt || localDateTime(new Date()).slice(0, 10) : null,
    method: item.method || 'Pix',
    status: item.status || 'Pendente',
    reference: item.reference || '',
  };
}

function mapDocToInvoice(doc: any): Invoice {
  return {
    id: doc.$id || doc.id,
    number: doc.number || 'NFSe-0001',
    clientId: doc.client_id || '',
    competence: doc.competence || '',
    amount: Number(doc.amount) || 0,
    status: (['Emitida', 'Pendente', 'Cancelada'].includes(doc.status) ? doc.status : 'Emitida') as Invoice['status'],
  };
}

function mapInvoiceToDoc(item: Invoice): Record<string, any> {
  return {
    number: item.number.trim(),
    client_id: item.clientId,
    competence: item.competence || '',
    amount: Number(item.amount) || 0,
    status: item.status || 'Emitida',
  };
}

function mapDocToEvent(doc: any): AgendaEvent {
  return {
    id: doc.$id || doc.id,
    title: doc.title || 'Compromisso',
    description: doc.description || '',
    start: doc.start || new Date().toISOString(),
    end: doc.end || new Date(Date.now() + 3600000).toISOString(),
    assigneeId: doc.assignee_id || '',
    ...(doc.client_id ? { clientId: doc.client_id } : {}),
    type: (['Reunião', 'Visita técnica', 'Manutenção', 'Outro'].includes(doc.type) ? doc.type : 'Reunião') as AgendaEvent['type'],
    location: doc.location || '',
    status: (['Agendado', 'Concluído', 'Cancelado'].includes(doc.status) ? doc.status : 'Agendado') as AgendaEvent['status'],
  };
}

function mapEventToDoc(item: AgendaEvent): Record<string, any> {
  return {
    title: item.title.trim(),
    description: item.description || '',
    start: item.start,
    end: item.end,
    assignee_id: item.assigneeId || '',
    client_id: item.clientId || '',
    type: item.type || 'Reunião',
    location: item.location || '',
    status: item.status || 'Agendado',
  };
}

function mapDocToActivity(doc: any): Activity {
  return {
    id: doc.$id || doc.id,
    date: doc.date || doc.$createdAt || new Date().toISOString(),
    actor: doc.actor || 'Sistema',
    description: doc.description || '',
    ...(doc.client_id ? { clientId: doc.client_id } : {}),
    ...(doc.ticket_id ? { ticketId: doc.ticket_id } : {}),
  };
}

function mapActivityToDoc(item: Activity): Record<string, any> {
  return {
    date: item.date || new Date().toISOString(),
    actor: item.actor || 'Sistema',
    description: item.description,
    client_id: item.clientId || '',
    ticket_id: item.ticketId || '',
  };
}

function normalizeUserRole(raw?: string): Role {
  if (!raw) return 'support';
  const r = raw.toLowerCase();
  if (r === 'admin' || r === 'superadmin' || r === 'owner' || r === 'manager') return 'admin';
  if (r === 'finance' || r === 'financeiro') return 'finance';
  if (r === 'client' || r === 'cliente') return 'client';
  return 'support';
}

function mapDocToUser(doc: any): User {
  return {
    id: doc.$id || doc.id,
    name: doc.name || 'Colaborador',
    email: doc.email || 'usuario@empresa.com',
    role: normalizeUserRole(doc.role),
    active: doc.is_active !== false,
  };
}

function mapUserToDoc(item: User): Record<string, any> {
  return {
    name: item.name.trim(),
    email: item.email.trim().toLowerCase(),
    role: item.role,
    is_active: item.active,
    created_at: new Date().toISOString(),
  };
}

function reconcileServers(data: Database): void {
  for (const server of data.servers) {
    const fromServices = data.services
      .filter((service) => service.serverId === server.id && service.status !== 'Cancelado')
      .map((service) => service.clientId);
    server.clientIds = [...new Set([...(server.clientIds || []), ...fromServices])].filter((id) =>
      data.clients.some((c) => c.id === id)
    );
  }
}

function createEmptyDatabase(): Database {
  return {
    version: DATABASE_VERSION,
    seededAt: new Date().toISOString(),
    clients: [],
    tickets: [],
    servers: [],
    services: [],
    documents: [],
    charges: [],
    invoices: [],
    events: [],
    users: [],
    activities: [],
    settings: clone(DEFAULT_SETTINGS),
  };
}

export function assertDatabase(data: Database): void {
  fail(data && typeof data === 'object', 'Estrutura de dados inválida.');
}

export interface MockRepository {
  init(): Promise<void>;
  syncWithContext(tenantObj?: any, authUser?: any): Promise<void>;
  getSnapshot(): Database;
  getSession(): Session | null;
  getNotice(): string | undefined;
  subscribe(listener: () => void): () => void;
  list<K extends CollectionKey>(key: K): Promise<Collections[K][]>;
  get<K extends CollectionKey>(key: K, id: string): Promise<Collections[K] | undefined>;
  create<K extends CollectionKey>(key: K, item: Collections[K]): Promise<Collections[K]>;
  update<K extends CollectionKey>(
    key: K,
    id: string,
    changes: Partial<Collections[K]>,
  ): Promise<Collections[K]>;
  save<K extends CollectionKey>(key: K, item: Collections[K]): Promise<Collections[K]>;
  remove<K extends CollectionKey>(key: K, id: string): Promise<void>;
  refresh(): Promise<void>;
  reset(): Promise<void>;
  login(role: Role, clientId?: string): Promise<void>;
  logout(): void;
  updateSettings(settings: Settings): Promise<void>;
}

export function createMockRepository(_options: any = {}): MockRepository {
  let data: Database = createEmptyDatabase();
  let session: Session | null = null;
  let explicitRoleOverride: { role: Role; clientId?: string } | null = null;
  let activeTenantRef: any = null;
  let activeAuthUserRef: any = null;
  let rawClientNotesMap = new Map<string, string>();
  let realtimeUnsubscribe: (() => void) | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  const actor = (): string => {
    if (activeAuthUserRef?.name) return activeAuthUserRef.name;
    return data.users.find((u) => u.id === session?.userId)?.name || 'Operador';
  };

  const buildSettingsFromTenant = (tenantObj: any): Settings => {
    if (!tenantObj) return clone(DEFAULT_SETTINGS);
    const parsed = safeJsonParse<Record<string, any>>(tenantObj.settings_json, {});
    return {
      company: {
        name: tenantObj.name || DEFAULT_SETTINGS.company.name,
        tradeName: tenantObj.trade_name || tenantObj.name || DEFAULT_SETTINGS.company.tradeName,
        document: tenantObj.document || DEFAULT_SETTINGS.company.document,
        phone: tenantObj.phone || DEFAULT_SETTINGS.company.phone,
        email: tenantObj.email || DEFAULT_SETTINGS.company.email,
        address: tenantObj.address || DEFAULT_SETTINGS.company.address,
      },
      ticketCategories:
        Array.isArray(parsed.ticketCategories) && parsed.ticketCategories.length > 0
          ? parsed.ticketCategories
          : [...DEFAULT_TICKET_CATEGORIES],
      serviceTypes:
        Array.isArray(parsed.serviceTypes) && parsed.serviceTypes.length > 0
          ? parsed.serviceTypes
          : [...DEFAULT_SERVICE_TYPES],
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
    };
  };

  const resolveEffectiveSession = (users: User[], clients: Client[], authUser: any): Session => {
    if (explicitRoleOverride) {
      const matchedRoleUser =
        users.find((u) => u.role === explicitRoleOverride!.role && u.active) ||
        users[0] || {
          id: authUser?.id || 'usr_current',
          name: authUser?.name || 'Operador',
          email: authUser?.email || 'operador@empresa.com',
          role: explicitRoleOverride.role,
          active: true,
        };
      const chosenClient =
        explicitRoleOverride.clientId ||
        clients.find((c) => c.status === 'Ativo')?.id ||
        clients[0]?.id;
      return {
        role: explicitRoleOverride.role,
        userId: matchedRoleUser.id,
        ...(explicitRoleOverride.role === 'client' && chosenClient ? { clientId: chosenClient } : {}),
      };
    }

    const effectiveRole = normalizeUserRole(authUser?.role || 'admin');
    const userId = authUser?.id || users[0]?.id || 'usr_admin';
    return {
      role: effectiveRole,
      userId,
      ...(effectiveRole === 'client' && clients[0] ? { clientId: clients[0].id } : {}),
    };
  };

  const loadFromAppwrite = async (): Promise<void> => {
    const currentTenantId = activeTenantRef?.id || getTenantId();
    if (!currentTenantId && !activeAuthUserRef) {
      return;
    }

    // F08: Auto-paginação transparente para carregar registros completos sem truncamento arbitrário
    const safeList = async (colId: string, maxItems = 1000) => {
      try {
        const allDocs: any[] = [];
        const pageSize = 100;
        let cursor: string | undefined = undefined;

        while (allDocs.length < maxItems) {
          const queries = [Query.limit(pageSize)];
          if (cursor) {
            queries.push(Query.cursorAfter(cursor));
          }
          const res = await databases.listDocuments(DATABASE_ID, colId, queries);
          const docs = res.documents || [];
          allDocs.push(...docs);

          if (docs.length < pageSize || allDocs.length >= res.total) {
            break;
          }
          cursor = docs[docs.length - 1].$id;
        }
        return allDocs;
      } catch (err) {
        console.warn(`[AppwriteRepository] Aviso ao ler coleção "${colId}":`, err);
        return [];
      }
    };

    const [
      rawClients,
      rawTickets,
      rawServers,
      rawServices,
      rawDocuments,
      rawCharges,
      rawInvoices,
      rawEvents,
      rawUsers,
      rawActivities,
    ] = await Promise.all([
      safeList('clients', 1000),
      safeList('support_tickets', 1000),
      safeList('servers', 500),
      safeList('services', 1000),
      safeList('documents', 1000),
      safeList('charges', 1000),
      safeList('invoices', 1000),
      safeList('events', 1000),
      safeList('users_hydra', 500),
      safeList('activities', 500),
    ]);

    rawClientNotesMap = new Map();
    for (const rc of rawClients) {
      if (rc.$id && rc.notes) rawClientNotesMap.set(rc.$id, rc.notes);
    }

    const clients = rawClients.map(mapDocToClient);
    const users = rawUsers.map(mapDocToUser);

    if (activeAuthUserRef?.id && !users.some((u) => u.id === activeAuthUserRef.id)) {
      users.unshift({
        id: activeAuthUserRef.id,
        name: activeAuthUserRef.name || 'Administrador',
        email: activeAuthUserRef.email || 'admin@empresa.com',
        role: normalizeUserRole(activeAuthUserRef.role || 'admin'),
        active: true,
      });
    }
    if (!users.some((u) => u.role === 'admin' && u.active)) {
      if (users[0]) {
        users[0].role = 'admin';
        users[0].active = true;
      } else {
        users.push({
          id: activeAuthUserRef?.id || 'usr_admin',
          name: activeAuthUserRef?.name || 'Administrador',
          email: activeAuthUserRef?.email || 'admin@telefoniafacil.com.br',
          role: 'admin',
          active: true,
        });
      }
    }

    const tickets = rawTickets.map((doc, idx) => mapDocToTicket(doc, clients, idx));
    const servers = rawServers.map(mapDocToServer);
    const services = rawServices.map(mapDocToService);
    const documents = rawDocuments.map(mapDocToDocumentRecord);
    const charges = rawCharges.map(mapDocToCharge);
    const invoices = rawInvoices.map(mapDocToInvoice);
    const events = rawEvents.map(mapDocToEvent);
    const activities = rawActivities.map(mapDocToActivity);

    let tenantDoc = activeTenantRef;
    if (currentTenantId && (!tenantDoc || tenantDoc.id !== currentTenantId)) {
      try {
        const fetched = await databases.getDocument(DATABASE_ID, 'tenants', currentTenantId);
        tenantDoc = { ...fetched, id: fetched.$id };
        activeTenantRef = tenantDoc;
      } catch {}
    }

    const nextData: Database = {
      version: DATABASE_VERSION,
      seededAt: new Date().toISOString(),
      clients,
      tickets,
      servers,
      services,
      documents,
      charges,
      invoices,
      events,
      users,
      activities,
      settings: buildSettingsFromTenant(tenantDoc),
    };

    reconcileServers(nextData);
    data = nextData;
    session = resolveEffectiveSession(users, clients, activeAuthUserRef);
    emit();
  };

  const ensureRealtimeSubscription = () => {
    if (realtimeUnsubscribe) return;
    try {
      const channels = Object.values(COLLECTION_MAP).map(
        (col) => `databases.${DATABASE_ID}.collections.${col}.documents`
      );
      realtimeUnsubscribe = appwriteClient.subscribe(channels, () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          void loadFromAppwrite();
        }, 600);
      });
    } catch (err) {
      console.warn('[AppwriteRepository] Realtime subscription indisponível:', err);
    }
  };

  const recordActivityInBackground = async (
    description: string,
    clientId?: string,
    ticketId?: string
  ) => {
    const activity: Activity = {
      id: newId('act'),
      date: new Date().toISOString(),
      actor: actor(),
      description,
      ...(clientId ? { clientId } : {}),
      ...(ticketId ? { ticketId } : {}),
    };
    data = {
      ...data,
      activities: [activity, ...data.activities],
    };
    emit();
    try {
      await databases.createDocument(
        DATABASE_ID,
        'activities',
        activity.id,
        mapActivityToDoc(activity)
      );
    } catch (err) {
      console.warn('[AppwriteRepository] Não foi possível gravar log de atividade:', err);
    }
  };

  const persistRecord = async <K extends CollectionKey>(
    key: K,
    input: Collections[K],
    mode: 'create' | 'save' | 'update'
  ): Promise<Collections[K]> => {
    const collection = data[key] as Collections[K][];
    const existingIndex = collection.findIndex((item) => item.id === input.id);
    const old = existingIndex >= 0 ? collection[existingIndex] : undefined;

    fail(mode !== 'create' || !old, 'Já existe um registro com este identificador.');
    fail(
      mode !== 'update' || old,
      'O registro não foi encontrado. Atualize a tela e tente novamente.'
    );

    const item = clone(input);
    const timestamp = new Date().toISOString();

    if (key === 'clients') {
      const c = item as Client;
      fail(c.name.trim().length >= 2, 'Informe o nome ou a razão social do cliente.');
      if (c.document) {
        fail(validateDocument(c.document, c.personType), 'Informe um CPF ou CNPJ válido.');
      }
      if (c.email) {
        fail(validateEmail(c.email), 'Informe um e-mail válido para o cliente.');
      }
      if (!old) c.createdAt = timestamp;
    }

    if (key === 'documents' && !old) {
      (item as DocumentRecord).createdAt = timestamp;
    }

    if (key === 'charges') {
      const charge = item as Charge;
      if (charge.status === 'Pago' && !charge.paidAt) {
        charge.paidAt = localDateTime(new Date()).slice(0, 10);
      }
      if (charge.status !== 'Pago') {
        delete charge.paidAt;
      }
    }

    if (key === 'tickets') {
      const ticket = item as Ticket;
      const previous = old as Ticket | undefined;

      if (previous) {
        const previousIds = new Set(previous.messages.map((m) => m.id));
        ticket.messages = [
          ...previous.messages,
          ...ticket.messages.filter((m) => !previousIds.has(m.id)),
        ];
      }
      ticket.updatedAt = timestamp;
      if (!previous) {
        ticket.createdAt = timestamp;
        ticket.number = Math.max(1000, ...data.tickets.map((t) => t.number || 1000)) + 1;
      }

      const entries: HistoryEntry[] = [];
      const addHistory = (description: string) => {
        entries.push({ id: newId('history'), date: timestamp, actor: actor(), description });
      };

      if (!previous) {
        addHistory(
          session?.role === 'client'
            ? 'Chamado aberto pelo portal do cliente.'
            : 'Chamado registrado pela equipe.'
        );
      } else {
        if (ticket.status !== previous.status)
          addHistory(`Status alterado de ${previous.status} para ${ticket.status}.`);
        if (ticket.priority !== previous.priority)
          addHistory(`Prioridade alterada de ${previous.priority} para ${ticket.priority}.`);
        if (ticket.assigneeId !== previous.assigneeId)
          addHistory(
            `Responsável alterado para ${data.users.find((u) => u.id === ticket.assigneeId)?.name || 'Não atribuído'}.`
          );
      }

      const oldMessageIds = new Set(previous?.messages.map((m) => m.id) ?? []);
      for (const message of ticket.messages) {
        if (!oldMessageIds.has(message.id)) {
          message.author = actor();
          message.createdAt = timestamp;
          if (session?.role === 'client') message.internal = false;
          addHistory(
            message.internal
              ? 'Nota interna adicionada pela equipe.'
              : 'Mensagem pública adicionada ao chamado.'
          );
        }
      }

      ticket.history = [...(previous?.history ?? []), ...entries];
    }

    // Map to Appwrite payload
    const appwriteCollection = COLLECTION_MAP[key];
    let payload: Record<string, any> = {};

    switch (key) {
      case 'clients':
        payload = mapClientToDoc(item as Client, rawClientNotesMap.get(item.id));
        break;
      case 'tickets':
        payload = mapTicketToDoc(
          item as Ticket,
          data.clients,
          data.users,
          activeAuthUserRef?.id || session?.userId,
          actor()
        );
        break;
      case 'servers':
        payload = mapServerToDoc(item as Server);
        break;
      case 'services':
        payload = mapServiceToDoc(item as Service);
        break;
      case 'documents':
        payload = mapDocumentRecordToDoc(item as DocumentRecord);
        break;
      case 'charges':
        payload = mapChargeToDoc(item as Charge);
        break;
      case 'invoices':
        payload = mapInvoiceToDoc(item as Invoice);
        break;
      case 'events':
        payload = mapEventToDoc(item as AgendaEvent);
        break;
      case 'activities':
        payload = mapActivityToDoc(item as Activity);
        break;
      case 'users':
        payload = mapUserToDoc(item as User);
        break;
    }

    let savedDoc: any;
    if (old) {
      savedDoc = await databases.updateDocument(DATABASE_ID, appwriteCollection, item.id, payload);
    } else {
      const docId =
        item.id && item.id.length <= 36 && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.id)
          ? item.id
          : ID.unique();
      savedDoc = await databases.createDocument(DATABASE_ID, appwriteCollection, docId, payload);
    }

    const finalId = savedDoc?.$id || item.id;
    item.id = finalId;

    if (key === 'clients' && payload.notes) {
      rawClientNotesMap.set(finalId, payload.notes);
    }

    const nextCollection = [...collection];
    if (existingIndex >= 0) {
      nextCollection[existingIndex] = item;
    } else {
      nextCollection.unshift(item);
    }

    const nextData: Database = {
      ...data,
      [key]: nextCollection,
    };
    reconcileServers(nextData);
    data = nextData;
    emit();

    if (key !== 'activities') {
      const labelMap: Record<Exclude<CollectionKey, 'activities'>, string> = {
        clients: 'Cliente',
        tickets: `Chamado #${(item as Ticket).number || ''}`,
        servers: 'Servidor',
        services: 'Serviço',
        documents: 'Documento',
        charges: 'Cobrança',
        invoices: 'Nota fiscal',
        events: 'Compromisso',
        users: 'Usuário',
      };
      const label = labelMap[key as Exclude<CollectionKey, 'activities'>];
      const clientId = key === 'clients' ? item.id : ('clientId' in item ? (item as any).clientId : undefined);
      const ticketId = key === 'tickets' ? item.id : undefined;
      void recordActivityInBackground(`${label} ${old ? 'atualizado' : 'cadastrado'} no Appwrite.`, clientId, ticketId);
    }

    return clone(item);
  };

  const api: MockRepository = {
    async init() {
      ensureRealtimeSubscription();
      await loadFromAppwrite();
    },
    async syncWithContext(tenantObj?: any, authUser?: any) {
      activeTenantRef = tenantObj || activeTenantRef;
      activeAuthUserRef = authUser || activeAuthUserRef;
      ensureRealtimeSubscription();
      await loadFromAppwrite();
    },
    getSnapshot: () => data,
    getSession: () => session,
    getNotice: () => undefined,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async list<K extends CollectionKey>(key: K) {
      return clone(data[key]) as Collections[K][];
    },
    async get<K extends CollectionKey>(key: K, id: string) {
      return clone((data[key] as Collections[K][]).find((item) => item.id === id));
    },
    create: (key, item) => persistRecord(key, item, 'create'),
    save: (key, item) => persistRecord(key, item, 'save'),
    update: async (key, id, changes) => {
      const old = (data[key] as Collections[typeof key][]).find((item) => item.id === id);
      fail(old, 'O registro não foi encontrado. Atualize a tela e tente novamente.');
      return await persistRecord(
        key,
        { ...old, ...clone(changes), id } as Collections[typeof key],
        'update'
      );
    },
    remove: async (key, id) => {
      const appwriteCollection = COLLECTION_MAP[key];
      try {
        await databases.deleteDocument(DATABASE_ID, appwriteCollection, id);
      } catch (err: any) {
        console.warn(`[AppwriteRepository] Aviso ao deletar ${key}/${id}:`, err);
        // Tolerate 404 or missing documents so local/mock items can be removed cleanly
        if (err?.code && err.code !== 404 && err.code !== 400) {
          throw err;
        }
      }
      const collection = (data[key] as Collections[typeof key][]).filter((item) => item.id !== id);
      const nextData: Database = {
        ...data,
        [key]: collection,
      };
      reconcileServers(nextData);
      data = nextData;
      emit();
      void recordActivityInBackground(`Registro removido da base: ${key} #${id}`);
    },
    refresh: async () => {
      await loadFromAppwrite();
    },
    reset: async () => {
      await loadFromAppwrite();
      fileStore.clear();
    },
    login: async (role, clientId) => {
      explicitRoleOverride = { role, clientId };
      session = resolveEffectiveSession(data.users, data.clients, activeAuthUserRef);
      emit();
    },
    logout: () => {
      explicitRoleOverride = null;
      session = null;
      emit();
    },
    updateSettings: async (settings) => {
      const currentTenantId = activeTenantRef?.id || getTenantId();
      const nextSettings: Settings = {
        ...clone(settings),
        ticketCategories: [
          ...new Set(settings.ticketCategories.map((v) => v.trim()).filter(Boolean)),
        ],
        serviceTypes: [
          ...new Set(settings.serviceTypes.map((v) => v.trim()).filter(Boolean)),
        ],
      };
      fail(
        nextSettings.ticketCategories.length && nextSettings.serviceTypes.length,
        'Mantenha pelo menos uma categoria de chamado e um tipo de serviço.'
      );

      if (currentTenantId) {
        const existingJson = safeJsonParse<Record<string, any>>(activeTenantRef?.settings_json, {});
        const mergedSettingsJson = JSON.stringify({
          ...existingJson,
          ticketCategories: nextSettings.ticketCategories,
          serviceTypes: nextSettings.serviceTypes,
          density: nextSettings.density,
        });

        await databases.updateDocument(DATABASE_ID, 'tenants', currentTenantId, {
          name: nextSettings.company.name.trim(),
          trade_name: (nextSettings.company.tradeName || nextSettings.company.name).trim(),
          document: nextSettings.company.document || '',
          phone: nextSettings.company.phone || '',
          email: nextSettings.company.email || '',
          address: nextSettings.company.address || '',
          settings_json: mergedSettingsJson,
          updated_at: new Date().toISOString(),
        });

        if (activeTenantRef) {
          activeTenantRef = {
            ...activeTenantRef,
            name: nextSettings.company.name.trim(),
            trade_name: (nextSettings.company.tradeName || nextSettings.company.name).trim(),
            document: nextSettings.company.document || '',
            phone: nextSettings.company.phone || '',
            email: nextSettings.company.email || '',
            address: nextSettings.company.address || '',
            settings_json: mergedSettingsJson,
          };
        }
      }

      data = {
        ...data,
        settings: nextSettings,
      };
      emit();
      void recordActivityInBackground('Configurações da empresa atualizadas no Appwrite.');
    },
  };

  return api;
}

export const mockApi = createMockRepository();
export const repository = mockApi;
export const appwriteRepository = mockApi;
export type { Persistence, StoredState };
