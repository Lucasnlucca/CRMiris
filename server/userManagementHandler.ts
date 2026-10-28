/**
 * ============================================================================
 * FASE 6.4 — PASSO 3: USER MANAGEMENT & RBAC HANDLER (TS / VITE DEV)
 * ============================================================================
 * TypeScript ESM counterpart for Vite dev middleware integration.
 * Enforces strict multi-tenant isolation, role hierarchy, S02 password reset
 * protection, S11 global deactivation/tenant suspension enforcement, and F17
 * full pagination of Appwrite Teams & Memberships.
 * ============================================================================
 */

import { Client, Account, Teams, Users, Databases, ID, Query } from 'node-appwrite';
import type { IncomingMessage, ServerResponse } from 'http';
import type { GovernanceConfigResolution } from './governanceConfig.ts';
import type { AdminEnvConfig } from './adminPolicyHandler.ts';
import {
    readJsonBody,
    generateSecureTemporaryPassword,
    listAllTeams,
    listAllMemberships
} from './requestUtils.ts';
import {
    issuePublicToken,
    validatePublicAccessToken,
    consumePublicToken
} from './publicTokenService.ts';

export const VALID_ROLES = ['owner', 'admin', 'comercial', 'finance', 'financial', 'support', 'operacional', 'viewer', 'member', 'agent', 'manager'];

export interface SdkOverrides {
    account?: { get: () => Promise<any> };
    adminTeams?: any;
    adminUsers?: any;
    adminDb?: any;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    if (res.headersSent) return;
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Appwrite-JWT, X-Appwrite-Session, X-Target-Database, X-Tenant-Id'
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
            `Divergência de ambiente: O cliente solicitou operação em '${clientSuppliedDb}', mas o servidor opera sob a autoridade de '${authoritativeDb}'. Operação bloqueada.`
        );
        err.statusCode = 403;
        err.code = 'TARGET_DATABASE_MISMATCH';
        throw err;
    }

    return authoritativeDb;
}

export async function authenticateAndResolveCaller(
    req: IncomingMessage,
    envConfig: AdminEnvConfig | string,
    sdkOverrides: SdkOverrides = {}
) {
    const headers = (((req as any)?.headers || req || {}) as Record<string, string>);

    let resolvedEnv: AdminEnvConfig;
    if (typeof envConfig === 'string') {
        const targetDb = envConfig;
        resolvedEnv = {
            endpoint: (sdkOverrides as any).endpoint || (sdkOverrides as any).ENDPOINT || process.env.VITE_APPWRITE_URL || process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1',
            projectId: (sdkOverrides as any).projectId || (sdkOverrides as any).PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f',
            apiKey: (sdkOverrides as any).apiKey || (sdkOverrides as any).API_KEY || process.env.APPWRITE_API_KEY || '',
            databaseId: targetDb
        };
    } else {
        resolvedEnv = envConfig;
    }

    const authHeader = (headers['authorization'] as string) || (headers['Authorization'] as string) || '';
    const jwtHeader = (headers['x-appwrite-jwt'] as string) || (headers['X-Appwrite-JWT'] as string) || '';
    const sessionHeader = (headers['x-appwrite-session'] as string) || (headers['X-Appwrite-Session'] as string) || '';

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
        const err: any = new Error('Autenticação necessária. Não autenticado: Token de sessão ou JWT ausente.');
        err.statusCode = 401;
        err.code = 'UNAUTHENTICATED';
        throw err;
    }

    let account = sdkOverrides.account;
    if (!account) {
        const userClient = new Client()
            .setEndpoint(resolvedEnv.endpoint)
            .setProject(resolvedEnv.projectId);

        if (isJwt) {
            userClient.setJWT(token);
        } else {
            userClient.setSession(token);
        }
        account = new Account(userClient);
    }

    let authUser: any;
    try {
        authUser = await account.get();
    } catch (e: any) {
        const err: any = new Error(`Sessão inválida ou expirada: ${e.message}`);
        err.statusCode = 401;
        err.code = 'INVALID_SESSION';
        throw err;
    }

    if (authUser.status === false) {
        const err: any = new Error('Acesso negado: Conta de usuário desativada globalmente.');
        err.statusCode = 403;
        err.code = 'ACCOUNT_DEACTIVATED';
        throw err;
    }

    let adminTeams = sdkOverrides.adminTeams;
    let adminUsers = sdkOverrides.adminUsers;
    let adminDb = sdkOverrides.adminDb;

    if (!adminTeams || !adminUsers || !adminDb) {
        const adminClient = new Client()
            .setEndpoint(resolvedEnv.endpoint)
            .setProject(resolvedEnv.projectId)
            .setKey(resolvedEnv.apiKey);

        if (!adminTeams) adminTeams = new Teams(adminClient);
        if (!adminUsers) adminUsers = new Users(adminClient);
        if (!adminDb) adminDb = new Databases(adminClient);
    }

    const dbId = resolvedEnv.databaseId || 'crm_db';
    if (adminDb && typeof adminDb.getDocument === 'function') {
        for (const colName of ['users_hydra', 'test_users_hydra']) {
            try {
                const userDoc: any = await adminDb.getDocument(dbId, colName, authUser.$id);
                if (userDoc && userDoc.is_active === false) {
                    const err: any = new Error('Acesso negado: Perfil de usuário desativado.');
                    err.statusCode = 403;
                    err.code = 'PROFILE_DEACTIVATED';
                    throw err;
                }
            } catch (e: any) {
                if (e && (e.code === 'PROFILE_DEACTIVATED' || e.statusCode === 403)) throw e;
                // Ignore if collection/document not present
            }
        }
    }

    const userId = authUser.$id;
    const userEmail = authUser.email || 'unknown';

    let isSuperAdmin = false;
    const superAdminTeams = [process.env.SUPERADMIN_TEAM_ID || 'superadmins'];
    if (process.env.NODE_ENV === 'test' || dbId.includes('test')) {
        superAdminTeams.push('test_team_superadmins');
    }
    const tenantRoles: Record<string, string[]> = {};

    try {
        const allTeams = await listAllTeams(adminTeams, Query);
        for (const team of allTeams) {
            try {
                const memberships = await listAllMemberships(adminTeams, team.$id, Query);
                const myMembership = memberships.find((m: any) => m.userId === userId && m.confirm !== false);
                if (myMembership) {
                    // S01: Strictly validate authoritative team.$id, NEVER trust team.name
                    if (superAdminTeams.includes(team.$id)) {
                        isSuperAdmin = true;
                    } else {
                        tenantRoles[team.$id] = myMembership.roles || [];
                    }
                }
            } catch {
                // Ignore individual team listing errors
            }
        }
    } catch (e: any) {
        console.warn('[UserManagementHandler] Warning listing teams for caller resolution:', e.message);
    }

    return {
        userId,
        email: userEmail,
        name: authUser.name || userEmail,
        isSuperAdmin,
        tenantRoles,
        adminTeams,
        adminUsers,
        adminDb
    };
}

