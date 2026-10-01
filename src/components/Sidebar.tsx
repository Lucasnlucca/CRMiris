import {
  LayoutDashboard,
  Users,
  LifeBuoy,
  Settings,
  UserCog,
  FileText,
  BookUser,
  GitBranch,
  Package,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { databases } from '../lib/appwrite';
import { Query } from 'appwrite';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string, referenceId?: string | null) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface MenuSection {
  title: string;
  items: {
    id: string;
    label: string;
    icon: any;
    badge?: number;
    color?: string;
  }[];
}

export default function Sidebar({
  currentPage,
  onPageChange,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const [allowedMenus, setAllowedMenus] = useState<Set<string> | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  useEffect(() => {
    if (!user?.id || user.role === 'admin') {
      setAllowedMenus(null);
      return;
    }
    const loadPermissions = async () => {
      try {
        const { documents: data } = await databases.listDocuments(
          DATABASE_ID,
          'user_menu_permissions',
          [Query.equal('user_id', user.id)]
        );

        if (data && data.length > 0) {
          const denied = new Set(data.filter((p) => !p.has_access).map((p) => p.menu_id));
          setAllowedMenus(denied);
        } else {
          setAllowedMenus(null);
        }
      } catch (error) {
        console.error('Error loading permissions:', error);
        setAllowedMenus(null);
      }
    };
    loadPermissions();
  }, [user?.id, user?.role]);

  const isMenuAllowed = (menuId: string): boolean => {
    if (menuId === 'usuarios' && user?.role !== 'admin') return false;
    if (!allowedMenus || user?.role === 'admin') return true;
    return !allowedMenus.has(menuId);
  };

  const sections: MenuSection[] = [
    {
      title: 'VISÃO GERAL',
      items: [
        { id: 'visao-geral', label: 'Painel Geral', icon: LayoutDashboard, color: 'text-blue-500' },
        { id: 'crm-contatos', label: 'Clientes & Leads', icon: Users, color: 'text-indigo-500' },
      ],
    },
    {
      title: 'VENDAS & PIPELINE',
      items: [
        { id: 'crm-pipeline', label: 'Funil Kanban', icon: GitBranch, color: 'text-emerald-500' },
        { id: 'crm-propostas', label: 'Propostas Comerciais', icon: FileText, color: 'text-amber-500' },
        { id: 'crm-contratos', label: 'Contratos & Assinaturas', icon: FileCheck2, color: 'text-violet-500' },
        { id: 'crm-items', label: 'Itens & Serviços', icon: Package, color: 'text-cyan-500' },
      ],
    },
    {
      title: 'SUPORTE & ATENDIMENTO',
      items: [
        { id: 'dstrack', label: 'Central de Chamados', icon: LifeBuoy, color: 'text-purple-500' },
        { id: 'recursos-catalogo', label: 'Catálogo de Contatos', icon: BookUser, color: 'text-teal-500' },
      ],
    },
    {
      title: 'GESTÃO DO SISTEMA',
      items: [
        { id: 'administracao', label: 'Configurações', icon: Settings, color: 'text-slate-400' },
        { id: 'usuarios', label: 'Usuários & Acessos', icon: UserCog, color: 'text-sky-400' },
      ],
    },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-screen ${
        collapsed ? 'w-[72px]' : 'w-[270px]'
      } bg-white dark:bg-[#0c1017] backdrop-blur-xl flex flex-col z-50 border-r border-slate-200/80 dark:border-white/[0.08] shadow-sm shadow-slate-200/50 dark:shadow-black/20 transition-all duration-300 select-none`}
    >
      {/* Brand Header */}
      <div
        className={`flex items-center ${
          collapsed ? 'justify-center py-4 px-2' : 'justify-between px-4 py-4'
        } border-b border-slate-200/80 dark:border-white/[0.06] flex-shrink-0`}
      >
        <div
          className={`flex items-center gap-3 min-w-0 ${collapsed ? 'justify-center' : ''} cursor-pointer group`}
          onClick={() => onPageChange('visao-geral')}
          title="Ir para Painel Geral"
        >
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800 p-0.5 shadow-md shadow-indigo-500/20 flex items-center justify-center transition-transform group-hover:scale-105">
              <img
                src="/logoicon.png"
                alt="Iris Horizon"
                className="w-full h-full object-contain rounded-lg p-1"
              />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0c1017]" />
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-200 transition-colors">
                  Iris Horizon
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30">
                  CRM
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-medium truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Workspace Ativo
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Menu Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin space-y-4">
        {sections.map((section, sIdx) => {
          const visibleItems = section.items.filter((item) => isMenuAllowed(item.id));
          if (visibleItems.length === 0) return null;
          const isCollapsed = section.title ? collapsedSections.has(section.title) : false;

          return (
            <div key={sIdx} className="space-y-1">
              {section.title && !collapsed && (
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-2.5 py-1 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 group transition-colors"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-600 dark:text-slate-400 dark:group-hover:text-slate-300">
                    {section.title}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300 ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                  />
                </button>
              )}

              {section.title && collapsed && (
                <div className="w-full flex justify-center py-1">
                  <div className="w-6 h-px bg-slate-200 dark:bg-white/[0.08]" />
                </div>
              )}

              <div
                className={`space-y-1 transition-all duration-200 ${
                  !collapsed && isCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'opacity-100'
                }`}
              >
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;

                  if (collapsed) {
                    return (
                      <button
                        key={item.id}
                        onClick={() => onPageChange(item.id)}
                        title={item.label}
                        className={`w-10 h-10 mx-auto flex items-center justify-center rounded-xl transition-all duration-150 relative group ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-600 border border-indigo-200 shadow-xs shadow-indigo-500/10 dark:bg-indigo-600/[0.22] dark:text-indigo-400 dark:border-indigo-500/30 dark:shadow-indigo-500/20'
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06] border border-transparent'
                        }`}
                      >
                        <Icon className={`w-4.5 h-4.5 transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 group-hover:text-slate-800 dark:text-slate-400 dark:group-hover:text-white'}`} />
                        {item.badge && item.badge > 0 && (
                          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full" />
                        )}
                      </button>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => onPageChange(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 group ${
                        isActive
                          ? 'bg-indigo-50/90 text-indigo-700 font-semibold border border-indigo-200/80 shadow-xs shadow-indigo-500/5 dark:bg-indigo-600/[0.14] dark:text-white dark:border-indigo-500/25 dark:shadow-indigo-500/10'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/[0.05] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 flex-shrink-0 transition-colors ${
                            isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 group-hover:text-slate-800 dark:text-slate-400 dark:group-hover:text-slate-200'
                          }`}
                        />
                        <span className="truncate tracking-tight">{item.label}</span>
                      </div>

                      {item.badge && item.badge > 0 ? (
                        <span className="min-w-[18px] h-4.5 flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 bg-indigo-600 text-white shadow-xs">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      ) : isActive ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shadow-[0_0_8px_rgba(79,70,229,0.6)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Sidebar Footer with Collapse Action and User Chip */}
      <div className="p-3 border-t border-slate-200/80 dark:border-white/[0.06] flex-shrink-0">
        {/* Modern Sidebar Collapse Button */}
        {onToggleCollapse && (
          collapsed ? (
            <button
              onClick={onToggleCollapse}
              title="Expandir barra lateral (Ctrl+B)"
              className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-white/[0.08] transition-all mb-2"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onToggleCollapse}
              title="Recolher barra lateral (Ctrl+B)"
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/[0.06] transition-all group mb-2 border border-transparent hover:border-slate-200/80 dark:hover:border-white/[0.06]"
            >
              <div className="flex items-center gap-2.5">
                <PanelLeftClose className="w-4 h-4 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-white transition-colors" />
                <span className="text-[12px] font-medium tracking-tight">Recolher barra lateral</span>
              </div>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-white/[0.08] group-hover:text-slate-700 dark:group-hover:text-slate-300">
                Ctrl+B
              </kbd>
            </button>
          )
        )}

        {/* User Chip */}
        <div
          className={`flex items-center ${
            collapsed ? 'justify-center' : 'justify-between'
          } p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.05]`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-xs">
                {(user?.name || 'U')[0].toUpperCase()}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#0c1017] ${
                  user?.is_online ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
            </div>
            {!collapsed && (
              <div className="min-w-0 text-left">
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                  {user?.name || 'Usuário'}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize truncate">
                  {user?.role === 'admin' ? 'Administrador' : 'Operador'}
                </p>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              onClick={logout}
              title="Sair do Sistema"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
