import {
  ChevronDown,
  LogOut,
  Moon,
  Sun,
  Search,
  Plus,
  Radio,
  Bell,
  Sparkles,
  GitBranch,
  ShieldCheck,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';

interface HeaderProps {
  isSidebarCollapsed?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  currentPage?: string;
  onPageChange?: (page: string) => void;
}

const PAGE_METADATA: Record<string, { title: string; category: string }> = {
  'visao-geral': { title: 'Visão Geral & Métricas', category: 'Dashboard' },
  'crm-pipeline': { title: 'Funil de Vendas (Kanban)', category: 'Pipeline CRM' },
  'crm-contatos': { title: 'Clientes & Oportunidades', category: 'Contatos' },
  'crm-propostas': { title: 'Propostas Comerciais', category: 'Vendas' },
  'crm-contratos': { title: 'Contratos & Assinaturas Digitais', category: 'Vendas' },
  'crm-items': { title: 'Catálogo de Produtos & Serviços', category: 'Itens' },
  'dstrack': { title: 'Central de Chamados & Suporte', category: 'Atendimento' },
  'recursos-catalogo': { title: 'Catálogo de Contatos', category: 'Recursos' },
  'administracao': { title: 'Configurações do Sistema', category: 'Administração' },
  'usuarios': { title: 'Usuários & Permissões', category: 'Segurança' },
};

function Header({
  isSidebarCollapsed,
  sidebarCollapsed,
  onToggleSidebar,
  currentPage = 'visao-geral',
  onPageChange,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);
  const isCollapsed = sidebarCollapsed ?? isSidebarCollapsed ?? false;

  const currentMeta = PAGE_METADATA[currentPage] || {
    title: 'Visão Geral',
    category: 'CRM',
  };

  return (
    <header
      className={`fixed top-0 right-0 ${
        isCollapsed ? 'left-[72px]' : 'left-[270px]'
      } h-16 bg-[#f8fafc]/95 dark:bg-[#0c1017]/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/[0.08] z-40 flex items-center justify-between px-5 transition-all duration-300 shadow-xs`}
    >
      {/* Left: Sidebar Toggle & Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title={isCollapsed ? 'Expandir barra lateral (Ctrl+B)' : 'Recolher barra lateral (Ctrl+B)'}
            className="p-2 -ml-1 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/[0.08] transition-all duration-150 flex items-center justify-center flex-shrink-0"
            aria-label={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          >
            {isCollapsed ? (
              <PanelLeft className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}

        <div className="h-4 w-px bg-slate-300/80 dark:bg-white/[0.1] hidden sm:block" />

        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          <span>{currentMeta.category}</span>
          <span>/</span>
        </div>
        <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight truncate flex items-center gap-2">
          {currentMeta.title}
        </h1>
      </div>

      {/* Right: Quick Search, VoIP Pill, Actions, Theme & Profile */}
      <div className="flex items-center gap-3">
        {/* Live Status indicator */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Realtime Ativo</span>
        </div>

        {/* Quick Action Button */}
        {currentPage === 'crm-pipeline' && (
          <button
            onClick={() => onPageChange?.('crm-pipeline')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-semibold shadow-xs shadow-indigo-600/20 transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Card</span>
          </button>
        )}

        {/* Notification Bell */}
        <div className="flex items-center">
          <NotificationBell
            isCollapsed={false}
            onNavigate={onPageChange || (() => {})}
            currentPage={currentPage || ''}
          />
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={isDarkMode ? 'Mudar para tema Claro' : 'Mudar para tema Escuro'}
          className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600 transition-transform hover:-rotate-12" />
          )}
        </button>

        {/* Vertical divider */}
        <div className="h-6 w-px bg-slate-200 dark:bg-white/[0.08] mx-0.5" />

        {/* User Profile Popover */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-xs shadow-indigo-600/20">
              {(user?.name || 'U')[0].toUpperCase()}
            </div>
            <div className="text-left hidden md:block">
              <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                {user?.name || 'Usuário'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium capitalize">
                {user?.role === 'admin' ? 'Administrador' : 'Operador'}
              </p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 hidden md:block" />
          </button>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <div className="absolute top-full right-0 mt-2 w-60 bg-white dark:bg-[#121722] rounded-2xl border border-slate-200/80 dark:border-white/[0.1] shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-3.5 border-b border-slate-100 dark:border-white/[0.06]">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {user?.email}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Sessão Ativa
                    </span>
                  </div>
                </div>

                <div className="p-1.5 space-y-0.5">
                  <button
                    onClick={() => {
                      onPageChange?.('administracao');
                      setShowDropdown(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-blue-500" />
                    <span>Configurações da Conta</span>
                  </button>

                  <button
                    onClick={() => {
                      logout();
                      setShowDropdown(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sair do sistema</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
