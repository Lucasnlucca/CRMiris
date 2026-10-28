/**
 * ============================================================================
 * FASE 6.2 & 6.4 — WRITE POLICY ENGINE (SERVER-SIDE CJS)
 * ============================================================================
 * Motor Declarativo de Políticas de Escrita (Write Policy Engine) com:
 * - Feature Flags Hierárquicas (Global -> Módulo -> Tenant)
 * - Modos de Execução: 'shadow' | 'enforce' | 'off'
 * - Kill-Switch Administrativo e Disjuntor (Circuit Breaker) F37
 * - Imutabilidade e proteção de evidências de assinatura de contratos (S08)
 * - Cobertura completa de coleções operacionais e RBAC (F08)
 * ============================================================================
 */

const VALID_MODES = ['shadow', 'enforce', 'off'];

const COLLECTION_MODULE_MAP = {
    leads: 'commercial',
    test_leads: 'commercial',
    clients: 'commercial',
    test_clients: 'commercial',
    opportunities: 'commercial',
    test_opportunities: 'commercial',
    proposals: 'commercial',
    test_proposals: 'commercial',
    proposal_items: 'commercial',
    crm_proposal_items: 'commercial',
    contracts: 'contracts',
    test_contracts: 'contracts',
    charges: 'financial',
    test_charges: 'financial',
    invoices: 'financial',
    test_invoices: 'financial',
    transactions: 'financial',
    financial_transactions: 'financial',
    support_tickets: 'support',
    test_support_tickets: 'support',
    tickets: 'support',
    kb_articles: 'support',
    client_documents: 'support',
    projects: 'operations',
    test_projects: 'operations',
    tasks: 'operations',
    test_tasks: 'operations',
    servers: 'operations',
    pbx_lines: 'operations',
    cloud_instances: 'operations',
    service_Catalog: 'operations',
    pipeline_activities: 'pipeline',
    pipeline_comments: 'pipeline',
    pipeline_checklist: 'pipeline',
    notifications: 'notifications',
    tenants: 'governance',
    test_tenants: 'governance',
    users_hydra: 'governance',
    test_users_hydra: 'governance',
    audit_logs: 'governance',
    test_audit_logs: 'governance',
    integration_configs: 'governance'
};

const KNOWN_MODULES = ['commercial', 'contracts', 'financial', 'support', 'operations', 'pipeline', 'notifications', 'governance'];

/**
 * S08: Contract signature fields that can NEVER be set or mutated via generic CRUD.
 */
const CONTRACT_SIGNATURE_FORBIDDEN_FIELDS = [
    'signed_at',
    'signed_by_name',
    'signed_by_document',
    'signed_by_email',
    'signed_by_role',
    'signed_by_phone',
    'signed_ip',
    'signed_by_ip',
    'signature_hash',
    'document_hash',
    'content_hash',
    'certificate_hash',
    'legal_audit_trail',
    'signature_evidence',
    'signature_token',
    'signature_token_hash'
];

/**
 * C2 Remediation: Strictly exclude 'viewer' from default write roles.
 */
const DEFAULT_ALLOWED_ROLES = ['owner', 'admin', 'member', 'comercial', 'finance', 'financial', 'support', 'operacional', 'agent', 'manager'];

