/**
 * Write Policy Engine — TypeScript / ESM Version (Fase 5H.1)
 *
 * Central Authorization Layer & Circuit Breaker for Backend API Bridge.
 */

import crypto from 'crypto';
import { isSandboxGovernanceDatabase } from './governanceConfig';

export interface PolicyRule {
  id: string;
  databaseId: string;
  collectionId: string;
  action: 'create' | 'update' | 'delete' | 'signContract';
  tenantId: string;
  allowedRoles: string[];
  maxPayloadBytes?: number;
  forbiddenFields?: string[];
  customValidator?: (ctx: PolicyEvaluationContext) => boolean;
}

export interface PolicyEvaluationContext {
  databaseId: string;
  collectionId: string;
  action: string;
  tenantId: string;
  userId: string;
  userRoles: string[];
  data?: any;
  documentId?: string;
  clientIp?: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  code?: number;
  reason?: string;
  matchedRule?: PolicyRule;
}

export class CircuitBreaker {
  maxConsecutiveFailures: number;
  maxAuthBreachesPerMinute: number;
  maxLatencyMs: number;
  cooldownWindowMs: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  trippedAt: number | null;
  tripReason: string | null;
  authBreaches: number[];
  moduleOverrides: Map<string, { paused: boolean; reason: string }>;
  actionOverrides: Map<string, { paused: boolean; reason: string }>;
  globalLockdown: boolean;

  constructor(options: {
    maxConsecutiveFailures?: number;
    maxAuthBreachesPerMinute?: number;
    maxLatencyMs?: number;
    cooldownWindowMs?: number;
  } = {}) {
    this.maxConsecutiveFailures = options.maxConsecutiveFailures || 5;
    this.maxAuthBreachesPerMinute = options.maxAuthBreachesPerMinute || 10;
    this.maxLatencyMs = options.maxLatencyMs || 5000;
    this.cooldownWindowMs = options.cooldownWindowMs || 30000;

    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.trippedAt = null;
    this.tripReason = null;
    this.authBreaches = [];
    this.moduleOverrides = new Map();
    this.actionOverrides = new Map();
    this.globalLockdown = false;
  }

  setGlobalLockdown(active: boolean, reason = 'Lockdown global acionado manualmente.') {
    this.globalLockdown = Boolean(active);
    if (this.globalLockdown) {
      this.state = 'OPEN';
      this.trippedAt = Date.now();
      this.tripReason = reason;
    } else {
      this.reset();
    }
  }

  pauseModule(collectionId: string, reason = 'Módulo pausado por salvaguarda.') {
    this.moduleOverrides.set(collectionId, { paused: true, reason });
  }

  resumeModule(collectionId: string) {
    this.moduleOverrides.delete(collectionId);
  }

  pauseAction(action: string, reason = 'Ação pausada por salvaguarda.') {
    this.actionOverrides.set(action, { paused: true, reason });
  }

  resumeAction(action: string) {
    this.actionOverrides.delete(action);
  }

  recordSuccess(_durationMs?: number) {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.consecutiveFailures = 0;
      this.trippedAt = null;
      this.tripReason = null;
    }
    this.consecutiveFailures = 0;
  }

  recordFailure(statusCode: number, message: string) {
    // S09: Disjuntor de infraestrutura só deve reagir a erros 5xx de serviço/rede
    if (statusCode >= 500) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.trip(`Limite de falhas de serviço consecutivas atingido (${this.consecutiveFailures}): ${message}`);
      }
    }
  }

  recordAuthBreach(reason: string) {
    // S09: Falha de autorização (401/403) é evento de segurança, NUNCA deve derrubar escritas globais
    const now = Date.now();
    this.authBreaches = this.authBreaches.filter(ts => now - ts < 60000);
    this.authBreaches.push(now);

    if (this.authBreaches.length >= this.maxAuthBreachesPerMinute) {
      console.warn(`[SECURITY_ALERT] Elevado volume de violações de autorização detectado (${this.authBreaches.length}/min): ${reason}`);
    }
  }

  trip(reason: string) {
    this.state = 'OPEN';
    this.trippedAt = Date.now();
    this.tripReason = reason;
  }

  reset() {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.trippedAt = null;
    this.tripReason = null;
    this.authBreaches = [];
  }

  check(collectionId: string, action: string): { allowed: boolean; code?: number; reason?: string } {
    if (this.globalLockdown) {
      return {
        allowed: false,
        code: 503,
        reason: `[CIRCUIT_BREAKER_LOCKDOWN] Operações de escrita suspensas: ${this.tripReason || 'Lockdown ativo.'}`,
      };
    }

    const modOverride = this.moduleOverrides.get(collectionId);
    if (modOverride && modOverride.paused) {
      return {
        allowed: false,
        code: 503,
        reason: `[CIRCUIT_BREAKER_MODULE_PAUSED] Módulo "${collectionId}" temporariamente suspenso: ${modOverride.reason}`,
      };
    }

    const actOverride = this.actionOverrides.get(action);
    if (actOverride && actOverride.paused) {
      return {
        allowed: false,
        code: 503,
        reason: `[CIRCUIT_BREAKER_ACTION_PAUSED] Operação "${action}" temporariamente suspensa: ${actOverride.reason}`,
      };
    }

    if (this.state === 'OPEN') {
      const now = Date.now();
      if (this.trippedAt && now - this.trippedAt > this.cooldownWindowMs) {
        this.state = 'HALF_OPEN';
        return { allowed: true };
      }
      return {
        allowed: false,
        code: 503,
        reason: `[CIRCUIT_BREAKER_OPEN] Escritas interrompidas preventivamente: ${this.tripReason}`,
      };
    }

    return { allowed: true };
  }
}

