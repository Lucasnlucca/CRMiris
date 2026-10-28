/**
 * Cliente Frontend do Backend API Bridge
 *
 * Fornece métodos tipados para envio de operações de escrita autorizadas
 * ao servidor através de `/api/crm/write`, garantindo que:
 * 1. O JWT ou token de sessão é gerado e anexado aos headers.
 * 2. Nenhuma credencial privilegiada (Server API Key) resida no cliente.
 * 3. As respostas de sucesso ou erro sejam tratadas de forma consistente.
 */

import { currentTenantId, getAuthoritativeAuthHeaders, clearCachedJwt } from './appwrite';

export interface BackendBridgeResponse<T = any> {
  success: boolean;
  action: string;
  collectionId: string;
  documentId: string;
  data?: T;
  tenantId?: string;
  error?: string;
}

const WRITE_API_ENDPOINT = '/api/crm/write';
const REQUEST_TIMEOUT_MS = 25000;

async function sendAuthorizedWriteRequest<T>(payload: {
  action: 'create' | 'update' | 'delete' | 'signContract';
  databaseId: string;
  collectionId: string;
  documentId?: string;
  data?: any;
  permissions?: string[];
  targetTenantId?: string;
}): Promise<T> {
  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (payload.action !== 'signContract') {
    headers = await getAuthoritativeAuthHeaders();
  } else {
    try {
      headers = await getAuthoritativeAuthHeaders();
    } catch {}
  }

  // Anexa o tenant ativo do contexto da interface como sugestão (o servidor valida rigorosamente)
  const fullPayload = {
    ...payload,
    targetTenantId: payload.targetTenantId || currentTenantId || undefined,
  };

  // Controller para timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(WRITE_API_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(fullPayload),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    const json = (await response.json().catch(() => ({}))) as BackendBridgeResponse<T>;

    if (!response.ok || !json.success) {
      if (response.status === 401) {
        clearCachedJwt();
      }
      const status = response.status && response.status >= 400 ? response.status : 500;
      const errorMessage =
        json.error || `[BackendBridge] Erro HTTP ${status} ao executar ${payload.action}.`;
      const errorObj = new Error(errorMessage) as Error & { code?: number; status?: number };
      errorObj.code = status;
      errorObj.status = status;
      throw errorObj;
    }

    return (json.data ?? json) as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(
        `[BackendBridge] Tempo limite esgotado (${REQUEST_TIMEOUT_MS}ms) na operação ${payload.action}.`
      ) as Error & { code?: number; status?: number; isTimeout?: boolean };
      timeoutErr.code = 408;
      timeoutErr.status = 408;
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    if (err && typeof err === 'object') {
      if (err.code === undefined && err.status === undefined) {
        err.code = 503;
        err.status = 503;
      } else if (err.code === undefined) {
        err.code = err.status;
      } else if (err.status === undefined) {
        err.status = err.code;
      }
    }
    throw err;
  }
}

export const backendApiBridge = {
  /**
   * Criação autorizada de documento no servidor
   */
  async createDocument<T = any>(
    databaseId: string,
    collectionId: string,
    documentId: string,
    data: any,
    permissions?: string[]
  ): Promise<T> {
    return await sendAuthorizedWriteRequest<T>({
      action: 'create',
      databaseId,
      collectionId,
      documentId,
      data,
      permissions,
    });
  },

  /**
   * Atualização autorizada de documento no servidor
   */
  async updateDocument<T = any>(
    databaseId: string,
    collectionId: string,
    documentId: string,
    data: any,
    permissions?: string[]
  ): Promise<T> {
    return await sendAuthorizedWriteRequest<T>({
      action: 'update',
      databaseId,
      collectionId,
      documentId,
      data,
      permissions,
    });
  },

  /**
   * Exclusão autorizada de documento no servidor
   */
  async deleteDocument(
    databaseId: string,
    collectionId: string,
    documentId: string
  ): Promise<{ success: boolean; deletedId: string }> {
    return await sendAuthorizedWriteRequest<{ success: boolean; deletedId: string }>({
      action: 'delete',
      databaseId,
      collectionId,
      documentId,
    });
  },

  /**
   * Assinatura eletrônica de contrato no servidor (suporta público e autenticado)
   */
  async signContract(
    contractId: string,
    payload: {
      signerName: string;
      signerDocument: string;
      signerEmail?: string;
      signerPhone?: string;
      termsAccepted: boolean;
      publicToken?: string;
    }
  ): Promise<any> {
    return await sendAuthorizedWriteRequest<any>({
      action: 'signContract',
      databaseId: 'crm_db',
      collectionId: 'crm_contracts',
      documentId: contractId,
      data: payload,
    });
  },
};
