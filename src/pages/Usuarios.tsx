import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Search,
  RefreshCw,
  Mail,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  UserCheck,
  UserX,
  Trash2,
  ShieldCheck,
  Building2,
  Clock,
  Sparkles,
  Lock,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import {
  fetchTenantMembers,
  inviteTenantMember,
  updateTenantMemberRole,
  removeTenantMember,
  fetchUserMenuPermissions,
  saveUserMenuPermissions,
  updateUserPassword,
  ALL_CRM_MENUS,
  TenantMember,
} from '../lib/tenantUsersApi';

export default function Usuarios() {
  const { user: currentUser } = useAuth();
  const { tenant, tenants, setTenant, isSuperAdmin } = useTenant();

  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Modal de Convidar / Cadastrar Membro
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role: 'agent' as 'admin' | 'manager' | 'agent' | 'viewer',
    password: '',
  });
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Modal de Alteração de Papel
  const [editingMember, setEditingMember] = useState<TenantMember | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('agent');
  const [submittingRole, setSubmittingRole] = useState(false);

  // Modal de Permissões Granulares de Menus por Usuário
  const [permissionsMember, setPermissionsMember] = useState<TenantMember | null>(null);
  const [memberMenuPerms, setMemberMenuPerms] = useState<Record<string, boolean>>({});
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [submittingPerms, setSubmittingPerms] = useState(false);

  // Modal de Alteração de Senha do Membro
  const [passwordMember, setPasswordMember] = useState<TenantMember | null>(null);
  const [memberNewPassword, setMemberNewPassword] = useState('');
  const [submittingMemberPassword, setSubmittingMemberPassword] = useState(false);
  const [memberPasswordError, setMemberPasswordError] = useState<string | null>(null);

  const handleUpdateMemberPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordMember || !activeTenantId) return;
    if (memberNewPassword.length < 8) {
      setMemberPasswordError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setSubmittingMemberPassword(true);
    setMemberPasswordError(null);

    try {
      const res = await updateUserPassword({
        tenantId: activeTenantId,
        userId: passwordMember.userId,
        password: memberNewPassword,
      });
      setSuccessNotice(res.message || `Senha de ${passwordMember.name} atualizada com sucesso!`);
      setPasswordMember(null);
      setMemberNewPassword('');
    } catch (err: any) {
      setMemberPasswordError(err.message || 'Falha ao atualizar senha do membro.');
    } finally {
      setSubmittingMemberPassword(false);
    }
  };

  const activeTenantId = tenant?.id || '';

  const loadMembers = useCallback(async () => {
    if (!activeTenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTenantMembers(activeTenantId);
      setMembers(res.members || (res as any).users || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar membros da empresa.');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleOpenPermissionsModal = async (m: TenantMember) => {
    if (!activeTenantId) return;
    setPermissionsMember(m);
    setLoadingPerms(true);
    setError(null);

    const defaults: Record<string, boolean> = {};
    for (const menu of ALL_CRM_MENUS) {
      defaults[menu.id] = true;
    }

    try {
      const res = await fetchUserMenuPermissions(activeTenantId, m.userId);
      if (res.permissions && res.permissions.length > 0) {
        for (const p of res.permissions) {
          defaults[p.menu_id] = !!p.has_access;
        }
      }
      setMemberMenuPerms(defaults);
    } catch (err: any) {
      setMemberMenuPerms(defaults);
      setError(err.message || 'Erro ao carregar permissões de menus do usuário.');
    } finally {
      setLoadingPerms(false);
    }
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionsMember || !activeTenantId) return;
    setSubmittingPerms(true);
    setError(null);

    try {
      const permissionsPayload: Record<string, boolean> = {};
      for (const menu of ALL_CRM_MENUS) {
        permissionsPayload[menu.id] = memberMenuPerms[menu.id] !== false;
      }
      const res = await saveUserMenuPermissions({
        tenantId: activeTenantId,
        userId: permissionsMember.userId,
        permissions: permissionsPayload,
      });
      setSuccessNotice(res.message || `Permissões de ${permissionsMember.name} atualizadas com sucesso!`);
      setPermissionsMember(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar permissões de menus.');
    } finally {
      setSubmittingPerms(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenantId) return;
    setSubmittingInvite(true);
    setError(null);

    try {
      const res = await inviteTenantMember({
        tenantId: activeTenantId,
        email: inviteForm.email,
        name: inviteForm.name,
        role: inviteForm.role,
        password: inviteForm.password || undefined,
      });

      setSuccessNotice(res.message);
      setShowInviteModal(false);
      setInviteForm({ name: '', email: '', role: 'agent', password: '' });
      await loadMembers();
    } catch (err: any) {
      setError(err.message || 'Falha ao convidar usuário.');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !activeTenantId) return;
    setSubmittingRole(true);
    setError(null);

    try {
      const res = await updateTenantMemberRole({
        tenantId: activeTenantId,
        userId: editingMember.userId,
        membershipId: editingMember.membershipId,
        role: selectedRole,
      });

      setSuccessNotice(res.message);
      setEditingMember(null);
      await loadMembers();
    } catch (err: any) {
      setError(err.message || 'Falha ao atualizar papel do membro.');
    } finally {
      setSubmittingRole(false);
    }
  };

  const handleToggleStatus = async (m: TenantMember) => {
    if (!activeTenantId) return;
    const newStatus = m.status === 'active' ? false : true;
    try {
      await updateTenantMemberRole({
        tenantId: activeTenantId,
        userId: m.userId,
        membershipId: m.membershipId,
        is_active: newStatus,
      });
      setSuccessNotice(`Status do usuário ${m.name} atualizado com sucesso.`);
      await loadMembers();
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar status do membro.');
    }
  };

  const handleRemoveMember = async (m: TenantMember) => {
    if (!activeTenantId) return;
    if (!window.confirm(`Tem certeza que deseja remover ${m.name} (${m.email}) da equipe?`)) return;

    try {
      await removeTenantMember({
        tenantId: activeTenantId,
        userId: m.userId,
        membershipId: m.membershipId,
      });
      setSuccessNotice(`Membro ${m.name} removido com sucesso da organização.`);
      await loadMembers();
    } catch (err: any) {
      setError(err.message || 'Erro ao remover membro da equipe.');
    }
  };

  const filteredMembers = members.filter((m) => {
    const s = searchTerm.toLowerCase();
    return (
      m.name.toLowerCase().includes(s) ||
      m.email.toLowerCase().includes(s) ||
      m.role.toLowerCase().includes(s)
    );
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'superadmin':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            SuperAdmin
          </span>
        );
      case 'admin':
      case 'owner':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            Administrador
          </span>
        );
      case 'manager':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
            Gerente
          </span>
        );
      case 'viewer':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            Visualizador
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Agente Comercial
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Ativo
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5" />
            Pendente
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Inativo
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Users className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Equipe & Permissões
              </h1>
              <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Cliente / Organização:</span>
                {isSuperAdmin && tenants.length > 0 ? (
                  <select
                    value={activeTenantId}
                    onChange={(e) => setTenant(e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.slug}.lvplataform.com.br)
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong className="text-slate-700 dark:text-slate-200">{tenant?.name || 'Carregando...'}</strong>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadMembers}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition text-sm font-semibold shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Convidar Membro
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-semibold hover:underline">
            ✕
          </button>
        </div>
      )}

      {successNotice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="text-xs font-semibold hover:underline">
            ✕
          </button>
        </div>
      )}

      {/* Busca & Métricas */}
      <div className="bg-white dark:bg-[#121722] p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, e-mail ou papel..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>
            Total de Membros: <strong className="text-slate-900 dark:text-white">{filteredMembers.length}</strong>
          </div>
          <div>
            Ativos: <strong className="text-emerald-600 dark:text-emerald-400">{filteredMembers.filter((m) => m.status === 'active').length}</strong>
          </div>
        </div>
      </div>

      {/* Tabela de Membros */}
      <div className="bg-white dark:bg-[#121722] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Carregando membros da organização...
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">Nenhum membro encontrado</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm ? 'Ajuste os filtros de busca.' : 'Clique em "Convidar Membro" para adicionar colaboradores.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-white/[0.02] text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="px-6 py-3.5">Membro</th>
                  <th className="px-6 py-3.5">Papel / Função</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Ações & Permissões</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredMembers.map((m) => {
                  const isCurrent = currentUser?.id === m.userId;
                  return (
                    <tr key={m.membershipId || m.userId} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-xs">
                            {m.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              {m.name}
                              {isCurrent && (
                                <span className="text-[10px] bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                                  Você
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {m.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">{getRoleBadge(m.role)}</td>
                      <td className="px-6 py-4">{getStatusBadge(m.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenPermissionsModal(m)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition"
                            title="Configurar permissões de acesso aos menus para este usuário"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Permissões de Menus
                          </button>
                          <button
                            onClick={() => {
                              setEditingMember(m);
                              setSelectedRole(m.role);
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition"
                          >
                            Alterar Papel
                          </button>
                          <button
                            onClick={() => {
                              setPasswordMember(m);
                              setMemberNewPassword('');
                              setMemberPasswordError(null);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-xs font-semibold text-amber-700 dark:text-amber-300 transition"
                            title="Definir nova senha para este usuário"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            Alterar Senha
                          </button>
                          <button
                            onClick={() => handleToggleStatus(m)}
                            title={m.status === 'active' ? 'Desativar acesso' : 'Reativar acesso'}
                            className={`p-1.5 rounded-lg border text-xs transition ${
                              m.status === 'active'
                                ? 'border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-500/20'
                                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/20'
                            }`}
                          >
                            {m.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                          {!isCurrent && (
                            <button
                              onClick={() => handleRemoveMember(m)}
                              title="Remover da empresa"
                              className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-500/20 text-rose-600 hover:bg-rose-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Convidar Membro */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121722] w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <UserPlus className="w-5 h-5" />
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Convidar Membro para a Equipe
                </h3>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Carlos Silva"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail Corporativo *
                </label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="carlos@empresa.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Papel na Organização *
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm((prev) => ({ ...prev, role: e.target.value as any }))}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="agent">Agente Comercial (Pipeline e Clientes)</option>
                  <option value="manager">Gerente (Gestão de Vendas)</option>
                  <option value="admin">Administrador da Empresa (Gestão Completa do Tenant)</option>
                  <option value="viewer">Visualizador (Somente Leitura)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  O usuário terá acesso restrito exclusivamente a este tenant.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Senha Temporária (Opcional)
                </label>
                <input
                  type="password"
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Deixe em branco para gerar aleatória"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-white/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingInvite}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition shadow-sm disabled:opacity-50"
                >
                  {submittingInvite ? 'Convidando...' : 'Enviar Convite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alterar Papel */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121722] w-full max-w-sm rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Alterar Papel</h3>
              <button onClick={() => setEditingMember(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleUpdateRole} className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Selecione o novo papel para <strong>{editingMember.name}</strong> ({editingMember.email}):
              </p>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="agent">Agente Comercial</option>
                <option value="manager">Gerente</option>
                <option value="admin">Administrador da Empresa</option>
                <option value="viewer">Visualizador</option>
              </select>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingRole}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                >
                  {submittingRole ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Permissões Granulares de Menus por Usuário */}
      {permissionsMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121722] w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Permissões de Menus — {permissionsMember.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Organização: {tenant?.name} ({tenant?.slug}.lvplataform.com.br)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPermissionsMember(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePermissions} className="p-6 space-y-4">
              {loadingPerms ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Carregando permissões configuradas...
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Marque os módulos que este colaborador pode acessar:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const allChecked = ALL_CRM_MENUS.every((m) => memberMenuPerms[m.id] !== false);
                        const next: Record<string, boolean> = {};
                        for (const m of ALL_CRM_MENUS) {
                          next[m.id] = !allChecked;
                        }
                        setMemberMenuPerms(next);
                      }}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Alternar Todos
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
                    {ALL_CRM_MENUS.map((menu) => {
                      const hasAccess = memberMenuPerms[menu.id] !== false;
                      return (
                        <label
                          key={menu.id}
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition text-xs ${
                            hasAccess
                              ? 'bg-indigo-50/70 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/30 text-indigo-900 dark:text-indigo-200'
                              : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold truncate">{menu.label}</div>
                            <div className="text-[10px] opacity-70 truncate">{menu.category}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={hasAccess}
                            onChange={(e) =>
                              setMemberMenuPerms((prev) => ({
                                ...prev,
                                [menu.id]: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-white/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPermissionsMember(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingPerms || loadingPerms}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition shadow-sm disabled:opacity-50"
                >
                  {submittingPerms ? 'Salvando...' : 'Salvar Permissões'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alterar Senha de Membro da Equipe */}
      {passwordMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121722] w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Alterar Senha do Usuário
                </h3>
              </div>
              <button
                onClick={() => setPasswordMember(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateMemberPassword} className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs">
                <div className="font-bold text-slate-900 dark:text-white">{passwordMember.name}</div>
                <div className="text-slate-500 font-mono text-[11px]">{passwordMember.email}</div>
              </div>

              {memberPasswordError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{memberPasswordError}</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nova Senha *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
                      let pass = '';
                      for (let i = 0; i < 12; i++) {
                        pass += chars.charAt(Math.floor(Math.random() * chars.length));
                      }
                      setMemberNewPassword(pass);
                      navigator.clipboard.writeText(pass);
                      setSuccessNotice('Senha segura gerada e copiada!');
                      setTimeout(() => setSuccessNotice(null), 3000);
                    }}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> Gerar Senha Segura
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={memberNewPassword}
                    onChange={(e) => setMemberNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordMember(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingMemberPassword || !memberNewPassword}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                >
                  {submittingMemberPassword ? 'Salvando...' : 'Salvar Nova Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
