export type Role = 'admin' | 'support' | 'finance' | 'client';
export interface Session {
  role: Role;
  userId: string;
  clientId?: string;
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface Contact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  primary: boolean;
}
export interface Client {
  id: string;
  personType: 'PJ' | 'PF';
  name: string;
  tradeName: string;
  document: string;
  cep: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  status: 'Ativo' | 'Inativo';
  notes: string;
  createdAt: string;
  contacts: Contact[];
}
export type TicketStatus =
  | 'Novo'
  | 'Em andamento'
  | 'Aguardando retorno'
  | 'Resolvido'
  | 'Cancelado';
export type Priority = 'Baixa' | 'Média' | 'Alta' | 'Crítica';
export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
}
export interface TicketMessage {
  id: string;
  text: string;
  author: string;
  internal: boolean;
  createdAt: string;
  attachments?: Attachment[];
}
export interface HistoryEntry {
  id: string;
  date: string;
  actor: string;
  description: string;
}
export interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  clientId: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  assigneeId: string;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  serverId?: string;
  messages: TicketMessage[];
  history: HistoryEntry[];
  attachments: Attachment[];
}
export type ServerStatus = 'Disponível' | 'Indisponível' | 'Em atenção' | 'Sem dados';
export interface ServerIncident {
  id: string;
  title: string;
  date: string;
  status: 'Aberto' | 'Resolvido';
}
export interface Server {
  id: string;
  name: string;
  type: 'PABX' | 'Telefonia' | 'Aplicação' | 'Outro';
  platform: string;
  domain: string;
  port?: number;
  environment: string;
  clientIds: string[];
  status: ServerStatus;
  lastCheck: string;
  registeredExtensions: number;
  unavailableExtensions: number;
  uptime: number;
  notes: string;
  incidents: ServerIncident[];
}
export interface Service {
  id: string;
  clientId: string;
  name: string;
  type: string;
  serverId?: string;
  status: 'Ativo' | 'Suspenso' | 'Cancelado';
  extensions: number;
  channels: number;
  monthlyValue: number;
  notes: string;
}
export type DocumentCategory =
  | 'Contrato'
  | 'Aditivo'
  | 'Proposta'
  | 'Documento cadastral'
  | 'Documento técnico'
  | 'Outros';
export interface DocumentRecord extends Attachment {
  clientId: string;
  category: DocumentCategory;
  createdAt: string;
  responsibleId: string;
  notes: string;
  shared: boolean;
  number?: string;
  startDate?: string;
  endDate?: string;
  status?: 'Vigente' | 'Encerrado' | 'Em renovação';
  value?: number;
  renewal?: string;
}
export type ChargeStatus = 'Pendente' | 'Pago' | 'Vencido' | 'Cancelado';
export interface Charge {
  id: string;
  number: string;
  clientId: string;
  description: string;
  amount: number;
  dueDate: string;
  paidAt?: string;
  method: 'Pix' | 'Boleto' | 'Cartão' | 'Transferência';
  status: ChargeStatus;
  reference: string;
}
export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  competence: string;
  amount: number;
  status: 'Emitida' | 'Pendente' | 'Cancelada';
}
export interface AgendaEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  assigneeId: string;
  clientId?: string;
  type: 'Reunião' | 'Visita técnica' | 'Manutenção' | 'Outro';
  location: string;
  status: 'Agendado' | 'Concluído' | 'Cancelado';
}
export interface Activity extends HistoryEntry {
  clientId?: string;
  ticketId?: string;
}
export interface Settings {
  company: {
    name: string;
    tradeName: string;
    document: string;
    phone: string;
    email: string;
    address: string;
  };
  ticketCategories: string[];
  serviceTypes: string[];
  density: 'comfortable' | 'compact';
}
export interface Collections {
  clients: Client;
  tickets: Ticket;
  servers: Server;
  services: Service;
  documents: DocumentRecord;
  charges: Charge;
  invoices: Invoice;
  events: AgendaEvent;
  users: User;
  activities: Activity;
}
export type CollectionKey = keyof Collections;
export type Database = { [K in CollectionKey]: Collections[K][] } & {
  version: number;
  seededAt: string;
  settings: Settings;
};