export function maskPiiValue(key: string, value: any): any {
  if (value === null || value === undefined) return value;
  const str = String(value);

  if (/password|secret|token|api_key|jwt|auth/i.test(key)) {
    return '[REDACTED]';
  }

  if (/email/i.test(key) && str.includes('@')) {
    const parts = str.split('@');
    const name = parts[0];
    const maskedName = name.length <= 2 ? name[0] + '***' : name[0] + '***' + name[name.length - 1];
    return `${maskedName}@${parts[1]}`;
  }

  if (/phone|telefone|celular|whatsapp/i.test(key)) {
    if (str.length > 6) {
      return str.slice(0, 4) + '****' + str.slice(-2);
    }
    return '****';
  }

  if (/cpf|cnpj|document|documento/i.test(key)) {
    if (str.length > 5) {
      return str.slice(0, 3) + '.***.***-' + str.slice(-2);
    }
    return '***';
  }

  if (/name|nome|razao_social/i.test(key) && typeof value === 'string') {
    const words = str.trim().split(/\s+/);
    return words.map(w => w.length > 1 ? w[0] + '***' : w).join(' ');
  }

  return value;
}

export function sanitizePayloadForAudit(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => sanitizePayloadForAudit(item));
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object') {
      result[k] = sanitizePayloadForAudit(v);
    } else {
      result[k] = maskPiiValue(k, v);
    }
  }
  return result;
}

export function maskIp(ip?: string): string {
  if (!ip) return '0.0.0.0';
  const parts = String(ip).split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  const v6Parts = String(ip).split(':');
  if (v6Parts.length > 2) {
    return `${v6Parts[0]}:${v6Parts[1]}:****:****`;
  }
  return 'masked_ip';
}

export function createAuditLog(entry: {
  traceId?: string;
  clientIp?: string;
  userId?: string;
  userRole?: string;
  tenantId?: string;
  databaseId: string;
  collectionId: string;
  action: string;
  documentId?: string;
  decision: string;
  ruleId?: string;
  reason?: string;
  latencyMs?: number;
  statusCode: number;
  payloadSample?: any;
}) {
  return {
    timestamp: new Date().toISOString(),
    traceId: entry.traceId || crypto.randomBytes(8).toString('hex'),
    clientIp: maskIp(entry.clientIp),
    userId: entry.userId || 'anonymous',
    userRole: entry.userRole || 'none',
    tenantId: entry.tenantId || 'none',
    databaseId: entry.databaseId,
    collectionId: entry.collectionId,
    action: entry.action,
    documentId: entry.documentId || undefined,
    decision: entry.decision,
    ruleId: entry.ruleId || undefined,
    reason: entry.reason || undefined,
    latencyMs: Math.round(entry.latencyMs || 0),
    statusCode: entry.statusCode,
    sanitizedPayload: entry.payloadSample ? sanitizePayloadForAudit(entry.payloadSample) : undefined,
  };
}

export function validatePolicyConfiguration(rules: PolicyRule[]): boolean {
  if (!Array.isArray(rules)) {
    throw new Error('[WritePolicyEngine] Configuração inválida: As regras devem ser um array.');
  }

  const seenIds = new Set<string>();
  const validActions = new Set(['create', 'update', 'delete', 'signContract']);

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const prefix = `[Regra index ${i}]`;

    if (!r.id || typeof r.id !== 'string') {
      throw new Error(`${prefix} Campo "id" é obrigatório e deve ser uma string única.`);
    }
    if (seenIds.has(r.id)) {
      throw new Error(`${prefix} ID duplicado "${r.id}". Cada regra deve ter ID único.`);
    }
    seenIds.add(r.id);

    if (!r.databaseId || r.databaseId.includes('*')) {
      throw new Error(`${prefix} "databaseId" inválido ou contém curinga permissivo (*). Proibido.`);
    }
    if (!r.collectionId || r.collectionId.includes('*')) {
      throw new Error(`${prefix} "collectionId" inválido ou contém curinga permissivo (*). Proibido.`);
    }
    if (!r.action || !validActions.has(r.action)) {
      throw new Error(`${prefix} "action" inválida ("${r.action}"). Permitidas: ${Array.from(validActions).join(', ')}.`);
    }
    if (!r.tenantId || r.tenantId.includes('*')) {
      throw new Error(`${prefix} "tenantId" inválido ou contém curinga permissivo (*). Proibido.`);
    }
    if (!Array.isArray(r.allowedRoles) || r.allowedRoles.length === 0 || r.allowedRoles.some(role => !role || role.includes('*'))) {
      throw new Error(`${prefix} "allowedRoles" deve ser um array não vazio de papéis sem curingas.`);
    }
  }

  return true;
}

