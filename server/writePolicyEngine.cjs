/**
 * Write Policy Engine — Iris Horizon CRM (Fase 5H.1)
 *
 * Camada Central de Autorização e Circuit Breaker para o Backend API Bridge.
 *
 * Princípios Fundamentais:
 * 1. Menor Privilégio (Deny-by-Default): Toda operação é negada a menos que
 *    exista uma regra de tupla explícita (database, collection, action, tenant, role).
 * 2. Prevenção de Produto Cartesiano: Não utiliza listas soltas que combinam
 *    ações e coleções não planejadas. Cada regra é uma tupla explícita e vinculada.
 * 3. Circuit Breaker Integrado: Monitora falhas, picos de autenticação e latência,
 *    com suporte a interrupção por módulo e lockdown global.
 * 4. Auditoria sem PII: Logs estruturados com mascaramento estrito de dados pessoais.
 * 5. Testabilidade Isolada: Motor desacoplado de I/O para execução em testes unitários e de integração.
 *
 * REGRA ABSOLUTA DE SEGURANÇA: Zero mutações em produção (crm_db) nesta fase.
 */

const crypto = require('crypto');

// ============================================================================
// 1. Definições de Tipos e Regras
// ============================================================================

/**
 * @typedef {Object} PolicyRule
 * @property {string} id - Identificador único da regra
 * @property {string} databaseId - Banco autorizado (ex: 'crm_isolated_test')
 * @property {string} collectionId - Coleção autorizada (ex: 'test_clients', 'clients')
 * @property {'create'|'update'|'delete'|'signContract'} action - Ação permitida
 * @property {string} tenantId - Tenant autorizado (ex: 'test_team_alpha')
 * @property {string[]} allowedRoles - Papéis autorizados (ex: ['admin', 'agent'])
 * @property {number} [maxPayloadBytes] - Tamanho máximo opcional de payload
 * @property {string[]} [forbiddenFields] - Campos proibidos no payload
 * @property {Function} [customValidator] - Validador específico adicional (ctx => boolean)
 */

// ============================================================================
// 2. Circuit Breaker e Métricas
// ============================================================================

class CircuitBreaker {
  constructor(options = {}) {
    this.maxConsecutiveFailures = options.maxConsecutiveFailures || 5;
    this.maxAuthBreachesPerMinute = options.maxAuthBreachesPerMinute || 10;
    this.maxLatencyMs = options.maxLatencyMs || 5000;
    this.cooldownWindowMs = options.cooldownWindowMs || 30000; // 30s de resfriamento

    this.state = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this.consecutiveFailures = 0;
    this.trippedAt = null;
    this.tripReason = null;

    this.authBreaches = [];
    this.moduleOverrides = new Map(); // collectionId -> { paused: boolean, reason: string }
    this.actionOverrides = new Map(); // action -> { paused: boolean, reason: string }
    this.globalLockdown = false;
  }

  setGlobalLockdown(active, reason = 'Lockdown global acionado manualmente.') {
    this.globalLockdown = Boolean(active);
    if (this.globalLockdown) {
      this.state = 'OPEN';
      this.trippedAt = Date.now();
      this.tripReason = reason;
    } else {
      this.reset();
    }
  }

  pauseModule(collectionId, reason = 'Módulo pausado por salvaguarda.') {
    this.moduleOverrides.set(collectionId, { paused: true, reason });
  }

  resumeModule(collectionId) {
    this.moduleOverrides.delete(collectionId);
  }

  pauseAction(action, reason = 'Ação pausada por salvaguarda.') {
    this.actionOverrides.set(action, { paused: true, reason });
  }

  resumeAction(action) {
    this.actionOverrides.delete(action);
  }

