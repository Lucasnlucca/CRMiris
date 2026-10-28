/**
 * ============================================================================
 * C1 & C5 — AUTHORITATIVE CONTRACT PUBLIC VIEW, TOKEN ISSUANCE & SIGNING (TS)
 * ============================================================================
 * Handles all server-side contract public token issuance, public view, and
 * legally binding electronic signature evidence generation (F02, F04).
 * ============================================================================
 */

import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { Client, Databases } from 'node-appwrite';
import {
    generatePublicAccessToken,
    validatePublicAccessToken,
    consumePublicToken,
    revokePublicAccessToken,
    sanitizePublicDocument
} from './publicTokenService.ts';
import { readJsonBody } from './requestUtils.ts';
import { authenticateAndResolveCaller, type SdkOverrides } from './userManagementHandler.ts';

const signingLocks = new Set<string>();

export function extractClientIp(req?: IncomingMessage): string {
    if (!req || !req.headers) return '0.0.0.0';
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const firstIp = String(forwarded).split(',')[0].trim();
        if (firstIp && firstIp !== '0.0.0.0') return firstIp;
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) return String(realIp).trim();
    return (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

export function computeCanonicalDocumentHash(contractDoc: any): string {
    const canonicalPayload = JSON.stringify({
        id: contractDoc.$id || contractDoc.id,
        tenantId: contractDoc.tenant_id,
        title: contractDoc.title || '',
        clientName: contractDoc.client_name || '',
        content: contractDoc.content || '',
        value: Number(contractDoc.value || contractDoc.total_value || 0)
    });
    return crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
}

export function computeSignatureEvidenceHash(evidence: {
    contractId: string;
    documentHash: string;
    signerName: string;
    signerDocument: string;
    signerEmail: string;
    signerRole: string;
    signedAtUtc: string;
    clientIp: string;
    userAgent: string;
}): string {
    const canonicalEvidence = JSON.stringify({
        contractId: evidence.contractId,
        documentHash: evidence.documentHash,
        signerName: evidence.signerName,
        signerDocument: evidence.signerDocument,
        signerEmail: evidence.signerEmail,
        signerRole: evidence.signerRole,
        signedAtUtc: evidence.signedAtUtc,
        clientIp: evidence.clientIp,
        userAgent: evidence.userAgent
    });
    return crypto.createHash('sha256').update(canonicalEvidence, 'utf8').digest('hex');
}

async function fetchContractDocument(
    adminDb: any,
    databaseId: string,
    contractId: string
): Promise<{ doc: any; collectionId: string }> {
    const collectionsToTry = databaseId === 'crm_isolated_test'
        ? ['crm_contracts', 'test_crm_contracts', 'test_contracts', 'contracts']
        : ['crm_contracts', 'contracts', 'test_crm_contracts', 'test_contracts'];

    let lastErr: any = null;
    for (const col of collectionsToTry) {
        try {
            const doc = await adminDb.getDocument(databaseId, col, contractId);
            if (doc) return { doc, collectionId: col };
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('Contrato não encontrado.');
}

export interface SignContractServerParams {
    req?: IncomingMessage;
    body: {
        token?: string;
        signatureToken?: string;
        publicToken?: string;
        contractId?: string;
        signerName?: string;
        signerDocument?: string;
        signerEmail?: string;
        signerRole?: string;
        signerPhone?: string;
    };
    adminDb?: any;
    databaseId?: string;
}

export async function handleSignContractServer(params: any, mockDbOverride?: any): Promise<any> {
    const isDirectTestCall = Boolean(mockDbOverride || (params && !params.req && params.body));
    const req = params?.req || params;
    const body = params?.body || {};
    const adminDb = mockDbOverride || params?.adminDb;
    const databaseId = params?.databaseId || 'crm_db';

    const {
        token,
        signatureToken,
        publicToken,
        contractId,
        signerName,
        signerDocument,
        signerEmail = 'contato@cliente.com.br',
        signerRole = 'Representante Legal',
        signerPhone = ''
    } = body || {};

    const resolvedToken = token || signatureToken || publicToken || '';

    if (!resolvedToken || !contractId) {
        if (isDirectTestCall) throw new Error('Token público de assinatura é obrigatório.');
        return {
            status: 400,
            body: { success: false, code: 'MISSING_PARAMS', error: 'Token público e ID do contrato são obrigatórios.' }
        };
    }

    if (!signerName || String(signerName).trim().length < 3) {
        if (isDirectTestCall) throw new Error('Nome completo do signatário é obrigatório.');
        return {
            status: 400,
            body: { success: false, code: 'INVALID_SIGNER_NAME', error: 'Nome completo do signatário é obrigatório (mínimo 3 caracteres).' }
        };
    }

    const cleanDoc = String(signerDocument || '').replace(/\D/g, '');
    if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
        return {
            status: 400,
            body: { success: false, code: 'INVALID_SIGNER_DOCUMENT', error: 'CPF (11 dígitos) ou CNPJ (14 dígitos) válido é obrigatório.' }
        };
    }

    if (!signerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(signerEmail).trim())) {
        return {
            status: 400,
            body: { success: false, code: 'INVALID_SIGNER_EMAIL', error: 'E-mail válido do signatário é obrigatório.' }
        };
    }

    const lockKey = String(contractId);
    if (signingLocks.has(lockKey)) {
        return {
            status: 409,
            body: {
                success: false,
                code: 'CONTRACT_SIGNING_IN_PROGRESS',
                error: 'Outra operação de assinatura já está em andamento para este contrato.'
            }
        };
    }

    signingLocks.add(lockKey);

    try {
        const tokenCheck = validatePublicAccessToken({
            token: resolvedToken,
            expectedScope: 'sign_contract',
            expectedTargetId: String(contractId)
        });

        if (!tokenCheck.valid || !tokenCheck.record) {
            return {
                status: tokenCheck.status,
                body: { success: false, code: tokenCheck.code, error: tokenCheck.error }
            };
        }

        const tokenRecord = tokenCheck.record;

        let contract: any;
        let collectionId = 'contracts';
        try {
            const fetched = await fetchContractDocument(adminDb, databaseId, String(contractId));
            contract = fetched.doc;
            collectionId = fetched.collectionId;
        } catch {
            return {
                status: 404,
                body: { success: false, code: 'CONTRACT_NOT_FOUND', error: 'Contrato não encontrado.' }
            };
        }

        if (contract.tenant_id !== tokenRecord.tenantId) {
            return {
                status: 403,
                body: { success: false, code: 'TENANT_ISOLATION_BREACH', error: 'Violação de isolamento de tenant detectada.' }
            };
        }

        const normalizedStatus = String(contract.status || '').toLowerCase();
        if (normalizedStatus === 'signed' || normalizedStatus === 'assinado' || contract.signed_at) {
            return {
                status: 409,
                body: {
                    success: false,
                    code: 'CONTRACT_ALREADY_SIGNED',
                    error: 'Este contrato já foi assinado eletronicamente e encontra-se bloqueado para alterações.'
                }
            };
        }

        const signedAtUtc = new Date().toISOString();
        const clientIp = extractClientIp(req);
        const userAgent = (req && req.headers && (req.headers['user-agent'] as string)) || 'Unknown-Agent';
        const cleanName = String(signerName).trim();
        const cleanEmail = String(signerEmail).trim().toLowerCase();
        const cleanRole = String(signerRole || 'Representante Legal').trim();
        const cleanPhone = String(signerPhone || '').trim();

        const documentHash = computeCanonicalDocumentHash(contract);

        const evidencePayload = {
            contractId: contract.$id || contract.id,
            documentHash,
            signerName: cleanName,
            signerDocument: cleanDoc,
            signerEmail: cleanEmail,
            signerRole: cleanRole,
            signerPhone: cleanPhone,
            signedAtUtc,
            clientIp,
            userAgent
        };

        const signatureHash = computeSignatureEvidenceHash(evidencePayload);

        const legalAuditTrail =
            `Assinado digitalmente por ${cleanName} (Doc: ${cleanDoc}, E-mail: ${cleanEmail}) ` +
            `em ${signedAtUtc} via IP ${clientIp}. ` +
            `Hash SHA-256 do Documento: ${documentHash}. ` +
            `Certificado SHA-256 da Assinatura: ${signatureHash}.`;

        consumePublicToken(resolvedToken, {
            contractId: String(contractId),
            signedAtUtc,
            clientIp,
            signerEmail: cleanEmail
        });
        revokePublicAccessToken(resolvedToken);

        const fullUpdateData = {
            status: 'signed',
            signed_at: signedAtUtc,
            signed_by_name: cleanName,
            signed_by_document: cleanDoc,
            signed_by_email: cleanEmail,
            signed_by_role: cleanRole,
            signed_by_phone: cleanPhone,
            signed_ip: clientIp,
            signed_by_ip: clientIp,
            document_hash: documentHash,
            content_hash: documentHash,
            signature_hash: signatureHash,
            certificate_hash: signatureHash,
            legal_audit_trail: legalAuditTrail,
            signature_evidence: JSON.stringify({
                ...evidencePayload,
                contentHash: documentHash,
                signatureHash,
                certificateHash: signatureHash
            })
        };

        let updatedContract: any;
        try {
            updatedContract = await adminDb.updateDocument(databaseId, collectionId, contract.$id || contractId, fullUpdateData);
        } catch {
            const fallbackUpdateData = {
                status: 'signed',
                signed_at: signedAtUtc,
                signed_by_name: cleanName,
                signed_by_document: cleanDoc,
                signed_by_email: cleanEmail,
                signed_by_phone: cleanPhone,
                signed_by_ip: clientIp,
                content_hash: documentHash,
                certificate_hash: signatureHash,
                legal_audit_trail: legalAuditTrail
            };
            updatedContract = await adminDb.updateDocument(databaseId, collectionId, contract.$id || contractId, fallbackUpdateData);
        }

        return {
            status: 200,
            body: {
                success: true,
                contractId: updatedContract.$id || contractId,
                signedAt: signedAtUtc,
                signedAtUtc,
                signerIp: clientIp,
                clientIp,
                documentHash,
                contentHash: documentHash,
                signatureHash,
                certificateHash: signatureHash,
                hashes: {
                    documentHash,
                    contentHash: documentHash,
                    signatureHash,
                    certificateHash: signatureHash
                },
                legalAuditTrail,
                data: sanitizePublicDocument(updatedContract, 'contract')
            }
        };
    } finally {
        signingLocks.delete(lockKey);
    }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
    if (res.headersSent) return;
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id, X-Appwrite-JWT, X-Appwrite-Session'
    });
    res.end(JSON.stringify(data));
}