export interface KnownModuleDefinition {
  key: string;
  prodCollection: string;
  testCollection: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

export const KNOWN_MODULES: KnownModuleDefinition[] = [
  {
    key: 'clients',
    prodCollection: 'clients',
    testCollection: 'test_clients',
    name: 'Clientes & Leads',
    description: 'Gestão de contas de clientes, leads e contatos comerciais.',
    icon: 'Users',
    category: 'Vendas & CRM',
  },
  {
    key: 'pipeline_deals',
    prodCollection: 'pipeline_deals',
    testCollection: 'test_deals',
    name: 'Funil & Oportunidades',
    description: 'Kanban comercial, colunas do funil, cards de oportunidades, atividades e checklist.',
    icon: 'GitBranch',
    category: 'Vendas & CRM',
  },
  {
    key: 'support_tickets',
    prodCollection: 'support_tickets',
    testCollection: 'test_support_tickets',
    name: 'Central de Chamados',
    description: 'Chamados técnicos, SLA e atendimento de suporte.',
    icon: 'LifeBuoy',
    category: 'Suporte & Atendimento',
  },
  {
    key: 'crm_proposals',
    prodCollection: 'crm_proposals',
    testCollection: 'test_crm_proposals',
    name: 'Propostas Comerciais',
    description: 'Elaboração, itens de proposta, precificação e envio de propostas de vendas.',
    icon: 'FileText',
    category: 'Vendas & CRM',
  },
  {
    key: 'crm_contracts',
    prodCollection: 'crm_contracts',
    testCollection: 'test_crm_contracts',
    name: 'Contratos Digitais',
    description: 'Instrumentos jurídicos, hashes e assinaturas eletrônicas.',
    icon: 'FileCheck2',
    category: 'Jurídico & Contratos',
  },
  {
    key: 'crm_items',
    prodCollection: 'crm_items',
    testCollection: 'test_crm_items',
    name: 'Itens & Produtos',
    description: 'Itens faturáveis, planos e tabelas de preços.',
    icon: 'Package',
    category: 'Operações',
  },
  {
    key: 'phonebook',
    prodCollection: 'phonebook',
    testCollection: 'test_contacts',
    name: 'Catálogo Telefônico & WhatsApp',
    description: 'Diretório unificado de contatos, histórico de chamadas e conversas WhatsApp.',
    icon: 'BookUser',
    category: 'Comunicação',
  },
  {
    key: 'automation_config',
    prodCollection: 'automation_config',
    testCollection: 'test_integration_configs',
    name: 'Automações & Integrações',
    description: 'Gatilhos automáticos, templates, configurações SIP/WhatsApp e integrações.',
    icon: 'Sparkles',
    category: 'Configurações',
  },
  {
    key: 'servers',
    prodCollection: 'servers',
    testCollection: 'test_servers',
    name: 'Servidores & Domínios',
    description: 'Infraestrutura de PABX, servidores em nuvem, domínios e monitoramento.',
    icon: 'Server',
    category: 'Operações & Infraestrutura',
  },
  {
    key: 'services',
    prodCollection: 'services',
    testCollection: 'test_services',
    name: 'Serviços Contratados',
    description: 'Planos ativos por cliente, ramais, canais e vínculo com servidores.',
    icon: 'Layers',
    category: 'Operações & Infraestrutura',
  },
  {
    key: 'charges',
    prodCollection: 'charges',
    testCollection: 'test_charges',
    name: 'Financeiro & Faturamento',
    description: 'Cobranças, faturas, notas fiscais e controle de recebimentos.',
    icon: 'DollarSign',
    category: 'Financeiro',
  },
  {
    key: 'events',
    prodCollection: 'events',
    testCollection: 'test_events',
    name: 'Agenda Operacional',
    description: 'Compromissos técnicos, reuniões, implantações e janelas de manutenção.',
    icon: 'Calendar',
    category: 'Operações & Infraestrutura',
  },
  {
    key: 'users_hydra',
    prodCollection: 'users_hydra',
    testCollection: 'test_users_hydra',
    name: 'Usuários & Permissões de Menu',
    description: 'Perfis de acesso da equipe e permissões granulares de visualização de menus.',
    icon: 'Shield',
    category: 'Sistema',
  },
  {
    key: 'notifications',
    prodCollection: 'notifications',
    testCollection: 'test_notifications',
    name: 'Notificações do Sistema',
    description: 'Avisos em tempo real e alertas a usuários.',
    icon: 'Bell',
    category: 'Sistema',
  },
];

export const COLLECTION_MODULE_MAP: Record<string, string> = {
  pipeline_columns: 'pipeline_deals',
  pipeline_activities: 'pipeline_deals',
  pipeline_history: 'pipeline_deals',
  pipeline_comments: 'pipeline_deals',
  pipeline_checklist: 'pipeline_deals',
  pipeline_attachments: 'pipeline_deals',
  crm_proposal_items: 'crm_proposals',
  documents: 'crm_contracts',
  invoices: 'charges',
  activities: 'support_tickets',
  tenants: 'automation_config',
  call_history: 'phonebook',
  whatsapp_contacts: 'phonebook',
  whatsapp_messages: 'phonebook',
  whatsapp_config: 'automation_config',
  sip_config: 'automation_config',
  integration_configs: 'automation_config',
  message_templates: 'automation_config',
  messages: 'automation_config',
  user_menu_permissions: 'users_hydra',
  test_pipeline_history: 'test_deals',
};

export function resolveModuleCollection(collectionId: string): string {
  return COLLECTION_MODULE_MAP[collectionId] || collectionId;
}

export const DEFAULT_ALLOWED_ROLES = [
  'superadmin',
  'owner',
  'admin',
  'manager',
  'agent',
  'colaborador',
  'member',
];

export interface AdminAuditEntry {
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

export class WritePolicyEngine {
  rules: PolicyRule[];
  circuitBreaker: CircuitBreaker;
  active: boolean;
  adminAuditLog: AdminAuditEntry[];
  persistenceAdapter?: any;
  initializedDatabases: Set<string>;
  initializedTenants: Set<string>;
  autoSeedProdTenants: boolean;
  stateVersion: number;
  lastDurableSyncAt: string | null;
  lastDurableSyncBy: string | null;

  constructor(initialRules: PolicyRule[] = [], options: { enabled?: boolean; circuitBreakerOptions?: any; persistenceAdapter?: any; autoSeedProdTenants?: boolean } = {}) {
    validatePolicyConfiguration(initialRules);
    this.rules = [...initialRules];
    this.circuitBreaker = new CircuitBreaker(options.circuitBreakerOptions);
    this.active = options.enabled !== false;
    this.adminAuditLog = [];
    this.persistenceAdapter = options.persistenceAdapter || null;
    this.initializedDatabases = new Set();
    this.initializedTenants = new Set();
    for (const r of initialRules) {
      this.initializedTenants.add(`${r.databaseId}:${r.tenantId}`);
    }
    this.autoSeedProdTenants = options.autoSeedProdTenants !== undefined
      ? options.autoSeedProdTenants
      : initialRules.some(r => r.databaseId === 'crm_db');
    this.stateVersion = 1;
    this.lastDurableSyncAt = null;
    this.lastDurableSyncBy = null;
    // Fase 5H.13: banco de governança autoritativo e gate de configuração
    this.governanceDatabaseId = null;
    this.governanceGate = null;
  }

