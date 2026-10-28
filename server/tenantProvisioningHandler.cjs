/**
 * Tenant Provisioning Handler — Iris Horizon CRM (Fase SaaS-01 - CommonJS Version)
 *
 * Gerencia o provisionamento autoritativo de empresas no backend standalone.
 */

const { Client, Account, Databases, Teams, Storage, ID, Query, Permission, Role } = require('node-appwrite');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { authenticateAndAuthorizeSuperAdmin } = require('./adminPolicyHandler.cjs');
const { resolveGovernanceConfig } = require('./governanceConfig.cjs');
const { readJsonBody, listAllMemberships } = require('./requestUtils.cjs');

function resolveAuthoritativeTarget(envConfig, clientSuppliedDb) {
  const govConfig = envConfig && envConfig.governanceConfig
    ? envConfig.governanceConfig
    : resolveGovernanceConfig(process.env);

  if (govConfig && govConfig.status === 'INVALID') {
    const err = new Error(`Governança inválida: ${govConfig.reason}`);
    err.statusCode = 503;
    err.code = 'GOVERNANCE_INVALID_BOOT';
    throw err;
  }

  let authoritativeDb = (govConfig && (govConfig.targetDb || govConfig.databaseId))
    || (envConfig && envConfig.databaseId)
    || null;

  if (!authoritativeDb) {
    if (process.env.NODE_ENV === 'test') {
      authoritativeDb = 'crm_isolated_test';
    } else {
      authoritativeDb = process.env.VITE_APPWRITE_DATABASE_ID || process.env.DATABASE_ID || 'crm_db';
    }
  }

  if (clientSuppliedDb && typeof clientSuppliedDb === 'string' && clientSuppliedDb.trim() !== '') {
    if (clientSuppliedDb.trim() !== authoritativeDb) {
      const err = new Error(`[CLIENT_DATABASE_OVERRIDE_REJECTED] Seleção de banco pelo cliente ("${clientSuppliedDb}") rejeitada. O servidor opera exclusivamente no banco autoritativo configurado ("${authoritativeDb}").`);
      err.statusCode = 403;
      err.code = 'TARGET_DATABASE_MISMATCH';
      throw err;
    }
  }

  return authoritativeDb;
}

function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    const err = new Error('O slug da empresa é obrigatório.');
    err.statusCode = 400;
    throw err;
  }
  const cleanSlug = slug.trim().toLowerCase();
  if (cleanSlug.length < 2 || cleanSlug.length > 50) {
    const err = new Error('O slug deve conter entre 2 e 50 caracteres.');
    err.statusCode = 400;
    throw err;
  }
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(cleanSlug)) {
    const err = new Error('Slug inválido. Utilize apenas letras minúsculas, números e hífens (ex: acme-tech).');
    err.statusCode = 400;
    throw err;
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
    const err = new Error(`O slug "${cleanSlug}" é reservado pelo sistema.`);
    err.statusCode = 400;
    throw err;
  }

  return cleanSlug;
}

/**
 * Converte imagens enviadas em base64 em URLs curtas (< 150 caracteres)
 * salvando no Appwrite Storage ou no armazenamento local do servidor.
 * Evita o erro de Attribute "logo_url" no longer than 1000 chars no Appwrite Databases.
 */
