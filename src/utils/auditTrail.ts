/**
 * Utilitário de Auditoria e Validade Jurídica de Assinatura Eletrônica
 * Conforme:
 * - Lei Federal nº 14.063/2020 (Assinatura Eletrônica Avançada - Art. 4º, II)
 * - Medida Provisória nº 2.200-2/2001 (Art. 10, § 2º)
 * - Marco Civil da Internet (Lei nº 12.965/2014 - Registro de IPs e Timestamps)
 */

export interface SignerAuditMetadata {
  name: string;
  document: string; // CPF ou CNPJ formatado
  email: string;
  phone: string;
  ip: string;
  port?: string;
  userAgent: string;
  timestampUtc: string;
  timestampLocalFormatted: string;
  authMethod: string;
  legalBasis: string;
}

export interface ContractAuditDossier {
  contractId: string;
  contractNumber: string;
  documentHash: string; // SHA-256 do conteúdo integral do documento
  signatureHash: string; // SHA-256 da assinatura (documento + signatário + metadados)
  signer: SignerAuditMetadata;
  provider: {
    name: string;
    document: string;
    address?: string;
  };
  client: {
    name: string;
    document: string;
    address?: string;
  };
  summary: {
    totalValue: number;
    billingCycle: string;
    itemCount: number;
  };
  auditGeneratedAtUtc: string;
}

/**
 * Constrói o texto canônico e imutável do contrato exatamente como foi aceito,
 * contendo as partes, itens, valores e o corpo das cláusulas contratuais.
 */
export function buildCanonicalDocumentContent(
  contract: {
    contract_number?: string;
    title?: string;
    provider_name?: string;
    provider_document?: string;
    provider_address?: string;
    client_name?: string;
    client_document?: string;
    client_address?: string;
    total_value?: number;
    setup_fee?: number;
    billing_cycle?: string;
  },
  items: Array<{ name: string; qty: number; rate: number; amount?: number; unit?: string; description?: string }>,
  clausesText: string
): string {
  const parts: string[] = [];

  parts.push('=== INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS ===');
  parts.push(`IDENTIFICADOR: ${contract.contract_number || 'N/A'}`);
  parts.push(`TÍTULO: ${contract.title || 'Contrato de Prestação de Serviços'}`);
  parts.push('');
  parts.push('--- CONTRATADA ---');
  parts.push(`Razão Social / Nome: ${contract.provider_name || 'Iris Horizon Soluções Tecnológicas Ltda'}`);
  parts.push(`CNPJ/CPF: ${contract.provider_document || '45.123.456/0001-89'}`);
  parts.push(`Endereço: ${contract.provider_address || ''}`);
  parts.push('');
  parts.push('--- CONTRATANTE ---');
  parts.push(`Razão Social / Nome: ${contract.client_name || ''}`);
  parts.push(`CNPJ/CPF: ${contract.client_document || ''}`);
  parts.push(`Endereço: ${contract.client_address || ''}`);
  parts.push('');
  parts.push('--- CONDIÇÕES COMERCIAIS & VALORES ---');
  parts.push(`Valor Recorrente: R$ ${(contract.total_value || 0).toFixed(2)}`);
  parts.push(`Periodicidade: ${contract.billing_cycle || 'Mensal'}`);
  if (contract.setup_fee && contract.setup_fee > 0) {
    parts.push(`Taxa de Implantação: R$ ${contract.setup_fee.toFixed(2)}`);
  }
  parts.push('');
  parts.push('--- ITENS E SERVIÇOS DISCRIMINADOS ---');
  if (items && items.length > 0) {
    items.forEach((it, idx) => {
      const u = it.unit || 'un';
      const amt = it.amount || it.qty * it.rate;
      parts.push(
        `[${idx + 1}] ${it.name} | Qtd: ${it.qty} ${u} | Valor Unit: R$ ${(it.rate || 0).toFixed(2)} | Subtotal: R$ ${(amt || 0).toFixed(2)}${it.description ? ` (${it.description})` : ''}`
      );
    });
  } else {
    parts.push('Nenhum item discriminado individualmente.');
  }
  parts.push('');
  parts.push('--- CLÁUSULAS CONTRATUAIS INTEGRALMENTE PACTUADAS ---');
  parts.push(clausesText.trim());
  parts.push('');
  parts.push('=== FIM DO CONTEÚDO DO DOCUMENTO ===');

  return parts.join('\n');
}

/**
 * Calcula o hash criptográfico SHA-256 via Web Crypto API nativa (disponível no navegador e Node 16+)
 */
export async function calculateSha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Gera o Hash Criptográfico da Assinatura (Signature Hash)
 * Vincula indissociavelmente o Hash do Documento com as Evidências do Signatário
 */
export async function calculateSignatureHash(
  documentHash: string,
  signer: SignerAuditMetadata,
  contractId: string
): Promise<string> {
  const payload = [
    `LEGAL_STANDARD:LEI_14063_2020_MP_2200_2`,
    `CONTRACT_ID:${contractId}`,
    `DOCUMENT_SHA256:${documentHash}`,
    `SIGNER_NAME:${signer.name.trim().toUpperCase()}`,
    `SIGNER_DOC:${signer.document.replace(/\D/g, '')}`,
    `SIGNER_EMAIL:${signer.email.trim().toLowerCase()}`,
    `SIGNER_PHONE:${signer.phone.replace(/\D/g, '')}`,
    `SIGNER_IP:${signer.ip}`,
    `SIGNER_PORT:${signer.port || 'DEFAULT'}`,
    `TIMESTAMP_UTC:${signer.timestampUtc}`,
    `USER_AGENT:${signer.userAgent}`,
  ].join('##');

  return calculateSha256(payload);
}

/**
 * Tenta obter a porta lógica aproximada do cliente ou informações de rede
 */
export function getClientConnectionPort(): string {
  if (typeof window !== 'undefined' && window.location.port) {
    return window.location.port;
  }
  return '443'; // HTTPS padrão
}

/**
 * Codifica o dossiê de auditoria em string JSON segura para armazenamento em campos de notas/audit
 */
export function encodeAuditDossier(dossier: ContractAuditDossier): string {
  return `[LEGAL_AUDIT_TRAIL: ${JSON.stringify(dossier)}]`;
}

/**
 * Decodifica o dossiê de auditoria gravado no contrato
 */
export function parseAuditDossier(text?: string): ContractAuditDossier | null {
  if (!text) return null;
  const match = text.match(/\[LEGAL_AUDIT_TRAIL:\s*({.+?})\]/s);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]) as ContractAuditDossier;
    } catch {}
  }
  return null;
}
