import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bell,
  BookUser,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Globe2,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Package,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  UserCog,
  Wallet,
} from 'lucide-react';
import { Query } from 'appwrite';
import { useApp } from '../context/AppContext';
import { Avatar, EmptyState, Modal, SearchInput } from '../components/ui';
import type { Role } from '../types';
import { effectiveChargeStatus } from '../utils/finance';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { databases, DATABASE_ID } from '../../lib/appwrite';
import TenantSelector from '../../components/TenantSelector';

export const roleNames: Record<Role, string> = {
  admin: 'Administrador',
  support: 'Suporte Técnico',
  finance: 'Financeiro',
  client: 'Portal do Cliente',
};

export function Brand({ tenant }: { tenant?: any }) {
  const displayTitle = tenant?.trade_name || tenant?.name || 'Iris Horizon CRM';
  const domainText = tenant?.slug ? `${tenant.slug}.lvplataform.com.br` : 'Central de Operações & CRM';
  return (
    <div className="brand" title={`${displayTitle} (${domainText})`}>
      {tenant?.logo_url ? (
        <img
          src={tenant.logo_url}
          alt={displayTitle}
          className="brand-logo-img h-9 max-h-9 w-auto max-w-[140px] object-contain rounded-xl flex-shrink-0"
        />
      ) : (
        <div
          className="brand-symbol"
          style={tenant?.primary_color ? { backgroundColor: tenant.primary_color } : undefined}
        >
          <PhoneCall size={21} strokeWidth={1.7} />
        </div>
      )}
      <div className="brand-copy">
        <div className="brand-name" title={displayTitle}>
          {displayTitle ? (
            <span>{displayTitle}</span>
          ) : (
            <>
              Iris <span>Horizon CRM</span>
            </>
          )}
        </div>
        <div className="brand-subtitle" title={domainText}>
          {domainText}
        </div>
      </div>
    </div>
  );
}

interface NavItemDef {
  menuId: string;
  path: string;
  label: string;
  icon: any;
  color?: string;
  roles: string[];
  superAdminOnly?: boolean;
}

interface NavCategoryDef {
  id: string;
  label: string;
  icon: any;
  color?: string;
  items: NavItemDef[];
  superAdminOnly?: boolean;
}

const topItemDef: NavItemDef = {
  menuId: 'visao-geral',
  path: '/',
  label: 'Dashboard',
  icon: LayoutDashboard,
  color: '#4f46e5',
  roles: ['admin', 'support', 'finance'],
};

const portalTopItemDef: NavItemDef = {
  menuId: 'portal',
  path: '/portal',
  label: 'Dashboard',
  icon: LayoutDashboard,
  color: '#4f46e5',
  roles: ['client'],
};

