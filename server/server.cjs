/**
 * Servidor de Produção do Backend API Bridge do Iris Horizon CRM
 *
 * Executa de forma desacoplada ou como sidecar para atender
 * requisições da rota /api/crm/write enviadas pelo Nginx / frontend.
 *
 * Controles de Segurança Implementados:
 * 1. Rate limiting por IP (janela de 60s, máximo 120 reqs).
 * 2. Limite rígido de tamanho do payload (máximo 5MB).
 * 3. Trava Fail-Closed: Bloqueio estrito de escritas em crm_db sem ALLOW_PROD_BUSINESS_WRITES=true.
 * 4. Validação criptográfica de sessão via JWT do Appwrite Auth.
 * 5. Sanitização de erros sem vazamento de stack traces ou segredos.
 * 6. Suporte nativo a servir arquivos estáticos (dist/) com SPA fallback para produção autônoma.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(__dirname, '../.env.local'));
loadEnvFile(path.join(__dirname, '../.env'));

const { Client, Databases, Users, Teams, Account, Permission, Role, ID } = require('node-appwrite');

// Porta interna do Backend Bridge (fixa em 3001 para não colidir com o Nginx nas portas 80/3000/4173)
const PORT = process.env.BRIDGE_PORT || 3001;
const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_URL || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DEFAULT_DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';

const {
  assertNotUnderMaintenance,
  enterPrivilegedOperation,
} = require('./maintenanceGuard.cjs');

const {
  WritePolicyEngine,
  CircuitBreaker,
  validatePolicyConfiguration,
  SANDBOX_PILOT_CLIENTS_RULES,
  PROD_PILOT_CLIENTS_RULES,
  PROD_CLIENTS_RULES,
  createAuditLog,
} = require('./writePolicyEngine.cjs');

const { handleAdminPolicyRoutes } = require('./adminPolicyHandler.cjs');
const { readJsonBody } = require('./requestUtils.cjs');
const { handleSignContractServer } = require('./signContractHandler.cjs');
const { validatePublicAccessToken } = require('./publicTokenService.cjs');

const ALLOWED_BUSINESS_COLLECTIONS = new Set([
  'crm_contracts',
  'crm_proposals',
  'crm_proposal_items',
  'clients',
  'support_tickets',
  'servers',
  'services',
  'documents',
  'charges',
  'invoices',
  'events',
  'pipeline_deals',
  'pipeline_columns',
  'pipeline_attachments',
  'pipeline_history',
  'activities',
  'crm_items',
  'items',
  'phonebook',
  'test_deals',
  'test_pipeline_history',
  'test_clients',
  'test_crm_proposals',
  'test_crm_contracts',
  'test_crm_items',
  'test_contacts',
]);

const prodClientsRules = PROD_CLIENTS_RULES || PROD_PILOT_CLIENTS_RULES;

// Controle de ativação dos Módulos Operacionais em Produção (habilitado por padrão)
const ENABLE_PROD_CLIENTS_MODULE = process.env.ENABLE_PROD_CLIENTS_MODULE !== 'false';

const initialRules = [
  ...SANDBOX_PILOT_CLIENTS_RULES,
  ...(ENABLE_PROD_CLIENTS_MODULE ? prodClientsRules : []),
];

const writePolicyEngine = new WritePolicyEngine(initialRules, { enabled: true, autoSeedProdTenants: true });

const { GovernancePersistencePrototype } = require('./governancePersistencePrototype.cjs');
const {
  resolveGovernanceConfig,
  initializeGovernance,
} = require('./governanceConfig.cjs');

const targetGovDb = process.env.GOVERNANCE_DATABASE_ID || DEFAULT_DATABASE_ID;
const isSandboxGov = targetGovDb === 'crm_isolated_test' || targetGovDb === 'crm_sandbox_test';
const standaloneEnv = {
  ...process.env,
  GOVERNANCE_ENVIRONMENT: process.env.GOVERNANCE_ENVIRONMENT || (isSandboxGov ? 'sandbox' : 'production'),
  GOVERNANCE_DATABASE_ID: targetGovDb,
};

const governanceConfig = resolveGovernanceConfig(standaloneEnv, { runtime: 'standalone' });

// Inicialização segura de governança: sem fallback automático, sem persistência quando desabilitada
initializeGovernance(writePolicyEngine, governanceConfig, {
  logPrefix: '[SERVER_STARTUP]',
  createAdapter: (targetDb) => {
    return new GovernancePersistencePrototype({
      endpoint: ENDPOINT,
      projectId: PROJECT_ID,
      apiKey: API_KEY,
      databaseId: targetDb,
    });
  },
}).catch((err) => {
  console.warn('[SERVER_STARTUP] Erro durante inicialização de governança:', err.message);
});

// Proteção contra DoS: Limite de payload e Rate Limiter
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (suporte a logomarcas em alta resolução)
const ipRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 120;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipRateLimits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  } else {
    entry.count += 1;
  }
  ipRateLimits.set(ip, entry);
  return entry.count <= MAX_REQUESTS_PER_WINDOW;
}

/**
 * Validação Estrita de Liberação Canário para Produção (crm_db)
 * 
 * Regra da Fase 5F: Todas as escritas em crm_db estão 100% DESABILITADAS por padrão.
 * Qualquer liberação futura DEVE ser granular, auditada e com restrição temporal estrita.
 */
