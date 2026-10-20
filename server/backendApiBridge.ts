/**
 * Backend API Bridge do Iris Horizon CRM (Server Authoritative)
 *
 * Centraliza e autoriza todas as operações de escrita da aplicação:
 * 1. Autenticação estrita do usuário via JWT do Appwrite (ou sessão autorizada).
 * 2. Determinação confiável do tenant_id a partir dos Teams reais do Appwrite Auth (via Server API Key).
 * 3. Validação de papéis (owner, admin, agent) e bloqueio de adulterações.
 * 4. Sanitização mandatória do payload (rejeição de tenant_id injetado pelo cliente).
 * 5. Imposição das permissões físicas finais por documento:
 *    [read("team:<tenantId>"), read("team:superadmins")]
 * 6. Gravação com credenciais exclusivas de servidor (APPWRITE_API_KEY).
 * 7. Suporte a fluxos públicos (assinatura de contratos via signContractHandler).
 *
 * REGRA DE SEGURANÇA: NUNCA expor este código ou APPWRITE_API_KEY no bundle cliente.
 */

import { Client, Databases, Users, Teams, Account, Permission, Role, ID } from 'node-appwrite';
import { assertNotUnderMaintenance, enterPrivilegedOperation } from './maintenanceGuard';
import { handleSignContractServer } from './signContractHandler';
import {
  WritePolicyEngine,
  SANDBOX_PILOT_CLIENTS_RULES,
  PROD_PILOT_CLIENTS_RULES,
  PROD_CLIENTS_RULES,
} from './writePolicyEngine';

const prodClientsRules = PROD_CLIENTS_RULES || PROD_PILOT_CLIENTS_RULES;

// Controle de ativação dos Módulos Operacionais em Produção (habilitado por padrão)
const ENABLE_PROD_CLIENTS_MODULE = process.env.ENABLE_PROD_CLIENTS_MODULE !== 'false';

const initialRules = [
  ...SANDBOX_PILOT_CLIENTS_RULES,
  ...(ENABLE_PROD_CLIENTS_MODULE ? prodClientsRules : []),
];

export const writePolicyEngine = new WritePolicyEngine(initialRules, { enabled: true, autoSeedProdTenants: true });

import fs from 'fs';
import path from 'path';

function getLocalEnvFallback(key: string): string {
  if (process.env[key]) return process.env[key]!;
  for (const fileName of ['.env.local', '.env']) {
    try {
      const envFile = path.resolve(process.cwd(), fileName);
      if (fs.existsSync(envFile)) {
        const lines = fs.readFileSync(envFile, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const k = trimmed.slice(0, idx).trim();
            const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (k === key) return v;
          }
        }
      }
    } catch {}
  }
  return '';
}

// Configurações do Ambiente do Servidor
const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_URL || getLocalEnvFallback('VITE_APPWRITE_URL') || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || getLocalEnvFallback('VITE_APPWRITE_PROJECT_ID') || '6a6cac620021f4c64b3f';
const API_KEY = process.env.APPWRITE_API_KEY || getLocalEnvFallback('APPWRITE_API_KEY') || '';
const DEFAULT_DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || getLocalEnvFallback('VITE_APPWRITE_DATABASE_ID') || 'crm_db';

// Coleções oficiais gerenciadas pelo CRM
export const TENANT_AWARE_COLLECTIONS = new Set([
  'clients',
  'pipeline_deals',
  'pipeline_columns',
  'pipeline_activities',
  'pipeline_history',
  'pipeline_comments',
  'pipeline_checklist',
  'pipeline_attachments',
  'crm_proposals',
  'crm_proposal_items',
  'crm_items',
  'crm_contracts',
  'support_tickets',
  'servers',
  'services',
  'documents',
  'charges',
  'invoices',
  'events',
  'activities',
  'phonebook',
  'call_history',
  'whatsapp_contacts',
  'whatsapp_messages',
  'whatsapp_config',
  'sip_config',
  'integration_configs',
  'message_templates',
  'automation_config',
  'messages',
  'user_menu_permissions',
  'notifications',
  // Coleções de teste equivalentes no sandbox
  'test_deals',
  'test_pipeline_history',
  'test_clients',
  'test_crm_proposals',
  'test_crm_contracts',
  'test_crm_items',
  'test_support_tickets',
  'test_notifications',
  'test_contacts',
  'test_integration_configs',
  'test_users_hydra',
]);

