/**
 * ============================================================================
 * C3 — SHARED REQUEST UTILITIES (TS)
 * ============================================================================
 * Centralizes request body parsing with strict payload size limits, JSON-object
 * validation, cryptographically secure random password/token generation,
 * paginated Appwrite Teams/Memberships helpers, portal session token signing,
 * portal password hashing, and atomic JSON-array merging.
 * ============================================================================
 */

import crypto from 'crypto';
import type { IncomingMessage } from 'http';

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1MB default limit

export interface HttpError extends Error {
    statusCode?: number;
    code?: number | string;
}

export interface PortalSessionClaims {
    clientId: string;
    tenantId: string;
    email: string;
    iat: number;
    exp: number;
}

/**
 * Safely reads and parses JSON from an HTTP request stream with a strict byte limit.
 * Prevents Denial of Service (DoS) via unbounded memory allocation and TypeError
 * on JSON primitives/nulls (S10).
 */
export function readJsonBody(
    req: IncomingMessage & { body?: unknown },
    maxBytes: number | { maxBytes: number } = DEFAULT_MAX_BODY_BYTES
): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
        if (!req) {
            return resolve({});
        }

        const limit = (typeof maxBytes === 'object' && maxBytes && (maxBytes as any).maxBytes)
            ? Number((maxBytes as any).maxBytes)
            : (typeof maxBytes === 'number' ? maxBytes : DEFAULT_MAX_BODY_BYTES);

        if (req.headers && req.headers['content-length']) {
            const contentLength = parseInt(req.headers['content-length'] as string, 10);
            if (!isNaN(contentLength) && contentLength > limit) {
                const err: HttpError = new Error(`Payload Too Large: requisição excede o limite máximo permitido de ${limit} bytes.`);
                err.statusCode = 413;
                err.code = 413;
                if (typeof req.destroy === 'function') {
                    req.destroy();
                }
                return reject(err);
            }
        }

        if (req.body !== undefined && req.body !== null && typeof req.on !== 'function') {
            try {
                const parsed = typeof req.body === 'string'
                    ? (req.body.trim() ? JSON.parse(req.body) : {})
                    : req.body;
                if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    const err: HttpError = new Error('Corpo JSON deve ser um objeto válido.');
                    err.statusCode = 400;
                    err.code = 400;
                    return reject(err);
                }
                return resolve(parsed as Record<string, any>);
            } catch {
                const err: HttpError = new Error('Corpo JSON malformado.');
                err.statusCode = 400;
                err.code = 400;
                return reject(err);
            }
        }

        let raw = '';
        let bytesRead = 0;
        let aborted = false;

        req.on('data', (chunk: Buffer | string) => {
            if (aborted) return;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
            bytesRead += buf.length;

            if (bytesRead > limit) {
                aborted = true;
                const err: HttpError = new Error(`Payload Too Large: requisição excede o limite máximo permitido de ${limit} bytes.`);
                err.statusCode = 413;
                err.code = 413;
                if (typeof req.destroy === 'function') {
                    req.destroy();
                }
                return reject(err);
            }

            raw += buf.toString('utf8');
        });

        req.on('end', () => {
            if (aborted) return;
            try {
                const trimmed = raw.trim();
                const parsed = trimmed ? JSON.parse(trimmed) : {};
                if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    const err: HttpError = new Error('Corpo JSON deve ser um objeto válido.');
                    err.statusCode = 400;
                    err.code = 400;
                    return reject(err);
                }
                resolve(parsed as Record<string, any>);
            } catch {
                const err: HttpError = new Error('Corpo JSON malformado.');
                err.statusCode = 400;
                err.code = 400;
                reject(err);
            }
        });

        req.on('error', (err: Error) => {
            if (aborted) return;
            aborted = true;
            reject(err);
        });
    });
}

/**
 * Generates a cryptographically strong temporary password using CSPRNG (crypto.randomBytes).
 */
export function generateSecureTemporaryPassword(byteLength: number = 18): string {
    const raw = crypto.randomBytes(byteLength).toString('base64url');
    return `Iris@${raw}!A1!`;
}

