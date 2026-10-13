/**
 * SuperAdmin Policy Handler — TypeScript / ESM Version
 *
 * Handler administrativo para Vite DevServer e Backend API Bridge.
 */

import { Client, Account, Teams } from 'node-appwrite';
import url from 'url';
import type { WritePolicyEngine } from './writePolicyEngine';

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
  const sessionSecret = typeof sessionHeader === 'string' ? sessionHeader.trim() : '';

  if (!jwt && !sessionSecret) {
    throw { statusCode: 401, message: 'Autenticação necessária: token JWT ausente.' };
  }

  const userClient = new Client().setEndpoint(endpoint).setProject(projectId);
  if (jwt) {
    userClient.setJWT(jwt);
  } else {
    userClient.setSession(sessionSecret);
  }

  const userAccount = new Account(userClient);
  let user: any;
  try {
    user = await userAccount.get();
  } catch (e: any) {
    throw { statusCode: 401, message: `Sessão inválida ou expirada: ${e.message}` };
  }

  const userId = user.$id;

  const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const adminTeams = new Teams(adminClient);

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
  envConfig: { ENDPOINT?: string; PROJECT_ID?: string; API_KEY?: string }
) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
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

  const readBody = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(new Error('JSON inválido no corpo da requisição.'));
        }
      });
      req.on('error', (err: any) => reject(err));
    });
  };

  try {
    if (pathname === '/api/admin/policy/status' && method === 'GET') {
      const databaseId = (parsedUrl.query.databaseId as string) || 'crm_isolated_test';
      const tenantId = (parsedUrl.query.tenantId as string) || '';

      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, databaseId, envConfig);
      const modules = policyEngine.getAllModulesStatus(databaseId, tenantId);
      const auditLogs = policyEngine.getAdminAuditLogs(30);

      sendJson(200, {
        success: true,
        databaseId,
        tenantId: tenantId || 'all',
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

    if (pathname === '/api/admin/policy/lockdown' && method === 'POST') {
      const body = await readBody();
      const targetDb = body.databaseId || 'crm_isolated_test';
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      const active = Boolean(body.active);
      const reason = body.reason || (active ? 'Lockdown global acionado pelo SuperAdmin.' : 'Lockdown global desativado pelo SuperAdmin.');

      policyEngine.setGlobalLockdownAdmin(active, reason, superAdmin.userId, clientIp);

      sendJson(200, {
        success: true,
        globalLockdown: Boolean(policyEngine.circuitBreaker.globalLockdown),
        circuitBreakerState: policyEngine.circuitBreaker.state,
        message: active
          ? 'Lockdown global acionado com sucesso: 100% das escritas suspensas.'
          : 'Lockdown global desativado. Módulos previamente bloqueados continuam bloqueados por menor privilégio.',
      });
      return;
    }

    if (pathname === '/api/admin/policy/module-pause' && method === 'POST') {
      const body = await readBody();
      if (!body.collectionId) {
        sendJson(400, { success: false, error: 'Parâmetro "collectionId" é obrigatório.' });
        return;
      }

      const targetDb = body.databaseId || 'crm_isolated_test';
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      const paused = Boolean(body.paused);
      if (paused) {
        policyEngine.pauseModuleAdmin(body.collectionId, body.reason, superAdmin.userId, clientIp);
      } else {
        policyEngine.resumeModuleAdmin(body.collectionId, superAdmin.userId, clientIp);
      }

      sendJson(200, {
        success: true,
        collectionId: body.collectionId,
        paused,
        message: paused
          ? `Módulo "${body.collectionId}" pausado com sucesso via Circuit Breaker.`
          : `Módulo "${body.collectionId}" retomado com sucesso.`,
      });
      return;
    }

    if (pathname === '/api/admin/policy/rule' && method === 'POST') {
      const body = await readBody();
      const targetDb = body.databaseId || 'crm_isolated_test';
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      const result = policyEngine.setRuleActive({
        databaseId: targetDb,
        collectionId: body.collectionId,
        action: body.action,
        tenantId: body.tenantId,
        allowedRoles: body.allowedRoles,
        enabled: Boolean(body.enabled),
        actorId: superAdmin.userId,
        clientIp,
        reason: body.reason,
      });

      sendJson(200, {
        success: true,
        ...result,
        message: body.enabled
          ? `Regra para (${body.collectionId}, ${body.action}, ${body.tenantId}) concedida com sucesso.`
          : `Regra para (${body.collectionId}, ${body.action}, ${body.tenantId}) revogada com sucesso.`,
      });
      return;
    }

    if (pathname === '/api/admin/policy/audit' && method === 'GET') {
      const databaseId = (parsedUrl.query.databaseId as string) || 'crm_isolated_test';
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, databaseId, envConfig);

      const limit = parseInt((parsedUrl.query.limit as string) || '50', 10);
      const logs = policyEngine.getAdminAuditLogs(limit);

      sendJson(200, {
        success: true,
        logs,
        count: logs.length,
      });
      return;
    }

    sendJson(404, { success: false, error: `Endpoint administrativo não encontrado: ${pathname}` });
  } catch (err: any) {
    const isForbidden = err.message && (err.message.includes('[UNAUTHORIZED_SUPERADMIN]') || err.message.includes('[PROD_GUARD]'));
    const statusCode = err.statusCode || (isForbidden ? 403 : 500);
    sendJson(statusCode, {
      success: false,
      error: err.message || 'Erro interno no processamento administrativo de políticas.',
      code: statusCode,
    });
  }
}
