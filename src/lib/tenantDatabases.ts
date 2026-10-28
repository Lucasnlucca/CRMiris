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

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGINATION_PAGES = 100;

function inspectPaginationQueries(queries: any[]): {
  queriesWithoutLimit: any[];
  explicitLimit: number | null;
  hasExplicitCursorOrOffset: boolean;
} {
  if (!Array.isArray(queries)) {
    return { queriesWithoutLimit: [], explicitLimit: null, hasExplicitCursorOrOffset: false };
  }

  let explicitLimit: number | null = null;
  let hasExplicitCursorOrOffset = false;
  const queriesWithoutLimit: any[] = [];

  for (const q of queries) {
    const qStr = typeof q === 'string' ? q : JSON.stringify(q);
    if (qStr.includes('"cursorAfter"') || qStr.includes('cursorAfter(') || qStr.includes('"offset"') || qStr.includes('offset(')) {
      hasExplicitCursorOrOffset = true;
      queriesWithoutLimit.push(q);
      continue;
    }

    // Detecta Query.limit(n) em formato JSON ou string do Appwrite SDK
    const limitMatch =
      qStr.match(/"method"\s*:\s*"limit"[^}]*"values"\s*:\s*\[\s*(\d+)\s*\]/) ||
      qStr.match(/limit\((\d+)\)/);

    if (limitMatch && limitMatch[1]) {
      explicitLimit = parseInt(limitMatch[1], 10);
      continue;
    }

    queriesWithoutLimit.push(q);
  }

  return { queriesWithoutLimit, explicitLimit, hasExplicitCursorOrOffset };
}

async function paginateCollectionDocuments(
  rawDatabases: Databases,
  databaseId: string,
  collectionId: string,
  baseQueries: any[],
  maxItems?: number
) {
  const pageSize = maxItems && maxItems < DEFAULT_PAGE_SIZE ? maxItems : DEFAULT_PAGE_SIZE;
  const firstPage = await rawDatabases.listDocuments(databaseId, collectionId, [
    ...baseQueries,
    Query.limit(pageSize),
  ]);

  const firstDocs = Array.isArray(firstPage?.documents) ? firstPage.documents : [];
  if (
    firstDocs.length < pageSize ||
    (typeof firstPage?.total === 'number' && firstDocs.length >= firstPage.total) ||
    (maxItems && firstDocs.length >= maxItems)
  ) {
    return firstPage;
  }

  const allDocuments = [...firstDocs];
  const seenIds = new Set<string>(
    firstDocs.map((d: any) => d?.$id || d?.id).filter(Boolean)
  );
  let offset = firstDocs.length;

  for (let page = 1; page < MAX_PAGINATION_PAGES; page++) {
    if (maxItems && allDocuments.length >= maxItems) break;

    const remaining = maxItems ? Math.min(DEFAULT_PAGE_SIZE, maxItems - allDocuments.length) : DEFAULT_PAGE_SIZE;
    const lastDoc: any = allDocuments[allDocuments.length - 1];
    const lastId = lastDoc?.$id || lastDoc?.id;

    const pageQueries = [
      ...baseQueries,
      Query.limit(remaining),
      lastId ? Query.cursorAfter(lastId) : Query.offset(offset),
    ];

    const nextPage = await rawDatabases.listDocuments(databaseId, collectionId, pageQueries);
    const batch = Array.isArray(nextPage?.documents) ? nextPage.documents : [];
    if (batch.length === 0) break;

    let addedInBatch = 0;
    for (const doc of batch) {
      const docId = (doc as any)?.$id || (doc as any)?.id;
      if (docId) {
        if (seenIds.has(docId)) continue;
        seenIds.add(docId);
      }
      allDocuments.push(doc);
      addedInBatch++;
      if (maxItems && allDocuments.length >= maxItems) break;
    }

    offset += batch.length;
    if (addedInBatch === 0 || batch.length < remaining) break;
    if (typeof nextPage?.total === 'number' && allDocuments.length >= nextPage.total) break;
  }

  return {
    ...firstPage,
    documents: allDocuments,
    total:
      typeof firstPage?.total === 'number'
        ? Math.max(firstPage.total, allDocuments.length)
        : allDocuments.length,
  };
}