  governanceDatabaseId: string | null = null;
  governanceGate: { open: boolean; code?: number; reasonCode?: string; reason?: string } | null = null;

  bindGovernanceDatabase(databaseId: string) {
    if (!databaseId || typeof databaseId !== 'string') {
      throw new Error('[GOVERNANCE_BIND_ERROR] Identificador de banco de governança inválido.');
    }
    if (this.governanceDatabaseId && this.governanceDatabaseId !== databaseId) {
      throw new Error('[GOVERNANCE_BIND_ERROR] Motor já vinculado a outro banco de governança; redirecionamento proibido.');
    }
    this.governanceDatabaseId = databaseId;
  }

  setGovernanceGate(gate: { open: boolean; code?: number; reasonCode?: string; reason?: string } | null) {
    this.governanceGate = gate ? { ...gate, open: Boolean(gate.open) } : null;
  }

  assertGovernanceTarget(databaseId: string) {
    if (this.governanceGate && !this.governanceGate.open) {
      const err: any = new Error(this.governanceGate.reason || '[GOVERNANCE_FAIL_CLOSED] Governança indisponível.');
      err.statusCode = 503;
      throw err;
    }
    if (this.governanceDatabaseId && databaseId !== this.governanceDatabaseId) {
      const err: any = new Error('[GOVERNANCE_TARGET_MISMATCH] Destino de governança diverge da configuração autoritativa do servidor.');
      err.statusCode = 403;
      throw err;
    }
  }

  enterDurableFailClosed(databaseId?: string, reason?: string) {
    this.circuitBreaker.globalLockdown = true;
    this.circuitBreaker.state = 'OPEN';
    this.circuitBreaker.tripReason = reason || 'Fail-Closed por falha de sincronização de governança.';
    if (databaseId) {
      this.rules = this.rules.filter(r => r.databaseId !== databaseId);
    }
    this.stateVersion = 0;
    this.lastDurableSyncAt = new Date().toISOString();
    this.lastDurableSyncBy = 'system_fail_closed';
  }

  recordAdminAudit(entry: Partial<AdminAuditEntry>): AdminAuditEntry {
    const logItem: AdminAuditEntry = {
      id: crypto.randomBytes(8).toString('hex'),
      timestamp: new Date().toISOString(),
      action: entry.action || 'ADMIN_ACTION',
      actorId: entry.actorId || 'unknown_superadmin',
      clientIp: maskIp(entry.clientIp),
      targetDatabase: entry.targetDatabase || 'all',
      targetCollection: entry.targetCollection || 'all',
      targetTenant: entry.targetTenant || 'all',
      details: entry.details || {},
      reason: entry.reason || 'Ação executada no Painel SuperAdmin',
    };
    this.adminAuditLog.unshift(logItem);
    if (this.adminAuditLog.length > 100) {
      this.adminAuditLog.pop();
    }
    console.log('[SUPERADMIN_AUDIT]', JSON.stringify(logItem));
    return logItem;
  }

  getAdminAuditLogs(limit = 50): AdminAuditEntry[] {
    return this.adminAuditLog.slice(0, limit);
  }

  pauseModuleAdmin(collectionId: string, reason?: string, actorId?: string, clientIp?: string): AdminAuditEntry {
    const effReason = reason || 'Módulo pausado manualmente pelo SuperAdmin.';
    this.circuitBreaker.pauseModule(collectionId, effReason);
    return this.recordAdminAudit({
      action: 'POLICY_MODULE_PAUSED',
      actorId,
      clientIp,
      targetCollection: collectionId,
      reason: effReason,
    });
  }

  resumeModuleAdmin(collectionId: string, actorId?: string, clientIp?: string): AdminAuditEntry {
    this.circuitBreaker.resumeModule(collectionId);
    return this.recordAdminAudit({
      action: 'POLICY_MODULE_RESUMED',
      actorId,
      clientIp,
      targetCollection: collectionId,
      reason: 'Módulo retomado pelo SuperAdmin.',
    });
  }

  setGlobalLockdownAdmin(active: boolean, reason?: string, actorId?: string, clientIp?: string): AdminAuditEntry {
    const effReason = reason || (active ? 'Lockdown global acionado pelo SuperAdmin.' : 'Lockdown global encerrado.');
    this.circuitBreaker.setGlobalLockdown(active, effReason);
    return this.recordAdminAudit({
      action: active ? 'POLICY_GLOBAL_LOCKDOWN_ENABLED' : 'POLICY_GLOBAL_LOCKDOWN_DISABLED',
      actorId,
      clientIp,
      reason: effReason,
    });
  }

  ensureTenantInitialized(databaseId: string, tenantId?: string) {
    if (!databaseId || !tenantId || tenantId === 'all') return;
    const key = `${databaseId}:${tenantId}`;
    if (this.initializedTenants.has(key)) return;

    if (databaseId === 'crm_db' && this.autoSeedProdTenants && this.rules.some(r => r.databaseId === 'crm_db')) {
      this.initializedTenants.add(key);
      const newTenantRules = generateProdRules(tenantId);
      for (const rule of newTenantRules) {
        if (!this.rules.some(r => r.id === rule.id)) {
          this.rules.push(rule);
        }
      }
    }
  }

