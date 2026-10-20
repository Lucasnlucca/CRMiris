/**
 * Tenant Provisioning Handler — Iris Horizon CRM (Fase SaaS-01)
 *
 * Gerencia o provisionamento autoritativo de empresas no backend:
 * 1. Autenticação e autorização estritas de SuperAdmin verificadas no servidor.
 * 2. Validação de slug único (regex ^[a-z0-9-]+$) e campos comerciais.
 * 3. Listagem de empresas cadastradas.
 * 4. Criação de nova empresa com criação automática correspondente do Team no Appwrite.
 * 5. Atualização de dados da empresa (nome, trade_name, status, plano, logo_url, cores).
 * 6. Registro de auditoria administrativa.
 */

import { Client, Databases, Teams, ID, Query, Permission, Role } from 'node-appwrite';
import url from 'url';
import { authenticateAndAuthorizeSuperAdmin } from './adminPolicyHandler';
import { resolveGovernanceConfig } from './governanceConfig';
import { readJsonBody } from './requestUtils';

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  trade_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  status?: 'active' | 'suspended' | 'trial' | 'cancelled';
  plan?: 'free' | 'starter' | 'pro' | 'enterprise';
  logo_url?: string;
  primary_color?: string;
  address?: string;
  settings_json?: string;
  databaseId?: string;
}

function resolveAuthoritativeTarget(
  envConfig: any,
  clientSuppliedDb?: string
): string {
  const govConfig = envConfig && envConfig.governanceConfig
    ? envConfig.governanceConfig
    : resolveGovernanceConfig(process.env, { runtime: 'standalone' });

  let authoritativeDb = govConfig && govConfig.status === 'READY' ? govConfig.databaseId : null;

  if (!authoritativeDb && clientSuppliedDb && typeof clientSuppliedDb === 'string') {
    const trimmed = clientSuppliedDb.trim();
    if (trimmed === 'crm_isolated_test' || trimmed === 'crm_sandbox_test' || trimmed === 'crm_db') {
      authoritativeDb = trimmed;
    }
  }

  if (!authoritativeDb) {
    if (process.env.NODE_ENV === 'test' || !process.env.NODE_ENV) {
      authoritativeDb = 'crm_isolated_test';
    } else {
      const err: any = new Error('[GOVERNANCE_CONFIG_ERROR] Configuração de governança indisponível. Operações de tenant bloqueadas.');
      err.statusCode = 503;
      throw err;
    }
  }

  if (govConfig && govConfig.databaseId && clientSuppliedDb && typeof clientSuppliedDb === 'string' && clientSuppliedDb.trim() !== '') {
    if (clientSuppliedDb.trim() !== govConfig.databaseId) {
      const err: any = new Error(`[CLIENT_DATABASE_OVERRIDE_REJECTED] Seleção de banco pelo cliente ("${clientSuppliedDb}") rejeitada. O servidor opera exclusivamente no banco autoritativo configurado ("${govConfig.databaseId}").`);
      err.statusCode = 403;
      throw err;
    }
  }

  return authoritativeDb;
}

function validateSlug(slug: string): string {
  if (!slug || typeof slug !== 'string') {
    throw { statusCode: 400, message: 'O slug da empresa é obrigatório.' };
  }
  const cleanSlug = slug.trim().toLowerCase();
  if (cleanSlug.length < 2 || cleanSlug.length > 50) {
    throw { statusCode: 400, message: 'O slug deve conter entre 2 e 50 caracteres.' };
  }
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(cleanSlug)) {
    throw {
      statusCode: 400,
      message: 'Slug inválido. Utilize apenas letras minúsculas, números e hífens (ex: acme-tech).',
    };
  }

  const reservedSlugs = new Set([
    'api',
    'admin',
    'superadmin',
    'login',
    'register',
    'auth',
    'proposta',
    'contrato',
    'assinar',
    'dashboard',
    'settings',
    'static',
    'public',
  ]);

  if (reservedSlugs.has(cleanSlug)) {
    throw { statusCode: 400, message: `O slug "${cleanSlug}" é reservado pelo sistema.` };
  }

  return cleanSlug;
}

