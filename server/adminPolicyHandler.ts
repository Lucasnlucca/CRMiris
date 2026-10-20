/**
 * SuperAdmin Policy Handler — TypeScript / ESM Version
 *
 * Handler administrativo para Vite DevServer e Backend API Bridge.
 */

import { Client, Account, Teams } from 'node-appwrite';
import url from 'url';
import type { WritePolicyEngine } from './writePolicyEngine';
import { resolveGovernanceConfig } from './governanceConfig';
import { readJsonBody } from './requestUtils';

function resolveAuthoritativeTarget(
  envConfig: any,
  policyEngine: WritePolicyEngine,
  clientSuppliedDb?: string
): string {
  const govConfig = envConfig && envConfig.governanceConfig
    ? envConfig.governanceConfig
    : (policyEngine && (policyEngine as any).governanceDatabaseId
        ? { databaseId: (policyEngine as any).governanceDatabaseId, status: 'READY' }
        : resolveGovernanceConfig(process.env, { runtime: 'standalone' }));

  if (!govConfig || govConfig.status !== 'READY' || !govConfig.databaseId) {
    const err: any = new Error('[GOVERNANCE_CONFIG_ERROR] Configuração de governança do servidor indisponível ou inválida. Operações administrativas bloqueadas.');
    err.statusCode = 503;
    throw err;
  }

  const authoritativeDb: string = govConfig.databaseId;

  if (clientSuppliedDb && typeof clientSuppliedDb === 'string' && clientSuppliedDb.trim() !== '') {
    if (clientSuppliedDb.trim() !== authoritativeDb) {
      const err: any = new Error(`[CLIENT_DATABASE_OVERRIDE_REJECTED] Seleção de banco pelo cliente ("${clientSuppliedDb}") rejeitada. O servidor opera exclusivamente no banco autoritativo configurado ("${authoritativeDb}").`);
      err.statusCode = 403;
      throw err;
    }
  }

  return authoritativeDb;
}

export async function authenticateAndAuthorizeSuperAdmin(
  headers: Record<string, string | string[] | undefined>,
  targetDatabaseId: string,
  envConfig: { ENDPOINT?: string; PROJECT_ID?: string; API_KEY?: string }
) {
  const endpoint = envConfig.ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
  const projectId = envConfig.PROJECT_ID || '6a6cac620021f4c64b3f';
  const apiKey = envConfig.API_KEY || '';

  if (!apiKey) {
    throw { statusCode: 500, message: '[SUPERADMIN_AUTH_ERROR] APPWRITE_API_KEY não configurada no servidor.' };
  }

  const authHeader = headers['authorization'] || headers['Authorization'];
  let jwt = '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    jwt = authHeader.slice(7).trim();
  }

  const sessionHeader = headers['x-appwrite-session'] || headers['X-Appwrite-Session'];
  let sessionSecret = typeof sessionHeader === 'string' ? sessionHeader.trim() : '';

  if (sessionSecret.startsWith('{')) {
    try {
      const parsed = JSON.parse(sessionSecret);
      sessionSecret = parsed[`a_session_${projectId}`] || parsed[`a_session_${projectId}_legacy`] || Object.values(parsed)[0] as string || '';
    } catch {}
  }

  // Extrai sessão dos cookies do navegador se não enviado via header customizado
  if (!jwt && !sessionSecret && headers['cookie']) {
    const rawCookie = Array.isArray(headers['cookie']) ? headers['cookie'].join('; ') : String(headers['cookie']);
    const match = rawCookie.match(new RegExp(`(?:^|;\\s*)a_session_${projectId}(?:_legacy)?=([^;]+)`)) ||
                  rawCookie.match(/(?:^|;\s*)a_session=([^;]+)/);
    if (match && match[1]) {
      sessionSecret = decodeURIComponent(match[1]).trim();
    }
  }

  if (!jwt && !sessionSecret) {
    throw { statusCode: 401, message: 'Autenticação necessária: credencial (JWT ou Sessão) ausente.' };
  }

  const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const adminTeams = new Teams(adminClient);

  let user: any = null;

  const userClient = new Client().setEndpoint(endpoint).setProject(projectId);
  if (jwt) {
    userClient.setJWT(jwt);
  } else {
    userClient.setSession(sessionSecret);
  }
  const userAccount = new Account(userClient);
  try {
    user = await userAccount.get();
  } catch (e: any) {
    throw { statusCode: 401, message: `Sessão inválida ou expirada: ${e.message}` };
  }

  const userId = user.$id;

  const superAdminTeams = targetDatabaseId === 'crm_db'
    ? ['superadmins']
    : ['superadmins', 'test_team_superadmins'];

  let isMember = false;
  let verifiedTeam = '';

  for (const teamId of superAdminTeams) {
    try {
      const list = await adminTeams.listMemberships(teamId);
      const mem = list.memberships.find(m => m.userId === userId);
      if (mem) {
        isMember = true;
        verifiedTeam = teamId;
        break;
      }
    } catch (e) {
      // time inexistente ou transitório
    }
  }

  if (!isMember) {
    throw {
      statusCode: 403,
      message: '[UNAUTHORIZED_SUPERADMIN] Acesso negado: o usuário autenticado não possui membresia comprovada no Team oficial "superadmins".',
    };
  }

  return {
    userId,
    userEmail: user.email,
    userName: user.name,
    verifiedTeam,
  };
}

