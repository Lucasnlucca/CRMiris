import { Save, Moon, Sun, Globe, Building2, Bell, Plus, UserCog, Settings, Shield, ChevronRight, ChevronDown, ChevronUp, Check, X, Eye, EyeOff, Search, LayoutDashboard, Users as UsersIcon, Briefcase, TrendingUp, Package, Zap, Trash2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useState, useEffect } from 'react';
import { databases } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';
import { useAuth } from '../context/AuthContext';

interface NewUserForm {
  name: string;
  email: string;
  password: string;
  role: string;
}

type TabId = 'geral' | 'usuarios' | 'notificacoes';

const tabs: { id: TabId; label: string; icon: any; description: string }[] = [
  { id: 'geral', label: 'Geral', icon: Settings, description: 'Aparência, idioma e empresa' },
  { id: 'usuarios', label: 'Usuários', icon: UserCog, description: 'Gerenciar equipe e acessos' },
  { id: 'notificacoes', label: 'Notificações', icon: Bell, description: 'Alertas e sons' },
];

const ALL_MENU_ITEMS = [
  { id: 'visao-geral', label: 'Dashboard', icon: LayoutDashboard, group: 'principal' },
  { id: 'crm-contatos', label: 'CRM - Clientes', icon: UsersIcon, group: 'crm' },
  { id: 'crm-negocios', label: 'CRM - Negocios', icon: UsersIcon, group: 'crm' },
  { id: 'crm-pipeline', label: 'CRM - Pipeline', icon: UsersIcon, group: 'crm' },
  { id: 'crm-items', label: 'CRM - Itens', icon: UsersIcon, group: 'crm' },
  { id: 'crm-propostas', label: 'CRM - Propostas', icon: UsersIcon, group: 'crm' },
  { id: 'dstrack', label: 'Suporte', icon: TrendingUp, group: 'principal' },
  { id: 'recursos-catalogo', label: 'Recursos - Catalogo', icon: Package, group: 'recursos' },
  { id: 'recursos-produtos', label: 'Recursos - Produtos', icon: Package, group: 'recursos' },
  { id: 'recursos-estoque', label: 'Recursos - Estoque', icon: Package, group: 'recursos' },
  { id: 'automacoes', label: 'Automacoes', icon: Zap, group: 'principal' },
  { id: 'administracao', label: 'Configuracoes', icon: Settings, group: 'principal' },
  { id: 'parceiros-afiliados', label: 'Parceiros - Afiliados', icon: Briefcase, group: 'parceiros' },
  { id: 'parceiros-revendas', label: 'Parceiros - Revendas', icon: Briefcase, group: 'parceiros' },
  { id: 'parceiros-api', label: 'Parceiros - API', icon: Briefcase, group: 'parceiros' },
];

const MENU_GROUPS = [
  { id: 'principal', label: 'Menus Principais' },
  { id: 'crm', label: 'CRM' },
  { id: 'recursos', label: 'Recursos' },
  { id: 'parceiros', label: 'Parceiros' },
];