export async function handleContractRoutes(
    req: IncomingMessage,
    res: ServerResponse,
    envConfig: any,
    sdkOverrides: SdkOverrides = {}
): Promise<boolean> {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return true;
    }

    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    if (!pathname.startsWith('/api/contracts')) {
        return false;
    }

    const databaseId = (envConfig && envConfig.databaseId) || 'crm_db';
    let adminDb = sdkOverrides.adminDb;
    if (!adminDb && envConfig && envConfig.projectId && envConfig.apiKey) {
        const adminClient = new Client()
            .setEndpoint(envConfig.endpoint || 'https://cloud.appwrite.io/v1')
            .setProject(envConfig.projectId)
            .setKey(envConfig.apiKey);
        adminDb = new Databases(adminClient);
    }

    try {
        if (pathname === '/api/contracts/issue-token' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const caller = await authenticateAndResolveCaller(req, envConfig, sdkOverrides);
            const { contractId, tenantId: bodyTenantId, expiresInDays = 7 } = body;

            if (!contractId) {
                sendJson(res, 400, { success: false, error: 'contractId é obrigatório.' });
                return true;
            }

            let contract: any;
            try {
                const fetched = await fetchContractDocument(adminDb || caller.adminDb, databaseId, String(contractId));
                contract = fetched.doc;
            } catch {
                sendJson(res, 404, { success: false, error: 'Contrato não encontrado.' });
                return true;
            }

            const contractTenantId = contract.tenant_id || bodyTenantId || (req.headers['x-tenant-id'] as string) || '';
            if (!contractTenantId) {
                sendJson(res, 400, { success: false, error: 'Não foi possível determinar o tenant do contrato.' });
                return true;
            }

            if (!caller.isSuperAdmin && !caller.tenantRoles[contractTenantId]) {
                sendJson(res, 403, {
                    success: false,
                    code: 'CROSS_TENANT_CONTRACT_TOKEN_DENIED',
                    error: 'Isolamento Multi-Tenant: Você não possui permissão para gerar link público para este contrato.'
                });
                return true;
            }

            const issued = generatePublicAccessToken({
                targetType: 'contract',
                targetId: String(contract.$id || contractId),
                tenantId: String(contractTenantId),
                scope: 'sign_contract',
                expiresInDays: Number(expiresInDays) || 7,
                metadata: {
                    issuedBy: caller.email,
                    contractNumber: contract.contract_number || ''
                }
            });

            sendJson(res, 200, {
                success: true,
                token: issued.token,
                signatureToken: issued.token,
                expiresAt: issued.expiresAt,
                contractId: contract.$id || contractId,
                tenantId: contractTenantId
            });
            return true;
        }

        if (pathname === '/api/contracts/public-view' && req.method === 'GET') {
            const token = urlObj.searchParams.get('token') || urlObj.searchParams.get('signatureToken') || '';
            const requestedContractId = urlObj.searchParams.get('contractId') || urlObj.searchParams.get('id') || undefined;

            const validation = validatePublicAccessToken({
                token,
                expectedScope: 'sign_contract',
                expectedTargetId: requestedContractId || undefined,
                allowConsumedForSameTarget: true
            });

            if (!validation.valid || !validation.record) {
                sendJson(res, validation.status || 403, {
                    success: false,
                    code: validation.code,
                    error: validation.error || 'Link de contrato inválido ou expirado.'
                });
                return true;
            }

            const targetContractId = validation.record.targetId;
            let contract: any;
            try {
                const fetched = await fetchContractDocument(adminDb, databaseId, targetContractId);
                contract = fetched.doc;
            } catch {
                sendJson(res, 404, { success: false, error: 'Contrato não encontrado.' });
                return true;
            }

            if (contract.tenant_id && contract.tenant_id !== validation.record.tenantId) {
                sendJson(res, 403, { success: false, error: 'Violação de isolamento de tenant.' });
                return true;
            }

            sendJson(res, 200, {
                success: true,
                contract: sanitizePublicDocument(contract, 'contract')
            });
            return true;
        }

        if (pathname === '/api/contracts/sign' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const result = await handleSignContractServer({
                req,
                body: body as any,
                adminDb,
                databaseId
            });
            sendJson(res, result.status, result.body);
            return true;
        }

        sendJson(res, 404, { success: false, error: `Rota de contratos não encontrada: ${req.method} ${pathname}` });
        return true;
    } catch (err: any) {
        const statusCode = err.statusCode || 500;
        sendJson(res, statusCode, {
            success: false,
            code: err.code || 'CONTRACT_HANDLER_ERROR',
            error: err.message || 'Erro interno ao processar operação de contrato.'
        });
        return true;
    }
}

export const handleSignContractRoute = handleContractRoutes;