export function resolveAndAuthorizeTenant(
    req: IncomingMessage,
    urlObj: URL,
    body: Record<string, any>,
    caller: { isSuperAdmin: boolean; tenantRoles: Record<string, string[]> }
): string {
    const requestedTenantId =
        body.tenantId ||
        urlObj.searchParams.get('tenantId') ||
        (req.headers['x-tenant-id'] as string | undefined);

    if (!requestedTenantId || typeof requestedTenantId !== 'string' || !requestedTenantId.trim()) {
        const err: any = new Error('O identificador da empresa (tenantId) é obrigatório para gestão de usuários.');
        err.statusCode = 400;
        err.code = 'MISSING_TENANT_ID';
        throw err;
    }

    const cleanTenantId = requestedTenantId.trim();

    if (caller.isSuperAdmin) {
        return cleanTenantId;
    }

    const rolesInTenant = caller.tenantRoles[cleanTenantId];
    if (!rolesInTenant) {
        const err: any = new Error(`Isolamento Multi-Tenant: Você não pertence à empresa '${cleanTenantId}'. Operação bloqueada.`);
        err.statusCode = 403;
        err.code = 'CROSS_TENANT_ACCESS_DENIED';
        throw err;
    }

    const isTenantAdmin = rolesInTenant.some(r => ['owner', 'admin'].includes(String(r).toLowerCase()));
    if (!isTenantAdmin) {
        const err: any = new Error(
            `Permissão insuficiente: Seu perfil (${rolesInTenant.join(', ')}) não possui privilégios de Administrador/Owner na empresa '${cleanTenantId}'.`
        );
        err.statusCode = 403;
        err.code = 'INSUFFICIENT_TENANT_ROLE';
        throw err;
    }

    return cleanTenantId;
}

async function assertTenantActiveForOperator(
    adminDb: any,
    targetDb: string,
    targetTenantId: string,
    isSuperAdmin: boolean
): Promise<void> {
    if (isSuperAdmin || !adminDb || typeof adminDb.getDocument !== 'function') return;
    const tenantCols = targetDb === 'crm_isolated_test' ? ['test_tenants', 'tenants'] : ['tenants', 'test_tenants'];
    for (const col of tenantCols) {
        try {
            const tenantDoc: any = await adminDb.getDocument(targetDb, col, targetTenantId);
            if (tenantDoc) {
                const status = String(tenantDoc.status || 'active').toLowerCase();
                if (status === 'suspended' || status === 'cancelled' || tenantDoc.is_active === false) {
                    const err: any = new Error(`Acesso negado: A empresa '${targetTenantId}' encontra-se suspensa ou inativa.`);
                    err.statusCode = 403;
                    err.code = 'TENANT_SUSPENDED';
                    throw err;
                }
                return;
            }
        } catch {
            // Ignore missing tenant doc
        }
    }
}

async function isUserSuperAdmin(adminTeams: any, targetUserId: string): Promise<boolean> {
    const superAdminTeams = [process.env.SUPERADMIN_TEAM_ID || 'superadmins'];
    if (process.env.NODE_ENV === 'test') {
        superAdminTeams.push('test_team_superadmins');
    }
    for (const saTeamId of superAdminTeams) {
        try {
            const memberships = await listAllMemberships(adminTeams, saTeamId, Query);
            if (memberships.some((m: any) => m.userId === targetUserId && m.confirm !== false)) {
                return true;
            }
        } catch {
            // Team may not exist
        }
    }
    return false;
}

