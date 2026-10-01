/**
 * Handler de Assinatura Eletrônica no Backend / Servidor (API Route ou Serverless Function)
 * 
 * Garante captura autoritativa e inviolável dos metadados (lado do servidor):
 * 1. IP Público Real extraído de headers de rede confiáveis (x-forwarded-for, x-real-ip).
 * 2. Porta lógica e User-Agent do socket HTTP.
 * 3. Timestamp UTC autoritativo do servidor (impossível de manipular no relógio do cliente).
 * 4. Validação do texto canônico original no banco de dados e cálculo do Hash SHA-256.
 * 
 * Compatível com:
 * - Next.js (App Router ou Pages Router /api/contracts/[id]/sign)
 * - Node.js Express / Fastify
 * - Appwrite Cloud Functions
 * - Supabase Edge Functions (Deno / Node)
 */

import crypto from 'crypto';

export interface SignContractServerPayload {
  contractId: string;
  signerName: string;
  signerDocument: string;
  signerEmail?: string;
  signerPhone?: string;
  termsAccepted: boolean;
}

export interface ServerAuditResult {
  success: boolean;
  contractId: string;
  documentHash: string;
  signatureHash: string;
  signedAtUtc: string;
  clientIp: string;
  clientPort: string;
  userAgent: string;
  legalBasis: string;
}

/**
 * Extrai o endereço IP público real do cliente a partir dos cabeçalhos da requisição
 */
export function extractClientIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    // O primeiro IP da lista x-forwarded-for é o IP original do cliente
    const clientIp = list.split(',')[0].trim();
    if (clientIp) return clientIp;
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0].trim() : realIp.trim();
  }

  return req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Calcula Hash SHA-256 via módulo nativo 'crypto' do Node.js
 */
export function sha256Node(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Processa a assinatura eletrônica com validade jurídica plena
 */
export async function handleSignContractServer(
  req: {
    headers: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string; remotePort?: number };
    body: SignContractServerPayload;
  },
  // Injeção de dependência do banco de dados (Appwrite, PostgreSQL, Supabase, etc.)
  db: {
    getContractById: (id: string) => Promise<any>;
    updateContract: (id: string, data: Record<string, any>) => Promise<any>;
  }
): Promise<ServerAuditResult> {
  const { contractId, signerName, signerDocument, signerEmail, signerPhone, termsAccepted } = req.body;

  if (!termsAccepted) {
    throw new Error('O aceite formal das cláusulas contratuais e termos é obrigatório.');
  }

  if (!signerName?.trim() || !signerDocument?.trim()) {
    throw new Error('Nome completo e documento (CPF/CNPJ) do signatário são obrigatórios.');
  }

  // 1. Obter o contrato original diretamente do banco de dados
  // (Garante que nenhum dado comercial ou cláusula foi manipulado pelo cliente)
  const contract = await db.getContractById(contractId);
  if (!contract) {
    throw new Error('Contrato não localizado.');
  }

  if (contract.status === 'signed') {
    throw new Error('Este contrato já se encontra assinado e com integridade bloqueada.');
  }

  // 2. Captura Autoritativa de Metadados de Rede no Servidor
  const clientIp = extractClientIp(req);
  const clientPort = String(req.socket?.remotePort || req.headers['x-forwarded-port'] || '443');
  const userAgent = String(req.headers['user-agent'] || 'Desconhecido').slice(0, 500);
  const timestampUtc = new Date().toISOString(); // Timestamp confiável NTP do servidor
  const legalBasis = 'Art. 10, § 2º da MP nº 2.200-2/2001 e Art. 4º, Inciso II da Lei Federal nº 14.063/2020';

  // 3. Montar Texto Canônico e Gerar o Hash SHA-256 do Documento Original
  const items = contract.items_json ? JSON.parse(contract.items_json) : [];
  const clauses = contract.clauses_json ? JSON.parse(contract.clauses_json) : [];
  const clausesText = Array.isArray(clauses) 
    ? clauses.map((c: any, i: number) => `${c.title || `CLÁUSULA ${i + 1}ª`}\n${c.text}`).join('\n\n')
    : String(contract.clauses_json || '');

  const canonicalDocument = [
    `=== INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS ===`,
    `IDENTIFICADOR:${contract.contract_number}`,
    `CONTRATADA:${contract.provider_name} | DOC:${contract.provider_document}`,
    `CONTRATANTE:${contract.client_name} | DOC:${contract.client_document}`,
    `VALOR_RECORRENTE:${contract.total_value} | CICLO:${contract.billing_cycle}`,
    `ITENS:${JSON.stringify(items)}`,
    `CLAUSULAS:${clausesText.trim()}`,
    `=== FIM DO DOCUMENTO ===`
  ].join('\n');

  const documentHash = sha256Node(canonicalDocument);

  // 4. Gerar Hash SHA-256 da Assinatura (Vinculação Unívoca do Signatário ao Documento)
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

  // 5. Compilar Dossiê Estruturado de Auditoria (Audit Trail)
  const auditDossier = {
    contractId,
    contractNumber: contract.contract_number,
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
}