const navCategories: NavCategoryDef[] = [
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: ClipboardList,
    color: '#10b981',
    items: [
      {
        menuId: 'crm-contatos',
        path: '/clientes',
        label: 'Clientes',
        icon: Building2,
        color: '#f59e0b',
        roles: ['admin', 'support', 'finance'],
      },
      {
        menuId: 'dstrack',
        path: '/tickets',
        label: 'Chamados',
        icon: Ticket,
        color: '#06b6d4',
        roles: ['admin', 'support'],
      },
      {
        menuId: 'agenda',
        path: '/agenda',
        label: 'Agenda Operacional',
        icon: CalendarDays,
        color: '#10b981',
        roles: ['admin', 'support', 'finance'],
      },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial & Vendas',
    icon: TrendingUp,
    color: '#3b82f6',
    items: [
      {
        menuId: 'crm-pipeline',
        path: '/pipeline',
        label: 'Funil de Vendas',
        icon: GitBranch,
        color: '#3b82f6',
        roles: ['admin', 'support', 'finance'],
      },
      {
        menuId: 'crm-propostas',
        path: '/propostas',
        label: 'Propostas Comerciais',
        icon: FileCheck2,
        color: '#8b5cf6',
        roles: ['admin', 'support', 'finance'],
      },
      {
        menuId: 'crm-contratos',
        path: '/contratos-crm',
        label: 'Contratos & Assinaturas',
        icon: ShieldCheck,
        color: '#10b981',
        roles: ['admin', 'support', 'finance'],
      },
      {
        menuId: 'crm-items',
        path: '/itens',
        label: 'Catálogo de Produtos',
        icon: Package,
        color: '#f97316',
        roles: ['admin', 'support'],
      },
      {
        menuId: 'recursos-catalogo',
        path: '/catalogo',
        label: 'Agenda Telefônica',
        icon: BookUser,
        color: '#ec4899',
        roles: ['admin', 'support'],
      },
    ],
  },
  {
    id: 'arquivos-operacoes',
    label: 'Arquivos & Operações',
    icon: Folder,
    color: '#06b6d4',
    items: [
      {
        menuId: 'documentos',
        path: '/documentos',
        label: 'Arquivos & Documentos',
        icon: FolderOpen,
        color: '#0ea5e9',
        roles: ['admin', 'support', 'finance'],
      },
      {
        menuId: 'servidores',
        path: '/servidores',
        label: 'Servidores & Domínios',
        icon: Server,
        color: '#6366f1',
        roles: ['admin', 'support'],
      },
      {
        menuId: 'monitoramento',
        path: '/monitoramento',
        label: 'Monitoramento de Rede',
        icon: Activity,
        color: '#10b981',
        roles: ['admin', 'support'],
      },
      {
        menuId: 'servicos',
        path: '/servicos',
        label: 'Serviços Contratados',
        icon: Layers3,
        color: '#8b5cf6',
        roles: ['admin', 'support'],
      },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
    color: '#f59e0b',
    items: [
      {
        menuId: 'financeiro',
        path: '/financeiro',
        label: 'Cobranças & Faturamento',
        icon: Wallet,
        color: '#10b981',
        roles: ['admin', 'finance'],
      },
    ],
  },
  {
    id: 'administracao',
    label: 'Configurações & Sistema',
    icon: Settings2,
    color: '#8b5cf6',
    items: [
      {
        menuId: 'automacoes',
        path: '/automacoes',
        label: 'Automações & Integrações',
        icon: Sparkles,
        color: '#ec4899',
        roles: ['admin'],
      },
      {
        menuId: 'usuarios',
        path: '/usuarios',
        label: 'Usuários & Permissões',
        icon: UserCog,
        color: '#3b82f6',
        roles: ['admin'],
      },
      {
        menuId: 'administracao',
        path: '/configuracoes',
        label: 'Configurações da Empresa',
        icon: Settings2,
        color: '#64748b',
        roles: ['admin'],
      },
    ],
  },
  {
    id: 'superadmin',
    label: 'Governança SuperAdmin',
    icon: ShieldAlert,
    color: '#6366f1',
    superAdminOnly: true,
    items: [
      {
        menuId: 'superadmin-dashboard',
        path: '/empresas?tab=dashboard',
        label: 'Dashboard Master',
        icon: LayoutDashboard,
        color: '#4f46e5',
        roles: ['admin'],
        superAdminOnly: true,
      },
      {
        menuId: 'superadmin-tenants',
        path: '/empresas?tab=tenants',
        label: 'Clientes (CRMs)',
        icon: Building2,
        color: '#0ea5e9',
        roles: ['admin'],
        superAdminOnly: true,
      },
      {
        menuId: 'superadmin-branding',
        path: '/empresas?tab=branding',
        label: 'Personalização do CRM',
        icon: Palette,
        color: '#f59e0b',
        roles: ['admin'],
        superAdminOnly: true,
      },
      {
        menuId: 'superadmin-policy',
        path: '/empresas?tab=policy',
        label: 'Políticas & Disjuntores',
        icon: ShieldCheck,
        color: '#ef4444',
        roles: ['admin'],
        superAdminOnly: true,
      },
    ],
  },
];

const portalCategories: NavCategoryDef[] = [
  {
    id: 'portal-arquivos',
    label: 'Arquivos & Atendimento',
    icon: Folder,
    color: '#0ea5e9',
    items: [
      {
        menuId: 'portal-tickets',
        path: '/portal/tickets',
        label: 'Meus Chamados',
        icon: Ticket,
        color: '#06b6d4',
        roles: ['client'],
      },
      {
        menuId: 'portal-docs',
        path: '/portal/documentos',
        label: 'Meus Documentos',
        icon: FileText,
        color: '#3b82f6',
        roles: ['client'],
      },
      {
        menuId: 'portal-fin',
        path: '/portal/financeiro',
        label: 'Minhas Faturas',
        icon: Wallet,
        color: '#10b981',
        roles: ['client'],
      },
    ],
  },
];

function normalize(v: string) {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function AppLayout() {
  const { data, session, logout, notify } = useApp();
  const { user: authUser, logout: authLogout } = useAuth();
  const { tenant, isSuperAdmin } = useTenant();
  const role = session?.role ?? 'admin';
  const navigate = useNavigate();
  // Menu recolhido por padrão com auto-expansão ao passar o mouse por cima
  const [pinned, setPinned] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar_pinned') === 'true';
    }
    return false;
  });
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef<any>(null);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      setHovered(false);
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const isExpanded = pinned || hovered;
  const isCollapsed = !isExpanded;
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [deniedUserMenus, setDeniedUserMenus] = useState<Set<string> | null>(null);

  // Estado das pastas / categorias abertas
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('crm_sidebar_open_folders');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {
      cadastros: true,
      comercial: true,
      'arquivos-operacoes': true,
      financeiro: true,
      administracao: true,
      superadmin: true,
      'portal-arquivos': true,
    };
  });

  const toggleFolder = (folderId: string) => {
    setOpenFolders((prev) => {
      const next = { ...prev, [folderId]: !prev[folderId] };
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('crm_sidebar_open_folders', JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  const profileRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobile(false);
    setProfileOpen(false);
    setNotificationsOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    if (!authUser?.id || isSuperAdmin) {
      setDeniedUserMenus(null);
      return;
    }
    let active = true;
    const loadPermissions = async () => {
      try {
        const queries = [Query.equal('user_id', authUser.id), Query.limit(100)];
        if (tenant?.id) {
          queries.push(Query.equal('tenant_id', tenant.id));
        }
        const { documents } = await databases.listDocuments(
          DATABASE_ID,
          'user_menu_permissions',
          queries
        );
        if (!active) return;
        if (documents && documents.length > 0) {
          const denied = new Set(documents.filter((p) => !p.has_access).map((p) => p.menu_id));
          setDeniedUserMenus(denied);
        } else {
          setDeniedUserMenus(null);
        }
      } catch {
        if (active) setDeniedUserMenus(null);
      }
    };
    void loadPermissions();
    return () => {
      active = false;
    };
  }, [authUser?.id, tenant?.id, isSuperAdmin]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setProfileOpen(false);
        setNotificationsOpen(false);
        setMobile(false);
      }
    };
    const outside = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
      if (!bellRef.current?.contains(e.target as Node)) setNotificationsOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('mousedown', outside);
    };
  }, []);

  let companyAllowedMenus: Set<string> | null = null;
  if (tenant?.settings_json) {
    try {
      const parsed = JSON.parse(tenant.settings_json);
      if (Array.isArray(parsed.allowed_menus)) {
        companyAllowedMenus = new Set(parsed.allowed_menus);
      }
    } catch {}
  }

  const isMenuPermitted = (item: NavItemDef): boolean => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (isSuperAdmin) return true;
    if (!item.roles.includes(role)) return false;

    if (companyAllowedMenus && companyAllowedMenus.has(item.menuId) === false) {
      // Compatibilidade para novos módulos operacionais caso o JSON da empresa seja anterior
      const newOperationalIds = new Set(['agenda', 'servidores', 'monitoramento', 'servicos', 'documentos', 'financeiro']);
      const hasAnyNewIdConfigured = Array.from(companyAllowedMenus).some((id) => newOperationalIds.has(id));
      if (!newOperationalIds.has(item.menuId) || hasAnyNewIdConfigured) {
        return false;
      }
    }

    if (deniedUserMenus && deniedUserMenus.has(item.menuId)) {
      return false;
    }

    return true;
  };

  const user = data.users.find((u) => u.id === session?.userId);
  const client = data.clients.find((c) => c.id === session?.clientId);
  const userName =
    role === 'client'
      ? client?.tradeName || client?.name || 'Cliente'
      : authUser?.name || user?.name || 'Administrador';

  const topItem = role === 'client' ? portalTopItemDef : topItemDef;
  const categoriesDef = role === 'client' ? portalCategories : navCategories;

  const activeCategories = categoriesDef
    .map((cat) => ({
      ...cat,
      items: cat.items.filter(isMenuPermitted),
    }))
    .filter((cat) => {
      if (cat.superAdminOnly && !isSuperAdmin) return false;
      return cat.items.length > 0;
    });

  const allActiveNavItems: NavItemDef[] = [
    topItem,
    ...activeCategories.flatMap((cat) => cat.items),
  ];

  // Auto-abre a pasta da rota atual APENAS quando há transição de rota (navegação para outra página),
  // permitindo que o usuário feche a pasta livremente se desejar, mesmo estando com uma página dela ativa.
  const lastNavigatedPath = useRef<string>(location.pathname);
  useEffect(() => {
    // Se a rota não mudou (ex: re-render por fechar/abrir pasta), não força reabertura
    if (lastNavigatedPath.current === location.pathname) {
      return;
    }
    lastNavigatedPath.current = location.pathname;

    const matchingCat = activeCategories.find((cat) =>
      cat.items.some((item) =>
        item.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.path)
      )
    );
    if (matchingCat) {
      setOpenFolders((prev) => {
        if (prev[matchingCat.id]) return prev;
        const next = { ...prev, [matchingCat.id]: true };
        try {
          localStorage.setItem('crm_sidebar_open_folders', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, [location.pathname]);

  const openTickets = data.tickets.filter(
    (t) =>
      !['Resolvido', 'Cancelado'].includes(t.status) &&
      (role !== 'client' || t.clientId === session?.clientId),
  );
  const overdue = data.charges.filter(
    (c) =>
      effectiveChargeStatus(c) === 'Vencido' &&
      (role !== 'client' || c.clientId === session?.clientId),
  );
  const isItemActive = (itemPath: string, isActiveByRouter: boolean) => {
    if (itemPath.includes('?')) {
      const [base, query] = itemPath.split('?');
      if (location.pathname !== base) return false;
      const targetParams = new URLSearchParams(query);
      const currentParams = new URLSearchParams(location.search);
      const targetTab = targetParams.get('tab');
      const currentTab = currentParams.get('tab') || 'dashboard';
      return targetTab === currentTab;
    }
    return isActiveByRouter;
  };

  const navLabel =
    [...allActiveNavItems]
      .sort((a, b) => b.path.length - a.path.length)
      .find((n) => {
        if (n.path === '/' || n.path === '/portal') return false;
        if (n.path.includes('?')) {
          const [base, query] = n.path.split('?');
          if (location.pathname !== base) return false;
          const targetTab = new URLSearchParams(query).get('tab');
          const currentTab = new URLSearchParams(location.search).get('tab') || 'dashboard';
          return targetTab === currentTab;
        }
        return location.pathname.startsWith(n.path);
      })?.label ??
    (location.pathname === '/' || location.pathname === '/portal' ? 'Dashboard' : 'Página');

  const entityId = location.pathname.split('/').filter(Boolean).at(-1);
  const visibleTicket = location.pathname.includes('/tickets/')
    ? data.tickets.find(
        (t) => t.id === entityId && (role !== 'client' || t.clientId === session?.clientId),
      )
    : undefined;
  const visibleClient =
    role !== 'client' && location.pathname.startsWith('/clientes/')
      ? data.clients.find((c) => c.id === entityId)
      : undefined;
  const visibleServer =
    (role === 'admin' || role === 'support') && location.pathname.startsWith('/servidores/')
      ? data.servers.find((s) => s.id === entityId)
      : undefined;
  const entity =
    visibleClient?.tradeName ||
    visibleClient?.name ||
    (visibleTicket ? `Chamado #${visibleTicket.number}` : '') ||
    visibleServer?.name;

  const q = normalize(search.trim());
  const results: {
    id: string;
    title: string;
    subtitle: string;
    kind: string;
    path: string;
    icon: typeof Ticket;
  }[] = [];
  if (q) {
    if (role !== 'client')
      data.clients
        .filter((c) => normalize(`${c.name} ${c.tradeName} ${c.document}`).includes(q))
        .forEach((c) =>
          results.push({
            id: `c-${c.id}`,
            title: c.tradeName || c.name,
            subtitle: c.name,
            kind: 'Cliente',
            path: `/clientes/${c.id}`,
            icon: Building2,
          }),
        );
    if (role !== 'finance')
      data.tickets
        .filter(
          (t) =>
            (role !== 'client' || t.clientId === session?.clientId) &&
            normalize(`${t.number} ${t.title}`).includes(q),
        )
        .forEach((t) =>
          results.push({
            id: `t-${t.id}`,
            title: `#${t.number} · ${t.title}`,
            subtitle: t.status,
            kind: 'Chamado',
            path: `${role === 'client' ? '/portal' : ''}/tickets/${t.id}`,
            icon: Ticket,
          }),
        );
    if (role === 'admin' || role === 'support')
      data.servers.forEach((s) => {
        if (normalize(`${s.name} ${s.platform}`).includes(q))
          results.push({
            id: `s-${s.id}`,
            title: s.name,
            subtitle: s.platform,
            kind: 'Servidor',
            path: `/servidores/${s.id}`,
            icon: Server,
          });
        if (normalize(s.domain).includes(q))
          results.push({
            id: `d-${s.id}`,
            title: s.domain,
            subtitle: s.name,
            kind: 'Domínio',
            path: `/servidores/${s.id}`,
            icon: Globe2,
          });
      });
    data.documents
      .filter(
        (d) =>
          (role !== 'client' || (d.clientId === session?.clientId && d.shared)) &&
          normalize(`${d.name} ${d.number || ''} ${d.category}`).includes(q),
      )
      .forEach((d) =>
        results.push({
          id: `doc-${d.id}`,
          title: d.name,
          subtitle: d.category,
          kind: 'Documento',
          path: `${role === 'client' ? '/portal' : ''}/documentos?id=${d.id}`,
          icon: FileText,
        }),
      );
  }

  const notifications: { title: string; subtitle: string; path: string }[] = [];
  if (role !== 'finance')
    openTickets
      .filter((t) => t.priority === 'Crítica' || role === 'client')
      .slice(0, 3)
      .forEach((t) =>
        notifications.push({
          title: `#${t.number} · ${t.title}`,
          subtitle: `${t.priority} · ${t.status}`,
          path: `${role === 'client' ? '/portal' : ''}/tickets/${t.id}`,
        }),
      );
  if (role !== 'support' && overdue.length)
    notifications.push({
      title: `${overdue.length} cobrança${overdue.length > 1 ? 's' : ''} vencida${overdue.length > 1 ? 's' : ''}`,
      subtitle: 'Confira o resumo financeiro',
      path: `${role === 'client' ? '/portal' : ''}/financeiro?status=Vencido`,
    });
  if (role === 'admin' || role === 'support')
    data.servers
      .filter((s) => s.status === 'Indisponível' || s.status === 'Em atenção')
      .slice(0, 2)
      .forEach((s) =>
        notifications.push({
          title: s.name,
          subtitle: `Ambiente ${s.status.toLowerCase()}`,
          path: `/servidores/${s.id}`,
        }),
      );

  return (
    <div
      className={`app-shell ${!pinned ? 'shell-collapsed' : ''} ${mobile ? 'mobile-open' : ''} ${data.settings.density === 'compact' ? 'compact' : ''}`}
      style={{
        '--tenant-primary-color': tenant?.primary_color || '#4f46e5',
        '--primary': tenant?.primary_color || '#4f46e5',
      } as React.CSSProperties}
    >
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      <button
        className={`mobile-overlay ${mobile ? 'open' : ''}`}
        aria-label="Fechar menu lateral"
        onClick={() => setMobile(false)}
      />
      <aside
        className={`sidebar ${hovered ? 'sidebar-hovered' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Link to={role === 'client' ? '/portal' : '/'} aria-label="Início da Central" className="brand-link">
          <Brand tenant={tenant} />
        </Link>
        <nav className="nav-area" aria-label="Menu principal">
          {/* Top Standalone Item: Dashboard */}
          <div className="nav-standalone-wrap">
            <NavLink
              to={topItem.path}
              end
              className={({ isActive }) => `nav-link nav-top-link ${isActive ? 'active' : ''}`}
              style={({ isActive }) =>
                isActive && tenant?.primary_color
                  ? { backgroundColor: tenant.primary_color, color: '#ffffff' }
                  : undefined
              }
              title={isCollapsed ? topItem.label : undefined}
            >
              <topItem.icon size={18} strokeWidth={1.8} className="nav-top-icon" style={{ color: topItem.color || '#4f46e5' }} />
              <span className="nav-text">{topItem.label}</span>
            </NavLink>
          </div>

          {/* Divisor superior */}
          <div className="nav-divider" />

          {/* Pastas / Categorias expansíveis */}
          <div className="nav-folders-list">
            {activeCategories.map((cat) => {
              const isOpen = !!openFolders[cat.id];
              const hasActiveChild = cat.items.some((item) => {
                if (item.path.includes('?')) {
                  const [base, query] = item.path.split('?');
                  if (location.pathname !== base) return false;
                  const targetTab = new URLSearchParams(query).get('tab');
                  const currentTab = new URLSearchParams(location.search).get('tab') || 'dashboard';
                  return targetTab === currentTab;
                }
                return item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);
              });

              return (
                <div key={cat.id} className={`nav-folder-group ${isOpen ? 'expanded' : 'collapsed'}`}>
                  <button
                    type="button"
                    className={`nav-folder-btn ${isOpen ? 'is-open' : ''} ${hasActiveChild ? 'has-active-child' : ''}`}
                    onClick={() => toggleFolder(cat.id)}
                    aria-expanded={isOpen}
                    title={isCollapsed ? cat.label : undefined}
                  >
                    <div className="nav-folder-header-left">
                      <cat.icon size={17} strokeWidth={1.8} className="nav-folder-icon" style={{ color: cat.color || '#5d6d84' }} />
                      <span className="nav-folder-label">{cat.label}</span>
                    </div>
                    <ChevronDown
                      size={14}
                      strokeWidth={2.2}
                      className={`nav-folder-chevron ${isOpen ? 'is-open' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="nav-folder-content">
                      {cat.items.map((item) => {
                        const isTicketItem = item.path.endsWith('/tickets');
                        const isFinItem = item.path.endsWith('/financeiro');

                        return (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `nav-sublink ${isItemActive(item.path, isActive) ? 'active' : ''}`}
                            style={({ isActive }) => {
                              const active = isItemActive(item.path, isActive);
                              return active && tenant?.primary_color
                                ? { backgroundColor: tenant.primary_color, color: '#ffffff' }
                                : undefined;
                            }}
                            title={isCollapsed ? item.label : undefined}
                          >
                            <item.icon size={16} strokeWidth={1.75} className="nav-sublink-icon" style={{ color: item.color || '#64748b' }} />
                            <span className="nav-text">{item.label}</span>
                            {isTicketItem && openTickets.length > 0 && (
                              <span className="nav-count">{openTickets.length}</span>
                            )}
                            {isFinItem && overdue.length > 0 && (
                              <span className="nav-count alert-count">{overdue.length}</span>
                            )}
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Divisor inferior */}
          <div className="nav-divider" style={{ marginTop: '12px' }} />
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-version">
            <span>{tenant?.trade_name || 'Telefonia Fácil'} © {new Date().getFullYear()}</span>
            <button
              className="collapse-button"
              onClick={() => {
                setPinned((v) => {
                  const next = !v;
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('sidebar_pinned', String(next));
                  }
                  return next;
                });
              }}
              aria-label={pinned ? 'Desafixar menu (recolhimento automático)' : 'Fixar menu aberto'}
              title={pinned ? 'Desafixar menu (recolhimento automático)' : 'Fixar menu aberto'}
            >
              {pinned ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
          </div>
        </div>
      </aside>
      <header className="app-header">
        <button className="mobile-menu" onClick={() => setMobile(true)} aria-label="Abrir menu">
          <Menu size={20} />
        </button>
        <div className="header-location">
          <Network size={15} />
          <strong>{navLabel}</strong>
        </div>
        <div className="header-search">
          <button className="global-search-trigger" onClick={() => setSearchOpen(true)}>
            <Search size={14} />
            <span>Buscar clientes, chamados, servidores...</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>
        <div className="header-tools">
          <TenantSelector />
          <div className="notification-wrap" ref={bellRef}>
            <button
              className="bell-button"
              aria-label="Notificações"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen((v) => !v);
                setProfileOpen(false);
              }}
            >
              <Bell size={17} />
            </button>
            {notificationsOpen && (
              <div className="popover">
                <h3>Central de notificações</h3>
                {notifications.length ? (
                  notifications.map((n, i) => (
                    <Link
                      className="notification-item"
                      key={i}
                      to={n.path}
                      onClick={() => setNotificationsOpen(false)}
                    >
                      {n.title}
                      <small>{n.subtitle}</small>
                    </Link>
                  ))
                ) : (
                  <p className="muted small">Nenhuma notificação pendente.</p>
                )}
                <div className="search-hint">Alertas operacionais em tempo real.</div>
              </div>
            )}
          </div>
          <div className="header-divider" />
          <div className="profile-wrap" ref={profileRef}>
            <button
              className="profile-button"
              aria-label={`Perfil ${roleNames[role]}. Abrir opções`}
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((v) => !v);
                setNotificationsOpen(false);
              }}
            >
              <Avatar name={userName} size={32} />
              <div className="profile-text">
                <strong>{userName.split(' ').slice(0, 2).join(' ')}</strong>
                <span>{isSuperAdmin ? 'SuperAdmin' : roleNames[role]}</span>
              </div>
              <ChevronDown size={12} className="profile-chevron" />
            </button>
            {profileOpen && (
              <div className="popover">
                <h3>{userName}</h3>
                <p className="muted small" style={{ padding: '0 4px 10px' }}>
                  {authUser?.email || ''} · {isSuperAdmin ? 'SuperAdmin' : roleNames[role]}
                </p>
                <button className="popover-option" onClick={() => navigate('/acesso')}>
                  <ShieldCheck size={16} />
                  Alternar visão de perfil / Portal
                </button>
                {role === 'admin' && (
                  <>
                    <button className="popover-option" onClick={() => navigate('/usuarios')}>
                      <UserCog size={16} />
                      Usuários & Permissões
                    </button>
                    <button className="popover-option" onClick={() => navigate('/configuracoes')}>
                      <Settings2 size={16} />
                      Configurações da Empresa
                    </button>
                  </>
                )}
                <div className="popover-divider" />
                <button
                  className="popover-option"
                  onClick={() => {
                    logout();
                    void authLogout();
                  }}
                >
                  <LogOut size={16} />
                  Sair da conta
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="app-main" id="main-content" tabIndex={-1}>
        <div className="content-container">
          {location.pathname !== '/' && location.pathname !== '/portal' && (
            <div className="breadcrumbs">
              <Link to={role === 'client' ? '/portal' : '/'}>Início</Link>
              <ChevronRight size={11} />
              <span>{navLabel}</span>
              {entity && (
                <>
                  <ChevronRight size={11} />
                  <span>{entity}</span>
                </>
              )}
            </div>
          )}
          <Outlet />
        </div>
        <footer className="app-footer">
          <span>
            {tenant?.trade_name || tenant?.name || 'Telefonia Fácil'} · Central de Operações & CRM
          </span>
        </footer>
      </main>
      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Busca Global na Central" wide>
        <div className="search-modal">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              role === 'client'
                ? 'Buscar seus chamados e documentos...'
                : 'Clientes, chamados, servidores, domínios e documentos...'
            }
          />
          {q ? (
            <div className="search-results">
              {results.length ? (
                results.slice(0, 30).map((r) => (
                  <button
                    className="search-result"
                    key={r.id}
                    onClick={() => {
                      navigate(r.path);
                      setSearchOpen(false);
                      setSearch('');
                    }}
                  >
                    <r.icon size={19} />
                    <div>
                      <div className="search-result-kind">{r.kind}</div>
                      <div className="search-result-title">{r.title}</div>
                      <div className="search-result-subtitle">{r.subtitle}</div>
                    </div>
                    <ArrowRight size={15} className="search-result-arrow" />
                  </button>
                ))
              ) : (
                <EmptyState
                  title="Nenhum resultado encontrado"
                  description="Tente outro nome, número de chamado ou domínio."
                />
              )}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={26} className="muted" />
              <h3>Encontre o que você precisa</h3>
              <p>Digite o nome de um cliente, número de chamado, servidor ou documento.</p>
            </div>
          )}
          <p className="search-hint">Ctrl K para abrir ou fechar · Esc para sair</p>
        </div>
      </Modal>
    </div>
  );
}
