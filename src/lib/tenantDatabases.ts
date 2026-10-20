import { Databases, Query } from 'appwrite';
import { backendApiBridge } from './backendApiBridge';

/**
 * Lista oficial das 25 coleções de dados da empresa (Tenant-Aware)
 */
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
]);

/**
 * Remove qualquer Query.equal('tenant_id', ...) fornecido pelo chamador
 * para evitar injeção ou adulteração de tenant no cliente.
 */
function sanitizeQueries(queries: any[]): any[] {
  if (!Array.isArray(queries)) return [];
  return queries.filter((q) => {
    // Queries no Appwrite SDK são strings serializadas ou objetos
    const qStr = typeof q === 'string' ? q : JSON.stringify(q);
    return !qStr.includes('"tenant_id"') && !qStr.includes('equal("tenant_id"');
  });
}

/**
 * Cria o wrapper centralizado de banco de dados para enforçar
 * as regras de multi-tenant nas operações do CRM.
 */
export function createTenantDatabases(
  rawDatabases: Databases,
  getTenantId: () => string | null,
  getUserId?: () => string | null,
  getIsSuperAdmin?: () => boolean
): Databases {
  return {
    ...rawDatabases,

    /**
     * Listagem centralizada com injeção automática de Query.equal('tenant_id', currentTenantId)
     */
    async listDocuments(databaseId: string, collectionId: string, queries: any[] = []) {
      const currentTenantId = getTenantId();

      // 1. Coleções operacionais do Tenant
      if (TENANT_AWARE_COLLECTIONS.has(collectionId)) {
        if (currentTenantId) {
          const cleanQueries = sanitizeQueries(queries);
          cleanQueries.push(Query.equal('tenant_id', currentTenantId));
          return await rawDatabases.listDocuments(databaseId, collectionId, cleanQueries);
        } else {
          // Sem tenant ativo (ex: rotas públicas ou inicialização transitória)
          return await rawDatabases.listDocuments(databaseId, collectionId, queries);
        }
      }

      // 2. Coleção de Usuários da Plataforma (users_hydra)
      if (collectionId === 'users_hydra') {
        if (currentTenantId) {
          // Filtra usuários vinculados a esta empresa
          const cleanQueries = queries.filter((q) => {
            const qStr = typeof q === 'string' ? q : JSON.stringify(q);
            return !qStr.includes('default_tenant_id');
          });
          cleanQueries.push(Query.equal('default_tenant_id', currentTenantId));
          return await rawDatabases.listDocuments(databaseId, collectionId, cleanQueries);
        }
      }

      // 3. Coleções globais ou de controle (ex: 'tenants')
      return await rawDatabases.listDocuments(databaseId, collectionId, queries);
    },

    /**
     * Leitura individual com verificação de posse do tenant ativo
     */
    async getDocument(databaseId: string, collectionId: string, documentId: string, queries?: any[]) {
      const doc = await rawDatabases.getDocument(databaseId, collectionId, documentId, queries);
      const currentTenantId = getTenantId();

      // Se for coleção tenant-aware e houver um tenant ativo no contexto
      if (TENANT_AWARE_COLLECTIONS.has(collectionId) && currentTenantId) {
        if (doc.tenant_id && doc.tenant_id !== currentTenantId) {
          console.warn(
            `[Tenant Security] Acesso negado: Documento "${documentId}" pertence ao tenant "${doc.tenant_id}", não ao ativo "${currentTenantId}".`
          );
          throw new Error(`[Tenant Security] Documento não encontrado ou pertence a outra organização.`);
        }
      }

      return doc;
    },

    /**
     * Criação de documento com injeção obrigatória e sobreposição de tenant_id
     */
    async createDocument(
      databaseId: string,
      collectionId: string,
      documentId: string,
      data: any,
      permissions?: string[]
    ) {
      const currentTenantId = getTenantId();

      let secureData = { ...data };
      delete secureData.$id;
      delete secureData.$createdAt;
      delete secureData.$updatedAt;
      delete secureData.$permissions;
      delete secureData.$databaseId;
      delete secureData.$collectionId;
      let securePermissions = permissions;

      if (TENANT_AWARE_COLLECTIONS.has(collectionId)) {
        delete secureData.tenant_id;
        if (!currentTenantId) {
          console.warn(`[Tenant Security] Criação em "${collectionId}" sem tenant ativo.`);
        } else {
          // Injeta permissões autoritativas do Team da empresa
          const teamRole = `team:${currentTenantId}`;
          const isSuper = !!getIsSuperAdmin?.();
          const superadminRole = 'team:superadmins';

          // Base de permissões: colaboradores da própria empresa têm acesso
          const defaultTeamPerms = [
            `read("${teamRole}")`,
            `update("${teamRole}")`,
            `delete("${teamRole}")`,
          ];

          // Se e somente se o usuário criador pertencer ao time de superadmins, ele pode incluir a permissão de superadmins
          if (isSuper) {
            defaultTeamPerms.push(`read("${superadminRole}")`, `update("${superadminRole}")`);
          }

          if (!securePermissions || securePermissions.length === 0) {
            securePermissions = defaultTeamPerms;
          } else {
            // Sanitiza: impede que um usuário comum injete permissões de times aos quais não pertence
            const allowedTeamRoles = [teamRole];
            if (isSuper) allowedTeamRoles.push(superadminRole);

            const sanitized = securePermissions.filter(p => {
              if (p.includes('team:')) {
                return allowedTeamRoles.some(r => p.includes(r));
              }
              return true;
            });
            const permSet = new Set(sanitized);
            defaultTeamPerms.forEach(p => permSet.add(p));
            securePermissions = Array.from(permSet);
          }
        }
      }

      // Roteia a gravação com autorização estrita pelo Backend API Bridge
      return await backendApiBridge.createDocument(
        databaseId,
        collectionId,
        documentId,
        secureData,
        securePermissions
      );
    },

    /**
     * Atualização autorizada no servidor via Backend API Bridge
     */
    async updateDocument(
      databaseId: string,
      collectionId: string,
      documentId: string,
      data: any,
      permissions?: string[]
    ) {
      const currentTenantId = getTenantId();

      let secureData = { ...data };
      delete secureData.$id;
      delete secureData.$createdAt;
      delete secureData.$updatedAt;
      delete secureData.$permissions;
      delete secureData.$databaseId;
      delete secureData.$collectionId;

      if (TENANT_AWARE_COLLECTIONS.has(collectionId)) {
        if (currentTenantId && secureData.tenant_id && secureData.tenant_id !== currentTenantId) {
          console.warn(`[Tenant Security] Tentativa ilegal de alterar tenant_id do documento "${documentId}".`);
          throw new Error(`[Tenant Security] Não é permitido transferir entidades entre organizações.`);
        }
        // Assegura que o tenant_id não seja adulterado pelo cliente
        delete secureData.tenant_id;
      }

      // Roteia a atualização com autorização estrita pelo Backend API Bridge
      return await backendApiBridge.updateDocument(
        databaseId,
        collectionId,
        documentId,
        secureData,
        permissions
      );
    },

    /**
     * Exclusão autorizada no servidor via Backend API Bridge
     */
    async deleteDocument(databaseId: string, collectionId: string, documentId: string) {
      const currentTenantId = getTenantId();

      if (TENANT_AWARE_COLLECTIONS.has(collectionId) && currentTenantId) {
        try {
          const doc = await rawDatabases.getDocument(databaseId, collectionId, documentId);
          if (doc.tenant_id && doc.tenant_id !== currentTenantId) {
            console.warn(`[Tenant Security] Tentativa ilegal de excluir documento de outro tenant: "${documentId}".`);
            throw new Error(`[Tenant Security] Permissão negada: o documento pertence a outra organização.`);
          }
        } catch (e: any) {
          if (e.message?.includes('Tenant Security')) throw e;
        }
      }

      // Roteia a exclusão com autorização estrita pelo Backend API Bridge
      return await backendApiBridge.deleteDocument(databaseId, collectionId, documentId);
    },
  } as unknown as Databases;
}