const DEFAULT_COLLECTION_RULES = {
    leads: {
        module: 'commercial',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'comercial', 'member', 'manager'],
        requiredOnCreate: ['name'],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    test_leads: {
        module: 'commercial',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'comercial', 'member', 'manager'],
        requiredOnCreate: ['name'],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    clients: {
        module: 'commercial',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'comercial', 'finance', 'financial', 'support', 'member', 'manager'],
        requiredOnCreate: ['name'],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    test_clients: {
        module: 'commercial',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'comercial', 'finance', 'financial', 'support', 'member', 'manager'],
        requiredOnCreate: ['name'],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    contracts: {
        module: 'contracts',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'comercial', 'finance', 'financial', 'member', 'manager'],
        requiredOnCreate: [],
        forbiddenFields: [
            '$id',
            '$createdAt',
            '$updatedAt',
            '$permissions',
            ...CONTRACT_SIGNATURE_FORBIDDEN_FIELDS
        ]
    },
    test_contracts: {
        module: 'contracts',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'comercial', 'finance', 'financial', 'member', 'manager'],
        requiredOnCreate: [],
        forbiddenFields: [
            '$id',
            '$createdAt',
            '$updatedAt',
            '$permissions',
            ...CONTRACT_SIGNATURE_FORBIDDEN_FIELDS
        ]
    },
    charges: {
        module: 'financial',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'finance', 'financial', 'comercial', 'member', 'manager'],
        requiredOnCreate: [],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    test_charges: {
        module: 'financial',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'finance', 'financial', 'comercial', 'member', 'manager'],
        requiredOnCreate: [],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    support_tickets: {
        module: 'support',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'support', 'operacional', 'comercial', 'member', 'agent', 'manager'],
        requiredOnCreate: ['title'],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    test_support_tickets: {
        module: 'support',
        requireTenant: true,
        allowedRoles: ['owner', 'admin', 'support', 'operacional', 'comercial', 'member', 'agent', 'manager'],
        requiredOnCreate: ['title'],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    pipeline_activities: {
        module: 'pipeline',
        requireTenant: true,
        allowedRoles: DEFAULT_ALLOWED_ROLES,
        requiredOnCreate: [],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    pipeline_comments: {
        module: 'pipeline',
        requireTenant: true,
        allowedRoles: DEFAULT_ALLOWED_ROLES,
        requiredOnCreate: [],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    pipeline_checklist: {
        module: 'pipeline',
        requireTenant: true,
        allowedRoles: DEFAULT_ALLOWED_ROLES,
        requiredOnCreate: [],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    notifications: {
        module: 'notifications',
        requireTenant: true,
        allowedRoles: DEFAULT_ALLOWED_ROLES,
        requiredOnCreate: [],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    proposal_items: {
        module: 'commercial',
        requireTenant: true,
        allowedRoles: DEFAULT_ALLOWED_ROLES,
        requiredOnCreate: [],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    },
    crm_proposal_items: {
        module: 'commercial',
        requireTenant: true,
        allowedRoles: DEFAULT_ALLOWED_ROLES,
        requiredOnCreate: [],
        forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
    }
};

/**
 * F37: Circuit Breaker implementation that tracks 5xx/timeout/latency infrastructure
 * failures (explicitly ignoring 4xx client/business errors) and supports CLOSED -> OPEN -> HALF_OPEN -> CLOSED.
 */
class CircuitBreaker {
    constructor(options = {}) {
        this.maxConsecutiveFailures = options.maxConsecutiveFailures || 5;
        this.maxLatencyMs = options.maxLatencyMs || 2500;
        this.cooldownMs = options.cooldownMs || 30000;
        this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
        this.consecutiveFailures = 0;
        this.trippedAt = null;
        this.tripReason = null;
    }

    canPass() {
        if (this.state === 'CLOSED') return true;
        if (this.state === 'OPEN') {
            const elapsed = Date.now() - new Date(this.trippedAt).getTime();
            if (elapsed >= this.cooldownMs) {
                this.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }
        return true; // HALF_OPEN allows probe request
    }

    recordSuccess(durationMs = 0) {
        if (typeof durationMs === 'number' && durationMs > this.maxLatencyMs) {
            return this.recordFailure(
                new Error(`Latência de escrita (${durationMs}ms) excedeu o limite máximo (${this.maxLatencyMs}ms).`),
                durationMs
            );
        }

        const wasHalfOpen = this.state === 'HALF_OPEN';
        this.consecutiveFailures = 0;
        if (wasHalfOpen) {
            this.state = 'CLOSED';
            this.trippedAt = null;
            this.tripReason = null;
        }
        return {
            transitioned: wasHalfOpen,
            state: this.state,
            consecutiveFailures: this.consecutiveFailures
        };
    }

    recordFailure(errOrReason, durationMs = 0) {
        let statusCode = null;
        if (typeof errOrReason === 'number') {
            statusCode = errOrReason;
        } else if (errOrReason && typeof errOrReason === 'object') {
            const candidate = errOrReason.statusCode ?? errOrReason.status ?? errOrReason.code;
            if (typeof candidate === 'number') {
                statusCode = candidate;
            }
        }

        // F37: Never trip circuit breaker on 4xx client/validation/authorization errors
        if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
            return {
                tripped: false,
                ignored: true,
                reason: 'CLIENT_4XX_ERROR',
                state: this.state,
                consecutiveFailures: this.consecutiveFailures
            };
        }

        this.consecutiveFailures += 1;
        const reasonStr = typeof errOrReason === 'string'
            ? errOrReason
            : (errOrReason && errOrReason.message) || `Infrastructure failure (status ${statusCode || 'unknown'}, ${durationMs}ms)`;

        if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.maxConsecutiveFailures) {
            this.state = 'OPEN';
            this.trippedAt = new Date().toISOString();
            this.tripReason = reasonStr;
            return {
                tripped: true,
                state: this.state,
                consecutiveFailures: this.consecutiveFailures,
                tripReason: this.tripReason
            };
        }

        return {
            tripped: false,
            state: this.state,
            consecutiveFailures: this.consecutiveFailures
        };
    }

    recordAuthBreach(reason = 'AUTH_BREACH_403') {
        return {
            tripped: false,
            ignored: true,
            reason,
            state: this.state,
            consecutiveFailures: this.consecutiveFailures
        };
    }

    check(collectionId, action) {
        const pass = this.canPass();
        return {
            allowed: pass,
            state: this.state,
            reason: pass ? null : this.tripReason
        };
    }

    reset() {
        this.state = 'CLOSED';
        this.consecutiveFailures = 0;
        this.trippedAt = null;
        this.tripReason = null;
    }

    getStatus() {
        this.canPass();
        return {
            state: this.state,
            consecutiveFailures: this.consecutiveFailures,
            trippedAt: this.trippedAt,
            tripReason: this.tripReason,
            thresholds: {
                maxConsecutiveFailures: this.maxConsecutiveFailures,
                maxLatencyMs: this.maxLatencyMs,
                cooldownMs: this.cooldownMs
            }
        };
    }
}

class WritePolicyEngine {
    constructor(rulesOrOptions = {}, maybeOptions = {}) {
        const resolvedOptions = (Array.isArray(rulesOrOptions) || typeof rulesOrOptions !== 'object')
            ? (maybeOptions || {})
            : rulesOrOptions;
        const initialMode = resolvedOptions.mode || process.env.WRITE_POLICY_MODE || 'enforce';
        this.mode = VALID_MODES.includes(initialMode) ? initialMode : 'enforce';
        this.killSwitchActive = false;
        this.killSwitchReason = null;
        this.killSwitchActor = null;
        this.killSwitchActivatedAt = null;

        this.flags = {
            global: resolvedOptions.globalEnabled !== undefined ? Boolean(resolvedOptions.globalEnabled) : true,
            modules: {
                commercial: true,
                contracts: true,
                financial: true,
                support: true,
                operations: true,
                pipeline: true,
                notifications: true,
                governance: true,
                ...(resolvedOptions.moduleFlags || {})
            },
            tenants: {
                ...(resolvedOptions.tenantFlags || {})
            }
        };

        this.circuitBreaker = new CircuitBreaker(resolvedOptions.circuitBreaker || {});

        this.metrics = {
            totalEvaluations: 0,
            allowed: 0,
            shadowWarnings: 0,
            enforcedRejections: 0,
            bypassedByKillSwitch: 0,
            bypassedByCircuitBreaker: 0,
            bypassedByFeatureFlag: 0,
            byCollection: {},
            byReasonCode: {}
        };

        this.recentEvents = [];
        this.governanceAuditLog = [];
    }

    _logGovernanceChange(action, actor, reason, details, targetDatabase = 'unknown') {
        const entry = {
            id: `gov_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: new Date().toISOString(),
            action,
            actor: actor || 'system',
            reason: reason || 'No reason provided',
            targetDatabase,
            details
        };
        this.governanceAuditLog.unshift(entry);
        if (this.governanceAuditLog.length > 200) {
            this.governanceAuditLog.pop();
        }
        return entry;
    }

    setRuleActive(rule = {}) {
        const collectionId = rule.collectionId;
        if (collectionId) {
            DEFAULT_COLLECTION_RULES[collectionId] = {
                ...(DEFAULT_COLLECTION_RULES[collectionId] || {}),
                module: COLLECTION_MODULE_MAP[collectionId] || 'operations',
                requireTenant: true,
                allowedRoles: rule.allowedRoles || DEFAULT_ALLOWED_ROLES,
                requiredOnCreate: DEFAULT_COLLECTION_RULES[collectionId]?.requiredOnCreate || [],
                forbiddenFields: DEFAULT_COLLECTION_RULES[collectionId]?.forbiddenFields || ['$id', '$createdAt', '$updatedAt', '$permissions']
            };
        }
        return true;
    }

    setMode(newMode, actor = 'admin', reason = 'Administrative mode change', targetDatabase = 'unknown') {
        if (!VALID_MODES.includes(newMode)) {
            throw new Error(`Invalid mode '${newMode}'. Valid modes: ${VALID_MODES.join(', ')}`);
        }
        const prevMode = this.mode;
        this.mode = newMode;
        return this._logGovernanceChange('SET_MODE', actor, reason, { previousMode: prevMode, newMode }, targetDatabase);
    }

    setFeatureFlag(scope, key, enabled, actor = 'admin', reason = 'Feature flag update', targetDatabase = 'unknown') {
        const boolVal = Boolean(enabled);
        if (scope === 'global') {
            const prev = this.flags.global;
            this.flags.global = boolVal;
            return this._logGovernanceChange('SET_FLAG_GLOBAL', actor, reason, { previous: prev, enabled: boolVal }, targetDatabase);
        }
        if (scope === 'module') {
            if (!KNOWN_MODULES.includes(key)) {
                throw new Error(`Unknown module '${key}'. Valid modules: ${KNOWN_MODULES.join(', ')}`);
            }
            const prev = this.flags.modules[key];
            this.flags.modules[key] = boolVal;
            return this._logGovernanceChange('SET_FLAG_MODULE', actor, reason, { module: key, previous: prev, enabled: boolVal }, targetDatabase);
        }
        if (scope === 'tenant') {
            if (!key || typeof key !== 'string') {
                throw new Error('Tenant key must be a non-empty string.');
            }
            const prev = this.flags.tenants[key];
            this.flags.tenants[key] = boolVal;
            return this._logGovernanceChange('SET_FLAG_TENANT', actor, reason, { tenantId: key, previous: prev, enabled: boolVal }, targetDatabase);
        }
        throw new Error(`Invalid flag scope '${scope}'. Valid scopes: global, module, tenant`);
    }

    activateKillSwitch(actor = 'admin', reason = 'Emergency rollback activated', targetDatabase = 'unknown') {
        this.killSwitchActive = true;
        this.killSwitchActor = actor;
        this.killSwitchReason = reason;
        this.killSwitchActivatedAt = new Date().toISOString();
        return this._logGovernanceChange('ACTIVATE_KILL_SWITCH', actor, reason, { active: true }, targetDatabase);
    }

    deactivateKillSwitch(actor = 'admin', reason = 'Normal operations restored', targetDatabase = 'unknown') {
        this.killSwitchActive = false;
        this.killSwitchActor = actor;
        this.killSwitchReason = reason;
        this.killSwitchActivatedAt = null;
        return this._logGovernanceChange('DEACTIVATE_KILL_SWITCH', actor, reason, { active: false }, targetDatabase);
    }

    resetCircuitBreaker(actor = 'admin', reason = 'Manual circuit breaker reset', targetDatabase = 'unknown') {
        const prevState = this.circuitBreaker.getStatus();
        this.circuitBreaker.reset();
        return this._logGovernanceChange('RESET_CIRCUIT_BREAKER', actor, reason, { previousState: prevState.state }, targetDatabase);
    }

    /**
     * F37: Records a successful write execution and its duration in milliseconds.
     */
    recordSuccess(durationMs = 0, targetDatabase = 'unknown') {
        const res = this.circuitBreaker.recordSuccess(durationMs);
        if (res.transitioned) {
            this._logGovernanceChange('CIRCUIT_BREAKER_RECOVERED', 'system', 'Probe write succeeded in HALF_OPEN', { durationMs }, targetDatabase);
        }
        return res;
    }

    /**
     * F37: Records a write execution failure. Only 5xx/network/latency errors count towards tripping.
     */
    recordFailure(errOrReason, durationMs = 0, targetDatabase = 'unknown') {
        const res = this.circuitBreaker.recordFailure(errOrReason, durationMs);
        if (res.tripped) {
            this._logGovernanceChange('CIRCUIT_BREAKER_TRIPPED', 'system', res.tripReason || 'Consecutive infrastructure failures', {
                consecutiveFailures: res.consecutiveFailures,
                durationMs
            }, targetDatabase);
        }
        return res;
    }

    isActiveFor(collectionId, tenantId) {
        if (this.killSwitchActive) {
            return { active: false, bypassReason: 'KILL_SWITCH_ACTIVE' };
        }
        if (this.mode === 'off') {
            return { active: false, bypassReason: 'MODE_OFF' };
        }
        if (!this.circuitBreaker.canPass()) {
            return { active: false, bypassReason: 'CIRCUIT_BREAKER_OPEN' };
        }
        if (!this.flags.global) {
            return { active: false, bypassReason: 'GLOBAL_FLAG_DISABLED' };
        }
        const moduleName = COLLECTION_MODULE_MAP[collectionId] || 'operations';
        if (this.flags.modules[moduleName] === false) {
            return { active: false, bypassReason: `MODULE_FLAG_DISABLED:${moduleName}` };
        }
        if (tenantId && this.flags.tenants[tenantId] === false) {
            return { active: false, bypassReason: `TENANT_FLAG_DISABLED:${tenantId}` };
        }
        return { active: true, bypassReason: null, moduleName };
    }

    evaluate(context) {
        this.metrics.totalEvaluations += 1;
        const collectionId = context.collectionId;
        const operation = context.operation || context.action || 'create';
        const tenantId = context.tenantId;
        const userId = context.userId;
        const roles = context.roles || context.userRoles || [];
        const isSuperAdmin = Boolean(context.isSuperAdmin);
        const payload = context.payload || context.data || {};
        const existingDocument = context.existingDocument || null;

        if (!this.metrics.byCollection[collectionId]) {
            this.metrics.byCollection[collectionId] = { allowed: 0, warnings: 0, rejected: 0 };
        }

        const activation = this.isActiveFor(collectionId, tenantId);
        if (!activation.active && activation.bypassReason !== 'MODE_OFF') {
            const isKillSwitch = activation.bypassReason === 'KILL_SWITCH_ACTIVE';
            const isCircuitBreaker = activation.bypassReason === 'CIRCUIT_BREAKER_OPEN';

            if (isKillSwitch) this.metrics.bypassedByKillSwitch += 1;
            else if (isCircuitBreaker) this.metrics.bypassedByCircuitBreaker += 1;
            else this.metrics.bypassedByFeatureFlag += 1;

            this.metrics.enforcedRejections += 1;
            const blockReason = isKillSwitch
                ? 'Operação bloqueada: Lockdown Global ativado (Kill-Switch).'
                : (isCircuitBreaker
                    ? 'Operação bloqueada: Disjuntor aberto devido a falhas consecutivas de infraestrutura.'
                    : `Operação bloqueada: Módulo desabilitado por flag (${activation.bypassReason}).`);
            return {
                allowed: false,
                enforced: true,
                mode: this.mode,
                bypassReason: activation.bypassReason,
                reason: blockReason,
                violations: [{
                    code: activation.bypassReason,
                    message: blockReason
                }]
            };
        }

        const rule = DEFAULT_COLLECTION_RULES[collectionId] || {
            module: COLLECTION_MODULE_MAP[collectionId] || 'operations',
            requireTenant: true,
            allowedRoles: DEFAULT_ALLOWED_ROLES,
            requiredOnCreate: [],
            forbiddenFields: ['$id', '$createdAt', '$updatedAt', '$permissions']
        };

        const violations = [];

        if (!userId) {
            violations.push({
                code: 'UNAUTHENTICATED_ACTOR',
                message: 'Mutação sem identificação de usuário autenticado.'
            });
        }

        if (rule.requireTenant && !tenantId && !isSuperAdmin) {
            violations.push({
                code: 'MISSING_TENANT_CONTEXT',
                message: `A coleção '${collectionId}' exige contexto de tenant_id válido.`
            });
        }

        if (!isSuperAdmin) {
            const normalizedRoles = roles.map(r => String(r).toLowerCase());
            const hasAllowedRole = normalizedRoles.some(r => rule.allowedRoles.includes(r));
            if (!hasAllowedRole) {
                violations.push({
                    code: 'ROLE_NOT_AUTHORIZED_FOR_WRITE',
                    message: `Operação não autorizada pela matriz de menor privilégio: Perfil (${roles.join(', ') || 'none'}) não possui permissão de escrita para '${operation}' em '${collectionId}'.`
                });
            }
        }

        const isContractCollection = collectionId === 'contracts' || collectionId === 'test_contracts' || collectionId === 'crm_contracts' || collectionId === 'test_crm_contracts';

        if (operation === 'create' || operation === 'update') {
            if (operation === 'create' && Array.isArray(rule.requiredOnCreate)) {
                for (const reqField of rule.requiredOnCreate) {
                    const val = payload[reqField];
                    if (val === undefined || val === null || String(val).trim() === '') {
                        violations.push({
                            code: 'MISSING_REQUIRED_FIELD',
                            field: reqField,
                            message: `Campo obrigatório '${reqField}' ausente na criação em '${collectionId}'.`
                        });
                    }
                }
            }

            if (Array.isArray(rule.forbiddenFields) && payload && typeof payload === 'object') {
                for (const forbidden of rule.forbiddenFields) {
                    if (Object.prototype.hasOwnProperty.call(payload, forbidden) && payload[forbidden] !== undefined) {
                        violations.push({
                            code: 'FORBIDDEN_PAYLOAD_FIELD',
                            field: forbidden,
                            message: `O campo protegido '${forbidden}' não pode ser definido ou alterado diretamente via CRUD em '${collectionId}'.`
                        });
                    }
                }
            }

            // S08: Block setting contract status to 'signed' / 'Assinado' via CRUD
            if (isContractCollection && payload && payload.status) {
                const statusLower = String(payload.status).trim().toLowerCase();
                if (statusLower === 'signed' || statusLower === 'assinado') {
                    violations.push({
                        code: 'FORBIDDEN_CONTRACT_SIGNATURE_STATUS',
                        field: 'status',
                        message: 'Assinatura de contrato só pode ser realizada através do endpoint público autenticado (/api/contracts/sign).'
                    });
                }
            }

            if (payload && payload.tenant_id && tenantId && payload.tenant_id !== tenantId && !isSuperAdmin) {
                violations.push({
                    code: 'CROSS_TENANT_PAYLOAD_INJECTION',
                    message: `Tentativa de gravar tenant_id ('${payload.tenant_id}') divergente do tenant ativo ('${tenantId}').`
                });
            }
        }

        // S08: Block updating or deleting an already-signed contract via CRUD
        if (isContractCollection && (operation === 'update' || operation === 'delete') && existingDocument) {
            const existingStatus = String(existingDocument.status || '').trim().toLowerCase();
            if (existingStatus === 'signed' || existingStatus === 'assinado' || existingDocument.signed_at) {
                violations.push({
                    code: 'CONTRACT_IMMUTABLE_SIGNED',
                    message: 'Contratos já assinados são imutáveis e não podem ser alterados ou excluídos via CRUD.'
                });
            }
        }

        if (violations.length === 0) {
            this.metrics.allowed += 1;
            this.metrics.byCollection[collectionId].allowed += 1;
            return {
                allowed: true,
                enforced: this.mode === 'enforce',
                mode: this.mode,
                violations: []
            };
        }

        for (const v of violations) {
            this.metrics.byReasonCode[v.code] = (this.metrics.byReasonCode[v.code] || 0) + 1;
        }

        const hasSecurityInvariantViolation = violations.some(v =>
            v.code === 'ROLE_NOT_AUTHORIZED_FOR_WRITE' ||
            v.code === 'UNAUTHENTICATED_ACTOR' ||
            v.code === 'CROSS_TENANT_PAYLOAD_INJECTION' ||
            v.code === 'CONTRACT_IMMUTABLE_SIGNED' ||
            v.code === 'FORBIDDEN_CONTRACT_SIGNATURE_FIELD' ||
            v.code === 'FORBIDDEN_CONTRACT_SIGNATURE_STATUS'
        );

        const shouldBlock = this.mode === 'enforce' || hasSecurityInvariantViolation;
        if (shouldBlock) {
            this.metrics.enforcedRejections += 1;
            this.metrics.byCollection[collectionId].rejected += 1;
        } else {
            this.metrics.shadowWarnings += 1;
            this.metrics.byCollection[collectionId].warnings += 1;
        }

        const eventRecord = {
            timestamp: new Date().toISOString(),
            mode: this.mode,
            blocked: shouldBlock,
            collectionId,
            operation,
            tenantId,
            userId,
            violations
        };
        this.recentEvents.unshift(eventRecord);
        if (this.recentEvents.length > 50) this.recentEvents.pop();

        return {
            allowed: !shouldBlock,
            enforced: shouldBlock,
            mode: this.mode,
            reason: violations.length > 0 ? violations[0].message : null,
            violations
        };
    }

    exportGovernanceState(targetDatabase = 'crm_db') {
        return {
            engineVersion: '6.4.0',
            targetDatabase,
            mode: this.mode,
            killSwitch: {
                active: this.killSwitchActive,
                actor: this.killSwitchActor,
                reason: this.killSwitchReason,
                activatedAt: this.killSwitchActivatedAt
            },
            flags: {
                global: this.flags.global,
                modules: { ...this.flags.modules },
                tenants: { ...this.flags.tenants }
            },
            circuitBreaker: this.circuitBreaker.getStatus(),
            metrics: this.metrics,
            recentEvents: this.recentEvents.slice(0, 20),
            governanceAuditLog: this.governanceAuditLog.slice(0, 50)
        };
    }
}

module.exports = {
    WritePolicyEngine,
    CircuitBreaker,
    COLLECTION_MODULE_MAP,
    DEFAULT_COLLECTION_RULES,
    DEFAULT_ALLOWED_ROLES,
    CONTRACT_SIGNATURE_FORBIDDEN_FIELDS,
    KNOWN_MODULES,
    VALID_MODES
};