// Inicialização dos clientes administrativos de servidor
function getAdminClients() {
  if (!API_KEY) {
    throw new Error('[Backend API Bridge] APPWRITE_API_KEY não configurada no servidor.');
  }
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  return {
    adminDb: new Databases(client),
    adminUsers: new Users(client),
    adminTeams: new Teams(client),
  };
}

export interface CrmWriteRequestPayload {
  action: 'create' | 'update' | 'delete' | 'signContract';
  databaseId?: string;
  collectionId: string;
  documentId?: string;
  data?: Record<string, any>;
  permissions?: string[];
  targetTenantId?: string;
}

export interface CrmWriteResult {
  success: boolean;
  action: string;
  collectionId: string;
  documentId: string;
  data?: any;
  tenantId?: string;
  error?: string;
  code?: number;
}

/**
 * Autentica a sessão do cliente e retorna o ID do usuário verificado
 */
async function authenticateUser(headers: Record<string, string | string[] | undefined>): Promise<string> {
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
      sessionSecret = parsed[`a_session_${PROJECT_ID}`] || parsed[`a_session_${PROJECT_ID}_legacy`] || (Object.values(parsed)[0] as string) || '';
    } catch {}
  }

  if (!jwt && !sessionSecret && headers['cookie']) {
    const rawCookie = Array.isArray(headers['cookie']) ? headers['cookie'].join('; ') : String(headers['cookie']);
    const match = rawCookie.match(new RegExp(`(?:^|;\\s*)a_session_${PROJECT_ID}(?:_legacy)?=([^;]+)`)) ||
                  rawCookie.match(/(?:^|;\s*)a_session=([^;]+)/);
    if (match && match[1]) {
      sessionSecret = decodeURIComponent(match[1]).trim();
    }
  }

  if (!jwt && !sessionSecret) {
    throw { statusCode: 401, message: 'Autenticação necessária: credencial (JWT ou Sessão) ausente.' };
  }

  const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
  if (jwt) {
    userClient.setJWT(jwt);
  } else {
    userClient.setSession(sessionSecret);
  }

  try {
    const userAccount = new Account(userClient);
    const user = await userAccount.get();
    return user.$id;
  } catch (err: any) {
    throw { statusCode: 401, message: `Sessão inválida ou expirada: ${err.message || 'Erro de autenticação'}` };
  }
}

/**
 * Resolve e valida os Teams reais aos quais o usuário pertence
 */