/**
 * Busca todas as páginas de uma coleção preservando os filtros e o escopo do tenant ativo.
 */
export async function listAllDocuments(
  db: Databases,
  databaseId: string,
  collectionId: string,
  queries: any[] = []
) {
  const { queriesWithoutLimit } = inspectPaginationQueries(queries);
  return await db.listDocuments(databaseId, collectionId, queriesWithoutLimit);
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
  const executeScopedList = async (
    databaseId: string,
    collectionId: string,
    queries: any[] = [],
    forceAllPages = false
  ) => {
    const currentTenantId = getTenantId();
    let effectiveQueries = Array.isArray(queries) ? [...queries] : [];

    // 1. Coleções operacionais do Tenant
    if (TENANT_AWARE_COLLECTIONS.has(collectionId)) {
      if (currentTenantId) {
        effectiveQueries = sanitizeQueries(effectiveQueries);
        effectiveQueries.push(Query.equal('tenant_id', currentTenantId));
      }
    } else if (collectionId === 'users_hydra' && currentTenantId) {
      // 2. Coleção de Usuários da Plataforma (users_hydra)
      effectiveQueries = effectiveQueries.filter((q) => {
        const qStr = typeof q === 'string' ? q : JSON.stringify(q);
        return !qStr.includes('default_tenant_id');
      });
      effectiveQueries.push(Query.equal('default_tenant_id', currentTenantId));
    }

    const { queriesWithoutLimit, explicitLimit, hasExplicitCursorOrOffset } =
      inspectPaginationQueries(effectiveQueries);

    if (!forceAllPages && hasExplicitCursorOrOffset) {
      return await rawDatabases.listDocuments(databaseId, collectionId, effectiveQueries);
    }

    if (!forceAllPages && explicitLimit !== null && explicitLimit <= DEFAULT_PAGE_SIZE) {
      return await rawDatabases.listDocuments(databaseId, collectionId, effectiveQueries);
    }

    return await paginateCollectionDocuments(
      rawDatabases,
      databaseId,
      collectionId,
      queriesWithoutLimit,
      !forceAllPages && explicitLimit !== null ? explicitLimit : undefined
    );
  };

  return {
    ...rawDatabases,

    /**
     * Listagem centralizada com injeção automática de Query.equal('tenant_id', currentTenantId)
     * e paginação automática para evitar truncamento silencioso em 25/100 registros.
     */
    async listDocuments(databaseId: string, collectionId: string, queries: any[] = []) {
      return await executeScopedList(databaseId, collectionId, queries, false);
    },

    /**
     * Listagem paginada completa de todos os documentos da coleção para o tenant ativo.
     */
    async listAllDocuments(databaseId: string, collectionId: string, queries: any[] = []) {
      return await executeScopedList(databaseId, collectionId, queries, true);
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
        const isSuper = !!getIsSuperAdmin?.();
        if (currentTenantId && secureData.tenant_id && secureData.tenant_id !== currentTenantId && !isSuper) {
          console.warn(`[Tenant Security] Tentativa ilegal de criar documento no tenant "${secureData.tenant_id}" a partir de "${currentTenantId}".`);
          throw new Error(`[Tenant Security] Não é permitido criar documentos em outra organização.`);
        }
        delete secureData.tenant_id;
        if (!currentTenantId) {
          console.warn(`[Tenant Security] Criação em "${collectionId}" sem tenant ativo.`);
        } else {
          secureData.tenant_id = currentTenantId;
          // Injeta permissões autoritativas do Team da empresa
          const teamRole = `team:${currentTenantId}`;
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