  recordSuccess(durationMs) {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.consecutiveFailures = 0;
      this.trippedAt = null;
      this.tripReason = null;
    }
    this.consecutiveFailures = 0;
  }

  recordFailure(statusCode, message) {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.trip(`Limite de falhas consecutivas atingido (${this.consecutiveFailures}): ${message}`);
    }
  }

  recordAuthBreach(reason) {
    const now = Date.now();
    this.authBreaches = this.authBreaches.filter(ts => now - ts < 60000);
    this.authBreaches.push(now);

    if (this.authBreaches.length >= this.maxAuthBreachesPerMinute) {
      this.trip(`Pico de violações de autorização detectado (${this.authBreaches.length}/min): ${reason}`);
    }
  }

  trip(reason) {
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

  /**
   * Avalia se a operação está bloqueada pelo disjuntor
   * @returns {{ allowed: boolean, code?: number, reason?: string }}
   */
  check(collectionId, action) {
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
      if (now - this.trippedAt > this.cooldownWindowMs) {
        this.state = 'HALF_OPEN';
        return { allowed: true }; // Permite 1 probe
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

// ============================================================================
// 3. Mascaramento de PII e Auditoria Segura
// ============================================================================

/**
 * Mascara campos sensíveis e PII de acordo com a política de segurança
 */
function maskPiiValue(key, value) {
  if (value === null || value === undefined) return value;
  const str = String(value);

  // Chaves de segredo / senhas / tokens -> 100% omitidos
  if (/password|secret|token|api_key|jwt|auth/i.test(key)) {
    return '[REDACTED]';
  }

  // E-mail: j***@dominio.com
  if (/email/i.test(key) && str.includes('@')) {
    const parts = str.split('@');
    const name = parts[0];
    const maskedName = name.length <= 2 ? name[0] + '***' : name[0] + '***' + name[name.length - 1];
    return `${maskedName}@${parts[1]}`;
  }

  // Telefone: mantém primeiros e últimos dígitos
  if (/phone|telefone|celular|whatsapp/i.test(key)) {
    if (str.length > 6) {
      return str.slice(0, 4) + '****' + str.slice(-2);
    }
    return '****';
  }

  // CPF / CNPJ / Documento
  if (/cpf|cnpj|document|documento/i.test(key)) {
    if (str.length > 5) {
      return str.slice(0, 3) + '.***.***-' + str.slice(-2);
    }
    return '***';
  }

  // Nomes pessoais completos: mantém iniciais
  if (/name|nome|razao_social/i.test(key) && typeof value === 'string') {
    const words = str.trim().split(/\s+/);
    return words.map(w => w.length > 1 ? w[0] + '***' : w).join(' ');
  }

  return value;
}

/**
 * Sanitiza recursivamente objetos de payload para log seguro
 */
function sanitizePayloadForAudit(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => sanitizePayloadForAudit(item));
  }
  const result = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object') {
      result[k] = sanitizePayloadForAudit(v);
    } else {
      result[k] = maskPiiValue(k, v);
    }
  }
  return result;
}

/**
 * Mascara endereços IP para logs de auditoria
 */
function maskIp(ip) {
  if (!ip) return '0.0.0.0';
  const parts = String(ip).split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  // IPv6
  const v6Parts = String(ip).split(':');
  if (v6Parts.length > 2) {
    return `${v6Parts[0]}:${v6Parts[1]}:****:****`;
  }
  return 'masked_ip';
}

/**
 * Cria entrada de log estruturada pronta para stdout
 */
function createAuditLog({
  traceId,
  clientIp,
  userId,
  userRole,
  tenantId,
  databaseId,
  collectionId,
  action,
  documentId,
  decision,
  ruleId,
  reason,
  latencyMs,
  statusCode,
  payloadSample,
}) {
  return {
    timestamp: new Date().toISOString(),
    traceId: traceId || crypto.randomBytes(8).toString('hex'),
    clientIp: maskIp(clientIp),
    userId: userId || 'anonymous',
    userRole: userRole || 'none',
    tenantId: tenantId || 'none',
    databaseId,
    collectionId,
    action,
    documentId: documentId || undefined,
    decision, // 'ALLOWED' | 'DENIED' | 'CIRCUIT_TRIPPED'
    ruleId: ruleId || undefined,
    reason: reason || undefined,
    latencyMs: Math.round(latencyMs || 0),
    statusCode,
    sanitizedPayload: payloadSample ? sanitizePayloadForAudit(payloadSample) : undefined,
  };
}

// ============================================================================
// 4. Validador de Configuração em Startup
// ============================================================================

/**
 * Valida a matriz de regras declaradas no startup do servidor
 */
function validatePolicyConfiguration(rules) {
  if (!Array.isArray(rules)) {
    throw new Error('[WritePolicyEngine] Configuração inválida: As regras devem ser um array.');
  }

  const seenIds = new Set();
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

    // Validação estrita de tupla (proibido curingas '*')
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

    // Regra de segurança absoluta da Fase 5H.2: Nenhuma regra ativa para crm_db permitida
    if (r.databaseId === 'crm_db') {
      throw new Error(`${prefix} Regras ativas para "crm_db" estão terminantemente proibidas na Fase 5H.2 (modo deny-all obrigatório).`);
    }
  }

  return true;
}

// ============================================================================
// 5. Motor Central de Políticas (WritePolicyEngine)
// ============================================================================

class WritePolicyEngine {
  constructor(initialRules = [], options = {}) {
    validatePolicyConfiguration(initialRules);
    this.rules = [...initialRules];
    this.circuitBreaker = new CircuitBreaker(options.circuitBreakerOptions);
    this.active = options.enabled !== false;
  }

  /**
   * Adiciona uma regra à matriz com validação de menor privilégio
   */
  addRule(rule) {
    validatePolicyConfiguration([rule]);
    if (this.rules.some(r => r.id === rule.id)) {
      throw new Error(`Regra com ID "${rule.id}" já cadastrada.`);
    }
    this.rules.push(rule);
  }

