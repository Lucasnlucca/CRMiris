/**
 * ============================================================================
 * ASAAS FINANCIAL GATEWAY INTEGRATION SERVICE (SERVER-SIDE TS)
 * ============================================================================
 * Handles all communication with Asaas API v3:
 * - Multi-tenant configuration management stored exclusively in Appwrite
 *   (`integration_configs`), never writing secrets to `.env.local` (S06)
 * - Customer lookup by CPF/CNPJ, email, or Asaas ID
 * - Real-time fetching of payments, PIX QR Codes, and Bank Slip digitable lines
 *   without fabricated fallback PIX/barcodes (F12)
 * - Strict tenant-scoped synchronization between Asaas and CRM `charges` without
 *   cross-tenant collision or arbitrary fallback to `clients[0]` (S09)
 * ============================================================================
 */

import { Databases, Query, ID } from 'node-appwrite';

export interface AsaasConfig {
    apiKey: string;
    environment: 'sandbox' | 'production';
    webhookToken?: string;
    autoSync: boolean;
    syncIntervalMinutes: number;
    notifyCustomerOnSync?: boolean;
    connected: boolean;
    walletId?: string;
    accountName?: string;
    accountEmail?: string;
    lastSyncAt?: string;
}

export interface AsaasCustomer {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    mobilePhone?: string;
    cpfCnpj?: string;
    company?: string;
    externalReference?: string;
}

export interface AsaasPayment {
    id: string;
    customer: string;
    customerName?: string;
    customerEmail?: string;
    customerCpfCnpj?: string;
    matchedClientId?: string;
    matchedClientName?: string;
    value: number;
    netValue: number;
    originalValue?: number;
    interestValue?: number;
    description: string;
    billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';
    status: string;
    dueDate: string;
    paymentDate?: string;
    clientPaymentDate?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    invoiceNumber?: string;
    externalReference?: string;
    nossoNumero?: string;
    deleted?: boolean;
    pixQrCode?: {
        encodedImage: string;
        payload: string;
        expirationDate: string;
    } | null;
    identificationField?: {
        identificationField: string;
        nossoNumero: string;
        barCode: string;
    } | null;
}

interface AsaasApiJson {
    id?: string;
    name?: string;
    tradingName?: string;
    email?: string;
    walletId?: string;
    data?: any[];
    totalCount?: number;
    errors?: Array<{ description?: string; code?: string }>;
    encodedImage?: string;
    payload?: string;
    expirationDate?: string;
    identificationField?: string;
    nossoNumero?: string;
    barCode?: string;
    [key: string]: any;
}

const inMemoryConfigCache: Record<string, AsaasConfig> = {};

function getBaseUrl(env: 'sandbox' | 'production'): string {
    return env === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://sandbox.asaas.com/api/v3';
}

export function normalizeAsaasApiKey(rawKey: string | undefined | null): string {
    if (!rawKey || typeof rawKey !== 'string') return '';
    let key = rawKey.trim();
    if (
        (key.startsWith('"') && key.endsWith('"')) ||
        (key.startsWith("'") && key.endsWith("'"))
    ) {
        key = key.slice(1, -1).trim();
    }
    if (key.startsWith('\\$aact_')) {
        key = key.replace(/^\\\$/, '$');
    }
    return key;
}

/**
 * Validates that an API key does not contain newline/CRLF injection characters (S06).
 */
export function assertSafeAsaasApiKey(rawKey: string): string {
    if (typeof rawKey !== 'string' || /\r|\n/.test(rawKey)) {
        const err: any = new Error('A chave de API do Asaas contém caracteres inválidos (quebra de linha não permitida).');
        err.statusCode = 400;
        err.code = 'INVALID_API_KEY_FORMAT';
        throw err;
    }
    const normalized = normalizeAsaasApiKey(rawKey);
    if (!normalized || /\r|\n/.test(normalized)) {
        const err: any = new Error('A chave de API do Asaas é obrigatória e deve ter formato válido.');
        err.statusCode = 400;
        err.code = 'INVALID_API_KEY_FORMAT';
        throw err;
    }
    return normalized;
}

/**
 * Retrieves the Asaas configuration for a given tenant from Appwrite (`integration_configs`).
 * Never leaks another tenant's credentials via `.env.local` (S06).
 */