async function logGovernanceAudit(
    adminDb: any,
    targetDb: string,
    targetTenantId: string,
    actor: { userId: string; email: string; isSuperAdmin: boolean },
    action: string,
    targetUserId: string,
    details: unknown
): Promise<void> {
    if (!adminDb || typeof adminDb.createDocument !== 'function') return;
    const auditEntry = {
        timestamp: new Date().toISOString(),
        actorId: actor.userId,
        actorEmail: actor.email,
        isSuperAdmin: actor.isSuperAdmin,
        tenantId: targetTenantId,
        action,
        targetUserId,
        details: typeof details === 'string' ? details : JSON.stringify(details)
    };

    console.log(`[USER_MGMT_AUDIT] ${auditEntry.action} | Actor: ${actor.email} | Tenant: ${targetTenantId} | TargetUser: ${targetUserId}`);

    const auditCol = targetDb === 'crm_isolated_test' ? 'test_audit_logs' : 'audit_logs';
    try {
        await adminDb.createDocument(targetDb, auditCol, ID.unique(), {
            tenant_id: targetTenantId,
            user_id: actor.userId,
            user_name: actor.email,
            action: `USER_MGMT_${action}`,
            entity_type: 'user',
            entity_id: targetUserId,
            details: auditEntry.details,
            created_at: auditEntry.timestamp
        });
    } catch {
        // Fallback to stdout log
    }
}

async function resolveActualTeamId(
    adminTeams: any,
    adminDb: any,
    targetDb: string,
    targetTenantId: string,
    QuerySdk: any
): Promise<{ teamId: string; memberships: any[] }> {
    const candidateTeamIds = [targetTenantId];
    if (!targetTenantId.startsWith('tenant_')) {
        candidateTeamIds.push(`tenant_${targetTenantId}`);
    } else {
        candidateTeamIds.push(targetTenantId.replace(/^tenant_/, ''));
    }

    for (const teamIdToTry of candidateTeamIds) {
        try {
            const mems = await listAllMemberships(adminTeams, teamIdToTry, QuerySdk);
            return { teamId: teamIdToTry, memberships: mems };
        } catch (e: any) {
            if (e.code === 404) continue;
            throw e;
        }
    }

    if (adminDb && typeof adminDb.listDocuments === 'function') {
        try {
            const tenantList = await adminDb.listDocuments(targetDb, 'tenants', [
                QuerySdk.equal('slug', targetTenantId),
                QuerySdk.limit(1)
            ]);
            if (tenantList.documents.length > 0) {
                const tDoc: any = tenantList.documents[0];
                const tTeamId = tDoc.team_id || tDoc.$id;
                try {
                    const mems = await listAllMemberships(adminTeams, tTeamId, QuerySdk);
                    return { teamId: tTeamId, memberships: mems };
                } catch (e: any) {
                    if (e.code !== 404) throw e;
                }
            }
        } catch {
            // Ignore lookup error
        }
    }

    return { teamId: targetTenantId, memberships: [] };
}

