/**
 * Cliente de API Frontend para Gestão de Usuários e Membros por Empresa (Fase SaaS-02)
 *
 * Comunica-se exclusivamente com os endpoints seguros do servidor:
 * - GET /api/admin/users?tenantId=xxx
 * - POST /api/admin/users/invite
 * - PUT /api/admin/users/role
 * - POST /api/admin/users/remove
 */

import { getAuthoritativeAuthHeaders } from './appwrite';

export interface TenantMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: 'superadmin' | 'admin' | 'manager' | 'agent' | 'viewer' | string;
  roles: string[];
  status: 'active' | 'inactive' | 'pending';
  joined?: string;
  invited?: string;
  tenantId: string;
}

export interface InviteMemberPayload {
  tenantId: string;
  email: string;
  name?: string;
  role: 'admin' | 'manager' | 'agent' | 'viewer';
  password?: string;
  databaseId?: string;
}

export interface UpdateMemberRolePayload {
  tenantId: string;
  userId: string;
  membershipId?: string;
  role?: string;
  is_active?: boolean;
  databaseId?: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  return await getAuthoritativeAuthHeaders();
}

export async function fetchTenantMembers(tenantId: string, databaseId?: string): Promise<{
  success: boolean;
  tenantId: string;
  members: TenantMember[];
  total: number;
}> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ tenantId });
  if (databaseId) params.append('databaseId', databaseId);

  const res = await fetch(`/api/admin/users?${params.toString()}`, {
    method: 'GET',
    headers,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao carregar membros do tenant.`);
  }

  return json;
}

export async function inviteTenantMember(payload: InviteMemberPayload): Promise<{
  success: boolean;
  message: string;
  membershipId?: string;
  userId?: string;
  email: string;
  role: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/users/invite', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao convidar usuário.`);
  }

  return json;
}

export async function updateTenantMemberRole(payload: UpdateMemberRolePayload): Promise<{
  success: boolean;
  message: string;
  userId: string;
  role?: string;
  is_active?: boolean;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/users/role', {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao atualizar membro.`);
  }

  return json;
}

export async function removeTenantMember(payload: {
  tenantId: string;
  userId?: string;
  membershipId?: string;
  databaseId?: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/users/remove', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao remover membro do tenant.`);
  }

  return json;
}

export interface CrmMenuDefinition {
  id: string;
  label: string;
  category: string;
  description: string;
}

export const ALL_CRM_MENUS: CrmMenuDefinition[] = [
  // Visão Geral & Atendimento
  { id: 'visao-geral', label: 'Painel Geral', category: 'Atendimento & Visão Geral', description: 'Indicadores operacionais, métricas financeiras e resumo de chamados.' },
  { id: 'crm-contatos', label: 'Clientes & Contas', category: 'Atendimento & Visão Geral', description: 'Cadastro completo de clientes, contatos, serviços e histórico.' },
  { id: 'dstrack', label: 'Chamados de Suporte', category: 'Atendimento & Visão Geral', description: 'Atendimento técnico, tickets, SLA, mensagens e anexos.' },
  { id: 'agenda', label: 'Agenda Operacional', category: 'Atendimento & Visão Geral', description: 'Compromissos técnicos, reuniões, visitas e janelas de manutenção.' },

  // Comercial & Vendas (CRM)
  { id: 'crm-pipeline', label: 'Funil de Vendas (Kanban)', category: 'Comercial & Vendas', description: 'Oportunidades comerciais, etapas do funil, atividades e checklist.' },
  { id: 'crm-propostas', label: 'Propostas Comerciais', category: 'Comercial & Vendas', description: 'Elaboração de orçamentos, cálculo de itens e envio de propostas.' },
  { id: 'crm-contratos', label: 'Contratos & Assinaturas', category: 'Comercial & Vendas', description: 'Emissão de contratos comerciais e assinatura eletrônica.' },
  { id: 'crm-items', label: 'Catálogo de Produtos', category: 'Comercial & Vendas', description: 'Catálogo de produtos, planos comerciais e tabela de preços.' },
  { id: 'recursos-catalogo', label: 'Agenda Telefônica', category: 'Comercial & Vendas', description: 'Diretório telefônico rápido e contatos internos/externos.' },

  // Operações & Infraestrutura
  { id: 'servidores', label: 'Servidores & Domínios', category: 'Operações & Infraestrutura', description: 'Gestão de servidores PABX, troncos SIP, portas e domínios.' },
  { id: 'monitoramento', label: 'Monitoramento de Rede', category: 'Operações & Infraestrutura', description: 'Status de disponibilidade, ramais registrados e incidentes.' },
  { id: 'servicos', label: 'Serviços Contratados', category: 'Operações & Infraestrutura', description: 'Planos ativos vinculados aos clientes, ramais e canais.' },
  { id: 'documentos', label: 'Arquivos & Documentos', category: 'Operações & Infraestrutura', description: 'Repositório de documentos técnicos, aditivos e arquivos de clientes.' },

  // Financeiro
  { id: 'financeiro', label: 'Cobranças & Faturamento', category: 'Financeiro', description: 'Controle de cobranças, faturas, vencimentos e notas fiscais.' },

  // Administração & Sistema
  { id: 'automacoes', label: 'Automações & Integrações', category: 'Administração & Sistema', description: 'Credenciais de integrações (Asaas, Google Calendar, Webhooks) e disparos.' },
  { id: 'usuarios', label: 'Usuários & Permissões', category: 'Administração & Sistema', description: 'Gestão de colaboradores e permissões de acesso por módulo.' },
  { id: 'administracao', label: 'Configurações da Empresa', category: 'Administração & Sistema', description: 'Dados cadastrais da organização, categorias e parâmetros do sistema.' },
];

export async function fetchUserMenuPermissions(tenantId: string, userId: string, databaseId?: string): Promise<{
  success: boolean;
  tenantId: string;
  userId: string;
  permissions: Array<{ id: string; menu_id: string; has_access: boolean }>;
}> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ tenantId, userId });
  if (databaseId) params.append('databaseId', databaseId);

  const res = await fetch(`/api/admin/users/permissions?${params.toString()}`, {
    method: 'GET',
    headers,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao carregar permissões de menu.`);
  }

  return json;
}

export async function saveUserMenuPermissions(payload: {
  tenantId: string;
  userId: string;
  permissions: Record<string, boolean>;
  databaseId?: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/users/permissions', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao salvar permissões de menu.`);
  }

  return json;
}

