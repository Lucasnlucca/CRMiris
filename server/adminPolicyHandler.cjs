/**
 * SuperAdmin Policy Handler — Iris Horizon CRM (Fase 5H)
 *
 * Centraliza o controle operacional de autorização e circuit breakers:
 * 1. Autenticação e autorização estritas de SuperAdmin verificadas no servidor.
 * 2. Consulta à API de Teams do Appwrite para comprovação de membresia no time oficial 'superadmins'.
 * 3. Rejeição sumária de qualquer alegação de papel ou tenant enviada pelo frontend.
 * 4. Nenhuma mutação de permissões ou documentos no Appwrite.
 * 5. Não liberação automática de módulos bloqueados quando lockdown global for desativado.
 * 6. Registro de auditoria administrativa em todas as operações.
 */

const { Client, Account, Teams } = require('node-appwrite');
const url = require('url');

/**
 * Autentica o usuário e valida autoritativamente a membresia no Team 'superadmins'
 */
async function authenticateAndAuthorizeSuperAdmin(headers, targetDatabaseId, envConfig) {
  const endpoint = envConfig.ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
  const projectId = envConfig.PROJECT_ID || '6a6cac620021f4c64b3f';
  const apiKey = envConfig.API_KEY || '';

  if (!apiKey) {
    const err = new Error('[SUPERADMIN_AUTH_ERROR] APPWRITE_API_KEY não configurada no servidor.');
    err.statusCode = 500;
    throw err;
  }

  // 1. Extração do token JWT ou sessão
  const authHeader = headers['authorization'] || headers['Authorization'];
  let jwt = '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    jwt = authHeader.slice(7).trim();
  }

  const sessionHeader = headers['x-appwrite-session'] || headers['X-Appwrite-Session'];
  const sessionSecret = typeof sessionHeader === 'string' ? sessionHeader.trim() : '';

  if (!jwt && !sessionSecret) {
    const err = new Error('Autenticação necessária: token JWT ausente.');
    err.statusCode = 401;
    throw err;
  }

  // 2. Validação da identidade do usuário no Appwrite Auth
  const userClient = new Client().setEndpoint(endpoint).setProject(projectId);
  if (jwt) {
    userClient.setJWT(jwt);
  } else {
    userClient.setSession(sessionSecret);
  }

  const userAccount = new Account(userClient);
  let user;
  try {
    user = await userAccount.get();
  } catch (e) {
    const err = new Error(`Sessão inválida ou expirada: ${e.message}`);
    err.statusCode = 401;
    throw err;
  }

  const userId = user.$id;

  // 3. Verificação autoritativa no Appwrite Teams API com chave mestra do servidor
  const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const adminTeams = new Teams(adminClient);

  // Em produção (crm_db): estritamente o team oficial 'superadmins'.
  // No sandbox isolado (crm_isolated_test): aceita 'superadmins' ou 'test_team_superadmins'.
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
      // Ignora erro se o time não existir
    }
  }

  if (!isMember) {
    const err = new Error('[UNAUTHORIZED_SUPERADMIN] Acesso negado: o usuário autenticado não possui membresia comprovada no Team oficial "superadmins".');
    err.statusCode = 403;
    throw err;
  }

  return {
    userId,
    userEmail: user.email,
    userName: user.name,
    verifiedTeam,
  };
}

/**
 * Processador central de rotas administrativas do Write Policy Engine
 */
async function handleAdminPolicyRoutes(req, res, policyEngine, envConfig) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';

  // Configurações padrão de headers
  res.setHeader('Content-Type', 'application/json');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Função auxiliar para enviar resposta JSON
  const sendJson = (status, payload) => {
    res.statusCode = status;
    res.end(JSON.stringify(payload));
  };

  // Leitura do corpo JSON para métodos POST
  const readBody = () => {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(new Error('JSON inválido no corpo da requisição.'));
        }
      });
      req.on('error', err => reject(err));
    });
  };

  try {
    // --------------------------------------------------------------------------
    // 1. GET /api/admin/policy/status
    // --------------------------------------------------------------------------
    if (pathname === '/api/admin/policy/status' && method === 'GET') {
      const databaseId = parsedUrl.query.databaseId || 'crm_isolated_test';
      const tenantId = parsedUrl.query.tenantId || '';

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

    // --------------------------------------------------------------------------
    // 2. POST /api/admin/policy/lockdown
    // --------------------------------------------------------------------------
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

    // --------------------------------------------------------------------------
    // 3. POST /api/admin/policy/module-pause
    // --------------------------------------------------------------------------
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

    // --------------------------------------------------------------------------
    // 4. POST /api/admin/policy/rule
    // --------------------------------------------------------------------------
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

    // --------------------------------------------------------------------------
    // 5. GET /api/admin/policy/audit
    // --------------------------------------------------------------------------
    if (pathname === '/api/admin/policy/audit' && method === 'GET') {
      const databaseId = parsedUrl.query.databaseId || 'crm_isolated_test';
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, databaseId, envConfig);

      const limit = parseInt(parsedUrl.query.limit || '50', 10);
      const logs = policyEngine.getAdminAuditLogs(limit);

      sendJson(200, {
        success: true,
        logs,
        count: logs.length,
      });
      return;
    }

    // Endpoint administrativo não reconhecido
    sendJson(404, { success: false, error: `Endpoint administrativo não encontrado: ${pathname}` });
  } catch (err) {
    const isForbidden = err.message && (err.message.includes('[UNAUTHORIZED_SUPERADMIN]') || err.message.includes('[PROD_GUARD]'));
    const statusCode = err.statusCode || (isForbidden ? 403 : 500);
    sendJson(statusCode, {
      success: false,
      error: err.message || 'Erro interno no processamento administrativo de políticas.',
      code: statusCode,
    });
  }
}

module.exports = {
  authenticateAndAuthorizeSuperAdmin,
  handleAdminPolicyRoutes,
};
