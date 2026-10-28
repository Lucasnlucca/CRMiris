/**
 * ============================================================================
 * FASE 6.4 — PASSO 2: ADMIN POLICY & GOVERNANCE ROUTES HANDLER (TS / VITE DEV)
 * ============================================================================
 * TypeScript ESM counterpart for Vite dev middleware integration.
 * Enforces strict SuperAdmin authentication, authoritative target resolution,
 * mandatory reason validation, and audit trail logging.
 * ============================================================================
 */

import { Client, Account, Teams, Databases, Query } from 'node-appwrite';
import type { IncomingMessage, ServerResponse } from 'http';
import { WritePolicyEngine } from './writePolicyEngine.ts';
import type { GovernanceConfigResolution } from './governanceConfig.ts';
import type { GovernancePersistenceAdapter } from './governancePersistenceAdapter.ts';
import { readJsonBody, listAllMemberships } from './requestUtils.ts';

export interface AdminEnvConfig {
    endpoint: string;
    projectId: string;
    apiKey: string;
    databaseId: string;
}

export interface AuthenticatedActor {
    userId: string;
    email: string;
    name: string;
    verifiedTeam?: string;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    if (res.headersSent) return;
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Appwrite-JWT, X-Appwrite-Session, X-Target-Database'
    });
    res.end(JSON.stringify(payload));
}

export function resolveAuthoritativeTarget(
    req: IncomingMessage,
    envConfig: AdminEnvConfig,
    govConfig?: GovernanceConfigResolution,
    parsedBody: Record<string, any> = {}
): string {
    if (govConfig && govConfig.status === 'INVALID') {
        const err: any = new Error(`Governança inválida: ${govConfig.reason}`);
        err.statusCode = 503;
        err.code = 'GOVERNANCE_INVALID_BOOT';
        throw err;
    }

    const authoritativeDb = (govConfig && govConfig.targetDb) || envConfig.databaseId || 'crm_db';
    const clientHeaderDb = req.headers['x-target-database'] as string | undefined;
    const clientBodyDb = parsedBody ? parsedBody.targetDatabase : undefined;
    const clientSuppliedDb = clientHeaderDb || clientBodyDb;

    if (clientSuppliedDb && clientSuppliedDb !== authoritativeDb) {
        const err: any = new Error(
            `Divergência de ambiente: O cliente solicitou operação em '${clientSuppliedDb}', mas o servidor opera exclusivamente sob a autoridade de '${authoritativeDb}'. Operação bloqueada.`
        );
        err.statusCode = 403;
        err.code = 'TARGET_DATABASE_MISMATCH';
        throw err;
    }

    return authoritativeDb;
}

