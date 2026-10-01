import { useState, useEffect } from 'react';
import {
  Users,
  UserCog,
  Plus,
  Search,
  Shield,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Eye,
  EyeOff,
  LayoutDashboard,
  MessageSquare,
  Phone,
  Briefcase,
  TrendingUp,
  Package,
  Zap,
  MessageCircle,
  Settings,
  Trash2,
  Power,
} from 'lucide-react';
import { databases, client } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { createNewUser, deleteUser as removeUser, toggleUserStatus } from '../lib/userManagement';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';

interface UserHydra {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_online?: boolean;
  created_at: string;
}

interface MenuPermission {
  menu_id: string;
  has_access: boolean;
}

interface NewUserForm {
  name: string;
  email: string;
  password: string;
  role: string;
}

const ALL_MENUS = [
  { id: 'visao-geral', label: 'Dashboard', icon: LayoutDashboard, parent: null },
  { id: 'crm-contatos', label: 'CRM - Clientes', icon: Users, parent: 'crm' },
  { id: 'crm-negocios', label: 'CRM - Negocios', icon: Users, parent: 'crm' },
  { id: 'crm-pipeline', label: 'CRM - Pipeline', icon: Users, parent: 'crm' },
  { id: 'crm-items', label: 'CRM - Itens', icon: Users, parent: 'crm' },
  { id: 'crm-propostas', label: 'CRM - Propostas', icon: Users, parent: 'crm' },
  { id: 'dstrack', label: 'Suporte', icon: TrendingUp, parent: null },
  { id: 'recursos-catalogo', label: 'Recursos - Catalogo', icon: Package, parent: 'recursos' },
  { id: 'recursos-produtos', label: 'Recursos - Produtos', icon: Package, parent: 'recursos' },
  { id: 'recursos-estoque', label: 'Recursos - Estoque', icon: Package, parent: 'recursos' },
  { id: 'automacoes', label: 'Automacoes', icon: Zap, parent: null },
  { id: 'administracao', label: 'Configuracoes Internas', icon: Settings, parent: null },
  { id: 'parceiros-afiliados', label: 'Parceiros - Afiliados', icon: Briefcase, parent: 'parceiros' },
  { id: 'parceiros-revendas', label: 'Parceiros - Revendas', icon: Briefcase, parent: 'parceiros' },
  { id: 'parceiros-api', label: 'Parceiros - API Publica', icon: Briefcase, parent: 'parceiros' },
];

const MENU_GROUPS = [
  { id: 'main', label: 'Menus Principais', menus: ALL_MENUS.filter(m => !m.parent) },
  { id: 'crm', label: 'CRM', menus: ALL_MENUS.filter(m => m.parent === 'crm') },
  { id: 'recursos', label: 'Recursos', menus: ALL_MENUS.filter(m => m.parent === 'recursos') },
  { id: 'parceiros', label: 'Parceiros', menus: ALL_MENUS.filter(m => m.parent === 'parceiros') },
];

