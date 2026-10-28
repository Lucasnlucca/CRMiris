/**
 * ============================================================================
 * C3 — SHARED REQUEST UTILITIES (CJS)
 * ============================================================================
 * Centralizes request body parsing with strict payload size limits, JSON-object
 * validation, cryptographically secure random password/token generation,
 * paginated Appwrite Teams/Memberships helpers, portal session token signing,
 * portal password hashing, and atomic JSON-array merging.
 * ============================================================================
 */

const crypto = require('crypto');

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1MB default limit

/**
 * Safely reads and parses JSON from an HTTP request stream with a strict byte limit.
 * Prevents Denial of Service (DoS) via unbounded memory allocation and TypeError
 * on JSON primitives/nulls (S10).
 *
 * @param {import('http').IncomingMessage} req
 * @param {number} [maxBytes=1048576] Maximum allowed payload size in bytes
 * @returns {Promise<Record<string, any>>}
 */
function readJsonBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
    return new Promise((resolve, reject) => {
        if (!req) {
            return resolve({});
        }

        const limit = (typeof maxBytes === 'object' && maxBytes && maxBytes.maxBytes)
            ? Number(maxBytes.maxBytes)
            : (typeof maxBytes === 'number' ? maxBytes : DEFAULT_MAX_BODY_BYTES);

        if (req.headers && req.headers['content-length']) {
            const contentLength = parseInt(req.headers['content-length'], 10);
            if (!isNaN(contentLength) && contentLength > limit) {
                const err = new Error(`Payload Too Large: requisição excede o limite máximo permitido de ${limit} bytes.`);
                err.statusCode = 413;
                err.code = 413;
                if (typeof req.destroy === 'function') {
                    req.destroy();
                }
                return reject(err);
            }
        }

        // Support pre-parsed body (e.g., Express/Connect middleware or unit test harness)
        if (req.body !== undefined && req.body !== null && typeof req.on !== 'function') {
            try {
                const parsed = typeof req.body === 'string'
                    ? (req.body.trim() ? JSON.parse(req.body) : {})
                    : req.body;
                if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    const err = new Error('Corpo JSON deve ser um objeto válido.');
                    err.statusCode = 400;
                    err.code = 400;
                    return reject(err);
                }
                return resolve(parsed);
            } catch (e) {
                const err = new Error('Corpo JSON malformado.');
                err.statusCode = 400;
                err.code = 400;
                return reject(err);
            }
        }

        let raw = '';
        let bytesRead = 0;
        let aborted = false;

        req.on('data', (chunk) => {
            if (aborted) return;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
            bytesRead += buf.length;

            if (bytesRead > limit) {
                aborted = true;
                const err = new Error(`Payload Too Large: requisição excede o limite máximo permitido de ${limit} bytes.`);
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
                    const err = new Error('Corpo JSON deve ser um objeto válido.');
                    err.statusCode = 400;
                    err.code = 400;
                    return reject(err);
                }
                resolve(parsed);
            } catch (e) {
                const err = new Error('Corpo JSON malformado.');
                err.statusCode = 400;
                err.code = 400;
                reject(err);
            }
        });

        req.on('error', (err) => {
            if (aborted) return;
            aborted = true;
            reject(err);
        });
    });
}

/**
 * Generates a cryptographically strong temporary password using CSPRNG (crypto.randomBytes).
 * Eliminates predictable fallback passwords.
 *
 * @param {number} [byteLength=18]
 * @returns {string}
 */
function generateSecureTemporaryPassword(byteLength = 18) {
    const raw = crypto.randomBytes(byteLength).toString('base64url');
    return `Iris@${raw}!A1!`;
}

/**
 * Paginates through all teams in Appwrite so tenants/teams beyond the first 25
 * are never silently ignored (F17). Safely handles unit test mocks that ignore
 * query arguments or do not return `total`.
 *
 * @param {any} teamsSdk Appwrite Teams instance
 * @param {any} [QueryObj] Appwrite Query helper
 * @returns {Promise<any[]>}
 */
async function listAllTeams(teamsSdk, QueryObj) {
    if (!teamsSdk || typeof teamsSdk.list !== 'function') return [];
    const allTeams = [];
    const seenIds = new Set();
    const pageSize = 100;
    let offset = 0;
    const maxPages = 50;

    for (let page = 0; page < maxPages; page++) {
        let res;
        try {
            if (QueryObj && typeof QueryObj.limit === 'function' && typeof QueryObj.offset === 'function') {
                res = await teamsSdk.list([QueryObj.limit(pageSize), QueryObj.offset(offset)]);
            } else {
                res = await teamsSdk.list();
            }
        } catch (err) {
            if (page === 0) {
                res = await teamsSdk.list();
            } else {
                break;
            }
        }

        const batch = (res && Array.isArray(res.teams)) ? res.teams : [];
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

        // Stop if mock returned identical static list or fewer items than pageSize
        if (!QueryObj || newCount === 0 || batch.length < pageSize) break;
        if (typeof res.total === 'number' && allTeams.length >= res.total) break;

        offset += batch.length;
    }

    return allTeams;
}

/**
 * Paginates through all memberships of a given Appwrite team so members beyond
 * the first 25 are never silently ignored (F17).
 *
 * @param {any} teamsSdk Appwrite Teams instance
 * @param {string} teamId Team ID
 * @param {any} [QueryObj] Appwrite Query helper
 * @returns {Promise<any[]>}
 */