export async function getAsaasConfig(
    db: Databases | null,
    databaseId: string,
    tenantId: string
): Promise<AsaasConfig> {
    const targetTenant = (tenantId && tenantId.trim()) ? tenantId.trim() : 'default';

    if (db) {
        try {
            const list = await db.listDocuments(databaseId, 'integration_configs', [
                Query.equal('tenant_id', targetTenant),
                Query.equal('provider', 'asaas'),
                Query.limit(1)
            ]);
            if (list.documents.length > 0) {
                const doc: any = list.documents[0];
                const parsedSettings = doc.settings_json ? JSON.parse(doc.settings_json) : {};
                const cfg: AsaasConfig = {
                    apiKey: normalizeAsaasApiKey(doc.api_key || parsedSettings.apiKey || ''),
                    environment: (doc.environment || parsedSettings.environment || 'sandbox') as 'sandbox' | 'production',
                    webhookToken: doc.webhook_token || parsedSettings.webhookToken || '',
                    autoSync: parsedSettings.autoSync ?? true,
                    syncIntervalMinutes: parsedSettings.syncIntervalMinutes || 15,
                    connected: Boolean(doc.api_key || parsedSettings.apiKey),
                    walletId: parsedSettings.walletId || '',
                    accountName: parsedSettings.accountName || '',
                    accountEmail: parsedSettings.accountEmail || '',
                    lastSyncAt: doc.last_sync_at || parsedSettings.lastSyncAt || ''
                };
                inMemoryConfigCache[targetTenant] = cfg;
                return cfg;
            }
        } catch {
            // Collection might not exist in Appwrite yet; fallback to tenant-scoped memory cache
        }
    }

    if (inMemoryConfigCache[targetTenant]) {
        return inMemoryConfigCache[targetTenant];
    }

    // Only allow process.env fallback when targetTenant is 'default' or explicitly matches ASAAS_DEFAULT_TENANT_ID, or 'matriz'
    const allowedEnvTenant = process.env.ASAAS_DEFAULT_TENANT_ID || 'default';
    if (targetTenant === allowedEnvTenant || (allowedEnvTenant === 'default' && (targetTenant === 'matriz' || targetTenant === 'tenant_default'))) {
        const envKey = normalizeAsaasApiKey(process.env.ASAAS_API_KEY || '');
        const envMode = (process.env.ASAAS_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
        if (envKey) {
            return {
                apiKey: envKey,
                environment: envMode,
                webhookToken: process.env.ASAAS_WEBHOOK_TOKEN || '',
                autoSync: true,
                syncIntervalMinutes: 15,
                connected: true
            };
        }
    }

    return {
        apiKey: '',
        environment: 'sandbox',
        webhookToken: '',
        autoSync: true,
        syncIntervalMinutes: 15,
        connected: false
    };
}

/**
 * Disconnects / clears Asaas integration for a tenant in Appwrite and memory cache (S06).
 */
export async function disconnectAsaasConfig(
    db: Databases | null,
    databaseId: string,
    tenantId: string
): Promise<{ success: boolean }> {
    const targetTenant = (tenantId && tenantId.trim()) ? tenantId.trim() : 'default';

    delete inMemoryConfigCache[targetTenant];

    if (db) {
        try {
            const list = await db.listDocuments(databaseId, 'integration_configs', [
                Query.equal('tenant_id', targetTenant),
                Query.equal('provider', 'asaas'),
                Query.limit(10)
            ]);
            for (const doc of list.documents) {
                await db.deleteDocument(databaseId, 'integration_configs', doc.$id);
            }
        } catch {
            // Ignore if collection does not exist
        }
    }

    return { success: true };
}

/**
 * Saves and validates Asaas configuration for a specific tenant in Appwrite (`integration_configs`).
 * Never writes API keys to `.env.local` on disk (S06).
 */
export async function saveAsaasConfig(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    partialConfig: Partial<AsaasConfig>
): Promise<{ success: boolean; config: AsaasConfig; accountInfo?: any; error?: string }> {
    const targetTenant = (tenantId && tenantId.trim()) ? tenantId.trim() : 'default';
    const current = await getAsaasConfig(db, databaseId, targetTenant);

    let normalizedKey = current.apiKey;
    if (partialConfig.apiKey !== undefined) {
        if (typeof partialConfig.apiKey === 'string' && partialConfig.apiKey.includes('...')) {
            normalizedKey = current.apiKey;
        } else {
            normalizedKey = assertSafeAsaasApiKey(String(partialConfig.apiKey));
        }
    }

    if (partialConfig.webhookToken !== undefined && typeof partialConfig.webhookToken === 'string') {
        if (/\r|\n/.test(partialConfig.webhookToken)) {
            const err: any = new Error('O webhookToken contém caracteres inválidos.');
            err.statusCode = 400;
            throw err;
        }
    }

    const merged: AsaasConfig = {
        ...current,
        ...partialConfig,
        apiKey: normalizedKey,
        environment: (partialConfig.environment || current.environment || 'sandbox') as 'sandbox' | 'production'
    };

    if (merged.apiKey) {
        try {
            const baseUrl = getBaseUrl(merged.environment);
            const res = await fetch(`${baseUrl}/myAccount`, {
                method: 'GET',
                headers: {
                    'access_token': merged.apiKey,
                    'Content-Type': 'application/json',
                    'User-Agent': 'IrisHorizonCRM/2.0'
                }
            });

            if (res.ok) {
                const accountData = (await res.json()) as AsaasApiJson;
                merged.connected = true;
                merged.accountName = accountData.name || accountData.tradingName || 'Conta Asaas Verificada';
                merged.accountEmail = accountData.email || '';
                merged.walletId = accountData.walletId || '';
            } else {
                const errBody = (await res.json().catch(() => ({}))) as AsaasApiJson;
                const errMsg = errBody?.errors?.[0]?.description || `Status HTTP ${res.status}`;
                return {
                    success: false,
                    config: { ...merged, connected: false },
                    error: `Chave Asaas inválida ou sem permissão no ambiente ${merged.environment}: ${errMsg}`
                };
            }
        } catch (err: any) {
            return {
                success: false,
                config: { ...merged, connected: false },
                error: `Falha de conexão com os servidores do Asaas: ${err.message}`
            };
        }
    } else {
        merged.connected = false;
    }

    inMemoryConfigCache[targetTenant] = merged;

    if (db) {
        const payload = {
            tenant_id: targetTenant,
            provider: 'asaas',
            environment: merged.environment,
            api_key: merged.apiKey,
            webhook_token: merged.webhookToken || '',
            last_sync_at: merged.lastSyncAt || new Date().toISOString(),
            settings_json: JSON.stringify({
                apiKey: merged.apiKey,
                environment: merged.environment,
                webhookToken: merged.webhookToken,
                autoSync: merged.autoSync,
                syncIntervalMinutes: merged.syncIntervalMinutes,
                walletId: merged.walletId,
                accountName: merged.accountName,
                accountEmail: merged.accountEmail,
                lastSyncAt: merged.lastSyncAt
            })
        };

        try {
            const existing = await db.listDocuments(databaseId, 'integration_configs', [
                Query.equal('tenant_id', targetTenant),
                Query.equal('provider', 'asaas'),
                Query.limit(1)
            ]);
            if (existing.documents.length > 0) {
                await db.updateDocument(databaseId, 'integration_configs', existing.documents[0].$id, payload);
            } else {
                await db.createDocument(databaseId, 'integration_configs', ID.unique(), payload);
            }
        } catch {
            // Keep in-memory cache if collection doesn't exist in test environment
        }
    }

    return { success: true, config: merged };
}

async function asaasFetch(config: AsaasConfig, endpointPath: string, options: RequestInit = {}): Promise<AsaasApiJson> {
    if (!config.apiKey) {
        throw new Error('Asaas API Key não configurada.');
    }
    const baseUrl = getBaseUrl(config.environment);
    const url = `${baseUrl}${endpointPath.startsWith('/') ? endpointPath : '/' + endpointPath}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            'access_token': config.apiKey,
            'Content-Type': 'application/json',
            'User-Agent': 'IrisHorizonCRM/2.0',
            ...(options.headers || {})
        }
    });

    if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as AsaasApiJson;
        const msg = errBody?.errors?.[0]?.description || `Asaas HTTP ${res.status}`;
        throw new Error(msg);
    }

    return (await res.json()) as AsaasApiJson;
}

export async function listAsaasCustomers(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    filters: { cpfCnpj?: string; email?: string; name?: string; limit?: number; offset?: number } = {}
): Promise<{ totalCount: number; data: AsaasCustomer[] }> {
    const config = await getAsaasConfig(db, databaseId, tenantId);
    if (!config.connected || !config.apiKey) {
        return { totalCount: 0, data: [] };
    }

    const params = new URLSearchParams();
    if (filters.cpfCnpj) params.set('cpfCnpj', filters.cpfCnpj.replace(/\D/g, ''));
    if (filters.email) params.set('email', filters.email.trim());
    if (filters.name) params.set('name', filters.name.trim());
    params.set('limit', String(filters.limit || 100));
    params.set('offset', String(filters.offset || 0));

    const res = await asaasFetch(config, `/customers?${params.toString()}`);
    return {
        totalCount: res.totalCount || 0,
        data: (res.data || []) as AsaasCustomer[]
    };
}

/**
 * Fetches PIX QR Code & Copy-Paste payload for a specific Asaas payment ID.
 * Returns `null` if unavailable (never fabricates fake PIX payloads - F12).
 */
export async function getAsaasPixQrCode(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    paymentId: string
): Promise<{ encodedImage: string; payload: string; expirationDate: string } | null> {
    const config = await getAsaasConfig(db, databaseId, tenantId);
    if (!config.connected || !config.apiKey) {
        return null;
    }

    try {
        const res = await asaasFetch(config, `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
        if (!res || (!res.payload && !res.encodedImage)) {
            return null;
        }
        return {
            encodedImage: res.encodedImage || '',
            payload: res.payload || '',
            expirationDate: res.expirationDate || ''
        };
    } catch {
        return null;
    }
}

