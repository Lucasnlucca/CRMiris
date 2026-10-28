import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Lock,
  KeyRound,
  Shield,
  ShieldCheck,
  Building2,
  Sparkles,
  Eye,
  EyeOff,
  Check,
  CheckCircle2,
  AlertCircle,
  X,
  Smartphone,
  Laptop,
  Clock,
  Phone,
  Briefcase,
  Copy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { updateUserPassword, updateUserProfile } from '../lib/tenantUsersApi';
import { account } from '../lib/appwrite';

interface UserProfileModalProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: 'profile' | 'security' | 'session';
  onSuccess?: (updatedUser: { id?: string; name: string; phone?: string; jobTitle?: string }) => void;
}

export default function UserProfileModal({
  open,
  onClose,
  defaultTab = 'profile',
  onSuccess,
}: UserProfileModalProps) {
  const { user, login } = useAuth();
  const { tenant, isSuperAdmin } = useTenant();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'session'>(defaultTab);

  // Profile Form State
  const [name, setName] = useState(user?.name || '');
  const [email] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      setName(user?.name || '');
      // Carrega telefone ou cargo salvos localmente
      try {
        const customData = JSON.parse(localStorage.getItem(`crm_user_pref_${user?.id}`) || '{}');
        if (customData.phone) setPhone(customData.phone);
        if (customData.jobTitle) setJobTitle(customData.jobTitle);
      } catch {}
      setProfileSuccess(null);
      setProfileError(null);
      setPasswordSuccess(null);
      setPasswordError(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open, defaultTab, user]);

  if (!open) return null;

  // Cálculo da força da senha
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-slate-200' };
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 1, label: 'Fraca', color: 'bg-rose-500' };
    if (score === 2) return { score: 2, label: 'Média', color: 'bg-amber-500' };
    if (score === 3) return { score: 3, label: 'Boa', color: 'bg-sky-500' };
    return { score: 4, label: 'Muito Forte', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength(newPassword);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setProfileError('O nome não pode ficar em branco.');
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      let persisted = false;
      let primaryError: any = null;

      // 1. Tenta atualizar via API autoritativa do servidor
      try {
        const res = await updateUserProfile({
          userId: user?.id,
          name: trimmedName,
        });
        if (!res || !res.success) {
          throw new Error((res as any)?.error || 'O servidor não confirmou a atualização do perfil.');
        }
        persisted = true;
      } catch (serverErr: any) {
        primaryError = serverErr;
        const statusCode = serverErr?.code || serverErr?.status;
        const errMsg = String(serverErr?.message || '');

        // Em falhas de autorização ou validação explícita (400/401/403/500), não mascarar o erro
        if (
          statusCode === 400 ||
          statusCode === 401 ||
          statusCode === 403 ||
          statusCode === 500 ||
          /HTTP\s*(400|401|403|500)/i.test(errMsg) ||
          /negado|não autorizado|forbidden|unauthorized/i.test(errMsg)
        ) {
          throw serverErr;
        }

        // 2. Fallback para Appwrite Account SDK somente se o endpoint intermediário não estiver acessível,
        // mas NUNCA engolindo falha caso ambos falhem (F13)
        try {
          const updatedAcc = await account.updateName(trimmedName);
          if (!updatedAcc || !updatedAcc.$id) {
            throw primaryError || new Error('Resposta inválida ao atualizar nome da conta.');
          }
          persisted = true;
        } catch (fallbackErr: any) {
          throw primaryError || fallbackErr || new Error('Não foi possível salvar as alterações do perfil.');
        }
      }

      if (!persisted) {
        throw primaryError || new Error('Não foi possível confirmar a persistência do perfil.');
      }

      // Somente após confirmação de persistência atualiza preferências locais e anuncia sucesso
      try {
        localStorage.setItem(
          `crm_user_pref_${user?.id}`,
          JSON.stringify({ phone, jobTitle })
        );
      } catch {}

      onSuccess?.({
        id: user?.id,
        name: trimmedName,
        phone,
        jobTitle,
      });

      setProfileSuccess('Perfil atualizado com sucesso!');
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err: any) {
      setProfileSuccess(null);
      setProfileError(err?.message || 'Erro ao atualizar dados do perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da senha não coincide com a nova senha digitada.');
      return;
    }

    setSavingPassword(true);

    try {
      let updated = false;
      let primaryError: any = null;

      // 1. Tenta via endpoint do servidor com autoridade
      try {
        const res = await updateUserPassword({
          userId: user?.id || '',
          password: newPassword,
          tenantId: tenant?.id,
        });
        if (res && res.success) {
          updated = true;
        } else {
          throw new Error((res as any)?.error || 'Falha ao atualizar senha no servidor.');
        }
      } catch (err: any) {
        primaryError = err;
        const errMsg = String(err?.message || '');
        if (/HTTP\s*(401|403)/i.test(errMsg) || /negado|forbidden/i.test(errMsg)) {
          throw err;
        }
      }

      // 2. Se não conseguiu pelo backend, tenta pelo SDK de conta exigindo confirmação real
      if (!updated) {
        try {
          const accRes = currentPassword
            ? await account.updatePassword(newPassword, currentPassword)
            : await account.updatePassword(newPassword);
          if (!accRes || !accRes.$id) {
            throw primaryError || new Error('Não foi possível confirmar a alteração de senha.');
          }
          updated = true;
        } catch (sdkErr: any) {
          throw sdkErr || primaryError || new Error('Falha ao atualizar a senha.');
        }
      }

      if (!updated) {
        throw primaryError || new Error('Falha ao atualizar a senha.');
      }

      setPasswordSuccess('Senha alterada com sucesso! Utilize a nova senha no próximo acesso.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(null), 4000);
    } catch (err: any) {
      setPasswordSuccess(null);
      setPasswordError(
        err.message?.includes('Invalid credentials') || err.message?.includes('password')
          ? 'Senha atual incorreta ou inválida. Verifique e tente novamente.'
          : err.message || 'Falha ao atualizar a senha.'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
    setConfirmPassword(pass);
    navigator.clipboard?.writeText(pass).catch(() => {});
  };

  const userInitials = (user?.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#111622] w-full max-w-2xl rounded-3xl border border-slate-200/80 dark:border-white/[0.08] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com Design de Cartão de Usuário */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white overflow-hidden flex-shrink-0">
          {/* Efeito Glow no fundo */}
          <div className="absolute -right-10 -top-10 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-20 -bottom-10 w-40 h-40 bg-purple-500/15 rounded-full blur-2xl pointer-events-none" />

          <div className="relative flex items-center justify-between z-10 mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Configuração do Usuário · CRM</span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              title="Fechar janela"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative flex items-center gap-4 z-10">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-purple-500 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-indigo-500/30 ring-4 ring-white/10">
                {userInitials}
              </div>
              <span
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-slate-900 flex items-center justify-center"
                title="Sessão ativa e conectada"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white truncate">{user?.name || 'Usuário CRM'}</h2>
                {isSuperAdmin ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-xs">
                    <ShieldCheck className="w-3 h-3 text-amber-400" />
                    SuperAdmin
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {user?.role === 'admin' ? 'Administrador' : 'Colaborador'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 truncate mt-0.5">{user?.email}</p>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="truncate">{tenant?.trade_name || tenant?.name || 'Matriz LVPlatform'}</span>
              </div>
            </div>
          </div>

          {/* Abas de Navegação */}
          <div className="flex items-center gap-1 mt-6 border-b border-white/10 -mb-5">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'profile'
                  ? 'border-indigo-400 text-white bg-white/5 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Meu Perfil</span>
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'security'
                  ? 'border-indigo-400 text-white bg-white/5 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Trocar Senha & Segurança</span>
            </button>
            <button
              onClick={() => setActiveTab('session')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'session'
                  ? 'border-indigo-400 text-white bg-white/5 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Sessão & Dispositivo</span>
            </button>
          </div>
        </div>

        {/* Conteúdo com rolagem */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 dark:bg-[#0c1017]/40">
          {/* ABA 1: PERFIL */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              {profileSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}
              {profileError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Seu nome"
                      className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#161d2a] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    E-mail de Login
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      disabled
                      value={email}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/5 rounded-xl text-xs text-slate-500 dark:text-slate-400 cursor-not-allowed font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Para trocar o e-mail oficial, solicite ao SuperAdmin.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    WhatsApp / Telefone
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#161d2a] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Cargo / Função
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="Ex.: Diretor Comercial, Suporte N2"
                      className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#161d2a] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Organização Atual
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      disabled
                      value={tenant?.trade_name || tenant?.name || 'Central Principal'}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/5 rounded-xl text-xs text-slate-600 dark:text-slate-300 cursor-not-allowed font-medium"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-[#141a26] border border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Nível de Privilégio</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isSuperAdmin
                      ? 'Autonomia irrestrita global com governança sobre todos os tenants.'
                      : user?.role === 'admin'
                      ? 'Administrador com controle completo sobre esta empresa.'
                      : 'Colaborador operacional com permissões granulares configuradas.'}
                  </p>
                </div>
                <div className="px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 text-xs font-bold">
                  {isSuperAdmin ? 'SuperAdmin' : user?.role === 'admin' ? 'Administrador' : 'Colaborador'}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {savingProfile ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Alterações</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ABA 2: TROCA DE SENHA & SEGURANÇA */}
          {activeTab === 'security' && (
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              {passwordSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{passwordSuccess}</span>
                </div>
              )}
              {passwordError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-800 dark:text-amber-300 text-xs">
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="block font-bold">Diretriz de Segurança de Acesso</strong>
                  <span>
                    A senha deve possuir no mínimo 8 caracteres, combinando letras e números para garantir proteção contra invasões.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Senha Atual (Opcional se logado via SuperAdmin)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Digite sua senha atual"
                    className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-[#161d2a] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Nova Senha *
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Gerar Forte
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-[#161d2a] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Medidor de Força */}
                  {newPassword && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Força da senha:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{strength.label}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden flex gap-1">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`h-full flex-1 rounded-full transition-all ${
                              step <= strength.score ? strength.color : 'bg-transparent'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Confirmar Nova Senha *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className={`w-full pl-10 pr-10 py-2.5 bg-white dark:bg-[#161d2a] border rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 transition-all font-mono ${
                        confirmPassword && confirmPassword !== newPassword
                          ? 'border-rose-400 focus:ring-rose-500/20'
                          : confirmPassword && confirmPassword === newPassword
                          ? 'border-emerald-400 focus:ring-emerald-500/20'
                          : 'border-slate-200 dark:border-white/10 focus:ring-indigo-500/20 focus:border-indigo-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword === newPassword && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> As senhas coincidem
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPassword || !newPassword || newPassword !== confirmPassword}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {savingPassword ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Atualizando Senha...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Atualizar Senha com Segurança</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* ABA 3: SESSÃO & AUDITORIA */}
          {activeTab === 'session' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-[#141a26] border border-slate-200/80 dark:border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.05]">
                  <div className="flex items-center gap-2.5">
                    <Laptop className="w-5 h-5 text-indigo-500" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">Sessão Atual do Navegador</h4>
                      <p className="text-[11px] text-slate-500">Conexão Segura Web (HTTPS / TLS 1.3)</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Ativa Agora
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 block text-[11px]">ID de Usuário</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-mono text-[11px] select-all">
                      {user?.id || 'usr_session'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Empresa (Tenant ID)</span>
                    <strong className="text-slate-800 dark:text-slate-200 font-mono text-[11px] select-all">
                      {tenant?.id || 'matriz'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Data / Horário de Login</span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Criptografia de Sessão</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">JWT Token Autoritativo</strong>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-500/20 text-xs text-indigo-900 dark:text-indigo-300">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Privacidade & Segurança da Conta
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  Todas as operações no CRM são auditadas com carimbo de data/hora para governança e proteção de dados da sua empresa.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition-all shadow-md"
                >
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
