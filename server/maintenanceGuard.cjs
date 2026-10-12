/**
 * Server-Side Maintenance Guard (Versão CommonJS para o Backend API Bridge)
 *
 * Bloqueia operações de escrita concorrentes em rotas e serviços privilegiados
 * durante janelas de migração ou manutenção programada, mesmo quando autenticados
 * com Server API Key (APPWRITE_API_KEY).
 */

class MaintenanceActiveError extends Error {
  constructor(message) {
    super(message || 'Serviço temporariamente indisponível: Janela de manutenção e migração de dados em andamento.');
    this.name = 'MaintenanceActiveError';
    this.statusCode = 503;
    this.retryAfterSeconds = 30;
  }
}

let maintenanceState = {
  active: false,
  lockedAt: null,
  lockedBy: null,
  reason: null,
  drainWindowMs: 5000,
  inFlightRequests: 0,
  phase: 'NORMAL',
};

const writeQueue = [];

function enterPrivilegedOperation() {
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

function assertNotUnderMaintenance(contextName) {
  if (maintenanceState.active) {
    const ctx = contextName ? ` [${contextName}]` : '';
    throw new MaintenanceActiveError(
      `Operação bloqueada pelo Maintenance Guard${ctx}: Janela de migração ativa iniciada em ${maintenanceState.lockedAt} (${maintenanceState.reason || 'Manutenção geral'}).`
    );
  }
}

async function activateMaintenanceMode(options = {}) {
  const drainMs = options.drainWindowMs ?? 5000;
  maintenanceState.active = true;
  maintenanceState.lockedAt = new Date().toISOString();
  maintenanceState.lockedBy = options.lockedBy || 'migration_runner';
  maintenanceState.reason = options.reason || 'Migração de Segurança Multi-Tenant';
  maintenanceState.drainWindowMs = drainMs;
  maintenanceState.phase = 'DRAINING';

  const startTime = Date.now();
  while (maintenanceState.inFlightRequests > 0 && Date.now() - startTime < drainMs) {
    await new Promise((r) => setTimeout(r, 100));
  }

  maintenanceState.phase = 'LOCKED';
  return { ...maintenanceState };
}

function releaseMaintenanceMode() {
  maintenanceState.active = false;
  maintenanceState.lockedAt = null;
  maintenanceState.lockedBy = null;
  maintenanceState.reason = null;
  maintenanceState.phase = 'NORMAL';
  return { ...maintenanceState };
}

function getMaintenanceStatus() {
  return { ...maintenanceState };
}

function enqueueWriteDuringMaintenance(task) {
  const taskId = 'task_' + Math.random().toString(36).substring(2, 10);
  writeQueue.push({
    ...task,
    id: taskId,
    queuedAt: new Date().toISOString(),
  });
  return taskId;
}

function drainWriteQueue() {
  assertNotUnderMaintenance('drainWriteQueue');
  const tasks = [...writeQueue];
  writeQueue.length = 0;
  return tasks;
}

function clearWriteQueue() {
  writeQueue.length = 0;
}

module.exports = {
  MaintenanceActiveError,
  enterPrivilegedOperation,
  assertNotUnderMaintenance,
  activateMaintenanceMode,
  releaseMaintenanceMode,
  getMaintenanceStatus,
  enqueueWriteDuringMaintenance,
  drainWriteQueue,
  clearWriteQueue,
};
