/**
 * ============================================================================
 * ASAAS API HTTP HANDLER (SERVER-SIDE CJS)
 * ============================================================================
 * CommonJS counterpart of asaasHandler.ts for production Node runtime (F01).
 * Exposes authenticated, tenant-scoped REST endpoints under `/api/asaas/*`:
 * - Enforces Appwrite JWT/session authentication, tenant membership verification,
 *   financial/admin role checks, and client tenant ownership (S06, S11).
 * - Validates webhook secret on `POST /api/asaas/webhook` and scopes charge
 *   updates strictly to the verified tenant (S06, S09).
 * ============================================================================
 */

const crypto = require('crypto');
const { Client, Databases, Query } = require('node-appwrite');
const {
    getAsaasConfig,
    saveAsaasConfig,
    disconnectAsaasConfig,
    listAsaasCustomers,
    listAsaasPaymentsEnriched,
    getClientPaymentHistory,
    getAsaasPixQrCode,
    getAsaasIdentificationField,
    syncAllAsaasPaymentsToAppwrite,
    createAsaasPaymentAndSync,
    ensureAsaasCustomerForCrmClient,
    cancelAsaasPayment,
    getPaymentBillingInfo
} = require('./asaasService.cjs');
const { readJsonBody } = require('./requestUtils.cjs');
const { authenticateAndResolveCaller } = require('./userManagementHandler.cjs');

const FINANCIAL_ADMIN_ROLES = new Set(['owner', 'admin', 'finance', 'financial', 'manager']);
const FINANCIAL_READ_ROLES = new Set(['owner', 'admin', 'finance', 'financial', 'manager', 'comercial']);

function sendJson(res, status, data) {
    if (res.headersSent) return;
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id, X-Appwrite-JWT, X-Appwrite-Session, asaas-access-token'
    });
    res.end(JSON.stringify(data));
}

function getAdminDb(envConfig, sdkOverrides) {
    if (sdkOverrides && sdkOverrides.adminDb) {
        return sdkOverrides.adminDb;
    }
    if (!envConfig.projectId || !envConfig.apiKey) return null;
    const client = new Client()
        .setEndpoint(envConfig.endpoint || 'https://cloud.appwrite.io/v1')
        .setProject(envConfig.projectId)
        .setKey(envConfig.apiKey);
    return new Databases(client);
}

function resolveAuthorizedAsaasTenant(req, url, body, caller, requireWriteRole) {
    const requested =
        (body && body.tenantId) ||
        url.searchParams.get('tenantId') ||
        req.headers['x-tenant-id'] ||
        '';

    let targetTenant = String(requested || '').trim();

    if (!targetTenant || targetTenant === 'default') {
        const callerTenants = Object.keys(caller.tenantRoles || {});
        if (callerTenants.length === 1) {
            targetTenant = callerTenants[0];
        } else if (caller.isSuperAdmin && targetTenant === 'default') {
            targetTenant = 'default';
        } else if (!targetTenant) {
            const err = new Error('O identificador da empresa (tenantId) é obrigatório para operações financeiras.');
            err.statusCode = 400;
            err.code = 'MISSING_TENANT_ID';
            throw err;
        }
    }

    if (!caller.isSuperAdmin) {
        const roles = caller.tenantRoles[targetTenant];
        if (!roles || !Array.isArray(roles)) {
            const err = new Error(`Isolamento Multi-Tenant: Você não pertence à empresa '${targetTenant}'. Operação financeira bloqueada.`);
            err.statusCode = 403;
            err.code = 'CROSS_TENANT_ASAAS_DENIED';
            throw err;
        }

        const normalizedRoles = roles.map(r => String(r).toLowerCase());
        const allowedSet = requireWriteRole ? FINANCIAL_ADMIN_ROLES : FINANCIAL_READ_ROLES;
        const hasRole = normalizedRoles.some(r => allowedSet.has(r));
        if (!hasRole) {
            const err = new Error(
                `Permissão financeira insuficiente: seu perfil (${roles.join(', ')}) não possui autorização para esta operação no Asaas.`
            );
            err.statusCode = 403;
            err.code = 'INSUFFICIENT_FINANCIAL_ROLE';
            throw err;
        }
    }

    return targetTenant;
}

async function assertTenantNotSuspended(db, databaseId, tenantId, isSuperAdmin) {
    if (isSuperAdmin || !db || typeof db.getDocument !== 'function' || tenantId === 'default') return;
    for (const col of ['tenants', 'test_tenants']) {
        try {
            const tenantDoc = await db.getDocument(databaseId, col, tenantId);
            if (tenantDoc) {
                const status = String(tenantDoc.status || 'active').toLowerCase();
                if (status === 'suspended' || status === 'cancelled' || tenantDoc.is_active === false) {
                    const err = new Error(`Acesso negado: A empresa '${tenantId}' encontra-se suspensa.`);
                    err.statusCode = 403;
                    err.code = 'TENANT_SUSPENDED';
                    throw err;
                }
                return;
            }
        } catch {
            // Ignore missing tenant doc
        }
    }
}

