/**
 * User & Membership Management Handler — Iris Horizon CRM (CommonJS Version)
 *
 * Gerencia o ciclo de vida de membros, convites e permissões por empresa no servidor standalone.
 */

const { Client, Databases, Users, Teams, ID, Query, Account, Permission, Role } = require('node-appwrite');
const url = require('url');
const { resolveGovernanceConfig } = require('./governanceConfig.cjs');
const { readJsonBody, generateSecureTemporaryPassword } = require('./requestUtils.cjs');

function resolveAuthoritativeTarget(envConfig, clientSuppliedDb) {
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
      const err = new Error('[GOVERNANCE_CONFIG_ERROR] Configuração de governança indisponível.');
      err.statusCode = 503;
      throw err;
    }
  }

  if (govConfig && govConfig.databaseId && clientSuppliedDb && typeof clientSuppliedDb === 'string' && clientSuppliedDb.trim() !== '') {
    if (clientSuppliedDb.trim() !== govConfig.databaseId) {
      const err = new Error(`[CLIENT_DATABASE_OVERRIDE_REJECTED] Seleção de banco pelo cliente ("${clientSuppliedDb}") rejeitada.`);
      err.statusCode = 403;
      throw err;
    }
  }

  return authoritativeDb;
}

async function authenticateAndResolveCaller(headers, targetDb, envConfig) {
  const endpoint = envConfig.ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
  const projectId = envConfig.PROJECT_ID || '6a6cac620021f4c64b3f';
  const apiKey = envConfig.API_KEY || '';

  if (!apiKey) {
    const err = new Error('APPWRITE_API_KEY não configurada no servidor.');
    err.statusCode = 500;
    throw err;
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
      sessionSecret = parsed[`a_session_${projectId}`] || parsed[`a_session_${projectId}_legacy`] || Object.values(parsed)[0] || '';
    } catch (e) {}
  }

  if (!jwt && !sessionSecret && headers['cookie']) {
    const rawCookie = Array.isArray(headers['cookie']) ? headers['cookie'].join('; ') : String(headers['cookie']);
    const match = rawCookie.match(new RegExp(`(?:^|;\\s*)a_session_${projectId}(?:_legacy)?=([^;]+)`)) ||
                  rawCookie.match(/(?:^|;\s*)a_session=([^;]+)/);
    if (match && match[1]) {
      sessionSecret = decodeURIComponent(match[1]).trim();
    }
  }

  // S01: Rejeitar terminantemente autenticação baseada apenas em ID de usuário sem credencial comprovada
  if (!jwt && !sessionSecret) {
    const err = new Error('Autenticação necessária: token JWT ou credencial de sessão verificável ausente.');
    err.statusCode = 401;
    throw err;
  }

  const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const adminTeams = new Teams(adminClient);
  const adminUsers = new Users(adminClient);

  let authUser = null;
  const userClient = new Client().setEndpoint(endpoint).setProject(projectId);
  if (jwt) userClient.setJWT(jwt);
  else userClient.setSession(sessionSecret);

  try {
    const userAccount = new Account(userClient);
    authUser = await userAccount.get();
  } catch (e) {
    const err = new Error(`Sessão inválida ou expirada: ${e.message}`);
    err.statusCode = 401;
    throw err;
  }

  const userId = authUser.$id;
  const userEmail = authUser.email;

  const allTeamsRes = await adminTeams.list();
  const userTeams = [];
  const tenantRoles = {};

  const superAdminTeamIds = targetDb === 'crm_db'
    ? ['superadmins']
    : ['superadmins', 'test_team_superadmins'];

  let isSuperAdmin = false;

  for (const team of allTeamsRes.teams) {
    const teamId = team.$id;
    try {
      const list = await adminTeams.listMemberships(teamId);
      const mem = list.memberships.find((m) => m.userId === userId);
      if (mem) {
        userTeams.push(teamId);
        const role = Array.isArray(mem.roles) && mem.roles.length > 0 ? mem.roles[0] : 'agent';
        tenantRoles[teamId] = role;

        if (superAdminTeamIds.includes(teamId)) {
          isSuperAdmin = true;
        }
      }
    } catch (e) {}
  }

  return {
    userId,
    userEmail,
    isSuperAdmin,
    userTeams,
    tenantRoles,
  };
}