/**
 * Fetches Bank Slip (Boleto) digitable line (identificationField) and barCode.
 * Returns `null` if unavailable (never fabricates fake boleto lines - F12).
 */
export async function getAsaasIdentificationField(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    paymentId: string
): Promise<{ identificationField: string; nossoNumero: string; barCode: string } | null> {
    const config = await getAsaasConfig(db, databaseId, tenantId);
    if (!config.connected || !config.apiKey) {
        return null;
    }

    try {
        const res = await asaasFetch(config, `/payments/${encodeURIComponent(paymentId)}/identificationField`);
        if (!res || (!res.identificationField && !res.barCode)) {
            return null;
        }
        return {
            identificationField: res.identificationField || '',
            nossoNumero: res.nossoNumero || '',
            barCode: res.barCode || ''
        };
    } catch {
        return null;
    }
}

async function listAllTenantDocuments(
    db: Databases,
    databaseId: string,
    collectionId: string,
    tenantId: string
): Promise<any[]> {
    const allDocs: any[] = [];
    const seenIds = new Set<string>();
    const pageSize = 100;
    let offset = 0;

    for (let page = 0; page < 50; page++) {
        let res: any;
        try {
            res = await db.listDocuments(databaseId, collectionId, [
                Query.equal('tenant_id', tenantId),
                Query.limit(pageSize),
                Query.offset(offset)
            ]);
        } catch {
            if (page === 0) {
                const fallback = await db.listDocuments(databaseId, collectionId);
                return (fallback.documents || []).filter((d: any) => d.tenant_id === tenantId);
            }
            break;
        }

        const batch: any[] = (res && Array.isArray(res.documents)) ? res.documents : [];
        if (batch.length === 0) break;

        let newCount = 0;
        for (const doc of batch) {
            if (doc.tenant_id && doc.tenant_id !== tenantId) continue;
            if (doc.$id) {
                if (seenIds.has(doc.$id)) continue;
                seenIds.add(doc.$id);
            }
            allDocs.push(doc);
            newCount++;
        }

        if (newCount === 0 || batch.length < pageSize) break;
        if (typeof res.total === 'number' && allDocs.length >= res.total) break;
        offset += batch.length;
    }

    return allDocs;
}