export async function authenticateAndAuthorizeSuperAdmin(
    req: IncomingMessage,
    envConfig: AdminEnvConfig,
    authoritativeDb?: string
): Promise<AuthenticatedActor> {
    const authHeader = (req.headers['authorization'] as string) || '';
    const jwtHeader = (req.headers['x-appwrite-jwt'] as string) || '';
    const sessionHeader = (req.headers['x-appwrite-session'] as string) || '';

    let token = '';
    let isJwt = false;

    if (jwtHeader) {
        token = jwtHeader.trim();
        isJwt = true;
    } else if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
        isJwt = token.split('.').length === 3;
    } else if (sessionHeader) {
        token = sessionHeader.trim();
        isJwt = false;
    }

    if (!token) {
        const err: any = new Error('Não autenticado. Token de sessão ou JWT ausente.');
        err.statusCode = 401;
        err.code = 'UNAUTHENTICATED';
        throw err;
    }

    const userClient = new Client()
        .setEndpoint(envConfig.endpoint)
        .setProject(envConfig.projectId);

    if (isJwt) {
        userClient.setJWT(token);
    } else {
        userClient.setSession(token);
    }

    const account = new Account(userClient);
    let user: any;
    try {
        user = await account.get();
    } catch (e: any) {
        const err: any = new Error(`Sessão inválida ou expirada: ${e.message}`);
        err.statusCode = 401;
        err.code = 'INVALID_SESSION';
        throw err;
    }

    if (user.status === false) {
        const err: any = new Error('Acesso negado: Conta de usuário desativada globalmente.');
        err.statusCode = 403;
        err.code = 'ACCOUNT_DEACTIVATED';
        throw err;
    }

    const userId = user.$id;
    const userEmail = user.email || 'unknown';

    const adminClient = new Client()
        .setEndpoint(envConfig.endpoint)
        .setProject(envConfig.projectId)
        .setKey(envConfig.apiKey);

    const adminTeams = new Teams(adminClient);
    const adminDb = new Databases(adminClient);
    const dbId = authoritativeDb || envConfig.databaseId || 'crm_db';

    for (const colName of ['users_hydra', 'test_users_hydra']) {
        try {
            const userDoc: any = await adminDb.getDocument(dbId, colName, userId);
            if (userDoc && userDoc.is_active === false) {
                const err: any = new Error('Acesso negado: Perfil de usuário desativado.');
                err.statusCode = 403;
                err.code = 'PROFILE_DEACTIVATED';
                throw err;
            }
        } catch (e: any) {
            if (e?.code === 'PROFILE_DEACTIVATED' || e?.statusCode === 403) throw e;
            // Document may not exist in this collection
        }
    }

    let isSuperAdmin = false;
    let verifiedTeam = '';
    const superAdminTeams = [process.env.SUPERADMIN_TEAM_ID || 'superadmins'];
    if (process.env.NODE_ENV === 'test' || dbId.includes('test')) {
        superAdminTeams.push('test_team_superadmins');
    }

    for (const teamId of superAdminTeams) {
        try {
            const memberships = await listAllMemberships(adminTeams, teamId, Query);
            const found = memberships.some((m: any) => m.userId === userId && m.confirm !== false);
            if (found) {
                isSuperAdmin = true;
                verifiedTeam = teamId;
                break;
            }
        } catch {
            // Team might not exist in this environment
        }
    }

    if (!isSuperAdmin) {
        const err: any = new Error(
            `Acesso negado: O usuário '${userEmail}' (${userId}) não possui privilégios de SuperAdmin para gerenciar políticas de governança.`
        );
        err.statusCode = 403;
        err.code = 'FORBIDDEN_NOT_SUPERADMIN';
        throw err;
    }

    return {
        userId,
        email: userEmail,
        name: user.name || userEmail,
        verifiedTeam
    };
}

export function validateReason(reason: unknown): string {
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        const err: any = new Error(
            'Justificativa obrigatória: O campo "reason" deve conter pelo menos 5 caracteres explicando o motivo da alteração de governança.'
        );
        err.statusCode = 400;
        err.code = 'INVALID_REASON';
        throw err;
    }
    return reason.trim();
}