async function persistLogoImage(logoInput, tenantSlug, adminStorage, endpoint, projectId) {
  if (!logoInput || typeof logoInput !== 'string') return '';
  const trimmed = logoInput.trim();

  // Se já for uma URL convencional (http/https ou /api/logos), e couber em 1000 caracteres, mantém
  if (!trimmed.startsWith('data:image/')) {
    return trimmed.slice(0, 1000);
  }

  try {
    const matches = trimmed.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) {
      console.warn('[LogoUpload] Formato dataURL inválido');
      return '';
    }

    const imageSubtype = matches[1].toLowerCase();
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    let ext = 'png';
    let mimeType = 'image/png';
    if (imageSubtype.includes('svg')) {
      ext = 'svg';
      mimeType = 'image/svg+xml';
    } else if (imageSubtype.includes('jpeg') || imageSubtype.includes('jpg')) {
      ext = 'jpg';
      mimeType = 'image/jpeg';
    } else if (imageSubtype.includes('webp')) {
      ext = 'webp';
      mimeType = 'image/webp';
    }

    const safeSlug = (tenantSlug || 'tenant').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `logo_${safeSlug}_${Date.now()}.${ext}`;

    // 1. Tentar salvar no Appwrite Storage com permissões públicas de leitura
    if (adminStorage) {
      const bucketId = process.env.VITE_APPWRITE_BUCKET_ID || 'crm_logos';
      try {
        try {
          await adminStorage.getBucket(bucketId);
        } catch (bErr) {
          try {
            await adminStorage.createBucket(
              bucketId,
              'Logos do CRM',
              [Permission.read(Role.any()), Permission.create(Role.any())],
              false,
              true
            );
          } catch {}
        }

        const fileId = ID.unique();
        const fileObj = new File([buffer], filename, { type: mimeType });
        await adminStorage.createFile(bucketId, fileId, fileObj, [Permission.read(Role.any())]);
        const storageUrl = `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`;
        console.log(`[LogoUpload] Logo salva com sucesso no Appwrite Storage: ${storageUrl}`);
        return storageUrl;
      } catch (storageErr) {
        console.warn(`[LogoUpload] Appwrite Storage indisponível (${storageErr.message}), salvando localmente em /api/logos/...`);
      }
    }

    // 2. Fallback resiliente: salvar no sistema de arquivos local (/api/logos/:filename)
    const logosDir = path.join(__dirname, 'uploads', 'logos');
    if (!fs.existsSync(logosDir)) {
      fs.mkdirSync(logosDir, { recursive: true });
    }
    const localFilePath = path.join(logosDir, filename);
    fs.writeFileSync(localFilePath, buffer);
    console.log(`[LogoUpload] Logo salva localmente em: ${localFilePath}`);
    return `/api/logos/${filename}`;
  } catch (err) {
    console.error('[LogoUpload] Erro ao persistir logo:', err.message);
    return '';
  }
}

function toAdminEnv(config, targetDb) {
  return {
    endpoint: config.endpoint || config.ENDPOINT || process.env.VITE_APPWRITE_URL || process.env.VITE_APPWRITE_ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1',
    projectId: config.projectId || config.PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f',
    apiKey: config.apiKey || config.API_KEY || process.env.APPWRITE_API_KEY || '',
    databaseId: targetDb || config.databaseId || config.DATABASE_ID || 'crm_db',
  };
}