export async function listAsaasPaymentsEnriched(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    filters: { customer?: string; status?: string; billingType?: string; limit?: number; offset?: number } = {}
): Promise<{
    connected: boolean;
    environment: 'sandbox' | 'production';
    totalCount: number;
    payments: AsaasPayment[];
    summary: {
        totalValue: number;
        receivedValue: number;
        pendingValue: number;
        overdueValue: number;
        counts: { total: number; paid: number; pending: number; overdue: number };
    };
}> {
    const targetTenant = (tenantId && tenantId.trim()) ? tenantId.trim() : 'default';
    const config = await getAsaasConfig(db, databaseId, targetTenant);
    if (!config.connected || !config.apiKey) {
        return {
            connected: false,
            environment: config.environment,
            totalCount: 0,
            payments: [],
            summary: {
                totalValue: 0,
                receivedValue: 0,
                pendingValue: 0,
                overdueValue: 0,
                counts: { total: 0, paid: 0, pending: 0, overdue: 0 }
            }
        };
    }

    const params = new URLSearchParams();
    if (filters.customer) params.set('customer', filters.customer);
    if (filters.status) params.set('status', filters.status);
    if (filters.billingType) params.set('billingType', filters.billingType);
    params.set('limit', String(filters.limit || 100));
    params.set('offset', String(filters.offset || 0));

    const [paymentsRes, customersRes] = await Promise.all([
        asaasFetch(config, `/payments?${params.toString()}`),
        asaasFetch(config, `/customers?limit=100`).catch(() => ({ data: [] } as AsaasApiJson))
    ]);

    const customerMap = new Map<string, AsaasCustomer>();
    for (const c of (customersRes.data || []) as AsaasCustomer[]) {
        customerMap.set(c.id, c);
    }

    let crmClients: any[] = [];
    if (db) {
        try {
            crmClients = await listAllTenantDocuments(db, databaseId, 'clients', targetTenant);
        } catch {
            crmClients = [];
        }
    }

    const rawPayments: AsaasPayment[] = (paymentsRes.data || []).filter((p: any) => !p.deleted);

    let totalValue = 0;
    let receivedValue = 0;
    let pendingValue = 0;
    let overdueValue = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    const enrichedPayments: AsaasPayment[] = rawPayments.map((p: any) => {
        const cust = customerMap.get(p.customer);
        const custDocClean = (cust?.cpfCnpj || '').replace(/\D/g, '');
        const custEmailClean = (cust?.email || '').toLowerCase().trim();

        const matchedCrm = crmClients.find((c: any) => {
            if (c.tenant_id && c.tenant_id !== targetTenant) return false;
            const cDoc = (c.document || c.cnpj || c.cpf || '').replace(/\D/g, '');
            const cEmail = (c.email || '').toLowerCase().trim();
            const cAsaasId = c.asaas_id || '';
            return (
                (cAsaasId && cAsaasId === p.customer) ||
                (custDocClean && cDoc && custDocClean === cDoc) ||
                (custEmailClean && cEmail && custEmailClean === cEmail)
            );
        });

        const val = Number(p.value || 0);
        totalValue += val;

        const isPaid = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(p.status);
        const isOverdue = p.status === 'OVERDUE';

        if (isPaid) {
            receivedValue += val;
            paidCount++;
        } else if (isOverdue) {
            overdueValue += val;
            overdueCount++;
        } else {
            pendingValue += val;
            pendingCount++;
        }

        return {
            ...p,
            customerName: cust?.name || cust?.company || matchedCrm?.name || matchedCrm?.company || 'Cliente Asaas',
            customerEmail: cust?.email || matchedCrm?.email || '',
            customerCpfCnpj: cust?.cpfCnpj || matchedCrm?.document || '',
            matchedClientId: matchedCrm?.$id || undefined,
            matchedClientName: matchedCrm?.name || matchedCrm?.company || undefined
        };
    });

    return {
        connected: true,
        environment: config.environment,
        totalCount: paymentsRes.totalCount || enrichedPayments.length,
        payments: enrichedPayments,
        summary: {
            totalValue,
            receivedValue,
            pendingValue,
            overdueValue,
            counts: {
                total: enrichedPayments.length,
                paid: paidCount,
                pending: pendingCount,
                overdue: overdueCount
            }
        }
    };
}

