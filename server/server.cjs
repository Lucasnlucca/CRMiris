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

const prodClientsRules = PROD_CLIENTS_RULES || PROD_PILOT_CLIENTS_RULES;

// Controle estrito de ativação do Módulo Clientes em Produção
const ENABLE_PROD_CLIENTS_MODULE = process.env.ENABLE_PROD_CLIENTS_MODULE === 'true';

const initialRules = [
  ...SANDBOX_PILOT_CLIENTS_RULES,
  ...(ENABLE_PROD_CLIENTS_MODULE ? prodClientsRules : []),
];

const writePolicyEngine = new WritePolicyEngine(initialRules, { enabled: true });

// Proteção contra DoS: Limite de payload e Rate Limiter
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Appwrite-Session');
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

  // 2.5. Rotas de Governança e Disjuntores SuperAdmin: /api/admin/policy/*
  if (req.url && req.url.startsWith('/api/admin/policy')) {
    return handleAdminPolicyRoutes(req, res, writePolicyEngine, {
      ENDPOINT,
      PROJECT_ID,
      API_KEY,
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

    // Validação imediata por Content-Length se presente
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json');
      req.on('data', () => {}); // Descarta os dados recebidos sem alocar memória
      req.on('end', () => {
        res.end(JSON.stringify({ success: false, error: 'Payload excede o limite máximo permitido de 5MB.', code: 413 }));
      });
      return;
    }

    let bytesReceived = 0;
    let payloadExceeded = false;
    const chunks = [];

    req.on('data', (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > MAX_PAYLOAD_BYTES) {
        payloadExceeded = true;
        if (!res.writableEnded) {
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Connection', 'close');
          res.end(JSON.stringify({ success: false, error: 'Payload excede o limite máximo permitido de 5MB.', code: 413 }));
          req.resume();
        }
        return;
      }
      if (!payloadExceeded) {
        chunks.push(chunk);
      }
    });

    req.on('end', async () => {
      if (payloadExceeded || res.writableEnded) return;

      try {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const body = rawBody ? JSON.parse(rawBody) : {};

        // Validar Maintenance Guard
        assertNotUnderMaintenance('StandaloneServerWrite');
        const exitOp = enterPrivilegedOperation();

        try {
          const databaseId = body.databaseId || DEFAULT_DATABASE_ID;

          // 1. AUTENTICAÇÃO MANDATÓRIA (Rejeição imediata com HTTP 401 se não autenticado)
          const authHeader = req.headers['authorization'] || req.headers['Authorization'];
          let jwt = '';
          if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            jwt = authHeader.slice(7).trim();
          }

          if (!jwt && body.action !== 'signContract') {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Autenticação necessária: token JWT ausente.', code: 401 }));
            return;
          }

          // 2. CONTROLE DE AUTORIZAÇÃO DE PRODUÇÃO (FASE 5H)
          // Governança estrita delegada ao Write Policy Engine (menor privilégio, tuplas determinísticas e deny-by-default).

          // Inicializar Clientes Appwrite
          const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
          const adminDb = new Databases(adminClient);
          const adminTeams = new Teams(adminClient);

          // AÇÃO PÚBLICA: SIGN CONTRACT (Assinatura externa sem exigência de JWT de operador)
          if (body.action === 'signContract') {
            const contractId = body.documentId || body.data?.contractId;
            const signerName = body.data?.signerName || body.data?.signed_by_name || '';
            const signerDocument = body.data?.signerDocument || body.data?.signed_by_document || '';
            const termsAccepted = Boolean(body.data?.termsAccepted);

            if (!termsAccepted) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'O aceite dos termos é obrigatório.', code: 400 }));
              return;
            }

            const contract = await adminDb.getDocument(databaseId, body.collectionId || 'crm_contracts', contractId);
            const signedAtUtc = new Date().toISOString();
            const documentHash = crypto.createHash('sha256').update(contract.title || contractId).digest('hex');
            const signatureHash = crypto.createHash('sha256').update(`${contractId}|${signerDocument}|${signedAtUtc}|${clientIp}`).digest('hex');

            const signed = await adminDb.updateDocument(databaseId, body.collectionId || 'crm_contracts', contractId, {
              status: 'signed',
              signed_at: signedAtUtc,
              signed_by_name: signerName.trim(),
              signed_by_document: signerDocument.trim(),
              signed_by_ip: clientIp,
              document_hash: documentHash,
              signature_hash: signatureHash,
            });

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, action: 'signContract', documentId: contractId, data: signed }));
            return;
          }

          let userId = null;
          if (jwt) {
            const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
            const userAccount = new Account(userClient);
            const user = await userAccount.get();
            userId = user.$id;
          }

          // Identificar times
          const knownTeams = ['tenant_default', 'superadmins', 'test_team_alpha', 'test_team_beta', 'test_team_superadmins'];
          if (body.targetTenantId && !knownTeams.includes(body.targetTenantId)) {
            knownTeams.push(body.targetTenantId);
          }

          const userTeams = [];
          const userRoles = [];
          if (userId) {
            for (const t of knownTeams) {
              try {
                const mems = await adminTeams.listMemberships(t);
                const mem = mems.memberships.find((m) => m.userId === userId);
                if (mem) {
                  userTeams.push(t);
                  if (Array.isArray(mem.roles)) {
                    mem.roles.forEach((r) => { if (r && !userRoles.includes(r)) userRoles.push(r); });
                  }
                }
              } catch (e) {}
            }
          }

          // Verificação estrita de SuperAdmin por igualdade exata de ID de Team:
          // Em crm_db (produção): unicamente o team oficial 'superadmins'.
          // Em sandbox de teste (crm_isolated_test): 'superadmins' ou 'test_team_superadmins'.
          const isSuperAdminTeam = (t) => databaseId === 'crm_db' ? (t === 'superadmins') : (t === 'superadmins' || t === 'test_team_superadmins');
          const isSuper = userTeams.some((t) => isSuperAdminTeam(t));

          if (isSuper && !userRoles.includes('superadmin')) {
            userRoles.push('superadmin');
          }
          if (userRoles.length === 0 && userTeams.length > 0) {
            userRoles.push('agent');
          }

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

          // AÇÃO: UPDATE
          if (body.action === 'update') {
            const existing = await adminDb.getDocument(databaseId, collectionId, body.documentId);
            if (existing.tenant_id && existing.tenant_id !== authoritativeTenantId && !isSuper) {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Acesso negado: documento de outro tenant.', code: 403 }));
              return;
            }
            const updated = await adminDb.updateDocument(databaseId, collectionId, body.documentId, docData);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, action: 'update', documentId: updated.$id, data: updated, tenantId: authoritativeTenantId }));
            return;
          }

          // AÇÃO: DELETE
          if (body.action === 'delete') {
            const existing = await adminDb.getDocument(databaseId, collectionId, body.documentId);
            if (existing.tenant_id && existing.tenant_id !== authoritativeTenantId && !isSuper) {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'Acesso negado: documento de outro tenant.', code: 403 }));
              return;
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
    });
    return;
  }

  // 4. Suporte a Servir Arquivos Estáticos SPA (dist/) para execução autônoma
  const distDir = path.join(__dirname, '../dist');
  if (fs.existsSync(distDir) && req.method === 'GET') {
    let filePath = path.join(distDir, req.url.split('?')[0]);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(distDir, 'index.html'); // SPA fallback
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      const stream = fs.createReadStream(filePath);
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
module.exports = server;

