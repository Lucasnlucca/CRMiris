import { Client, Account, Databases, Storage, Functions, Permission, Role, Teams } from 'appwrite';
import { createTenantDatabases } from './tenantDatabases';

const appwriteUrl =
    import.meta.env.VITE_APPWRITE_URL ||
    import.meta.env.VITE_APPWRITE_ENDPOINT ||
    'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
const appwriteProjectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f';
export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';

export const client = new Client();

client
    .setEndpoint(appwriteUrl)
    .setProject(appwriteProjectId);

export const account = new Account(client);
export const teams = new Teams(client);
export const rawDatabases = new Databases(client);

export let currentTenantUserId: string | null = null;
export let currentTenantId: string | null = null;
export let currentIsSuperAdmin: boolean = false;

export function setTenantUserId(id: string | null) {
    if (currentTenantUserId !== id) {
        clearCachedJwt();
    }
    currentTenantUserId = id;
}

export function setTenantId(id: string | null) {
    currentTenantId = id;
}

export function setIsSuperAdmin(val: boolean) {
    currentIsSuperAdmin = val;
}

const JWT_CACHE_KEY = 'crm_cached_jwt';
const JWT_EXP_KEY = 'crm_cached_jwt_exp';
const JWT_TTL_MS = 10 * 60 * 1000; // 10 minutos (JWT do Appwrite dura 15 min)

let memoryJwtToken: string = '';
let memoryJwtExpiresAt: number = 0;
let inFlightJwtPromise: Promise<string> | null = null;

export function clearCachedJwt() {
    memoryJwtToken = '';
    memoryJwtExpiresAt = 0;
    inFlightJwtPromise = null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
            window.sessionStorage.removeItem(JWT_CACHE_KEY);
            window.sessionStorage.removeItem(JWT_EXP_KEY);
        } catch {}
    }
}

export function extractAppwriteSessionSecret(): string {
    if (typeof window === 'undefined') return '';

    // 1. Verificar cookieFallback do Appwrite SDK no localStorage
    try {
        const fallbackRaw = window.localStorage.getItem('cookieFallback');
        if (fallbackRaw) {
            const parsed = JSON.parse(fallbackRaw);
            if (parsed && typeof parsed === 'object') {
                const exactKey = `a_session_${appwriteProjectId}`;
                const legacyKey = `a_session_${appwriteProjectId}_legacy`;
                if (typeof parsed[exactKey] === 'string' && parsed[exactKey].trim()) {
                    return parsed[exactKey].trim();
                }
                if (typeof parsed[legacyKey] === 'string' && parsed[legacyKey].trim()) {
                    return parsed[legacyKey].trim();
                }
                for (const [k, v] of Object.entries(parsed)) {
                    if (k.startsWith('a_session_') && typeof v === 'string' && v.trim()) {
                        return v.trim();
                    }
                }
            }
        }
    } catch {}

    // 2. Verificar document.cookie
    if (typeof document !== 'undefined' && document.cookie) {
        try {
            const match =
                document.cookie.match(new RegExp(`(?:^|;\\s*)a_session_${appwriteProjectId}(?:_legacy)?=([^;]+)`)) ||
                document.cookie.match(/(?:^|;\s*)a_session_[^=]+(?:_legacy)?=([^;]+)/) ||
                document.cookie.match(/(?:^|;\s*)a_session=([^;]+)/);
            if (match && match[1]) {
                return decodeURIComponent(match[1]).trim();
            }
        } catch {}
    }

    return '';
}

export async function getCachedJwtToken(): Promise<string> {
    const now = Date.now();

    if (memoryJwtToken && now < memoryJwtExpiresAt) {
        return memoryJwtToken;
    }

    if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
            const storedJwt = window.sessionStorage.getItem(JWT_CACHE_KEY);
            const storedExp = Number(window.sessionStorage.getItem(JWT_EXP_KEY) || '0');
            if (storedJwt && now < storedExp) {
                memoryJwtToken = storedJwt;
                memoryJwtExpiresAt = storedExp;
                return storedJwt;
            }
        } catch {}
    }

    if (inFlightJwtPromise) {
        return inFlightJwtPromise;
    }

    inFlightJwtPromise = (async () => {
        try {
            const jwtRes = await account.createJWT();
            const token = jwtRes?.jwt || '';
            if (token) {
                const exp = Date.now() + JWT_TTL_MS;
                memoryJwtToken = token;
                memoryJwtExpiresAt = exp;
                if (typeof window !== 'undefined' && window.sessionStorage) {
                    try {
                        window.sessionStorage.setItem(JWT_CACHE_KEY, token);
                        window.sessionStorage.setItem(JWT_EXP_KEY, String(exp));
                    } catch {}
                }
            }
            return token;
        } catch (err: any) {
            console.warn('[AppwriteAuth] Aviso ao obter JWT (usando fallback de sessão):', err?.message || err);
            return memoryJwtToken || '';
        } finally {
            inFlightJwtPromise = null;
        }
    })();

    return inFlightJwtPromise;
}

export async function getAuthoritativeAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    const jwt = await getCachedJwtToken();
    if (jwt) {
        headers['Authorization'] = `Bearer ${jwt}`;
    }

    const sessionSecret = extractAppwriteSessionSecret();
    if (sessionSecret) {
        headers['X-Appwrite-Session'] = sessionSecret;
    }

    let userId = currentTenantUserId;
    if (!userId) {
        try {
            const acc = await account.get();
            if (acc?.$id) {
                userId = acc.$id;
                currentTenantUserId = acc.$id;
            }
        } catch {}
    }

    if (userId) {
        headers['X-Appwrite-User-Id'] = userId;
    }

    return headers;
}

/**
 * Cliente centralizado de banco de dados do CRM com injeção automática de tenant_id,
 * sanitização de consultas e validação de posse de organização.
 */
export const databases = createTenantDatabases(
    rawDatabases,
    () => currentTenantId,
    () => currentTenantUserId,
    () => currentIsSuperAdmin
);

export const storage = new Storage(client);
export const functions = new Functions(client);

export const subscribe = (channel: string | string[], callback: (response: any) => void) => {
    return client.subscribe(channel, callback);
};