export async function handleTenantProvisioningRoutes(
  req: any,
  res: any,
  envConfig: { ENDPOINT?: string; PROJECT_ID?: string; API_KEY?: string; governanceConfig?: any }
) {
  const parsedUrl = url.parse(req.url, true);
  const rawPath = parsedUrl.pathname || '';
  const subPath = rawPath.startsWith('/api/admin/tenants')
    ? rawPath.slice('/api/admin/tenants'.length)
    : rawPath;
  const normalizedPath = subPath ? (subPath.startsWith('/') ? subPath : `/${subPath}`) : '/';
  const method = req.method;

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
    const endpoint = envConfig.ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
    const projectId = envConfig.PROJECT_ID || '6a6cac620021f4c64b3f';
    const apiKey = envConfig.API_KEY || '';

    if (!apiKey) {
      sendJson(500, { success: false, error: 'APPWRITE_API_KEY não configurada no servidor.', code: 500 });
      return;
    }

    const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const adminDb = new Databases(adminClient);
    const adminTeams = new Teams(adminClient);

    // 1. GET /api/admin/tenants — Listar todas as empresas cadastradas
    if (normalizedPath === '/' && method === 'GET') {
      const targetDb = resolveAuthoritativeTarget(envConfig, parsedUrl.query.databaseId as string);
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      const collectionName = targetDb === 'crm_db' ? 'tenants' : 'test_tenants';
      const listRes = await adminDb.listDocuments(targetDb, collectionName, [Query.limit(100)]);

      const tenants = listRes.documents.map((d: any) => ({
        id: d.$id,
        name: d.name || 'Empresa sem nome',
        slug: d.slug || d.$id.replace(/_/g, '-'),
        trade_name: d.trade_name || '',
        document: d.document || '',
        email: d.email || '',
        phone: d.phone || '',
        status: d.status || 'active',
        plan: d.plan || 'pro',
        logo_url: d.logo_url || '',
        primary_color: d.primary_color || '#4f46e5',
        address: d.address || '',
        settings_json: d.settings_json || '',
        created_at: d.created_at || d.$createdAt,
      }));

      sendJson(200, {
        success: true,
        databaseId: targetDb,
        tenants,
        total: tenants.length,
        superAdmin: {
          userId: superAdmin.userId,
          verifiedTeam: superAdmin.verifiedTeam,
        },
      });
      return;
    }

    // 1.1 GET /api/admin/tenants/resolve/:slug — Resolução de empresa por slug (para navegação e rotas multi-tenant)
    const resolveMatch = normalizedPath.match(/^\/resolve\/([a-zA-Z0-9_-]+)$/);
    if (resolveMatch && method === 'GET') {
      const targetSlug = resolveMatch[1].toLowerCase();
      const targetDb = resolveAuthoritativeTarget(envConfig, parsedUrl.query.databaseId as string);
      const collectionName = targetDb === 'crm_db' ? 'tenants' : 'test_tenants';

      const resList = await adminDb.listDocuments(targetDb, collectionName, [
        Query.equal('slug', targetSlug),
        Query.limit(1),
      ]);

      if (resList.total > 0) {
        const d = resList.documents[0];
        sendJson(200, {
          success: true,
          tenant: {
            id: d.$id,
            name: d.name || 'Empresa sem nome',
            slug: d.slug || targetSlug,
            trade_name: d.trade_name || d.name,
            document: d.document || '',
            email: d.email || '',
            phone: d.phone || '',
            status: d.status || 'active',
            plan: d.plan || 'pro',
            logo_url: d.logo_url || '',
            primary_color: d.primary_color || '#4f46e5',
            address: d.address || '',
            settings_json: d.settings_json || '',
            created_at: d.created_at || d.$createdAt,
          },
        });
      } else {
        sendJson(404, { success: false, error: `Empresa com slug "/${targetSlug}" não encontrada.`, code: 404 });
      }
      return;
    }

    // 2. POST /api/admin/tenants — Criar nova empresa (provisionamento seguro)
    if (normalizedPath === '/' && method === 'POST') {
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, body.databaseId);
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        sendJson(400, { success: false, error: 'O nome da empresa é obrigatório.', code: 400 });
        return;
      }

      const slug = validateSlug(body.slug);
      const collectionName = targetDb === 'crm_db' ? 'tenants' : 'test_tenants';

      // Verificar unicidade do slug no banco autoritativo
      const existing = await adminDb.listDocuments(targetDb, collectionName, [
        Query.equal('slug', slug),
        Query.limit(1),
      ]);

      if (existing.total > 0) {
        sendJson(409, {
          success: false,
          error: `O slug "${slug}" já está em uso por outra empresa cadastrada.`,
          code: 409,
        });
        return;
      }

      const tenantId = targetDb === 'crm_db'
        ? `tenant_${slug.replace(/-/g, '_')}`
        : `test_tenant_${slug.replace(/-/g, '_')}`;

      // Criar Team correspondente no Appwrite (se ainda não existir)
      try {
        await adminTeams.create(tenantId, body.name.trim());
      } catch (teamErr: any) {
        // Se o time já existe, reutiliza sem erro fatal
        console.warn(`[Provisioning] Aviso ao criar Team ${tenantId}:`, teamErr.message);
      }

      const now = new Date().toISOString();
      const tenantDocData: Record<string, any> = {
        name: body.name.trim(),
        slug,
        trade_name: body.trade_name ? String(body.trade_name).trim() : body.name.trim(),
        document: body.document ? String(body.document).trim() : '',
        email: body.email ? String(body.email).trim() : '',
        phone: body.phone ? String(body.phone).trim() : '',
        status: body.status || 'active',
        plan: body.plan || 'pro',
        logo_url: body.logo_url || '',
        primary_color: body.primary_color || '#4f46e5',
        address: body.address || '',
        settings_json: body.settings_json || '{}',
        created_at: now,
        updated_at: now,
      };

      const superAdminTeam = targetDb === 'crm_db' ? 'superadmins' : 'test_team_superadmins';
      const tenantPermissions = [
        Permission.read(Role.team(tenantId)),
        Permission.read(Role.team(superAdminTeam)),
        Permission.read(Role.users()),
      ];

      const doc = await adminDb.createDocument(
        targetDb,
        collectionName,
        tenantId,
        tenantDocData,
        tenantPermissions
      );

      // Provisionar colunas padrão de Kanban para a nova empresa em crm_db
      if (targetDb === 'crm_db') {
        const defaultColumns = [
          { name: 'Novo Lead', color: '#3B82F6', position: 0 },
          { name: 'Contato Feito', color: '#6366F1', position: 1 },
          { name: 'Proposta Enviada', color: '#F59E0B', position: 2 },
          { name: 'Negociação', color: '#8B5CF6', position: 3 },
          { name: 'Fechado Ganho', color: '#10B981', position: 4 },
        ];
        const colPerms = [
          Permission.read(Role.team(tenantId)),
          Permission.read(Role.team('superadmins')),
        ];
        for (const col of defaultColumns) {
          try {
            await adminDb.createDocument(
              targetDb,
              'pipeline_columns',
              ID.unique(),
              {
                name: col.name,
                color: col.color,
                position: col.position,
                tenant_id: tenantId,
              },
              colPerms
            );
          } catch {}
        }
      }

      sendJson(201, {
        success: true,
        databaseId: targetDb,
        createdBy: superAdmin.userId,
        tenant: {
          id: doc.$id,
          ...tenantDocData,
        },
        message: `Empresa "${body.name.trim()}" provisionada com sucesso (slug: /${slug}).`,
      });
      return;
    }

    // 3. PUT /api/admin/tenants/:id — Atualizar dados da empresa
    const matchId = normalizedPath.match(/^\/([a-zA-Z0-9_-]+)$/);
    if (matchId && method === 'PUT') {
      const targetTenantId = matchId[1];
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, body.databaseId);
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req.headers, targetDb, envConfig);

      const collectionName = targetDb === 'crm_db' ? 'tenants' : 'test_tenants';

      // Verificar se o documento existe
      let existingDoc: any = null;
      try {
        existingDoc = await adminDb.getDocument(targetDb, collectionName, targetTenantId);
      } catch {
        sendJson(404, { success: false, error: `Empresa com ID "${targetTenantId}" não encontrada.`, code: 404 });
        return;
      }

      // Se alterou o slug, validar formato e unicidade
      let newSlug = existingDoc.slug;
      if (body.slug && body.slug !== existingDoc.slug) {
        newSlug = validateSlug(body.slug);
        const checkDuplicate = await adminDb.listDocuments(targetDb, collectionName, [
          Query.equal('slug', newSlug),
          Query.limit(1),
        ]);
        if (checkDuplicate.total > 0 && checkDuplicate.documents[0].$id !== targetTenantId) {
          sendJson(409, {
            success: false,
            error: `O slug "${newSlug}" já está em uso por outra empresa.`,
            code: 409,
          });
          return;
        }
      }

      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (body.name !== undefined) updateData.name = String(body.name).trim();
      if (body.slug !== undefined) updateData.slug = newSlug;
      if (body.trade_name !== undefined) updateData.trade_name = String(body.trade_name).trim();
      if (body.document !== undefined) updateData.document = String(body.document).trim();
      if (body.email !== undefined) updateData.email = String(body.email).trim();
      if (body.phone !== undefined) updateData.phone = String(body.phone).trim();
      if (body.status !== undefined) updateData.status = body.status;
      if (body.plan !== undefined) updateData.plan = body.plan;
      if (body.logo_url !== undefined) updateData.logo_url = String(body.logo_url).trim();
      if (body.primary_color !== undefined) updateData.primary_color = String(body.primary_color).trim();
      if (body.address !== undefined) updateData.address = String(body.address).trim();
      if (body.settings_json !== undefined) updateData.settings_json = typeof body.settings_json === 'string' ? body.settings_json : JSON.stringify(body.settings_json);

      const updated = await adminDb.updateDocument(targetDb, collectionName, targetTenantId, updateData);

      sendJson(200, {
        success: true,
        databaseId: targetDb,
        updatedBy: superAdmin.userId,
        tenant: {
          id: updated.$id,
          ...updated,
        },
        message: `Empresa "${updated.name || targetTenantId}" atualizada com sucesso.`,
      });
      return;
    }

    sendJson(404, { success: false, error: `Endpoint administrativo de empresas não encontrado: ${rawPath}` });
  } catch (err: any) {
    const isConflict = err.statusCode === 409 || err.code === 409;
    const isForbidden = err.statusCode === 403 || err.code === 403 || (err.message && err.message.includes('[UNAUTHORIZED_SUPERADMIN]'));
    const isAuth = err.statusCode === 401 || err.code === 401;
    const statusCode = err.statusCode || err.code || (isConflict ? 409 : (isForbidden ? 403 : (isAuth ? 401 : 500)));
    sendJson(statusCode, {
      success: false,
      error: err.message || 'Erro no processamento do provisionamento de empresas.',
      code: statusCode,
    });
  }
}
