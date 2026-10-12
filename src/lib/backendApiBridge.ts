/**
 * Cliente Frontend do Backend API Bridge
 *
 * Fornece métodos tipados para envio de operações de escrita autorizadas
 * ao servidor através de `/api/crm/write`, garantindo que:
 * 1. O JWT ou token de sessão é gerado e anexado aos headers.
 * 2. Nenhuma credencial privilegiada (Server API Key) resida no cliente.
 * 3. As respostas de sucesso ou erro sejam tratadas de forma consistente.
 */

import { account, currentTenantId } from './appwrite';

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
  let jwtToken = '';

  // 1. Obter JWT de curta duração da sessão ativa
  try {
    const jwtResponse = await account.createJWT();
    jwtToken = jwtResponse.jwt;
  } catch (err: any) {
    // Se a ação for signContract, o signatário pode ser público/anônimo
    if (payload.action !== 'signContract') {
      console.warn('[BackendBridge] Falha ao gerar JWT de sessão:', err.message);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (jwtToken) {
    headers['Authorization'] = `Bearer ${jwtToken}`;
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
      const errorMessage =
        json.error || `[BackendBridge] Erro HTTP ${response.status} ao executar ${payload.action}.`;
      const errorObj = new Error(errorMessage);
      (errorObj as any).code = response.status;
      throw errorObj;
    }

    return (json.data ?? json) as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`[BackendBridge] Tempo limite esgotado (${REQUEST_TIMEOUT_MS}ms) na operação ${payload.action}.`);
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