async function resolveUserTenantAndRole(
  adminTeams: Teams,
  userId: string,
  requestedTenantId?: string,
  targetDatabaseId: string = 'crm_db'
): Promise<{ authoritativeTenantId: string; isSuperAdmin: boolean; userTeams: string[]; userRoles: string[] }> {
  const knownTeamsSet = new Set<string>([
    'tenant_default',
    'superadmins',
    'test_team_alpha',
    'test_team_beta',
    'test_team_superadmins',
  ]);

  if (requestedTenantId) {
    knownTeamsSet.add(requestedTenantId);
  }

  try {
    const allTeamsRes = await adminTeams.list();
    if (allTeamsRes && Array.isArray(allTeamsRes.teams)) {
      for (const t of allTeamsRes.teams) {
        if (t && t.$id) knownTeamsSet.add(t.$id);
      }
    }
  } catch {}

  const userTeams: string[] = [];
  const teamRolesMap = new Map<string, string[]>();

  for (const teamId of knownTeamsSet) {
    try {
      const list = await adminTeams.listMemberships(teamId);
      const mem = list.memberships.find((m) => m.userId === userId);
      if (mem) {
        userTeams.push(teamId);
        const rolesForThisTeam: string[] = [];
        if (Array.isArray(mem.roles)) {
          mem.roles.forEach((r) => { if (r && !rolesForThisTeam.includes(r)) rolesForThisTeam.push(r); });
        }
        teamRolesMap.set(teamId, rolesForThisTeam);
      }
    } catch (e) {
      // Time inexistente ou erro transitório
    }
  }

  // SuperAdmin por correspondência EXATA de Team ID.
  // Em produção (crm_db): estritamente 'superadmins'.
  // No sandbox isolado (crm_isolated_test): 'superadmins' ou 'test_team_superadmins'.
  const isSuperAdminTeam = (t: string) =>
    targetDatabaseId === 'crm_db'
      ? t === 'superadmins'
      : (t === 'superadmins' || t === 'test_team_superadmins');

  const isSuperAdmin = userTeams.some(isSuperAdminTeam);

  let authoritativeTenantId = '';

  if (requestedTenantId) {
    if (userTeams.includes(requestedTenantId) || isSuperAdmin) {
      authoritativeTenantId = requestedTenantId;
    } else {
      throw {
        statusCode: 403,
        message: `Acesso negado: Usuário "${userId}" não possui membresia na organização "${requestedTenantId}".`,
      };
    }
  } else {
    // Escolhe o tenant operacional primário (excluindo explicitamente os times SuperAdmin)
    const operationalTenant = userTeams.find((t) => !isSuperAdminTeam(t));
    if (operationalTenant) {
      authoritativeTenantId = operationalTenant;
    } else if (isSuperAdmin) {
      authoritativeTenantId =
        targetDatabaseId === 'crm_db'
          ? 'tenant_default'
          : (userTeams.includes('test_team_superadmins') ? 'test_team_alpha' : 'tenant_default');
    } else {
      throw {
        statusCode: 403,
        message: `Usuário "${userId}" não está vinculado a nenhuma organização ativa.`,
      };
    }
  }

  // S08: Papéis estritamente vinculados ao tenant autorizado (sem vazamento cruzado)
  const tenantSpecificRoles = teamRolesMap.get(authoritativeTenantId) || [];
  const userRoles: string[] = [...tenantSpecificRoles];

  if (isSuperAdmin && !userRoles.includes('superadmin')) {
    userRoles.push('superadmin');
  }
  if (userRoles.length === 0 && userTeams.includes(authoritativeTenantId)) {
    userRoles.push('agent');
  }

  return { authoritativeTenantId, isSuperAdmin, userTeams, userRoles };
}

/**
 * Validação Estrita de Liberação Canário para Produção (crm_db)
 */