export async function handleUserManagementRoutes(
    req: IncomingMessage,
    res: ServerResponse,
    envConfig: AdminEnvConfig,
    govConfig?: GovernanceConfigResolution,
    sdkOverrides: SdkOverrides = {}
): Promise<boolean> {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return true;
    }

    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    if (!pathname.startsWith('/api/admin/users')) {
        return false;
    }

    try {
        let body: Record<string, any> = {};
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
            body = await readJsonBody(req);
        }

        const targetDb = resolveAuthoritativeTarget(req, envConfig, govConfig, body);
        const caller = await authenticateAndResolveCaller(req, envConfig, sdkOverrides);
        const { adminTeams, adminUsers, adminDb } = caller;

        if (req.method === 'GET' && pathname === '/api/admin/users') {
            const targetTenantId = resolveAndAuthorizeTenant(req, urlObj, body, caller);
            await assertTenantActiveForOperator(adminDb, targetDb, targetTenantId, caller.isSuperAdmin);

            const { memberships: membershipsList } = await resolveActualTeamId(adminTeams, adminDb, targetDb, targetTenantId, Query);

            const enrichedUsers = [];
            for (const m of membershipsList) {
                let userRecord: any = null;
                try {
                    userRecord = await adminUsers.get(m.userId);
                } catch {
                    // Fallback to membership data
                }

                const roles: string[] = m.roles || ['member'];
                const primaryRole = roles.find(r => r !== 'member') || roles[0] || 'member';
                const isUserActive = userRecord ? Boolean(userRecord.status) : Boolean(m.confirm);

                enrichedUsers.push({
                    id: m.userId,
                    userId: m.userId,
                    membershipId: m.$id,
                    name: (userRecord && userRecord.name) || m.userName || (m.userEmail ? m.userEmail.split('@')[0] : 'Usuário'),
                    email: (userRecord && userRecord.email) || m.userEmail || '',
                    role: primaryRole,
                    roles,
                    tenantId: targetTenantId,
                    status: isUserActive ? 'active' : 'inactive',
                    isActive: isUserActive,
                    confirmed: Boolean(m.confirm),
                    joined: m.$createdAt,
                    joinedAt: m.$createdAt
                });
            }

            sendJson(res, 200, {
                success: true,
                tenantId: targetTenantId,
                targetDatabase: targetDb,
                total: enrichedUsers.length,
                users: enrichedUsers,
                members: enrichedUsers
            });
            return true;
        }

        const isInviteRoute = req.method === 'POST' && (pathname === '/api/admin/users' || pathname === '/api/admin/users/invite');
        if (isInviteRoute) {
            const targetTenantId = resolveAndAuthorizeTenant(req, urlObj, body, caller);
            await assertTenantActiveForOperator(adminDb, targetDb, targetTenantId, caller.isSuperAdmin);

            const { name, email, password, role = 'comercial' } = body;

            if (!name || !email || typeof email !== 'string' || !email.includes('@')) {
                sendJson(res, 400, {
                    success: false,
                    code: 'INVALID_USER_PAYLOAD',
                    error: 'Campos obrigatórios: "name" e "email" válido.'
                });
                return true;
            }

            const cleanEmail = email.trim().toLowerCase();
            const cleanName = String(name).trim();
            const cleanRole = String(role).trim().toLowerCase();

            if (!VALID_ROLES.includes(cleanRole)) {
                sendJson(res, 400, {
                    success: false,
                    code: 'INVALID_ROLE',
                    error: `Role '${cleanRole}' inválida. Roles permitidas: ${VALID_ROLES.join(', ')}`
                });
                return true;
            }

            let targetUser: any = null;
            let wasCreated = false;

            try {
                const existingList = await adminUsers.list([Query.equal('email', [cleanEmail])]);
                if (existingList.total > 0) {
                    targetUser = existingList.users[0];
                }
            } catch {
                // Ignore query error
            }

            if (!targetUser) {
                const finalPassword = (password && String(password).length >= 8)
                    ? String(password)
                    : generateSecureTemporaryPassword();

                try {
                    targetUser = await adminUsers.create(
                        ID.unique(),
                        cleanEmail,
                        undefined,
                        finalPassword,
                        cleanName
                    );
                    wasCreated = true;
                } catch (createErr: any) {
                    sendJson(res, 400, {
                        success: false,
                        code: 'USER_CREATION_FAILED',
                        error: `Falha ao criar conta no Appwrite Auth: ${createErr.message}`
                    });
                    return true;
                }
            }

            let { teamId: actualTeamId, memberships: existingMemberships } = await resolveActualTeamId(
                adminTeams, adminDb, targetDb, targetTenantId, Query
            );

            if (existingMemberships.length === 0) {
                try {
                    await adminTeams.get(actualTeamId);
                } catch (teamGetErr: any) {
                    if (teamGetErr.code === 404) {
                        if (caller.isSuperAdmin) {
                            const teamToCreate = targetTenantId.startsWith('tenant_') ? targetTenantId : `tenant_${targetTenantId}`;
                            await adminTeams.create(teamToCreate, body.tenantName || targetTenantId);
                            actualTeamId = teamToCreate;
                        } else {
                            sendJson(res, 404, {
                                success: false,
                                code: 'TENANT_TEAM_NOT_FOUND',
                                error: `O time da empresa '${targetTenantId}' não foi encontrado no Appwrite.`
                            });
                            return true;
                        }
                    }
                }
            }

            const alreadyMember = existingMemberships.find((m: any) => m.userId === targetUser.$id);
            if (alreadyMember) {
                sendJson(res, 409, {
                    success: false,
                    code: 'USER_ALREADY_IN_TENANT',
                    error: `O usuário '${cleanEmail}' já pertence à empresa '${targetTenantId}'.`
                });
                return true;
            }

            const rolesToAssign = Array.from(new Set([cleanRole, 'member']));
            const membership = await adminTeams.createMembership(
                actualTeamId,
                rolesToAssign,
                cleanEmail,
                targetUser.$id,
                undefined,
                'https://localhost',
                cleanName
            );

            await logGovernanceAudit(adminDb, targetDb, targetTenantId, caller, 'CREATE_USER_MEMBERSHIP', targetUser.$id, {
                email: cleanEmail,
                role: cleanRole,
                wasCreatedInAuth: wasCreated,
                membershipId: membership.$id
            });

            sendJson(res, 201, {
                success: true,
                message: wasCreated
                    ? `Usuário '${cleanEmail}' criado e vinculado à empresa '${targetTenantId}' com perfil '${cleanRole}'.`
                    : `Usuário existente '${cleanEmail}' vinculado à empresa '${targetTenantId}' com perfil '${cleanRole}'.`,
                membershipId: membership.$id,
                userId: targetUser.$id,
                email: cleanEmail,
                role: cleanRole,
                user: {
                    id: targetUser.$id,
                    membershipId: membership.$id,
                    name: cleanName,
                    email: cleanEmail,
                    role: cleanRole,
                    roles: rolesToAssign,
                    tenantId: targetTenantId,
                    isActive: true
                }
            });
            return true;
        }

        const roleMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
        const isRoleRoute = (req.method === 'PUT' || req.method === 'POST') && (roleMatch || pathname === '/api/admin/users/role');
        if (isRoleRoute) {
            const targetUserId = (roleMatch && decodeURIComponent(roleMatch[1])) || body.userId;
            const targetTenantId = resolveAndAuthorizeTenant(req, urlObj, body, caller);
            await assertTenantActiveForOperator(adminDb, targetDb, targetTenantId, caller.isSuperAdmin);

            const { role, isActive, is_active } = body;
            const activeStatus = is_active !== undefined ? is_active : isActive;

            const targetIsSuperAdmin = await isUserSuperAdmin(adminTeams, targetUserId);
            if (targetIsSuperAdmin && !caller.isSuperAdmin) {
                sendJson(res, 403, {
                    success: false,
                    code: 'FORBIDDEN_SUPERADMIN_TARGET',
                    error: 'Acesso negado: Administradores de tenant não podem alterar permissões ou status de um SuperAdmin.'
                });
                return true;
            }

            const { teamId: actualTeamId, memberships } = await resolveActualTeamId(adminTeams, adminDb, targetDb, targetTenantId, Query);
            const targetMembership = memberships.find((m: any) => m.userId === targetUserId);

            if (!targetMembership) {
                sendJson(res, 404, {
                    success: false,
                    code: 'USER_NOT_IN_TENANT',
                    error: `O usuário '${targetUserId}' não pertence à empresa '${targetTenantId}'. Operação bloqueada.`
                });
                return true;
            }

            let updatedRoles = targetMembership.roles;

            if (role) {
                const cleanRole = String(role).trim().toLowerCase();
                if (!VALID_ROLES.includes(cleanRole)) {
                    sendJson(res, 400, {
                        success: false,
                        code: 'INVALID_ROLE',
                        error: `Role '${cleanRole}' inválida.`
                    });
                    return true;
                }

                if (targetUserId === caller.userId && !caller.isSuperAdmin && !['owner', 'admin'].includes(cleanRole)) {
                    const adminsInTenant = memberships.filter((m: any) =>
                        (m.roles || []).some((r: string) => ['owner', 'admin'].includes(String(r).toLowerCase()))
                    );
                    if (adminsInTenant.length <= 1) {
                        sendJson(res, 400, {
                            success: false,
                            code: 'LAST_ADMIN_PROTECTION',
                            error: 'Operação bloqueada: Você é o único administrador desta empresa e não pode remover seu próprio privilégio administrativo.'
                        });
                        return true;
                    }
                }

                updatedRoles = Array.from(new Set([cleanRole, 'member']));
                await adminTeams.updateMembership(actualTeamId, targetMembership.$id, updatedRoles);
            }

            if (typeof activeStatus === 'boolean') {
                if (!caller.isSuperAdmin) {
                    sendJson(res, 403, {
                        success: false,
                        code: 'FORBIDDEN_GLOBAL_STATUS_CHANGE',
                        error: 'Apenas SuperAdmins podem ativar/desativar globalmente uma conta de usuário.'
                    });
                    return true;
                }
                try {
                    await adminUsers.updateStatus(targetUserId, Boolean(activeStatus));
                    if (activeStatus === false && typeof adminUsers.deleteSessions === 'function') {
                        try {
                            await adminUsers.deleteSessions(targetUserId);
                        } catch {
                            // Ignore if user has no active sessions
                        }
                    }
                } catch (statusErr: any) {
                    sendJson(res, 502, {
                        success: false,
                        code: 'GLOBAL_STATUS_UPDATE_FAILED',
                        error: `Falha ao atualizar status global da conta no Appwrite Auth: ${statusErr.message}`
                    });
                    return true;
                }
            }

            await logGovernanceAudit(adminDb, targetDb, targetTenantId, caller, 'UPDATE_USER_ROLE', targetUserId, {
                previousRoles: targetMembership.roles,
                newRoles: updatedRoles,
                isActiveChanged: activeStatus
            });

            sendJson(res, 200, {
                success: true,
                message: `Permissões do usuário atualizadas na empresa '${targetTenantId}'.`,
                data: {
                    userId: targetUserId,
                    tenantId: targetTenantId,
                    roles: updatedRoles,
                    isActive: activeStatus
                }
            });
            return true;
        }

        const recoveryTokenMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/recovery-token$/);
        if (req.method === 'POST' && recoveryTokenMatch) {
            const targetUserId = decodeURIComponent(recoveryTokenMatch[1]);
            const targetTenantId = resolveAndAuthorizeTenant(req, urlObj, body, caller);
            await assertTenantActiveForOperator(adminDb, targetDb, targetTenantId, caller.isSuperAdmin);

            const targetIsSuperAdmin = await isUserSuperAdmin(adminTeams, targetUserId);
            if (targetIsSuperAdmin && !caller.isSuperAdmin) {
                sendJson(res, 403, {
                    success: false,
                    code: 'FORBIDDEN_SUPERADMIN_RECOVERY_TOKEN',
                    error: 'Acesso negado: Administradores de tenant não podem emitir token de recuperação para SuperAdmins.'
                });
                return true;
            }

            // S02: Shared Account Isolation — A local tenant admin cannot recover or take over a multi-tenant shared account
            if (!caller.isSuperAdmin && caller.userId !== targetUserId) {
                const saTeams = [process.env.SUPERADMIN_TEAM_ID || 'superadmins'];
                if (process.env.NODE_ENV === 'test' || targetDb.includes('test')) saTeams.push('test_team_superadmins');
                let userTenantCount = 0;
                const allTeams = await listAllTeams(adminTeams, Query);
                for (const t of allTeams) {
                    if (saTeams.includes(t.$id)) continue;
                    try {
                        const mList = await listAllMemberships(adminTeams, t.$id, Query);
                        if (mList.some((m: any) => m.userId === targetUserId && m.confirm !== false)) {
                            userTenantCount++;
                        }
                    } catch {}
                }
                if (userTenantCount > 1) {
                    sendJson(res, 403, {
                        success: false,
                        code: 'FORBIDDEN_SHARED_ACCOUNT_RECOVERY',
                        error: 'Acesso negado: Esta conta pertence a múltiplas empresas. A recuperação de contas compartilhadas só pode ser executada pelo próprio titular ou por um SuperAdmin global.'
                    });
                    return true;
                }
            }

            const memberships = await listAllMemberships(adminTeams, targetTenantId, Query);
            const targetMembership = memberships.find((m: any) => m.userId === targetUserId && m.confirm !== false);
            if (!targetMembership) {
                sendJson(res, 403, {
                    success: false,
                    code: 'CROSS_TENANT_RECOVERY_DENIED',
                    error: `O usuário '${targetUserId}' não pertence à empresa '${targetTenantId}'.`
                });
                return true;
            }

            const issued = issuePublicToken({
                targetType: 'user_recovery',
                targetId: targetUserId,
                tenantId: targetTenantId,
                scope: 'reset_password',
                ttlMs: 30 * 60 * 1000,
                metadata: { issuedBy: caller.email }
            });

            await logGovernanceAudit(adminDb, targetDb, targetTenantId, caller, 'ISSUE_PASSWORD_RECOVERY_TOKEN', targetUserId, {
                expiresAt: issued.expiresAt
            });

            const isSelfOrSuper = caller.isSuperAdmin || caller.userId === targetUserId;
            sendJson(res, 200, {
                success: true,
                message: isSelfOrSuper ? 'Token de recuperação emitido com sucesso.' : 'Instruções de recuperação geradas com segurança para o titular.',
                ...(isSelfOrSuper ? { recoveryToken: issued.token, expiresAt: issued.expiresAt } : { sentToUser: true, expiresAt: issued.expiresAt })
            });
            return true;
        }

        const passwordMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
        const isPasswordRoute = (req.method === 'POST' || req.method === 'PUT') && (passwordMatch || pathname === '/api/admin/users/password');
        if (isPasswordRoute) {
            const targetUserId = (passwordMatch && decodeURIComponent(passwordMatch[1])) || body.userId;
            const finalPassword = body.newPassword || body.password;
            const recoveryToken = body.recoveryToken;

            if (!targetUserId) {
                sendJson(res, 400, {
                    success: false,
                    code: 'MISSING_USER_ID',
                    error: 'Parâmetro "userId" obrigatório.'
                });
                return true;
            }

            if (!finalPassword || typeof finalPassword !== 'string' || finalPassword.length < 8) {
                sendJson(res, 400, {
                    success: false,
                    code: 'INVALID_PASSWORD',
                    error: 'A nova senha deve conter pelo menos 8 caracteres.'
                });
                return true;
            }

            const isSelf = caller.userId === targetUserId;

            if (!isSelf) {
                const targetTenantId = resolveAndAuthorizeTenant(req, urlObj, body, caller);
                await assertTenantActiveForOperator(adminDb, targetDb, targetTenantId, caller.isSuperAdmin);

                const targetIsSuperAdmin = await isUserSuperAdmin(adminTeams, targetUserId);
                if (targetIsSuperAdmin && !caller.isSuperAdmin) {
                    sendJson(res, 403, {
                        success: false,
                        code: 'FORBIDDEN_SUPERADMIN_PASSWORD_RESET',
                        error: 'Acesso negado: Administradores de tenant não podem redefinir a senha de um SuperAdmin.'
                    });
                    return true;
                }

                if (!caller.isSuperAdmin) {
                    // S02: Shared Account Isolation — A local tenant admin cannot reset password of a multi-tenant shared account
                    const saTeams = [process.env.SUPERADMIN_TEAM_ID || 'superadmins'];
                    if (process.env.NODE_ENV === 'test' || targetDb.includes('test')) saTeams.push('test_team_superadmins');
                    let userTenantCount = 0;
                    const allTeams = await listAllTeams(adminTeams, Query);
                    for (const t of allTeams) {
                        if (saTeams.includes(t.$id)) continue;
                        try {
                            const mList = await listAllMemberships(adminTeams, t.$id, Query);
                            if (mList.some((m: any) => m.userId === targetUserId && m.confirm !== false)) {
                                userTenantCount++;
                            }
                        } catch {}
                    }
                    if (userTenantCount > 1) {
                        sendJson(res, 403, {
                            success: false,
                            code: 'FORBIDDEN_SHARED_ACCOUNT_PASSWORD_RESET',
                            error: 'Segurança Multi-Tenant: A conta é compartilhada entre múltiplas empresas e não pode ter a senha alterada por administradores locais. Apenas o titular ou SuperAdmin podem alterar.'
                        });
                        return true;
                    }

                    const { memberships } = await resolveActualTeamId(adminTeams, adminDb, targetDb, targetTenantId, Query);
                    const targetMembership = memberships.find((m: any) => m.userId === targetUserId && m.confirm !== false);
                    if (!targetMembership) {
                        sendJson(res, 403, {
                            success: false,
                            code: 'CROSS_TENANT_PASSWORD_RESET_DENIED',
                            error: `Segurança Multi-Tenant: O usuário '${targetUserId}' não pertence à sua empresa ('${targetTenantId}'). Redefinição de senha bloqueada.`
                        });
                        return true;
                    }

                    if (recoveryToken && typeof recoveryToken === 'string') {
                        const tokenCheck = validatePublicAccessToken({
                            token: recoveryToken,
                            expectedScope: 'reset_password',
                            expectedTargetId: targetUserId,
                            expectedTenantId: targetTenantId
                        });

                        if (!tokenCheck.valid) {
                            sendJson(res, tokenCheck.status || 403, {
                                success: false,
                                code: tokenCheck.code || 'INVALID_RECOVERY_TOKEN',
                                error: tokenCheck.error || 'Token de recuperação inválido ou expirado.'
                            });
                            return true;
                        }

                        const consumed = consumePublicToken(recoveryToken, {
                            consumedBy: caller.userId,
                            targetUserId
                        });
                        if (!consumed.consumed) {
                            sendJson(res, 410, {
                                success: false,
                                code: 'TOKEN_REVOKED',
                                error: 'Este token de recuperação já foi utilizado.'
                            });
                            return true;
                        }
                    }
                } else {
                    try {
                        await adminUsers.get(targetUserId);
                    } catch {
                        sendJson(res, 404, {
                            success: false,
                            code: 'USER_NOT_FOUND',
                            error: `O usuário '${targetUserId}' não foi encontrado no Appwrite Auth.`
                        });
                        return true;
                    }
                }
            }

            await adminUsers.updatePassword(targetUserId, finalPassword);

            if (!isSelf && typeof adminUsers.deleteSessions === 'function') {
                try {
                    await adminUsers.deleteSessions(targetUserId);
                } catch {
                    // Ignore if user has no active sessions
                }
            }

            await logGovernanceAudit(
                adminDb,
                targetDb,
                body.tenantId || 'self',
                caller,
                isSelf ? 'SELF_PASSWORD_CHANGE' : 'ADMIN_PASSWORD_RESET',
                targetUserId,
                { isSelf }
            );

            sendJson(res, 200, {
                success: true,
                message: isSelf ? 'Sua senha foi atualizada com sucesso.' : 'Senha do usuário redefinida com sucesso.'
            });
            return true;
        }

        const deleteMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
        const isDeleteRoute = (req.method === 'DELETE' && deleteMatch) || ((req.method === 'POST' || req.method === 'DELETE') && pathname === '/api/admin/users/remove');
        if (isDeleteRoute) {
            const targetUserId = (deleteMatch && decodeURIComponent(deleteMatch[1])) || body.userId;
            const targetMembershipId = body.membershipId;
            const targetTenantId = resolveAndAuthorizeTenant(req, urlObj, body, caller);
            await assertTenantActiveForOperator(adminDb, targetDb, targetTenantId, caller.isSuperAdmin);

            if (targetUserId && targetUserId === caller.userId && !caller.isSuperAdmin) {
                sendJson(res, 400, {
                    success: false,
                    code: 'SELF_REMOVAL_BLOCKED',
                    error: 'Você não pode remover a si mesmo da empresa.'
                });
                return true;
            }

            const { teamId: actualTeamId, memberships } = await resolveActualTeamId(adminTeams, adminDb, targetDb, targetTenantId, Query);
            const targetMembership = memberships.find((m: any) =>
                (targetMembershipId && m.$id === targetMembershipId) || (targetUserId && m.userId === targetUserId)
            );

            if (!targetMembership) {
                sendJson(res, 404, {
                    success: false,
                    code: 'USER_NOT_IN_TENANT',
                    error: `O usuário '${targetUserId || targetMembershipId}' não pertence à empresa '${targetTenantId}'.`
                });
                return true;
            }

            await adminTeams.deleteMembership(actualTeamId, targetMembership.$id);

            await logGovernanceAudit(adminDb, targetDb, targetTenantId, caller, 'REMOVE_USER_FROM_TENANT', targetMembership.userId || targetUserId, {
                membershipId: targetMembership.$id,
                removedRoles: targetMembership.roles
            });

            sendJson(res, 200, {
                success: true,
                message: `Usuário removido da empresa '${targetTenantId}' com sucesso.`
            });
            return true;
        }

        // ====================================================================
        // Permissões de Menu Granulares (/api/admin/users/permissions)
        // ====================================================================
        if (req.method === 'GET' && pathname === '/api/admin/users/permissions') {
            const targetTenantId = resolveAndAuthorizeTenant(req, urlObj, body, caller);
            await assertTenantActiveForOperator(adminDb, targetDb, targetTenantId, caller.isSuperAdmin);
            const targetUserId = urlObj.searchParams.get('userId') || body.userId;
            if (!targetUserId) {
                sendJson(res, 400, {
                    success: false,
                    code: 'MISSING_USER_ID',
                    error: 'Parâmetro "userId" obrigatório.'
                });
                return true;
            }

            let permissions: any[] = [];
            if (adminDb && typeof adminDb.listDocuments === 'function') {
                try {
                    const result = await adminDb.listDocuments(targetDb, 'user_menu_permissions', [
                        Query.equal('user_id', targetUserId),
                        Query.limit(100)
                    ]);
                    permissions = (result.documents || []).map((d: any) => ({
                        id: d.$id,
                        menu_id: d.menu_id,
                        has_access: Boolean(d.has_access)
                    }));
                } catch (e: any) {
                    console.warn('[UserManagementHandler] list user_menu_permissions warning:', e.message);
                }
            }

            sendJson(res, 200, {
                success: true,
                tenantId: targetTenantId,
                userId: targetUserId,
                permissions
            });
            return true;
        }

        if (req.method === 'POST' && pathname === '/api/admin/users/permissions') {
            const targetTenantId = resolveAndAuthorizeTenant(req, urlObj, body, caller);
            await assertTenantActiveForOperator(adminDb, targetDb, targetTenantId, caller.isSuperAdmin);
            const { userId: targetUserId, permissions = {} } = body;
            if (!targetUserId) {
                sendJson(res, 400, {
                    success: false,
                    code: 'MISSING_USER_ID',
                    error: 'Parâmetro "userId" obrigatório.'
                });
                return true;
            }

            if (adminDb && typeof adminDb.listDocuments === 'function') {
                for (const [menuId, hasAccess] of Object.entries(permissions)) {
                    try {
                        const existing = await adminDb.listDocuments(targetDb, 'user_menu_permissions', [
                            Query.equal('user_id', targetUserId),
                            Query.equal('menu_id', menuId),
                            Query.limit(1)
                        ]);
                        if (existing.documents && existing.documents.length > 0) {
                            await adminDb.updateDocument(targetDb, 'user_menu_permissions', existing.documents[0].$id, {
                                has_access: Boolean(hasAccess)
                            });
                        } else {
                            await adminDb.createDocument(targetDb, 'user_menu_permissions', ID.unique(), {
                                user_id: targetUserId,
                                menu_id: menuId,
                                has_access: Boolean(hasAccess)
                            });
                        }
                    } catch (permErr: any) {
                        console.warn(`[UserManagementHandler] Failed to save permission for ${menuId}:`, permErr.message);
                    }
                }
            }

            await logGovernanceAudit(adminDb, targetDb, targetTenantId, caller, 'SAVE_USER_PERMISSIONS', targetUserId, {
                permissionsCount: Object.keys(permissions).length
            });

            sendJson(res, 200, {
                success: true,
                message: 'Permissões atualizadas com sucesso.'
            });
            return true;
        }

        // ====================================================================
        // Perfil de Usuário (/api/admin/users/profile)
        // ====================================================================
        if ((req.method === 'PUT' || req.method === 'PATCH') && pathname === '/api/admin/users/profile') {
            const targetUserId = body.userId || caller.userId;
            const cleanName = body.name ? String(body.name).trim() : '';

            if (targetUserId !== caller.userId && !caller.isSuperAdmin) {
                sendJson(res, 403, {
                    success: false,
                    code: 'FORBIDDEN_PROFILE_UPDATE',
                    error: 'Você só pode atualizar seu próprio perfil.'
                });
                return true;
            }

            if (cleanName && typeof adminUsers.updateName === 'function') {
                await adminUsers.updateName(targetUserId, cleanName);
            }

            sendJson(res, 200, {
                success: true,
                message: 'Perfil atualizado com sucesso.',
                user: {
                    id: targetUserId,
                    name: cleanName
                }
            });
            return true;
        }

        sendJson(res, 404, {
            success: false,
            code: 'USER_MGMT_ROUTE_NOT_FOUND',
            error: `Rota de gestão de usuários não encontrada: ${req.method} ${pathname}`
        });
        return true;

    } catch (err: any) {
        const statusCode = err.statusCode || 500;
        const code = err.code || 'INTERNAL_USER_MGMT_ERROR';
        console.error(`[UserManagementHandler] Erro (${statusCode} - ${code}):`, err.message);

        sendJson(res, statusCode, {
            success: false,
            code,
            error: err.message || 'Erro interno ao processar gestão de usuários.'
        });
        return true;
    }
}
