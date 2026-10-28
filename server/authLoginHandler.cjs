/**
 * ============================================================================
 * UNIFIED AUTH LOGIN PROXY HANDLER (CJS)
 * ============================================================================
 * Handles POST /api/auth/login on the server side to:
 * 1. Perform Appwrite Email/Password session creation without browser CORS/429 issues
 * 2. Issue a valid JWT for the authenticated CRM user
 * 3. Securely fallback to Client Portal authentication ONLY when the user has a
 *    dedicated, non-universal hashed portal credential (or valid 1-time invite token)
 *    and active portal access (S03, S04, S07, S10).
 * ============================================================================
 */

const { Client, Databases, Query } = require('node-appwrite');
const {
    readJsonBody,
    isUniversalPortalPassword,
    hashPortalPassword,
    verifyPortalPassword,
    signPortalSessionToken,
    sanitizePortalClient
} = require('./requestUtils.cjs');
const {
    validatePublicAccessToken,
    consumePublicToken
} = require('./publicTokenService.cjs');

function sendJson(res, status, data) {
    if (res.headersSent) return;
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Appwrite-JWT, X-Appwrite-Session, X-Portal-Token'
    });
    res.end(JSON.stringify(data));
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

async function persistHashedPortalCredential(adminDb, databaseId, clientDoc, passwordHash, parsedNotes, parsedSettings) {
    // Scrub plaintext password from notes/settings_json while storing scrypt hash
    const nextNotes = { ...(parsedNotes || {}) };
    if (nextNotes.portalAccess && typeof nextNotes.portalAccess === 'object') {
        nextNotes.portalAccess = {
            ...nextNotes.portalAccess,
            enabled: true,
            passwordHash,
            updatedAt: new Date().toISOString()
        };
        delete nextNotes.portalAccess.password;
    } else {
        nextNotes.portalAccess = {
            enabled: true,
            passwordHash,
            updatedAt: new Date().toISOString()
        };
    }

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
        await adminDb.updateDocument(databaseId, 'clients', clientDoc.$id, {
            ...updatePayload,
            portal_password: passwordHash
        });
    } catch {
        try {
            await adminDb.updateDocument(databaseId, 'clients', clientDoc.$id, updatePayload);
        } catch {
            // Ignore schema mismatch if notes field is constrained
        }
    }
}

