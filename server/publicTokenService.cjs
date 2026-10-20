/**
 * Servico de Tokens de Acesso Publico e Protecao de Endpoints Externos (CommonJS)
 */

const crypto = require('crypto');

// Armazenamento em memoria
const tokenStore = new Map();
const ipAttemptStore = new Map();

const MAX_IP_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

function generatePublicAccessToken(params) {
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

  const record = {
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

function revokePublicAccessToken(token) {
  const record = tokenStore.get(token);
  if (!record) return false;
  record.revoked = true;
  record.revokedAt = new Date().toISOString();
  return true;
}

function validatePublicAccessToken(opts) {
  const clientIpKey = opts.clientIp || 'default_ip';
  const ipRate = ipAttemptStore.get(clientIpKey);
  const now = Date.now();

  if (ipRate && ipRate.blockedUntil && now < ipRate.blockedUntil) {
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

  if (record.revoked) {
    return {
      valid: false,
      errorCode: 'TOKEN_REVOKED',
      errorMessage: 'Este link de acesso foi revogado pelo emissor.',
    };
  }

  if (new Date(record.expiresAt).getTime() < now) {
    return {
      valid: false,
      errorCode: 'TOKEN_EXPIRED',
      errorMessage: 'Este link de acesso expirou. Solicite um novo link.',
    };
  }

  if (record.scope !== opts.expectedScope) {
    registerFailedAttempt(clientIpKey);
    return {
      valid: false,
      errorCode: 'SCOPE_MISMATCH',
      errorMessage: 'Escopo de autorização incompatível com a operação solicitada.',
    };
  }

  if (record.targetType !== opts.targetType || record.targetId !== opts.targetId) {
    registerFailedAttempt(clientIpKey);
    return {
      valid: false,
      errorCode: 'TARGET_MISMATCH',
      errorMessage: 'Token não corresponde ao documento solicitado.',
    };
  }

  ipAttemptStore.delete(clientIpKey);
  return {
    valid: true,
    tokenRecord: record,
  };
}

function validateLegacyAccess(opts) {
  const ipKey = `${opts.clientIp}_legacy_${opts.targetId}`;
  const now = Date.now();
  const rate = ipAttemptStore.get(ipKey);

  if (rate && rate.blockedUntil && now < rate.blockedUntil) {
    return {
      success: false,
      errorCode: 'RATE_LIMITED',
      errorMessage: 'Muitas tentativas com dígitos incorretos. Tente novamente em 15 minutos.',
    };
  }

  const cleanInput = (opts.inputDigits || '').replace(/\D/g, '');
  const cleanExpected = (opts.expectedDigits || '').replace(/\D/g, '');

  if (!cleanInput || !cleanExpected || cleanInput !== cleanExpected) {
    registerFailedAttempt(ipKey);
    return {
      success: false,
      errorCode: 'INVALID_DIGITS',
      errorMessage: 'Dígitos de confirmação incorretos.',
    };
  }

  ipAttemptStore.delete(ipKey);
  const scope = opts.targetType === 'contract' ? 'sign_contract' : 'view_proposal';
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

function registerFailedAttempt(key) {
  const now = Date.now();
  const record = ipAttemptStore.get(key) || { attempts: 0, lastAttempt: now };
  record.attempts++;
  record.lastAttempt = now;

  if (record.attempts >= MAX_IP_ATTEMPTS) {
    record.blockedUntil = now + LOCKOUT_DURATION_MS;
  }
  ipAttemptStore.set(key, record);
}

function sanitizePublicDocument(rawDoc, targetType) {
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
    };
  }

  return {};
}

const _testStore = {
  tokenStore,
  ipAttemptStore,
  resetStore() {
    tokenStore.clear();
    ipAttemptStore.clear();
  },
};

module.exports = {
  generatePublicAccessToken,
  revokePublicAccessToken,
  validatePublicAccessToken,
  validateLegacyAccess,
  sanitizePublicDocument,
  _testStore,
};
