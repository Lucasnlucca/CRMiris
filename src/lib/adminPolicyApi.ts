/**
 * Cliente de API para o Painel SuperAdmin de Políticas — Iris Horizon CRM
 *
 * Comunica-se com os endpoints `/api/admin/policy/*` fornecendo o JWT
 * autenticado da sessão. A verificação da membresia no Team `superadmins`
 * é realizada integralmente no servidor.
 */

import { getAuthoritativeAuthHeaders } from './appwrite';

export interface ModuleActionStatus {
  allowed: boolean;
  roles: string[];
  ruleId?: string;
}

export interface ModulePolicyStatus {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  prodCollection: string;
  testCollection: string;
  activeCollection: string;
  status: 'ACTIVE' | 'CIRCUIT_PAUSED' | 'LOCKED' | 'GLOBAL_LOCKDOWN';
  isPaused: boolean;
  pauseReason: string | null;
  actions: {
    create: ModuleActionStatus;
    update: ModuleActionStatus;
    delete: ModuleActionStatus;
  };
  rulesCount: number;
}

export interface AdminAuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  actorId: string;
  clientIp: string;
  targetDatabase: string;
  targetCollection: string;
  targetTenant: string;
  details: Record<string, any>;
  reason: string;
}

export interface PolicyStatusResponse {
  success: boolean;
  databaseId: string;
  tenantId: string;
  stateVersion?: number;
  updatedAt?: string;
  updatedBy?: string;
  globalLockdown: boolean;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  tripReason: string | null;
  consecutiveFailures: number;
  modules: ModulePolicyStatus[];
  auditLogs: AdminAuditLogEntry[];
  superAdmin: {
    userId: string;
    userEmail: string;
    verifiedTeam: string;
  };
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  return await getAuthoritativeAuthHeaders();
}

/**
 * Consulta o estado atual dos módulos e disjuntores no servidor
 */
export async function fetchPolicyStatus(databaseId = 'crm_isolated_test', tenantId = ''): Promise<PolicyStatusResponse> {
  const headers = await getAuthHeaders();
  const query = new URLSearchParams({ databaseId, ...(tenantId ? { tenantId } : {}) });
  const res = await fetch(`/api/admin/policy/status?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    const err: any = new Error(data.error || `Erro HTTP ${res.status} ao carregar status de políticas.`);
    err.statusCode = res.status;
    err.currentVersion = data.currentVersion;
    throw err;
  }

  return data;
}

/**
 * Dispara ou encerra o Lockdown Global de todas as operações de escrita
 */
export async function toggleGlobalLockdown(
  active: boolean,
  reason?: string,
  databaseId = 'crm_isolated_test',
  expectedVersion?: number
) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/policy/lockdown', {
    method: 'POST',
    headers,
    body: JSON.stringify({ active, reason, databaseId, expectedVersion }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    const err: any = new Error(data.error || `Erro HTTP ${res.status} ao alterar Lockdown Global.`);
    err.statusCode = res.status;
    err.currentVersion = data.currentVersion;
    throw err;
  }

  return data;
}

/**
 * Pausa ou retoma um módulo específico via Circuit Breaker
 */
export async function toggleModulePause(
  collectionId: string,
  paused: boolean,
  reason?: string,
  databaseId = 'crm_isolated_test',
  expectedVersion?: number
) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/policy/module-pause', {
    method: 'POST',
    headers,
    body: JSON.stringify({ collectionId, paused, reason, databaseId, expectedVersion }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    const err: any = new Error(data.error || `Erro HTTP ${res.status} ao pausar/retomar módulo.`);
    err.statusCode = res.status;
    err.currentVersion = data.currentVersion;
    throw err;
  }

  return data;
}

/**
 * Habilita ou desabilita regra granular para uma ação em um módulo
 */
export async function toggleGranularRule({
  databaseId = 'crm_isolated_test',
  collectionId,
  action,
  tenantId,
  allowedRoles = ['admin', 'superadmin', 'agent'],
  enabled,
  reason,
  expectedVersion,
}: {
  databaseId?: string;
  collectionId: string;
  action: 'create' | 'update' | 'delete';
  tenantId: string;
  allowedRoles?: string[];
  enabled: boolean;
  reason?: string;
  expectedVersion?: number;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/policy/rule', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      databaseId,
      collectionId,
      action,
      tenantId,
      allowedRoles,
      enabled,
      reason,
      expectedVersion,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    const err: any = new Error(data.error || `Erro HTTP ${res.status} ao alterar regra granular.`);
    err.statusCode = res.status;
    err.currentVersion = data.currentVersion;
    throw err;
  }

  return data;
}

/**
 * Busca histórico recente de auditoria administrativa
 */
export async function fetchAdminAuditLogs(databaseId = 'crm_isolated_test', limit = 50): Promise<AdminAuditLogEntry[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/policy/audit?databaseId=${databaseId}&limit=${limit}`, {
    method: 'GET',
    headers,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Erro HTTP ${res.status} ao carregar histórico de auditoria.`);
  }

  return data.logs || [];
}
