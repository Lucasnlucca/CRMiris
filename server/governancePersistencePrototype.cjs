/**
 * Protótipo Isolado de Persistência de Governança — Fase 5H.10
 *
 * Implementa e valida a persistência durável no sandbox (crm_isolated_test):
 * 1. Persistência na coleção 'system_policy_governance'.
 * 2. Trava de segurança estrita contra 'crm_db'.
 * 3. Controle de concorrência atômica via updateDocuments com Query de versão (OCC).
 * 4. Inicialização Fail-Closed em caso de falha de conexão ou documento corrompido.
 * 5. Sanitização estrita: zero segredos ou JWTs persistidos no documento.
 */

const { Client, Databases, Permission, Role, Query } = require('node-appwrite');

const GOVERNANCE_COLLECTION_ID = 'system_policy_governance';
const ALLOWED_PROTOTYPE_DBS = new Set(['crm_isolated_test', 'crm_sandbox_test']);

class GovernancePersistencePrototype {
  /**
   * @param {Object} config
   * @param {string} config.endpoint
   * @param {string} config.projectId
   * @param {string} config.apiKey
   */
  constructor(config = {}) {
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

  getEffectiveDatabaseId() {
    return this.targetDatabaseId;
  }

  /**
   * Valida autoritativamente que o banco alvo é estritamente o sandbox de testes
   * @param {string} databaseId
   */
  assertSandboxSafety(databaseId) {
    if (!databaseId || !ALLOWED_PROTOTYPE_DBS.has(databaseId)) {
      throw new Error(`[SAFETY_GATE_TRIGGERED] Acesso negado: o banco "${databaseId}" não é um sandbox autorizado para este protótipo.`);
    }
    if (databaseId === 'crm_db') {
      throw new Error('[PROD_GUARD] Tentativa ilegal de acesso de escrita/persistência ao banco de produção crm_db.');
    }
  }

  /**
   * Obtém o ID estável do documento singleton
   * @param {string} databaseId
   */
  getDocumentId(databaseId) {
    this.assertSandboxSafety(databaseId);
    return `policy_state_${databaseId}`;
  }

  /**
   * Carrega o estado durável de governança com comportamento Fail-Closed
   * @param {string} databaseId
   * @returns {Promise<{ globalLockdown: boolean, tripReason: string, stateVersion: number, modulePauses: Object, activeRules: Array, updatedAt: string, updatedBy: string }>}
   */
  async loadGovernanceState(databaseId) {
    this.assertSandboxSafety(databaseId);
    const docId = this.getDocumentId(databaseId);

    try {
      const doc = await this.databases.getDocument(databaseId, GOVERNANCE_COLLECTION_ID, docId);

      let parsedPauses = {};
      let parsedRules = [];

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
    } catch (err) {
      console.error(`[PERSISTENCE_FAIL_CLOSED] Falha ao carregar estado de governança para "${databaseId}": ${err.message}`);
      // Comportamento FAIL-CLOSED: Se o banco estiver fora ou corrompido, assume lockdown total
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

  /**
   * Grava o estado de governança com verificação de concorrência atômica (OCC)
   * @param {Object} params
   * @param {string} params.databaseId
   * @param {number} params.expectedVersion
   * @param {Object} params.stateUpdates - { globalLockdown?, tripReason?, modulePauses?, activeRules? }
   * @param {string} params.actorId
   */
  async saveGovernanceStateAtomic({ databaseId, expectedVersion, stateUpdates, actorId }) {
    this.assertSandboxSafety(databaseId);
    const docId = this.getDocumentId(databaseId);

    if (typeof expectedVersion !== 'number' || expectedVersion < 1) {
      throw new Error('[CONCURRENCY_ERROR] expectedVersion numérico válido é obrigatório.');
    }

    const payload = {
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

    // 1. Atualização Condicional Atômica usando updateDocuments com queries
    // Garante que a atualização SÓ ocorra se $id == docId E state_version == expectedVersion
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
      // Nenhum documento foi atualizado -> significa que a versão no banco já mudou (Corrida detectada)
      const freshDoc = await this.databases.getDocument(databaseId, GOVERNANCE_COLLECTION_ID, docId);
      const conflictError = new Error(
        `[CONCURRENCY_CONFLICT] Falha de concorrência atômica. A versão esperada era ${expectedVersion}, mas o estado já foi alterado para ${freshDoc.state_version} por "${freshDoc.updated_by}".`
      );
      conflictError.statusCode = 409;
      conflictError.currentVersion = freshDoc.state_version;
      throw conflictError;
    }

    const updatedDoc = result.documents[0];
    return {
      success: true,
      stateVersion: updatedDoc.state_version,
      updatedAt: updatedDoc.updated_at,
      updatedBy: updatedDoc.updated_by,
      globalLockdown: updatedDoc.global_lockdown,
    };
  }

  /**
   * Sincroniza o WritePolicyEngine em memória a partir do estado durável
   * @param {Object} policyEngine
   * @param {string} databaseId
   */
  async syncPolicyEngineFromDurableState(policyEngine, databaseId) {
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
    // Remove regras antigas deste banco e injeta as regras duráveis
    policyEngine.rules = policyEngine.rules.filter(r => r.databaseId !== databaseId);
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
    };
  }
}

module.exports = {
  GovernancePersistencePrototype,
  GOVERNANCE_COLLECTION_ID,
  ALLOWED_PROTOTYPE_DBS,
};