export async function getClientPaymentHistory(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    clientRecord: { id: string; email?: string; document?: string; name?: string; asaas_id?: string }
): Promise<{
    connected: boolean;
    asaasCustomer: AsaasCustomer | null;
    payments: AsaasPayment[];
}> {
    const targetTenant = (tenantId && tenantId.trim()) ? tenantId.trim() : 'default';
    const config = await getAsaasConfig(db, databaseId, targetTenant);
    if (!config.connected || !config.apiKey) {
        return { connected: false, asaasCustomer: null, payments: [] };
    }

    let asaasCustomer: AsaasCustomer | null = null;

    if (clientRecord.asaas_id) {
        try {
            asaasCustomer = (await asaasFetch(config, `/customers/${encodeURIComponent(clientRecord.asaas_id)}`)) as unknown as AsaasCustomer;
        } catch {
            asaasCustomer = null;
        }
    }

    if (!asaasCustomer && clientRecord.document) {
        const cleanDoc = clientRecord.document.replace(/\D/g, '');
        if (cleanDoc.length >= 11) {
            const list = await listAsaasCustomers(db, databaseId, targetTenant, { cpfCnpj: cleanDoc, limit: 5 });
            if (list.data.length > 0) {
                asaasCustomer = list.data[0];
            }
        }
    }

    if (!asaasCustomer && clientRecord.email) {
        const list = await listAsaasCustomers(db, databaseId, targetTenant, { email: clientRecord.email, limit: 5 });
        if (list.data.length > 0) {
            asaasCustomer = list.data[0];
        }
    }

    if (!asaasCustomer) {
        return { connected: true, asaasCustomer: null, payments: [] };
    }

    const paymentsRes = await asaasFetch(config, `/payments?customer=${encodeURIComponent(asaasCustomer.id)}&limit=50`);
    const rawPayments: AsaasPayment[] = (paymentsRes.data || []).filter((p: any) => !p.deleted);

    const enriched = await Promise.all(
        rawPayments.map(async (p) => {
            const isPendingOrOverdue = ['PENDING', 'OVERDUE'].includes(p.status);
            let pixQrCode = null;
            let identificationField = null;

            if (isPendingOrOverdue) {
                const [pix, slip] = await Promise.all([
                    getAsaasPixQrCode(db, databaseId, targetTenant, p.id),
                    p.billingType === 'BOLETO' ? getAsaasIdentificationField(db, databaseId, targetTenant, p.id) : Promise.resolve(null)
                ]);
                pixQrCode = pix;
                identificationField = slip;
            }

            return {
                ...p,
                customerName: asaasCustomer?.name || clientRecord.name || '',
                customerEmail: asaasCustomer?.email || clientRecord.email || '',
                customerCpfCnpj: asaasCustomer?.cpfCnpj || clientRecord.document || '',
                matchedClientId: clientRecord.id,
                matchedClientName: clientRecord.name,
                pixQrCode,
                identificationField
            };
        })
    );

    return {
        connected: true,
        asaasCustomer,
        payments: enriched
    };
}

/**
 * S09: Synchronizes Asaas payments into Appwrite `charges` collection strictly scoped
 * to `tenantId`. Never queries or updates charges across tenants, never matches by
 * loose `invoiceNumber` alone, and never assigns unmatched charges to `clients[0]`.
 */
