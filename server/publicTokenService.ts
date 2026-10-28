/**
 * ============================================================================
 * C1 — PUBLIC ACCESS TOKEN SERVICE (TS)
 * ============================================================================
 * Replaces direct anonymous Appwrite reading with controlled, single-record,
 * time-bound, revocable, and scope-locked public access tokens.
 * Persists token hashes to disk (`server/.data/public_tokens.json`) so tokens
 * survive server restarts while keeping in-memory Map synchronized.
 * ============================================================================
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '.data');
const TOKEN_STORE_FILE = path.join(DATA_DIR, 'public_tokens.json');

export type PublicTokenTargetType = 'contract' | 'proposal' | 'portal_invite' | 'user_recovery';
export type PublicTokenScope = 'sign_contract' | 'view_proposal' | 'portal_invite' | 'reset_password';

export interface PublicTokenRecord {
    token?: string;
    tokenHash: string;
    targetType: PublicTokenTargetType;
    targetId: string;
    tenantId: string;
    scope: PublicTokenScope;
    expiresAt: string;
    revoked: boolean;
    createdAt: string;
    usedAt: string | null;
    metadata?: Record<string, any>;
    consumptionMeta?: Record<string, any>;
}

const tokenStore = new Map<string, PublicTokenRecord>();
const tokenHashStore = new Map<string, PublicTokenRecord>();

export function hashTokenValue(rawToken: string): string {
    return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
}

function ensureDataDir(): void {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    } catch {
        // Ignore directory creation errors
    }
}

function loadTokensFromDisk(): void {
    try {
        if (!fs.existsSync(TOKEN_STORE_FILE)) return;
        const raw = fs.readFileSync(TOKEN_STORE_FILE, 'utf8');
        if (!raw || !raw.trim()) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records)) return;
        for (const rec of parsed.records as PublicTokenRecord[]) {
            if (rec && rec.tokenHash) {
                const existing = tokenHashStore.get(rec.tokenHash);
                if (!existing || (rec.revoked && !existing.revoked) || (rec.usedAt && !existing.usedAt)) {
                    tokenHashStore.set(rec.tokenHash, { ...rec });
                    if (existing && existing.token) {
                        tokenStore.set(existing.token, { ...rec, token: existing.token });
                    }
                }
            }
        }
    } catch {
        // Ignore read error
    }
}

function saveTokensToDisk(): void {
    try {
        ensureDataDir();
        const records: PublicTokenRecord[] = [];
        for (const [tokenHash, rec] of tokenHashStore.entries()) {
            const copy: PublicTokenRecord = { ...rec, tokenHash };
            delete copy.token;
            records.push(copy);
        }
        const tempFile = `${TOKEN_STORE_FILE}.tmp.${process.pid}`;
        fs.writeFileSync(tempFile, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), records }, null, 2), 'utf8');
        fs.renameSync(tempFile, TOKEN_STORE_FILE);
    } catch {
        // Ignore write error
    }
}

loadTokensFromDisk();

const VALID_TARGET_TYPES = new Set<string>(['contract', 'proposal', 'portal_invite', 'user_recovery']);
const VALID_SCOPES = new Set<string>(['sign_contract', 'view_proposal', 'portal_invite', 'reset_password']);

export interface GeneratePublicTokenParams {
    targetType: PublicTokenTargetType;
    targetId: string;
    tenantId: string;
    scope: PublicTokenScope;
    expiresInDays?: number;
    ttlMs?: number;
    metadata?: Record<string, any>;
}

export function generatePublicAccessToken(params: GeneratePublicTokenParams): {
    token: string;
    tokenHash: string;
    expiresAt: string;
    record: PublicTokenRecord;
} {
    const {
        targetType,
        targetId,
        tenantId,
        scope,
        expiresInDays = 7,
        ttlMs,
        metadata = {}
    } = params || ({} as GeneratePublicTokenParams);

    if (!targetType || !targetId || !tenantId || !scope) {
        throw new Error('Missing mandatory parameters to generate public access token.');
    }

    if (!VALID_TARGET_TYPES.has(targetType)) {
        throw new Error('Invalid targetType for public token.');
    }

    if (!VALID_SCOPES.has(scope)) {
        throw new Error('Invalid scope for public token.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashTokenValue(token);

    const now = Date.now();
    const durationMs = typeof ttlMs === 'number' && ttlMs > 0
        ? ttlMs
        : (Number(expiresInDays) || 7) * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now + durationMs).toISOString();

    const record: PublicTokenRecord = {
        token,
        tokenHash,
        targetType,
        targetId: String(targetId),
        tenantId: String(tenantId),
        scope,
        expiresAt,
        revoked: false,
        createdAt: new Date(now).toISOString(),
        usedAt: null,
        metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {}
    };

    tokenStore.set(token, record);
    tokenHashStore.set(tokenHash, { ...record });
    saveTokensToDisk();

    return { token, tokenHash, expiresAt, record };
}

export function issuePublicToken(params: GeneratePublicTokenParams) {
    return generatePublicAccessToken(params);
}

function findTokenRecord(rawToken: string | undefined | null): PublicTokenRecord | null {
    if (!rawToken || typeof rawToken !== 'string') return null;
    loadTokensFromDisk();

    const direct = tokenStore.get(rawToken);
    const tokenHash = hashTokenValue(rawToken);
    const byHash = tokenHashStore.get(tokenHash);

    if (direct && byHash) {
        if (byHash.revoked && !direct.revoked) {
            direct.revoked = true;
            direct.usedAt = byHash.usedAt || direct.usedAt;
        }
        return direct;
    }
    if (direct) return direct;
    if (byHash) {
        const hydrated: PublicTokenRecord = { ...byHash, token: rawToken };
        tokenStore.set(rawToken, hydrated);
        return hydrated;
    }
    return null;
}

export interface ValidatePublicTokenParams {
    token: string;
    expectedScope?: PublicTokenScope;
    expectedTargetId?: string;
    expectedTenantId?: string;
    allowConsumedForSameTarget?: boolean;
}

export function validatePublicAccessToken(params: ValidatePublicTokenParams): {
    valid: boolean;
    status: number;
    code?: string;
    error?: string;
    record?: PublicTokenRecord;
} {
    const {
        token,
        expectedScope,
        expectedTargetId,
        expectedTenantId,
        allowConsumedForSameTarget = false
    } = params || ({} as ValidatePublicTokenParams);

    if (!token || typeof token !== 'string' || token.length < 32) {
        return { valid: false, status: 401, code: 'TOKEN_INVALID', error: 'Token de acesso público ausente ou malformado.' };
    }

    const record = findTokenRecord(token);
    if (!record) {
        return { valid: false, status: 404, code: 'TOKEN_NOT_FOUND', error: 'Link público inválido ou não encontrado.' };
    }

    if (record.revoked) {
        const canStillRead = Boolean(
            allowConsumedForSameTarget &&
            record.usedAt &&
            (!expectedTargetId || record.targetId === String(expectedTargetId))
        );
        if (!canStillRead) {
            return { valid: false, status: 410, code: 'TOKEN_REVOKED', error: 'Este link público foi revogado ou já foi utilizado.' };
        }
    }

    const now = new Date();
    const expires = new Date(record.expiresAt);
    if (now > expires) {
        return { valid: false, status: 410, code: 'TOKEN_EXPIRED', error: 'Este link público expirou.' };
    }

    if (expectedScope && record.scope !== expectedScope) {
        return { valid: false, status: 403, code: 'TOKEN_SCOPE_MISMATCH', error: 'Escopo de permissão inválido para este link.' };
    }

    if (expectedTargetId && record.targetId !== String(expectedTargetId)) {
        return { valid: false, status: 403, code: 'TOKEN_TARGET_MISMATCH', error: 'Token não pertence ao documento solicitado.' };
    }

    if (expectedTenantId && record.tenantId !== String(expectedTenantId)) {
        return { valid: false, status: 403, code: 'TOKEN_TENANT_MISMATCH', error: 'Token não pertence à organização informada.' };
    }

    return { valid: true, status: 200, record };
}

export function consumePublicToken(
    token: string,
    consumptionMeta: Record<string, any> = {}
): { consumed: boolean; reason?: string; record?: PublicTokenRecord } {
    const record = findTokenRecord(token);
    if (!record) return { consumed: false, reason: 'NOT_FOUND' };
    if (record.revoked || record.usedAt) {
        return { consumed: false, reason: 'ALREADY_CONSUMED', record };
    }
    const nowIso = new Date().toISOString();
    record.revoked = true;
    record.usedAt = nowIso;
    if (consumptionMeta && typeof consumptionMeta === 'object') {
        record.consumptionMeta = { ...consumptionMeta };
    }
    const tokenHash = record.tokenHash || hashTokenValue(token);
    tokenStore.set(token, record);
    tokenHashStore.set(tokenHash, { ...record, tokenHash });
    saveTokensToDisk();
    return { consumed: true, record };
}

export function revokePublicAccessToken(token: string): boolean {
    const record = findTokenRecord(token);
    if (!record) return false;
    record.revoked = true;
    record.usedAt = record.usedAt || new Date().toISOString();
    const tokenHash = record.tokenHash || hashTokenValue(token);
    tokenStore.set(token, record);
    tokenHashStore.set(tokenHash, { ...record, tokenHash });
    saveTokensToDisk();
    return true;
}

export function sanitizePublicDocument(rawDoc: any, targetType: 'contract' | 'proposal'): Record<string, any> | null {
    if (!rawDoc) return null;

    if (targetType === 'contract') {
        return {
            id: rawDoc.$id || rawDoc.id,
            contract_number: rawDoc.contract_number || '',
            title: rawDoc.title || 'Contrato de Prestação de Serviços',
            client_name: rawDoc.client_name || '',
            client_document: rawDoc.client_document || '',
            client_email: rawDoc.client_email || '',
            client_phone: rawDoc.client_phone || '',
            provider_name: rawDoc.provider_name || '',
            provider_document: rawDoc.provider_document || '',
            content: rawDoc.content || '',
            status: rawDoc.status || 'pending',
            value: rawDoc.value || rawDoc.total_value || 0,
            total_value: rawDoc.total_value || rawDoc.value || 0,
            setup_fee: rawDoc.setup_fee || 0,
            billing_cycle: rawDoc.billing_cycle || 'Mensal',
            duration_months: rawDoc.duration_months || 12,
            start_date: rawDoc.start_date || '',
            end_date: rawDoc.end_date || '',
            items_json: rawDoc.items_json || '[]',
            created_at: rawDoc.$createdAt || rawDoc.created_at,
            signed_at: rawDoc.signed_at || null,
            signed_by_name: rawDoc.signed_by_name || null,
            signed_by_document: rawDoc.signed_by_document || null,
            signed_by_email: rawDoc.signed_by_email || null,
            signed_by_role: rawDoc.signed_by_role || null,
            signed_by_phone: rawDoc.signed_by_phone || null,
            signed_by_ip: rawDoc.signed_by_ip || rawDoc.signed_ip || null,
            signature_hash: rawDoc.signature_hash || null,
            document_hash: rawDoc.document_hash || null,
            content_hash: rawDoc.content_hash || rawDoc.document_hash || null,
            certificate_hash: rawDoc.certificate_hash || rawDoc.signature_hash || null,
            legal_audit_trail: rawDoc.legal_audit_trail || null
        };
    }

    if (targetType === 'proposal') {
        return {
            id: rawDoc.$id || rawDoc.id,
            proposal_number: rawDoc.proposal_number || '',
            client_name: rawDoc.client_name || '',
            company_name: rawDoc.company_name || '',
            valid_until: rawDoc.valid_until || null,
            status: rawDoc.status || 'Sent',
            items: rawDoc.items || [],
            total_setup: rawDoc.total_setup || 0,
            total_monthly: rawDoc.total_monthly || 0,
            public_notes: rawDoc.public_notes || ''
        };
    }

    return null;
}

export const _tokenStore = tokenStore;
