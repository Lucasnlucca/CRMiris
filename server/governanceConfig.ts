/**
 * ============================================================================
 * FASE 6.4 — GOVERNANÇA FORMAL DE CONFIGURAÇÃO DE AMBIENTE (TS / VITE DEV)
 * ============================================================================
 * Valida a matriz de variáveis de ambiente no boot para impedir combinações
 * ambíguas ou perigosas entre Produção e Sandbox e permitir persistência
 * durável de governança em produção (`crm_db`) e sandbox (`crm_db_sandbox`) (F36).
 * ============================================================================
 */

export type GovernanceStatus = 'READY' | 'INVALID';
export type GovernanceMode = 'PERSISTENT' | 'VOLATILE' | 'NONE';

export interface GovernanceConfigResolution {
    status: GovernanceStatus;
    mode: GovernanceMode;
    nodeEnv: string;
    targetDb: string;
    databaseId: string;
    persistenceEnabled: boolean;
    reason: string;
}

const VALID_ENVIRONMENTS = ['production', 'development', 'test'];
export const PROD_DB = 'crm_db';
export const SANDBOX_DB = 'crm_db_sandbox';
export const TEST_DB = 'crm_isolated_test';

export function resolveGovernanceConfig(
    env: Record<string, string | undefined> = process.env
): GovernanceConfigResolution {
    const nodeEnv = (env.NODE_ENV || 'development').trim().toLowerCase();
    const targetDb = (env.VITE_APPWRITE_DATABASE_ID || env.APPWRITE_DATABASE_ID || PROD_DB).trim();
    const explicitDisable =
        String(env.ENABLE_GOVERNANCE_PERSISTENCE || '').trim().toLowerCase() === 'false' ||
        String(env.ENABLE_PROD_GOVERNANCE_PERSISTENCE || '').trim().toLowerCase() === 'false';
    const explicitEnable =
        String(env.ENABLE_GOVERNANCE_PERSISTENCE || '').trim().toLowerCase() === 'true' ||
        String(env.ENABLE_PROD_GOVERNANCE_PERSISTENCE || '').trim().toLowerCase() === 'true';

    if (!VALID_ENVIRONMENTS.includes(nodeEnv)) {
        return {
            status: 'INVALID',
            mode: 'NONE',
            nodeEnv,
            targetDb,
            databaseId: targetDb,
            persistenceEnabled: false,
            reason: `NODE_ENV inválido ('${nodeEnv}'). Valores permitidos: ${VALID_ENVIRONMENTS.join(', ')}.`
        };
    }

    if (nodeEnv === 'production') {
        if (targetDb !== PROD_DB) {
            return {
                status: 'INVALID',
                mode: 'NONE',
                nodeEnv,
                targetDb,
                databaseId: targetDb,
                persistenceEnabled: false,
                reason: `PROIBIDO: NODE_ENV='production' não pode apontar para banco não-produtivo ('${targetDb}'). Esperado: '${PROD_DB}'.`
            };
        }

        const prodPersistent = !explicitDisable;

        return {
            status: 'READY',
            mode: prodPersistent ? 'PERSISTENT' : 'VOLATILE',
            nodeEnv,
            targetDb,
            databaseId: targetDb,
            persistenceEnabled: prodPersistent,
            reason: prodPersistent
                ? `Produção operando com governança PERSISTENT autoritativa em '${PROD_DB}'.`
                : 'Produção operando em modo VOLATILE (in-memory) por configuração explícita.'
        };
    }

    if (targetDb === SANDBOX_DB || targetDb === PROD_DB || targetDb === TEST_DB) {
        const usePersistent = explicitDisable ? false : (explicitEnable || targetDb === SANDBOX_DB || targetDb === PROD_DB);
        return {
            status: 'READY',
            mode: usePersistent ? 'PERSISTENT' : 'VOLATILE',
            nodeEnv,
            targetDb,
            databaseId: targetDb,
            persistenceEnabled: usePersistent,
            reason: usePersistent
                ? `Persistência durável de governança ativa em '${targetDb}'.`
                : `Governança operando em modo VOLATILE (in-memory) sobre '${targetDb}'.`
        };
    }

    if (explicitEnable) {
        return {
            status: 'INVALID',
            mode: 'NONE',
            nodeEnv,
            targetDb,
            databaseId: targetDb,
            persistenceEnabled: false,
            reason: `Banco desconhecido ('${targetDb}') não é elegível para persistência de governança.`
        };
    }

    return {
        status: 'READY',
        mode: 'VOLATILE',
        nodeEnv,
        targetDb,
        databaseId: targetDb,
        persistenceEnabled: false,
        reason: `Banco customizado ('${targetDb}') operando em modo VOLATILE seguro.`
    };
}