export async function syncAllAsaasPaymentsToAppwrite(
    db: Databases,
    databaseId: string,
    tenantId: string,
    preloadedPayments?: AsaasPayment[]
): Promise<{
    syncedCount: number;
    createdCount: number;
    updatedCount: number;
    matchedClientsCount: number;
    unmatchedPayments: number;
    errors: string[];
}> {
    const targetTenant = (tenantId && typeof tenantId === 'string') ? tenantId.trim() : '';
    if (!targetTenant) {
        const err: any = new Error('O identificador do tenant (tenantId) é obrigatório para sincronização financeira.');
        err.statusCode = 400;
        throw err;
    }

    let payments: AsaasPayment[];
    if (Array.isArray(preloadedPayments)) {
        payments = preloadedPayments;
    } else {
        const enriched = await listAsaasPaymentsEnriched(db, databaseId, targetTenant, { limit: 100 });
        if (!enriched.connected) {
            throw new Error('Integração Asaas não está ativa para este tenant.');
        }
        payments = enriched.payments;
    }

    let createdCount = 0;
    let updatedCount = 0;
    let matchedClientsCount = 0;
    let unmatchedPayments = 0;
    const errors: string[] = [];

    // S09: Load ONLY charges belonging to targetTenant across all pages
    const existingCharges = await listAllTenantDocuments(db, databaseId, 'charges', targetTenant);

    const mapStatus = (asaasStatus: string): 'paid' | 'overdue' | 'pending' | 'cancelled' => {
        if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(asaasStatus)) return 'paid';
        if (asaasStatus === 'OVERDUE') return 'overdue';
        if (['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].includes(asaasStatus)) return 'cancelled';
        return 'pending';
    };

    const mapMethod = (billingType: string): 'pix' | 'boleto' | 'cartao' | 'transferencia' => {
        if (billingType === 'PIX') return 'pix';
        if (billingType === 'CREDIT_CARD') return 'cartao';
        return 'boleto';
    };

    for (const pay of payments) {
        try {
            // S09: Match strictly within targetTenant by canonical Asaas payment ID
            const existing = existingCharges.find((c: any) => {
                if (c.tenant_id !== targetTenant) return false;
                return (
                    c.$id === pay.id ||
                    c.asaas_payment_id === pay.id ||
                    c.external_id === pay.id ||
                    c.number === pay.id ||
                    c.reference === pay.id
                );
            });

            if (pay.matchedClientId) {
                matchedClientsCount++;
            }

            const resolvedClientId = pay.matchedClientId || (existing && existing.tenant_id === targetTenant ? existing.client_id : '');

            // S09: Never fall back to `clients[0].$id` when a payment has no matched client in this tenant!
            if (!resolvedClientId) {
                unmatchedPayments++;
                continue;
            }

            const crmStatus = mapStatus(pay.status);
            const crmMethod = mapMethod(pay.billingType);

            const chargePayload: Record<string, any> = {
                number: pay.invoiceNumber ? `ASAAS-${pay.invoiceNumber}` : pay.id,
                reference: pay.id,
                client_id: resolvedClientId,
                client_name: pay.matchedClientName || pay.customerName || 'Cliente Asaas',
                description: pay.description || `Cobrança Asaas #${pay.invoiceNumber || pay.id}`,
                value: Number(pay.value || 0),
                due_date: pay.dueDate || new Date().toISOString().split('T')[0],
                paid_date: pay.paymentDate || pay.clientPaymentDate || '',
                status: crmStatus,
                type: 'recurring',
                payment_method: crmMethod,
                tenant_id: targetTenant,
                invoice_url: pay.invoiceUrl || pay.bankSlipUrl || ''
            };

            if (existing) {
                if (existing.tenant_id !== targetTenant) {
                    errors.push(`Tentativa de atualização cross-tenant bloqueada para cobrança ${pay.id}.`);
                    continue;
                }
                await db.updateDocument(databaseId, 'charges', existing.$id, chargePayload);
                updatedCount++;
            } else {
                const docId = pay.id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 36);
                try {
                    await db.createDocument(databaseId, 'charges', docId, chargePayload);
                } catch {
                    await db.createDocument(databaseId, 'charges', ID.unique(), chargePayload);
                }
                createdCount++;
            }
        } catch (err: any) {
            errors.push(`Erro ao sincronizar cobrança ${pay.id}: ${err.message}`);
        }
    }

    const cfg = await getAsaasConfig(db, databaseId, targetTenant);
    await saveAsaasConfig(db, databaseId, targetTenant, {
        ...cfg,
        lastSyncAt: new Date().toISOString()
    });

    return {
        syncedCount: createdCount + updatedCount,
        createdCount,
        updatedCount,
        matchedClientsCount,
        unmatchedPayments,
        errors
    };
}

/**
 * Alias for syncAllAsaasPaymentsToAppwrite (S09).
 */
export const syncChargesWithCrm = syncAllAsaasPaymentsToAppwrite;

