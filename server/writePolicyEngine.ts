/**
 * Write Policy Engine — TypeScript / ESM Version (Fase 5H.1)
 *
 * Central Authorization Layer & Circuit Breaker for Backend API Bridge.
 */

import crypto from 'crypto';

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

  recordSuccess(durationMs: number) {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.consecutiveFailures = 0;
      this.trippedAt = null;
      this.tripReason = null;
    }
    this.consecutiveFailures = 0;
  }

  recordFailure(statusCode: number, message: string) {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.trip(`Limite de falhas consecutivas atingido (${this.consecutiveFailures}): ${message}`);
    }
  }

  recordAuthBreach(reason: string) {
    const now = Date.now();
    this.authBreaches = this.authBreaches.filter(ts => now - ts < 60000);
    this.authBreaches.push(now);

    if (this.authBreaches.length >= this.maxAuthBreachesPerMinute) {
      this.trip(`Pico de violações de autorização detectado (${this.authBreaches.length}/min): ${reason}`);
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

    if (r.databaseId === 'crm_db') {
      throw new Error(`${prefix} Regras ativas para "crm_db" estão terminantemente proibidas na Fase 5H.2 (modo deny-all obrigatório).`);
    }
  }

  return true;
}

export class WritePolicyEngine {
  rules: PolicyRule[];
  circuitBreaker: CircuitBreaker;
  active: boolean;

  constructor(initialRules: PolicyRule[] = [], options: { enabled?: boolean; circuitBreakerOptions?: any } = {}) {
    validatePolicyConfiguration(initialRules);
    this.rules = [...initialRules];
    this.circuitBreaker = new CircuitBreaker(options.circuitBreakerOptions);
    this.active = options.enabled !== false;
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
    const { databaseId, collectionId, action, tenantId, userId, userRoles, data, documentId } = ctx;

    const cbCheck = this.circuitBreaker.check(collectionId, action);
    if (!cbCheck.allowed) {
      return cbCheck;
    }

    if (databaseId === 'crm_db') {
      this.circuitBreaker.recordAuthBreach('Tentativa de escrita direta não autorizada em crm_db');
      return {
        allowed: false,
        code: 403,
        reason: '[FAIL-CLOSED GUARD] Escritas de negócio em crm_db estão terminantemente desabilitadas na Fase 5H.2 (modo Deny-All ativo).',
      };
    }

    if (!databaseId || !collectionId || !action || !tenantId || !userId) {
      this.circuitBreaker.recordAuthBreach('Parâmetros obrigatórios ausentes no contexto de política');
      return {
        allowed: false,
        code: 400,
        reason: '[POLICY_DENIED] Parâmetros obrigatórios ausentes para avaliação de política de escrita.',
      };
    }

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
      if (r.collectionId !== collectionId) return false;
      if (r.action !== action) return false;
      if (r.tenantId !== tenantId) return false;

      const hasAllowedRole = r.allowedRoles.some(allowedRole => roles.includes(allowedRole));
      if (!hasAllowedRole) return false;

      return true;
    });

    if (!matchedRule) {
      this.circuitBreaker.recordAuthBreach(
        `Nenhuma regra de tupla autoriza: db=${databaseId}, col=${collectionId}, act=${action}, tenant=${tenantId}, roles=[${roles.join(',')}]`
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

export const SANDBOX_PILOT_CLIENTS_RULES: PolicyRule[] = [
  {
    id: 'rule_sandbox_alpha_clients_create_admin',
    databaseId: 'crm_isolated_test',
    collectionId: 'test_clients',
    action: 'create',
    tenantId: 'test_team_alpha',
    allowedRoles: ['admin', 'superadmin'],
    maxPayloadBytes: 256 * 1024,
  },
  {
    id: 'rule_sandbox_alpha_clients_create_agent',
    databaseId: 'crm_isolated_test',
    collectionId: 'test_clients',
    action: 'create',
    tenantId: 'test_team_alpha',
    allowedRoles: ['agent'],
    maxPayloadBytes: 256 * 1024,
  },
  {
    id: 'rule_sandbox_alpha_clients_update_admin',
    databaseId: 'crm_isolated_test',
    collectionId: 'test_clients',
    action: 'update',
    tenantId: 'test_team_alpha',
    allowedRoles: ['admin', 'superadmin'],
    maxPayloadBytes: 256 * 1024,
  },
  {
    id: 'rule_sandbox_alpha_clients_update_agent',
    databaseId: 'crm_isolated_test',
    collectionId: 'test_clients',
    action: 'update',
    tenantId: 'test_team_alpha',
    allowedRoles: ['agent'],
    maxPayloadBytes: 256 * 1024,
  },
  {
    id: 'rule_sandbox_alpha_clients_delete_admin',
    databaseId: 'crm_isolated_test',
    collectionId: 'test_clients',
    action: 'delete',
    tenantId: 'test_team_alpha',
    allowedRoles: ['admin', 'superadmin'],
  },
];

/**
 * Especificação Proposta para o Futuro Piloto de Clientes em Produção (Fase 5H.3)
 * ATENÇÃO: NÃO ATIVA NESTA FASE (5H.2). Nenhuma regra de crm_db é carregada no motor.
 * Mantida isolada como especificação para auditoria humana e planejamento.
 */
export const PROD_PILOT_CLIENTS_SPECIFICATION: PolicyRule[] = [
  {
    id: 'spec_prod_default_clients_create_admin',
    databaseId: 'crm_db',
    collectionId: 'clients',
    action: 'create',
    tenantId: 'tenant_default',
    allowedRoles: ['admin', 'superadmin'],
    maxPayloadBytes: 256 * 1024,
    forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
  },
  {
    id: 'spec_prod_default_clients_create_agent',
    databaseId: 'crm_db',
    collectionId: 'clients',
    action: 'create',
    tenantId: 'tenant_default',
    allowedRoles: ['agent'],
    maxPayloadBytes: 256 * 1024,
    forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
  },
  {
    id: 'spec_prod_default_clients_update_admin',
    databaseId: 'crm_db',
    collectionId: 'clients',
    action: 'update',
    tenantId: 'tenant_default',
    allowedRoles: ['admin', 'superadmin'],
    maxPayloadBytes: 256 * 1024,
    forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
  },
  {
    id: 'spec_prod_default_clients_update_agent',
    databaseId: 'crm_db',
    collectionId: 'clients',
    action: 'update',
    tenantId: 'tenant_default',
    allowedRoles: ['agent'],
    maxPayloadBytes: 256 * 1024,
    forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
  },
  {
    id: 'spec_prod_default_clients_delete_admin',
    databaseId: 'crm_db',
    collectionId: 'clients',
    action: 'delete',
    tenantId: 'tenant_default',
    allowedRoles: ['admin', 'superadmin'],
    forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
  },
];

