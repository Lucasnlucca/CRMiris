import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Power,
  PauseCircle,
  PlayCircle,
  Lock,
  Unlock,
  RefreshCw,
  Database,
  Building,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  GitBranch,
  LifeBuoy,
  FileText,
  FileCheck2,
  Package,
  BookUser,
  Sparkles,
  Bell,
  Eye,
  Info,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import {
  fetchPolicyStatus,
  toggleGlobalLockdown,
  toggleModulePause,
  toggleGranularRule,
  fetchAdminAuditLogs,
  ModulePolicyStatus,
  AdminAuditLogEntry,
  PolicyStatusResponse,
} from '../lib/adminPolicyApi';

const ICON_MAP: Record<string, React.ElementType> = {
  Users,
  GitBranch,
  LifeBuoy,
  FileText,
  FileCheck2,
  Package,
  BookUser,
  Sparkles,
  Bell,
};

interface SuperAdminPolicyPanelProps {
  onPageChange?: (page: string) => void;
}

export default function SuperAdminPolicyPanel({ onPageChange }: SuperAdminPolicyPanelProps) {
  const { isSuperAdmin, tenant } = useTenant();
  const { user } = useAuth();

  const [databaseId, setDatabaseId] = useState<'crm_isolated_test' | 'crm_db'>('crm_isolated_test');
  const [tenantId, setTenantId] = useState<string>('test_team_alpha');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<PolicyStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Modal de Lockdown
  const [showLockdownModal, setShowLockdownModal] = useState<boolean>(false);
  const [lockdownReason, setLockdownReason] = useState<string>('');

  // Modal de Pausa de Módulo
  const [pauseModalTarget, setPauseModalTarget] = useState<ModulePolicyStatus | null>(null);
  const [modulePauseReason, setModulePauseReason] = useState<string>('');

  // Histórico de auditoria
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'modules' | 'audit'>('modules');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPolicyStatus(databaseId, tenantId);
      setStatusData(data);
      setAuditLogs(data.auditLogs || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados do Write Policy Engine.');
    } finally {
      setLoading(false);
    }
  }, [databaseId, tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Alerta com auto-dismiss
  useEffect(() => {
    if (successNotice) {
      const timer = setTimeout(() => setSuccessNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successNotice]);

  const handleToggleLockdown = async () => {
    if (!statusData) return;
    const nextState = !statusData.globalLockdown;
    setActionLoading('lockdown');
    try {
      const res = await toggleGlobalLockdown(
        nextState,
        lockdownReason || undefined,
        databaseId,
        statusData.stateVersion
      );
      setSuccessNotice(res.message);
      setShowLockdownModal(false);
      setLockdownReason('');
      await loadData();
    } catch (err: any) {
      if (err.statusCode === 409 || err.message?.includes('409') || err.message?.includes('CONCURRENCY_CONFLICT')) {
        setError('⚠️ Conflito de concorrência: O estado de governança foi alterado por outro SuperAdmin. Os dados mais recentes foram recarregados.');
        await loadData();
      } else {
        setError(err.message || 'Erro ao alterar Lockdown Global.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleModulePause = async (mod: ModulePolicyStatus) => {
    const nextPaused = !mod.isPaused;
    if (nextPaused) {
      setPauseModalTarget(mod);
      setModulePauseReason('');
      return;
    }

    // Retomada direta
    setActionLoading(`pause-${mod.activeCollection}`);
    try {
      const res = await toggleModulePause(mod.activeCollection, false, undefined, databaseId, statusData?.stateVersion);
      setSuccessNotice(res.message);
      await loadData();
    } catch (err: any) {
      if (err.statusCode === 409 || err.message?.includes('409') || err.message?.includes('CONCURRENCY_CONFLICT')) {
        setError('⚠️ Conflito de concorrência: O estado de governança foi alterado por outro SuperAdmin. Os dados mais recentes foram recarregados.');
        await loadData();
      } else {
        setError(err.message || 'Erro ao pausar/retomar módulo.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const confirmModulePause = async () => {
    if (!pauseModalTarget) return;
    setActionLoading(`pause-${pauseModalTarget.activeCollection}`);
    try {
      const res = await toggleModulePause(
        pauseModalTarget.activeCollection,
        true,
        modulePauseReason || 'Pausa operacional preventiva acionada pelo SuperAdmin.',
        databaseId,
        statusData?.stateVersion
      );
      setSuccessNotice(res.message);
      setPauseModalTarget(null);
      setModulePauseReason('');
      await loadData();
    } catch (err: any) {
      if (err.statusCode === 409 || err.message?.includes('409') || err.message?.includes('CONCURRENCY_CONFLICT')) {
        setError('⚠️ Conflito de concorrência: O estado de governança foi alterado por outro SuperAdmin. Os dados mais recentes foram recarregados.');
        await loadData();
      } else {
        setError(err.message || 'Erro ao confirmar pausa do módulo.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActionRule = async (
    mod: ModulePolicyStatus,
    action: 'create' | 'update' | 'delete',
    currentAllowed: boolean
  ) => {
    const targetTenant = tenantId || (databaseId === 'crm_db' ? 'tenant_default' : 'test_team_alpha');
    const nextEnabled = !currentAllowed;

    // Se estiver em produção e bloqueado
    if (databaseId === 'crm_db') {
      setError('Mutações no banco de produção (crm_db) estão travadas por segurança. Homologue as regras no banco Sandbox.');
      return;
    }

    setActionLoading(`rule-${mod.activeCollection}-${action}`);
    try {
      const res = await toggleGranularRule({
        databaseId,
        collectionId: mod.activeCollection,
        action,
        tenantId: targetTenant,
        allowedRoles: ['admin', 'superadmin', 'agent'],
        enabled: nextEnabled,
        reason: `Alteração granular de ${action} pelo painel SuperAdmin`,
        expectedVersion: statusData?.stateVersion,
      });
      setSuccessNotice(res.message);
      await loadData();
    } catch (err: any) {
      if (err.statusCode === 409 || err.message?.includes('409') || err.message?.includes('CONCURRENCY_CONFLICT')) {
        setError('⚠️ Conflito de concorrência: O estado de governança foi alterado por outro SuperAdmin. Os dados mais recentes foram recarregados.');
        await loadData();
      } else {
        setError(err.message || 'Erro ao alterar regra granular.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-[#0c1017] rounded-2xl border border-red-200 dark:border-red-900/40 p-8 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-950/60 flex items-center justify-center text-red-600 dark:text-red-400">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Acesso Exclusivo SuperAdmin</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            O Painel Operacional de Políticas e Circuit Breakers exige membresia autenticada e comprovada no Team oficial <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-red-600 dark:text-red-400 font-mono text-xs">superadmins</code>.
          </p>
          <button
            onClick={() => onPageChange && onPageChange('visao-geral')}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-medium text-sm transition-all"
          >
            Voltar para Visão Geral
          </button>
        </div>
      </div>
    );
  }

  const isGlobalLockdown = statusData?.globalLockdown || false;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 p-6 md:p-8 text-white border border-indigo-500/20 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
                <ShieldCheck className="w-3.5 h-3.5" /> Team: superadmins (Autorizado)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                Disjuntor: {statusData?.circuitBreakerState || 'CLOSED'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 border border-blue-400/30 text-blue-300">
                <Database className="w-3.5 h-3.5" /> Estado Durável: v{statusData?.stateVersion ?? 1}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Controle Operacional — Write Policy Engine
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Governança autoritativa em tempo real com menor privilégio estrito, interrupção imediata por módulo e salvaguarda fail-closed.
            </p>
            {statusData?.updatedAt && (
              <p className="text-xs text-indigo-300/80 font-mono">
                Sincronizado: {new Date(statusData.updatedAt).toLocaleTimeString()} {statusData.updatedBy ? `(por ${statusData.updatedBy})` : ''}
              </p>
            )}
          </div>

          {/* Botão de Lockdown Global */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={() => {
                setLockdownReason('');
                setShowLockdownModal(true);
              }}
              disabled={actionLoading === 'lockdown'}
              className={`flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg ${
                isGlobalLockdown
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-900/30 animate-pulse'
                  : 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-red-900/40'
              }`}
            >
              <Power className="w-4 h-4" />
              {isGlobalLockdown ? 'DESATIVAR LOCKDOWN GLOBAL' : 'ACIONAR LOCKDOWN GLOBAL'}
            </button>

            <button
              onClick={loadData}
              disabled={loading}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white transition-all flex items-center justify-center"
              title="Recarregar Status"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Banner de Alerta se Lockdown Global estiver ativo */}
        {isGlobalLockdown && (
          <div className="mt-6 p-4 rounded-2xl bg-red-950/80 border border-red-500/50 flex items-center gap-3.5 text-red-200 animate-pulse">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-400" />
            <div className="text-xs md:text-sm">
              <strong className="font-bold">LOCKDOWN GLOBAL ATIVO:</strong> Todas as mutações e escritas no sistema estão terminantemente suspensas com HTTP 503. Módulos previamente bloqueados não serão abertos ao encerrar o lockdown.
            </div>
          </div>
        )}
      </div>

      {/* Alertas de Sucesso / Erro */}
      {successNotice && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="text-xs font-semibold hover:underline">
            Fechar
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-semibold hover:underline">
            Fechar
          </button>
        </div>
      )}

      {/* Barra de Filtros e Seletores de Ambiente */}
      <div className="bg-white dark:bg-[#0c1017] p-4 rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Base de Dados */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setDatabaseId('crm_isolated_test')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                databaseId === 'crm_isolated_test'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Sandbox (crm_isolated_test)
            </button>
            <button
              onClick={() => setDatabaseId('crm_db')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                databaseId === 'crm_db'
                  ? 'bg-rose-700 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Produção Protegida (crm_db)
            </button>
          </div>

          {/* Seletor de Tenant Alvo */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            <Building className="w-3.5 h-3.5" />
            <span>Organização:</span>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {databaseId === 'crm_db' ? (
                <option value="tenant_default">tenant_default (Produção)</option>
              ) : (
                <>
                  <option value="test_team_alpha">test_team_alpha (Sandbox)</option>
                  <option value="test_team_beta">test_team_beta (Sandbox Divergente)</option>
                  <option value="tenant_default">tenant_default</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Alternância de Abas: Módulos vs Auditoria */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('modules')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'modules'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Matriz de Módulos ({statusData?.modules.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'audit'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Trilha de Auditoria ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* Aba 1: Grid de Módulos com Controles Granulares */}
      {activeTab === 'modules' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {statusData?.modules.map((mod) => {
            const Icon = ICON_MAP[mod.icon] || Package;

            // Determina as cores do status
            let badgeStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300';
            let statusLabel = 'BLOQUEADO (DENY-ALL)';

            if (isGlobalLockdown) {
              badgeStyle = 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';
              statusLabel = 'LOCKDOWN GLOBAL';
            } else if (mod.isPaused) {
              badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
              statusLabel = 'PAUSADO (DISJUNTOR)';
            } else if (mod.status === 'ACTIVE') {
              badgeStyle = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
              statusLabel = 'LIBERADO';
            }

            return (
              <div
                key={mod.key}
                className="bg-white dark:bg-[#0c1017] rounded-2xl border border-slate-200 dark:border-white/[0.08] p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                          {mod.name}
                        </h3>
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                          {mod.activeCollection}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${badgeStyle}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 line-clamp-2">
                    {mod.description}
                  </p>

                  {/* Pausa por Disjuntor */}
                  {mod.isPaused && mod.pauseReason && (
                    <div className="mb-4 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300">
                      <strong>Motivo da Pausa:</strong> {mod.pauseReason}
                    </div>
                  )}

                  {/* Matriz Granular de Ações: Create, Update, Delete */}
                  <div className="space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-3 mb-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Ações Granulares (Por Ação e Papel)
                    </div>

                    {/* CREATE */}
                    <div className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Criar (Create)</span>
                        {mod.actions.create.allowed && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                            {mod.actions.create.roles.join(', ')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleToggleActionRule(mod, 'create', mod.actions.create.allowed)}
                        disabled={actionLoading === `rule-${mod.activeCollection}-create` || isGlobalLockdown}
                        className={`w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${
                          mod.actions.create.allowed ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                        title={mod.actions.create.allowed ? 'Clique para Bloquear Criação' : 'Clique para Liberar Criação'}
                      >
                        <span
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            mod.actions.create.allowed ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* UPDATE */}
                    <div className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Editar (Update)</span>
                        {mod.actions.update.allowed && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                            {mod.actions.update.roles.join(', ')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleToggleActionRule(mod, 'update', mod.actions.update.allowed)}
                        disabled={actionLoading === `rule-${mod.activeCollection}-update` || isGlobalLockdown}
                        className={`w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${
                          mod.actions.update.allowed ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                        title={mod.actions.update.allowed ? 'Clique para Bloquear Edição' : 'Clique para Liberar Edição'}
                      >
                        <span
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            mod.actions.update.allowed ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* DELETE */}
                    <div className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Excluir (Delete)</span>
                        {mod.actions.delete.allowed && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                            {mod.actions.delete.roles.join(', ')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleToggleActionRule(mod, 'delete', mod.actions.delete.allowed)}
                        disabled={actionLoading === `rule-${mod.activeCollection}-delete` || isGlobalLockdown}
                        className={`w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${
                          mod.actions.delete.allowed ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                        title={mod.actions.delete.allowed ? 'Clique para Bloquear Exclusão' : 'Clique para Liberar Exclusão'}
                      >
                        <span
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            mod.actions.delete.allowed ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Botão de Disjuntor do Módulo */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <button
                    onClick={() => handleToggleModulePause(mod)}
                    disabled={actionLoading === `pause-${mod.activeCollection}` || isGlobalLockdown}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      mod.isPaused
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50 hover:bg-emerald-100'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800/50 hover:bg-amber-100'
                    }`}
                  >
                    {mod.isPaused ? (
                      <>
                        <PlayCircle className="w-3.5 h-3.5" /> Retomar Módulo
                      </>
                    ) : (
                      <>
                        <PauseCircle className="w-3.5 h-3.5" /> Pausar Módulo (Disjuntor)
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Aba 2: Trilha de Auditoria Administrativa */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-[#0c1017] rounded-2xl border border-slate-200 dark:border-white/[0.08] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Registro Imutável de Auditoria de Políticas
            </h3>
            <span className="text-xs text-slate-500">Últimas {auditLogs.length} mutações</span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Nenhuma ação administrativa registrada nesta sessão.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                    <th className="py-2.5 px-3">Data/Hora (UTC)</th>
                    <th className="py-2.5 px-3">Ação</th>
                    <th className="py-2.5 px-3">SuperAdmin</th>
                    <th className="py-2.5 px-3">Alvo / Módulo</th>
                    <th className="py-2.5 px-3">IP (Mascarado)</th>
                    <th className="py-2.5 px-3">Justificativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString()} - {new Date(log.timestamp).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.action.includes('ENABLED') || log.action.includes('GRANTED')
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : log.action.includes('REVOKED') || log.action.includes('LOCKDOWN')
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">
                        {log.actorId}
                      </td>
                      <td className="py-2.5 px-3 text-indigo-600 dark:text-indigo-400">
                        {log.targetCollection || 'all'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {log.clientIp}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-sans max-w-xs truncate">
                        {log.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de Confirmação: Lockdown Global */}
      {showLockdownModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0c1017] rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isGlobalLockdown ? 'Desativar Lockdown Global?' : 'Confirmar Lockdown Global Emergencial?'}
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {isGlobalLockdown ? (
                <>
                  Ao desativar o lockdown, apenas os módulos que já possuíam regras autorizadas voltarão a operar.
                  <strong> Módulos bloqueados (Deny-All) permanecerão estritamente bloqueados.</strong>
                </>
              ) : (
                <>
                  Esta ação suspende imediatamente <strong>100% de todas as operações de escrita</strong> em todas as collections e bancos do sistema via disjuntor de segurança (HTTP 503).
                </>
              )}
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Motivo / Justificativa Operacional (Auditado):
              </label>
              <textarea
                value={lockdownReason}
                onChange={(e) => setLockdownReason(e.target.value)}
                placeholder="Ex: Auditoria emergencial preventiva de segurança..."
                rows={3}
                className="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowLockdownModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleToggleLockdown}
                disabled={actionLoading === 'lockdown'}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md"
              >
                {isGlobalLockdown ? 'Confirmar Retomada' : 'Sim, Disparar Lockdown Imediato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação: Pausa de Módulo */}
      {pauseModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0c1017] rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="p-2.5 rounded-2xl bg-amber-100 dark:bg-amber-950/60">
                <PauseCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Pausar Módulo "{pauseModalTarget.name}"?
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              O módulo <code className="font-mono text-amber-500">{pauseModalTarget.activeCollection}</code> terá todas as suas escritas suspensas com HTTP 503 via Circuit Breaker sem afetar as regras cadastradas.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Motivo da Interrupção:
              </label>
              <textarea
                value={modulePauseReason}
                onChange={(e) => setModulePauseReason(e.target.value)}
                placeholder="Ex: Investigação de integridade de dados..."
                rows={2}
                className="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPauseModalTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmModulePause}
                disabled={actionLoading?.startsWith('pause')}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-md"
              >
                Confirmar Pausa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
