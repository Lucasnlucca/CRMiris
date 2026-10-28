/**
 * ============================================================================
 * CLIENT PORTAL BACKEND HANDLER (CJS)
 * ============================================================================
 * Enforces signed portal session tokens (S04), scrypt password hashing and
 * one-time invite activation (S07), blocks unverified direct charge settlement
 * (S05), paginates/queries directly by ID instead of 100-doc scan (F17), and
 * minimizes exposed client/ticket data (S04).
 * ============================================================================
 */

const { Client, Databases, Query, ID } = require('node-appwrite');
const {
    readJsonBody,
    isUniversalPortalPassword,
    hashPortalPassword,
    verifyPortalPassword,
    signPortalSessionToken,
    verifyPortalSessionToken,
    extractPortalToken,
    sanitizePortalClient
} = require('./requestUtils.cjs');
const {
    issuePublicToken,
    validatePublicAccessToken,
    consumePublicToken
} = require('./publicTokenService.cjs');
const { authenticateAndResolveCaller } = require('./userManagementHandler.cjs');

function sendJson(res, status, data) {
    if (res.headersSent) return;
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id, X-Portal-Token, X-Appwrite-JWT, X-Appwrite-Session'
    });
    res.end(JSON.stringify(data));
}

function getAdminDb(envConfig) {
    const client = new Client()
        .setEndpoint(envConfig.endpoint || 'https://cloud.appwrite.io/v1')
        .setProject(envConfig.projectId)
        .setKey(envConfig.apiKey);
    return new Databases(client);
}

function extractClientPortalMetadata(clientDoc) {
    let parsedNotes = {};
    let parsedSettings = {};
    if (clientDoc && typeof clientDoc.notes === 'string' && clientDoc.notes.trim().startsWith('{')) {
        try { parsedNotes = JSON.parse(clientDoc.notes); } catch { /* ignore */ }
    }
    if (clientDoc && typeof clientDoc.settings_json === 'string' && clientDoc.settings_json.trim().startsWith('{')) {
        try { parsedSettings = JSON.parse(clientDoc.settings_json); } catch { /* ignore */ }
    }

    const portalAccess = (parsedSettings && parsedSettings.portalAccess)
        || (parsedNotes && parsedNotes.portalAccess)
        || {};

    const configuredPassword = String(
        clientDoc.portal_password ||
        clientDoc.password ||
        portalAccess.passwordHash ||
        portalAccess.password ||
        ''
    ).trim();

    const portalEnabled = clientDoc.is_active !== false && portalAccess.enabled !== false && clientDoc.status !== 'inactive';

    return {
        parsedNotes,
        parsedSettings,
        portalAccess,
        configuredPassword,
        portalEnabled
    };
}

async function persistHashedPortalCredential(db, databaseId, clientDoc, passwordHash, parsedNotes, parsedSettings) {
    const nextNotes = { ...(parsedNotes || {}) };
    nextNotes.portalAccess = {
        ...(nextNotes.portalAccess && typeof nextNotes.portalAccess === 'object' ? nextNotes.portalAccess : {}),
        enabled: true,
        passwordHash,
        updatedAt: new Date().toISOString()
    };
    delete nextNotes.portalAccess.password;

    const updatePayload = {
        notes: JSON.stringify(nextNotes)
    };

    if (parsedSettings && Object.keys(parsedSettings).length > 0) {
        const nextSettings = { ...parsedSettings };
        if (nextSettings.portalAccess && typeof nextSettings.portalAccess === 'object') {
            nextSettings.portalAccess = {
                ...nextSettings.portalAccess,
                enabled: true,
                passwordHash,
                updatedAt: new Date().toISOString()
            };
            delete nextSettings.portalAccess.password;
            updatePayload.settings_json = JSON.stringify(nextSettings);
        }
    }

    try {
        await db.updateDocument(databaseId, 'clients', clientDoc.$id, {
            ...updatePayload,
            portal_password: passwordHash
        });
    } catch {
        try {
            await db.updateDocument(databaseId, 'clients', clientDoc.$id, updatePayload);
        } catch {
            // Ignore schema mismatch
        }
    }
}