async function handleAuthLoginRoute(req, res, envConfig) {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return true;
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { success: false, error: 'Method not allowed' });
        return true;
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch (e) {
        sendJson(res, e.statusCode || 400, { success: false, error: e.message || 'Corpo JSON inválido.' });
        return true;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        sendJson(res, 400, { success: false, error: 'Corpo JSON deve ser um objeto válido.' });
        return true;
    }

    const { email, password, inviteToken, tenantId: requestedTenantId } = body;
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        sendJson(res, 400, { success: false, error: 'E-mail e senha são obrigatórios.' });
        return true;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    const endpoint = (envConfig.endpoint || 'https://cloud.appwrite.io/v1').replace(/\/$/, '');
    const projectId = envConfig.projectId;
    const apiKey = envConfig.apiKey;
    const databaseId = envConfig.databaseId || 'crm_db';

    // =========================================================================
    // 1. ATTEMPT APPWRITE AUTH (CRM USER / ADMIN / AGENT)
    // =========================================================================
    try {
        const sessionRes = await fetch(`${endpoint}/account/sessions/email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Appwrite-Project': projectId,
                'X-Fallback-Cookies': 'true'
            },
            body: JSON.stringify({ email: cleanEmail, password: cleanPass })
        });

        const setCookieHeader = sessionRes.headers.get('set-cookie') || '';
        const fallbackHeader = sessionRes.headers.get('x-fallback-cookies') || '';
        const sessionData = await sessionRes.json().catch(() => ({}));

        if (sessionRes.ok && sessionData && sessionData.$id) {
            let sessionSecret = sessionData.secret || '';

            if (!sessionSecret && fallbackHeader) {
                try {
                    const parsedCookies = JSON.parse(fallbackHeader);
                    const cookieKey = `a_session_${projectId}`;
                    sessionSecret = parsedCookies[cookieKey] || parsedCookies[`${cookieKey}_legacy`] || Object.values(parsedCookies)[0] || '';
                } catch { /* ignore */ }
            }

            if (!sessionSecret && setCookieHeader) {
                const match = setCookieHeader.match(new RegExp(`a_session_${projectId}(?:_legacy)?=([^;]+)`));
                if (match && match[1]) {
                    sessionSecret = match[1];
                }
            }

            let jwtToken = '';
            let userAccount = null;

            const authHeaders = {
                'Content-Type': 'application/json',
                'X-Appwrite-Project': projectId
            };
            if (sessionSecret) {
                authHeaders['Cookie'] = `a_session_${projectId}=${sessionSecret}; a_session_${projectId}_legacy=${sessionSecret}`;
                authHeaders['X-Fallback-Cookies'] = JSON.stringify({ [`a_session_${projectId}`]: sessionSecret });
            }

            try {
                const accRes = await fetch(`${endpoint}/account`, { headers: authHeaders });
                if (accRes.ok) {
                    userAccount = await accRes.json();
                }

                const jwtRes = await fetch(`${endpoint}/account/jwts`, {
                    method: 'POST',
                    headers: authHeaders
                });
                if (jwtRes.ok) {
                    const jwtData = await jwtRes.json();
                    jwtToken = jwtData.jwt || '';
                }
            } catch (e) {
                console.warn('[AuthLoginHandler] Warning fetching account/JWT after session creation:', e.message);
            }

            // S11: Block globally deactivated Appwrite user accounts
            if (userAccount && userAccount.status === false) {
                sendJson(res, 403, {
                    success: false,
                    error: 'Sua conta encontra-se desativada. Entre em contato com o administrador.'
                });
                return true;
            }

            sendJson(res, 200, {
                success: true,
                type: 'crm',
                sessionId: sessionData.$id,
                sessionSecret,
                jwt: jwtToken,
                user: userAccount || {
                    $id: sessionData.userId,
                    email: cleanEmail
                }
            });
            return true;
        }

        // S03: Never create sessions via admin bypass on 429; propagate rate-limit error
        if (sessionRes.status === 429) {
            sendJson(res, 429, {
                success: false,
                error: 'Muitas tentativas de login seguidas no servidor de autenticação. Aguarde 1 minuto e tente novamente.'
            });
            return true;
        }
    } catch (err) {
        console.warn('[AuthLoginHandler] Appwrite session fetch error:', err.message);
    }

    // =========================================================================
    // 2. SECURE FALLBACK TO CLIENT PORTAL AUTHENTICATION (S04, S07)
    // =========================================================================
    if (!apiKey) {
        sendJson(res, 401, {
            success: false,
            error: 'Credenciais inválidas. Verifique seu e-mail e senha.'
        });
        return true;
    }

    if (isUniversalPortalPassword(cleanPass)) {
        sendJson(res, 401, {
            success: false,
            error: 'Credenciais inválidas ou senha universal não permitida.'
        });
        return true;
    }

    try {
        const adminClient = new Client()
            .setEndpoint(endpoint)
            .setProject(projectId)
            .setKey(apiKey);
        const adminDb = new Databases(adminClient);

        const queries = [Query.equal('email', cleanEmail), Query.limit(25)];
        if (requestedTenantId && typeof requestedTenantId === 'string' && requestedTenantId.trim()) {
            queries.push(Query.equal('tenant_id', requestedTenantId.trim()));
        }

        const clientsRes = await adminDb.listDocuments(databaseId, 'clients', queries);

        if (clientsRes.documents.length > 0) {
            // Find matching active client record
            let matchedClient = null;
            let needsHashUpgrade = false;

            for (const candidateDoc of clientsRes.documents) {
                const meta = extractClientPortalMetadata(candidateDoc);
                if (!meta.portalEnabled) {
                    continue;
                }

                if (!meta.configuredPassword) {
                    // S04/S07: Only allow setting initial password with a valid one-time inviteToken
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
                                    adminDb,
                                    databaseId,
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
                    continue;
                }

                const verification = verifyPortalPassword(cleanPass, meta.configuredPassword);
                if (verification.valid) {
                    matchedClient = candidateDoc;
                    needsHashUpgrade = verification.needsUpgrade;
                    if (needsHashUpgrade) {
                        const upgradedHash = hashPortalPassword(cleanPass);
                        await persistHashedPortalCredential(
                            adminDb,
                            databaseId,
                            candidateDoc,
                            upgradedHash,
                            meta.parsedNotes,
                            meta.parsedSettings
                        );
                    }
                    break;
                }
            }

            if (matchedClient) {
                const resolvedTenantId = matchedClient.tenant_id || 'default';
                const portalToken = signPortalSessionToken(
                    {
                        clientId: matchedClient.$id,
                        tenantId: resolvedTenantId,
                        email: cleanEmail
                    },
                    apiKey
                );

                sendJson(res, 200, {
                    success: true,
                    type: 'portal',
                    portalToken,
                    token: portalToken,
                    tenantId: resolvedTenantId,
                    client: sanitizePortalClient(matchedClient)
                });
                return true;
            }
        }
    } catch (portalErr) {
        console.warn('[AuthLoginHandler] Client portal lookup error:', portalErr.message);
    }

    sendJson(res, 401, {
        success: false,
        error: 'Credenciais inválidas. Verifique seu e-mail e senha.'
    });
    return true;
}

module.exports = { handleAuthLoginRoute };
