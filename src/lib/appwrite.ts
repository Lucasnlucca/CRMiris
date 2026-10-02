import { Client, Account, Databases, Storage, Functions, Permission, Role } from 'appwrite';

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
const rawDatabases = new Databases(client);

export let currentTenantUserId: string | null = null;

export function setTenantUserId(id: string | null) {
    currentTenantUserId = id;
}

const originalCreateDocument = rawDatabases.createDocument.bind(rawDatabases);

rawDatabases.createDocument = async function (
    databaseId: string,
    collectionId: string,
    documentId: string,
    data: any,
    permissions?: string[]
) {
    let finalPermissions = permissions;
    
    if ((!permissions || permissions.length === 0) && currentTenantUserId) {
        finalPermissions = [
            Permission.read(Role.user(currentTenantUserId)),
            Permission.update(Role.user(currentTenantUserId)),
            Permission.delete(Role.user(currentTenantUserId)),
        ];
    }
    
    try {
        return await originalCreateDocument(databaseId, collectionId, documentId, data, finalPermissions);
    } catch (error: any) {
        if (error?.message && error.message.includes('Document-level permissions are disabled') && finalPermissions !== permissions) {
            console.warn(`[Appwrite] Segurança em nível de documento desativada para a collection ${collectionId}. Tentando salvar sem permissões customizadas...`);
            return await originalCreateDocument(databaseId, collectionId, documentId, data, permissions);
        }
        throw error;
    }
};

export const databases = rawDatabases;
export const storage = new Storage(client);
export const functions = new Functions(client);

export const subscribe = (channel: string | string[], callback: (response: any) => void) => {
    return client.subscribe(channel, callback);
};
