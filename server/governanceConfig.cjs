/**
 * ============================================================================
 * FASE 6.4 — GOVERNANÇA FORMAL DE CONFIGURAÇÃO DE AMBIENTE (CJS)
 * ============================================================================
 * Valida a matriz de variáveis de ambiente no boot para impedir combinações
 * ambíguas ou perigosas entre Produção e Sandbox e permitir persistência
 * durável de governança em produção (`crm_db`) e sandbox (`crm_db_sandbox`) (F36).
 * ============================================================================
 */

const VALID_ENVIRONMENTS = ['production', 'development', 'test'];
const PROD_DB = 'crm_db';
const SANDBOX_DB = 'crm_db_sandbox';
const TEST_DB = 'crm_isolated_test';

/**
 * Resolve e valida a configuração de governança a partir do objeto `env`.
 *
 * @param {Record<string, string | undefined>} env - Geralmente `process.env`
 * @returns {{
 *   status: 'READY' | 'INVALID',
 *   mode: 'PERSISTENT' | 'VOLATILE' | 'NONE',
 *   nodeEnv: string,
 *   targetDb: string,
 *   databaseId: string,
 *   persistenceEnabled: boolean,
 *   reason: string
 * }}
 */
function resolveGovernanceConfig(env = process.env) {
    const nodeEnv = (env.NODE_ENV || 'development').trim().toLowerCase();
    const targetDb = (env.VITE_APPWRITE_DATABASE_ID || env.APPWRITE_DATABASE_ID || PROD_DB).trim();
    const explicitDisable =
        String(env.ENABLE_GOVERNANCE_PERSISTENCE || '').trim().toLowerCase() === 'false' ||
        String(env.ENABLE_PROD_GOVERNANCE_PERSISTENCE || '').trim().toLowerCase() === 'false';
    const explicitEnable =
        String(env.ENABLE_GOVERNANCE_PERSISTENCE || '').trim().toLowerCase() === 'true' ||
        String(env.ENABLE_PROD_GOVERNANCE_PERSISTENCE || '').trim().toLowerCase() === 'true';

    // 1. Validação básica de NODE_ENV
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

    // 2. Regras estritas para PRODUÇÃO (NODE_ENV === 'production')
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

        // F36: Persistência durável de governança habilitada em produção por padrão seguro
        // (a menos que explicitamente desativada via ENABLE_PROD_GOVERNANCE_PERSISTENCE=false)
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

    // 3. Regras para DEVELOPMENT / TEST
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

    // 4. Banco desconhecido
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

module.exports = {
    resolveGovernanceConfig,
    PROD_DB,
    SANDBOX_DB,
    TEST_DB
};
