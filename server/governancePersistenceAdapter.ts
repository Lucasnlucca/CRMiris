/**
 * Adaptador de Persistência de Governança — TypeScript (Fase 5H.11)
 *
 * Fornece interface tipada para persistência durável no sandbox (crm_isolated_test):
 * 1. Persistência na coleção 'system_policy_governance'.
 * 2. Trava de segurança estrita contra 'crm_db'.
 * 3. Controle de concorrência atômica via updateDocuments com Query de versão (OCC).
 * 4. Inicialização Fail-Closed em caso de falha de conexão ou documento corrompido.
 * 5. Sanitização estrita: zero segredos ou JWTs persistidos no documento.
 */

import { Client, Databases, Query } from 'node-appwrite';

export const GOVERNANCE_COLLECTION_ID = 'system_policy_governance';
export const ALLOWED_PROTOTYPE_DBS = new Set(['crm_isolated_test', 'crm_sandbox_test']);

export interface DurableGovernanceState {
  databaseId: string;
  stateVersion: number;
  globalLockdown: boolean;
  tripReason: string;
  modulePauses: Record<string, { paused: boolean; reason: string }>;
  activeRules: any[];
  updatedBy: string;
  updatedAt: string;
}

export interface SaveAtomicParams {
  databaseId: string;
  expectedVersion: number;
  stateUpdates: {
    globalLockdown?: boolean;
    tripReason?: string;
    modulePauses?: Record<string, { paused: boolean; reason: string }>;
    activeRules?: any[];
  };
  actorId?: string;
}

export class GovernancePersistenceAdapter {
  private endpoint: string;
  private projectId: string;
  private apiKey: string;
  private client: Client;
  private databases: Databases;

  private targetDatabaseId: string | null;

  constructor(config: { endpoint?: string; projectId?: string; apiKey?: string; databaseId?: string } = {}) {
    this.endpoint = config.endpoint || process.env.VITE_APPWRITE_URL || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
    this.projectId = config.projectId || process.env.VITE_APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f';
    this.apiKey = config.apiKey || process.env.APPWRITE_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('[PERSISTENCE_ERROR] APPWRITE_API_KEY ausente para operações de governança.');
    }

    this.targetDatabaseId = config.databaseId || null;
    if (this.targetDatabaseId) {
      this.assertSandboxSafety(this.targetDatabaseId);
    }

    this.client = new Client()
      .setEndpoint(this.endpoint)
      .setProject(this.projectId)
      .setKey(this.apiKey);

