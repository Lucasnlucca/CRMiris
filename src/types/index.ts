export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  position: string;
  rating: number;
  status: 'online' | 'offline';
  attendance_time: string;
  created_at: string;
}

export type PersonType = 'PF' | 'PJ';

export interface Client {
  id: string;
  person_type: PersonType;
  document: string;
  name: string;
  fantasy_name: string;
  email: string;
  phone: string;
  phone_landline: string;
  whatsapp: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  notes: string;
  legal_representative_name?: string;
  legal_representative_cpf?: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  contact_name: string;
  last_message: string;
  unread_count: number;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed';
  assignee: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  budget: number;
  messages_sent: number;
  response_rate: number;
  conversions: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending';
  created_at: string;
}

export interface Event {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  description: string;
  created_at: string;
}

export interface Call {
  id: string;
  caller_id: string | null;
  contact_type: 'internal' | 'whatsapp' | 'external';
  contact_id: string;
  contact_name: string;
  phone_number: string | null;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'answered' | 'ended' | 'missed' | 'failed';
  duration: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  caller?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface ChartDataPoint {
  hour: string;
  conversations: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  status: 'online' | 'offline' | 'away';
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id?: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
  updated_at: string;
}
