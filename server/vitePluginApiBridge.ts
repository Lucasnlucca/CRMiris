/**
 * Plugin do Vite para o Backend API Bridge do CRM
 *
 * Fornece os endpoints de backend (/api/crm/write e /api/contracts/sign)
 * de forma nativa e segura durante o desenvolvimento e execução pelo Vite.
 * Utiliza as credenciais de servidor de forma isolada, sem vazamento para o frontend.
 */

import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import { executeAuthoritativeWrite, writePolicyEngine } from './backendApiBridge';
import { handleAdminPolicyRoutes } from './adminPolicyHandler';
import { GovernancePersistenceAdapter } from './governancePersistenceAdapter';
import { readJsonBody } from './requestUtils';

function getEnvValue(key: string): string {
  if (process.env[key]) return process.env[key]!;
  for (const fileName of ['.env.local', '.env']) {
    try {
      const envFile = path.resolve(process.cwd(), fileName);
      if (fs.existsSync(envFile)) {
        const lines = fs.readFileSync(envFile, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const k = trimmed.slice(0, idx).trim();
            const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (k === key) return v;
          }
        }
      }
    } catch {}
  }
  return '';
}

import { resolveGovernanceConfig, initializeGovernance } from './governanceConfig';

export function crmApiBridgePlugin(): Plugin {
  return {
    name: 'crm-api-bridge-plugin',
    configureServer(server) {
      const endpoint = process.env.VITE_APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_URL || getEnvValue('VITE_APPWRITE_URL') || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1';
      const projectId = process.env.VITE_APPWRITE_PROJECT_ID || getEnvValue('VITE_APPWRITE_PROJECT_ID') || '6a6cac620021f4c64b3f';
      const apiKey = process.env.APPWRITE_API_KEY || getEnvValue('APPWRITE_API_KEY');
      const targetDatabaseId = process.env.GOVERNANCE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || getEnvValue('VITE_APPWRITE_DATABASE_ID') || 'crm_db';
      const isSandbox = targetDatabaseId === 'crm_isolated_test' || targetDatabaseId === 'crm_sandbox_test';

      const viteEnv = {
        ...process.env,
        GOVERNANCE_ENVIRONMENT: process.env.GOVERNANCE_ENVIRONMENT || (isSandbox ? 'sandbox' : 'production'),
        GOVERNANCE_DATABASE_ID: targetDatabaseId,
        ENABLE_SANDBOX_GOVERNANCE_PERSISTENCE: isSandbox
          ? (process.env.ENABLE_SANDBOX_GOVERNANCE_PERSISTENCE || (apiKey ? 'true' : 'false'))
          : 'false',
        ENABLE_PROD_GOVERNANCE_PERSISTENCE: 'false',
      };

      const governanceConfig = resolveGovernanceConfig(viteEnv, { runtime: 'vite' });

      if (apiKey && !writePolicyEngine.persistenceAdapter && !(writePolicyEngine as any).governanceDatabaseId) {
        initializeGovernance(writePolicyEngine, governanceConfig, {
          logPrefix: '[VITE_BRIDGE]',
          createAdapter: (targetDb) => {
            return new GovernancePersistenceAdapter({
              endpoint,
              projectId,
              apiKey,
              databaseId: targetDb,
            });
          },
        }).catch((err) => {
          console.warn('[VITE_BRIDGE] Aviso ao inicializar governança no Vite:', err.message);
        });
      }

      // 1. Endpoints de Governança e Disjuntores SuperAdmin: /api/admin/policy
      server.middlewares.use('/api/admin/policy', async (req, res) => {
        try {
          await handleAdminPolicyRoutes(req, res, writePolicyEngine, {
            ENDPOINT: endpoint,
            PROJECT_ID: projectId,
            API_KEY: apiKey,
            governanceConfig,
          });
        } catch (err: any) {
          const status = err.statusCode || 500;
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message, code: status }));
        }
      });

      // 1.5. Endpoints de Provisionamento e Gestão de Empresas SuperAdmin: /api/admin/tenants
      server.middlewares.use('/api/admin/tenants', async (req, res) => {
        try {
          const { handleTenantProvisioningRoutes } = await import('./tenantProvisioningHandler');
          await handleTenantProvisioningRoutes(req, res, {
            ENDPOINT: endpoint,
            PROJECT_ID: projectId,
            API_KEY: apiKey,
            governanceConfig,
          });
        } catch (err: any) {
          const status = err.statusCode || 500;
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message, code: status }));
        }
      });

      // 1.6. Endpoints de Gestão de Usuários e Convites por Empresa: /api/admin/users
      server.middlewares.use('/api/admin/users', async (req, res) => {
        try {
          const { handleUserManagementRoutes } = await import('./userManagementHandler');
          await handleUserManagementRoutes(req, res, {
            ENDPOINT: endpoint,
            PROJECT_ID: projectId,
            API_KEY: apiKey,
            governanceConfig,
          });
        } catch (err: any) {
          const status = err.statusCode || 500;
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err.message, code: status }));
        }
      });

      // 2. Endpoint de Escrita do CRM: /api/crm/write (S10: Limite estrito de payload)
      server.middlewares.use('/api/crm/write', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Método não permitido. Utilize POST.' }));
          return;
        }

        try {
          const body = await readJsonBody(req, { maxBytes: 512 * 1024, timeoutMs: 15000 });

          const result = await executeAuthoritativeWrite({
            headers: req.headers,
            socket: req.socket,
            body,
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (err: any) {
          const status = err.statusCode || err.code || 500;
          res.statusCode =
            typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: false,
              error: err.message || 'Erro interno no Backend API Bridge.',
              code: res.statusCode,
            })
          );
        }
      });
    },
  };
}