async function handleUserManagementRoutes(req, res, envConfig) {
  const parsedUrl = url.parse(req.url, true);
  const rawPath = parsedUrl.pathname || '';
  const subPath = rawPath.startsWith('/api/admin/users')
    ? rawPath.slice('/api/admin/users'.length)
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

  const readBody = () => {
    return readJsonBody(req, { maxBytes: 1024 * 1024 });
  };

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
    const adminUsers = new Users(adminClient);
    const adminTeams = new Teams(adminClient);

    // 1. GET /api/admin/users?tenantId=xxx&databaseId=yyy
    if (normalizedPath === '/' && method === 'GET') {
      const targetDb = resolveAuthoritativeTarget(envConfig, parsedUrl.query.databaseId);
      const caller = await authenticateAndResolveCaller(req.headers, targetDb, envConfig);

      const requestedTenantId = parsedUrl.query.tenantId || '';

      if (!requestedTenantId) {
        sendJson(400, { success: false, error: 'O parâmetro "tenantId" é obrigatório.', code: 400 });
        return;
      }

      const isCallerMember = caller.userTeams.includes(requestedTenantId);
      const callerRoleInTenant = caller.tenantRoles[requestedTenantId] || '';
      const hasTenantAdminRole = callerRoleInTenant === 'admin' || callerRoleInTenant === 'owner';

      if (!caller.isSuperAdmin && (!isCallerMember || !hasTenantAdminRole)) {
        sendJson(403, {
          success: false,
          error: `[UNAUTHORIZED_TENANT_ACCESS] Acesso negado: Você não possui privilégios de administração no tenant "${requestedTenantId}".`,
          code: 403,
        });
        return;
      }

      let memberships = [];
      try {
        const memRes = await adminTeams.listMemberships(requestedTenantId);
        memberships = memRes.memberships;
      } catch (err) {
        console.warn(`[UserManagement] Aviso ao listar memberships do time ${requestedTenantId}:`, err.message);
      }

      const usersCol = targetDb === 'crm_db' ? 'users_hydra' : 'test_users_hydra';
      let dbUsers = [];
      try {
        const dbRes = await adminDb.listDocuments(targetDb, usersCol, [
          Query.equal('default_tenant_id', requestedTenantId),
          Query.limit(100),
        ]);
        dbUsers = dbRes.documents;
      } catch (e) {}

      const memberList = memberships.map((m) => {
        const profile = dbUsers.find((u) => u.$id === m.userId || u.email === m.userEmail);
        const roles = Array.isArray(m.roles) ? m.roles : [];
        const primaryRole = roles[0] || profile?.role || 'agent';
        return {
          membershipId: m.$id,
          userId: m.userId,
          name: m.userName || profile?.name || 'Membro sem nome',
          email: m.userEmail,
          role: primaryRole,
          roles,
          status: m.confirm ? (profile?.is_active === false ? 'inactive' : 'active') : 'pending',
          joined: m.joined,
          invited: m.invited,
          tenantId: requestedTenantId,
        };
      });

      sendJson(200, {
        success: true,
        tenantId: requestedTenantId,
        members: memberList,
        total: memberList.length,
      });
      return;
    }

    // 2. POST /api/admin/users/invite
    if (normalizedPath === '/invite' && method === 'POST') {
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, body.databaseId);
      const caller = await authenticateAndResolveCaller(req.headers, targetDb, envConfig);

      const targetTenantId = body.tenantId;
      if (!targetTenantId || typeof targetTenantId !== 'string') {
        sendJson(400, { success: false, error: 'O parâmetro "tenantId" é obrigatório.', code: 400 });
        return;
      }

      const isCallerMember = caller.userTeams.includes(targetTenantId);
      const callerRoleInTenant = caller.tenantRoles[targetTenantId] || '';
      const hasTenantAdminRole = callerRoleInTenant === 'admin' || callerRoleInTenant === 'owner';

      if (!caller.isSuperAdmin && (!isCallerMember || !hasTenantAdminRole)) {
        sendJson(403, {
          success: false,
          error: `[UNAUTHORIZED_TENANT_ACCESS] Acesso negado: Você não possui autorização para convidar usuários para o tenant "${targetTenantId}".`,
          code: 403,
        });
        return;
      }

      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      let role = String(body.role || 'agent').trim().toLowerCase();

      if (!email || !email.includes('@')) {
        sendJson(400, { success: false, error: 'E-mail válido é obrigatório.', code: 400 });
        return;
      }

      if (role === 'superadmin') {
        if (!caller.isSuperAdmin) {
          sendJson(403, {
            success: false,
            error: '[PRIVILEGE_ESCALATION_BLOCKED] Apenas SuperAdmins globais podem atribuir o papel "superadmin".',
            code: 403,
          });
          return;
        }
      }

      const allowedRoles = new Set(['admin', 'manager', 'agent', 'viewer']);
      if (!allowedRoles.has(role) && role !== 'superadmin') {
        role = 'agent';
      }

      let targetUser = null;
      try {
        const usersList = await adminUsers.list([Query.equal('email', email), Query.limit(1)]);
        if (usersList.total > 0) {
          targetUser = usersList.users[0];
        }
      } catch (e) {}

      if (!targetUser) {
        // S05: Senha gerada criptograficamente segura sem timestamp ou ID previsível
        const tempPassword = (typeof body.password === 'string' && body.password.length >= 8)
          ? body.password
          : generateSecureTemporaryPassword();
        try {
          targetUser = await adminUsers.create(
            ID.unique(),
            email,
            undefined,
            tempPassword,
            name || email.split('@')[0]
          );
        } catch (err) {
          sendJson(400, { success: false, error: `Falha ao criar conta de autenticação: ${err.message}`, code: 400 });
          return;
        }
      }

      let membership = null;
      try {
        membership = await adminTeams.createMembership(
          targetTenantId,
          [role],
          email,
          targetUser.$id,
          undefined,
          undefined,
          name || targetUser.name || email.split('@')[0]
        );
      } catch (teamErr) {
        if (teamErr?.message?.includes('already a member') || teamErr?.code === 409) {
          try {
            const listMem = await adminTeams.listMemberships(targetTenantId);
            const existingMem = listMem.memberships.find((m) => m.userId === targetUser.$id || m.userEmail === email);
            if (existingMem) {
              membership = await adminTeams.updateMembership(targetTenantId, existingMem.$id, [role]);
            }
          } catch (e) {}
        } else {
          sendJson(400, { success: false, error: `Falha ao vincular usuário ao Team do tenant: ${teamErr.message}`, code: 400 });
          return;
        }
      }

      const usersCol = targetDb === 'crm_db' ? 'users_hydra' : 'test_users_hydra';
      const now = new Date().toISOString();
      const userDocData = {
        name: name || targetUser.name || email.split('@')[0],
        email,
        role,
        default_tenant_id: targetTenantId,
        is_active: true,
        is_online: false,
        created_at: now,
        last_seen: now,
      };

      const superAdminTeam = targetDb === 'crm_db' ? 'superadmins' : 'test_team_superadmins';
      const userDocPerms = [
        Permission.read(Role.user(targetUser.$id)),
        Permission.update(Role.user(targetUser.$id)),
        Permission.read(Role.team(targetTenantId)),
        Permission.read(Role.team(superAdminTeam)),
      ];

      try {
        await adminDb.createDocument(targetDb, usersCol, targetUser.$id, userDocData, userDocPerms);
      } catch (docErr) {
        if (docErr?.code === 409 || docErr?.message?.includes('already exists')) {
          try {
            await adminDb.updateDocument(targetDb, usersCol, targetUser.$id, {
              role,
              default_tenant_id: targetTenantId,
              is_active: true,
              last_seen: now,
            });
          } catch (e) {}
        }
      }

      sendJson(201, {
        success: true,
        message: `Membro "${email}" vinculado com sucesso ao tenant "${targetTenantId}" com o papel "${role}".`,
        membershipId: membership?.$id,
        userId: targetUser.$id,
        email,
        role,
        tenantId: targetTenantId,
      });
      return;
    }

    // 3. PUT /api/admin/users/role
    if (normalizedPath === '/role' && method === 'PUT') {
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, body.databaseId);
      const caller = await authenticateAndResolveCaller(req.headers, targetDb, envConfig);

      const targetTenantId = body.tenantId;
      const targetUserId = body.userId;
      const membershipId = body.membershipId;
      const newRole = String(body.role || '').trim().toLowerCase();
      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : undefined;

      if (!targetTenantId || !targetUserId) {
        sendJson(400, { success: false, error: 'Parâmetros "tenantId" e "userId" são obrigatórios.', code: 400 });
        return;
      }

      const isCallerMember = caller.userTeams.includes(targetTenantId);
      const callerRoleInTenant = caller.tenantRoles[targetTenantId] || '';
      const hasTenantAdminRole = callerRoleInTenant === 'admin' || callerRoleInTenant === 'owner';

      if (!caller.isSuperAdmin && (!isCallerMember || !hasTenantAdminRole)) {
        sendJson(403, {
          success: false,
          error: `[UNAUTHORIZED_TENANT_ACCESS] Acesso negado: Você não possui autorização para alterar membros no tenant "${targetTenantId}".`,
          code: 403,
        });
        return;
      }

      if (newRole === 'superadmin' && !caller.isSuperAdmin) {
        sendJson(403, {
          success: false,
          error: '[PRIVILEGE_ESCALATION_BLOCKED] Apenas SuperAdmins globais podem atribuir o papel "superadmin".',
          code: 403,
        });
        return;
      }

      // S06: Validar primeiro se o alvo possui membresia ativa no tenant administrado
      let targetMembership = null;
      try {
        const listMem = await adminTeams.listMemberships(targetTenantId);
        targetMembership = listMem.memberships.find((m) => m.userId === targetUserId || (membershipId && m.$id === membershipId));
      } catch (err) {
        sendJson(500, { success: false, error: `Falha ao consultar membros do tenant: ${err.message}`, code: 500 });
        return;
      }

      if (!targetMembership) {
        sendJson(404, {
          success: false,
          error: `[TARGET_USER_NOT_IN_TENANT] O usuário "${targetUserId}" não pertence ao tenant "${targetTenantId}". Operação rejeitada.`,
          code: 404,
        });
        return;
      }

      if (newRole) {
        try {
          await adminTeams.updateMembership(targetTenantId, targetMembership.$id, [newRole]);
        } catch (err) {
          sendJson(400, {
            success: false,
            error: `Falha ao atualizar papel no tenant: ${err.message}`,
            code: 400,
          });
          return;
        }
      }

      const usersCol = targetDb === 'crm_db' ? 'users_hydra' : 'test_users_hydra';
      const updateData = {
        last_seen: new Date().toISOString(),
      };
      if (newRole) updateData.role = newRole;
      // S06: Apenas SuperAdmin global pode alterar status de ativação da conta em âmbito global
      if (caller.isSuperAdmin && isActive !== undefined) {
        updateData.is_active = isActive;
      }

      try {
        await adminDb.updateDocument(targetDb, usersCol, targetUserId, updateData);
      } catch (err) {
        console.warn(`[UserManagement] Aviso ao atualizar documento em ${usersCol}:`, err.message);
      }

      sendJson(200, {
        success: true,
        message: `Membro "${targetUserId}" atualizado com sucesso no tenant "${targetTenantId}".`,
        userId: targetUserId,
        role: newRole,
        is_active: isActive,
      });
      return;
    }

    // 4. POST /api/admin/users/remove
    if (normalizedPath === '/remove' && method === 'POST') {
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, body.databaseId);
      const caller = await authenticateAndResolveCaller(req.headers, targetDb, envConfig);

      const targetTenantId = body.tenantId;
      const targetUserId = body.userId;
      const membershipId = body.membershipId;

      if (!targetTenantId || (!membershipId && !targetUserId)) {
        sendJson(400, { success: false, error: 'Parâmetros "tenantId" e ("membershipId" ou "userId") são obrigatórios.', code: 400 });
        return;
      }

      const isCallerMember = caller.userTeams.includes(targetTenantId);
      const callerRoleInTenant = caller.tenantRoles[targetTenantId] || '';
      const hasTenantAdminRole = callerRoleInTenant === 'admin' || callerRoleInTenant === 'owner';

      if (!caller.isSuperAdmin && (!isCallerMember || !hasTenantAdminRole)) {
        sendJson(403, {
          success: false,
          error: `[UNAUTHORIZED_TENANT_ACCESS] Acesso negado: Você não possui autorização para remover membros no tenant "${targetTenantId}".`,
          code: 403,
        });
        return;
      }

      // S06: Validar primeiro a membresia do usuário alvo no tenant
      let targetMembership = null;
      try {
        const listMem = await adminTeams.listMemberships(targetTenantId);
        targetMembership = listMem.memberships.find((m) => (membershipId && m.$id === membershipId) || (targetUserId && m.userId === targetUserId));
      } catch (err) {
        sendJson(500, { success: false, error: `Falha ao listar membresias do tenant: ${err.message}`, code: 500 });
        return;
      }

      if (!targetMembership) {
        sendJson(404, {
          success: false,
          error: `[TARGET_USER_NOT_IN_TENANT] O usuário especificado não é membro do tenant "${targetTenantId}". Nenhuma alteração realizada.`,
          code: 404,
        });
        return;
      }

      try {
        await adminTeams.deleteMembership(targetTenantId, targetMembership.$id);
      } catch (err) {
        sendJson(400, { success: false, error: `Falha ao remover membro do Team: ${err.message}`, code: 400 });
        return;
      }

      // S06: NUNCA desativar is_active da conta global do usuário ao remover de uma empresa!
      // Apenas limpar default_tenant_id se apontava para este tenant removido
      const usersCol = targetDb === 'crm_db' ? 'users_hydra' : 'test_users_hydra';
      const resolvedUserId = targetUserId || targetMembership.userId;
      if (resolvedUserId) {
        try {
          const userDoc = await adminDb.getDocument(targetDb, usersCol, resolvedUserId);
          if (userDoc && userDoc.default_tenant_id === targetTenantId) {
            await adminDb.updateDocument(targetDb, usersCol, resolvedUserId, {
              default_tenant_id: null,
            });
          }
        } catch (e) {}
      }

      sendJson(200, {
        success: true,
        message: `Membro removido do tenant "${targetTenantId}" com sucesso.`,
      });
      return;
    }

    // 5. GET /api/admin/users/permissions
    if (normalizedPath === '/permissions' && method === 'GET') {
      const targetDb = resolveAuthoritativeTarget(envConfig, parsedUrl.query.databaseId);
      const caller = await authenticateAndResolveCaller(req.headers, targetDb, envConfig);

      const targetTenantId = String(parsedUrl.query.tenantId || '').trim();
      const targetUserId = String(parsedUrl.query.userId || '').trim();

      if (!targetTenantId || !targetUserId) {
        sendJson(400, { success: false, error: 'Parâmetros "tenantId" e "userId" são obrigatórios.', code: 400 });
        return;
      }

      const isCallerMember = caller.userTeams.includes(targetTenantId);
      const callerRoleInTenant = caller.tenantRoles[targetTenantId] || '';
      const hasTenantAdminRole = callerRoleInTenant === 'admin' || callerRoleInTenant === 'owner';

      if (!caller.isSuperAdmin && (!isCallerMember || (!hasTenantAdminRole && caller.userId !== targetUserId))) {
        sendJson(403, {
          success: false,
          error: '[UNAUTHORIZED_TENANT_ACCESS] Acesso negado às permissões do usuário.',
          code: 403,
        });
        return;
      }

      const resList = await adminDb.listDocuments(targetDb, 'user_menu_permissions', [
        Query.equal('user_id', targetUserId),
        Query.limit(100),
      ]);

      const filtered = resList.documents.filter((d) => !d.tenant_id || d.tenant_id === targetTenantId);

      sendJson(200, {
        success: true,
        tenantId: targetTenantId,
        userId: targetUserId,
        permissions: filtered.map((d) => ({
          id: d.$id,
          menu_id: d.menu_id,
          has_access: Boolean(d.has_access),
        })),
      });
      return;
    }

    // 6. POST /api/admin/users/permissions
    if (normalizedPath === '/permissions' && (method === 'POST' || method === 'PUT')) {
      const body = await readBody();
      const targetDb = resolveAuthoritativeTarget(envConfig, body.databaseId);
      const caller = await authenticateAndResolveCaller(req.headers, targetDb, envConfig);

      const targetTenantId = String(body.tenantId || '').trim();
      const targetUserId = String(body.userId || '').trim();
      const permissionsMap = body.permissions;

      if (!targetTenantId || !targetUserId || !permissionsMap || typeof permissionsMap !== 'object') {
        sendJson(400, { success: false, error: 'Parâmetros "tenantId", "userId" e "permissions" são obrigatórios.', code: 400 });
        return;
      }

      const isCallerMember = caller.userTeams.includes(targetTenantId);
      const callerRoleInTenant = caller.tenantRoles[targetTenantId] || '';
      const hasTenantAdminRole = callerRoleInTenant === 'admin' || callerRoleInTenant === 'owner';

      if (!caller.isSuperAdmin && (!isCallerMember || !hasTenantAdminRole)) {
        sendJson(403, {
          success: false,
          error: `[UNAUTHORIZED_TENANT_ACCESS] Acesso negado para alterar permissões de menu no tenant "${targetTenantId}".`,
          code: 403,
        });
        return;
      }

      const existingRes = await adminDb.listDocuments(targetDb, 'user_menu_permissions', [
        Query.equal('user_id', targetUserId),
        Query.limit(100),
      ]);
      const existingDocs = existingRes.documents.filter((d) => !d.tenant_id || d.tenant_id === targetTenantId);

      const docPerms = [
        Permission.read(Role.user(targetUserId)),
        Permission.read(Role.team(targetTenantId)),
        Permission.read(Role.team('superadmins')),
      ];

      for (const [menuId, hasAccess] of Object.entries(permissionsMap)) {
        const found = existingDocs.find((d) => d.menu_id === menuId);
        if (found) {
          await adminDb.updateDocument(targetDb, 'user_menu_permissions', found.$id, {
            has_access: Boolean(hasAccess),
            tenant_id: targetTenantId,
          });
        } else {
          await adminDb.createDocument(
            targetDb,
            'user_menu_permissions',
            ID.unique(),
            {
              user_id: targetUserId,
              menu_id: menuId,
              has_access: Boolean(hasAccess),
              tenant_id: targetTenantId,
            },
            docPerms
          );
        }
      }

      sendJson(200, {
        success: true,
        tenantId: targetTenantId,
        userId: targetUserId,
        message: 'Permissões de menu do usuário atualizadas com sucesso.',
      });
      return;
    }

    sendJson(404, { success: false, error: `Endpoint não encontrado: ${rawPath}` });
  } catch (err) {
    const isForbidden = err.statusCode === 403 || err.code === 403;
    const isAuth = err.statusCode === 401 || err.code === 401;
    const statusCode = err.statusCode || err.code || (isForbidden ? 403 : (isAuth ? 401 : 500));
    sendJson(statusCode, {
      success: false,
      error: err.message || 'Erro no processamento da gestão de membros.',
      code: statusCode,
    });
  }
}

module.exports = {
  authenticateAndResolveCaller,
  handleUserManagementRoutes,
};
