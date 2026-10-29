/**
 * ============================================================================
 * BACKEND API BRIDGE HANDLER (Fase 6.1, 6.2 & 6.4 - Server-Side Data Proxy)
 * ============================================================================
 * Centralizes all business collection CRUD operations on the server side:
 * - Enforces S08 contract signature immutability and field protection
 * - Enforces S11 global account/profile active checks and tenant suspension checks
 * - Enforces F08 operational collection coverage and notification ownership
 * - Enforces F17 full pagination of Appwrite Teams & Memberships
 * - Enforces F22 atomic JSON merge for concurrent ticket/server updates
 * - Enforces F37 circuit breaker write latency/failure instrumentation
 * ============================================================================
 */

import { Client, Account, Databases, Teams, ID, Query } from 'node-appwrite';
import type { IncomingMessage, ServerResponse } from 'http';
import { WritePolicyEngine, CONTRACT_SIGNATURE_FORBIDDEN_FIELDS } from './writePolicyEngine.ts';
import {
    readJsonBody,
    listAllTeams,
    listAllMemberships,
    mergeJsonArrayById
} from './requestUtils.ts';

export const writePolicyEngine = new WritePolicyEngine({
    mode: (process.env.WRITE_POLICY_MODE as any) || 'shadow'
});

export interface BridgeRequestPayload {
    operation: 'list' | 'get' | 'create' | 'update' | 'delete';
    collectionId: string;
    documentId?: string;
    data?: Record<string, any>;
    queries?: string[];
    targetTenantId?: string;
    targetDatabaseId?: string;
}

export interface BridgeEnvConfig {
    endpoint: string;
    projectId: string;
    apiKey: string;
    databaseId: string;
}

const ALLOWED_BUSINESS_COLLECTIONS = new Set([
    'leads', 'clients', 'opportunities',
    'proposals', 'crm_proposals', 'proposal_items', 'crm_proposal_items', 'crm_items', 'items',
    'contracts', 'crm_contracts', 'charges', 'invoices', 'transactions', 'financial_transactions',
    'support_tickets', 'tickets', 'projects', 'tasks', 'pbx_lines', 'cloud_instances',
    'servers', 'services', 'kb_articles', 'documents', 'crm_documents', 'client_documents', 'files',
    'service_Catalog', 'audit_logs',
    'pipeline_deals', 'pipeline_columns', 'pipeline_history', 'pipeline_attachments',
    'pipeline_activities', 'pipeline_comments', 'pipeline_checklist',
    'events', 'activities', 'phonebook', 'call_history',
    'whatsapp_contacts', 'whatsapp_messages', 'whatsapp_config', 'sip_config',
    'integration_configs', 'message_templates', 'automation_config', 'messages',
    'user_menu_permissions', 'notifications',
    'tenants', 'users_hydra',
    'test_tenants', 'test_users_hydra', 'test_leads', 'test_clients',
    'test_opportunities', 'test_proposals', 'test_crm_proposals', 'test_contracts', 'test_crm_contracts',
    'test_charges', 'test_invoices', 'test_support_tickets', 'test_projects', 'test_tasks', 'test_audit_logs'
]);

const TENANT_AWARE_COLLECTIONS = new Set([
    'leads', 'clients', 'opportunities',
    'proposals', 'crm_proposals', 'proposal_items', 'crm_proposal_items', 'crm_items', 'items',
    'contracts', 'crm_contracts', 'charges', 'invoices', 'transactions', 'financial_transactions',
    'support_tickets', 'tickets', 'projects', 'tasks', 'pbx_lines', 'cloud_instances',
    'servers', 'services', 'kb_articles', 'documents', 'crm_documents', 'client_documents', 'files',
    'service_Catalog', 'audit_logs',
    'pipeline_deals', 'pipeline_columns', 'pipeline_history', 'pipeline_attachments',
    'pipeline_activities', 'pipeline_comments', 'pipeline_checklist',
    'events', 'activities', 'phonebook', 'call_history',
    'whatsapp_contacts', 'whatsapp_messages', 'whatsapp_config', 'sip_config',
    'integration_configs', 'message_templates', 'automation_config', 'messages',
    'user_menu_permissions', 'notifications',
    'users_hydra',
    'test_users_hydra', 'test_leads', 'test_clients', 'test_opportunities',
    'test_proposals', 'test_crm_proposals', 'test_contracts', 'test_crm_contracts',
    'test_charges', 'test_invoices', 'test_support_tickets', 'test_projects', 'test_tasks', 'test_audit_logs'
]);

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    if (res.headersSent) return;
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Appwrite-JWT, X-Appwrite-Session, X-Target-Database, X-Tenant-Id'
    });
    res.end(JSON.stringify(payload));
}