export function validateProductionCanaryGuard({
  databaseId,
  action,
  collectionId,
  documentId,
  data,
  userId,
  tenantId,
}: {
  databaseId?: string;
  action: string;
  collectionId: string;
  documentId?: string;
  data?: Record<string, any>;
  userId: string;
  tenantId: string;
}): { allowed: boolean; code?: number; reason?: string } {
  if (databaseId !== 'crm_db') {
    return { allowed: true };
  }

  // 1. Verificação da Chave Mestra Canário
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

/**
 * Processador central das operações de escrita autorizadas
 */
export async function executeAuthoritativeWrite(
  req: {
    headers: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
    body: CrmWriteRequestPayload;
  }
): Promise<CrmWriteResult> {
  assertNotUnderMaintenance('executeAuthoritativeWrite');
  const exitOp = enterPrivilegedOperation();

  try {
    const { action, collectionId, data, targetTenantId } = req.body;
    let { databaseId, documentId } = req.body;
    if (!databaseId) {
      databaseId = DEFAULT_DATABASE_ID;
    }

    const { adminDb, adminTeams } = getAdminClients();

    // 1. FLUXO ESPECIAL: ASSINATURA PÚBLICA DE CONTRATOS (S02 / F03)
    if (action === 'signContract') {
      const contractId = documentId || (data && data.contractId);
      if (!contractId) {
        throw { statusCode: 400, message: 'ID do contrato é obrigatório para assinatura.' };
      }

      const publicContractCollection = 'crm_contracts';

      const mockDb = {
        async getContractById(id: string) {
          return await adminDb.getDocument(databaseId!, publicContractCollection, id);
        },
        async updateContract(id: string, updatePayload: Record<string, any>) {
          return await adminDb.updateDocument(databaseId!, publicContractCollection, id, updatePayload);
        },
      };

      const auditResult = await handleSignContractServer(
        {
          headers: req.headers,
          socket: req.socket,
          body: {
            contractId,
            signerName: data?.signerName || data?.signed_by_name || '',
            signerDocument: data?.signerDocument || data?.signed_by_document || '',
            signerEmail: data?.signerEmail || data?.signed_by_email,
            signerPhone: data?.signerPhone || data?.signed_by_phone,
            termsAccepted: Boolean(data?.termsAccepted),
            publicToken: data?.publicToken || (req.headers['x-public-token'] as string) || undefined,
          },
        },
        mockDb
      );

      return {
        success: true,
        action: 'signContract',
        collectionId: publicContractCollection,
        documentId: contractId,
        data: auditResult,
      };
    }

    // 2. AUTENTICAÇÃO MANDATÓRIA DO OPERADOR (HTTP 401 se ausente ou inválido)
    const userId = await authenticateUser(req.headers);

    // 2.5 CONTROLE DE AUTORIZAÇÃO DE PRODUÇÃO (FASE 5H)
    // Governança estrita delegada ao Write Policy Engine (menor privilégio, tuplas determinísticas e deny-by-default).

    // 3. RESOLUÇÃO AUTORITATIVA DE TENANT E PAPÉIS
    const { authoritativeTenantId, isSuperAdmin, userRoles } = await resolveUserTenantAndRole(
      adminTeams,
      userId,
      targetTenantId,
      databaseId
    );

    // 3.5. AUTORIZAÇÃO DE PRODUÇÃO EXCLUSIVA VIA WRITE POLICY ENGINE (Fases 5H.3 / 5H.4)
    // O mecanismo canário da Fase 5G foi aposentado em favor do motor de políticas declarativo.

    // 3.8. AVALIAÇÃO CENTRAL DE POLÍTICA DE MENOR PRIVILÉGIO (WRITE POLICY ENGINE)
    const policyCheck = writePolicyEngine.evaluate({
      databaseId: databaseId!,
      collectionId,
      action,
      tenantId: authoritativeTenantId,
      userId,
      userRoles,
      data,
      documentId,
      clientIp: req.socket?.remoteAddress || '127.0.0.1',
    });

    if (!policyCheck.allowed) {
      throw {
        statusCode: policyCheck.code || 403,
        message: policyCheck.reason,
      };
    }

    // 4. SANITIZAÇÃO DO PAYLOAD
    const sanitizedData: Record<string, any> = { ...(data || {}) };

    // Remove campos de controle e metadados internos
    delete sanitizedData.$id;
    delete sanitizedData.$createdAt;
    delete sanitizedData.$updatedAt;
    delete sanitizedData.$permissions;
    delete sanitizedData.$databaseId;
    delete sanitizedData.$collectionId;
    delete sanitizedData._is_canary_test;

    // Se o cliente tentou injetar outro tenant_id, rejeita ou anula
    if (sanitizedData.tenant_id && sanitizedData.tenant_id !== authoritativeTenantId && !isSuperAdmin) {
      throw {
        statusCode: 400,
        message: `Tentativa ilegal de adulteração: não é permitido ditar tenant_id ("${sanitizedData.tenant_id}") diferente da sua organização autorizada ("${authoritativeTenantId}").`,
      };
    }

    // S03: Bloquear coleções globais ou não-autorizadas do CRUD genérico
    if (!TENANT_AWARE_COLLECTIONS.has(collectionId)) {
      throw {
        statusCode: 403,
        message: `Acesso negado: a coleção "${collectionId}" não é permitida para operações genéricas de escrita. Coleções administrativas requerem rotas dedicadas.`,
      };
    }

    // Validação de Integridade Relacional Multi-Tenant:
    // Impede referências cruzadas a registros pertencentes a outros tenants (Etapas 2, 3 e 4)
    const refChecks = [
      { field: 'client_id', collection: (collectionId === 'test_contacts' || collectionId === 'test_deals' || collectionId === 'test_crm_contracts') ? 'test_clients' : 'clients' },
      { field: 'contact_id', collection: (collectionId === 'test_deals') ? 'test_contacts' : 'phonebook' },
      { field: 'deal_id', collection: (collectionId === 'test_crm_contracts') ? 'test_deals' : 'pipeline_deals' },
    ];

    for (const ref of refChecks) {
      const refVal = sanitizedData[ref.field];
      if (refVal && typeof refVal === 'string' && refVal.trim()) {
        try {
          const targetRefDoc = await adminDb.getDocument(databaseId, ref.collection, refVal.trim());
          if (targetRefDoc.tenant_id && targetRefDoc.tenant_id !== authoritativeTenantId && !isSuperAdmin) {
            throw {
              statusCode: 403,
              message: `[CROSS_TENANT_VIOLATION] Referência cruzada proibida: "${ref.field}" (${refVal}) pertence a outro tenant.`,
            };
          }
        } catch (e: any) {
          if (e.code === 404) {
            throw {
              statusCode: 404,
              message: `[REFERENCE_NOT_FOUND] Registro referenciado em "${ref.field}" não encontrado.`,
            };
          }
          throw e;
        }
      }
    }

    // 5. EXECUÇÃO DA OPERAÇÃO

    // --- CREATE ---
    if (action === 'create') {
      const docIdToUse = documentId && documentId.trim() ? documentId.trim() : ID.unique();

      sanitizedData.tenant_id = authoritativeTenantId;

      // Permissões Finais da Diretriz A: APENAS LEITURA PARA O TIME DO TENANT E SUPERADMINS!
      // (Nenhuma permissão de escrita concedida diretamente a clientes)
      const permissions: string[] = [];

      const superAdminTeamForPerms =
        databaseId === 'crm_db'
          ? 'superadmins'
          : ((authoritativeTenantId === 'test_team_alpha' || authoritativeTenantId === 'test_team_beta')
              ? 'test_team_superadmins'
              : 'superadmins');

      permissions.push(
        Permission.read(Role.team(authoritativeTenantId)),
        Permission.read(Role.team(superAdminTeamForPerms))
      );

      const created = await adminDb.createDocument(
        databaseId,
        collectionId,
        docIdToUse,
        sanitizedData,
        permissions
      );

      return {
        success: true,
        action: 'create',
        collectionId,
        documentId: created.$id,
        data: created,
        tenantId: authoritativeTenantId,
      };
    }

    // --- UPDATE ---
    if (action === 'update') {
      if (!documentId) {
        throw { statusCode: 400, message: 'documentId é obrigatório para atualização.' };
      }

      // Validação rigorosa de posse multi-tenant (S03)
      const existing = await adminDb.getDocument(databaseId, collectionId, documentId);
      if (!isSuperAdmin) {
        if (!existing.tenant_id || existing.tenant_id !== authoritativeTenantId) {
          throw {
            statusCode: 403,
            message: `Acesso negado: o documento "${documentId}" não pertence à sua organização.`,
          };
        }
      }
      // Assegura que tenant_id nunca é alterado via update
      delete sanitizedData.tenant_id;

      const updated = await adminDb.updateDocument(
        databaseId,
        collectionId,
        documentId,
        sanitizedData
      );

      return {
        success: true,
        action: 'update',
        collectionId,
        documentId: updated.$id,
        data: updated,
        tenantId: authoritativeTenantId,
      };
    }

    // --- DELETE ---
    if (action === 'delete') {
      if (!documentId) {
        throw { statusCode: 400, message: 'documentId é obrigatório para exclusão.' };
      }

      // Validação rigorosa de posse multi-tenant (S03)
      const existing = await adminDb.getDocument(databaseId, collectionId, documentId);
      if (!isSuperAdmin) {
        if (!existing.tenant_id || existing.tenant_id !== authoritativeTenantId) {
          throw {
            statusCode: 403,
            message: `Acesso negado: o documento "${documentId}" não pertence à sua organização.`,
          };
        }
      }

      await adminDb.deleteDocument(databaseId, collectionId, documentId);

      return {
        success: true,
        action: 'delete',
        collectionId,
        documentId,
        tenantId: authoritativeTenantId,
      };
    }

    throw { statusCode: 400, message: `Ação não reconhecida: "${action}".` };
  } finally {
    exitOp();
  }
}