async function handleTenantProvisioningRoutes(req, res, envConfig) {
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

  const sendJson = (status, payload) => {
    res.statusCode = status;
    res.end(JSON.stringify(payload));
  };

  // Leitura segura do corpo JSON para métodos POST e PUT (S10) com suporte a logos de até 10MB
  const readBody = () => readJsonBody(req, { maxBytes: 10 * 1024 * 1024 });

  try {
    const endpoint = envConfig.ENDPOINT || envConfig.endpoint || process.env.VITE_APPWRITE_URL || process.env.VITE_APPWRITE_ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
    const projectId = envConfig.PROJECT_ID || envConfig.projectId || process.env.VITE_APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f';
    const apiKey = envConfig.API_KEY || envConfig.apiKey || process.env.APPWRITE_API_KEY || '';

    if (!apiKey) {
      sendJson(500, { success: false, error: 'APPWRITE_API_KEY não configurada no servidor.', code: 500 });
      return;
    }

    const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const adminDb = new Databases(adminClient);
    const adminTeams = new Teams(adminClient);
    const adminStorage = new Storage(adminClient);

    // 1. GET /api/admin/tenants
    if (normalizedPath === '/' && method === 'GET') {
      const targetDb = resolveAuthoritativeTarget(envConfig, parsedUrl.query.databaseId);
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req, toAdminEnv(envConfig, targetDb), targetDb);

      const collectionName = targetDb === 'crm_db' ? 'tenants' : 'test_tenants';
      const listRes = await adminDb.listDocuments(targetDb, collectionName, [Query.limit(100)]);

      const tenants = listRes.documents.map((d) => ({
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

    // 1.1 GET /api/admin/tenants/resolve/:slug — Resolução de empresa por slug ou ID (para navegação e rotas multi-tenant)
    const resolveMatch = normalizedPath.match(/^\/resolve\/([a-zA-Z0-9_.-]+)$/);
    if (resolveMatch && method === 'GET') {
      const rawTarget = resolveMatch[1].toLowerCase();
      let targetQuery = rawTarget.replace(/^www\./, '');
      if (targetQuery.endsWith('.lvplatform.com.br')) targetQuery = targetQuery.replace(/\.lvplatform\.com\.br$/, '');
      if (targetQuery.endsWith('.lvplataform.com.br')) targetQuery = targetQuery.replace(/\.lvplataform\.com\.br$/, '');

      const targetDb = resolveAuthoritativeTarget(envConfig, parsedUrl.query.databaseId);
      const collectionName = targetDb === 'crm_db' ? 'tenants' : 'test_tenants';

      let d = null;

      // 1. Tenta por slug exato
      try {
        const resList = await adminDb.listDocuments(targetDb, collectionName, [
          Query.equal('slug', targetQuery),
          Query.limit(1),
        ]);
        if (resList.total > 0) d = resList.documents[0];
      } catch {}

      // 2. Tenta por ID direto ($id)
      if (!d) {
        try {
          d = await adminDb.getDocument(targetDb, collectionName, targetQuery);
        } catch {}
      }

      // 3. Tenta com ou sem prefixo 'tenant_'
      if (!d) {
        const altQuery = targetQuery.startsWith('tenant_')
          ? targetQuery.replace(/^tenant_/, '')
          : `tenant_${targetQuery}`;
        try {
          const resList = await adminDb.listDocuments(targetDb, collectionName, [
            Query.equal('slug', altQuery),
            Query.limit(1),
          ]);
          if (resList.total > 0) {
            d = resList.documents[0];
          } else {
            d = await adminDb.getDocument(targetDb, collectionName, altQuery).catch(() => null);
          }
        } catch {}
      }

      if (d) {
        sendJson(200, {
          success: true,
          tenant: {
            id: d.$id,
            name: d.name || 'Empresa sem nome',
            slug: d.slug || targetQuery,
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
        sendJson(404, { success: false, error: `Empresa com identificador "${targetQuery}" não encontrada.`, code: 404 });
      }
      return;
    }

    // 2. POST /api/admin/tenants
    if (normalizedPath === '/' && method === 'POST') {
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, body.databaseId);
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req, toAdminEnv(envConfig, targetDb), targetDb);

      if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        sendJson(400, { success: false, error: 'O nome da empresa é obrigatório.', code: 400 });
        return;
      }

      const slug = validateSlug(body.slug);
      const collectionName = targetDb === 'crm_db' ? 'tenants' : 'test_tenants';

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

      try {
        await adminTeams.create(tenantId, body.name.trim());
      } catch (teamErr) {
        console.warn(`[Provisioning] Aviso ao criar Team ${tenantId}:`, teamErr.message);
      }

      const now = new Date().toISOString();
      let resolvedLogoUrl = '';
      if (body.logo_url) {
        resolvedLogoUrl = await persistLogoImage(body.logo_url, slug, adminStorage, endpoint, projectId);
      }

      const tenantDocData = {
        name: body.name.trim(),
        slug,
        trade_name: body.trade_name ? String(body.trade_name).trim() : body.name.trim(),
        document: body.document ? String(body.document).trim() : '',
        email: body.email ? String(body.email).trim() : '',
        phone: body.phone ? String(body.phone).trim() : '',
        status: body.status || 'active',
        plan: body.plan || 'pro',
        logo_url: resolvedLogoUrl,
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
        tenant: {
          id: doc.$id,
          ...tenantDocData,
        },
        message: `Empresa "${body.name.trim()}" provisionada com sucesso (slug: /${slug}).`,
      });
      return;
    }

    // 3. PUT /api/admin/tenants/:id
    const matchId = normalizedPath.match(/^\/([a-zA-Z0-9_-]+)$/);
    if (matchId && method === 'PUT') {
      const targetTenantId = matchId[1];
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, body.databaseId);
      let actor = null;
      try {
        actor = await authenticateAndAuthorizeSuperAdmin(req, toAdminEnv(envConfig, targetDb), targetDb);
      } catch (superErr) {
        // Fallback for authorized tenant owner/admin updating their own company
        try {
          const authHeader = req.headers['authorization'] || '';
          const jwtHeader = req.headers['x-appwrite-jwt'] || '';
          const sessionHeader = req.headers['x-appwrite-session'] || '';
          const token = jwtHeader ? String(jwtHeader).trim() : (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (sessionHeader ? String(sessionHeader).trim() : ''));
          if (!token) throw superErr;
          const userClient = new Client().setEndpoint(endpoint).setProject(projectId);
          if (jwtHeader || token.split('.').length === 3) userClient.setJWT(token);
          else userClient.setSession(token);
          const account = new Account(userClient);
          const user = await account.get();
          if (!user || user.status === false) throw superErr;
          const memberships = await listAllMemberships(adminTeams, targetTenantId, Query);
          const match = memberships.find(m => m.userId === user.$id && m.confirm !== false);
          const isTenantAdmin = match && (match.roles || []).some(r => ['admin', 'owner', 'superadmin'].includes(String(r).toLowerCase()));
          if (!isTenantAdmin) throw superErr;
          actor = { userId: user.$id, email: user.email, name: user.name, isTenantAdmin: true };
        } catch {
          throw superErr;
        }
      }

      const collectionName = targetDb === 'crm_db' ? 'tenants' : 'test_tenants';

      let existingDoc = null;
      try {
        existingDoc = await adminDb.getDocument(targetDb, collectionName, targetTenantId);
      } catch {
        sendJson(404, { success: false, error: `Empresa com ID "${targetTenantId}" não encontrada.`, code: 404 });
        return;
      }

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

      const updateData = {
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
      if (body.logo_url !== undefined) {
        updateData.logo_url = await persistLogoImage(body.logo_url, newSlug, adminStorage, endpoint, projectId);
      }
      if (body.primary_color !== undefined) updateData.primary_color = String(body.primary_color).trim();
      if (body.address !== undefined) updateData.address = String(body.address).trim();
      if (body.settings_json !== undefined) updateData.settings_json = typeof body.settings_json === 'string' ? body.settings_json : JSON.stringify(body.settings_json);

      const updated = await adminDb.updateDocument(targetDb, collectionName, targetTenantId, updateData);

      sendJson(200, {
        success: true,
        databaseId: targetDb,
        tenant: {
          id: updated.$id,
          ...updated,
        },
        message: `Empresa "${updated.name || targetTenantId}" atualizada com sucesso.`,
      });
      return;
    }

    // 4. DELETE /api/admin/tenants/:id — Excluir empresa / servidor
    if (matchId && method === 'DELETE') {
      const targetTenantId = matchId[1];
      const targetDb = resolveAuthoritativeTarget(
        envConfig,
        (parsedUrl.query && parsedUrl.query.databaseId) || (req.headers && req.headers['x-database-id'])
      );
      const superAdmin = await authenticateAndAuthorizeSuperAdmin(req, toAdminEnv(envConfig, targetDb), targetDb);

      const collectionName = targetDb === 'crm_db' ? 'tenants' : 'test_tenants';

      // Verificar se o documento existe
      let existingDoc = null;
      try {
        existingDoc = await adminDb.getDocument(targetDb, collectionName, targetTenantId);
      } catch (e) {
        sendJson(404, { success: false, error: `Empresa/Servidor com ID "${targetTenantId}" não encontrada.`, code: 404 });
        return;
      }

      // Impede a exclusão da Matriz principal
      if (existingDoc.slug === 'matriz' || targetTenantId === 'tenant_default') {
        sendJson(403, {
          success: false,
          error: 'A empresa Matriz principal (matriz) não pode ser excluída.',
          code: 403,
        });
        return;
      }

      // Remove documento do tenant no Appwrite
      await adminDb.deleteDocument(targetDb, collectionName, targetTenantId);

      // Limpar dependências associadas ao tenant (ex: colunas de pipeline)
      try {
        const { documents: cols } = await adminDb.listDocuments(targetDb, 'pipeline_columns', [
          Query.equal('tenant_id', targetTenantId),
          Query.limit(100),
        ]);
        for (const col of cols) {
          try {
            await adminDb.deleteDocument(targetDb, 'pipeline_columns', col.$id);
          } catch (colErr) {}
        }
      } catch (depErr) {}

      sendJson(200, {
        success: true,
        databaseId: targetDb,
        deletedBy: superAdmin.userId,
        tenantId: targetTenantId,
        message: `Servidor/Empresa "${existingDoc.name || targetTenantId}" excluído com sucesso.`,
      });
      return;
    }

    sendJson(404, { success: false, error: `Endpoint administrativo de empresas não encontrado: ${rawPath}` });
  } catch (err) {
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

module.exports = {
  handleTenantProvisioningRoutes,
};