  setRuleActive({
    databaseId,
    collectionId,
    action,
    tenantId,
    allowedRoles,
    enabled,
    actorId,
    clientIp,
    reason,
  }: {
    databaseId: string;
    collectionId: string;
    action: 'create' | 'update' | 'delete' | 'signContract';
    tenantId: string;
    allowedRoles?: string[];
    enabled: boolean;
    actorId?: string;
    clientIp?: string;
    reason?: string;
  }) {
    if (!databaseId || !collectionId || !action || !tenantId) {
      throw new Error('[POLICY_MUTATION_ERROR] databaseId, collectionId, action e tenantId são obrigatórios.');
    }

    if (!['create', 'update', 'delete', 'signContract'].includes(action)) {
      throw new Error(`[POLICY_MUTATION_ERROR] Ação inválida "${action}". Permitidas: create, update, delete, signContract.`);
    }

    this.ensureTenantInitialized(databaseId, tenantId);
    const effectiveCollectionId = resolveModuleCollection(collectionId);

    if (enabled === false) {
      const matching = this.rules.filter(
        r =>
          r.databaseId === databaseId &&
          (r.collectionId === collectionId || r.collectionId === effectiveCollectionId) &&
          r.action === action &&
          r.tenantId === tenantId
      );
      if (matching.length > 0) {
        this.rules = this.rules.filter(
          r =>
            !(
              r.databaseId === databaseId &&
              (r.collectionId === collectionId || r.collectionId === effectiveCollectionId) &&
              r.action === action &&
              r.tenantId === tenantId
            )
        );
        const removed = matching[0];
        const audit = this.recordAdminAudit({
          action: 'POLICY_RULE_REVOKED',
          actorId,
          clientIp,
          targetDatabase: databaseId,
          targetCollection: collectionId,
          targetTenant: tenantId,
          details: { action, ruleId: removed.id, allowedRoles: removed.allowedRoles, removedCount: matching.length },
          reason: reason || `Regra revogada para ${action}`,
        });
        return { success: true, enabled: false, ruleId: removed.id, audit };
      }
      return { success: true, enabled: false, message: 'Nenhuma regra correspondente ativa encontrada para revogar.' };
    }

    // enabled === true
    const ruleId = `rule_${databaseId}_${effectiveCollectionId}_${action}_${tenantId}`;
    const roles = Array.isArray(allowedRoles) && allowedRoles.length > 0 ? allowedRoles : [...DEFAULT_ALLOWED_ROLES];
    const newRule: PolicyRule = {
      id: ruleId,
      databaseId,
      collectionId: effectiveCollectionId,
      action,
      tenantId,
      allowedRoles: roles,
      maxPayloadBytes: 512 * 1024,
      forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
    };

    validatePolicyConfiguration([newRule]);

    this.rules = this.rules.filter(
      r =>
        !(
          r.databaseId === databaseId &&
          (r.collectionId === collectionId || r.collectionId === effectiveCollectionId) &&
          r.action === action &&
          r.tenantId === tenantId
        )
    );
    this.rules.push(newRule);

    const audit = this.recordAdminAudit({
      action: 'POLICY_RULE_GRANTED',
      actorId,
      clientIp,
      targetDatabase: databaseId,
      targetCollection: effectiveCollectionId,
      targetTenant: tenantId,
      details: { action, ruleId: newRule.id, allowedRoles: newRule.allowedRoles },
      reason: reason || `Regra concedida para ${action}`,
    });

    return { success: true, enabled: true, ruleId: newRule.id, rule: newRule, audit };
  }

  attachPersistenceAdapter(adapter: any) {
    this.persistenceAdapter = adapter;
  }

  async syncFromDurable(databaseId: string = this.governanceDatabaseId || '') {
    if (!this.persistenceAdapter) {
      return { synced: false, reason: 'Nenhum adaptador de persistência acoplado.' };
    }
    if (!databaseId) {
      const err: any = new Error('[GOVERNANCE_TARGET_MISSING] Banco de governança não configurado; nenhuma seleção automática é realizada.');
      err.statusCode = 503;
      throw err;
    }
    this.assertGovernanceTarget(databaseId);
    let syncRes: any;
    try {
      syncRes = await this.persistenceAdapter.syncPolicyEngineFromDurableState(this, databaseId);
    } catch (err: any) {
      this.enterDurableFailClosed(databaseId, `Fail-Closed: falha ao revalidar governança durável (${err?.message || 'erro'})`);
      throw err;
    }
    this.initializedDatabases.add(databaseId);
    this.stateVersion = syncRes.stateVersion;
    this.lastDurableSyncAt = syncRes.updatedAt || new Date().toISOString();
    this.lastDurableSyncBy = syncRes.updatedBy || 'unknown';
    return syncRes;
  }

  async setGlobalLockdownAdminPersistent(params: {
    databaseId: string;
    active: boolean;
    reason?: string;
    actorId?: string;
    clientIp?: string;
    expectedVersion?: number;
  }) {
    const { databaseId, active, reason, actorId, clientIp, expectedVersion } = params;
    this.assertGovernanceTarget(databaseId);
    if (!this.persistenceAdapter) {
      this.setGlobalLockdownAdmin(active, reason, actorId, clientIp);
      return {
        success: true,
        globalLockdown: active,
        stateVersion: ++this.stateVersion,
        updatedAt: new Date().toISOString(),
      };
    }

    this.persistenceAdapter.assertSandboxSafety(databaseId);
    let expVer = expectedVersion;
    if (typeof expVer !== 'number') {
      const current = await this.persistenceAdapter.loadGovernanceState(databaseId);
      expVer = current.stateVersion;
    }

    const effReason = reason || (active ? 'Lockdown global acionado pelo SuperAdmin.' : 'Lockdown global encerrado.');
    const saveRes = await this.persistenceAdapter.saveGovernanceStateAtomic({
      databaseId,
      expectedVersion: expVer,
      stateUpdates: {
        globalLockdown: Boolean(active),
        tripReason: effReason,
      },
      actorId,
    });

    this.setGlobalLockdownAdmin(active, effReason, actorId, clientIp);
    this.stateVersion = saveRes.stateVersion;
    this.lastDurableSyncAt = saveRes.updatedAt;
    this.lastDurableSyncBy = saveRes.updatedBy;

    return {
      success: true,
      globalLockdown: Boolean(active),
      stateVersion: saveRes.stateVersion,
      updatedAt: saveRes.updatedAt,
    };
  }