async function listAllMemberships(teamsSdk, teamId, QueryObj) {
    if (!teamsSdk || typeof teamsSdk.listMemberships !== 'function' || !teamId) return [];
    const allMemberships = [];
    const seenIds = new Set();
    const pageSize = 100;
    let offset = 0;
    const maxPages = 50;

    for (let page = 0; page < maxPages; page++) {
        let res;
        try {
            if (QueryObj && typeof QueryObj.limit === 'function' && typeof QueryObj.offset === 'function') {
                res = await teamsSdk.listMemberships(teamId, [QueryObj.limit(pageSize), QueryObj.offset(offset)]);
            } else {
                res = await teamsSdk.listMemberships(teamId);
            }
        } catch (err) {
            if (page === 0) {
                res = await teamsSdk.listMemberships(teamId);
            } else {
                break;
            }
        }

        const batch = (res && Array.isArray(res.memberships)) ? res.memberships : [];
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

/**
 * Forbidden universal/weak portal passwords (S04, S07).
 */
const UNIVERSAL_PORTAL_PASSWORDS = new Set([
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

/**
 * Checks whether a candidate password is on the forbidden universal password list.
 * @param {string} password
 * @returns {boolean}
 */
function isUniversalPortalPassword(password) {
    if (!password || typeof password !== 'string') return true;
    return UNIVERSAL_PORTAL_PASSWORDS.has(password.trim().toLowerCase());
}

/**
 * Hashes a portal password using scrypt with a random 16-byte salt (S07).
 * Format: `scrypt$<saltHex>$<derivedHex>`
 *
 * @param {string} password
 * @returns {string}
 */
function hashPortalPassword(password) {
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

/**
 * Verifies a portal password against a stored `scrypt$...` hash, `sha256$...` hash,
 * or non-universal legacy credential (indicating `needsUpgrade: true` when legacy).
 *
 * @param {string} inputPassword
 * @param {string} storedPassword
 * @returns {{ valid: boolean, needsUpgrade: boolean }}
 */
function verifyPortalPassword(inputPassword, storedPassword) {
    if (!inputPassword || typeof inputPassword !== 'string' || !storedPassword || typeof storedPassword !== 'string') {
        return { valid: false, needsUpgrade: false };
    }
    const candidate = inputPassword.trim();
    const stored = storedPassword.trim();
    if (!candidate || !stored) {
        return { valid: false, needsUpgrade: false };
    }

    // Never allow universal passwords under any circumstance (S04, S07)
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

    // Legacy plaintext stored password: only accept if it is NOT a universal password
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

function getPortalSigningSecret(secretOverride) {
    const base = secretOverride
        || process.env.PORTAL_SESSION_SECRET
        || process.env.APPWRITE_API_KEY
        || 'crm-hydra-portal-session-fallback-secret-key';
    return crypto.createHash('sha256').update(`${base}:portal-session-v1`).digest();
}

/**
 * Signs a portal session token bound to `{ clientId, tenantId, email, exp }` (S04).
 *
 * @param {{ clientId: string, tenantId: string, email?: string, ttlMs?: number }} claims
 * @param {string} [secretOverride]
 * @returns {string}
 */
function signPortalSessionToken(claims, secretOverride) {
    if (!claims || !claims.clientId || !claims.tenantId) {
        throw new Error('signPortalSessionToken requires clientId and tenantId');
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const ttlSec = claims.ttlMs ? Math.floor(claims.ttlMs / 1000) : 12 * 3600; // default 12 hours
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

/**
 * Verifies a portal session token in constant time and checks expiration (S04).
 *
 * @param {string} token
 * @param {string} [secretOverride]
 * @returns {{ valid: boolean, claims: { clientId: string, tenantId: string, email: string, iat: number, exp: number } | null, error?: string }}
 */
function verifyPortalSessionToken(token, secretOverride) {
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

/**
 * Extracts portal session token from `x-portal-token`, `Authorization: Bearer`, or `Cookie` header.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function extractPortalToken(req) {
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

/**
 * Sanitizes a raw client document for external portal responses (S04 data minimization).
 * Removes internal notes, credentials, settings_json, and internal metadata.
 *
 * @param {Record<string, any>} clientDoc
 * @returns {Record<string, any>}
 */
function sanitizePortalClient(clientDoc) {
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

/**
 * Atomically merges an existing serialized JSON array with incoming array items or a single append item,
 * deduplicating by `id` (or fallback composite key) so concurrent writes never clobber existing entries (F22).
 *
 * @param {string | any[]} existingRaw Existing JSON string or array from database
 * @param {string | any[] | undefined} incomingRaw Incoming JSON string or array from payload
 * @param {Record<string, any> | undefined} singleAppendItem Optional single item to append
 * @param {string} [timestampKey='timestamp'] Optional timestamp key for sorting
 * @returns {string} Serialized merged JSON array
 */
function mergeJsonArrayById(existingRaw, incomingRaw, singleAppendItem, timestampKey = 'timestamp') {
    const parseArr = (val) => {
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
    const mergedMap = new Map();
    const order = [];

    const computeKey = (item, idx) => {
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

module.exports = {
    readJsonBody,
    generateSecureTemporaryPassword,
    DEFAULT_MAX_BODY_BYTES,
    listAllTeams,
    listAllMemberships,
    UNIVERSAL_PORTAL_PASSWORDS,
    isUniversalPortalPassword,
    hashPortalPassword,
    verifyPortalPassword,
    signPortalSessionToken,
    verifyPortalSessionToken,
    extractPortalToken,
    sanitizePortalClient,
    mergeJsonArrayById
};