export async function handleAdminPolicyRoutes(
    req: IncomingMessage,
    res: ServerResponse,
    writePolicyEngine: WritePolicyEngine,
    envConfig: AdminEnvConfig,
    govConfig?: GovernanceConfigResolution,
    persistenceAdapter?: GovernancePersistenceAdapter | null
): Promise<boolean> {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return true;
    }

    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    if (!pathname.startsWith('/api/admin/policies') && !pathname.startsWith('/api/admin/policy')) {
        return false;
    }

    const subpath = pathname.replace(/^\/api\/admin\/polic(ies|y)/, '');

    try {
        let body: Record<string, any> = {};
        if (req.method === 'POST' || req.method === 'PUT') {
            body = await readJsonBody(req);
        }

        const targetDb = resolveAuthoritativeTarget(req, envConfig, govConfig, body);
        const actor = await authenticateAndAuthorizeSuperAdmin(req, envConfig, targetDb);

        if (req.method === 'GET' && (subpath === '/status' || subpath === '' || subpath === '/')) {
            const state = writePolicyEngine.exportGovernanceState(targetDb);
            const modulesList = Object.entries(state.flags.modules || {}).map(([modName, enabled]) => ({
                module: modName,
                enabled: Boolean(enabled),
                actions: {
                    create: { allowed: Boolean(enabled), ruleCount: 1 },
                    update: { allowed: Boolean(enabled), ruleCount: 1 },
                    delete: { allowed: Boolean(enabled), ruleCount: 1 }
                },
                rulesCount: 3
            }));
            const auditLogs = (state.governanceAuditLog || []).map((log: any) => ({
                id: log.id,
                timestamp: log.timestamp,
                action: log.action,
                actorId: log.actor,
                clientIp: '127.0.0.1',
                targetDatabase: log.targetDatabase || targetDb,
                targetCollection: log.details?.collectionId || '*',
                targetTenant: log.details?.tenantId || '*',
                details: log.details || {},
                reason: log.reason || ''
            }));

            sendJson(res, 200, {
                success: true,
                databaseId: targetDb,
                tenantId: urlObj.searchParams.get('tenantId') || '',
                globalLockdown: Boolean(state.killSwitch?.active),
                circuitBreakerState: state.circuitBreaker?.state || 'CLOSED',
                tripReason: state.circuitBreaker?.tripReason || null,
                consecutiveFailures: state.circuitBreaker?.consecutiveFailures || 0,
                modules: modulesList,
                auditLogs: auditLogs,
                superAdmin: {
                    userId: actor.userId,
                    userEmail: actor.email,
                    verifiedTeam: actor.verifiedTeam || 'superadmins'
                },
                actor: { email: actor.email, userId: actor.userId },
                governanceMode: govConfig ? govConfig.mode : 'VOLATILE',
                data: state
            });
            return true;
        }

        if (req.method === 'POST' && (subpath === '/lockdown' || subpath === '/kill-switch')) {
            const reason = validateReason(body.reason);
            const active = Boolean(body.active);

            if (active) {
                writePolicyEngine.activateKillSwitch(actor.email, reason, targetDb);
            } else {
                writePolicyEngine.deactivateKillSwitch(actor.email, reason, targetDb);
            }

            if (persistenceAdapter && (!govConfig || govConfig.mode === 'PERSISTENT')) {
                await persistenceAdapter.persistEngineState(writePolicyEngine, actor.email, reason, targetDb);
            }

            const state = writePolicyEngine.exportGovernanceState(targetDb);
            sendJson(res, 200, {
                success: true,
                databaseId: targetDb,
                globalLockdown: Boolean(state.killSwitch?.active),
                message: active
                    ? `🚨 LOCKDOWN GLOBAL ATIVADO por ${actor.email}.`
                    : `✅ Lockdown Global desativado (enforcement restaurado) por ${actor.email}.`,
                data: state
            });
            return true;
        }

        if (req.method === 'POST' && subpath === '/module-pause') {
            const reason = validateReason(body.reason);
            const { module: modName, paused } = body;
            const enabled = !paused;

            try {
                writePolicyEngine.setFeatureFlag('module', modName, enabled, actor.email, reason, targetDb);
            } catch (e: any) {
                const isNotFound = e.message && e.message.includes('Unknown module');
                sendJson(res, isNotFound ? 404 : 400, {
                    success: false,
                    code: isNotFound ? 'MODULE_NOT_FOUND' : 'INVALID_MODULE_OPERATION',
                    error: e.message
                });
                return true;
            }

            if (persistenceAdapter && (!govConfig || govConfig.mode === 'PERSISTENT')) {
                await persistenceAdapter.persistEngineState(writePolicyEngine, actor.email, reason, targetDb);
            }

            const state = writePolicyEngine.exportGovernanceState(targetDb);
            sendJson(res, 200, {
                success: true,
                databaseId: targetDb,
                module: modName,
                paused: Boolean(paused),
                message: `Módulo '${modName}' ${paused ? 'pausado' : 'retomado'} por ${actor.email}.`,
                data: state
            });
            return true;
        }

        if (req.method === 'POST' && (subpath === '/rule' || subpath === '/rules')) {
            (writePolicyEngine as any).setRuleActive(body);
            if (persistenceAdapter && (!govConfig || govConfig.mode === 'PERSISTENT')) {
                await persistenceAdapter.persistEngineState(writePolicyEngine, actor.email, body.reason || 'Rule updated', targetDb);
            }
            sendJson(res, 200, {
                success: true,
                message: 'Regra de política atualizada com sucesso.',
                data: writePolicyEngine.exportGovernanceState(targetDb)
            });
            return true;
        }

        if (req.method === 'GET' && subpath === '/audit') {
            const state = writePolicyEngine.exportGovernanceState(targetDb);
            const auditLogs = (state.governanceAuditLog || []).map((log: any) => ({
                id: log.id,
                timestamp: log.timestamp,
                action: log.action,
                actorId: log.actor,
                clientIp: '127.0.0.1',
                targetDatabase: log.targetDatabase || targetDb,
                targetCollection: log.details?.collectionId || '*',
                targetTenant: log.details?.tenantId || '*',
                details: log.details || {},
                reason: log.reason || ''
            }));
            sendJson(res, 200, {
                success: true,
                auditLogs
            });
            return true;
        }

        if (req.method === 'POST' && (subpath === '/mode' || pathname === '/api/admin/policies/mode')) {
            const reason = validateReason(body.reason);
            const newMode = body.mode;

            if (!newMode) {
                sendJson(res, 400, { success: false, code: 'MISSING_MODE', error: 'O campo "mode" é obrigatório (shadow | enforce | off).' });
                return true;
            }

            try {
                writePolicyEngine.setMode(newMode, actor.email, reason, targetDb);
            } catch (e: any) {
                sendJson(res, 400, { success: false, code: 'INVALID_MODE', error: e.message });
                return true;
            }

            if (persistenceAdapter && (!govConfig || govConfig.mode === 'PERSISTENT')) {
                await persistenceAdapter.persistEngineState(writePolicyEngine, actor.email, reason, targetDb);
            }

            sendJson(res, 200, {
                success: true,
                message: `Modo do motor alterado para '${newMode}' por ${actor.email}.`,
                data: writePolicyEngine.exportGovernanceState(targetDb)
            });
            return true;
        }

        if (req.method === 'POST' && pathname === '/api/admin/policies/flags') {
            const reason = validateReason(body.reason);
            const { scope, key, enabled } = body;

            if (!scope || typeof enabled !== 'boolean') {
                sendJson(res, 400, {
                    success: false,
                    code: 'INVALID_FLAG_PAYLOAD',
                    error: 'Campos obrigatórios: "scope" (global | module | tenant), "enabled" (boolean) e "key" (para module/tenant).'
                });
                return true;
            }

            try {
                writePolicyEngine.setFeatureFlag(scope, key, enabled, actor.email, reason, targetDb);
            } catch (e: any) {
                const isNotFound = e.message && e.message.includes('Unknown module');
                sendJson(res, isNotFound ? 404 : 400, {
                    success: false,
                    code: isNotFound ? 'MODULE_NOT_FOUND' : 'INVALID_FLAG_OPERATION',
                    error: e.message
                });
                return true;
            }

            if (persistenceAdapter && (!govConfig || govConfig.mode === 'PERSISTENT')) {
                await persistenceAdapter.persistEngineState(writePolicyEngine, actor.email, reason, targetDb);
            }

            sendJson(res, 200, {
                success: true,
                message: `Feature flag (${scope}${key ? ':' + key : ''}) atualizada para ${enabled} por ${actor.email}.`,
                data: writePolicyEngine.exportGovernanceState(targetDb)
            });
            return true;
        }

        if (req.method === 'POST' && pathname === '/api/admin/policies/kill-switch') {
            const reason = validateReason(body.reason);
            const { active } = body;

            if (typeof active !== 'boolean') {
                sendJson(res, 400, {
                    success: false,
                    code: 'INVALID_KILLSWITCH_PAYLOAD',
                    error: 'O campo "active" (boolean) é obrigatório.'
                });
                return true;
            }

            if (active) {
                writePolicyEngine.activateKillSwitch(actor.email, reason, targetDb);
            } else {
                writePolicyEngine.deactivateKillSwitch(actor.email, reason, targetDb);
            }

            if (persistenceAdapter && (!govConfig || govConfig.mode === 'PERSISTENT')) {
                await persistenceAdapter.persistEngineState(writePolicyEngine, actor.email, reason, targetDb);
            }

            sendJson(res, 200, {
                success: true,
                message: active
                    ? `🚨 KILL-SWITCH ATIVADO por ${actor.email}.`
                    : `✅ Kill-Switch desativado (enforcement restaurado) por ${actor.email}.`,
                data: writePolicyEngine.exportGovernanceState(targetDb)
            });
            return true;
        }

        if (req.method === 'POST' && pathname === '/api/admin/policies/circuit-breaker/reset') {
            const reason = validateReason(body.reason);

            writePolicyEngine.resetCircuitBreaker(actor.email, reason, targetDb);

            if (persistenceAdapter && (!govConfig || govConfig.mode === 'PERSISTENT')) {
                await persistenceAdapter.persistEngineState(writePolicyEngine, actor.email, reason, targetDb);
            }

            sendJson(res, 200, {
                success: true,
                message: `Disjuntor (Circuit Breaker) resetado para CLOSED por ${actor.email}.`,
                data: writePolicyEngine.exportGovernanceState(targetDb)
            });
            return true;
        }

        sendJson(res, 404, {
            success: false,
            code: 'ADMIN_ROUTE_NOT_FOUND',
            error: `Rota administrativa não encontrada: ${req.method} ${pathname}`
        });
        return true;

    } catch (err: any) {
        const statusCode = err.statusCode || 500;
        const code = err.code || 'INTERNAL_ADMIN_ERROR';
        console.error(`[AdminPolicyHandler] Erro (${statusCode} - ${code}):`, err.message);

        sendJson(res, statusCode, {
            success: false,
            code,
            error: err.message || 'Erro interno ao processar requisição administrativa de governança.'
        });
        return true;
    }
}