export default function Usuarios() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserHydra[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, MenuPermission[]>>({});
  const [savingPermissions, setSavingPermissions] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState<NewUserForm>({ name: '', email: '', password: '', role: 'colaborador' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createMessage, setCreateMessage] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Acesso restrito a administradores</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    loadUsers();

    const usersChannel = `databases.${DATABASE_ID}.collections.users_hydra.documents`;
    const permissionsChannel = `databases.${DATABASE_ID}.collections.user_menu_permissions.documents`;

    const unsubscribe = client.subscribe([usersChannel, permissionsChannel], (response: any) => {
      const events: string[] = response.events || [];
      const payload = response.payload;
      if (!payload) return;

      if (events.some((e: string) => e.includes('users_hydra'))) {
        if (events.some((e: string) => e.includes('.create'))) {
          const newU: UserHydra = {
            id: payload.$id,
            name: payload.name,
            email: payload.email,
            role: payload.role,
            is_active: payload.is_active,
            is_online: payload.is_online,
            created_at: payload.created_at,
          };
          setUsers((prev) => {
            if (prev.some((u) => u.id === newU.id)) return prev;
            return [...prev, newU];
          });
        } else if (events.some((e: string) => e.includes('.update'))) {
          const updatedU: UserHydra = {
            id: payload.$id,
            name: payload.name,
            email: payload.email,
            role: payload.role,
            is_active: payload.is_active,
            is_online: payload.is_online,
            created_at: payload.created_at,
          };
          setUsers((prev) =>
            prev.map((u) => (u.id === updatedU.id ? { ...u, ...updatedU } : u))
          );
        } else if (events.some((e: string) => e.includes('.delete'))) {
          setUsers((prev) => prev.filter((u) => u.id !== payload.$id));
        }
      }

      if (events.some((e: string) => e.includes('user_menu_permissions'))) {
        if (payload.user_id) {
          loadPermissions(payload.user_id);
        }
      }
    });

    return () => {
      try {
        unsubscribe();
      } catch (e) {}
    };
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { documents } = await databases.listDocuments(
        DATABASE_ID,
        'users_hydra',
        [Query.orderAsc('created_at'), Query.limit(100)]
      );
      setUsers(documents.map(d => ({
         id: d.$id,
         name: d.name,
         email: d.email,
         role: d.role,
         is_active: d.is_active,
         is_online: d.is_online,
         created_at: d.created_at
      })));
    } catch (error) {
      console.error('Error loading users:', error);
    }
    setLoading(false);
  };

  const loadPermissions = async (userId: string) => {
    try {
      const { documents } = await databases.listDocuments(
        DATABASE_ID,
        'user_menu_permissions',
        [Query.equal('user_id', userId), Query.limit(100)]
      );
      setUserPermissions(prev => ({ ...prev, [userId]: documents.map(d => ({ menu_id: d.menu_id, has_access: d.has_access })) }));
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  };

  const toggleUserExpand = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    if (!userPermissions[userId]) {
      await loadPermissions(userId);
    }
  };

  const getPermissionState = (userId: string, menuId: string): boolean => {
    const perms = userPermissions[userId];
    if (!perms) return true;
    const perm = perms.find(p => p.menu_id === menuId);
    if (!perm) return true;
    return perm.has_access;
  };

  const togglePermission = async (userId: string, menuId: string) => {
    if (!isAdmin) return;

    const currentState = getPermissionState(userId, menuId);
    const newState = !currentState;

    setSavingPermissions(userId);

    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, 'user_menu_permissions', [
        Query.equal('user_id', userId),
        Query.equal('menu_id', menuId),
        Query.limit(1)
      ]);
      if (documents.length > 0) {
        await databases.updateDocument(DATABASE_ID, 'user_menu_permissions', documents[0].$id, { has_access: newState });
      } else {
        await databases.createDocument(DATABASE_ID, 'user_menu_permissions', ID.unique(), { user_id: userId, menu_id: menuId, has_access: newState });
      }
      setUserPermissions(prev => {
        const current = prev[userId] || [];
        const existing = current.findIndex(p => p.menu_id === menuId);
        if (existing >= 0) {
          const updated = [...current];
          updated[existing] = { menu_id: menuId, has_access: newState };
          return { ...prev, [userId]: updated };
        }
        return { ...prev, [userId]: [...current, { menu_id: menuId, has_access: newState }] };
      });
    } catch (error) {
      console.error('Error toggling permission:', error);
    }

    setSavingPermissions(null);
  };

  const toggleAllPermissions = async (userId: string, grant: boolean) => {
    if (!isAdmin) return;
    setSavingPermissions(userId);

    const records = ALL_MENUS.map(menu => ({
      user_id: userId,
      menu_id: menu.id,
      has_access: grant,
    }));

    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, 'user_menu_permissions', [
        Query.equal('user_id', userId),
        Query.limit(100)
      ]);
      
      await Promise.all(ALL_MENUS.map(async (menu) => {
        const existing = documents.find(d => d.menu_id === menu.id);
        if (existing) {
           await databases.updateDocument(DATABASE_ID, 'user_menu_permissions', existing.$id, { has_access: grant });
        } else {
           await databases.createDocument(DATABASE_ID, 'user_menu_permissions', ID.unique(), { user_id: userId, menu_id: menu.id, has_access: grant });
        }
      }));
      setUserPermissions(prev => ({
        ...prev,
        [userId]: ALL_MENUS.map(m => ({ menu_id: m.id, has_access: grant })),
      }));
    } catch (error) {
      console.error('Error toggling all permissions:', error);
    }

    setSavingPermissions(null);
  };

  const handleCreateUser = async () => {
    setCreateLoading(true);
    setCreateMessage('');
    try {
      if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password) {
        throw new Error('Preencha todos os campos obrigatórios.');
      }
      if (newUser.password.length < 8) {
        throw new Error('A senha deve ter pelo menos 8 caracteres (requisito de segurança do Appwrite).');
      }

      const createdUser = await createNewUser(newUser);

      setUsers((prev) => {
        if (prev.some((u) => u.id === createdUser.id)) return prev;
        return [...prev, createdUser];
      });

      // Conceder permissões padrão de menu para o novo usuário
      try {
        await Promise.all(ALL_MENUS.map((menu) => 
          databases.createDocument(DATABASE_ID, 'user_menu_permissions', ID.unique(), {
            user_id: createdUser.id,
            menu_id: menu.id,
            has_access: true,
          })
        ));
      } catch (permErr) {
        console.warn('Erro ao configurar permissões padrão:', permErr);
      }

      setCreateMessage('Usuário criado com sucesso!');
      setNewUser({ name: '', email: '', password: '', role: 'colaborador' });
      await loadUsers();
      setTimeout(() => {
        setShowCreateModal(false);
        setCreateMessage('');
      }, 1000);
    } catch (error: any) {
      setCreateMessage(error.message || 'Erro ao criar usuário');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o usuário "${userName}"?`)) return;
    try {
      await removeUser(userId);
      await loadUsers();
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir usuário');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const newStatus = await toggleUserStatus(userId, currentStatus);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: newStatus } : u));
    } catch (error: any) {
      alert(error.message || 'Erro ao alterar status');
    }
  };

  const getRoleBadge = (role: string) => {
    const styles: Record<string, string> = {
      admin: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      manager: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
      agent: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      colaborador: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    };
    const labels: Record<string, string> = {
      admin: 'Administrador',
      manager: 'Gerente',
      agent: 'Agente',
      colaborador: 'Colaborador',
    };
    return (
      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${styles[role] || styles.colaborador}`}>
        {labels[role] || role}
      </span>
    );
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inputClass = 'w-full px-4 py-2.5 bg-slate-50/70 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs text-slate-900 dark:text-white placeholder-slate-400 transition-all';
  const labelClass = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Usuários da Equipe</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gerencie os usuários registrados e controle as permissões de acesso aos módulos
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shadow-indigo-500/25"
          >
            <Plus className="w-4 h-4" />
            Novo Usuário
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs text-slate-900 dark:text-white placeholder-slate-400 transition-all shadow-xs"
        />
      </div>

      {/* Users list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhum usuario encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => {
            const isExpanded = expandedUser === u.id;
            const isCurrentUser = u.id === currentUser?.id;

            return (
              <div
                key={u.id}
                className="bg-white dark:bg-[#121824] rounded-2xl border border-slate-200/80 dark:border-white/[0.08] overflow-hidden shadow-xs transition-all"
              >
                {/* User row */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors"
                  onClick={() => isAdmin && u.role !== 'admin' && toggleUserExpand(u.id)}
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-xs shadow-xs ring-1 ring-white/20">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#121824] ${
                      u.is_online ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}></div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {u.name}
                      </p>
                      {isCurrentUser && (
                        <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-md uppercase border border-indigo-500/20">
                          Você
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-2">
                      {getRoleBadge(u.role)}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isCurrentUser) handleToggleStatus(u.id, u.is_active);
                        }}
                        disabled={isCurrentUser}
                        title={u.is_active ? "Desativar usuário" : "Ativar usuário"}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          u.is_active
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200/60'
                        } ${isCurrentUser ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        {u.is_active ? 'Ativo' : 'Inativo'}
                      </button>
                      {isAdmin && !isCurrentUser && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteUser(u.id, u.name);
                          }}
                          title="Excluir usuário"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {isAdmin && u.role !== 'admin' && (
                      <div className="flex items-center gap-1 text-slate-400 pl-1">
                        <Shield className="w-4 h-4" />
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Permissions panel */}
                {isExpanded && isAdmin && (
                  <div className="border-t border-slate-100 dark:border-white/[0.06] px-5 py-5 bg-slate-50/50 dark:bg-white/[0.01]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-indigo-500" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          Permissões de Módulos
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleAllPermissions(u.id, true); }}
                          disabled={savingPermissions === u.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors disabled:opacity-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Liberar Todos
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleAllPermissions(u.id, false); }}
                          disabled={savingPermissions === u.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          Bloquear Todos
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {MENU_GROUPS.map(group => (
                        <div key={group.id}>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            {group.label}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {group.menus.map(menu => {
                              const hasAccess = getPermissionState(u.id, menu.id);
                              const Icon = menu.icon;
                              return (
                                <button
                                  key={menu.id}
                                  onClick={(e) => { e.stopPropagation(); togglePermission(u.id, menu.id); }}
                                  disabled={savingPermissions === u.id}
                                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                                    hasAccess
                                      ? 'border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-950/20'
                                      : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] opacity-60'
                                  } hover:shadow-sm disabled:cursor-wait`}
                                >
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                    hasAccess
                                      ? 'bg-indigo-100 dark:bg-indigo-950/40'
                                      : 'bg-gray-100 dark:bg-white/[0.04]'
                                  }`}>
                                    <Icon className={`w-3.5 h-3.5 ${
                                      hasAccess ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'
                                    }`} />
                                  </div>
                                  <span className={`text-xs font-medium flex-1 ${
                                    hasAccess
                                      ? 'text-gray-900 dark:text-white'
                                      : 'text-gray-500 dark:text-gray-400 line-through'
                                  }`}>
                                    {menu.label}
                                  </span>
                                  <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                                    hasAccess
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : 'bg-slate-200 dark:bg-white/10'
                                  }`}>
                                    {hasAccess ? <Check className="w-3 h-3 stroke-[3]" /> : <X className="w-3 h-3 text-slate-400" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create user modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#121824] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200/80 dark:border-white/[0.08]">
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-white/[0.06] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  <UserCog className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Novo Usuário</h3>
              </div>
              <button
                onClick={() => { setShowCreateModal(false); setCreateMessage(''); }}
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
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
                <label className={labelClass}>Função</label>
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

              {createMessage && (
                <div className={`p-3 rounded-xl text-xs font-semibold ${
                  createMessage.includes('sucesso')
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                }`}>
                  {createMessage}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowCreateModal(false); setCreateMessage(''); }}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={createLoading || !newUser.name || !newUser.email || !newUser.password}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold"
                >
                  {createLoading ? 'Criando...' : 'Criar Usuário'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