/**
 * Paginates through all teams in Appwrite so tenants/teams beyond the first 25
 * are never silently ignored (F17).
 */
export async function listAllTeams(teamsSdk: any, QueryObj?: any): Promise<any[]> {
    if (!teamsSdk || typeof teamsSdk.list !== 'function') return [];
    const allTeams: any[] = [];
    const seenIds = new Set<string>();
    const pageSize = 100;
    let offset = 0;
    const maxPages = 50;

    for (let page = 0; page < maxPages; page++) {
        let res: any;
        try {
            if (QueryObj && typeof QueryObj.limit === 'function' && typeof QueryObj.offset === 'function') {
                res = await teamsSdk.list([QueryObj.limit(pageSize), QueryObj.offset(offset)]);
            } else {
                res = await teamsSdk.list();
            }
        } catch {
            if (page === 0) {
                res = await teamsSdk.list();
            } else {
                break;
            }
        }

        const batch: any[] = (res && Array.isArray(res.teams)) ? res.teams : [];
        if (batch.length === 0) break;

        let newCount = 0;
        for (const team of batch) {
            const id = team && team.$id;
            if (id) {
                if (seenIds.has(id)) continue;
                seenIds.add(id);
            }
            allTeams.push(team);
            newCount++;
        }

        if (!QueryObj || newCount === 0 || batch.length < pageSize) break;
        if (typeof res.total === 'number' && allTeams.length >= res.total) break;

        offset += batch.length;
    }

    return allTeams;
}

/**
 * Paginates through all memberships of a given Appwrite team so members beyond
 * the first 25 are never silently ignored (F17).
 */
export async function listAllMemberships(teamsSdk: any, teamId: string, QueryObj?: any): Promise<any[]> {
    if (!teamsSdk || typeof teamsSdk.listMemberships !== 'function' || !teamId) return [];
    const allMemberships: any[] = [];
    const seenIds = new Set<string>();
    const pageSize = 100;
    let offset = 0;
    const maxPages = 50;

    for (let page = 0; page < maxPages; page++) {
        let res: any;
        try {
            if (QueryObj && typeof QueryObj.limit === 'function' && typeof QueryObj.offset === 'function') {
                res = await teamsSdk.listMemberships(teamId, [QueryObj.limit(pageSize), QueryObj.offset(offset)]);
            } else {
                res = await teamsSdk.listMemberships(teamId);
            }
        } catch {
            if (page === 0) {
                res = await teamsSdk.listMemberships(teamId);
            } else {
                break;
            }
        }

        const batch: any[] = (res && Array.isArray(res.memberships)) ? res.memberships : [];
        if (batch.length === 0) break;

        let newCount = 0;
        for (const m of batch) {
            const key = (m && m.$id) || (m && `${m.teamId || teamId}:${m.userId}:${(m.roles || []).join(',')}`);
            if (key) {
                if (seenIds.has(key)) continue;
                seenIds.add(key);
            }
            allMemberships.push(m);
            newCount++;
        }

        if (!QueryObj || newCount === 0 || batch.length < pageSize) break;
        if (typeof res.total === 'number' && allMemberships.length >= res.total) break;

        offset += batch.length;
    }

    return allMemberships;
}

export const UNIVERSAL_PORTAL_PASSWORDS = new Set<string>([
    'cliente123',
    '123456',
    '12345678',
    'mudar123',
    'portal123',
    'senha123',
    'admin123',
    'password',
    '123123',
    '000000'
]);

export function isUniversalPortalPassword(password: string | undefined | null): boolean {
    if (!password || typeof password !== 'string') return true;
    return UNIVERSAL_PORTAL_PASSWORDS.has(password.trim().toLowerCase());
}

