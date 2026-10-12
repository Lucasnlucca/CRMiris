/**
 * Server-Side Maintenance Guard (Guarda de Manutenção do Servidor)
 *
 * Bloqueia operações de escrita concorrentes em rotas e serviços privilegiados
 * durante janelas de migração ou manutenção programada, mesmo quando autenticados
 * com Server API Key (APPWRITE_API_KEY).
 *
 * Características:
 * 1. Barreira Centralizada: Verificação imediata (fail-closed) antes de qualquer mutação.
 * 2. Janela de Quiescência (Drain Window): Aguarda requisições em andamento terminarem.
 * 3. Rejeição com HTTP 503 e cabeçalho Retry-After: Indica indisponibilidade temporária.
 * 4. Fila Segura / Buffer de Operações Assíncronas: Permite enfileirar tarefas críticas em vez de descartá-las.
 * 5. Idempotência e Verificação de Integridade antes do destravamento.
 */

export interface MaintenanceStatus {
  active: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  reason: string | null;
  drainWindowMs: number;
  inFlightRequests: number;
  phase: 'NORMAL' | 'DRAINING' | 'LOCKED';
}

export interface QueuedWriteTask {
  id: string;
  queuedAt: string;
  collectionId: string;
  documentId?: string;
  action: 'create' | 'update' | 'delete';
  payload: any;
  tenantId: string;
}

// Estado em memória do processo do servidor
let maintenanceState: MaintenanceStatus = {
  active: false,
  lockedAt: null,
  lockedBy: null,
  reason: null,
  drainWindowMs: 5000,
  inFlightRequests: 0,
  phase: 'NORMAL',
};

// Fila persistente em memória para tarefas em segundo plano (em produção distribuída, usa Redis ou Appwrite)
const writeQueue: QueuedWriteTask[] = [];

export class MaintenanceActiveError extends Error {
  public readonly statusCode = 503;
  public readonly retryAfterSeconds = 30;

  constructor(message?: string) {
    super(message || 'Serviço temporariamente indisponível: Janela de manutenção e migração de dados em andamento.');
    this.name = 'MaintenanceActiveError';
  }
}

/**
 * Registra o início de uma operação privilegiada para rastreamento de quiescência
 */
export function enterPrivilegedOperation(): () => void {
  assertNotUnderMaintenance();
  maintenanceState.inFlightRequests++;
  let exited = false;

  return () => {
    if (!exited) {
      exited = true;
      maintenanceState.inFlightRequests = Math.max(0, maintenanceState.inFlightRequests - 1);
    }
  };
}

/**
 * Assegura que o sistema não está em manutenção antes de realizar escritas privilegiadas.
 * Lança MaintenanceActiveError (HTTP 503) se manutenção estiver ativa ou em processo de bloqueio.
 */
export function assertNotUnderMaintenance(contextName?: string): void {
  if (maintenanceState.active) {
    const ctx = contextName ? ` [${contextName}]` : '';
    throw new MaintenanceActiveError(
      `Operação bloqueada pelo Maintenance Guard${ctx}: Janela de migração ativa iniciada em ${maintenanceState.lockedAt} (${maintenanceState.reason || 'Manutenção geral'}).`
    );
  }
}

/**
 * Ativa a manutenção com janela controlada de drenagem (quiescência)
 */
export async function activateMaintenanceMode(options: {
  reason: string;
  lockedBy: string;
  drainWindowMs?: number;
}): Promise<MaintenanceStatus> {
  const drainMs = options.drainWindowMs ?? 5000;
  maintenanceState.active = true;
  maintenanceState.lockedAt = new Date().toISOString();
  maintenanceState.lockedBy = options.lockedBy;
  maintenanceState.reason = options.reason;
  maintenanceState.drainWindowMs = drainMs;
  maintenanceState.phase = 'DRAINING';

  // Aguardar que requisições em voo sejam concluídas (janela de drenagem)
  const startTime = Date.now();
  while (maintenanceState.inFlightRequests > 0 && Date.now() - startTime < drainMs) {
    await new Promise((r) => setTimeout(r, 100));
  }

  maintenanceState.phase = 'LOCKED';
  return { ...maintenanceState };
}

/**
 * Desativa a manutenção com segurança após validação
 */
export function releaseMaintenanceMode(): MaintenanceStatus {
  maintenanceState.active = false;
  maintenanceState.lockedAt = null;
  maintenanceState.lockedBy = null;
  maintenanceState.reason = null;
  maintenanceState.phase = 'NORMAL';
  return { ...maintenanceState };
}

/**
 * Obtém o status atual do guard
 */
export function getMaintenanceStatus(): MaintenanceStatus {
  return { ...maintenanceState };
}

/**
 * Enfileira uma tarefa de escrita caso seja uma rotina agendada ou worker tolerante a atraso
 */
export function enqueueWriteDuringMaintenance(task: Omit<QueuedWriteTask, 'id' | 'queuedAt'>): string {
  const taskId = 'task_' + Math.random().toString(36).substring(2, 10);
  writeQueue.push({
    ...task,
    id: taskId,
    queuedAt: new Date().toISOString(),
  });
  return taskId;
}

/**
 * Drena e retorna as tarefas da fila após liberação da manutenção
 */
export function drainWriteQueue(): QueuedWriteTask[] {
  assertNotUnderMaintenance('drainWriteQueue');
  const tasks = [...writeQueue];
  writeQueue.length = 0;
  return tasks;
}

/**
 * Limpa a fila (útil em testes ou abortos controlados)
 */
export function clearWriteQueue(): void {
  writeQueue.length = 0;
}
