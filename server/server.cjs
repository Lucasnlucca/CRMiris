/**
 * ============================================================================
 * PRODUCTION SERVER & BACKEND API BRIDGE (Fase 6.1, 6.2 & 6.4)
 * ============================================================================
 * Serves the static Vite build (`dist/`) and exposes the authoritative
 * Backend API Bridge (`/api/data`, `/api/admin/policies/*`, `/api/admin/tenants/*`,
 * `/api/admin/users/*`, `/api/portal/*`, `/api/asaas/*`, `/api/contracts/*`,
 * `/api/auth/login`, `/api/health`) using `node-appwrite` with server-side
 * JWT/Session validation, tenant membership resolution, Write Policy Engine
 * governance, S08 contract immutability, S10 crash resilience, S11 global/tenant
 * suspension enforcement, F17 pagination, F22 atomic JSON merge, F36 durable
 * governance persistence, and F37 circuit breaker instrumentation.
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Client, Account, Databases, Teams, ID, Query } = require('node-appwrite');
const { WritePolicyEngine, CONTRACT_SIGNATURE_FORBIDDEN_FIELDS } = require('./writePolicyEngine.cjs');
const { resolveGovernanceConfig } = require('./governanceConfig.cjs');
const { GovernancePersistencePrototype } = require('./governancePersistencePrototype.cjs');
const { handleAdminPolicyRoutes } = require('./adminPolicyHandler.cjs');
const { handleUserManagementRoutes } = require('./userManagementHandler.cjs');
const { handleTenantProvisioningRoutes } = require('./tenantProvisioningHandler.cjs');
const { handlePortalRoutes } = require('./portalHandler.cjs');
const { handleAuthLoginRoute } = require('./authLoginHandler.cjs');
const { handleAsaasRoutes } = require('./asaasHandler.cjs');
const { handleContractRoutes } = require('./signContractHandler.cjs');
const {
    readJsonBody,
    listAllTeams,
    listAllMemberships,
    mergeJsonArrayById
} = require('./requestUtils.cjs');

// Load .env files if present (development / local docker fallback)
function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = val;
        }
    });
}

loadEnvFile(path.resolve(__dirname, '../.env.local'));
loadEnvFile(path.resolve(__dirname, '../.env'));

// Filter out noisy SDK version mismatch warning
const originalConsoleWarn = console.warn;
console.warn = function (...args) {
    if (typeof args[0] === 'string' && args[0].includes('The current SDK is built for Appwrite')) {
        return;
    }
    originalConsoleWarn.apply(console, args);
};

// Internal API bridge port: use BRIDGE_PORT/API_PORT first. If PORT is set to public HTTP ports (80, 3000, 4173), fallback to 3001 so Nginx can bind to public ports.
const PORT = Number(
    process.env.BRIDGE_PORT ||
    process.env.API_PORT ||
    (process.env.PORT && !['80', '3000', '4173'].includes(String(process.env.PORT).trim()) ? process.env.PORT : 3001)
);
const DIST_DIR = path.resolve(__dirname, '../dist');

const APPWRITE_ENDPOINT = process.env.VITE_APPWRITE_URL || process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
const APPWRITE_PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f';
const APPWRITE_DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || 'crm_db';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || '';

// Initialize Write Policy Engine
const writePolicyEngine = new WritePolicyEngine({
    mode: process.env.WRITE_POLICY_MODE || 'enforce'
});

// F22: Document lock queue for atomic document writes and race-free concurrent messages
const documentLocks = new Map();
async function withDocumentLock(lockKey, fn) {
    const prev = documentLocks.get(lockKey) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    documentLocks.set(lockKey, prev.then(() => current, () => current));
    await prev;
    try {
        return await fn();
    } finally {
        release();
        if (documentLocks.get(lockKey) === current) {
            documentLocks.delete(lockKey);
        }
    }
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

// F08: Complete operational collections list matching frontend official collections
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

function sendJson(res, statusCode, payload) {
    if (res.headersSent) return;
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Appwrite-JWT, X-Appwrite-Session, X-Target-Database, X-Tenant-Id, X-Portal-Token'
    });
    res.end(JSON.stringify(payload));
}

function getAdminClient() {
    if (!APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
        throw new Error('Server misconfigured: Missing APPWRITE_PROJECT_ID or APPWRITE_API_KEY.');
    }
    return new Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID)
        .setKey(APPWRITE_API_KEY);
}

/**
 * Helper to check whether a tenant document is suspended/inactive (S11).
 */