async function verifyClientBelongsToTenant(db, databaseId, clientId, targetTenant) {
    if (!db || !clientId) return null;
    let clientDoc = null;
    try {
        clientDoc = await db.getDocument(databaseId, 'clients', clientId);
    } catch {
        try {
            const res = await db.listDocuments(databaseId, 'clients', [
                Query.equal('$id', clientId),
                Query.limit(1)
            ]);
            clientDoc = res.documents[0] || null;
        } catch {
            clientDoc = null;
        }
    }

    if (!clientDoc) {
        const err = new Error(`Cliente '${clientId}' não encontrado.`);
        err.statusCode = 404;
        err.code = 'CLIENT_NOT_FOUND';
        throw err;
    }

    if (clientDoc.tenant_id && clientDoc.tenant_id !== targetTenant) {
        const err = new Error(`Isolamento Multi-Tenant: O cliente '${clientId}' não pertence à empresa '${targetTenant}'.`);
        err.statusCode = 403;
        err.code = 'CROSS_TENANT_CLIENT_DENIED';
        throw err;
    }

    return clientDoc;
}

async function handleAsaasRoutes(req, res, subPath, envConfig, sdkOverrides = {}) {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
    }

    const db = getAdminDb(envConfig, sdkOverrides);
    const DATABASE_ID = envConfig.databaseId || 'crm_db';
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    try {
        // ====================================================================
        // 1. POST /api/asaas/webhook (Authenticates via asaas-access-token)
        // ====================================================================
        if (subPath === '/webhook' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const targetTenant =
                url.searchParams.get('tenantId') ||
                req.headers['x-tenant-id'] ||
                body.tenantId ||
                'default';

            const providedToken = String(req.headers['asaas-access-token'] || '').trim();
            const cfg = await getAsaasConfig(db, DATABASE_ID, targetTenant);
            const expectedToken = String(cfg.webhookToken || process.env.ASAAS_WEBHOOK_TOKEN || '').trim();

            if (!expectedToken || !providedToken) {
                return sendJson(res, 401, {
                    success: false,
                    code: 'WEBHOOK_UNAUTHORIZED',
                    error: 'Webhook Asaas não autorizado: token de verificação ausente ou não configurado.'
                });
            }

            const providedBuf = Buffer.from(providedToken, 'utf8');
            const expectedBuf = Buffer.from(expectedToken, 'utf8');
            if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
                return sendJson(res, 401, {
                    success: false,
                    code: 'WEBHOOK_INVALID_TOKEN',
                    error: 'Webhook Asaas não autorizado: token inválido.'
                });
            }

            const event = body.event;
            const payment = body.payment;

            if (db && payment && payment.id) {
                try {
                    const existing = await db.listDocuments(DATABASE_ID, 'charges', [
                        Query.equal('tenant_id', targetTenant),
                        Query.limit(100)
                    ]);
                    const matched = (existing.documents || []).find(
                        c =>
                            c.tenant_id === targetTenant &&
                            (c.$id === payment.id ||
                                c.asaas_payment_id === payment.id ||
                                c.external_id === payment.id ||
                                c.number === payment.id ||
                                c.reference === payment.id)
                    );

                    if (matched) {
                        let newStatus = matched.status;
                        if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event)) newStatus = 'paid';
                        if (event === 'PAYMENT_OVERDUE') newStatus = 'overdue';
                        if (['PAYMENT_DELETED', 'PAYMENT_REFUNDED'].includes(event)) newStatus = 'cancelled';

                        await db.updateDocument(DATABASE_ID, 'charges', matched.$id, {
                            status: newStatus,
                            paid_date: payment.paymentDate || payment.clientPaymentDate || matched.paid_date || ''
                        });
                    }
                } catch (hookErr) {
                    console.warn('[AsaasWebhook] Update warning:', hookErr.message);
                }
            }

            return sendJson(res, 200, { received: true, event });
        }

        // ====================================================================
        // ALL OTHER ROUTES REQUIRE AUTHENTICATED CRM USER & TENANT MEMBERSHIP (S06)
        // ====================================================================
        let body = {};
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
            body = await readJsonBody(req);
        }

        const caller = await authenticateAndResolveCaller(req, envConfig, sdkOverrides);

        const isWriteOrConfigRoute =
            subPath === '/config' ||
            subPath === '/config/disconnect' ||
            subPath === '/diagnostic' ||
            subPath === '/payments/create' ||
            subPath === '/client/sync' ||
            subPath === '/sync' ||
            req.method === 'POST' ||
            req.method === 'PUT' ||
            req.method === 'DELETE';

        const tenantId = resolveAuthorizedAsaasTenant(req, url, body, caller, isWriteOrConfigRoute);
        await assertTenantNotSuspended(db, DATABASE_ID, tenantId, caller.isSuperAdmin);

        if (subPath === '/config' && req.method === 'GET') {
            const config = await getAsaasConfig(db, DATABASE_ID, tenantId);
            const maskedKey = config.apiKey
                ? `${config.apiKey.slice(0, 10)}...${config.apiKey.slice(-6)}`
                : '';

            return sendJson(res, 200, {
                success: true,
                tenantId,
                config: {
                    ...config,
                    apiKeyMasked: maskedKey,
                    hasApiKey: Boolean(config.apiKey),
                    apiKey: ''
                }
            });
        }

        if (subPath === '/config' && req.method === 'POST') {
            const result = await saveAsaasConfig(db, DATABASE_ID, tenantId, {
                apiKey: body.apiKey,
                environment: body.environment,
                webhookToken: body.webhookToken,
                autoSync: body.autoSync,
                syncIntervalMinutes: body.syncIntervalMinutes
            });

            if (!result.success) {
                return sendJson(res, 400, {
                    success: false,
                    error: result.error,
                    config: { ...result.config, apiKey: '' }
                });
            }

            return sendJson(res, 200, {
                success: true,
                tenantId,
                config: {
                    ...result.config,
                    apiKeyMasked: result.config.apiKey
                        ? `${result.config.apiKey.slice(0, 10)}...${result.config.apiKey.slice(-6)}`
                        : '',
                    hasApiKey: Boolean(result.config.apiKey),
                    apiKey: ''
                }
            });
        }

        if (subPath === '/config/disconnect' && req.method === 'POST') {
            await disconnectAsaasConfig(db, DATABASE_ID, tenantId);
            return sendJson(res, 200, {
                success: true,
                message: 'Integração Asaas desconectada com sucesso.'
            });
        }

        if (subPath === '/diagnostic' && req.method === 'GET') {
            const config = await getAsaasConfig(db, DATABASE_ID, tenantId);
            return sendJson(res, 200, {
                success: true,
                tenantId,
                hasApiKey: Boolean(config.apiKey),
                keyLength: config.apiKey ? config.apiKey.length : 0,
                keyPrefix: config.apiKey ? config.apiKey.slice(0, 10) : null,
                environment: config.environment,
                connected: config.connected,
                accountName: config.accountName || null,
                accountEmail: config.accountEmail || null,
                walletId: config.walletId || null,
                lastSyncAt: config.lastSyncAt || null
            });
        }

        if (subPath === '/payments' && req.method === 'GET') {
            const status = url.searchParams.get('status') || undefined;
            const billingType = url.searchParams.get('billingType') || undefined;
            const customer = url.searchParams.get('customer') || undefined;
            const limit = Number(url.searchParams.get('limit') || 100);
            const offset = Number(url.searchParams.get('offset') || 0);

            const data = await listAsaasPaymentsEnriched(db, DATABASE_ID, tenantId, {
                status,
                billingType,
                customer,
                limit,
                offset
            });

            return sendJson(res, 200, { success: true, ...data });
        }

        if (subPath === '/payments/create' && req.method === 'POST') {
            const {
                crmClientId,
                customerName,
                customerEmail,
                customerDocument,
                customerPhone,
                asaasCustomerId,
                value,
                dueDate,
                billingType,
                description,
                externalReference,
                installmentCount
            } = body;

            if (!value || !dueDate || !customerName) {
                return sendJson(res, 400, {
                    success: false,
                    error: 'Campos obrigatórios: customerName, value e dueDate.'
                });
            }

            if (crmClientId) {
                await verifyClientBelongsToTenant(db, DATABASE_ID, String(crmClientId), tenantId);
            }

            const result = await createAsaasPaymentAndSync(db, DATABASE_ID, tenantId, {
                crmClientId,
                customerName,
                customerEmail,
                customerDocument,
                customerPhone,
                asaasCustomerId,
                value: Number(value),
                dueDate,
                billingType: billingType || 'BOLETO',
                description: description || 'Cobrança de Serviços',
                externalReference,
                installmentCount: installmentCount ? Number(installmentCount) : undefined
            });

            if (!result.success) {
                return sendJson(res, 400, result);
            }

            return sendJson(res, 200, result);
        }

        if (subPath.startsWith('/payments/') && req.method === 'DELETE') {
            const paymentId = subPath.replace('/payments/', '').split('/')[0];
            if (!paymentId) {
                return sendJson(res, 400, { success: false, error: 'paymentId é obrigatório.' });
            }
            const result = await cancelAsaasPayment(db, DATABASE_ID, tenantId, paymentId);
            return sendJson(res, result.success ? 200 : 400, result);
        }

        if (subPath === '/client/sync' && req.method === 'POST') {
            if (body.id) {
                await verifyClientBelongsToTenant(db, DATABASE_ID, String(body.id), tenantId);
            }
            const result = await ensureAsaasCustomerForCrmClient(db, DATABASE_ID, tenantId, {
                id: body.id,
                name: body.name,
                email: body.email,
                phone: body.phone,
                document: body.document,
                company: body.company,
                asaas_id: body.asaas_id
            });
            return sendJson(res, result.success ? 200 : 400, result);
        }

        if (subPath.startsWith('/payments/') && subPath.endsWith('/billing-info') && req.method === 'GET') {
            const parts = subPath.split('/');
            const paymentId = parts[2];
            if (!paymentId) {
                return sendJson(res, 400, { success: false, error: 'paymentId é obrigatório.' });
            }

            const info = await getPaymentBillingInfo(db, DATABASE_ID, tenantId, paymentId);
            return sendJson(res, info.success ? 200 : 404, info);
        }

        if (subPath.startsWith('/payments/') && subPath.endsWith('/pix') && req.method === 'GET') {
            const parts = subPath.split('/');
            const paymentId = parts[2];
            const pix = await getAsaasPixQrCode(db, DATABASE_ID, tenantId, paymentId);
            if (!pix) {
                return sendJson(res, 404, { success: false, error: 'QR Code PIX indisponível para esta cobrança.', pix: null });
            }
            return sendJson(res, 200, { success: true, pix });
        }

        if (subPath.startsWith('/payments/') && subPath.endsWith('/barcode') && req.method === 'GET') {
            const parts = subPath.split('/');
            const paymentId = parts[2];
            const bankSlip = await getAsaasIdentificationField(db, DATABASE_ID, tenantId, paymentId);
            if (!bankSlip) {
                return sendJson(res, 404, { success: false, error: 'Linha digitável indisponível para esta cobrança.', bankSlip: null });
            }
            return sendJson(res, 200, { success: true, bankSlip });
        }

        if (subPath === '/customers' && req.method === 'GET') {
            const cpfCnpj = url.searchParams.get('cpfCnpj') || undefined;
            const email = url.searchParams.get('email') || undefined;
            const name = url.searchParams.get('name') || undefined;

            const data = await listAsaasCustomers(db, DATABASE_ID, tenantId, { cpfCnpj, email, name });
            return sendJson(res, 200, { success: true, ...data });
        }

        if (subPath === '/client' && req.method === 'GET') {
            const clientId = url.searchParams.get('clientId') || '';
            let email = url.searchParams.get('email') || undefined;
            let document = url.searchParams.get('document') || undefined;
            let name = url.searchParams.get('name') || undefined;
            let asaas_id = url.searchParams.get('asaas_id') || undefined;

            if (db && clientId) {
                const doc = await verifyClientBelongsToTenant(db, DATABASE_ID, clientId, tenantId);
                if (doc) {
                    email = email || doc.email;
                    document = document || doc.document || doc.cnpj || doc.cpf;
                    name = name || doc.name || doc.company;
                    asaas_id = asaas_id || doc.asaas_id;
                }
            }

            const history = await getClientPaymentHistory(db, DATABASE_ID, tenantId, {
                id: clientId,
                email,
                document,
                name,
                asaas_id
            });

            return sendJson(res, 200, { success: true, ...history });
        }

        if (subPath === '/sync' && req.method === 'POST') {
            if (!db) {
                return sendJson(res, 500, { success: false, error: 'Banco de dados Appwrite não inicializado no servidor.' });
            }
            const result = await syncAllAsaasPaymentsToAppwrite(db, DATABASE_ID, tenantId);
            return sendJson(res, 200, { success: true, ...result });
        }

        return sendJson(res, 404, { success: false, error: `Asaas route not found: ${subPath}` });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        console.error('[AsaasHandler] Error:', err.message);
        return sendJson(res, statusCode, {
            success: false,
            code: err.code || 'ASAAS_HANDLER_ERROR',
            error: err.message || 'Erro interno na integração Asaas.'
        });
    }
}

module.exports = { handleAsaasRoutes };
