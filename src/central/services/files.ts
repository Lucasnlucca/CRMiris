import type { Attachment } from '../types';
import { newId } from '../utils/format';
import {
  storage,
  currentTenantId,
  extractAppwriteSessionSecret,
  getCachedJwtToken,
} from '../../lib/appwrite';

const DB_NAME = 'crm_documents_files_db';
const STORE_NAME = 'files';
const DB_VERSION = 1;

export const DEFAULT_STORAGE_BUCKET_ID =
  import.meta.env.VITE_APPWRITE_BUCKET_ID || 'crm_attachments';

export interface StoredFileMeta {
  id: string;
  tenantId?: string;
  storageFileId?: string;
  bucketId?: string;
  name: string;
  type: string;
  size: number;
  sha256?: string;
  syncedRemote?: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB não suportado neste ambiente.'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Falha ao abrir IndexedDB'));
      } catch (e) {
        reject(e);
      }
    });
  }
  return dbPromise;
}

const files = new Map<string, File>();
const urls = new Map<string, string>();
const metadataMap = new Map<string, StoredFileMeta>();
const listeners = new Set<(id: string, url: string) => void>();

export function normalizeFileMime(name: string, fallback = 'application/octet-stream'): string {
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return fallback || 'application/octet-stream';
}

export async function computeBlobSha256(blob: Blob): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API indisponível para cálculo de SHA-256.');
  }
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isTenantAllowed(recordTenantId?: string, requestedTenantId?: string | null): boolean {
  const effectiveRequested = requestedTenantId ?? currentTenantId;
  if (recordTenantId && effectiveRequested && recordTenantId !== effectiveRequested) {
    return false;
  }
  return true;
}

// Carrega os arquivos persistidos no IndexedDB para a memória da sessão
async function loadPersistedFiles(): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      for (const rec of records) {
        if (rec && rec.id) {
          const existingMeta = metadataMap.get(rec.id);
          metadataMap.set(rec.id, {
            id: rec.id,
            tenantId: rec.tenantId || existingMeta?.tenantId,
            storageFileId: rec.storageFileId || existingMeta?.storageFileId || rec.id,
            bucketId: rec.bucketId || existingMeta?.bucketId || DEFAULT_STORAGE_BUCKET_ID,
            name: rec.name || existingMeta?.name || 'documento',
            type: rec.type || existingMeta?.type || 'application/octet-stream',
            size: Number(rec.size ?? existingMeta?.size ?? 0),
            sha256: rec.sha256 || existingMeta?.sha256,
            syncedRemote: Boolean(rec.syncedRemote ?? existingMeta?.syncedRemote),
          });
          if (rec.file) {
            const mime = normalizeFileMime(rec.name || '', rec.type || rec.file.type);
            const f =
              rec.file instanceof File
                ? rec.file
                : new File([rec.file], rec.name || 'documento', { type: mime });
            files.set(rec.id, f);
            if (
              typeof URL.createObjectURL === 'function' &&
              isTenantAllowed(rec.tenantId, currentTenantId)
            ) {
              const u = URL.createObjectURL(f);
              urls.set(rec.id, u);
              listeners.forEach((fn) => {
                try {
                  fn(rec.id, u);
                } catch {}
              });
            }
          }
        }
      }
    };
  } catch (err) {
    console.warn('[fileStore] Não foi possível carregar arquivos do IndexedDB:', err);
  }
}

if (typeof window !== 'undefined') {
  void loadPersistedFiles();
}

async function fetchRemoteBlobFromStorage(
  bucketId: string,
  storageFileId: string
): Promise<Blob | null> {
  try {
    const downloadUrlObj = storage.getFileDownload(bucketId, storageFileId);
    const downloadUrl =
      typeof downloadUrlObj === 'string' ? downloadUrlObj : String(downloadUrlObj);
    if (!downloadUrl) return null;

    const headers: Record<string, string> = {};
    try {
      const jwt = await getCachedJwtToken();
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
    } catch {}
    const sessionSecret = extractAppwriteSessionSecret();
    if (sessionSecret) {
      headers['X-Appwrite-Session'] = sessionSecret;
    }

    const res = await fetch(downloadUrl, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      // Caso o Appwrite retorne um JSON de erro com status inesperado
      const clone = res.clone();
      const json = await clone.json().catch(() => null);
      if (json && (json.code || json.message || json.type)) {
        return null;
      }
    }

    const blob = await res.blob();
    return blob;
  } catch (err) {
    console.warn('[fileStore] Falha ao baixar binário do Appwrite Storage:', err);
    return null;
  }
}

