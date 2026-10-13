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

    // Regra de segurança da Fase 5H.4: Regras para "crm_db" permitidas estritamente sob o escopo aprovado do Piloto
    if (r.databaseId === 'crm_db') {
      if (r.collectionId !== 'clients') {
        throw new Error(`${prefix} Produção restrita: Somente a coleção "clients" é permitida em crm_db no Piloto da Fase 5H.4.`);
      }
      if (!['create', 'update'].includes(r.action)) {
        throw new Error(`${prefix} Produção restrita: Ação "${r.action}" proibida em crm_db durante o Piloto da Fase 5H.4 (exclusão e outras ações bloqueadas).`);
      }
      if (r.tenantId !== 'tenant_default') {
        throw new Error(`${prefix} Produção restrita: Tenant "${r.tenantId}" não autorizado em crm_db (permitido unicamente "tenant_default").`);
      }
      const validProdRoles = new Set(['admin', 'superadmin', 'agent']);
      if (!r.allowedRoles.every(role => validProdRoles.has(role))) {
        throw new Error(`${prefix} Produção restrita: Papéis inválidos para crm_db. Permitidos: admin, superadmin, agent.`);
      }
    }
  }

  return true;
}

// ============================================================================
// 4.5. Catálogo Oficial de Módulos do Sistema
// ============================================================================

const KNOWN_MODULES = [
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
    description: 'Kanban comercial, cards de oportunidades e estágios de pipeline.',
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
    description: 'Elaboração, precificação e envio de propostas de vendas.',
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
    name: 'Catálogo Telefônico',
    description: 'Diretório unificado de contatos e telefonia SIP.',
    icon: 'BookUser',
    category: 'Comunicação',
  },
  {
    key: 'automation_config',
    prodCollection: 'automation_config',
    testCollection: 'test_integration_configs',
    name: 'Automações & Webhooks',
    description: 'Gatilhos automáticos, disparos e integrações externas.',
    icon: 'Sparkles',
    category: 'Configurações',
  },
  {
    key: 'notifications',
    prodCollection: 'notifications',
    testCollection: 'test_notifications',
    name: 'Notificações do Sistema',
    description: 'Avisos em tempo real, canários e alertas a usuários.',
    icon: 'Bell',
    category: 'Sistema',
  },
];

// ============================================================================
// 5. Motor Central de Políticas (WritePolicyEngine)
// ============================================================================

class WritePolicyEngine {
  constructor(initialRules = [], options = {}) {
    validatePolicyConfiguration(initialRules);
    this.rules = [...initialRules];
    this.circuitBreaker = new CircuitBreaker(options.circuitBreakerOptions);
    this.active = options.enabled !== false;
    this.adminAuditLog = [];
  }