export function hashPortalPassword(password: string): string {
    const clean = String(password || '');
    if (clean.length < 8) {
        throw new Error('A senha do portal deve ter pelo menos 8 caracteres.');
    }
    if (isUniversalPortalPassword(clean)) {
        throw new Error('A senha informada é considerada insegura/universal e não pode ser utilizada.');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(clean, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
}

export function verifyPortalPassword(
    inputPassword: string | undefined | null,
    storedPassword: string | undefined | null
): { valid: boolean; needsUpgrade: boolean } {
    if (!inputPassword || typeof inputPassword !== 'string' || !storedPassword || typeof storedPassword !== 'string') {
        return { valid: false, needsUpgrade: false };
    }
    const candidate = inputPassword.trim();
    const stored = storedPassword.trim();
    if (!candidate || !stored) {
        return { valid: false, needsUpgrade: false };
    }

    if (isUniversalPortalPassword(candidate)) {
        return { valid: false, needsUpgrade: false };
    }

    if (stored.startsWith('scrypt$')) {
        const parts = stored.split('$');
        if (parts.length !== 3 || !parts[1] || !parts[2]) {
            return { valid: false, needsUpgrade: false };
        }
        try {
            const salt = parts[1];
            const expectedBuf = Buffer.from(parts[2], 'hex');
            const derivedBuf = crypto.scryptSync(candidate, salt, expectedBuf.length);
            if (expectedBuf.length !== derivedBuf.length) {
                return { valid: false, needsUpgrade: false };
            }
            const match = crypto.timingSafeEqual(expectedBuf, derivedBuf);
            return { valid: match, needsUpgrade: false };
        } catch {
            return { valid: false, needsUpgrade: false };
        }
    }

    if (stored.startsWith('sha256$')) {
        const parts = stored.split('$');
        if (parts.length === 3 && parts[1] && parts[2]) {
            const expectedHex = parts[2];
            const actualHex = crypto.createHash('sha256').update(`${parts[1]}:${candidate}`).digest('hex');
            const expectedBuf = Buffer.from(expectedHex, 'hex');
            const actualBuf = Buffer.from(actualHex, 'hex');
            if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
                return { valid: true, needsUpgrade: true };
            }
        }
        return { valid: false, needsUpgrade: false };
    }

    if (isUniversalPortalPassword(stored)) {
        return { valid: false, needsUpgrade: false };
    }

    const storedBuf = Buffer.from(stored, 'utf8');
    const candidateBuf = Buffer.from(candidate, 'utf8');
    if (storedBuf.length === candidateBuf.length && crypto.timingSafeEqual(storedBuf, candidateBuf)) {
        return { valid: true, needsUpgrade: true };
    }

    return { valid: false, needsUpgrade: false };
}

function getPortalSigningSecret(secretOverride?: string): Buffer {
    const base = secretOverride
        || process.env.PORTAL_SESSION_SECRET
        || process.env.APPWRITE_API_KEY
        || 'crm-hydra-portal-session-fallback-secret-key';
    return crypto.createHash('sha256').update(`${base}:portal-session-v1`).digest();
}

export function signPortalSessionToken(
    claims: { clientId: string; tenantId: string; email?: string; ttlMs?: number },
    secretOverride?: string
): string {
    if (!claims || !claims.clientId || !claims.tenantId) {
        throw new Error('signPortalSessionToken requires clientId and tenantId');
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const ttlSec = claims.ttlMs ? Math.floor(claims.ttlMs / 1000) : 12 * 3600;
    const payload = {
        sub: String(claims.clientId),
        clientId: String(claims.clientId),
        tenantId: String(claims.tenantId),
        email: String(claims.email || '').trim().toLowerCase(),
        iat: nowSec,
        exp: nowSec + ttlSec,
        jti: crypto.randomBytes(12).toString('hex')
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const secret = getPortalSigningSecret(secretOverride);
    const sigB64 = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    return `${payloadB64}.${sigB64}`;
}

export function verifyPortalSessionToken(
    token: string | undefined | null,
    secretOverride?: string
): { valid: boolean; claims: PortalSessionClaims | null; error?: string } {
    if (!token || typeof token !== 'string') {
        return { valid: false, claims: null, error: 'Token de sessão do portal ausente.' };
    }
    const trimmed = token.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { valid: false, claims: null, error: 'Formato de token do portal inválido.' };
    }
    const [payloadB64, sigB64] = parts;
    const secret = getPortalSigningSecret(secretOverride);
    const expectedSigB64 = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

    const sigBuf = Buffer.from(sigB64, 'utf8');
    const expectedBuf = Buffer.from(expectedSigB64, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return { valid: false, claims: null, error: 'Assinatura do token do portal inválida.' };
    }

    try {
        const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        const nowSec = Math.floor(Date.now() / 1000);
        if (!parsed || typeof parsed !== 'object' || !parsed.clientId || !parsed.tenantId) {
            return { valid: false, claims: null, error: 'Claims do token do portal inválidos.' };
        }
        if (typeof parsed.exp !== 'number' || parsed.exp <= nowSec) {
            return { valid: false, claims: null, error: 'Sessão do portal expirada.' };
        }
        return {
            valid: true,
            claims: {
                clientId: String(parsed.clientId),
                tenantId: String(parsed.tenantId),
                email: String(parsed.email || '').trim().toLowerCase(),
                iat: Number(parsed.iat || 0),
                exp: Number(parsed.exp)
            }
        };
    } catch {
        return { valid: false, claims: null, error: 'Payload do token do portal malformado.' };
    }
}

export function extractPortalToken(req: IncomingMessage): string {
    if (!req || !req.headers) return '';
    const direct = req.headers['x-portal-token'];
    if (typeof direct === 'string' && direct.trim()) {
        return direct.trim();
    }
    const authHeader = req.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }
    const cookieHeader = req.headers['cookie'];
    if (typeof cookieHeader === 'string' && cookieHeader.includes('portal_session=')) {
        const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('portal_session='));
        if (match) {
            return decodeURIComponent(match.slice('portal_session='.length).trim());
        }
    }
    return '';
}