export async function handleAdminPolicyRoutes(
  req: any,
  res: any,
  policyEngine: WritePolicyEngine,
  envConfig: { ENDPOINT?: string; PROJECT_ID?: string; API_KEY?: string; governanceConfig?: any }
) {
  const parsedUrl = url.parse(req.url, true);
  const rawPath = parsedUrl.pathname || '';
  const subPath = rawPath.startsWith('/api/admin/policy')
    ? rawPath.slice('/api/admin/policy'.length)
    : rawPath;
  const normalizedPath = subPath ? (subPath.startsWith('/') ? subPath : `/${subPath}`) : '/';
  const method = req.method;
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '127.0.0.1';

  res.setHeader('Content-Type', 'application/json');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const sendJson = (status: number, payload: any) => {
    res.statusCode = status;
    res.end(JSON.stringify(payload));
  };

  // Leitura segura do corpo JSON para métodos POST (S10)
  const readBody = (): Promise<any> => readJsonBody(req, { maxBytes: 1024 * 1024 });

  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const sessionHeader = req.headers['x-appwrite-session'] || req.headers['X-Appwrite-Session'];
    const hasAuth = (typeof authHeader === 'string' && authHeader.startsWith('Bearer ') && authHeader.slice(7).trim()) ||
                    (typeof sessionHeader === 'string' && sessionHeader.trim()) ||
                    Boolean(req.headers['cookie']);
    if (!hasAuth) {
      sendJson(401, { success: false, error: 'Autenticação necessária: token JWT ausente.', code: 401 });
      return;
    }

    if ((normalizedPath === '/status' || rawPath === '/api/admin/policy/status') && method === 'GET') {
      const targetDb = resolveAuthoritativeTarget(envConfig, policyEngine, parsedUrl.query.databaseId as string);
      const tenantId = (parsedUrl.query.tenantId as string) || '';

      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      if (policyEngine.persistenceAdapter && (policyEngine as any).governanceDatabaseId === targetDb) {
        try {
          await policyEngine.syncFromDurable(targetDb);
        } catch (syncErr: any) {
          console.warn('[ADMIN_STATUS_SYNC_WARN] Falha ao sincronizar estado durável no /status:', syncErr.message);
        }
      }

      const modules = policyEngine.getAllModulesStatus(targetDb, tenantId);
      const auditLogs = policyEngine.getAdminAuditLogs(30);

      sendJson(200, {
        success: true,
        databaseId: targetDb,
        tenantId: tenantId || 'all',
        stateVersion: policyEngine.stateVersion || 1,
        updatedAt: policyEngine.lastDurableSyncAt || new Date().toISOString(),
        updatedBy: policyEngine.lastDurableSyncBy || 'system',
        globalLockdown: Boolean(policyEngine.circuitBreaker.globalLockdown),
        circuitBreakerState: policyEngine.circuitBreaker.state,
        tripReason: policyEngine.circuitBreaker.tripReason,
        consecutiveFailures: policyEngine.circuitBreaker.consecutiveFailures,
        modules,
        auditLogs,
        superAdmin: {
          userId: superAdmin.userId,
          userEmail: superAdmin.userEmail,
          verifiedTeam: superAdmin.verifiedTeam,
        },
      });
      return;
    }

    if ((normalizedPath === '/lockdown' || rawPath === '/api/admin/policy/lockdown') && method === 'POST') {
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, policyEngine, body.databaseId);
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      const active = Boolean(body.active);
      const reason = body.reason || (active ? 'Lockdown global acionado pelo SuperAdmin.' : 'Lockdown global desativado pelo SuperAdmin.');

      const result = await policyEngine.setGlobalLockdownAdminPersistent({
        databaseId: targetDb,
        active,
        reason,
        actorId: superAdmin.userId,
        clientIp,
        expectedVersion: typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
      });

      sendJson(200, {
        success: true,
        globalLockdown: Boolean(policyEngine.circuitBreaker.globalLockdown),
        circuitBreakerState: policyEngine.circuitBreaker.state,
        stateVersion: result.stateVersion,
        updatedAt: result.updatedAt,
        message: active
          ? 'Lockdown global acionado com sucesso: 100% das escritas suspensas.'
          : 'Lockdown global desativado. Módulos previamente bloqueados continuam bloqueados por menor privilégio.',
      });
      return;
    }

    if ((normalizedPath === '/module-pause' || rawPath === '/api/admin/policy/module-pause') && method === 'POST') {
      const body = await readBody();
      if (!body.collectionId) {
        sendJson(400, { success: false, error: 'Parâmetro "collectionId" é obrigatório.' });
        return;
      }

      const targetDb = resolveAuthoritativeTarget(envConfig, policyEngine, body.databaseId);
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      const paused = Boolean(body.paused);
      const result = await policyEngine.pauseModuleAdminPersistent({
        databaseId: targetDb,
        collectionId: body.collectionId,
        paused,
        reason: body.reason,
        actorId: superAdmin.userId,
        clientIp,
        expectedVersion: typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
      });

      sendJson(200, {
        success: true,
        collectionId: body.collectionId,
        paused,
        stateVersion: result.stateVersion,
        updatedAt: result.updatedAt,
        message: paused
          ? `Módulo "${body.collectionId}" pausado com sucesso via Circuit Breaker.`
          : `Módulo "${body.collectionId}" retomado com sucesso.`,
      });
      return;
    }

    if ((normalizedPath === '/rule' || rawPath === '/api/admin/policy/rule') && method === 'POST') {
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, policyEngine, body.databaseId);
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      const result = await policyEngine.setRuleActivePersistent({
        databaseId: targetDb,
        collectionId: body.collectionId,
        action: body.action,
        tenantId: body.tenantId,
        allowedRoles: body.allowedRoles,
        enabled: Boolean(body.enabled),
        actorId: superAdmin.userId,
        clientIp,
        reason: body.reason,
        expectedVersion: typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
      });

      sendJson(200, {
        ...result,
        success: true,
        stateVersion: result.stateVersion,
        updatedAt: result.updatedAt,
        message: body.enabled
          ? `Regra para (${body.collectionId}, ${body.action}, ${body.tenantId}) concedida com sucesso.`
          : `Regra para (${body.collectionId}, ${body.action}, ${body.tenantId}) revogada com sucesso.`,
      });
      return;
    }

    if ((normalizedPath === '/audit' || rawPath === '/api/admin/policy/audit') && method === 'GET') {
      const targetDb = resolveAuthoritativeTarget(envConfig, policyEngine, parsedUrl.query.databaseId as string);
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      const limit = parseInt((parsedUrl.query.limit as string) || '50', 10);
      const logs = policyEngine.getAdminAuditLogs(limit);

      sendJson(200, {
        success: true,
        logs,
        count: logs.length,
        requestedBy: superAdmin.userId,
      });
      return;
    }

    sendJson(404, { success: false, error: `Endpoint administrativo não encontrado: ${rawPath}` });
  } catch (err: any) {
    const isConflict = err.statusCode === 409 || (err.message && err.message.includes('CONCURRENCY_CONFLICT'));
    const isForbidden = err.statusCode === 403 || (err.message && (err.message.includes('[UNAUTHORIZED_SUPERADMIN]') || err.message.includes('[PROD_GUARD]')));
    const isAuth = err.statusCode === 401;
    const statusCode = err.statusCode || (isConflict ? 409 : (isForbidden ? 403 : (isAuth ? 401 : 500)));
    sendJson(statusCode, {
      success: false,
      error: err.message || 'Erro interno no processamento administrativo de políticas.',
      code: statusCode,
      currentVersion: err.currentVersion,
    });
  }
}