async function getClientByIdDirect(db, databaseId, clientId) {
    if (!clientId) return null;
    try {
        return await db.getDocument(databaseId, 'clients', clientId);
    } catch {
        try {
            const res = await db.listDocuments(databaseId, 'clients', [Query.equal('$id', clientId), Query.limit(1)]);
            return res.documents[0] || null;
        } catch {
            return null;
        }
    }
}

function sanitizeTicketForPortal(rawTicket) {
    if (!rawTicket || typeof rawTicket !== 'object') return null;
    let publicMessages = [];
    if (typeof rawTicket.messages_json === 'string' && rawTicket.messages_json.trim()) {
        try {
            const parsed = JSON.parse(rawTicket.messages_json);
            if (Array.isArray(parsed)) {
                publicMessages = parsed.filter(m => m && m.internal !== true);
            }
        } catch {
            publicMessages = [];
        }
    }
    return {
        $id: rawTicket.$id,
        id: rawTicket.$id,
        title: rawTicket.title || '',
        description: rawTicket.description || '',
        priority: rawTicket.priority || 'medium',
        status: rawTicket.status || 'open',
        category: rawTicket.category || 'Suporte Geral',
        client_id: rawTicket.client_id || '',
        client_name: rawTicket.client_name || '',
        created_at: rawTicket.created_at || rawTicket.$createdAt || '',
        updated_at: rawTicket.updated_at || rawTicket.$updatedAt || '',
        messages_json: JSON.stringify(publicMessages)
    };
}

/**
 * Validates the signed portal session token and ensures any query/body/header
 * clientId/tenantId/email matches the token claims (S04).
 */
async function authenticatePortalRequest(req, urlObj, body, db, databaseId, envConfig) {
    const rawToken = extractPortalToken(req) || urlObj.searchParams.get('portalToken') || (body && body.portalToken) || '';
    const verification = verifyPortalSessionToken(rawToken, envConfig.apiKey);

    if (!verification.valid || !verification.claims) {
        const err = new Error(verification.error || 'Sessão do portal inválida ou ausente. Faça login novamente.');
        err.statusCode = 401;
        err.code = 'PORTAL_UNAUTHENTICATED';
        throw err;
    }

    const claims = verification.claims;

    const reqClientId = (body && body.clientId) || urlObj.searchParams.get('clientId') || '';
    const reqTenantId = (body && body.tenantId) || urlObj.searchParams.get('tenantId') || req.headers['x-tenant-id'] || '';
    const reqEmail = (body && body.email) || urlObj.searchParams.get('email') || '';

    if (reqClientId && String(reqClientId).trim() !== claims.clientId) {
        const err = new Error('Acesso negado: clientId diverge da sessão autenticada do portal.');
        err.statusCode = 403;
        err.code = 'PORTAL_CLIENT_MISMATCH';
        throw err;
    }

    if (reqTenantId && String(reqTenantId).trim() !== claims.tenantId) {
        const err = new Error('Acesso negado: tenantId diverge da sessão autenticada do portal.');
        err.statusCode = 403;
        err.code = 'PORTAL_TENANT_MISMATCH';
        throw err;
    }

    if (reqEmail && String(reqEmail).trim().toLowerCase() !== claims.email) {
        const err = new Error('Acesso negado: email diverge da sessão autenticada do portal.');
        err.statusCode = 403;
        err.code = 'PORTAL_EMAIL_MISMATCH';
        throw err;
    }

    const clientDoc = await getClientByIdDirect(db, databaseId, claims.clientId);
    if (!clientDoc) {
        const err = new Error('Cliente não encontrado.');
        err.statusCode = 404;
        err.code = 'PORTAL_CLIENT_NOT_FOUND';
        throw err;
    }

    const docTenant = clientDoc.tenant_id || 'default';
    if (docTenant !== claims.tenantId) {
        const err = new Error('Isolamento Multi-Tenant: cliente não pertence ao tenant da sessão.');
        err.statusCode = 403;
        err.code = 'PORTAL_CROSS_TENANT';
        throw err;
    }

    const meta = extractClientPortalMetadata(clientDoc);
    if (!meta.portalEnabled) {
        const err = new Error('Acesso ao portal desativado para este cliente.');
        err.statusCode = 403;
        err.code = 'PORTAL_ACCESS_DISABLED';
        throw err;
    }

    return { claims, clientDoc };
}