export const fileStore = {
  registerRemoteMeta(meta: StoredFileMeta): void {
    if (!meta || !meta.id) return;
    const prev = metadataMap.get(meta.id);
    metadataMap.set(meta.id, {
      ...prev,
      ...meta,
      tenantId: meta.tenantId || prev?.tenantId || currentTenantId || undefined,
      storageFileId: meta.storageFileId || prev?.storageFileId || meta.id,
      bucketId: meta.bucketId || prev?.bucketId || DEFAULT_STORAGE_BUCKET_ID,
    });
  },

  getMeta(id: string): StoredFileMeta | undefined {
    return metadataMap.get(id);
  },

  add(
    file: File,
    id = newId('file'),
    options?: {
      tenantId?: string;
      storageFileId?: string;
      bucketId?: string;
      syncedRemote?: boolean;
      sha256?: string;
    }
  ): Attachment {
    const existingUrl = urls.get(id);
    if (existingUrl && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(existingUrl);
      } catch {}
    }
    urls.delete(id);

    const mime = normalizeFileMime(file.name, file.type || 'application/octet-stream');
    const normalizedFile =
      file.type === mime ? file : new File([file], file.name, { type: mime });

    const effectiveTenantId = options?.tenantId || currentTenantId || undefined;
    const storageFileId = options?.storageFileId || id;
    const bucketId = options?.bucketId || DEFAULT_STORAGE_BUCKET_ID;
    const syncedRemote = Boolean(options?.syncedRemote);

    const meta: StoredFileMeta = {
      id,
      tenantId: effectiveTenantId,
      storageFileId,
      bucketId,
      name: normalizedFile.name,
      type: normalizedFile.type,
      size: normalizedFile.size,
      sha256: options?.sha256,
      syncedRemote,
    };
    metadataMap.set(id, meta);

    files.set(id, normalizedFile);
    let generatedUrl = '';
    if (typeof URL.createObjectURL === 'function') {
      generatedUrl = URL.createObjectURL(normalizedFile);
      urls.set(id, generatedUrl);
      listeners.forEach((fn) => {
        try {
          fn(id, generatedUrl);
        } catch {}
      });
    }

    // Persistência assíncrona no IndexedDB escopada com tenantId e metadados remotos
    getDb()
      .then((db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
          id,
          tenantId: effectiveTenantId,
          storageFileId,
          bucketId,
          syncedRemote,
          sha256: options?.sha256,
          name: normalizedFile.name,
          type: normalizedFile.type,
          size: normalizedFile.size,
          file: normalizedFile,
          updatedAt: Date.now(),
        });
      })
      .catch((err) => {
        console.warn('[fileStore] Erro ao persistir arquivo no IndexedDB:', err);
      });

    return {
      id,
      name: normalizedFile.name,
      type: normalizedFile.type,
      size: normalizedFile.size,
    };
  },

  async uploadRemote(
    file: File,
    id = newId('file'),
    options?: { tenantId?: string; bucketId?: string }
  ): Promise<
    Attachment & {
      storageFileId: string;
      bucketId: string;
      tenantId?: string;
      sha256?: string;
      syncedRemote: boolean;
    }
  > {
    const effectiveTenantId = options?.tenantId || currentTenantId || undefined;
    const bucketId = options?.bucketId || DEFAULT_STORAGE_BUCKET_ID;
    const mime = normalizeFileMime(file.name, file.type || 'application/octet-stream');
    const normalizedFile =
      file.type === mime ? file : new File([file], file.name, { type: mime });

    let sha256: string | undefined;
    try {
      sha256 = await computeBlobSha256(normalizedFile);
    } catch {}

    let storageFileId = id;
    let syncedRemote = false;

    try {
      const uploaded = await storage.createFile(bucketId, id, normalizedFile);
      if (uploaded && uploaded.$id) {
        storageFileId = uploaded.$id;
      }
      syncedRemote = true;
    } catch (err: any) {
      if (err?.code === 409 || err?.status === 409) {
        // F10: Arquivo já existe com este ID. Deleta o arquivo antigo e recria para garantir fidelidade de bytes idênticos
        try {
          await storage.deleteFile(bucketId, id);
          const replaced = await storage.createFile(bucketId, id, normalizedFile);
          if (replaced && replaced.$id) {
            storageFileId = replaced.$id;
          }
          syncedRemote = true;
        } catch {
          // Fallback seguro: cria com ID único se substituição direta falhar
          const fallbackUpload = await storage.createFile(bucketId, newId(), normalizedFile);
          if (fallbackUpload && fallbackUpload.$id) {
            storageFileId = fallbackUpload.$id;
          }
          syncedRemote = true;
        }
      } else {
        // F10: Nunca anuncia sucesso silencioso quando o binário remoto falha
        throw new Error(`Falha no upload do binário para o Appwrite Storage: ${err?.message || err}`);
      }
    }

    const attachment = this.add(normalizedFile, id, {
      tenantId: effectiveTenantId,
      storageFileId,
      bucketId,
      syncedRemote,
      sha256,
    });

    return {
      ...attachment,
      storageFileId,
      bucketId,
      tenantId: effectiveTenantId,
      sha256,
      syncedRemote,
    };
  },

  get(id: string, expectedTenantId?: string | null): File | undefined {
    const meta = metadataMap.get(id);
    if (!isTenantAllowed(meta?.tenantId, expectedTenantId)) {
      return undefined;
    }
    return files.get(id);
  },

  url(id: string, expectedTenantId?: string | null): string | undefined {
    const meta = metadataMap.get(id);
    if (!isTenantAllowed(meta?.tenantId, expectedTenantId)) {
      return undefined;
    }
    if (urls.has(id)) return urls.get(id);
    const file = files.get(id);
    if (!file || typeof URL.createObjectURL !== 'function') return undefined;
    const url = URL.createObjectURL(file);
    urls.set(id, url);
    return url;
  },

  async ensure(
    id: string,
    options?: {
      tenantId?: string;
      storageFileId?: string;
      bucketId?: string;
      name?: string;
      type?: string;
    }
  ): Promise<string | undefined> {
    const requestedTenant = options?.tenantId || currentTenantId || undefined;
    const meta = metadataMap.get(id);
    if (!isTenantAllowed(meta?.tenantId, requestedTenant)) {
      console.warn(
        `[fileStore] Acesso bloqueado ao arquivo ${id}: pertence a outro tenant (${meta?.tenantId}).`
      );
      return undefined;
    }

    const existing = this.url(id, requestedTenant);
    if (existing) return existing;

    // 1. Tenta carregar do IndexedDB local validando tenantId
    try {
      const db = await getDb();
      const localRecord = await new Promise<any>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      if (localRecord) {
        if (!isTenantAllowed(localRecord.tenantId, requestedTenant)) {
          console.warn(
            `[fileStore] Registro local ${id} pertence a outro tenant (${localRecord.tenantId}).`
          );
          return undefined;
        }
        if (localRecord.file) {
          const mime = normalizeFileMime(
            localRecord.name || options?.name || '',
            localRecord.type || options?.type || localRecord.file.type
          );
          const f =
            localRecord.file instanceof File
              ? localRecord.file
              : new File([localRecord.file], localRecord.name || options?.name || 'documento', {
                  type: mime,
                });
          files.set(id, f);
          metadataMap.set(id, {
            id,
            tenantId: localRecord.tenantId || requestedTenant,
            storageFileId:
              localRecord.storageFileId || options?.storageFileId || meta?.storageFileId || id,
            bucketId:
              localRecord.bucketId ||
              options?.bucketId ||
              meta?.bucketId ||
              DEFAULT_STORAGE_BUCKET_ID,
            name: f.name,
            type: f.type,
            size: f.size,
            sha256: localRecord.sha256 || meta?.sha256,
            syncedRemote: Boolean(localRecord.syncedRemote ?? meta?.syncedRemote),
          });
          if (typeof URL.createObjectURL === 'function') {
            const u = URL.createObjectURL(f);
            urls.set(id, u);
            listeners.forEach((fn) => {
              try {
                fn(id, u);
              } catch {}
            });
            return u;
          }
        }
      }
    } catch {}

    // 2. Se não está no cache local (ex.: Browser B), busca no Appwrite Storage
    const targetBucketId =
      options?.bucketId || meta?.bucketId || DEFAULT_STORAGE_BUCKET_ID;
    const targetStorageFileId =
      options?.storageFileId || meta?.storageFileId || id;

    const remoteBlob = await fetchRemoteBlobFromStorage(targetBucketId, targetStorageFileId);
    if (!remoteBlob) {
      return undefined;
    }

    const fileName = options?.name || meta?.name || id;
    const mime = normalizeFileMime(
      fileName,
      options?.type || meta?.type || remoteBlob.type || 'application/octet-stream'
    );
    const hydratedFile = new File([remoteBlob], fileName, { type: mime });
    let sha256 = meta?.sha256;
    if (!sha256) {
      try {
        sha256 = await computeBlobSha256(hydratedFile);
      } catch {}
    }

    this.add(hydratedFile, id, {
      tenantId: requestedTenant || meta?.tenantId,
      storageFileId: targetStorageFileId,
      bucketId: targetBucketId,
      syncedRemote: true,
      sha256,
    });

    return this.url(id, requestedTenant);
  },

  delete(id: string): void {
    const meta = metadataMap.get(id);
    if (meta?.tenantId && currentTenantId && meta.tenantId !== currentTenantId) {
      return;
    }
    const existingUrl = urls.get(id);
    if (existingUrl && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(existingUrl);
      } catch {}
    }
    urls.delete(id);
    files.delete(id);
    metadataMap.delete(id);

    getDb()
      .then((db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
      })
      .catch(() => {});

    const bucketId = meta?.bucketId || DEFAULT_STORAGE_BUCKET_ID;
    const storageFileId = meta?.storageFileId || id;
    storage.deleteFile(bucketId, storageFileId).catch(() => {});
  },

  async deleteRemote(id: string): Promise<void> {
    const meta = metadataMap.get(id);
    const bucketId = meta?.bucketId || DEFAULT_STORAGE_BUCKET_ID;
    const storageFileId = meta?.storageFileId || id;
    this.delete(id);
    try {
      await storage.deleteFile(bucketId, storageFileId);
    } catch (err: any) {
      if (err?.code !== 404 && err?.status !== 404) {
        throw err;
      }
    }
  },

  subscribe(fn: (id: string, url: string) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /**
   * Limpa apenas caches locais cujos arquivos pertençam ao tenant informado
   * e já possuam cópia remota confirmada (syncedRemote === true).
   * Nunca apaga arquivos locais ainda não sincronizados nem arquivos de outros tenants.
   */
  clear(targetTenantId?: string): void {
    const scopeTenant = targetTenantId || currentTenantId || undefined;

    getDb()
      .then((db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const records = req.result || [];
          for (const rec of records) {
            if (!rec || !rec.id) continue;
            const belongsToScope = !scopeTenant || !rec.tenantId || rec.tenantId === scopeTenant;
            const hasConfirmedRemoteCopy = Boolean(rec.syncedRemote && rec.storageFileId);
            if (belongsToScope && hasConfirmedRemoteCopy) {
              const u = urls.get(rec.id);
              if (u && typeof URL.revokeObjectURL === 'function') {
                try {
                  URL.revokeObjectURL(u);
                } catch {}
              }
              urls.delete(rec.id);
              files.delete(rec.id);
              store.delete(rec.id);
            }
          }
        };
      })
      .catch(() => {});
  },
};