function getAdminClient(env: BridgeEnvConfig): Client {
    return new Client()
        .setEndpoint(env.endpoint)
        .setProject(env.projectId)
        .setKey(env.apiKey);
}

async function isTenantSuspended(
    adminDatabases: Databases,
    databaseId: string,
    tenantId: string | null
): Promise<boolean> {
    if (!tenantId || !adminDatabases || typeof adminDatabases.getDocument !== 'function') return false;
    const cols = databaseId === 'crm_isolated_test' ? ['test_tenants', 'tenants'] : ['tenants', 'test_tenants'];
    for (const col of cols) {
        try {
            const doc: any = await adminDatabases.getDocument(databaseId, col, tenantId);
            if (doc) {
                const status = String(doc.status || 'active').toLowerCase();
                return status === 'suspended' || status === 'cancelled' || doc.is_active === false;
            }
        } catch {
            // Ignore missing tenant doc
        }
    }
    return false;
}

async function authenticateAndResolveTenant(
    req: IncomingMessage,
    env: BridgeEnvConfig,
    requestedTenantId?: string,
    effectiveDatabaseId?: string
): Promise<{
    userId: string;
    email: string;
    authoritativeTenantId: string | null;
    isSuperAdmin: boolean;
    roles: string[];
}> {
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
        throw { status: 401, message: 'Não autenticado. Token de sessão ou JWT ausente.' };
    }

    const userClient = new Client()
        .setEndpoint(env.endpoint)
        .setProject(env.projectId);

    if (isJwt) {
        userClient.setJWT(token);
    } else {
        userClient.setSession(token);
    }

    const account = new Account(userClient);
    let user: any;
    try {
        user = await account.get();
    } catch (err: any) {
        throw { status: 401, message: `Sessão inválida ou expirada: ${err?.message || 'Unauthorized'}` };
    }

    if (user.status === false) {
        throw { status: 403, message: 'Acesso negado: Conta de usuário desativada globalmente.' };
    }

    const userId = user.$id;
    const adminClient = getAdminClient(env);
    const adminTeams = new Teams(adminClient);
    const adminDatabases = new Databases(adminClient);
    const dbId = effectiveDatabaseId || env.databaseId || 'crm_db';

    for (const colName of ['users_hydra', 'test_users_hydra']) {
        try {
            const userDoc: any = await adminDatabases.getDocument(dbId, colName, userId);
            if (userDoc && userDoc.is_active === false) {
                throw { status: 403, message: 'Acesso negado: Perfil de usuário desativado.' };
            }
        } catch (err: any) {
            if (err && err.status === 403) throw err;
        }
    }

    const allTeams = await listAllTeams(adminTeams, Query);
    const userTeams: Array<{ teamId: string; teamName: string; roles: string[] }> = [];
    let isSuperAdmin = false;
    const superAdminTeams = [process.env.SUPERADMIN_TEAM_ID || 'superadmins'];
    if (process.env.NODE_ENV === 'test' || dbId.includes('test')) {
        superAdminTeams.push('test_team_superadmins');
    }

    for (const team of allTeams) {
        try {
            const memberships = await listAllMemberships(adminTeams, team.$id, Query);
            const match = memberships.find((m: any) => m.userId === userId && m.confirm !== false);
            if (match) {
                userTeams.push({
                    teamId: team.$id,
                    teamName: team.name,
                    roles: match.roles || []
                });
                // S01: Authoritative team ID verification ONLY, never trust team.name
                if (superAdminTeams.includes(team.$id)) {
                    isSuperAdmin = true;
                }
            }
        } catch {
            // Ignore individual team check errors
        }
    }

    const operationalTeams = userTeams.filter(
        t => !superAdminTeams.includes(t.teamId)
    );

    if (operationalTeams.length === 0 && !isSuperAdmin) {
        throw { status: 403, message: 'Acesso negado: Usuário não possui vínculo ativo com nenhuma empresa (Team).' };
    }

    let authoritativeTenantId: string | null = null;
    let activeRoles: string[] = [];

    if (requestedTenantId) {
        const matched = operationalTeams.find(t => t.teamId === requestedTenantId);
        if (matched) {
            authoritativeTenantId = matched.teamId;
            activeRoles = matched.roles;
        } else if (isSuperAdmin) {
            authoritativeTenantId = requestedTenantId;
            activeRoles = ['superadmin', 'owner', 'admin'];
        } else {
            throw {
                status: 403,
                message: `Violação de Isolamento Multi-Tenant: Usuário não pertence ao tenant solicitado (${requestedTenantId}).`
            };
        }

        if (!isSuperAdmin && await isTenantSuspended(adminDatabases, dbId, authoritativeTenantId)) {
            throw {
                status: 403,
                message: `Acesso negado: A empresa '${authoritativeTenantId}' encontra-se suspensa ou inativa.`
            };
        }
    } else if (operationalTeams.length > 0) {
        if (isSuperAdmin) {
            authoritativeTenantId = operationalTeams[0].teamId;
            activeRoles = operationalTeams[0].roles;
        } else {
            for (const candidate of operationalTeams) {
                const suspended = await isTenantSuspended(adminDatabases, dbId, candidate.teamId);
                if (!suspended) {
                    authoritativeTenantId = candidate.teamId;
                    activeRoles = candidate.roles;
                    break;
                }
            }
            if (!authoritativeTenantId) {
                throw {
                    status: 403,
                    message: 'Acesso negado: Todas as empresas vinculadas à sua conta encontram-se suspensas.'
                };
            }
        }
    } else if (isSuperAdmin) {
        authoritativeTenantId = null;
        activeRoles = ['superadmin', 'owner', 'admin'];
    }

    return {
        userId,
        email: user.email,
        authoritativeTenantId,
        isSuperAdmin,
        roles: activeRoles
    };
}