  async pauseModuleAdminPersistent(params: {
    databaseId: string;
    collectionId: string;
    paused: boolean;
    reason?: string;
    actorId?: string;
    clientIp?: string;
    expectedVersion?: number;
  }) {
    const { databaseId, collectionId, paused, reason, actorId, clientIp, expectedVersion } = params;
    this.assertGovernanceTarget(databaseId);
    if (!this.persistenceAdapter) {
      if (paused) {
        this.pauseModuleAdmin(collectionId, reason, actorId, clientIp);
      } else {
        this.resumeModuleAdmin(collectionId, actorId, clientIp);
      }
      return {
        success: true,
        collectionId,
        paused,
        stateVersion: ++this.stateVersion,
        updatedAt: new Date().toISOString(),
      };
    }

    this.persistenceAdapter.assertSandboxSafety(databaseId);
    const current = await this.persistenceAdapter.loadGovernanceState(databaseId);
    const expVer = typeof expectedVersion === 'number' ? expectedVersion : current.stateVersion;

    const updatedPauses = { ...current.modulePauses };
    const effReason = reason || (paused ? 'Módulo pausado manualmente pelo SuperAdmin.' : '');
    if (paused) {
      updatedPauses[collectionId] = { paused: true, reason: effReason };
    } else {
      delete updatedPauses[collectionId];
    }

    const saveRes = await this.persistenceAdapter.saveGovernanceStateAtomic({
      databaseId,
      expectedVersion: expVer,
      stateUpdates: { modulePauses: updatedPauses },
      actorId,
    });

    if (paused) {
      this.pauseModuleAdmin(collectionId, effReason, actorId, clientIp);
    } else {
      this.resumeModuleAdmin(collectionId, actorId, clientIp);
    }
    this.stateVersion = saveRes.stateVersion;
    this.lastDurableSyncAt = saveRes.updatedAt;
    this.lastDurableSyncBy = saveRes.updatedBy;

    return {
      success: true,
      collectionId,
      paused,
      stateVersion: saveRes.stateVersion,
      updatedAt: saveRes.updatedAt,
    };
  }

  async setRuleActivePersistent(params: {
    databaseId: string;
    collectionId: string;
    action: 'create' | 'update' | 'delete' | 'signContract';
    tenantId: string;
    allowedRoles?: string[];
    enabled: boolean;
    actorId?: string;
    clientIp?: string;
    reason?: string;
    expectedVersion?: number;
  }) {
    const { databaseId, collectionId, action, tenantId, allowedRoles, enabled, actorId, clientIp, reason, expectedVersion } = params;
    this.assertGovernanceTarget(databaseId);
    if (!this.persistenceAdapter) {
      const res = this.setRuleActive({ databaseId, collectionId, action, tenantId, allowedRoles, enabled, actorId, clientIp, reason });
      this.lastDurableSyncAt = new Date().toISOString();
      this.lastDurableSyncBy = actorId || 'superadmin';
      return { ...res, stateVersion: ++this.stateVersion, updatedAt: this.lastDurableSyncAt };
    }

    this.persistenceAdapter.assertSandboxSafety(databaseId);
    const current = await this.persistenceAdapter.loadGovernanceState(databaseId);
    const expVer = typeof expectedVersion === 'number' ? expectedVersion : current.stateVersion;

    let updatedRules = Array.isArray(current.activeRules) ? [...current.activeRules] : [];
    let targetRule: PolicyRule | null = null;

    if (!enabled) {
      updatedRules = updatedRules.filter(
        r => !(r.databaseId === databaseId && r.collectionId === collectionId && r.action === action && r.tenantId === tenantId)
      );
    } else {
      const ruleId = `rule_${databaseId}_${collectionId}_${action}_${tenantId}`;
      const roles = Array.isArray(allowedRoles) && allowedRoles.length > 0 ? allowedRoles : [...DEFAULT_ALLOWED_ROLES];
      targetRule = {
        id: ruleId,
        databaseId,
        collectionId,
        action,
        tenantId,
        allowedRoles: roles,
        maxPayloadBytes: 512 * 1024,
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
      };
      validatePolicyConfiguration([targetRule]);

      updatedRules = updatedRules.filter(
        r => !(r.databaseId === databaseId && r.collectionId === collectionId && r.action === action && r.tenantId === tenantId)
      );
      updatedRules.push(targetRule);
    }

    const saveRes = await this.persistenceAdapter.saveGovernanceStateAtomic({
      databaseId,
      expectedVersion: expVer,
      stateUpdates: { activeRules: updatedRules },
      actorId,
    });

    const inMemRes = this.setRuleActive({
      databaseId,
      collectionId,
      action,
      tenantId,
      allowedRoles,
      enabled,
      actorId,
      clientIp,
      reason,
    });

    this.stateVersion = saveRes.stateVersion;
    this.lastDurableSyncAt = saveRes.updatedAt;
    this.lastDurableSyncBy = saveRes.updatedBy;

    return {
      ...inMemRes,
      stateVersion: saveRes.stateVersion,
      updatedAt: saveRes.updatedAt,
    };
  }