async function isTenantSuspended(adminDatabases, databaseId, tenantId) {
    if (!tenantId || !adminDatabases || typeof adminDatabases.getDocument !== 'function') return false;
    const cols = databaseId === 'crm_isolated_test' ? ['test_tenants', 'tenants'] : ['tenants', 'test_tenants'];
    for (const col of cols) {
        try {
            const doc = await adminDatabases.getDocument(databaseId, col, tenantId);
            if (doc) {
                const status = String(doc.status || 'active').toLowerCase();
                return status === 'suspended' || status === 'cancelled' || doc.is_active === false;
            }
        } catch {
            // Tenant doc may not exist in this collection
        }
    }
    return false;
}

/**
 * Validates the caller's identity via Appwrite JWT or Session cookie/header,
 * enforces S11 global account/profile active checks and tenant suspension checks,
 * and resolves their authoritative tenant membership across all pages (F17).
 */
async function authenticateAndResolveTenant(req, requestedTenantId, effectiveDatabaseId = APPWRITE_DATABASE_ID) {
    const authHeader = req.headers['authorization'] || '';
    const jwtHeader = req.headers['x-appwrite-jwt'] || '';
    const sessionHeader = req.headers['x-appwrite-session'] || '';

    let token = '';
    let isJwt = false;

    if (jwtHeader) {
        token = String(jwtHeader).trim();
        isJwt = true;
    } else if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
        isJwt = token.split('.').length === 3;
    } else if (sessionHeader) {
        token = String(sessionHeader).trim();
        isJwt = false;
    }

    if (!token) {
        const err = new Error('Não autenticado. Token de sessão ou JWT ausente.');
        err.statusCode = 401;
        throw err;
    }

    const userClient = new Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID);

    if (isJwt) {
        userClient.setJWT(token);
    } else {
        userClient.setSession(token);
    }

    const account = new Account(userClient);
    let user;
    try {
        user = await account.get();
    } catch (e) {
        const err = new Error(`Sessão inválida ou expirada: ${e.message}`);
        err.statusCode = 401;
        throw err;
    }

    // S11: Reject globally deactivated Appwrite user accounts
    if (user.status === false) {
        const err = new Error('Acesso negado: Conta de usuário desativada globalmente.');
        err.statusCode = 403;
        err.code = 'ACCOUNT_DEACTIVATED';
        throw err;
    }

    const userId = user.$id;
    const adminClient = getAdminClient();
    const adminTeams = new Teams(adminClient);
    const adminDatabases = new Databases(adminClient);

    // S11: Check profile table to block deactivated users
    for (const colName of ['users_hydra', 'test_users_hydra']) {
        try {
            const userDoc = await adminDatabases.getDocument(effectiveDatabaseId, colName, userId);
            if (userDoc && userDoc.is_active === false) {
                const err = new Error('Acesso negado: Perfil de usuário desativado.');
                err.statusCode = 403;
                err.code = 'PROFILE_DEACTIVATED';
                throw err;
            }
        } catch (e) {
            if (e && (e.code === 'PROFILE_DEACTIVATED' || e.statusCode === 403)) throw e;
            // Collection/document may not exist
        }
    }

    // F17: Paginate all teams and memberships
    const allTeams = await listAllTeams(adminTeams, Query);
    const userTeams = [];
    let isSuperAdmin = false;
    const superAdminTeams = [process.env.SUPERADMIN_TEAM_ID || 'superadmins'];
    if (process.env.NODE_ENV === 'test' || effectiveDatabaseId.includes('test')) {
        superAdminTeams.push('test_team_superadmins');
    }

    for (const team of allTeams) {
        try {
            const memberships = await listAllMemberships(adminTeams, team.$id, Query);
            const match = memberships.find(m => m.userId === userId && m.confirm !== false);
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
            // Ignore errors on individual team checks
        }
    }

    const operationalTeams = userTeams.filter(
        t => t.teamId !== 'superadmins' && t.teamId !== 'test_team_superadmins' && (!t.teamName || t.teamName.toLowerCase() !== 'superadmins')
    );

    if (operationalTeams.length === 0 && !isSuperAdmin) {
        const err = new Error('Acesso negado: Usuário não possui vínculo ativo com nenhuma empresa (Team).');
        err.statusCode = 403;
        throw err;
    }

    let authoritativeTenantId = null;
    let activeRoles = [];

    if (requestedTenantId) {
        const matched = operationalTeams.find(t => t.teamId === requestedTenantId);
        if (matched) {
            authoritativeTenantId = matched.teamId;
            activeRoles = matched.roles;
        } else if (isSuperAdmin) {
            authoritativeTenantId = requestedTenantId;
            activeRoles = ['superadmin', 'owner', 'admin'];
        } else {
            const err = new Error(`Violação de Isolamento Multi-Tenant: Usuário não pertence ao tenant solicitado (${requestedTenantId}).`);
            err.statusCode = 403;
            throw err;
        }

        // S11: Check if the explicitly requested tenant is suspended
        if (!isSuperAdmin && await isTenantSuspended(adminDatabases, effectiveDatabaseId, authoritativeTenantId)) {
            const err = new Error(`Acesso negado: A empresa '${authoritativeTenantId}' encontra-se suspensa ou inativa.`);
            err.statusCode = 403;
            err.code = 'TENANT_SUSPENDED';
            throw err;
        }
    } else if (operationalTeams.length > 0) {
        // S11: Pick the first non-suspended operational team for the caller
        if (isSuperAdmin) {
            authoritativeTenantId = operationalTeams[0].teamId;
            activeRoles = operationalTeams[0].roles;
        } else {
            for (const candidate of operationalTeams) {
                const suspended = await isTenantSuspended(adminDatabases, effectiveDatabaseId, candidate.teamId);
                if (!suspended) {
                    authoritativeTenantId = candidate.teamId;
                    activeRoles = candidate.roles;
                    break;
                }
            }
            if (!authoritativeTenantId) {
                const err = new Error('Acesso negado: Todas as empresas vinculadas à sua conta encontram-se suspensas.');
                err.statusCode = 403;
                err.code = 'TENANT_SUSPENDED';
                throw err;
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

/**
 * Handles POST /api/data and POST /api/crm/write (R01 & F08 Backend API Bridge)
 */
async function handleDataBridge(req, res) {
    try {
        const body = await readJsonBody(req);
        const operation = body.operation || body.action;
        const targetDatabaseId = body.targetDatabaseId || body.databaseId;
        const {
            collectionId,
            documentId,
            data,
            queries = [],
            targetTenantId
        } = body;

        // If client requests contract signing via bridge, route directly to contract handler
        if (operation === 'signContract') {
            return await handleContractRoutes(req, res, {
                endpoint: APPWRITE_ENDPOINT,
                projectId: APPWRITE_PROJECT_ID,
                apiKey: APPWRITE_API_KEY,
                databaseId: targetDatabaseId || APPWRITE_DATABASE_ID
            });
        }

        if (!operation || !collectionId) {
            return sendJson(res, 400, {
                success: false,
                error: 'Parâmetros obrigatórios ausentes: operation/action, collectionId.'
            });
        }

        if (!ALLOWED_BUSINESS_COLLECTIONS.has(collectionId)) {
            return sendJson(res, 403, {
                success: false,
                error: `Coleção não autorizada na ponte de API: ${collectionId}`
            });
        }

        const effectiveDatabaseId = (targetDatabaseId === 'crm_isolated_test' || targetDatabaseId === 'crm_db_sandbox')
            ? targetDatabaseId
            : APPWRITE_DATABASE_ID;

        const authContext = await authenticateAndResolveTenant(req, targetTenantId, effectiveDatabaseId);
        const { authoritativeTenantId, isSuperAdmin, userId, roles } = authContext;
        const isTenantAdmin = isSuperAdmin || (roles || []).some(r => ['owner', 'admin', 'superadmin'].includes(String(r).toLowerCase()));

        // R04: Strict authorization - users with only "viewer" role must never be permitted to execute writes
        if (['create', 'update', 'delete'].includes(operation) && !isSuperAdmin) {
            const userRolesLower = (roles || []).map(r => String(r).toLowerCase());
            const hasWriteRole = userRolesLower.some(r => ['owner', 'admin', 'agent', 'member', 'superadmin', 'manager'].includes(r));
            if (!hasWriteRole || (userRolesLower.length === 1 && userRolesLower[0] === 'viewer')) {
                return sendJson(res, 403, {
                    success: false,
                    error: 'Acesso negado: Usuário com permissão apenas de visualização (viewer) não possui autorização de escrita.',
                    code: 'ROLE_NOT_AUTHORIZED_FOR_WRITE'
                });
            }
        }

        const adminClient = getAdminClient();
        const adminDatabases = new Databases(adminClient);
        const isTenantAware = TENANT_AWARE_COLLECTIONS.has(collectionId);
        const isContractCol = collectionId === 'contracts' || collectionId === 'test_contracts' || collectionId === 'crm_contracts' || collectionId === 'test_crm_contracts';
        const isNotificationCol = collectionId === 'notifications';
        const isTicketCol = collectionId === 'support_tickets' || collectionId === 'test_support_tickets' || collectionId === 'tickets';
        const isServerCol = collectionId === 'servers';

        let existingDocForWrite = null;
        if (['update', 'delete'].includes(operation)) {
            if (!documentId) {
                return sendJson(res, 400, { success: false, error: `documentId é obrigatório para ${operation}.` });
            }
            existingDocForWrite = await adminDatabases.getDocument(effectiveDatabaseId, collectionId, documentId);

            if (isTenantAware && authoritativeTenantId && existingDocForWrite.tenant_id !== authoritativeTenantId && !isSuperAdmin) {
                return sendJson(res, 403, {
                    success: false,
                    error: `Violação de Isolamento Multi-Tenant: Tentativa de ${operation === 'update' ? 'atualizar' : 'excluir'} documento de outro tenant.`
                });
            }

            // F08: Notification ownership check on update/delete
            if (isNotificationCol && !isTenantAdmin) {
                if (existingDocForWrite.user_id && existingDocForWrite.user_id !== userId) {
                    return sendJson(res, 403, {
                        success: false,
                        code: 'NOTIFICATION_OWNERSHIP_VIOLATION',
                        error: 'Acesso negado: Você só pode alterar ou excluir suas próprias notificações.'
                    });
                }
            }

            // S08: Hard immutability check on already-signed contracts (regardless of policy mode)
            if (isContractCol) {
                const existingStatus = String(existingDocForWrite.status || '').trim().toLowerCase();
                if (existingStatus === 'signed' || existingStatus === 'assinado' || existingDocForWrite.signed_at) {
                    return sendJson(res, 403, {
                        success: false,
                        code: 'CONTRACT_IMMUTABLE_SIGNED',
                        error: 'Contratos já assinados são imutáveis e não podem ser alterados ou excluídos via CRUD.'
                    });
                }
            }
        }

        // S08: Hard protection against setting contract signature fields or 'signed' status via CRUD
        if (isContractCol && (operation === 'create' || operation === 'update') && data && typeof data === 'object') {
            for (const forbiddenField of CONTRACT_SIGNATURE_FORBIDDEN_FIELDS) {
                if (data[forbiddenField] === '' || data[forbiddenField] === null) {
                    delete data[forbiddenField];
                } else if (Object.prototype.hasOwnProperty.call(data, forbiddenField) && data[forbiddenField] !== undefined) {
                    return sendJson(res, 403, {
                        success: false,
                        code: 'FORBIDDEN_CONTRACT_SIGNATURE_FIELD',
                        error: `O campo de assinatura '${forbiddenField}' não pode ser gravado via CRUD. Utilize /api/contracts/sign.`
                    });
                }
            }
            if (data.status) {
                const statusLower = String(data.status).trim().toLowerCase();
                if (statusLower === 'signed' || statusLower === 'assinado') {
                    return sendJson(res, 403, {
                        success: false,
                        code: 'FORBIDDEN_CONTRACT_SIGNATURE_STATUS',
                        error: 'O status de contrato assinado só pode ser atribuído pelo endpoint público de assinatura (/api/contracts/sign).'
                    });
                }
            }
        }

        // ====================================================================
        // WRITE POLICY ENGINE EVALUATION
        // ====================================================================
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
                return sendJson(res, 422, {
                    error: 'Operação bloqueada pelo Motor de Políticas de Escrita (Write Policy Engine).',
                    code: 'WRITE_POLICY_VIOLATION',
                    mode: policyEval.mode,
                    violations: policyEval.violations
                });
            }
        }

        switch (operation) {
            case 'list': {
                const finalQueries = [...queries];
                if (isTenantAware) {
                    if (authoritativeTenantId) {
                        finalQueries.push(Query.equal('tenant_id', [authoritativeTenantId]));
                    } else if (!isSuperAdmin) {
                        return sendJson(res, 403, { error: 'Tenant ID não resolvido para listagem.' });
                    }
                }
                const result = await adminDatabases.listDocuments(effectiveDatabaseId, collectionId, finalQueries);

                if (isNotificationCol && !isTenantAdmin) {
                    const filteredDocs = (result.documents || []).filter(
                        doc => !doc.user_id || doc.user_id === userId
                    );
                    return sendJson(res, 200, {
                        ...result,
                        total: filteredDocs.length,
                        documents: filteredDocs
                    });
                }

                return sendJson(res, 200, result);
            }

            case 'get': {
                if (!documentId) {
                    return sendJson(res, 400, { error: 'documentId é obrigatório para operação get.' });
                }
                const doc = await adminDatabases.getDocument(effectiveDatabaseId, collectionId, documentId);
                if (isTenantAware && authoritativeTenantId && doc.tenant_id !== authoritativeTenantId && !isSuperAdmin) {
                    return sendJson(res, 403, { error: 'Violação de Isolamento Multi-Tenant: Documento pertence a outra empresa.' });
                }
                if (isNotificationCol && !isTenantAdmin && doc.user_id && doc.user_id !== userId) {
                    return sendJson(res, 403, { error: 'Acesso negado: Esta notificação pertence a outro usuário.' });
                }
                return sendJson(res, 200, doc);
            }

            case 'create': {
                if (!data || typeof data !== 'object') {
                    return sendJson(res, 400, { error: 'Objeto data é obrigatório para operação create.' });
                }
                const cleanData = { ...data };
                delete cleanData.$id;
                delete cleanData.$createdAt;
                delete cleanData.$updatedAt;
                delete cleanData.$permissions;
                delete cleanData.$databaseId;
                delete cleanData.$collectionId;

                if (isTenantAware) {
                    if (!authoritativeTenantId && !isSuperAdmin) {
                        return sendJson(res, 403, { error: 'Não é possível criar registro sem Tenant ativo.' });
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
                    return sendJson(res, 201, {
                        success: true,
                        action: operation,
                        collectionId,
                        documentId: created.$id,
                        data: created,
                        ...created
                    });
                } catch (dbErr) {
                    writePolicyEngine.recordFailure(dbErr, Date.now() - writeStartMs, effectiveDatabaseId);
                    throw dbErr;
                }
            }

            case 'update': {
                if (!documentId || !data || typeof data !== 'object') {
                    return sendJson(res, 400, { success: false, error: 'documentId e data são obrigatórios para operação update.' });
                }

                const docLockKey = `${effectiveDatabaseId}:${collectionId}:${documentId}`;
                return await withDocumentLock(docLockKey, async () => {
                    // F22: Re-read the latest document inside the lock to prevent lost updates under concurrency
                    let latestDoc = existingDocForWrite;
                    try {
                        latestDoc = await adminDatabases.getDocument(effectiveDatabaseId, collectionId, documentId);
                    } catch {
                        // fallback to existing
                    }

                    const cleanUpdateData = { ...data };
                    delete cleanUpdateData.$id;
                    delete cleanUpdateData.$createdAt;
                    delete cleanUpdateData.$updatedAt;
                    delete cleanUpdateData.$permissions;
                    delete cleanUpdateData.$databaseId;
                    delete cleanUpdateData.$collectionId;

                    if (isTenantAware && authoritativeTenantId && !isSuperAdmin) {
                        cleanUpdateData.tenant_id = authoritativeTenantId;
                    }

                    // F22: Atomic JSON array merge for support_tickets (messages_json) and servers (incidents_json)
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
                        return sendJson(res, 200, {
                            success: true,
                            action: operation,
                            collectionId,
                            documentId: updated.$id || documentId,
                            data: updated,
                            ...updated
                        });
                    } catch (dbErr) {
                        writePolicyEngine.recordFailure(dbErr, Date.now() - writeStartMs, effectiveDatabaseId);
                        throw dbErr;
                    }
                });
            }

            case 'delete': {
                const writeStartMs = Date.now();
                try {
                    await adminDatabases.deleteDocument(effectiveDatabaseId, collectionId, documentId);
                    writePolicyEngine.recordSuccess(Date.now() - writeStartMs, effectiveDatabaseId);
                    return sendJson(res, 200, {
                        success: true,
                        action: operation,
                        collectionId,
                        documentId,
                        deletedId: documentId,
                        data: { success: true, documentId, message: `Documento '${documentId}' excluído com sucesso.` },
                        message: `Documento '${documentId}' excluído com sucesso.`
                    });
                } catch (dbErr) {
                    writePolicyEngine.recordFailure(dbErr, Date.now() - writeStartMs, effectiveDatabaseId);
                    throw dbErr;
                }
            }

            default:
                return sendJson(res, 400, { success: false, error: `Operação desconhecida: ${operation}` });
        }
    } catch (err) {
        const status = err.statusCode || err.code || 500;
        const httpStatus = (typeof status === 'number' && status >= 100 && status < 600) ? status : 500;
        return sendJson(res, httpStatus, {
            success: false,
            error: err.message || 'Erro interno no servidor de API.',
            code: err.type || err.code || 'INTERNAL_ERROR'
        });
    }
}

// ============================================================================
// GOVERNANCE & PERSISTENCE INITIALIZATION (Fase 6.4 - F36)
// ============================================================================
const govConfig = resolveGovernanceConfig(process.env);
let persistenceAdapter = null;
let bootPromise = Promise.resolve();

if (govConfig.status === 'INVALID') {
    console.error(`🚨 [FATAL GOVERNANCE BOOT ERROR] ${govConfig.reason}`);
} else {
    console.log(`🛡️ [Governance Boot] Status: ${govConfig.status} | Mode: ${govConfig.mode} | DB: ${govConfig.targetDb} | Reason: ${govConfig.reason}`);
    if (govConfig.mode === 'PERSISTENT') {
        try {
            let adminDb = null;
            if (APPWRITE_PROJECT_ID && APPWRITE_API_KEY) {
                const adminClient = getAdminClient();
                adminDb = new Databases(adminClient);
            }
            persistenceAdapter = new GovernancePersistencePrototype(adminDb, govConfig.targetDb);
            bootPromise = persistenceAdapter.restoreIntoEngine(writePolicyEngine).then(res => {
                console.log(`🔄 [Governance Persistence] Estado restaurado (${res.source || 'DB'}):`, res);
            }).catch(err => {
                console.error(`⚠️ [Governance Persistence] Falha ao restaurar estado no boot (Fail-Closed ativado):`, err.message);
                writePolicyEngine.setMode('enforce', 'system:boot-fail-closed', `Fail-closed activated due to restore error: ${err.message}`, govConfig.targetDb);
            });
        } catch (e) {
            console.error(`⚠️ [Governance Persistence] Erro ao inicializar adaptador:`, e.message);
            writePolicyEngine.setMode('enforce', 'system:boot-fail-closed', `Fail-closed activated due to adapter init error: ${e.message}`, govConfig.targetDb);
        }
    }
}

// ============================================================================
// HTTP SERVER (API + STATIC SPA FALLBACK) — S10 Top-Level Resilience
// ============================================================================
const server = http.createServer(async (req, res) => {
    try {
        await bootPromise;
        const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;

        const sharedEnvConfig = {
            endpoint: APPWRITE_ENDPOINT,
            projectId: APPWRITE_PROJECT_ID,
            apiKey: APPWRITE_API_KEY,
            databaseId: APPWRITE_DATABASE_ID,
            governanceConfig: govConfig
        };

        // 0. Admin Policy & Governance Routes (/api/admin/policies/* and /api/admin/policy/*)
        if (pathname.startsWith('/api/admin/policies') || pathname.startsWith('/api/admin/policy')) {
            await handleAdminPolicyRoutes(req, res, writePolicyEngine, sharedEnvConfig, govConfig, persistenceAdapter);
            return;
        }

        // 0.1 Tenant Provisioning Routes (/api/admin/tenants/*)
        if (pathname.startsWith('/api/admin/tenants')) {
            await handleTenantProvisioningRoutes(req, res, sharedEnvConfig);
            return;
        }

        // 0.2 User Management & RBAC Routes (/api/admin/users/*)
        if (pathname.startsWith('/api/admin/users')) {
            await handleUserManagementRoutes(req, res, sharedEnvConfig, govConfig);
            return;
        }

        // 0.3 Client Portal Routes (/api/portal/*)
        if (pathname === '/api/portal' || pathname.startsWith('/api/portal/')) {
            const subPath = pathname.slice('/api/portal'.length) || '/';
            await handlePortalRoutes(req, res, subPath, sharedEnvConfig);
            return;
        }

        // 0.4 Asaas Financial Gateway Routes (/api/asaas/*) — F01 CJS module
        if (pathname === '/api/asaas' || pathname.startsWith('/api/asaas/')) {
            const subPath = pathname.slice('/api/asaas'.length) || '/';
            await handleAsaasRoutes(req, res, subPath, sharedEnvConfig);
            return;
        }

        // 0.5 Authoritative Contract Public View, Token & Signature Routes (/api/contracts/*) — F02 & F04
        if (pathname === '/api/contracts' || pathname.startsWith('/api/contracts/')) {
            await handleContractRoutes(req, res, sharedEnvConfig);
            return;
        }

        // 0.6 Unified Auth Login Proxy (/api/auth/login)
        if (pathname === '/api/auth/login') {
            await handleAuthLoginRoute(req, res, sharedEnvConfig);
            return;
        }

        // 1. CORS Preflight
        if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
            sendJson(res, 204, {});
            return;
        }

        // 2. Healthcheck Endpoint
        if (pathname === '/api/health' && req.method === 'GET') {
            sendJson(res, 200, {
                status: 'ok',
                service: 'crm-hydra-production-server',
                bridgeActive: Boolean(APPWRITE_PROJECT_ID && APPWRITE_API_KEY),
                policyEngineMode: writePolicyEngine.mode,
                governanceMode: govConfig.mode,
                timestamp: new Date().toISOString()
            });
            return;
        }

        // 3. Backend API Bridge Endpoint (/api/data and /api/crm/write - R01 & F08)
        if ((pathname === '/api/data' || pathname === '/api/crm/write') && req.method === 'POST') {
            await handleDataBridge(req, res);
            return;
        }

        // 3.5Uploaded Tenant Logos Serving (/api/logos/*) — S10 safe decodeURIComponent
        if (pathname.startsWith('/api/logos/') && req.method === 'GET') {
            let decodedName = '';
            try {
                decodedName = decodeURIComponent(pathname.replace('/api/logos/', ''));
            } catch {
                sendJson(res, 400, { success: false, error: 'URI de arquivo malformada.' });
                return;
            }
            const fileName = path.basename(decodedName);
            const logoPath = path.resolve(process.cwd(), 'public', 'uploads', 'logos', fileName);
            if (fs.existsSync(logoPath) && fs.statSync(logoPath).isFile()) {
                const ext = path.extname(logoPath).toLowerCase();
                const contentType = MIME_TYPES[ext] || 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' });
                fs.createReadStream(logoPath).pipe(res);
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Logo not found' }));
            return;
        }

        // 4. Static Asset Serving from `dist/`
        let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        let filePath = path.join(DIST_DIR, safePath);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            fs.createReadStream(filePath).pipe(res);
            return;
        }

        // 5. SPA Fallback -> `dist/index.html`
        const indexHtmlPath = path.join(DIST_DIR, 'index.html');
        if (fs.existsSync(indexHtmlPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(indexHtmlPath).pipe(res);
            return;
        }

        sendJson(res, 404, { error: 'Not Found (Build dist/ directory not found. Run npm run build first).' });
    } catch (unhandledErr) {
        const statusCode = unhandledErr.statusCode || unhandledErr.code || 500;
        const httpStatus = (typeof statusCode === 'number' && statusCode >= 100 && statusCode < 600) ? statusCode : 500;
        console.error('[Server Unhandled Request Error]:', unhandledErr.message);
        sendJson(res, httpStatus, {
            success: false,
            code: unhandledErr.code || 'INTERNAL_SERVER_ERROR',
            error: unhandledErr.message || 'Erro interno ao processar requisição.'
        });
    }
});

if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`================================================================`);
        console.log(`🚀 CRM HYDRA PRODUCTION SERVER & API BRIDGE ACTIVE`);
        console.log(`📡 Listening on: http://0.0.0.0:${PORT}`);
        console.log(`🔗 Appwrite Endpoint: ${APPWRITE_ENDPOINT}`);
        console.log(`🗄️  Appwrite Database: ${APPWRITE_DATABASE_ID}`);
        console.log(`🛡️  Server API Key Configured: ${APPWRITE_API_KEY ? 'YES' : 'NO (WARNING!)'}`);
        console.log(`================================================================`);
    });
}

module.exports = {
    server,
    writePolicyEngine,
    govConfig,
    persistenceAdapter,
    handleDataBridge,
    authenticateAndResolveTenant
};