export async function ensureAsaasCustomerForCrmClient(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    clientData: {
        id?: string;
        name: string;
        email?: string;
        phone?: string;
        document?: string;
        company?: string;
        asaas_id?: string;
    }
): Promise<{ success: boolean; asaasCustomerId: string; customer?: AsaasCustomer; created: boolean; error?: string }> {
    const targetTenant = (tenantId && tenantId.trim()) ? tenantId.trim() : 'default';
    const config = await getAsaasConfig(db, databaseId, targetTenant);
    if (!config.connected || !config.apiKey) {
        return { success: false, asaasCustomerId: '', created: false, error: 'Integração Asaas não configurada para esta empresa.' };
    }

    try {
        if (clientData.asaas_id) {
            try {
                const existing = (await asaasFetch(config, `/customers/${encodeURIComponent(clientData.asaas_id)}`)) as unknown as AsaasCustomer;
                if (existing && existing.id && !(existing as any).deleted) {
                    return { success: true, asaasCustomerId: existing.id, customer: existing, created: false };
                }
            } catch {
                // Proceed to search/create
            }
        }

        const cleanDoc = (clientData.document || '').replace(/\D/g, '');
        if (cleanDoc.length >= 11) {
            const byDoc = await listAsaasCustomers(db, databaseId, targetTenant, { cpfCnpj: cleanDoc, limit: 1 });
            if (byDoc.data.length > 0) {
                const found = byDoc.data[0];
                if (db && clientData.id) {
                    await db.updateDocument(databaseId, 'clients', clientData.id, { asaas_id: found.id }).catch(() => {});
                }
                return { success: true, asaasCustomerId: found.id, customer: found, created: false };
            }
        }

        if (clientData.email) {
            const byEmail = await listAsaasCustomers(db, databaseId, targetTenant, { email: clientData.email, limit: 1 });
            if (byEmail.data.length > 0) {
                const found = byEmail.data[0];
                if (db && clientData.id) {
                    await db.updateDocument(databaseId, 'clients', clientData.id, { asaas_id: found.id }).catch(() => {});
                }
                return { success: true, asaasCustomerId: found.id, customer: found, created: false };
            }
        }

        const createPayload: Record<string, any> = {
            name: clientData.name || clientData.company || 'Cliente CRM',
            email: clientData.email || undefined,
            cpfCnpj: cleanDoc.length >= 11 ? cleanDoc : undefined,
            phone: (clientData.phone || '').replace(/\D/g, '') || undefined,
            mobilePhone: (clientData.phone || '').replace(/\D/g, '') || undefined,
            company: clientData.company || undefined,
            externalReference: clientData.id || undefined,
            notificationDisabled: false
        };

        const createdCust = (await asaasFetch(config, '/customers', {
            method: 'POST',
            body: JSON.stringify(createPayload)
        })) as unknown as AsaasCustomer;

        if (db && clientData.id && createdCust?.id) {
            await db.updateDocument(databaseId, 'clients', clientData.id, { asaas_id: createdCust.id }).catch(() => {});
        }

        return {
            success: true,
            asaasCustomerId: createdCust.id,
            customer: createdCust,
            created: true
        };
    } catch (err: any) {
        return {
            success: false,
            asaasCustomerId: '',
            created: false,
            error: err.message || 'Erro ao sincronizar cliente no Asaas.'
        };
    }
}

export async function createAsaasPaymentAndSync(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    payload: {
        crmClientId?: string;
        customerName: string;
        customerEmail?: string;
        customerDocument?: string;
        customerPhone?: string;
        asaasCustomerId?: string;
        value: number;
        dueDate: string;
        billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';
        description: string;
        externalReference?: string;
        installmentCount?: number;
    }
): Promise<{
    success: boolean;
    payment?: AsaasPayment;
    pixQrCode?: { encodedImage: string; payload: string; expirationDate: string } | null;
    identificationField?: { identificationField: string; nossoNumero: string; barCode: string } | null;
    crmChargeId?: string;
    error?: string;
}> {
    const targetTenant = (tenantId && tenantId.trim()) ? tenantId.trim() : 'default';
    const config = await getAsaasConfig(db, databaseId, targetTenant);
    if (!config.connected || !config.apiKey) {
        return {
            success: false,
            error: 'Integração Asaas não está ativa para esta empresa. Configure sua API Key em Integrações > Asaas.'
        };
    }

    try {
        let customerId = payload.asaasCustomerId || '';
        if (!customerId) {
            const ensured = await ensureAsaasCustomerForCrmClient(db, databaseId, targetTenant, {
                id: payload.crmClientId,
                name: payload.customerName,
                email: payload.customerEmail,
                document: payload.customerDocument,
                phone: payload.customerPhone
            });
            if (!ensured.success || !ensured.asaasCustomerId) {
                return {
                    success: false,
                    error: ensured.error || 'Não foi possível localizar ou criar o cliente no Asaas (verifique CPF/CNPJ).'
                };
            }
            customerId = ensured.asaasCustomerId;
        }

        const asaasBody: Record<string, any> = {
            customer: customerId,
            billingType: payload.billingType || 'BOLETO',
            value: Number(payload.value),
            dueDate: payload.dueDate,
            description: payload.description || 'Cobrança de Serviços',
            externalReference: payload.externalReference || payload.crmClientId || undefined
        };

        if (payload.installmentCount && payload.installmentCount > 1) {
            asaasBody.installmentCount = payload.installmentCount;
            asaasBody.installmentValue = Number((Number(payload.value) / payload.installmentCount).toFixed(2));
        }

        const createdPayment = (await asaasFetch(config, '/payments', {
            method: 'POST',
            body: JSON.stringify(asaasBody)
        })) as unknown as AsaasPayment;

        const [pixQrCode, identificationField] = await Promise.all([
            getAsaasPixQrCode(db, databaseId, targetTenant, createdPayment.id),
            createdPayment.billingType === 'BOLETO'
                ? getAsaasIdentificationField(db, databaseId, targetTenant, createdPayment.id)
                : Promise.resolve(null)
        ]);

        let crmChargeId = createdPayment.id;
        if (db && payload.crmClientId) {
            const crmMethod = createdPayment.billingType === 'PIX' ? 'pix' : createdPayment.billingType === 'CREDIT_CARD' ? 'cartao' : 'boleto';
            const chargePayload: Record<string, any> = {
                number: createdPayment.invoiceNumber ? `ASAAS-${createdPayment.invoiceNumber}` : createdPayment.id,
                reference: createdPayment.id,
                client_id: payload.crmClientId,
                client_name: payload.customerName,
                description: createdPayment.description || payload.description,
                value: Number(createdPayment.value),
                due_date: createdPayment.dueDate,
                paid_date: '',
                status: 'pending',
                type: 'recurring',
                payment_method: crmMethod,
                tenant_id: targetTenant,
                invoice_url: createdPayment.invoiceUrl || createdPayment.bankSlipUrl || ''
            };
            try {
                const docId = createdPayment.id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 36);
                const doc = await db.createDocument(databaseId, 'charges', docId, chargePayload);
                crmChargeId = doc.$id;
            } catch {
                try {
                    const doc = await db.createDocument(databaseId, 'charges', ID.unique(), chargePayload);
                    crmChargeId = doc.$id;
                } catch { /* ignore */ }
            }
        }

        return {
            success: true,
            payment: {
                ...createdPayment,
                customerName: payload.customerName,
                customerEmail: payload.customerEmail,
                customerCpfCnpj: payload.customerDocument,
                matchedClientId: payload.crmClientId,
                pixQrCode,
                identificationField
            },
            pixQrCode,
            identificationField,
            crmChargeId
        };
    } catch (err: any) {
        return {
            success: false,
            error: err.message || 'Falha ao emitir cobrança no Asaas.'
        };
    }
}