  /**
   * Remove uma regra da matriz
   */
  removeRule(ruleId) {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  /**
   * Limpa todas as regras (modo de silêncio absoluto)
   */
  clearRules() {
    this.rules = [];
  }

  /**
   * Retorna cópia somente-leitura das regras registradas
   */
  getRules() {
    return this.rules.map(r => ({ ...r }));
  }

  /**
   * Avaliação autoritativa pura de política (Menor Privilégio + Deny-by-Default)
   *
   * @param {Object} ctx
   * @param {string} ctx.databaseId
   * @param {string} ctx.collectionId
   * @param {string} ctx.action
   * @param {string} ctx.tenantId - Tenant determinado autoritativamente pelo backend
   * @param {string} ctx.userId
   * @param {string[]} ctx.userRoles - Papéis reais verificados no backend
   * @param {Object} [ctx.data] - Dados do payload
   * @param {string} [ctx.documentId]
   * @param {string} [ctx.clientIp]
   * @returns {{ allowed: boolean, code?: number, reason?: string, matchedRule?: PolicyRule }}
   */
  evaluate(ctx) {
    const { databaseId, collectionId, action, tenantId, userId, userRoles, data, documentId } = ctx;

    // 1. Verificação do Circuit Breaker
    const cbCheck = this.circuitBreaker.check(collectionId, action);
    if (!cbCheck.allowed) {
      return cbCheck;
    }

    // 2. Trava de Produção Imutável (crm_db) — Fail-Closed Absoluto e Modo Deny-All
    if (databaseId === 'crm_db') {
      this.circuitBreaker.recordAuthBreach('Tentativa de escrita direta não autorizada em crm_db');
      return {
        allowed: false,
        code: 403,
        reason: '[FAIL-CLOSED GUARD] Escritas de negócio em crm_db estão terminantemente desabilitadas na Fase 5H.2 (modo Deny-All ativo).',
      };
    }

    // 3. Validação Básica de Parâmetros
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

    // 4. Busca por Regra Específica de Menor Privilégio (Tupla Exata)
    // NÃO utiliza cruzamento de listas. Exige correspondência exata de tupla!
    const matchedRule = this.rules.find(r => {
      if (r.databaseId !== databaseId) return false;
      if (r.collectionId !== collectionId) return false;
      if (r.action !== action) return false;
      if (r.tenantId !== tenantId) return false;

      // Papel deve estar na lista de papéis permitidos para ESTA tupla específica
      const hasAllowedRole = r.allowedRoles.some(allowedRole => roles.includes(allowedRole));
      if (!hasAllowedRole) return false;

      return true;
    });

    // 5. Deny-by-Default: Se nenhuma regra cobrir a combinação, nega sumariamente
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

    // 6. Verificações Adicionais da Regra Específica

    // 6.1 Tamanho máximo de payload
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

    // 6.2 Campos proibidos no payload
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

    // 6.3 Validador customizado opcional
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
      } catch (err) {
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

// ============================================================================
// 6. Matrizes e Especificações de Regras
// ============================================================================

/**
 * Matriz estrita para Homologação em Sandbox (Fase 5H.1)
 * Contas de teste autorizadas: test_team_alpha
 * Coleções no sandbox: test_clients
 */
const SANDBOX_PILOT_CLIENTS_RULES = [
  // 1. Admin em test_team_alpha: Pode Criar clientes
  {
    id: 'rule_sandbox_alpha_clients_create_admin',
    databaseId: 'crm_isolated_test',
    collectionId: 'test_clients',
    action: 'create',
    tenantId: 'test_team_alpha',
    allowedRoles: ['admin', 'superadmin'],
    maxPayloadBytes: 256 * 1024,
  },
  // 2. Agent em test_team_alpha: Pode Criar clientes
  {
    id: 'rule_sandbox_alpha_clients_create_agent',
    databaseId: 'crm_isolated_test',
    collectionId: 'test_clients',
    action: 'create',
    tenantId: 'test_team_alpha',
    allowedRoles: ['agent'],
    maxPayloadBytes: 256 * 1024,
  },
  // 3. Admin em test_team_alpha: Pode Atualizar clientes
  {
    id: 'rule_sandbox_alpha_clients_update_admin',
    databaseId: 'crm_isolated_test',
    collectionId: 'test_clients',
    action: 'update',
    tenantId: 'test_team_alpha',
    allowedRoles: ['admin', 'superadmin'],
    maxPayloadBytes: 256 * 1024,
  },
  // 4. Agent em test_team_alpha: Pode Atualizar clientes
  {
    id: 'rule_sandbox_alpha_clients_update_agent',
    databaseId: 'crm_isolated_test',
    collectionId: 'test_clients',
    action: 'update',
    tenantId: 'test_team_alpha',
    allowedRoles: ['agent'],
    maxPayloadBytes: 256 * 1024,
  },
  // 5. Somente Admin em test_team_alpha: Pode Excluir clientes (Agent NÃO pode excluir)
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
const PROD_PILOT_CLIENTS_SPECIFICATION = [
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

module.exports = {
  WritePolicyEngine,
  CircuitBreaker,
  validatePolicyConfiguration,
  maskPiiValue,
  sanitizePayloadForAudit,
  maskIp,
  createAuditLog,
  SANDBOX_PILOT_CLIENTS_RULES,
  PROD_PILOT_CLIENTS_SPECIFICATION,
};