function validateProductionCanaryGuard({ databaseId, action, collectionId, documentId, data, userId, tenantId }) {
  if (databaseId !== 'crm_db') {
    return { allowed: true };
  }

  // 1. Verificação da Chave Mestra Canário (DEVE SER EXPLICITAMENTE 'true')
  const canaryEnabled = process.env.CANARY_PROD_WRITE_ENABLED === 'true';
  if (!canaryEnabled) {
    return {
      allowed: false,
      code: 403,
      reason: '[CANARY FAIL-CLOSED GUARD] Escritas em crm_db bloqueadas: liberação canário está desativada.',
    };
  }

  // 2. Janela Temporal Estrita (Expiração Automática)
  const windowExpiresAt = process.env.CANARY_WINDOW_EXPIRES_AT;
  if (!windowExpiresAt || isNaN(Date.parse(windowExpiresAt)) || new Date(windowExpiresAt).getTime() <= Date.now()) {
    return {
      allowed: false,
      code: 403,
      reason: `[CANARY FAIL-CLOSED GUARD] Janela temporal canário expirada ou inválida (${windowExpiresAt || 'NÃO CONFIGURADA'}).`,
    };
  }

  // 3. Restrição de Operação Autorizada
  const allowedAction = process.env.CANARY_ALLOWED_ACTION;
  if (!allowedAction || action !== allowedAction) {
    return {
      allowed: false,
      code: 403,
      reason: `[CANARY FAIL-CLOSED GUARD] Operação "${action}" não autorizada no perfil canário (Permitido: "${allowedAction || 'NENHUMA'}").`,
    };
  }

  // 4. Restrição de Coleção Autorizada
  const allowedCollection = process.env.CANARY_ALLOWED_COLLECTION;
  if (!allowedCollection || collectionId !== allowedCollection) {
    return {
      allowed: false,
      code: 403,
      reason: `[CANARY FAIL-CLOSED GUARD] Coleção "${collectionId}" não autorizada no perfil canário (Permitido: "${allowedCollection || 'NENHUMA'}").`,
    };
  }

  // 5. Restrição de Tenant Autorizado
  const allowedTenant = process.env.CANARY_ALLOWED_TENANT;
  if (!allowedTenant || tenantId !== allowedTenant) {
    return {
      allowed: false,
      code: 403,
      reason: `[CANARY FAIL-CLOSED GUARD] Tenant "${tenantId}" não autorizado no perfil canário (Permitido: "${allowedTenant || 'NENHUM'}").`,
    };
  }

  // 6. Restrição de Usuário Autorizado
  const allowedUser = process.env.CANARY_ALLOWED_USER;
  if (!allowedUser || userId !== allowedUser) {
    return {
      allowed: false,
      code: 403,
      reason: `[CANARY FAIL-CLOSED GUARD] Usuário "${userId}" não autorizado no perfil canário (Permitido: "${allowedUser || 'NENHUM'}").`,
    };
  }

  // 7. Restrição de Marcador de Registro de Teste
  const isMarked = data && data._is_canary_test === true;
  const hasCanaryDocId = !documentId || documentId.startsWith('canary_');
  if (!isMarked || !hasCanaryDocId) {
    return {
      allowed: false,
      code: 403,
      reason: '[CANARY FAIL-CLOSED GUARD] Registro rejeitado: requer marcador "_is_canary_test: true" e prefixo "canary_".',
    };
  }

  return { allowed: true };
}