export async function handleApiDataRequest(
    req: IncomingMessage,
    res: ServerResponse,
    env: BridgeEnvConfig
): Promise<void> {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed. Use POST.' });
        return;
    }

    try {
        const body = (await readJsonBody(req)) as unknown as BridgeRequestPayload;
        const operation = (body as any).operation || (body as any).action;
        const targetDatabaseId = (body as any).targetDatabaseId || (body as any).databaseId;
        const {
            collectionId,
            documentId,
            data,
            queries = [],
            targetTenantId
        } = body;

        if (!operation || !collectionId) {
            sendJson(res, 400, { success: false, error: 'Parâmetros obrigatórios ausentes: operation/action, collectionId.' });
            return;
        }

        if (!ALLOWED_BUSINESS_COLLECTIONS.has(collectionId)) {
            sendJson(res, 403, { success: false, error: `Coleção não autorizada na ponte de API: ${collectionId}` });
            return;
        }

        const effectiveDatabaseId = (targetDatabaseId === 'crm_isolated_test' || targetDatabaseId === 'crm_db_sandbox')
            ? targetDatabaseId
            : env.databaseId;

        const authContext = await authenticateAndResolveTenant(req, env, targetTenantId, effectiveDatabaseId);
        const { authoritativeTenantId, isSuperAdmin, userId, roles } = authContext;
        const isTenantAdmin = isSuperAdmin || (roles || []).some(r => ['owner', 'admin', 'superadmin'].includes(String(r).toLowerCase()));

        // R04: Strict authorization - users with only "viewer" role must never be permitted to execute writes
        if (['create', 'update', 'delete'].includes(operation) && !isSuperAdmin) {
            const userRolesLower = (roles || []).map(r => String(r).toLowerCase());
            const hasWriteRole = userRolesLower.some(r => ['owner', 'admin', 'agent', 'member', 'superadmin', 'manager'].includes(r));
            if (!hasWriteRole || (userRolesLower.length === 1 && userRolesLower[0] === 'viewer')) {
                sendJson(res, 403, {
                    success: false,
                    error: 'Acesso negado: Usuário com permissão apenas de visualização (viewer) não possui autorização de escrita.',
                    code: 'ROLE_NOT_AUTHORIZED_FOR_WRITE'
                });
                return;
            }
        }

        const adminClient = getAdminClient(env);
        const adminDatabases = new Databases(adminClient);
        const isTenantAware = TENANT_AWARE_COLLECTIONS.has(collectionId);
        const isContractCol = collectionId === 'contracts' || collectionId === 'test_contracts' || collectionId === 'crm_contracts' || collectionId === 'test_crm_contracts';
        const isNotificationCol = collectionId === 'notifications';
        const isTicketCol = collectionId === 'support_tickets' || collectionId === 'test_support_tickets' || collectionId === 'tickets';
        const isServerCol = collectionId === 'servers';

        let existingDocForWrite: any = null;
        if (['update', 'delete'].includes(operation)) {
            if (!documentId) {
                sendJson(res, 400, { error: `documentId é obrigatório para ${operation}.` });
                return;
            }
            existingDocForWrite = await adminDatabases.getDocument(effectiveDatabaseId, collectionId, documentId);

            if (isTenantAware && authoritativeTenantId && existingDocForWrite.tenant_id !== authoritativeTenantId && !isSuperAdmin) {
                sendJson(res, 403, {
                    error: `Violação de Isolamento Multi-Tenant: Tentativa de ${operation === 'update' ? 'atualizar' : 'excluir'} documento de outro tenant.`
                });
                return;
            }

            if (isNotificationCol && !isTenantAdmin) {
                if (existingDocForWrite.user_id && existingDocForWrite.user_id !== userId) {
                    sendJson(res, 403, {
                        code: 'NOTIFICATION_OWNERSHIP_VIOLATION',
                        error: 'Acesso negado: Você só pode alterar ou excluir suas próprias notificações.'
                    });
                    return;
                }
            }

            if (isContractCol) {
                const existingStatus = String(existingDocForWrite.status || '').trim().toLowerCase();
                if (existingStatus === 'signed' || existingStatus === 'assinado' || existingDocForWrite.signed_at) {
                    sendJson(res, 403, {
                        code: 'CONTRACT_IMMUTABLE_SIGNED',
                        error: 'Contratos já assinados são imutáveis e não podem ser alterados ou excluídos via CRUD.'
                    });
                    return;
                }
            }
        }

        if (isContractCol && (operation === 'create' || operation === 'update') && data && typeof data === 'object') {
            for (const forbiddenField of CONTRACT_SIGNATURE_FORBIDDEN_FIELDS) {
                if (data[forbiddenField] === '' || data[forbiddenField] === null) {
                    delete data[forbiddenField];
                } else if (Object.prototype.hasOwnProperty.call(data, forbiddenField) && data[forbiddenField] !== undefined) {
                    sendJson(res, 403, {
                        code: 'FORBIDDEN_CONTRACT_SIGNATURE_FIELD',
                        error: `O campo de assinatura '${forbiddenField}' não pode ser gravado via CRUD. Utilize /api/contracts/sign.`
                    });
                    return;
                }
            }
            if (data.status) {
                const statusLower = String(data.status).trim().toLowerCase();
                if (statusLower === 'signed' || statusLower === 'assinado') {
                    sendJson(res, 403, {
                        code: 'FORBIDDEN_CONTRACT_SIGNATURE_STATUS',
                        error: 'O status de contrato assinado só pode ser atribuído pelo endpoint público de assinatura (/api/contracts/sign).'
                    });
                    return;
                }
            }
        }

        if (['create', 'update', 'delete'].includes(operation)) {
            const policyEval = writePolicyEngine.evaluate({
                collectionId,
                operation,
                tenantId: authoritativeTenantId,
                userId,
                roles,
                isSuperAdmin,
                payload: data || {},
                existingDocument: existingDocForWrite
            });

            if (!policyEval.allowed) {
                sendJson(res, 422, {
                    error: 'Operação bloqueada pelo Motor de Políticas de Escrita (Write Policy Engine).',
                    code: 'WRITE_POLICY_VIOLATION',
                    mode: policyEval.mode,
                    violations: policyEval.violations
                });
                return;
            }
        }

        switch (operation) {
            case 'list': {
                const finalQueries = [...queries];
                if (isTenantAware) {
                    if (authoritativeTenantId) {
                        finalQueries.push(Query.equal('tenant_id', [authoritativeTenantId]));
                    } else if (!isSuperAdmin) {
                        sendJson(res, 403, { error: 'Tenant ID não resolvido para listagem.' });
                        return;
                    }
                }
                const result = await adminDatabases.listDocuments(effectiveDatabaseId, collectionId, finalQueries);

                if (isNotificationCol && !isTenantAdmin) {
                    const filteredDocs = (result.documents || []).filter(
                        (doc: any) => !doc.user_id || doc.user_id === userId
                    );
                    sendJson(res, 200, {
                        ...result,
                        total: filteredDocs.length,
                        documents: filteredDocs
                    });
                    return;
                }

                sendJson(res, 200, result);
                return;
            }

            case 'get': {
                if (!documentId) {
                    sendJson(res, 400, { error: 'documentId é obrigatório para operação get.' });
                    return;
                }
                const doc: any = await adminDatabases.getDocument(effectiveDatabaseId, collectionId, documentId);
                if (isTenantAware && authoritativeTenantId && doc.tenant_id !== authoritativeTenantId && !isSuperAdmin) {
                    sendJson(res, 403, { error: 'Violação de Isolamento Multi-Tenant: Documento pertence a outra empresa.' });
                    return;
                }
                if (isNotificationCol && !isTenantAdmin && doc.user_id && doc.user_id !== userId) {
                    sendJson(res, 403, { error: 'Acesso negado: Esta notificação pertence a outro usuário.' });
                    return;
                }
                sendJson(res, 200, doc);
                return;
            }

            case 'create': {
                if (!data || typeof data !== 'object') {
                    sendJson(res, 400, { error: 'Objeto data é obrigatório para operação create.' });
                    return;
                }
                const cleanData: Record<string, any> = { ...data };
                delete cleanData.$id;
                delete cleanData.$createdAt;
                delete cleanData.$updatedAt;
                delete cleanData.$permissions;
                delete cleanData.$databaseId;
                delete cleanData.$collectionId;

                if (isTenantAware) {
                    if (!authoritativeTenantId && !isSuperAdmin) {
                        sendJson(res, 403, { error: 'Não é possível criar registro sem Tenant ativo.' });
                        return;
                    }
                    if (authoritativeTenantId) {
                        cleanData.tenant_id = authoritativeTenantId;
                    }
                }

                if (isNotificationCol && !cleanData.user_id) {
                    cleanData.user_id = userId;
                }

                const finalDocId = documentId || ID.unique();
                const writeStartMs = Date.now();
                try {
                    const created = await adminDatabases.createDocument(effectiveDatabaseId, collectionId, finalDocId, cleanData);
                    writePolicyEngine.recordSuccess(Date.now() - writeStartMs, effectiveDatabaseId);
                    sendJson(res, 201, {
                        success: true,
                        action: operation,
                        collectionId,
                        documentId: created.$id,
                        data: created,
                        ...created
                    });
                    return;
                } catch (dbErr) {
                    writePolicyEngine.recordFailure(dbErr, Date.now() - writeStartMs, effectiveDatabaseId);
                    throw dbErr;
                }
            }

            case 'update': {
                if (!documentId || !data || typeof data !== 'object') {
                    sendJson(res, 400, { success: false, error: 'documentId e data são obrigatórios para operação update.' });
                    return;
                }

                // F22: Re-read fresh document to avoid race conditions under concurrency
                let latestDoc = existingDocForWrite;
                try {
                    latestDoc = await adminDatabases.getDocument(effectiveDatabaseId, collectionId, documentId);
                } catch {}

                const cleanUpdateData: Record<string, any> = { ...data };
                delete cleanUpdateData.$id;
                delete cleanUpdateData.$createdAt;
                delete cleanUpdateData.$updatedAt;
                delete cleanUpdateData.$permissions;
                delete cleanUpdateData.$databaseId;
                delete cleanUpdateData.$collectionId;

                if (isTenantAware && authoritativeTenantId && !isSuperAdmin) {
                    cleanUpdateData.tenant_id = authoritativeTenantId;
                }

                if (isTicketCol && latestDoc && (cleanUpdateData.messages_json !== undefined || cleanUpdateData._append_message !== undefined)) {
                    cleanUpdateData.messages_json = mergeJsonArrayById(
                        latestDoc.messages_json,
                        cleanUpdateData.messages_json,
                        cleanUpdateData._append_message,
                        'timestamp'
                    );
                    delete cleanUpdateData._append_message;
                }

                if (isServerCol && latestDoc && (cleanUpdateData.incidents_json !== undefined || cleanUpdateData._append_incident !== undefined)) {
                    cleanUpdateData.incidents_json = mergeJsonArrayById(
                        latestDoc.incidents_json,
                        cleanUpdateData.incidents_json,
                        cleanUpdateData._append_incident,
                        'date'
                    );
                    delete cleanUpdateData._append_incident;
                }

                const writeStartMs = Date.now();
                try {
                    const updated = await adminDatabases.updateDocument(effectiveDatabaseId, collectionId, documentId, cleanUpdateData);
                    writePolicyEngine.recordSuccess(Date.now() - writeStartMs, effectiveDatabaseId);
                    sendJson(res, 200, {
                        success: true,
                        action: operation,
                        collectionId,
                        documentId: updated.$id || documentId,
                        data: updated,
                        ...updated
                    });
                    return;
                } catch (dbErr) {
                    writePolicyEngine.recordFailure(dbErr, Date.now() - writeStartMs, effectiveDatabaseId);
                    throw dbErr;
                }
            }

            case 'delete': {
                const writeStartMs = Date.now();
                try {
                    await adminDatabases.deleteDocument(effectiveDatabaseId, collectionId, documentId!);
                    writePolicyEngine.recordSuccess(Date.now() - writeStartMs, effectiveDatabaseId);
                    sendJson(res, 200, {
                        success: true,
                        action: operation,
                        collectionId,
                        documentId,
                        deletedId: documentId,
                        data: { success: true, documentId, message: `Documento '${documentId}' excluído com sucesso.` },
                        message: `Documento '${documentId}' excluído com sucesso.`
                    });
                    return;
                } catch (dbErr) {
                    writePolicyEngine.recordFailure(dbErr, Date.now() - writeStartMs, effectiveDatabaseId);
                    throw dbErr;
                }
            }

            default:
                sendJson(res, 400, { error: `Operação desconhecida: ${operation}` });
        }
    } catch (err: any) {
        const status = err?.status || err?.statusCode || err?.code || 500;
        const httpStatus = typeof status === 'number' && status >= 100 && status < 600 ? status : 500;
        sendJson(res, httpStatus, {
            error: err?.message || 'Erro interno no servidor de API.',
            code: err?.type || err?.code || 'INTERNAL_ERROR'
        });
    }
}
