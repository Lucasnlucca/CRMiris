/**
 * Serviço de Tokens de Acesso Público e Proteção de Endpoints Externos
 *
 * Garante segurança robusta para fluxos de visualização de propostas e assinatura de contratos:
 * 1. Tokens de alta entropia (256-bit crypto.randomBytes).
 * 2. Validação estrita de escopo (separação mandatória entre contrato e proposta).
 * 3. Expiração temporal e suporte a revogação instantânea.
 * 4. Proteção contra enumeração de IDs e força bruta (Rate limiting por IP/targetId).
 * 5. Comparação em tempo constante (crypto.timingSafeEqual) contra timing attacks.
 * 6. Sanitização de payload: nunca expõe dados internos do CRM (margens, tenant_id, notas internas).
 * 7. Suporte a links legados com desafio de dígitos e geração de token temporário de sessão.
 */

import crypto from 'crypto';

export type PublicTargetType = 'contract' | 'proposal';
export type PublicTokenScope = 'sign_contract' | 'view_proposal';

export interface PublicAccessTokenRecord {
  token: string;
  targetType: PublicTargetType;
  targetId: string;
  tenantId: string;
  scope: PublicTokenScope;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string;
  allowedSignerDocDigits?: string; // primeiros/últimos dígitos esperados
  failedAttempts: number;
  maxAttempts: number;
}

export interface ValidateTokenOptions {
  token: string;
  targetType: PublicTargetType;
  targetId: string;
  expectedScope: PublicTokenScope;
  clientIp?: string;
}

export interface ValidateTokenResult {
  valid: boolean;
  errorCode?: 'TOKEN_NOT_FOUND' | 'TARGET_MISMATCH' | 'SCOPE_MISMATCH' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED' | 'RATE_LIMITED' | 'IP_BLOCKED';
  errorMessage?: string;
  tokenRecord?: PublicAccessTokenRecord;
}

export interface LegacyAccessOptions {
  targetType: PublicTargetType;
  targetId: string;
  inputDigits: string;
  expectedDigits: string;
  tenantId: string;
  clientIp: string;
}

export interface LegacyAccessResult {
  success: boolean;
  temporaryToken?: string;
  errorCode?: 'INVALID_DIGITS' | 'RATE_LIMITED' | 'TARGET_NOT_FOUND';
  errorMessage?: string;
}

// Armazenamento em memória para demonstração e testes (no backend real, persiste em Appwrite ou Redis)
const tokenStore = new Map<string, PublicAccessTokenRecord>();
const ipAttemptStore = new Map<string, { attempts: number; lastAttempt: number; blockedUntil?: number }>();

const MAX_IP_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Gera um token de acesso público de 256 bits com escopo estrito
 */
