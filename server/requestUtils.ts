/**
 * Utilitários Compartilhados de Requisição e Segurança (TypeScript)
 */

import crypto from 'crypto';
import type { IncomingMessage } from 'http';

export interface ReadJsonBodyOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

/**
 * Lê o corpo da requisição com limite estrito de bytes e timeout de leitura (S10)
 */
export function readJsonBody<T = any>(req: IncomingMessage, options: ReadJsonBodyOptions = {}): Promise<T> {
  const maxBytes = options.maxBytes || 2 * 1024 * 1024; // 2MB padrão
  const timeoutMs = options.timeoutMs || 15000; // 15 segundos

  return new Promise((resolve, reject) => {
    // 1. Verificação antecipada de Content-Length
    const contentLength = parseInt((req.headers['content-length'] as string) || '0', 10);
    if (contentLength > maxBytes) {
      const err: any = new Error(`Payload excede o limite máximo permitido de ${Math.round(maxBytes / 1024 / 1024)}MB.`);
      err.statusCode = 413;
      err.code = 413;
      reject(err);
      return;
    }

    let bytesReceived = 0;
    const chunks: Buffer[] = [];
    let completed = false;

    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        req.destroy();
        const err: any = new Error('Tempo limite de requisição excedido (Timeout).');
        err.statusCode = 408;
        err.code = 408;
        reject(err);
      }
    }, timeoutMs);

    req.on('data', (chunk: Buffer) => {
      if (completed) return;
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        completed = true;
        clearTimeout(timer);
        req.destroy();
        const err: any = new Error(`Payload excede o limite máximo permitido de ${Math.round(maxBytes / 1024 / 1024)}MB.`);
        err.statusCode = 413;
        err.code = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        resolve(parsed as T);
      } catch {
        const err: any = new Error('JSON inválido no corpo da requisição.');
        err.statusCode = 400;
        err.code = 400;
        reject(err);
      }
    });

    req.on('error', (err) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Gera senha temporária criptograficamente segura (S05)
 * Não usa timestamp, IDs ou dados previsíveis.
 */
export function generateSecureTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  const randomBytes = crypto.randomBytes(16);
  let password = 'Iris@';
  for (let i = 0; i < 12; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password + '!';
}