  /**
   * Registra uma ação administrativa no log de auditoria em memória
   */
  recordAdminAudit(entry) {
    const logItem = {
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

  /**
   * Obtém histórico recente de auditoria administrativa
   */
  getAdminAuditLogs(limit = 50) {
    return this.adminAuditLog.slice(0, limit);
  }

  /**
   * Pausa um módulo específico via Circuit Breaker
   */
  pauseModuleAdmin(collectionId, reason, actorId, clientIp) {
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

  /**
   * Retoma um módulo específico via Circuit Breaker
   */
  resumeModuleAdmin(collectionId, actorId, clientIp) {
    this.circuitBreaker.resumeModule(collectionId);
    return this.recordAdminAudit({
      action: 'POLICY_MODULE_RESUMED',
      actorId,
      clientIp,
      targetCollection: collectionId,
      reason: 'Módulo retomado pelo SuperAdmin.',
    });
  }

  /**
   * Ativa ou desativa o Lockdown Global via Circuit Breaker
   */
  setGlobalLockdownAdmin(active, reason, actorId, clientIp) {
    const effReason = reason || (active ? 'Lockdown global acionado pelo SuperAdmin.' : 'Lockdown global encerrado.');
    this.circuitBreaker.setGlobalLockdown(active, effReason);
    return this.recordAdminAudit({
      action: active ? 'POLICY_GLOBAL_LOCKDOWN_ENABLED' : 'POLICY_GLOBAL_LOCKDOWN_DISABLED',
      actorId,
      clientIp,
      reason: effReason,
    });
  }

  /**
   * Habilita ou desabilita regra granular para uma tupla (database, collection, action, tenant)
   */
  setRuleActive({ databaseId, collectionId, action, tenantId, allowedRoles, enabled, actorId, clientIp, reason }) {
    if (databaseId === 'crm_db' && process.env.ENABLE_PROD_POLICY_MUTATION !== 'true') {
      throw new Error('[PROD_GUARD] Mutações dinâmicas de regras no banco de produção (crm_db) estão bloqueadas por segurança. Homologue as regras no banco de testes (crm_isolated_test) ou solicite liberação.');
    }

    if (!databaseId || !collectionId || !action || !tenantId) {
      throw new Error('[POLICY_MUTATION_ERROR] databaseId, collectionId, action e tenantId são obrigatórios.');
    }

    if (!['create', 'update', 'delete', 'signContract'].includes(action)) {
      throw new Error(`[POLICY_MUTATION_ERROR] Ação inválida "${action}". Permitidas: create, update, delete, signContract.`);
    }

    if (enabled === false) {
      const idx = this.rules.findIndex(
        r => r.databaseId === databaseId && r.collectionId === collectionId && r.action === action && r.tenantId === tenantId
      );
      if (idx !== -1) {
        const removed = this.rules.splice(idx, 1)[0];
        const audit = this.recordAdminAudit({
          action: 'POLICY_RULE_REVOKED',
          actorId,
          clientIp,
          targetDatabase: databaseId,
          targetCollection: collectionId,
          targetTenant: tenantId,
          details: { action, ruleId: removed.id, allowedRoles: removed.allowedRoles },
          reason: reason || `Regra revogada para ${action}`,
        });
        return { success: true, enabled: false, ruleId: removed.id, audit };
      }
      return { success: true, enabled: false, message: 'Nenhuma regra correspondente ativa encontrada para revogar.' };
    }

    // enabled === true
    const ruleId = `rule_${databaseId}_${collectionId}_${action}_${tenantId}`;
    const roles = Array.isArray(allowedRoles) && allowedRoles.length > 0 ? allowedRoles : ['admin', 'superadmin', 'agent'];
    const newRule = {
      id: ruleId,
      databaseId,
      collectionId,
      action,
      tenantId,
      allowedRoles: roles,
      maxPayloadBytes: 256 * 1024,
      forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
    };

    validatePolicyConfiguration([newRule]);

    // Remove regra anterior se existir
    this.rules = this.rules.filter(
      r => !(r.databaseId === databaseId && r.collectionId === collectionId && r.action === action && r.tenantId === tenantId)
    );
    this.rules.push(newRule);

    const audit = this.recordAdminAudit({
      action: 'POLICY_RULE_GRANTED',
      actorId,
      clientIp,
      targetDatabase: databaseId,
      targetCollection: collectionId,
      targetTenant: tenantId,
      details: { action, ruleId: newRule.id, allowedRoles: newRule.allowedRoles },
      reason: reason || `Regra concedida para ${action}`,
    });

    return { success: true, enabled: true, ruleId: newRule.id, rule: newRule, audit };
  }

  /**
   * Obtém o status operacional completo de um módulo específico
   */
  getModuleStatus(databaseId, collectionId, tenantId) {
    const isGlobal = Boolean(this.circuitBreaker.globalLockdown);
    const isPaused = this.circuitBreaker.moduleOverrides.has(collectionId);
    const pauseInfo = this.circuitBreaker.moduleOverrides.get(collectionId);

    const relevantRules = this.rules.filter(
      r => r.databaseId === databaseId && r.collectionId === collectionId && (!tenantId || r.tenantId === tenantId)
    );

    const checkAction = (act) => {
      const rule = relevantRules.find(r => r.action === act);
      return {
        allowed: Boolean(rule),
        roles: rule ? [...rule.allowedRoles] : [],
        ruleId: rule ? rule.id : undefined,
      };
    };

    const actions = {
      create: checkAction('create'),
      update: checkAction('update'),
      delete: checkAction('delete'),
    };

    let status = 'LOCKED';
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
      status, // 'ACTIVE' | 'CIRCUIT_PAUSED' | 'LOCKED' | 'GLOBAL_LOCKDOWN'
      isPaused,
      pauseReason: pauseInfo ? pauseInfo.reason : null,
      actions,
      rulesCount: relevantRules.length,
    };
  }

  /**
   * Obtém visão geral de todos os módulos conhecidos do sistema
   */
  getAllModulesStatus(databaseId, tenantId) {
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
 * Regras Ativas do Piloto do Módulo Clientes em Produção (Fase 5H.4)
 * Menor privilégio estrito: apenas create e update para tenant_default.
 * Deleção terminantemente PROIBIDA. Outras coleções terminantemente PROIBIDAS.
 */
const PROD_PILOT_CLIENTS_RULES = [
  {
    id: 'rule_prod_default_clients_create_admin',
    databaseId: 'crm_db',
    collectionId: 'clients',
    action: 'create',
    tenantId: 'tenant_default',
    allowedRoles: ['admin', 'superadmin'],
    maxPayloadBytes: 256 * 1024,
    forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
  },
  {
    id: 'rule_prod_default_clients_create_agent',
    databaseId: 'crm_db',
    collectionId: 'clients',
    action: 'create',
    tenantId: 'tenant_default',
    allowedRoles: ['agent'],
    maxPayloadBytes: 256 * 1024,
    forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
  },
  {
    id: 'rule_prod_default_clients_update_admin',
    databaseId: 'crm_db',
    collectionId: 'clients',
    action: 'update',
    tenantId: 'tenant_default',
    allowedRoles: ['admin', 'superadmin'],
    maxPayloadBytes: 256 * 1024,
    forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
  },
  {
    id: 'rule_prod_default_clients_update_agent',
    databaseId: 'crm_db',
    collectionId: 'clients',
    action: 'update',
    tenantId: 'tenant_default',
    allowedRoles: ['agent'],
    maxPayloadBytes: 256 * 1024,
    forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions', 'tenant_id', '_is_canary_test'],
  },
];

/**
 * Especificação Completa do Piloto (incluindo especificação inativa de delete para referência futura)
 */
const PROD_PILOT_CLIENTS_SPECIFICATION = [
  ...PROD_PILOT_CLIENTS_RULES,
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

const PROD_CLIENTS_RULES = PROD_PILOT_CLIENTS_RULES;

module.exports = {
  WritePolicyEngine,
  CircuitBreaker,
  validatePolicyConfiguration,
  maskPiiValue,
  sanitizePayloadForAudit,
  maskIp,
  createAuditLog,
  KNOWN_MODULES,
  SANDBOX_PILOT_CLIENTS_RULES,
  PROD_PILOT_CLIENTS_RULES,
  PROD_CLIENTS_RULES,
  PROD_PILOT_CLIENTS_SPECIFICATION,
};