export default function Configuracoes() {
  const { isDarkMode, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('geral');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState<NewUserForm>({
    name: '',
    email: '',
    password: '',
    role: 'colaborador',
  });
  const [userMessage, setUserMessage] = useState('');
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, { menu_id: string; has_access: boolean }[]>>({});
  const [savingPermissions, setSavingPermissions] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    loadTeamUsers();
  }, []);

  const loadTeamUsers = async () => {
    setTeamLoading(true);
    try {
      const { documents: data } = await databases.listDocuments(
        DATABASE_ID,
        'users_hydra',
        [Query.orderAsc('created_at'), Query.limit(100)]
      );
      if (data) setTeamUsers(data as any);
    } catch (error) {
      console.error('Error loading team users:', error);
    }
    setTeamLoading(false);
  };

  const loadUserPermissions = async (userId: string) => {
    try {
      const { documents: data } = await databases.listDocuments(
        DATABASE_ID,
        'user_menu_permissions',
        [Query.equal('user_id', userId), Query.limit(100)]
      );
      if (data) {
        setUserPermissions(prev => ({ ...prev, [userId]: data as any }));
      }
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  };

  const getPermState = (userId: string, menuId: string): boolean => {
    const perms = userPermissions[userId];
    if (!perms) return true;
    const p = perms.find(x => x.menu_id === menuId);
    if (!p) return true;
    return p.has_access;
  };

  const togglePerm = async (userId: string, menuId: string) => {
    const current = getPermState(userId, menuId);
    setSavingPermissions(userId);
    try {
      // Upsert polyfill
      const { documents } = await databases.listDocuments(DATABASE_ID, 'user_menu_permissions', [Query.equal('user_id', userId), Query.equal('menu_id', menuId), Query.limit(1)]);
      if (documents.length > 0) {
        await databases.updateDocument(DATABASE_ID, 'user_menu_permissions', documents[0].$id, { has_access: !current });
      } else {
        await databases.createDocument(DATABASE_ID, 'user_menu_permissions', ID.unique(), { user_id: userId, menu_id: menuId, has_access: !current });
      }
      setUserPermissions(prev => {
        const arr = prev[userId] || [];
        const idx = arr.findIndex(x => x.menu_id === menuId);
        if (idx >= 0) { const u = [...arr]; u[idx] = { menu_id: menuId, has_access: !current }; return { ...prev, [userId]: u }; }
        return { ...prev, [userId]: [...arr, { menu_id: menuId, has_access: !current }] };
      });
    } catch (error) {
      console.error('Error toggling permission:', error);
    }
    setSavingPermissions(null);
  };

  const toggleAllPerms = async (userId: string, grant: boolean) => {
    setSavingPermissions(userId);
    const records = ALL_MENU_ITEMS.map(m => ({ user_id: userId, menu_id: m.id, has_access: grant }));
    try {
      for (const rec of records) {
        const { documents } = await databases.listDocuments(DATABASE_ID, 'user_menu_permissions', [Query.equal('user_id', rec.user_id), Query.equal('menu_id', rec.menu_id), Query.limit(1)]);
        if (documents.length > 0) {
          await databases.updateDocument(DATABASE_ID, 'user_menu_permissions', documents[0].$id, { has_access: grant });
        } else {
          await databases.createDocument(DATABASE_ID, 'user_menu_permissions', ID.unique(), { user_id: rec.user_id, menu_id: rec.menu_id, has_access: grant });
        }
      }
      setUserPermissions(prev => ({ ...prev, [userId]: ALL_MENU_ITEMS.map(m => ({ menu_id: m.id, has_access: grant })) }));
    } catch (error) {
      console.error('Error toggling all permissions:', error);
    }
    setSavingPermissions(null);
  };

  const changeUserRole = async (userId: string, newRole: string) => {
    try {
      await databases.updateDocument(DATABASE_ID, 'users_hydra', userId, { role: newRole });
      setTeamUsers(prev => prev.map(u => (u.$id || u.id) === userId ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error('Error changing role:', error);
    }
  };


  const handleCreateUser = async () => {
    setLoading(true);
    setUserMessage('');
    try {
      if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password) {
        throw new Error('Preencha todos os campos obrigatórios.');
      }
      if (newUser.password.length < 8) {
        throw new Error('A senha deve ter pelo menos 8 caracteres (requisito do Appwrite).');
      }

      const res = await fetch('http://localhost:3008/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Erro HTTP ${res.status}`);
      }

      setUserMessage('Usuário criado com sucesso!');
      setNewUser({ name: '', email: '', password: '', role: 'colaborador' });
      await loadTeamUsers();
      setTimeout(() => {
        setShowUserModal(false);
        setUserMessage('');
      }, 1500);
    } catch (error: any) {
      setUserMessage(error.message || 'Erro ao criar usuário');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o usuário "${userName}"?`)) return;
    try {
      const res = await fetch(`http://localhost:3008/api/users/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erro ao excluir usuário');
      await loadTeamUsers();
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir usuário');
    }
  };

  const isAdmin = user?.role === 'admin';

  const inputClass = 'w-full px-4 py-2.5 bg-slate-50/70 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs text-slate-900 dark:text-white placeholder-slate-400 transition-all';
  const cardClass = 'bg-white dark:bg-[#121824] rounded-2xl p-6 shadow-xs border border-slate-200/80 dark:border-white/[0.08]';
  const labelClass = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5';

  const renderGeral = () => (
    <div className="space-y-6">
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            {isDarkMode ? <Moon className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" /> : <Sun className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />}
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Aparencia</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Personalize o visual do sistema</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-gray-700' : 'bg-white shadow-sm border border-gray-200'}`}>
              {isDarkMode ? <Moon className="w-5 h-5 text-gray-300" /> : <Sun className="w-5 h-5 text-amber-500" />}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{isDarkMode ? 'Modo Escuro' : 'Modo Claro'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Clique para alternar</p>
            </div>
          </div>
          <div className={`w-12 h-6 rounded-full relative transition-colors ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-300'}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${isDarkMode ? 'left-7' : 'left-1'}`}></div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={cardClass}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Globe className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Idioma</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Idioma da interface</p>
            </div>
          </div>
          <select className={inputClass}>
            <option>Portugues (BR)</option>
            <option>English</option>
            <option>Espanol</option>
          </select>
        </div>

        <div className={cardClass}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Empresa</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Dados da organizacao</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Nome da Empresa</label>
              <input type="text" defaultValue="Hydra System" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Logotipo</label>
              <button className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900/30 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-sm text-gray-500 dark:text-gray-400">
                Clique para enviar logotipo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const renderUsuarios = () => {
    const filteredUsers = teamUsers.filter(u =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
    );

    const getRoleBadge = (role: string) => {
      const styles: Record<string, string> = {
        admin: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
        manager: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
        agent: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
        colaborador: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
      };
      const labels: Record<string, string> = { admin: 'Admin', manager: 'Gerente', agent: 'Agente', colaborador: 'Colaborador' };
      return <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${styles[role] || styles.colaborador}`}>{labels[role] || role}</span>;
    };

    return (
      <div className="space-y-5">
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <UserCog className="w-4.5 h-4.5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Equipe</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {teamUsers.length} usuario{teamUsers.length !== 1 ? 's' : ''} registrado{teamUsers.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowUserModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-sm font-medium rounded-xl shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                Novo Usuario
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-white/[0.08] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900 dark:text-white placeholder-gray-400 transition-all"
            />
          </div>

          {/* Users list */}
          {teamLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((u) => {
                const uid = u.$id || u.id;
                const isExpanded = expandedUser === uid;
                const isCurrentUser = uid === user?.id;

                return (
                  <div key={uid} className="border border-gray-100 dark:border-gray-700/50 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors"
                      onClick={() => {
                        if (!isAdmin || isCurrentUser) return;
                        if (isExpanded) { setExpandedUser(null); return; }
                        setExpandedUser(uid);
                        if (u.role !== 'admin' && !userPermissions[uid]) loadUserPermissions(uid);
                      }}
                    >
                      <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-semibold text-xs shadow-sm">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${u.is_online ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.name}</p>
                          {isCurrentUser && (
                            <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold rounded uppercase">Voce</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoleBadge(u.role)}
                        {isAdmin && !isCurrentUser && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUser(uid, u.name);
                            }}
                            title="Excluir usuário"
                            className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {isAdmin && !isCurrentUser && (
                          isExpanded
                            ? <ChevronUp className="w-4 h-4 text-gray-400" />
                            : <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && isAdmin && !isCurrentUser && (
                      <div className="border-t border-gray-100 dark:border-gray-700/50 px-4 py-4 bg-gray-50/50 dark:bg-gray-900/20">
                        {/* Role management */}
                        <div className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-700/50">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-3">
                            <Shield className="w-3.5 h-3.5 text-amber-500" />
                            Cargo / Funcao
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { value: 'admin', label: 'Admin', desc: 'Acesso total', color: 'red' },
                              { value: 'manager', label: 'Gerente', desc: 'Gestao de equipe', color: 'amber' },
                              { value: 'agent', label: 'Agente', desc: 'Atendimento', color: 'blue' },
                              { value: 'colaborador', label: 'Colaborador', desc: 'Acesso basico', color: 'gray' },
                            ].map(role => {
                              const isActive = u.role === role.value;
                              const colorMap: Record<string, string> = {
                                red: isActive ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-700' : 'border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700',
                                amber: isActive ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700' : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-700',
                                blue: isActive ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700',
                                gray: isActive ? 'border-gray-400 bg-gray-100 dark:bg-gray-700 dark:border-gray-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500',
                              };
                              return (
                                <button
                                  key={role.value}
                                  onClick={(e) => { e.stopPropagation(); changeUserRole(uid, role.value); }}
                                  className={`flex flex-col items-start px-3 py-2 rounded-lg border transition-all ${colorMap[role.color]} ${isActive ? 'ring-1 ring-offset-1 dark:ring-offset-gray-900' : ''}`}
                                  style={isActive ? { borderColor: role.color === 'red' ? '#f87171' : role.color === 'amber' ? '#fbbf24' : role.color === 'blue' ? '#60a5fa' : '#9ca3af' } : {}}
                                >
                                  <span className={`text-[11px] font-semibold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{role.label}</span>
                                  <span className="text-[9px] text-gray-500 dark:text-gray-400">{role.desc}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Permissions - only for non-admin users */}
                        {u.role !== 'admin' && (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5 text-indigo-500" />
                                Permissoes de Menu
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleAllPerms(uid, true); }}
                                  disabled={savingPermissions === uid}
                                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors disabled:opacity-50"
                                >
                                  <Eye className="w-3 h-3" />
                                  Liberar
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleAllPerms(uid, false); }}
                                  disabled={savingPermissions === uid}
                                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                                >
                                  <EyeOff className="w-3 h-3" />
                                  Bloquear
                                </button>
                              </div>
                            </div>

                        {MENU_GROUPS.map(group => (
                          <div key={group.id} className="mb-3">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.label}</p>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5">
                              {ALL_MENU_ITEMS.filter(m => m.group === group.id).map(menu => {
                                const hasAccess = getPermState(uid, menu.id);
                                const Icon = menu.icon;
                                return (
                                  <button
                                    key={menu.id}
                                    onClick={(e) => { e.stopPropagation(); togglePerm(uid, menu.id); }}
                                    disabled={savingPermissions === uid}
                                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all ${
                                      hasAccess
                                        ? 'border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/20'
                                        : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] opacity-60'
                                    } disabled:cursor-wait`}
                                  >
                                    <Icon className={`w-3.5 h-3.5 ${hasAccess ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                                    <span className={`text-[11px] font-medium flex-1 truncate ${
                                      hasAccess ? 'text-gray-900 dark:text-white' : 'text-gray-400 line-through'
                                    }`}>{menu.label}</span>
                                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                                      hasAccess ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-600'
                                    }`}>
                                      {hasAccess ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5 text-gray-400" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderNotificacoes = () => (
    <div className="space-y-6">
      <div className={cardClass}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
            <Bell className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Preferencias de Notificacao</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Controle como voce recebe alertas</p>
          </div>
        </div>

        <div className="space-y-1">
          {[
            { label: 'Notificacoes por e-mail', description: 'Receber resumos e alertas por email', active: true },
            { label: 'Som de notificacao', description: 'Tocar som ao receber mensagens', active: false },
            { label: 'Notificacoes push', description: 'Alertas no navegador em tempo real', active: true },
            { label: 'Resumo diario', description: 'Receber relatorio de atividades do dia', active: false },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.description}</p>
              </div>
              <div className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${item.active ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${item.active ? 'left-6' : 'left-1'}`}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'geral': return renderGeral();
      case 'usuarios': return renderUsuarios();
      case 'notificacoes': return renderNotificacoes();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Configuracoes Internas</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gerencie as integracoes, equipe e preferencias do sistema</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar tabs */}
        <div className="lg:w-64 shrink-0">
          <nav className="bg-white dark:bg-[#121824] rounded-2xl border border-slate-200/80 dark:border-white/[0.08] p-2 shadow-xs space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all ${
                    isActive
                      ? 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{tab.label}</p>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>
      </div>

      {/* User creation modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#121824] rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-white/[0.08]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  <UserCog className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Novo Usuario</h3>
              </div>
              <button
                onClick={() => { setShowUserModal(false); setUserMessage(''); }}
                className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nome Completo</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className={inputClass}
                  placeholder="Digite o nome completo"
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className={inputClass}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <label className={labelClass}>Senha (mínimo 8 caracteres)</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className={inputClass}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label className={labelClass}>Funcao</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className={inputClass}
                >
                  <option value="colaborador">Colaborador</option>
                  <option value="agent">Agente</option>
                  <option value="manager">Gerente</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {userMessage && (
                <div className={`p-3 rounded-xl text-sm ${
                  userMessage.includes('sucesso')
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}>
                  {userMessage}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowUserModal(false); setUserMessage(''); }}
                  className="flex-1 px-4 py-3 bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={loading || !newUser.name || !newUser.email || !newUser.password}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {loading ? 'Criando...' : 'Criar Usuario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