export function sanitizePortalClient(clientDoc: Record<string, any> | null | undefined): Record<string, any> {
    if (!clientDoc || typeof clientDoc !== 'object') return {};
    return {
        $id: clientDoc.$id,
        id: clientDoc.$id,
        name: clientDoc.name || clientDoc.company || '',
        company: clientDoc.company || clientDoc.name || '',
        email: clientDoc.email || '',
        phone: clientDoc.phone || '',
        document: clientDoc.document || clientDoc.cnpj || clientDoc.cpf || '',
        status: clientDoc.status || 'active',
        plan: clientDoc.plan || '',
        asaas_id: clientDoc.asaas_id || ''
    };
}

export function mergeJsonArrayById(
    existingRaw: string | any[] | undefined | null,
    incomingRaw?: string | any[] | null,
    singleAppendItem?: Record<string, any> | null,
    timestampKey: string = 'timestamp'
): string {
    const parseArr = (val: unknown): any[] => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    };

    const existingArr = parseArr(existingRaw);
    const incomingArr = parseArr(incomingRaw);
    const mergedMap = new Map<string, any>();
    const order: string[] = [];

    const computeKey = (item: any, idx: number): string => {
        if (!item || typeof item !== 'object') return `prim_${idx}_${String(item)}`;
        if (item.id) return `id:${String(item.id)}`;
        if (item.$id) return `id:${String(item.$id)}`;
        const ts = item[timestampKey] || item.date || item.createdAt || '';
        const text = item.text || item.title || item.description || '';
        const sender = item.sender || item.author || '';
        return `comp:${sender}:${ts}:${text}`;
    };

    existingArr.forEach((item, idx) => {
        const k = computeKey(item, idx);
        mergedMap.set(k, item);
        order.push(k);
    });

    incomingArr.forEach((item, idx) => {
        const k = computeKey(item, existingArr.length + idx);
        if (!mergedMap.has(k)) {
            order.push(k);
        }
        mergedMap.set(k, { ...(mergedMap.get(k) || {}), ...item });
    });

    if (singleAppendItem && typeof singleAppendItem === 'object') {
        const k = computeKey(singleAppendItem, existingArr.length + incomingArr.length + 1);
        if (!mergedMap.has(k)) {
            order.push(k);
        }
        mergedMap.set(k, { ...(mergedMap.get(k) || {}), ...singleAppendItem });
    }

    const result = order.map(k => mergedMap.get(k));
    return JSON.stringify(result);
}