  getModuleStatus(databaseId: string, collectionId: string, tenantId?: string) {
    this.ensureTenantInitialized(databaseId, tenantId);
    const effectiveCollectionId = resolveModuleCollection(collectionId);
    const isGlobal = Boolean(this.circuitBreaker.globalLockdown);
    const isPaused =
      this.circuitBreaker.moduleOverrides.has(collectionId) ||
      this.circuitBreaker.moduleOverrides.has(effectiveCollectionId);
    const pauseInfo =
      this.circuitBreaker.moduleOverrides.get(collectionId) ||
      this.circuitBreaker.moduleOverrides.get(effectiveCollectionId);

    const relevantRules = this.rules.filter(
      r =>
        r.databaseId === databaseId &&
        (r.collectionId === collectionId || r.collectionId === effectiveCollectionId) &&
        (!tenantId || r.tenantId === tenantId)
    );

    const checkAction = (act: 'create' | 'update' | 'delete') => {
      const actionRules = relevantRules.filter(r => r.action === act);
      const mergedRoles = Array.from(new Set(actionRules.flatMap(r => r.allowedRoles)));
      return {
        allowed: actionRules.length > 0,
        roles: mergedRoles,
        ruleId: actionRules[0] ? actionRules[0].id : undefined,
      };
    };

    const actions = {
      create: checkAction('create'),
      update: checkAction('update'),
      delete: checkAction('delete'),
    };

    let status: 'ACTIVE' | 'CIRCUIT_PAUSED' | 'LOCKED' | 'GLOBAL_LOCKDOWN' = 'LOCKED';
    if (isGlobal) {
      status = 'GLOBAL_LOCKDOWN';
    } else if (isPaused) {
      status = 'CIRCUIT_PAUSED';
    } else if (actions.create.allowed || actions.update.allowed || actions.delete.allowed) {
      status = 'ACTIVE';
    }

    return {
      collectionId,
      databaseId,
      tenantId: tenantId || 'all',
      status,
      isPaused,
      pauseReason: pauseInfo ? pauseInfo.reason : null,
      actions,
      rulesCount: relevantRules.length,
    };
  }

  getAllModulesStatus(databaseId: string, tenantId?: string) {
    this.ensureTenantInitialized(databaseId, tenantId);
    const isProd = databaseId === 'crm_db';
    return KNOWN_MODULES.map(mod => {
      const activeCollection = isProd ? mod.prodCollection : mod.testCollection;
      const status = this.getModuleStatus(databaseId, activeCollection, tenantId);
      return {
        ...mod,
        activeCollection,
        ...status,
      };
    });
  }

  addRule(rule: PolicyRule) {
    validatePolicyConfiguration([rule]);
    if (this.rules.some(r => r.id === rule.id)) {
      throw new Error(`Regra com ID "${rule.id}" já cadastrada.`);
    }
    this.rules.push(rule);
  }