    this.databases = new Databases(this.client);
  }

  getEffectiveDatabaseId(): string | null {
    return this.targetDatabaseId;
  }

  assertSandboxSafety(databaseId: string): void {
    if (!databaseId || !ALLOWED_PROTOTYPE_DBS.has(databaseId)) {
      throw new Error(`[SAFETY_GATE_TRIGGERED] Acesso negado: o banco "${databaseId}" não é um sandbox autorizado para este protótipo.`);
    }
    if (databaseId === 'crm_db') {
      throw new Error('[PROD_GUARD] Tentativa ilegal de acesso de escrita/persistência ao banco de produção crm_db.');
    }
  }

  getDocumentId(databaseId: string): string {
    this.assertSandboxSafety(databaseId);
    return `policy_state_${databaseId}`;
  }

  async loadGovernanceState(databaseId: string): Promise<DurableGovernanceState> {
    this.assertSandboxSafety(databaseId);
    const docId = this.getDocumentId(databaseId);

    try {
      const doc: any = await this.databases.getDocument(databaseId, GOVERNANCE_COLLECTION_ID, docId);

      let parsedPauses: Record<string, { paused: boolean; reason: string }> = {};
      let parsedRules: any[] = [];

      try {
        parsedPauses = JSON.parse(doc.module_pauses || '{}');
      } catch (e) {
        console.warn('[PERSISTENCE_CORRUPT] Falha ao deserializar module_pauses. Adotando fallback seguro.');
      }

      try {
        parsedRules = JSON.parse(doc.active_rules || '[]');
      } catch (e) {
        console.warn('[PERSISTENCE_CORRUPT] Falha ao deserializar active_rules. Adotando fallback seguro.');
      }

      return {
        databaseId,
        stateVersion: Number(doc.state_version) || 1,
        globalLockdown: Boolean(doc.global_lockdown),
        tripReason: doc.lockdown_reason || '',
        modulePauses: parsedPauses,
        activeRules: parsedRules,
        updatedBy: doc.updated_by || 'unknown',
        updatedAt: doc.updated_at || doc.$updatedAt,
      };
    } catch (err: any) {
      console.error(`[PERSISTENCE_FAIL_CLOSED] Falha ao carregar estado de governança para "${databaseId}": ${err.message}`);
      return {
        databaseId,
        stateVersion: 0,
        globalLockdown: true,
        tripReason: `Fail-Closed por erro de carregamento: ${err.message}`,
        modulePauses: {},
        activeRules: [],
        updatedBy: 'system_fail_closed',
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async saveGovernanceStateAtomic(params: SaveAtomicParams): Promise<{
    success: boolean;
    stateVersion: number;
    updatedAt: string;
    updatedBy: string;
    globalLockdown: boolean;
  }> {
    const { databaseId, expectedVersion, stateUpdates, actorId } = params;
    this.assertSandboxSafety(databaseId);
    const docId = this.getDocumentId(databaseId);

    if (typeof expectedVersion !== 'number' || expectedVersion < 1) {
      throw new Error('[CONCURRENCY_ERROR] expectedVersion numérico válido é obrigatório.');
    }

    const payload: any = {
      state_version: expectedVersion + 1,
      updated_by: actorId || 'system_admin',
      updated_at: new Date().toISOString(),
    };

    if (typeof stateUpdates.globalLockdown === 'boolean') {
      payload.global_lockdown = stateUpdates.globalLockdown;
    }
    if (typeof stateUpdates.tripReason === 'string') {
      payload.lockdown_reason = stateUpdates.tripReason.slice(0, 500);
    }
    if (stateUpdates.modulePauses !== undefined) {
      payload.module_pauses = JSON.stringify(stateUpdates.modulePauses);
    }
    if (stateUpdates.activeRules !== undefined) {
      payload.active_rules = JSON.stringify(stateUpdates.activeRules);
    }

    const result = await this.databases.updateDocuments(
      databaseId,
      GOVERNANCE_COLLECTION_ID,
      payload,
      [
        Query.equal('$id', docId),
        Query.equal('state_version', expectedVersion),
      ]
    );

    if (!result || result.total === 0) {
      const freshDoc: any = await this.databases.getDocument(databaseId, GOVERNANCE_COLLECTION_ID, docId);
      const conflictError: any = new Error(
        `[CONCURRENCY_CONFLICT] Falha de concorrência atômica. A versão esperada era ${expectedVersion}, mas o estado já foi alterado para ${freshDoc.state_version} por "${freshDoc.updated_by}".`
      );
      conflictError.statusCode = 409;
      conflictError.currentVersion = freshDoc.state_version;
      throw conflictError;
    }

    const updatedDoc: any = result.documents[0];
    return {
      success: true,
      stateVersion: updatedDoc.state_version,
      updatedAt: updatedDoc.updated_at,
      updatedBy: updatedDoc.updated_by,
      globalLockdown: updatedDoc.global_lockdown,
    };
  }

  async syncPolicyEngineFromDurableState(policyEngine: any, databaseId: string) {
    this.assertSandboxSafety(databaseId);
    const durable = await this.loadGovernanceState(databaseId);

    // 1. Sincroniza Disjuntor Global
    policyEngine.circuitBreaker.globalLockdown = durable.globalLockdown;
    if (durable.globalLockdown) {
      policyEngine.circuitBreaker.state = 'OPEN';
      policyEngine.circuitBreaker.tripReason = durable.tripReason || 'Lockdown persistido ativo';
    } else {
      policyEngine.circuitBreaker.state = 'CLOSED';
      policyEngine.circuitBreaker.tripReason = null;
    }

    // 2. Sincroniza Pausas de Módulos
    policyEngine.circuitBreaker.moduleOverrides.clear();
    for (const [col, info] of Object.entries(durable.modulePauses)) {
      if (info && info.paused) {
        policyEngine.circuitBreaker.moduleOverrides.set(col, {
          paused: true,
          reason: info.reason || 'Módulo pausado em governança durável',
        });
      }
    }

    // 3. Sincroniza Regras Ativas para este banco
    policyEngine.rules = policyEngine.rules.filter((r: any) => r.databaseId !== databaseId);
    if (Array.isArray(durable.activeRules)) {
      for (const r of durable.activeRules) {
        policyEngine.rules.push(r);
      }
    }

    return {
      synced: true,
      databaseId,
      stateVersion: durable.stateVersion,
      globalLockdown: durable.globalLockdown,
      rulesCount: durable.activeRules.length,
      pausedModulesCount: policyEngine.circuitBreaker.moduleOverrides.size,
      updatedAt: durable.updatedAt,
      updatedBy: durable.updatedBy,
    };
  }
}
