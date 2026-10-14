/**
 * Configuração Autoritativa de Governança — Iris Horizon CRM (Fase 5H.13)
 *
 * Fonte ÚNICA de verdade, exclusivamente server-side, para o banco de governança
 * do Write Policy Engine. Elimina identificadores fixos de sandbox no startup e
 * impede que o frontend selecione o banco de destino.
 *
 * Variáveis de ambiente (NUNCA usar prefixo VITE_, pois o Vite as exporia ao bundle):
 *   GOVERNANCE_ENVIRONMENT               'production' | 'sandbox'   (ausente => 'production', o mais restritivo)
 *   GOVERNANCE_DATABASE_ID               identificador autoritativo do banco de governança (sem fallback)
 *   ENABLE_PROD_GOVERNANCE_PERSISTENCE   'true' | 'false'           (padrão seguro: false)
 *   ENABLE_SANDBOX_GOVERNANCE_PERSISTENCE 'true' | 'false'          (padrão: false)
 *
 * Regras:
 *   - DEFAULT_DATABASE_ID / VITE_APPWRITE_DATABASE_ID NÃO é considerado banco de governança.
 *   - Nenhum fallback entre sandbox e produção, em nenhuma direção.
 *   - Identificador ausente, desconhecido ou incompatível com o ambiente => operações protegidas em Deny-All.
 *   - Flags com valores diferentes de 'true'/'false' são rejeitadas (configuração inesperada).
 *   - Persistência durável de produção ainda não é suportada (coleção inexistente em crm_db e o
 *     adaptador recusa crm_db). Se habilitada, o servidor entra em Fail-Closed sem conectar ao banco.
 */

const PRODUCTION_GOVERNANCE_DATABASE_IDS = Object.freeze(['crm_db']);
const SANDBOX_GOVERNANCE_DATABASE_IDS = Object.freeze(['crm_isolated_test', 'crm_sandbox_test']);
const VALID_GOVERNANCE_ENVIRONMENTS = Object.freeze(['production', 'sandbox']);

const GOVERNANCE_REASON_CODES = Object.freeze({
  READY: 'GOVERNANCE_READY',
  DATABASE_ID_MISSING: 'GOVERNANCE_DATABASE_ID_MISSING',
  ENVIRONMENT_INVALID: 'GOVERNANCE_ENVIRONMENT_INVALID',
  DATABASE_ID_UNKNOWN: 'GOVERNANCE_DATABASE_ID_UNKNOWN',
  ENVIRONMENT_MISMATCH: 'GOVERNANCE_ENVIRONMENT_MISMATCH',
  FLAG_INVALID: 'GOVERNANCE_FLAG_INVALID',
  FLAG_UNEXPECTED: 'GOVERNANCE_FLAG_UNEXPECTED_FOR_ENVIRONMENT',
  PERSISTENCE_WITHOUT_DATABASE: 'GOVERNANCE_PERSISTENCE_ENABLED_WITHOUT_DATABASE_ID',
  PROD_PERSISTENCE_UNAVAILABLE: 'PROD_GOVERNANCE_PERSISTENCE_UNAVAILABLE',
  ADAPTER_INIT_FAILED: 'GOVERNANCE_ADAPTER_INIT_FAILED',
  ADAPTER_TARGET_MISMATCH: 'GOVERNANCE_ADAPTER_TARGET_MISMATCH',
});

function isSandboxGovernanceDatabase(databaseId) {
  return typeof databaseId === 'string' && SANDBOX_GOVERNANCE_DATABASE_IDS.includes(databaseId);
}

function isProductionGovernanceDatabase(databaseId) {
  return typeof databaseId === 'string' && PRODUCTION_GOVERNANCE_DATABASE_IDS.includes(databaseId);
}

