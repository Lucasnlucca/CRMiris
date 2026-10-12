import { Client, Account, Databases, Storage, Functions, Permission, Role, Teams } from 'appwrite';
import { createTenantDatabases } from './tenantDatabases';

const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const appwriteUrl = isLocalhost
    ? (import.meta.env.VITE_APPWRITE_URL || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1')
    : (typeof window !== 'undefined' ? `${window.location.origin}/v1` : 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1');
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
    currentTenantUserId = id;
}

export function setTenantId(id: string | null) {
    currentTenantId = id;
}

export function setIsSuperAdmin(val: boolean) {
    currentIsSuperAdmin = val;
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