async function handlePortalRoutes(req, res, subPath, envConfig) {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
    }

    const db = getAdminDb(envConfig);
    const DATABASE_ID = envConfig.databaseId || 'crm_db';
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    try {
        // ====================================================================
        // 1. POST /api/portal/issue-invite (Authenticated CRM Operator issues 1-time invite)
        // ====================================================================
        if (subPath === '/issue-invite' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const caller = await authenticateAndResolveCaller(req, envConfig);
            const { clientId, tenantId: bodyTenantId, expiresInDays = 7 } = body;

            if (!clientId) {
                return sendJson(res, 400, { success: false, error: 'clientId é obrigatório.' });
            }

            const clientDoc = await getClientByIdDirect(db, DATABASE_ID, String(clientId));
            if (!clientDoc) {
                return sendJson(res, 404, { success: false, error: 'Cliente não encontrado.' });
            }

            const clientTenantId = clientDoc.tenant_id || bodyTenantId || 'default';
            if (!caller.isSuperAdmin && !caller.tenantRoles[clientTenantId]) {
                return sendJson(res, 403, {
                    success: false,
                    error: 'Isolamento Multi-Tenant: Você não possui permissão para gerar convite para este cliente.'
                });
            }

            const issued = issuePublicToken({
                targetType: 'portal_invite',
                targetId: clientDoc.$id,
                tenantId: clientTenantId,
                scope: 'portal_invite',
                expiresInDays: Number(expiresInDays) || 7,
                metadata: {
                    email: (clientDoc.email || '').trim().toLowerCase(),
                    issuedBy: caller.email
                }
            });

            return sendJson(res, 200, {
                success: true,
                inviteToken: issued.token,
                expiresAt: issued.expiresAt,
                clientId: clientDoc.$id,
                tenantId: clientTenantId
            });
        }

        // ====================================================================
        // 2. POST /api/portal/activate (Activate portal account with 1-time inviteToken)
        // ====================================================================
        if (subPath === '/activate' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const { inviteToken, newPassword, password, email } = body;
            const candidatePassword = String(newPassword || password || '').trim();

            if (!inviteToken || !candidatePassword) {
                return sendJson(res, 400, {
                    success: false,
                    error: 'Token de convite (inviteToken) e nova senha são obrigatórios.'
                });
            }

            if (candidatePassword.length < 8 || isUniversalPortalPassword(candidatePassword)) {
                return sendJson(res, 400, {
                    success: false,
                    error: 'A senha deve conter no mínimo 8 caracteres e não pode ser uma senha padrão/universal.'
                });
            }

            const validation = validatePublicAccessToken({
                token: String(inviteToken),
                expectedScope: 'portal_invite'
            });

            if (!validation.valid || !validation.record) {
                return sendJson(res, validation.status || 403, {
                    success: false,
                    code: validation.code,
                    error: validation.error || 'Token de convite inválido ou expirado.'
                });
            }

            const clientDoc = await getClientByIdDirect(db, DATABASE_ID, validation.record.targetId);
            if (!clientDoc) {
                return sendJson(res, 404, { success: false, error: 'Cliente associado ao convite não encontrado.' });
            }

            if (email && String(clientDoc.email || '').trim().toLowerCase() !== String(email).trim().toLowerCase()) {
                return sendJson(res, 403, { success: false, error: 'O e-mail informado não corresponde ao titular do convite.' });
            }

            const consumed = consumePublicToken(String(inviteToken), {
                activatedAt: new Date().toISOString(),
                clientId: clientDoc.$id
            });
            if (!consumed.consumed) {
                return sendJson(res, 410, { success: false, error: 'Este convite já foi utilizado.' });
            }

            const meta = extractClientPortalMetadata(clientDoc);
            const passwordHash = hashPortalPassword(candidatePassword);
            await persistHashedPortalCredential(db, DATABASE_ID, clientDoc, passwordHash, meta.parsedNotes, meta.parsedSettings);

            const resolvedTenantId = clientDoc.tenant_id || validation.record.tenantId || 'default';
            const portalToken = signPortalSessionToken(
                {
                    clientId: clientDoc.$id,
                    tenantId: resolvedTenantId,
                    email: (clientDoc.email || '').trim().toLowerCase()
                },
                envConfig.apiKey
            );

            return sendJson(res, 200, {
                success: true,
                portalToken,
                token: portalToken,
                tenantId: resolvedTenantId,
                client: sanitizePortalClient(clientDoc)
            });
        }

        // ====================================================================
        // 3. POST /api/portal/auth (Authenticate client and issue signed session token)
        // ====================================================================
        if (subPath === '/auth' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const { email, password, inviteToken, tenantId: requestedTenantId } = body;

            if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
                return sendJson(res, 400, { success: false, error: 'E-mail e senha são obrigatórios.' });
            }

            const cleanEmail = email.trim().toLowerCase();
            const cleanPass = password.trim();

            if (isUniversalPortalPassword(cleanPass)) {
                return sendJson(res, 401, {
                    success: false,
                    error: 'Credenciais inválidas ou senha universal não permitida.'
                });
            }

            const queries = [Query.equal('email', cleanEmail), Query.limit(25)];
            if (requestedTenantId && typeof requestedTenantId === 'string' && requestedTenantId.trim()) {
                queries.push(Query.equal('tenant_id', requestedTenantId.trim()));
            }

            const clientsRes = await db.listDocuments(DATABASE_ID, 'clients', queries);
            if (clientsRes.documents.length === 0) {
                return sendJson(res, 401, { success: false, error: 'Cliente não encontrado ou credenciais inválidas.' });
            }

            let matchedClient = null;
            let sawDisabledPortal = false;
            let sawUnactivatedPortal = false;

            for (const candidateDoc of clientsRes.documents) {
                const meta = extractClientPortalMetadata(candidateDoc);
                if (!meta.portalEnabled) {
                    sawDisabledPortal = true;
                    continue;
                }

                if (!meta.configuredPassword) {
                    if (inviteToken && typeof inviteToken === 'string') {
                        const tokenCheck = validatePublicAccessToken({
                            token: inviteToken,
                            expectedScope: 'portal_invite',
                            expectedTargetId: candidateDoc.$id,
                            expectedTenantId: candidateDoc.tenant_id || 'default'
                        });
                        if (tokenCheck.valid) {
                            const consumed = consumePublicToken(inviteToken, {
                                clientId: candidateDoc.$id,
                                activatedEmail: cleanEmail
                            });
                            if (consumed.consumed) {
                                const newHash = hashPortalPassword(cleanPass);
                                await persistHashedPortalCredential(
                                    db,
                                    DATABASE_ID,
                                    candidateDoc,
                                    newHash,
                                    meta.parsedNotes,
                                    meta.parsedSettings
                                );
                                matchedClient = candidateDoc;
                                break;
                            }
                        }
                    }
                    sawUnactivatedPortal = true;
                    continue;
                }

                const verification = verifyPortalPassword(cleanPass, meta.configuredPassword);
                if (verification.valid) {
                    matchedClient = candidateDoc;
                    if (verification.needsUpgrade) {
                        const upgradedHash = hashPortalPassword(cleanPass);
                        await persistHashedPortalCredential(
                            db,
                            DATABASE_ID,
                            candidateDoc,
                            upgradedHash,
                            meta.parsedNotes,
                            meta.parsedSettings
                        );
                    }
                    break;
                }
            }

            if (!matchedClient) {
                if (sawDisabledPortal) {
                    return sendJson(res, 403, {
                        success: false,
                        error: 'O acesso ao portal está desativado para esta conta.'
                    });
                }
                if (sawUnactivatedPortal) {
                    return sendJson(res, 401, {
                        success: false,
                        error: 'Acesso ao portal ainda não ativado. Utilize um token de convite válido para definir sua senha.'
                    });
                }
                return sendJson(res, 401, {
                    success: false,
                    error: 'E-mail ou senha incorretos.'
                });
            }

            const resolvedTenantId = matchedClient.tenant_id || 'default';
            const portalToken = signPortalSessionToken(
                {
                    clientId: matchedClient.$id,
                    tenantId: resolvedTenantId,
                    email: cleanEmail
                },
                envConfig.apiKey
            );

            return sendJson(res, 200, {
                success: true,
                portalToken,
                token: portalToken,
                tenantId: resolvedTenantId,
                client: sanitizePortalClient(matchedClient)
            });
        }

        // ====================================================================
        // 4. POST /api/portal/charges/pay — BLOCKED (S05)
        // ====================================================================
        if (subPath === '/charges/pay' && req.method === 'POST') {
            return sendJson(res, 403, {
                success: false,
                code: 'PORTAL_DIRECT_CHARGE_SETTLEMENT_FORBIDDEN',
                error: 'Baixa direta de cobrança pelo portal não é permitida. O status é atualizado exclusivamente via confirmação autenticada do gateway ou operador financeiro autorizado.'
            });
        }

        // ====================================================================
        // 5. GET /api/portal or GET /api/portal/data (Requires signed portalToken)
        // ====================================================================
        if ((subPath === '' || subPath === '/' || subPath === '/data') && req.method === 'GET') {
            const { claims, clientDoc } = await authenticatePortalRequest(req, urlObj, {}, db, DATABASE_ID, envConfig);
            const targetClientId = claims.clientId;
            const targetTenantId = claims.tenantId;

            const safeList = async (col, queries = []) => {
                try {
                    const r = await db.listDocuments(DATABASE_ID, col, queries);
                    return r.documents;
                } catch {
                    return [];
                }
            };

            const tenantFilter = [Query.equal('tenant_id', targetTenantId), Query.limit(100)];
            const clientTenantFilter = [
                Query.equal('tenant_id', targetTenantId),
                Query.equal('client_id', targetClientId),
                Query.limit(100)
            ];

            const [chargesRaw, ticketsRaw, projectsRaw, docsRaw, invoicesRaw, articlesRaw] = await Promise.all([
                safeList('charges', clientTenantFilter),
                safeList('support_tickets', clientTenantFilter),
                safeList('projects', clientTenantFilter),
                safeList('client_documents', clientTenantFilter),
                safeList('invoices', clientTenantFilter),
                safeList('kb_articles', tenantFilter)
            ]);

            const clientDisplayName = (clientDoc.name || clientDoc.company || '').toLowerCase();

            const charges = chargesRaw.filter(
                c => c.tenant_id === targetTenantId && (c.client_id === targetClientId || (clientDisplayName && (c.client_name || '').toLowerCase() === clientDisplayName))
            );
            const tickets = ticketsRaw
                .filter(t => t.tenant_id === targetTenantId && (t.client_id === targetClientId || (clientDisplayName && (t.client_name || '').toLowerCase() === clientDisplayName)))
                .map(sanitizeTicketForPortal)
                .filter(Boolean);
            const projects = projectsRaw.filter(
                p => p.tenant_id === targetTenantId && (p.client_id === targetClientId || (clientDisplayName && (p.client || '').toLowerCase() === clientDisplayName))
            );
            const documents = docsRaw.filter(
                d => d.tenant_id === targetTenantId && (d.client_id === targetClientId || (clientDisplayName && (d.client || '').toLowerCase() === clientDisplayName))
            );
            const invoices = invoicesRaw.filter(
                i => i.tenant_id === targetTenantId && (i.client_id === targetClientId || (clientDisplayName && (i.client || '').toLowerCase() === clientDisplayName))
            );
            const kbArticles = articlesRaw.filter(a => a.status === 'published' || !a.status);

            return sendJson(res, 200, {
                success: true,
                tenantId: targetTenantId,
                client: sanitizePortalClient(clientDoc),
                charges,
                tickets,
                projects,
                documents,
                invoices,
                kbArticles
            });
        }

        // ====================================================================
        // 6. GET /api/portal/asaas (Requires signed portalToken)
        // ====================================================================
        if (subPath === '/asaas' && req.method === 'GET') {
            const { claims, clientDoc } = await authenticatePortalRequest(req, urlObj, {}, db, DATABASE_ID, envConfig);
            try {
                const { getClientPaymentHistory } = require('./asaasService.cjs');
                const history = await getClientPaymentHistory(db, DATABASE_ID, claims.tenantId, {
                    id: clientDoc.$id,
                    email: clientDoc.email,
                    document: clientDoc.document || clientDoc.cnpj || clientDoc.cpf,
                    name: clientDoc.name || clientDoc.company,
                    asaas_id: clientDoc.asaas_id
                });
                return sendJson(res, 200, { success: true, ...history });
            } catch (asaasErr) {
                console.warn('[PortalHandler] Asaas fetch warning:', asaasErr.message);
                return sendJson(res, 200, { success: false, connected: false, payments: [], error: asaasErr.message });
            }
        }

        // ====================================================================
        // 7. GET /api/portal/asaas/pix & /api/portal/asaas/barcode
        // ====================================================================
        if ((subPath === '/asaas/pix' || subPath === '/asaas/barcode') && req.method === 'GET') {
            const { claims, clientDoc } = await authenticatePortalRequest(req, urlObj, {}, db, DATABASE_ID, envConfig);
            const paymentId = urlObj.searchParams.get('paymentId');
            if (!paymentId) {
                return sendJson(res, 400, { success: false, error: 'paymentId é obrigatório.' });
            }

            // Verify ownership of paymentId within client's charges or Asaas customer history
            let ownsPayment = false;
            try {
                const chargesRes = await db.listDocuments(DATABASE_ID, 'charges', [
                    Query.equal('tenant_id', claims.tenantId),
                    Query.equal('client_id', claims.clientId),
                    Query.limit(100)
                ]);
                ownsPayment = chargesRes.documents.some(
                    c => c.$id === paymentId || c.asaas_payment_id === paymentId || c.external_id === paymentId || c.number === paymentId || c.reference === paymentId
                );
            } catch {
                ownsPayment = false;
            }

            const { getAsaasPixQrCode, getAsaasIdentificationField, getClientPaymentHistory } = require('./asaasService.cjs');

            if (!ownsPayment) {
                const history = await getClientPaymentHistory(db, DATABASE_ID, claims.tenantId, {
                    id: clientDoc.$id,
                    email: clientDoc.email,
                    document: clientDoc.document || clientDoc.cnpj || clientDoc.cpf,
                    name: clientDoc.name || clientDoc.company,
                    asaas_id: clientDoc.asaas_id
                });
                ownsPayment = Array.isArray(history.payments) && history.payments.some(p => p.id === paymentId);
            }

            if (!ownsPayment) {
                return sendJson(res, 403, {
                    success: false,
                    error: 'Acesso negado: Esta cobrança não pertence à sua conta.'
                });
            }

            if (subPath === '/asaas/pix') {
                const pix = await getAsaasPixQrCode(db, DATABASE_ID, claims.tenantId, paymentId);
                if (!pix) {
                    return sendJson(res, 404, { success: false, error: 'QR Code PIX indisponível para esta cobrança.', pix: null });
                }
                return sendJson(res, 200, { success: true, pix });
            } else {
                const bankSlip = await getAsaasIdentificationField(db, DATABASE_ID, claims.tenantId, paymentId);
                if (!bankSlip) {
                    return sendJson(res, 404, { success: false, error: 'Linha digitável indisponível para esta cobrança.', bankSlip: null });
                }
                return sendJson(res, 200, { success: true, bankSlip });
            }
        }

        // ====================================================================
        // 8. POST /api/portal/tickets (Requires signed portalToken)
        // ====================================================================
        if (subPath === '/tickets' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const { claims, clientDoc } = await authenticatePortalRequest(req, urlObj, body, db, DATABASE_ID, envConfig);
            const { title, description, priority, category } = body;

            if (!title || typeof title !== 'string' || !title.trim()) {
                return sendJson(res, 400, { success: false, error: 'O título do chamado é obrigatório.' });
            }

            const nowIso = new Date().toISOString();
            const clientDisplayName = clientDoc.name || clientDoc.company || 'Cliente';
            const initialMessages = [
                {
                    id: `msg-${Date.now()}`,
                    sender: clientDisplayName,
                    role: 'client',
                    text: String(description || ''),
                    timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    internal: false
                }
            ];

            const doc = await db.createDocument(DATABASE_ID, 'support_tickets', ID.unique(), {
                title: title.trim(),
                description: String(description || ''),
                priority: priority || 'medium',
                status: 'open',
                category: category || 'Suporte Geral',
                client_id: claims.clientId,
                client_name: clientDisplayName,
                tenant_id: claims.tenantId,
                created_at: nowIso,
                updated_at: nowIso,
                messages_json: JSON.stringify(initialMessages)
            });

            return sendJson(res, 201, { success: true, ticket: sanitizeTicketForPortal(doc) });
        }

        return sendJson(res, 404, { success: false, error: `Portal endpoint not found: ${subPath}` });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        console.error('[PortalHandler] Error:', error.message);
        return sendJson(res, statusCode, {
            success: false,
            code: error.code || 'PORTAL_ERROR',
            error: error.message || 'Erro interno no portal.'
        });
    }
}

module.exports = { handlePortalRoutes };