function readRaw(env, key) {
  const v = env ? env[key] : undefined;
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Interpreta uma flag booleana de forma estrita: somente 'true' ou 'false' (ou ausente).
 */
function parseStrictFlag(env, key, errors) {
  const raw = readRaw(env, key);
  if (raw === '') return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  errors.push({ code: GOVERNANCE_REASON_CODES.FLAG_INVALID, reason: `Valor inválido para ${key} (aceitos: "true" ou "false").` });
  return false;
}

function buildConfig(fields) {
  return Object.freeze({
    runtime: fields.runtime,
    environment: fields.environment,
    databaseId: fields.databaseId || null,
    persistenceEnabled: Boolean(fields.persistenceEnabled),
    status: fields.status, // 'READY' | 'UNCONFIGURED' | 'INVALID'
    mode: fields.mode, // 'STATIC' | 'PERSISTENT' | 'FAIL_CLOSED'
    protectedOperationsAllowed: fields.status === 'READY',
    reasonCode: fields.reasonCode,
    reason: fields.reason,
  });
}

/**
 * Resolve e valida a configuração de governança a partir do ambiente do SERVIDOR.
 * Nunca recebe dados do cliente. Retorna objeto congelado.
 *
 * @param {Record<string,string|undefined>} env - normalmente process.env
 * @param {{ runtime?: 'standalone' | 'vite' | 'test' }} [opts]
 */
function resolveGovernanceConfig(env = process.env, opts = {}) {
  const runtime = opts.runtime || 'standalone';
  const errors = [];

  const rawEnvironment = readRaw(env, 'GOVERNANCE_ENVIRONMENT');
  const environment = rawEnvironment === '' ? 'production' : rawEnvironment;
  const databaseId = readRaw(env, 'GOVERNANCE_DATABASE_ID');
  const prodFlag = parseStrictFlag(env, 'ENABLE_PROD_GOVERNANCE_PERSISTENCE', errors);
  const sandboxFlag = parseStrictFlag(env, 'ENABLE_SANDBOX_GOVERNANCE_PERSISTENCE', errors);

  const failClosed = (reasonCode, reason) =>
    buildConfig({ runtime, environment, databaseId: null, persistenceEnabled: false, status: 'INVALID', mode: 'FAIL_CLOSED', reasonCode, reason });

  if (!VALID_GOVERNANCE_ENVIRONMENTS.includes(environment)) {
    return failClosed(GOVERNANCE_REASON_CODES.ENVIRONMENT_INVALID, 'GOVERNANCE_ENVIRONMENT deve ser "production" ou "sandbox".');
  }

  if (errors.length > 0) {
    return failClosed(errors[0].code, errors[0].reason);
  }

  // Flags cruzadas são consideradas configuração inesperada
  if (environment === 'production' && sandboxFlag) {
    return failClosed(GOVERNANCE_REASON_CODES.FLAG_UNEXPECTED, 'ENABLE_SANDBOX_GOVERNANCE_PERSISTENCE não é permitido no ambiente de produção.');
  }
  if (environment === 'sandbox' && prodFlag) {
    return failClosed(GOVERNANCE_REASON_CODES.FLAG_UNEXPECTED, 'ENABLE_PROD_GOVERNANCE_PERSISTENCE não é permitido no ambiente sandbox.');
  }

  const persistenceRequested = environment === 'production' ? prodFlag : sandboxFlag;

  if (!databaseId) {
    if (persistenceRequested) {
      return failClosed(GOVERNANCE_REASON_CODES.PERSISTENCE_WITHOUT_DATABASE, 'Persistência de governança habilitada sem GOVERNANCE_DATABASE_ID.');
    }
    return buildConfig({
      runtime,
      environment,
      databaseId: null,
      persistenceEnabled: false,
      status: 'UNCONFIGURED',
      mode: 'FAIL_CLOSED',
      reasonCode: GOVERNANCE_REASON_CODES.DATABASE_ID_MISSING,
      reason: 'GOVERNANCE_DATABASE_ID ausente: nenhum banco é selecionado automaticamente; operações protegidas bloqueadas.',
    });
  }

  const knownProd = isProductionGovernanceDatabase(databaseId);
  const knownSandbox = isSandboxGovernanceDatabase(databaseId);

  if (!knownProd && !knownSandbox) {
    return failClosed(GOVERNANCE_REASON_CODES.DATABASE_ID_UNKNOWN, 'GOVERNANCE_DATABASE_ID não pertence à lista de bancos de governança reconhecidos.');
  }

  if ((environment === 'production' && !knownProd) || (environment === 'sandbox' && !knownSandbox)) {
    return failClosed(GOVERNANCE_REASON_CODES.ENVIRONMENT_MISMATCH, `GOVERNANCE_DATABASE_ID incompatível com GOVERNANCE_ENVIRONMENT="${environment}".`);
  }

  if (environment === 'production' && persistenceRequested) {
    // Persistência durável de produção ainda não homologada: coleção inexistente em crm_db e adaptador recusa crm_db.
    return failClosed(
      GOVERNANCE_REASON_CODES.PROD_PERSISTENCE_UNAVAILABLE,
      'ENABLE_PROD_GOVERNANCE_PERSISTENCE=true, mas a persistência de governança de produção não está homologada. Operações protegidas bloqueadas (Fail-Closed).'
    );
  }

  return buildConfig({
    runtime,
    environment,
    databaseId,
    persistenceEnabled: persistenceRequested,
    status: 'READY',
    mode: persistenceRequested ? 'PERSISTENT' : 'STATIC',
    reasonCode: GOVERNANCE_REASON_CODES.READY,
    reason: persistenceRequested
      ? 'Governança persistente habilitada no sandbox configurado.'
      : 'Persistência de governança desabilitada: regras estáticas compiladas, estado administrativo volátil em memória.',
  });
}

/**
 * Inicializa o motor de políticas a partir de uma configuração resolvida.
 * Nunca cria adaptador nem conecta ao Appwrite quando a persistência estiver desabilitada.
 *
 * @param {object} engine - WritePolicyEngine
 * @param {ReturnType<typeof resolveGovernanceConfig>} config
 * @param {{ createAdapter?: (databaseId: string) => any, logPrefix?: string, logger?: Console }} [deps]
 */
async function initializeGovernance(engine, config, deps = {}) {
  const logPrefix = deps.logPrefix || '[GOVERNANCE]';
  const logger = deps.logger || console;

  if (!config || config.status !== 'READY') {
    const reasonCode = config ? config.reasonCode : GOVERNANCE_REASON_CODES.DATABASE_ID_MISSING;
    engine.setGovernanceGate({
      open: false,
      code: 503,
      reasonCode,
      reason: `[GOVERNANCE_FAIL_CLOSED] Configuração de governança indisponível (${reasonCode}). Operações protegidas bloqueadas.`,
    });
    logger.warn(`${logPrefix} Fail-Closed: ${reasonCode}`);
    return { status: config ? config.status : 'UNCONFIGURED', mode: 'FAIL_CLOSED', reasonCode, adapterAttached: false, synced: false };
  }

  engine.bindGovernanceDatabase(config.databaseId);
  engine.setGovernanceGate({ open: true, reasonCode: GOVERNANCE_REASON_CODES.READY });

  if (!config.persistenceEnabled) {
    logger.log(`${logPrefix} Ambiente=${config.environment} banco=${config.databaseId} persistência=DESABILITADA (regras estáticas).`);
    return { status: 'READY', mode: 'STATIC', reasonCode: config.reasonCode, adapterAttached: false, synced: false };
  }

  let adapter;
  try {
    if (typeof deps.createAdapter !== 'function') {
      throw new Error('Fábrica de adaptador não fornecida.');
    }
    adapter = deps.createAdapter(config.databaseId);
  } catch (err) {
    engine.setGovernanceGate({
      open: false,
      code: 503,
      reasonCode: GOVERNANCE_REASON_CODES.ADAPTER_INIT_FAILED,
      reason: '[GOVERNANCE_FAIL_CLOSED] Falha ao inicializar o adaptador de persistência. Operações protegidas bloqueadas.',
    });
    logger.warn(`${logPrefix} Fail-Closed: falha ao inicializar adaptador (${err && err.message ? err.message : 'erro desconhecido'}).`);
    return { status: 'INVALID', mode: 'FAIL_CLOSED', reasonCode: GOVERNANCE_REASON_CODES.ADAPTER_INIT_FAILED, adapterAttached: false, synced: false };
  }

  // Verifica o identificador EFETIVO do adaptador (não apenas o nome da variável)
  const effective = adapter && typeof adapter.getEffectiveDatabaseId === 'function' ? adapter.getEffectiveDatabaseId() : null;
  if (effective !== config.databaseId) {
    engine.setGovernanceGate({
      open: false,
      code: 503,
      reasonCode: GOVERNANCE_REASON_CODES.ADAPTER_TARGET_MISMATCH,
      reason: '[GOVERNANCE_FAIL_CLOSED] Identificador efetivo do adaptador diverge da configuração autoritativa.',
    });
    logger.warn(`${logPrefix} Fail-Closed: identificador efetivo do adaptador diverge da configuração.`);
    return { status: 'INVALID', mode: 'FAIL_CLOSED', reasonCode: GOVERNANCE_REASON_CODES.ADAPTER_TARGET_MISMATCH, adapterAttached: false, synced: false };
  }

  engine.attachPersistenceAdapter(adapter);

  try {
    const syncRes = await engine.syncFromDurable(config.databaseId);
    const failClosed = Boolean(syncRes && syncRes.failClosed);
    logger.log(`${logPrefix} Ambiente=${config.environment} banco=${config.databaseId} persistência=HABILITADA sincronizado=v${syncRes ? syncRes.stateVersion : '?'}${failClosed ? ' (FAIL-CLOSED)' : ''}.`);
    return { status: 'READY', mode: 'PERSISTENT', reasonCode: config.reasonCode, adapterAttached: true, synced: true, failClosed, stateVersion: syncRes ? syncRes.stateVersion : undefined };
  } catch (err) {
    // engine.syncFromDurable já aplicou lockdown fail-closed
    logger.warn(`${logPrefix} Falha na sincronização inicial; motor em Fail-Closed (${err && err.message ? err.message : 'erro desconhecido'}).`);
    return { status: 'READY', mode: 'PERSISTENT', reasonCode: config.reasonCode, adapterAttached: true, synced: false, failClosed: true };
  }
}

/**
 * Descrição pública (sem segredos) da configuração para respostas HTTP administrativas.
 */
function describeGovernanceConfig(config) {
  if (!config) return { status: 'UNCONFIGURED', mode: 'FAIL_CLOSED' };
  return {
    environment: config.environment,
    databaseId: config.databaseId,
    status: config.status,
    mode: config.mode,
    persistence: config.persistenceEnabled ? 'ENABLED' : 'DISABLED',
    reasonCode: config.reasonCode,
  };
}

module.exports = {
  PRODUCTION_GOVERNANCE_DATABASE_IDS,
  SANDBOX_GOVERNANCE_DATABASE_IDS,
  VALID_GOVERNANCE_ENVIRONMENTS,
  GOVERNANCE_REASON_CODES,
  isSandboxGovernanceDatabase,
  isProductionGovernanceDatabase,
  resolveGovernanceConfig,
  initializeGovernance,
  describeGovernanceConfig,
};
