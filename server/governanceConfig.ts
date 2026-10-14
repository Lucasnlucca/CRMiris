/**
 * Configuração Autoritativa de Governança — TypeScript / ESM (Fase 5H.13)
 *
 * Espelho funcional de `governanceConfig.cjs` para o runtime do Vite (desenvolvimento local).
 * Cada runtime resolve sua própria configuração a partir do seu próprio ambiente de servidor;
 * não há estado compartilhado entre o servidor standalone e o Vite.
 *
 * Variáveis (NUNCA usar prefixo VITE_):
 *   GOVERNANCE_ENVIRONMENT, GOVERNANCE_DATABASE_ID,
 *   ENABLE_PROD_GOVERNANCE_PERSISTENCE, ENABLE_SANDBOX_GOVERNANCE_PERSISTENCE
 */

export const PRODUCTION_GOVERNANCE_DATABASE_IDS: readonly string[] = Object.freeze(['crm_db']);
export const SANDBOX_GOVERNANCE_DATABASE_IDS: readonly string[] = Object.freeze(['crm_isolated_test', 'crm_sandbox_test']);
export const VALID_GOVERNANCE_ENVIRONMENTS: readonly string[] = Object.freeze(['production', 'sandbox']);

export const GOVERNANCE_REASON_CODES = Object.freeze({
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

export type GovernanceRuntime = 'standalone' | 'vite' | 'test';

export interface GovernanceConfig {
  readonly runtime: GovernanceRuntime;
  readonly environment: string;
  readonly databaseId: string | null;
  readonly persistenceEnabled: boolean;
  readonly status: 'READY' | 'UNCONFIGURED' | 'INVALID';
  readonly mode: 'STATIC' | 'PERSISTENT' | 'FAIL_CLOSED';
  readonly protectedOperationsAllowed: boolean;
  readonly reasonCode: string;
  readonly reason: string;
}

export function isSandboxGovernanceDatabase(databaseId: unknown): boolean {
  return typeof databaseId === 'string' && SANDBOX_GOVERNANCE_DATABASE_IDS.includes(databaseId);
}

export function isProductionGovernanceDatabase(databaseId: unknown): boolean {
  return typeof databaseId === 'string' && PRODUCTION_GOVERNANCE_DATABASE_IDS.includes(databaseId);
}

function readRaw(env: Record<string, string | undefined> | undefined, key: string): string {
  const v = env ? env[key] : undefined;
  return typeof v === 'string' ? v.trim() : '';
}

function parseStrictFlag(
  env: Record<string, string | undefined>,
  key: string,
  errors: Array<{ code: string; reason: string }>
): boolean {
  const raw = readRaw(env, key);
  if (raw === '') return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  errors.push({ code: GOVERNANCE_REASON_CODES.FLAG_INVALID, reason: `Valor inválido para ${key} (aceitos: "true" ou "false").` });
  return false;
}

function buildConfig(fields: Omit<GovernanceConfig, 'protectedOperationsAllowed'>): GovernanceConfig {
  return Object.freeze({
    runtime: fields.runtime,
    environment: fields.environment,
    databaseId: fields.databaseId || null,
    persistenceEnabled: Boolean(fields.persistenceEnabled),
    status: fields.status,
    mode: fields.mode,
    protectedOperationsAllowed: fields.status === 'READY',
    reasonCode: fields.reasonCode,
    reason: fields.reason,
  });
}

export function resolveGovernanceConfig(
  env: Record<string, string | undefined> = process.env,
  opts: { runtime?: GovernanceRuntime } = {}
): GovernanceConfig {
  const runtime: GovernanceRuntime = opts.runtime || 'standalone';
  const errors: Array<{ code: string; reason: string }> = [];

  const rawEnvironment = readRaw(env, 'GOVERNANCE_ENVIRONMENT');
  const environment = rawEnvironment === '' ? 'production' : rawEnvironment;
  const databaseId = readRaw(env, 'GOVERNANCE_DATABASE_ID');
  const prodFlag = parseStrictFlag(env, 'ENABLE_PROD_GOVERNANCE_PERSISTENCE', errors);
  const sandboxFlag = parseStrictFlag(env, 'ENABLE_SANDBOX_GOVERNANCE_PERSISTENCE', errors);

  const failClosed = (reasonCode: string, reason: string) =>
    buildConfig({ runtime, environment, databaseId: null, persistenceEnabled: false, status: 'INVALID', mode: 'FAIL_CLOSED', reasonCode, reason });

  if (!VALID_GOVERNANCE_ENVIRONMENTS.includes(environment)) {
    return failClosed(GOVERNANCE_REASON_CODES.ENVIRONMENT_INVALID, 'GOVERNANCE_ENVIRONMENT deve ser "production" ou "sandbox".');
  }

  if (errors.length > 0) {
    return failClosed(errors[0].code, errors[0].reason);
  }

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

export interface GovernanceInitResult {
  status: string;
  mode: 'STATIC' | 'PERSISTENT' | 'FAIL_CLOSED';
  reasonCode: string;
  adapterAttached: boolean;
  synced: boolean;
  failClosed?: boolean;
  stateVersion?: number;
}

export async function initializeGovernance(
  engine: any,
  config: GovernanceConfig | null | undefined,
  deps: { createAdapter?: (databaseId: string) => any; logPrefix?: string; logger?: Pick<Console, 'log' | 'warn'> } = {}
): Promise<GovernanceInitResult> {
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

  let adapter: any;
  try {
    if (typeof deps.createAdapter !== 'function') {
      throw new Error('Fábrica de adaptador não fornecida.');
    }
    adapter = deps.createAdapter(config.databaseId as string);
  } catch (err: any) {
    engine.setGovernanceGate({
      open: false,
      code: 503,
      reasonCode: GOVERNANCE_REASON_CODES.ADAPTER_INIT_FAILED,
      reason: '[GOVERNANCE_FAIL_CLOSED] Falha ao inicializar o adaptador de persistência. Operações protegidas bloqueadas.',
    });
    logger.warn(`${logPrefix} Fail-Closed: falha ao inicializar adaptador (${err?.message || 'erro desconhecido'}).`);
    return { status: 'INVALID', mode: 'FAIL_CLOSED', reasonCode: GOVERNANCE_REASON_CODES.ADAPTER_INIT_FAILED, adapterAttached: false, synced: false };
  }

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
    return { status: 'READY', mode: 'PERSISTENT', reasonCode: config.reasonCode, adapterAttached: true, synced: true, failClosed, stateVersion: syncRes?.stateVersion };
  } catch (err: any) {
    logger.warn(`${logPrefix} Falha na sincronização inicial; motor em Fail-Closed (${err?.message || 'erro desconhecido'}).`);
    return { status: 'READY', mode: 'PERSISTENT', reasonCode: config.reasonCode, adapterAttached: true, synced: false, failClosed: true };
  }
}

export function describeGovernanceConfig(config: GovernanceConfig | null | undefined) {
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