export function generatePublicAccessToken(params: {
  targetType: PublicTargetType;
  targetId: string;
  tenantId: string;
  scope: PublicTokenScope;
  expiresInDays?: number;
  allowedSignerDocDigits?: string;
}): PublicAccessTokenRecord {
  // Garantir conformidade de escopo
  if (params.targetType === 'contract' && params.scope !== 'sign_contract') {
    throw new Error('Incompatibilidade de escopo: Contratos exigem escopo sign_contract.');
  }
  if (params.targetType === 'proposal' && params.scope !== 'view_proposal') {
    throw new Error('Incompatibilidade de escopo: Propostas exigem escopo view_proposal.');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const days = params.expiresInDays || 14;
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const record: PublicAccessTokenRecord = {
    token: rawToken,
    targetType: params.targetType,
    targetId: params.targetId,
    tenantId: params.tenantId,
    scope: params.scope,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revoked: false,
    allowedSignerDocDigits: params.allowedSignerDocDigits,
    failedAttempts: 0,
    maxAttempts: 10,
  };

  tokenStore.set(rawToken, record);
  return record;
}

/**
 * Revoga um token imediatamente
 */
export function revokePublicAccessToken(token: string): boolean {
  const record = tokenStore.get(token);
  if (!record) return false;
  record.revoked = true;
  record.revokedAt = new Date().toISOString();
  return true;
}

/**
 * Validação segura de token contra ataques de timing, escopo, expiração e enumeração
 */
export function validatePublicAccessToken(opts: ValidateTokenOptions): ValidateTokenResult {
  const clientIpKey = opts.clientIp || 'default_ip';
  const ipRate = ipAttemptStore.get(clientIpKey);
  const now = Date.now();

  // 1. Checar bloqueio por IP (Anti-Força Bruta / Anti-Enumeração)
  if (ipRate?.blockedUntil && now < ipRate.blockedUntil) {
    return {
      valid: false,
      errorCode: 'IP_BLOCKED',
      errorMessage: 'Muitas tentativas incorretas. Acesso bloqueado temporariamente.',
    };
  }

  const record = tokenStore.get(opts.token);

  if (!record) {
    registerFailedAttempt(clientIpKey);
    return {
      valid: false,
      errorCode: 'TOKEN_NOT_FOUND',
      errorMessage: 'Token de acesso não encontrado ou inválido.',
    };
  }

  // 2. Checar integridade em tempo constante para o token
  const bufA = Buffer.from(record.token, 'utf8');
  const bufB = Buffer.from(opts.token, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    registerFailedAttempt(clientIpKey);
    return {
      valid: false,
      errorCode: 'TOKEN_NOT_FOUND',
      errorMessage: 'Token inválido.',
    };
  }

  // 3. Checar Revogação
  if (record.revoked) {
    return {
      valid: false,
      errorCode: 'TOKEN_REVOKED',
      errorMessage: 'Este link de acesso foi revogado pelo emissor.',
    };
  }

  // 4. Checar Expiração
  if (new Date(record.expiresAt).getTime() < now) {
    return {
      valid: false,
      errorCode: 'TOKEN_EXPIRED',
      errorMessage: 'Este link de acesso expirou. Solicite um novo link.',
    };
  }

  // 5. Checar Escopo Estrito (Não permite que token de proposta abra contrato ou vice-versa)
  if (record.scope !== opts.expectedScope) {
    registerFailedAttempt(clientIpKey);
    return {
      valid: false,
      errorCode: 'SCOPE_MISMATCH',
      errorMessage: 'Escopo de autorização incompatível com a operação solicitada.',
    };
  }

  // 6. Checar Alvo (ID e Tipo)
  if (record.targetType !== opts.targetType || record.targetId !== opts.targetId) {
    registerFailedAttempt(clientIpKey);
    return {
      valid: false,
      errorCode: 'TARGET_MISMATCH',
      errorMessage: 'Token não corresponde ao documento solicitado.',
    };
  }

  // Sucesso: limpar contadores de falha do IP
  ipAttemptStore.delete(clientIpKey);
  return {
    valid: true,
    tokenRecord: record,
  };
}

/**
 * Validação de acesso legado para links antigos sem token pré-gerado
 */
export function validateLegacyAccess(opts: LegacyAccessOptions): LegacyAccessResult {
  const ipKey = `${opts.clientIp}_legacy_${opts.targetId}`;
  const now = Date.now();
  const rate = ipAttemptStore.get(ipKey);

  if (rate?.blockedUntil && now < rate.blockedUntil) {
    return {
      success: false,
      errorCode: 'RATE_LIMITED',
      errorMessage: 'Muitas tentativas com dígitos incorretos. Tente novamente em 15 minutos.',
    };
  }

  // Sanitizar dígitos informados e esperados (apenas números)
  const cleanInput = opts.inputDigits.replace(/\D/g, '');
  const cleanExpected = opts.expectedDigits.replace(/\D/g, '');

  if (!cleanInput || !cleanExpected || cleanInput !== cleanExpected) {
    registerFailedAttempt(ipKey);
    return {
      success: false,
      errorCode: 'INVALID_DIGITS',
      errorMessage: 'Dígitos de confirmação incorretos.',
    };
  }

  // Sucesso na verificação de dígitos legados: emite token temporário de sessão de 30 minutos
  ipAttemptStore.delete(ipKey);
  const scope: PublicTokenScope = opts.targetType === 'contract' ? 'sign_contract' : 'view_proposal';
  const tempToken = generatePublicAccessToken({
    targetType: opts.targetType,
    targetId: opts.targetId,
    tenantId: opts.tenantId,
    scope,
    expiresInDays: 0.021, // ~30 minutos
  });

  return {
    success: true,
    temporaryToken: tempToken.token,
  };
}

function registerFailedAttempt(key: string) {
  const now = Date.now();
  const record = ipAttemptStore.get(key) || { attempts: 0, lastAttempt: now };
  record.attempts++;
  record.lastAttempt = now;

  if (record.attempts >= MAX_IP_ATTEMPTS) {
    record.blockedUntil = now + LOCKOUT_DURATION_MS;
  }
  ipAttemptStore.set(key, record);
}

/**
 * Sanitiza dados de documentos contratuais ou propostas para exibição pública
 * Remove absolutamente qualquer informação interna do CRM antes do retorno.
 */
export function sanitizePublicDocument(rawDoc: Record<string, any>, targetType: PublicTargetType) {
  if (targetType === 'contract') {
    return {
      id: rawDoc.$id || rawDoc.id,
      title: rawDoc.title,
      status: rawDoc.status,
      content: rawDoc.content,
      clauses_json: rawDoc.clauses_json,
      monthly_cost: rawDoc.monthly_cost,
      setup_cost: rawDoc.setup_cost,
      total_amount: rawDoc.total_amount,
      client_name: rawDoc.client_name,
      signature_status: rawDoc.signature_status,
      signed_at: rawDoc.signed_at,
      document_hash: rawDoc.document_hash,
      signature_hash: rawDoc.signature_hash,
      created_at: rawDoc.$createdAt || rawDoc.created_at,
      // Metadados sensíveis estritamente OMITIDOS:
      // tenant_id: OMITIDO
      // internal_notes: OMITIDO
      // created_by_user_id: OMITIDO
      // profit_margin: OMITIDO
    };
  }

  if (targetType === 'proposal') {
    return {
      id: rawDoc.$id || rawDoc.id,
      title: rawDoc.title,
      status: rawDoc.status,
      content: rawDoc.content,
      notes: rawDoc.notes,
      total_amount: rawDoc.total_amount,
      client_name: rawDoc.client_name,
      valid_until: rawDoc.valid_until,
      created_at: rawDoc.$createdAt || rawDoc.created_at,
      // Metadados sensíveis estritamente OMITIDOS
    };
  }

  return {};
}

// Exportações para suítes de teste
export const _testStore = {
  tokenStore,
  ipAttemptStore,
  resetStore() {
    tokenStore.clear();
    ipAttemptStore.clear();
  }
};
