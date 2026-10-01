export interface PipelineColumn {
  id: string;
  name: string;
  color: string;
  position: number;
}

export interface PipelineActivity {
  id: string;
  deal_id: string;
  type: string;
  responsible: string;
  subject: string;
  scheduled_for: string | null;
  duration: number;
  description: string;
  status: "Planejado" | "Concluído";
  created_at: string;
}

export interface PipelineHistoryItem {
  id: string;
  deal_id: string;
  text: string;
  created_by: string | null;
  created_at: string;
}

export interface PipelineComment {
  id: string;
  deal_id: string;
  user_id: string | null;
  user_name: string;
  content: string;
  created_at: string;
}

export interface PipelineChecklistItem {
  id: string;
  deal_id: string;
  text: string;
  checked: boolean;
  position: number;
  created_at: string;
}

export type PipelinePriority = "urgente" | "alta" | "normal" | "baixa";

export interface PipelineDeal {
  id: string;
  name: string;
  company: string;
  value: number;
  column_id: string;
  tags: string[];
  last_contact: string;
  pending: string;
  notes: string;
  contact_phone: string;
  contact_email: string;
  contact_company: string;
  contact_position: string;
  assigned_to: string | null;
  assignees: string[];
  created_by: string | null;
  position: number;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  priority: PipelinePriority;
  labels: string[];
}

export interface PipelineUser {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}
