/**
 * ============================================================================
 * VITE PLUGIN: BACKEND API BRIDGE MIDDLEWARE (Development Server)
 * ============================================================================
 * Mounts `/api/data`, `/api/admin/policies/*`, `/api/admin/tenants/*`,
 * `/api/admin/users/*`, `/api/portal/*`, `/api/asaas/*`, `/api/contracts/*`,
 * `/api/auth/login`, `/api/logos/*`, and `/api/health` directly into Vite's
 * Connect dev server so local development behaves identically to production.
 * ============================================================================
 */

import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { Client, Databases } from 'node-appwrite';
import fs from 'fs';
import path from 'path';
import { handleApiDataRequest, writePolicyEngine } from './backendApiBridge.ts';
import { resolveGovernanceConfig } from './governanceConfig.ts';
import { GovernancePersistenceAdapter } from './governancePersistenceAdapter.ts';
import { handleAdminPolicyRoutes } from './adminPolicyHandler.ts';
import { handleUserManagementRoutes } from './userManagementHandler.ts';
import { handleTenantProvisioningRoutes } from './tenantProvisioningHandler.ts';
import { handlePortalRoutes } from './portalHandler.ts';
import { handleAsaasRoutes } from './asaasHandler.ts';
import { handleAuthLoginRoute } from './authLoginHandler.ts';
import { handleContractRoutes } from './signContractHandler.ts';

export function vitePluginApiBridge(): Plugin {
    return {
        name: 'crm-hydra-api-bridge',
        configureServer(server) {
            const env = loadEnv(server.config.mode, process.cwd(), '');

            const bridgeEnv = {
                endpoint: env.VITE_APPWRITE_URL || env.VITE_APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_URL || process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1',
                ENDPOINT: env.VITE_APPWRITE_URL || env.VITE_APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_URL || process.env.VITE_APPWRITE_ENDPOINT || process.env.APPWRITE_ENDPOINT || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1',
                projectId: env.VITE_APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f',
                PROJECT_ID: env.VITE_APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f',
                apiKey: env.APPWRITE_API_KEY || process.env.APPWRITE_API_KEY || '',
                API_KEY: env.APPWRITE_API_KEY || process.env.APPWRITE_API_KEY || '',
                databaseId: env.VITE_APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || 'crm_db',
                DATABASE_ID: env.VITE_APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || 'crm_db'
            };

            const govConfig = resolveGovernanceConfig({ ...process.env, ...env });
            let persistenceAdapter: GovernancePersistenceAdapter | null = null;

            if (govConfig.status === 'READY' && govConfig.mode === 'PERSISTENT') {
                try {
                    let adminDb: Databases | null = null;
                    if (bridgeEnv.projectId && bridgeEnv.apiKey) {
                        const adminClient = new Client()
                            .setEndpoint(bridgeEnv.endpoint)
                            .setProject(bridgeEnv.projectId)
                            .setKey(bridgeEnv.apiKey);
                        adminDb = new Databases(adminClient);
                    }
                    persistenceAdapter = new GovernancePersistenceAdapter(adminDb, govConfig.targetDb);
                    persistenceAdapter.restoreIntoEngine(writePolicyEngine).catch((err) => {
                        console.warn('[VitePluginApiBridge] Governance restore warning (Fail-Closed activated):', err.message);
                        writePolicyEngine.setMode('enforce', 'system:boot-fail-closed', `Fail-closed activated due to restore error: ${err.message}`, govConfig.targetDb);
                    });
                } catch (e: any) {
                    console.warn('[VitePluginApiBridge] Governance adapter init warning:', e.message);
                }
            }

            server.middlewares.use(async (req, res, next) => {
                if (!req.url) return next();

                try {
                    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
                    const pathname = urlObj.pathname;

                    const sharedEnvConfig = {
                        ...bridgeEnv,
                        governanceConfig: govConfig
                    };

                    if (pathname.startsWith('/api/admin/policies')) {
                        const handled = await handleAdminPolicyRoutes(
                            req,
                            res,
                            writePolicyEngine,
                            sharedEnvConfig,
                            govConfig,
                            persistenceAdapter
                        );
                        if (handled) return;
                    }

                    if (pathname.startsWith('/api/admin/tenants')) {
                        await handleTenantProvisioningRoutes(req, res, sharedEnvConfig);
                        return;
                    }

                    if (pathname.startsWith('/api/admin/users')) {
                        const handled = await handleUserManagementRoutes(
                            req,
                            res,
                            sharedEnvConfig,
                            govConfig
                        );
                        if (handled) return;
                    }

                    if (pathname === '/api/portal' || pathname.startsWith('/api/portal/')) {
                        const subPath = pathname.slice('/api/portal'.length) || '/';
                        await handlePortalRoutes(req, res, subPath, sharedEnvConfig);
                        return;
                    }

                    if (pathname === '/api/asaas' || pathname.startsWith('/api/asaas/')) {
                        const subPath = pathname.slice('/api/asaas'.length) || '/';
                        await handleAsaasRoutes(req, res, subPath, sharedEnvConfig);
                        return;
                    }

                    if (pathname === '/api/contracts' || pathname.startsWith('/api/contracts/')) {
                        const handled = await handleContractRoutes(req, res, sharedEnvConfig);
                        if (handled) return;
                    }

                    if (pathname === '/api/auth/login') {
                        await handleAuthLoginRoute(req, res, sharedEnvConfig);
                        return;
                    }

                    if (pathname.startsWith('/api/logos/') && req.method === 'GET') {
                        let decodedName = '';
                        try {
                            decodedName = decodeURIComponent(pathname.replace('/api/logos/', ''));
                        } catch {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'URI de arquivo malformada.' }));
                            return;
                        }
                        const fileName = path.basename(decodedName);
                        const logoPath = path.resolve(process.cwd(), 'public', 'uploads', 'logos', fileName);
                        if (fs.existsSync(logoPath) && fs.statSync(logoPath).isFile()) {
                            const ext = path.extname(logoPath).toLowerCase();
                            const mimeMap: Record<string, string> = {
                                '.png': 'image/png',
                                '.jpg': 'image/jpeg',
                                '.jpeg': 'image/jpeg',
                                '.webp': 'image/webp',
                                '.svg': 'image/svg+xml'
                            };
                            res.writeHead(200, {
                                'Content-Type': mimeMap[ext] || 'application/octet-stream',
                                'Cache-Control': 'public, max-age=86400'
                            });
                            fs.createReadStream(logoPath).pipe(res);
                            return;
                        }
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Logo not found' }));
                        return;
                    }

                    if (pathname === '/api/health') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            status: 'ok',
                            service: 'crm-hydra-vite-api-bridge',
                            bridgeActive: Boolean(bridgeEnv.projectId && bridgeEnv.apiKey),
                            policyEngineMode: writePolicyEngine.mode,
                            governanceMode: govConfig.mode,
                            timestamp: new Date().toISOString()
                        }));
                        return;
                    }

                    if (pathname === '/api/data') {
                        await handleApiDataRequest(req, res, bridgeEnv);
                        return;
                    }

                    next();
                } catch (err: any) {
                    const statusCode = err?.statusCode || err?.code || 500;
                    const httpStatus = typeof statusCode === 'number' && statusCode >= 100 && statusCode < 600 ? statusCode : 500;
                    if (!res.headersSent) {
                        res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: false,
                            error: err?.message || 'Erro interno no servidor de desenvolvimento.'
                        }));
                    }
                }
            });
        }
    };
}

export { vitePluginApiBridge as crmApiBridgePlugin };
