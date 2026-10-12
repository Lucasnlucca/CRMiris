/**
 * Plugin do Vite para o Backend API Bridge do CRM
 *
 * Fornece os endpoints de backend (/api/crm/write e /api/contracts/sign)
 * de forma nativa e segura durante o desenvolvimento e execução pelo Vite.
 * Utiliza as credenciais de servidor de forma isolada, sem vazamento para o frontend.
 */

import type { Plugin } from 'vite';
import { executeAuthoritativeWrite } from './backendApiBridge';

export function crmApiBridgePlugin(): Plugin {
  return {
    name: 'crm-api-bridge-plugin',
    configureServer(server) {
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