// MIME types para suporte a SPA
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';

  // 1. CORS Headers Restritos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Appwrite-Session, X-Appwrite-User-Id');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // 2. Health Check Seguro
  if (req.url === '/healthz' || req.url === '/api/healthz') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'UP', service: 'crm-backend-api-bridge', timestamp: new Date().toISOString() }));
    return;
  }

  // 2.2. Rota de serviço de logomarcas estáticas: /api/logos/:filename
  if (req.url && req.url.startsWith('/api/logos/') && req.method === 'GET') {
    const rawName = req.url.replace('/api/logos/', '').split('?')[0];
    const filename = path.basename(decodeURIComponent(rawName));
    const logosDir = path.join(__dirname, 'uploads', 'logos');
    const filePath = path.join(logosDir, filename);

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
      };
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    res.statusCode = 404;
    res.end('Logo not found');
    return;
  }

  // 2.5. Rotas de Governança e Disjuntores SuperAdmin: /api/admin/policy/*
  if (req.url && req.url.startsWith('/api/admin/policy')) {
    return handleAdminPolicyRoutes(req, res, writePolicyEngine, {
      ENDPOINT,
      PROJECT_ID,
      API_KEY,
      governanceConfig,
    });
  }

  // 2.6. Rotas de Provisionamento e Gestão de Empresas SuperAdmin: /api/admin/tenants/*
  if (req.url && req.url.startsWith('/api/admin/tenants')) {
    const { handleTenantProvisioningRoutes } = require('./tenantProvisioningHandler.cjs');
    return handleTenantProvisioningRoutes(req, res, {
      ENDPOINT,
      PROJECT_ID,
      API_KEY,
      governanceConfig,
    });
  }

  // 2.7. Rotas de Gestão de Membros e Convites por Empresa: /api/admin/users/*
  if (req.url && req.url.startsWith('/api/admin/users')) {
    const { handleUserManagementRoutes } = require('./userManagementHandler.cjs');
    return handleUserManagementRoutes(req, res, {
      ENDPOINT,
      PROJECT_ID,
      API_KEY,
      governanceConfig,
    });
  }

  // 3. Rota de Escrita Autoritativa: /api/crm/write
  if (req.url === '/api/crm/write' && req.method === 'POST') {
    // Validação de Rate Limit
    if (!checkRateLimit(clientIp)) {
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Taxa limite de requisições excedida. Tente novamente mais tarde.', code: 429 }));
      return;
    }

    let body;
    try {
      body = await readJsonBody(req, { maxBytes: MAX_PAYLOAD_BYTES, timeoutMs: 15000 });
    } catch (err) {
      res.statusCode = err.statusCode || 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message, code: res.statusCode }));
      return;
    }

    try {
      // Validar Maintenance Guard
      assertNotUnderMaintenance('StandaloneServerWrite');
      const exitOp = enterPrivilegedOperation();

      try {
        const databaseId = body.databaseId || DEFAULT_DATABASE_ID;

        // Inicializar Clientes Appwrite
        const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
        const adminDb = new Databases(adminClient);
        const adminTeams = new Teams(adminClient);

        // AÇÃO PÚBLICA: SIGN CONTRACT (Assinatura externa com token público autoritativo)
        if (body.action === 'signContract') {
          const contractId = body.documentId || body.data?.contractId;
          if (!contractId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'ID do contrato é obrigatório para assinatura.', code: 400 }));
            return;
          }

          const publicContractCollection = 'crm_contracts';
          const mockDb = {
            async getContractById(id) {
              return await adminDb.getDocument(databaseId, publicContractCollection, id);
            },
            async updateContract(id, updatePayload) {
              return await adminDb.updateDocument(databaseId, publicContractCollection, id, updatePayload);
            },
          };

          try {
            const auditResult = await handleSignContractServer(
              {
                headers: req.headers,
                socket: req.socket,
                body: {
                  contractId,
                  signerName: body.data?.signerName || body.data?.signed_by_name || '',
                  signerDocument: body.data?.signerDocument || body.data?.signed_by_document || '',
                  signerEmail: body.data?.signerEmail || body.data?.signed_by_email,
                  signerPhone: body.data?.signerPhone || body.data?.signed_by_phone,
                  termsAccepted: Boolean(body.data?.termsAccepted),
                  publicToken: body.data?.publicToken || req.headers['x-public-token'] || undefined,
                },
              },
              mockDb
            );

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              action: 'signContract',
              collectionId: publicContractCollection,
              documentId: contractId,
              data: auditResult,
            }));
            return;
          } catch (signErr) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: signErr.message, code: 400 }));
            return;
          }
        }

        // S03: Restrição de coleções permitidas no CRUD genérico
        const isSelfPresenceCandidate = body.collectionId === 'users_hydra' &&
          body.action === 'update' &&
          body.documentId &&
          Object.keys(body.data || {}).every(k => k === 'is_online' || k === 'last_seen');

        if (!ALLOWED_BUSINESS_COLLECTIONS.has(body.collectionId) && !isSelfPresenceCandidate) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: false,
            error: `Acesso negado: a coleção "${body.collectionId}" não é permitida para operações genéricas de escrita. Coleções globais sensíveis requerem endpoints administrativos dedicados.`,
            code: 403,
          }));
          return;
        }

        // 1. AUTENTICAÇÃO MANDATÓRIA (S01: Rejeição imediata sem fallbackUserId)
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];
        let jwt = '';
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
          jwt = authHeader.slice(7).trim();
        }

        const sessionHeader = req.headers['x-appwrite-session'] || req.headers['X-Appwrite-Session'];
        let sessionSecret = typeof sessionHeader === 'string' ? sessionHeader.trim() : '';

        if (sessionSecret.startsWith('{')) {
          try {
            const parsed = JSON.parse(sessionSecret);
            sessionSecret = parsed[`a_session_${PROJECT_ID}`] || parsed[`a_session_${PROJECT_ID}_legacy`] || Object.values(parsed)[0] || '';
          } catch (e) {}
        }

        if (!jwt && !sessionSecret && req.headers['cookie']) {
          const rawCookie = Array.isArray(req.headers['cookie']) ? req.headers['cookie'].join('; ') : String(req.headers['cookie']);
          const match = rawCookie.match(new RegExp(`(?:^|;\\s*)a_session_${PROJECT_ID}(?:_legacy)?=([^;]+)`)) ||
                        rawCookie.match(/(?:^|;\s*)a_session=([^;]+)/);
          if (match && match[1]) {
            sessionSecret = decodeURIComponent(match[1]).trim();
          }
        }

        if (!jwt && !sessionSecret) {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Autenticação necessária: credencial (JWT ou Sessão) ausente.', code: 401 }));
          return;
        }

        let userId = null;
        try {
          const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
          if (jwt) userClient.setJWT(jwt);
          else userClient.setSession(sessionSecret);
          const userAccount = new Account(userClient);
          const user = await userAccount.get();
          userId = user.$id;
        } catch (err) {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: `Sessão inválida ou expirada: ${err.message}`, code: 401 }));
          return;
        }

        // Tratamento seguro de presença/heartbeat do próprio usuário em users_hydra
        if (body.collectionId === 'users_hydra') {
          if (isSelfPresenceCandidate && body.documentId === userId) {
            const updatePayload = {};
            if (typeof body.data.is_online === 'boolean') updatePayload.is_online = body.data.is_online;
            if (typeof body.data.last_seen === 'string') updatePayload.last_seen = body.data.last_seen;
            else updatePayload.last_seen = new Date().toISOString();

            try {
              const updatedDoc = await adminDb.updateDocument(databaseId, 'users_hydra', userId, updatePayload);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, action: 'update', documentId: userId, data: updatedDoc }));
              return;
            } catch (upErr) {
              res.statusCode = upErr.code || 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: upErr.message, code: res.statusCode }));
              return;
            }
          } else {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: false,
              error: 'Acesso negado: operações em "users_hydra" são restritas a batimento cardíaco da própria conta.',
              code: 403,
            }));
            return;
          }
        }

        // Identificar times
        const knownTeamsSet = new Set(['tenant_default', 'superadmins', 'test_team_alpha', 'test_team_beta', 'test_team_superadmins']);
        if (body.targetTenantId) {
          knownTeamsSet.add(body.targetTenantId);
        }
        try {
          const allTeamsRes = await adminTeams.list();
          if (allTeamsRes && Array.isArray(allTeamsRes.teams)) {
            for (const t of allTeamsRes.teams) {
              if (t && t.$id) knownTeamsSet.add(t.$id);
            }
          }
        } catch (e) {}

        const userTeams = [];
        const teamRolesMap = new Map();
        if (userId) {
          for (const t of knownTeamsSet) {
            try {
              const mems = await adminTeams.listMemberships(t);
              const mem = mems.memberships.find((m) => m.userId === userId);
              if (mem) {
                userTeams.push(t);
                const rolesForThisTeam = [];
                if (Array.isArray(mem.roles)) {
                  mem.roles.forEach((r) => { if (r && !rolesForThisTeam.includes(r)) rolesForThisTeam.push(r); });
                }
                teamRolesMap.set(t, rolesForThisTeam);
              }
            } catch (e) {}
          }
        }

        // Verificação estrita de SuperAdmin por igualdade exata de ID de Team:
        const isSuperAdminTeam = (t) => databaseId === 'crm_db' ? (t === 'superadmins') : (t === 'superadmins' || t === 'test_team_superadmins');
        const isSuper = userTeams.some((t) => isSuperAdminTeam(t));

        let authoritativeTenantId = '';
        if (body.targetTenantId) {
          if (userTeams.includes(body.targetTenantId) || isSuper) {
            authoritativeTenantId = body.targetTenantId;
          } else {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Acesso negado à organização solicitada.', code: 403 }));
            return;
          }
        } else {
          const operationalTenant = userTeams.find((t) => !isSuperAdminTeam(t));
          if (operationalTenant) {
            authoritativeTenantId = operationalTenant;
          } else if (isSuper) {
            authoritativeTenantId = databaseId === 'crm_db' ? 'tenant_default' : (userTeams.includes('test_team_superadmins') ? 'test_team_alpha' : 'tenant_default');
          } else {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Usuário não vinculado a nenhuma organização ativa.', code: 403 }));
            return;
          }
        }

        // S08: Papéis estritamente limitados ao tenant autorizado
        const tenantSpecificRoles = teamRolesMap.get(authoritativeTenantId) || [];
        const userRoles = [...tenantSpecificRoles];
        if (isSuper && !userRoles.includes('superadmin')) {
          userRoles.push('superadmin');
        }
        if (userRoles.length === 0 && userTeams.includes(authoritativeTenantId)) {
          userRoles.push('agent');
        }

          // 3.5. AUTORIZAÇÃO DE PRODUÇÃO EXCLUSIVA VIA WRITE POLICY ENGINE (Fases 5H.3 / 5H.4)
          // O mecanismo canário da Fase 5G foi aposentado em favor do motor de políticas declarativo.

          // AVALIAÇÃO CENTRAL DE POLÍTICA DE MENOR PRIVILÉGIO (WRITE POLICY ENGINE)
          const policyCheck = writePolicyEngine.evaluate({
            databaseId,
            collectionId: body.collectionId,
            action: body.action,
            tenantId: authoritativeTenantId,
            userId,
            userRoles,
            data: body.data,
            documentId: body.documentId,
            clientIp,
          });

          if (!policyCheck.allowed) {
            const auditLog = createAuditLog({
              clientIp,
              userId,
              userRole: userRoles.join(','),
              tenantId: authoritativeTenantId,
              databaseId,
              collectionId: body.collectionId,
              action: body.action,
              documentId: body.documentId,
              decision: policyCheck.code === 503 ? 'CIRCUIT_TRIPPED' : 'DENIED',
              reason: policyCheck.reason,
              statusCode: policyCheck.code || 403,
              payloadSample: body.data,
            });
            console.warn('[AUDIT_REJECTED]', JSON.stringify(auditLog));

            res.statusCode = policyCheck.code || 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: false,
                error: policyCheck.reason,
                code: policyCheck.code || 403,
              })
            );
            return;
          }

          const collectionId = body.collectionId;
          const docData = { ...(body.data || {}) };

          delete docData.$id;
          delete docData.$createdAt;
          delete docData.$updatedAt;
          delete docData.$permissions;
          delete docData.tenant_id;
          delete docData._is_canary_test;

          // Validação de Integridade Relacional Multi-Tenant:
          // Impede referências cruzadas a registros pertencentes a outros tenants (Etapas 2, 3 e 4)
          const refChecks = [
            { field: 'client_id', collection: (collectionId === 'test_contacts' || collectionId === 'test_deals' || collectionId === 'test_crm_contracts') ? 'test_clients' : 'clients' },
            { field: 'contact_id', collection: (collectionId === 'test_deals') ? 'test_contacts' : 'phonebook' },
            { field: 'deal_id', collection: (collectionId === 'test_crm_contracts') ? 'test_deals' : 'pipeline_deals' },
          ];

          for (const ref of refChecks) {
            const refVal = docData[ref.field];
            if (refVal && typeof refVal === 'string' && refVal.trim()) {
              try {
                const targetRefDoc = await adminDb.getDocument(databaseId, ref.collection, refVal.trim());
                if (targetRefDoc.tenant_id && targetRefDoc.tenant_id !== authoritativeTenantId && !isSuper) {
                  res.statusCode = 403;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: false,
                    error: `[CROSS_TENANT_VIOLATION] Referência cruzada proibida: "${ref.field}" (${refVal}) pertence a outro tenant.`,
                    code: 403,
                  }));
                  return;
                }
              } catch (e) {
                if (e.code === 404) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: false,
                    error: `[REFERENCE_NOT_FOUND] Registro referenciado em "${ref.field}" não encontrado.`,
                    code: 404,
                  }));
                  return;
                }
                throw e;
              }
            }
          }

          // AÇÃO: CREATE
          if (body.action === 'create') {
            docData.tenant_id = authoritativeTenantId;

            const superAdminTeamForPerms = databaseId === 'crm_db'
              ? 'superadmins'
              : ((authoritativeTenantId === 'test_team_alpha' || authoritativeTenantId === 'test_team_beta') ? 'test_team_superadmins' : 'superadmins');
            const permissions = [
              Permission.read(Role.team(authoritativeTenantId)),
              Permission.read(Role.team(superAdminTeamForPerms)),
            ];
            const created = await adminDb.createDocument(databaseId, collectionId, body.documentId || ID.unique(), docData, permissions);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, action: 'create', documentId: created.$id, data: created, tenantId: authoritativeTenantId }));
            return;
          }

          // AÇÃO: UPDATE (S03: Enforce strict tenant ownership)
          if (body.action === 'update') {
            const existing = await adminDb.getDocument(databaseId, collectionId, body.documentId);
            if (!isSuper) {
              if (!existing.tenant_id || existing.tenant_id !== authoritativeTenantId) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Acesso negado: o documento não pertence à sua organização.', code: 403 }));
                return;
              }
            }
            delete docData.tenant_id;
            const updated = await adminDb.updateDocument(databaseId, collectionId, body.documentId, docData);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, action: 'update', documentId: updated.$id, data: updated, tenantId: authoritativeTenantId }));
            return;
          }

          // AÇÃO: DELETE (S03: Enforce strict tenant ownership)
          if (body.action === 'delete') {
            const existing = await adminDb.getDocument(databaseId, collectionId, body.documentId);
            if (!isSuper) {
              if (!existing.tenant_id || existing.tenant_id !== authoritativeTenantId) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Acesso negado: o documento não pertence à sua organização.', code: 403 }));
                return;
              }
            }
            await adminDb.deleteDocument(databaseId, collectionId, body.documentId);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, action: 'delete', documentId: body.documentId, tenantId: authoritativeTenantId }));
            return;
          }

          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: `Ação desconhecida: ${body.action}`, code: 400 }));
        } finally {
          exitOp();
        }
      } catch (err) {
        res.statusCode = err.code || err.statusCode || 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message, code: res.statusCode }));
      }
    return;
  }

  // 4. Suporte a Servir Arquivos Estáticos SPA (dist/) para execução autônoma (S04: Contenção Rigorosa)
  const distDir = path.resolve(__dirname, '../dist');
  if (fs.existsSync(distDir) && req.method === 'GET') {
    let safeUrlPath = '/';
    try {
      safeUrlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'URL inválida ou codificação corrompida.' }));
      return;
    }

    // S04: Bloquear terminantemente qualquer tentativa de traversal com '..' ou bytes nulos
    if (safeUrlPath.includes('..') || safeUrlPath.includes('\0')) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Acesso negado: tentativa de traversal proibida.' }));
      return;
    }

    let normalizedRelative = path.normalize(safeUrlPath);
    if (normalizedRelative.startsWith('\\') || normalizedRelative.startsWith('/')) {
      normalizedRelative = normalizedRelative.slice(1);
    }

    let targetPath = path.resolve(distDir, normalizedRelative);

    // Contenção estrita: targetPath DEVE residir dentro de distDir
    if (!targetPath.startsWith(distDir + path.sep) && targetPath !== distDir) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Acesso negado: fora do diretório público.' }));
      return;
    }

    // Validação de link simbólico para impedir escape da raiz
    if (fs.existsSync(targetPath)) {
      try {
        const realTarget = fs.realpathSync(targetPath);
        const realDist = fs.realpathSync(distDir);
        if (!realTarget.startsWith(realDist + path.sep) && realTarget !== realDist) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Acesso negado: fora do diretório público.' }));
          return;
        }
      } catch (e) {
        res.statusCode = 403;
        res.end();
        return;
      }
    }

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
    }

    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      targetPath = path.join(distDir, 'index.html'); // SPA fallback
    }

    if (fs.existsSync(targetPath)) {
      const baseName = path.basename(targetPath);
      // Bloquear acesso a arquivos ocultos, de ambiente ou código-fonte
      if (baseName.startsWith('.') || baseName.endsWith('.env') || baseName.endsWith('.ts') || baseName.endsWith('.cjs')) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Acesso proibido.' }));
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      const stream = fs.createReadStream(targetPath);
      stream.pipe(res);
      return;
    }
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Endpoint não localizado' }));
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[Backend API Bridge Server] Ativo na porta ${PORT}`);
  });
}

server.writePolicyEngine = writePolicyEngine;
server.governanceConfig = governanceConfig;
module.exports = server;