  removeRule(ruleId: string) {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  clearRules() {
    this.rules = [];
  }

  getRules(): PolicyRule[] {
    return this.rules.map(r => ({ ...r }));
  }

  evaluate(ctx: PolicyEvaluationContext): PolicyEvaluationResult {
    const { databaseId, collectionId, action, tenantId, userId, userRoles, data } = ctx;

    // 0.a Gate de configuração de governança: configuração ausente/inválida => Deny-All
    if (this.governanceGate && !this.governanceGate.open) {
      return {
        allowed: false,
        code: this.governanceGate.code || 503,
        reason: this.governanceGate.reason || '[GOVERNANCE_FAIL_CLOSED] Configuração de governança indisponível. Operações protegidas bloqueadas.',
      };
    }

    // 0.b Salvaguarda Fail-Closed para persistência durável
    if (this.persistenceAdapter) {
      const syncTarget = this.governanceDatabaseId || (isSandboxGovernanceDatabase(databaseId) ? databaseId : null);
      if (syncTarget && !this.initializedDatabases.has(syncTarget)) {
        return {
          allowed: false,
          code: 503,
          reason: '[FAIL-CLOSED GUARD] Motor de políticas ainda não sincronizado com o estado persistente de governança.',
        };
      }
    }

    const effectiveCollectionId = resolveModuleCollection(collectionId);

    const cbCheck = this.circuitBreaker.check(collectionId, action);
    if (!cbCheck.allowed) {
      return cbCheck;
    }
    if (effectiveCollectionId !== collectionId) {
      const parentCbCheck = this.circuitBreaker.check(effectiveCollectionId, action);
      if (!parentCbCheck.allowed) {
        return parentCbCheck;
      }
    }

    // 2. Trava de Produção Imutável (crm_db) — Fail-Closed se não houver regras ativas para crm_db (Modo Deny-All)
    if (databaseId === 'crm_db') {
      const hasProdRules = this.rules.some(r => r.databaseId === 'crm_db');
      if (!hasProdRules) {
        this.circuitBreaker.recordAuthBreach('Tentativa de escrita direta não autorizada em crm_db sem regras ativas');
        return {
          allowed: false,
          code: 403,
          reason: '[FAIL-CLOSED GUARD] Escritas de negócio em crm_db estão desabilitadas (modo Deny-All ativo).',
        };
      }
    }

    if (!databaseId || !collectionId || !action || !tenantId || !userId) {
      this.circuitBreaker.recordAuthBreach('Parâmetros obrigatórios ausentes no contexto de política');
      return {
        allowed: false,
        code: 400,
        reason: '[POLICY_DENIED] Parâmetros obrigatórios ausentes para avaliação de política de escrita.',
      };
    }

    this.ensureTenantInitialized(databaseId, tenantId);

    const roles = Array.isArray(userRoles) ? userRoles : [userRoles].filter(Boolean);
    if (roles.length === 0) {
      this.circuitBreaker.recordAuthBreach(`Usuário "${userId}" sem papéis autorizados`);
      return {
        allowed: false,
        code: 403,
        reason: `[POLICY_DENIED] Usuário "${userId}" não possui nenhum papel funcional ativo no sistema.`,
      };
    }

    const matchedRule = this.rules.find(r => {
      if (r.databaseId !== databaseId) return false;
      if (r.collectionId !== collectionId && r.collectionId !== effectiveCollectionId) return false;
      if (r.action !== action) return false;
      if (r.tenantId !== tenantId) return false;

      const hasAllowedRole = r.allowedRoles.some(allowedRole => roles.includes(allowedRole));
      if (!hasAllowedRole) return false;

      return true;
    });

    if (!matchedRule) {
      this.circuitBreaker.recordAuthBreach(
        `Nenhuma regra de tupla autoriza: db=${databaseId}, col=${collectionId} (mod=${effectiveCollectionId}), act=${action}, tenant=${tenantId}, roles=[${roles.join(',')}]`
      );
      return {
        allowed: false,
        code: 403,
        reason: `[POLICY_DENIED] Operação não autorizada pela matriz de menor privilégio para (${collectionId}, ${action}, tenant=${tenantId}).`,
      };
    }

    if (matchedRule.maxPayloadBytes && data) {
      const payloadBytes = Buffer.byteLength(JSON.stringify(data));
      if (payloadBytes > matchedRule.maxPayloadBytes) {
        return {
          allowed: false,
          code: 413,
          reason: `[POLICY_DENIED] Payload de ${payloadBytes} bytes excede o limite configurado de ${matchedRule.maxPayloadBytes} bytes para a regra "${matchedRule.id}".`,
        };
      }
    }

    const forbidden = matchedRule.forbiddenFields || ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id'];
    if (data && typeof data === 'object') {
      for (const field of forbidden) {
        if (Object.prototype.hasOwnProperty.call(data, field)) {
          return {
            allowed: false,
            code: 400,
            reason: `[POLICY_DENIED] Campo restrito "${field}" detectado no payload da operação "${action}". Sanitização mandatória violada.`,
          };
        }
      }
    }

    if (typeof matchedRule.customValidator === 'function') {
      try {
        const customOk = matchedRule.customValidator(ctx);
        if (!customOk) {
          return {
            allowed: false,
            code: 403,
            reason: `[POLICY_DENIED] Validador específico da regra "${matchedRule.id}" rejeitou a operação.`,
          };
        }
      } catch (err: any) {
        return {
          allowed: false,
          code: 400,
          reason: `[POLICY_DENIED] Erro no validador da regra "${matchedRule.id}": ${err.message}`,
        };
      }
    }

    return {
      allowed: true,
      matchedRule,
    };
  }
}

function generateSandboxRules(tenantId: string): PolicyRule[] {
  const collections = ['test_clients', 'test_contacts', 'test_deals', 'test_crm_contracts'];
  const rules: PolicyRule[] = [];

  for (const collectionId of collections) {
    rules.push({
      id: `rule_sandbox_${tenantId}_${collectionId}_create_admin`,
      databaseId: 'crm_isolated_test',
      collectionId,
      action: 'create',
      tenantId,
      allowedRoles: ['admin', 'superadmin', 'manager', 'owner'],
      maxPayloadBytes: 256 * 1024,
      forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id'],
    });

    rules.push({
      id: `rule_sandbox_${tenantId}_${collectionId}_create_agent`,
      databaseId: 'crm_isolated_test',
      collectionId,
      action: 'create',
      tenantId,
      allowedRoles: ['agent', 'colaborador'],
      maxPayloadBytes: 256 * 1024,
      forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id'],
    });

    rules.push({
      id: `rule_sandbox_${tenantId}_${collectionId}_update_admin`,
      databaseId: 'crm_isolated_test',
      collectionId,
      action: 'update',
      tenantId,
      allowedRoles: ['admin', 'superadmin', 'manager', 'owner'],
      maxPayloadBytes: 256 * 1024,
      forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id'],
    });

    rules.push({
      id: `rule_sandbox_${tenantId}_${collectionId}_update_agent`,
      databaseId: 'crm_isolated_test',
      collectionId,
      action: 'update',
      tenantId,
      allowedRoles: ['agent', 'colaborador'],
      maxPayloadBytes: 256 * 1024,
      forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id'],
    });

    rules.push({
      id: `rule_sandbox_${tenantId}_${collectionId}_delete_admin`,
      databaseId: 'crm_isolated_test',
      collectionId,
      action: 'delete',
      tenantId,
      allowedRoles: ['admin', 'superadmin', 'owner'],
      forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id'],
    });
  }

  return rules;
}

export const SANDBOX_PILOT_CLIENTS_RULES: PolicyRule[] = [
  ...generateSandboxRules('test_team_alpha'),
  ...generateSandboxRules('test_team_beta'),
  ...generateSandboxRules('tenant_default'),
];

/**
 * Gera as regras operacionais completas para um tenant no banco principal crm_db.
 * O SuperAdmin pode revogar ou conceder qualquer ação (create, update, delete) por módulo e por cliente em tempo real.
 */
export function generateProdRules(tenantId: string): PolicyRule[] {
  const rules: PolicyRule[] = [];
  const actions: Array<'create' | 'update' | 'delete'> = ['create', 'update', 'delete'];

  for (const mod of KNOWN_MODULES) {
    const collectionId = mod.prodCollection;
    for (const action of actions) {
      rules.push({
        id: `rule_crm_db_${collectionId}_${action}_${tenantId}`,
        databaseId: 'crm_db',
        collectionId,
        action,
        tenantId,
        allowedRoles: [...DEFAULT_ALLOWED_ROLES],
        maxPayloadBytes: 512 * 1024,
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
      });
    }
  }

  return rules;
}

export const PROD_PILOT_CLIENTS_RULES: PolicyRule[] = [
  ...generateProdRules('tenant_default'),
  ...generateProdRules('tenant_empresaa'),
  ...generateProdRules('tenant_empresab'),
];

export const PROD_CLIENTS_RULES: PolicyRule[] = PROD_PILOT_CLIENTS_RULES;

export const PROD_PILOT_CLIENTS_SPECIFICATION: PolicyRule[] = PROD_PILOT_CLIENTS_RULES;