export async function cancelAsaasPayment(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    paymentId: string
): Promise<{ success: boolean; error?: string }> {
    const targetTenant = (tenantId && tenantId.trim()) ? tenantId.trim() : 'default';
    const config = await getAsaasConfig(db, databaseId, targetTenant);
    if (!config.connected || !config.apiKey) {
        return { success: false, error: 'Asaas não conectado para esta empresa.' };
    }

    try {
        await asaasFetch(config, `/payments/${encodeURIComponent(paymentId)}`, { method: 'DELETE' });
        if (db) {
            const existing = await db.listDocuments(databaseId, 'charges', [
                Query.equal('tenant_id', targetTenant),
                Query.limit(100)
            ]).catch(() => ({ documents: [] }));

            const match: any = (existing.documents as any[]).find(
                c => c.tenant_id === targetTenant && (c.$id === paymentId || c.asaas_payment_id === paymentId || c.external_id === paymentId || c.number === paymentId || c.reference === paymentId)
            );
            if (match) {
                await db.updateDocument(databaseId, 'charges', match.$id, { status: 'cancelled' }).catch(() => {});
            }
        }
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Fetches complete billing artifacts (PIX QR Code, Copy-Paste, Boleto Digitable Line, Invoice URL)
 * for any paymentId. Never returns fabricated demo PIX or boleto strings (F12).
 */
export async function getPaymentBillingInfo(
    db: Databases | null,
    databaseId: string,
    tenantId: string,
    paymentId: string
): Promise<{
    success: boolean;
    connected: boolean;
    paymentId: string;
    status: string;
    value: number;
    dueDate?: string;
    billingType: string;
    invoiceUrl: string | null;
    bankSlipUrl: string | null;
    pix: { encodedImage: string; payload: string; expirationDate: string } | null;
    bankSlip: { identificationField: string; nossoNumero: string; barCode: string } | null;
    error?: string;
}> {
    const targetTenant = (tenantId && tenantId.trim()) ? tenantId.trim() : 'default';
    const config = await getAsaasConfig(db, databaseId, targetTenant);
    const isRealAsaasId = paymentId.startsWith('pay_');

    if (config.connected && config.apiKey && isRealAsaasId) {
        try {
            const [payment, pix, bankSlip] = await Promise.all([
                asaasFetch(config, `/payments/${encodeURIComponent(paymentId)}`),
                getAsaasPixQrCode(db, databaseId, targetTenant, paymentId),
                getAsaasIdentificationField(db, databaseId, targetTenant, paymentId)
            ]);

            return {
                success: true,
                connected: true,
                paymentId: payment.id || paymentId,
                status: payment.status || 'PENDING',
                value: Number(payment.value || 0),
                dueDate: payment.dueDate,
                billingType: payment.billingType || 'UNDEFINED',
                invoiceUrl: payment.invoiceUrl || null,
                bankSlipUrl: payment.bankSlipUrl || null,
                pix,
                bankSlip
            };
        } catch (err: any) {
            return {
                success: false,
                connected: true,
                paymentId,
                status: 'ERROR',
                value: 0,
                billingType: 'UNDEFINED',
                invoiceUrl: null,
                bankSlipUrl: null,
                pix: null,
                bankSlip: null,
                error: err.message || 'Falha ao consultar dados de pagamento no Asaas.'
            };
        }
    }

    return {
        success: false,
        connected: Boolean(config.connected && config.apiKey),
        paymentId,
        status: 'UNAVAILABLE',
        value: 0,
        billingType: 'UNDEFINED',
        invoiceUrl: null,
        bankSlipUrl: null,
        pix: null,
        bankSlip: null,
        error: !config.connected || !config.apiKey
            ? 'Gateway Asaas não está configurado para esta empresa.'
            : 'Identificador de cobrança não possui vínculo válido no Asaas.'
    };
}
