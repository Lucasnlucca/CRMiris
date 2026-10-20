/**
 * Handler de Assinatura Eletronica no Backend (CommonJS)
 */

const crypto = require('crypto');
const { assertNotUnderMaintenance, enterPrivilegedOperation } = require('./maintenanceGuard.cjs');
const { validatePublicAccessToken, revokePublicAccessToken } = require('./publicTokenService.cjs');

function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const clientIp = list.split(',')[0].trim();
    if (clientIp) return clientIp;
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0].trim() : realIp.trim();
  }

  return req.socket?.remoteAddress || '127.0.0.1';
}

function sha256Node(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function handleSignContractServer(req, db) {
  assertNotUnderMaintenance('signContract');
  const exitOp = enterPrivilegedOperation();
  try {
    const { contractId, signerName, signerDocument, signerEmail, signerPhone, termsAccepted, publicToken } = req.body;

    if (!termsAccepted) {
      throw new Error('O aceite formal das cláusulas contratuais e termos é obrigatório.');
    }

    if (!signerName?.trim() || !signerDocument?.trim()) {
      throw new Error('Nome completo e documento (CPF/CNPJ) do signatário são obrigatórios.');
    }

    // 1. Obter o contrato original diretamente do banco de dados
    const contract = await db.getContractById(contractId);
    if (!contract) {
      throw new Error('Contrato não localizado.');
    }

    if (contract.status === 'signed' || contract.signed_at || contract.signature_hash) {
      throw new Error('Este contrato já se encontra assinado e com integridade bloqueada.');
    }

    const clientIp = extractClientIp(req);

    // S02: Validação mandatória de token público autoritativo vinculado ao contrato e tenant
    if (!publicToken || typeof publicToken !== 'string' || !publicToken.trim()) {
      throw new Error('Autorização de assinatura (token público) é obrigatória para assinar o contrato.');
    }

    const tokenCheck = validatePublicAccessToken({
      token: publicToken.trim(),
      targetType: 'contract',
      targetId: contractId,
      expectedScope: 'sign_contract',
      clientIp,
    });
    if (!tokenCheck.valid) {
      throw new Error(tokenCheck.errorMessage || 'Autorização de assinatura inválida ou expirada.');
    }

    if (contract.tenant_id && tokenCheck.tokenRecord?.tenantId && contract.tenant_id !== tokenCheck.tokenRecord.tenantId) {
      throw new Error('Autorização inválida: a empresa vinculada ao token difere do contrato.');
    }

    // 2. Captura Autoritativa de Metadados de Rede no Servidor
    const clientPort = String(req.socket?.remotePort || req.headers['x-forwarded-port'] || '443');
    const userAgent = String(req.headers['user-agent'] || 'Desconhecido').slice(0, 500);
    const timestampUtc = new Date().toISOString();
    const legalBasis = 'Art. 10, § 2º da MP nº 2.200-2/2001 e Art. 4º, Inciso II da Lei Federal nº 14.063/2020';

    // 3. Montar Texto Canônico e Gerar o Hash SHA-256 do Documento Original
    const items = contract.items_json ? JSON.parse(contract.items_json) : [];
    const clauses = contract.clauses_json ? JSON.parse(contract.clauses_json) : [];
    const clausesText = Array.isArray(clauses)
      ? clauses.map((c, i) => `${c.title || `CLÁUSULA ${i + 1}ª`}\n${c.text || c.txt || ''}`).join('\n\n')
      : String(contract.clauses_json || '');

    const canonicalDocument = [
      `=== INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS ===`,
      `IDENTIFICADOR:${contract.contract_number || contractId}`,
      `CONTRATADA:${contract.provider_name || ''} | DOC:${contract.provider_document || ''}`,
      `CONTRATANTE:${contract.client_name || ''} | DOC:${contract.client_document || ''}`,
      `VALOR_RECORRENTE:${contract.total_value || contract.total_amount || 0} | CICLO:${contract.billing_cycle || 'Mensal'}`,
      `ITENS:${JSON.stringify(items)}`,
      `CLAUSULAS:${clausesText.trim()}`,
      `=== FIM DO DOCUMENTO ===`,
    ].join('\n');

    const documentHash = sha256Node(canonicalDocument);

    // 4. Gerar Hash SHA-256 da Assinatura
    const signaturePayload = [
      `LEGAL_STANDARD:LEI_14063_2020_MP_2200_2`,
      `CONTRACT_ID:${contractId}`,
      `DOCUMENT_SHA256:${documentHash}`,
      `SIGNER_NAME:${signerName.trim().toUpperCase()}`,
      `SIGNER_DOC:${signerDocument.replace(/\D/g, '')}`,
      `SIGNER_EMAIL:${(signerEmail || contract.client_email || '').trim().toLowerCase()}`,
      `SIGNER_PHONE:${(signerPhone || contract.client_phone || '').replace(/\D/g, '')}`,
      `SIGNER_IP:${clientIp}`,
      `SIGNER_PORT:${clientPort}`,
      `TIMESTAMP_UTC:${timestampUtc}`,
      `USER_AGENT:${userAgent}`,
    ].join('##');

    const signatureHash = sha256Node(signaturePayload);

    // 5. Compilar Dossiê Estruturado de Auditoria
    const auditDossier = {
      contractId,
      contractNumber: contract.contract_number || contractId,
      documentHash,
      signatureHash,
      signer: {
        name: signerName.trim(),
        document: signerDocument.trim(),
        email: signerEmail || contract.client_email || '',
        phone: signerPhone || contract.client_phone || '',
        ip: clientIp,
        port: clientPort,
        userAgent,
        timestampUtc,
        authMethod: 'Aceite Eletrônico dos Termos com Verificação Cadastral de Documento e Conexão Segura SSL/TLS',
        legalBasis,
      },
      auditGeneratedAtUtc: timestampUtc,
    };

    // 6. Atualizar o Registro no Banco de Dados
    await db.updateContract(contractId, {
      status: 'signed',
      signed_at: timestampUtc,
      signed_by_name: signerName.trim(),
      signed_by_document: signerDocument.trim(),
      signed_by_email: signerEmail || contract.client_email || '',
      signed_by_phone: signerPhone || contract.client_phone || '',
      signed_by_ip: clientIp,
      signed_by_port: clientPort,
      signed_by_user_agent: userAgent,
      document_hash: documentHash,
      signature_hash: signatureHash,
      signature_method: legalBasis,
      legal_audit_trail: JSON.stringify(auditDossier),
    });

    // 7. Revogar o token público para garantir uso único (não reutilizável)
    if (publicToken) {
      revokePublicAccessToken(publicToken);
    }

    return {
      success: true,
      contractId,
      documentHash,
      signatureHash,
      signedAtUtc: timestampUtc,
      clientIp,
      clientPort,
      userAgent,
      legalBasis,
    };
  } finally {
    exitOp();
  }
}

module.exports = {
  extractClientIp,
  sha256Node,
  handleSignContractServer,
};
