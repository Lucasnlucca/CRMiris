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

function getEnvValue(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const envLocal = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocal)) {
      const lines = fs.readFileSync(envLocal, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          if (k === key) return v;
        }
      }
    }
  } catch {}
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

      // No Vite de desenvolvimento local, a governança é resolvida explicitamente como sandbox
      const viteEnv = {
        ...process.env,
        GOVERNANCE_ENVIRONMENT: process.env.GOVERNANCE_ENVIRONMENT || 'sandbox',
        GOVERNANCE_DATABASE_ID: process.env.GOVERNANCE_DATABASE_ID || 'crm_isolated_test',
        ENABLE_SANDBOX_GOVERNANCE_PERSISTENCE: process.env.ENABLE_SANDBOX_GOVERNANCE_PERSISTENCE || (apiKey ? 'true' : 'false'),
      };

      const governanceConfig = resolveGovernanceConfig(viteEnv, { runtime: 'vite' });

      if (apiKey && !writePolicyEngine.persistenceAdapter) {
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

      // 2. Endpoint de Escrita do CRM: /api/crm/write
      server.middlewares.use('/api/crm/write', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Método não permitido. Utilize POST.' }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            const body = rawBody ? JSON.parse(rawBody) : {};

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
      });
    },
  };
}
