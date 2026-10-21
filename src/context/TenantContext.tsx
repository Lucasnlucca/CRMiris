import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { databases, teams, DATABASE_ID, setTenantId, setIsSuperAdmin as setGlobalIsSuperAdmin } from '../lib/appwrite';
import { useAuth } from './AuthContext';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  trade_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  status: 'active' | 'suspended' | 'trial' | 'cancelled';
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  logo_url?: string;
  primary_color?: string;
  address?: string;
  settings_json?: string;
  created_at?: string;
}

export interface TenantContextType {
  tenant: Tenant | null;
  tenants: Tenant[];
  loading: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  userTeamIds: string[];
  resolvedFromUrl: boolean;
  tenantNotFound: boolean;
  tenantSuspended: boolean;
  setTenant: (tenantId: string) => Promise<boolean>;
  setTenantBySlug: (slug: string) => Promise<boolean>;
  refreshTenants: () => Promise<void>;
  isAuthorized: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const TENANT_STORAGE_KEY = 'active_tenant_id';
const TENANTS_COLLECTION = DATABASE_ID === 'crm_isolated_test' ? 'test_tenants' : 'tenants';
const USERS_COLLECTION = DATABASE_ID === 'crm_isolated_test' ? 'test_users_hydra' : 'users_hydra';

// Extrai o identificador (slug) da empresa por subdomínio (*.lvplataform.com.br / *.lvplatform.com.br / *.localhost),
// atributo HTML (<html data-tenant-slug> / <meta name="tenant-slug">), query param (?tenant=) ou subcaminho (/:slug)
export function extractTenantSlugFromLocation(locationObj?: { hostname?: string; pathname?: string; search?: string }): string | null {
  const loc = locationObj || (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) return null;

  const hostname = (loc.hostname || '').toLowerCase();
  const pathname = loc.pathname || '';
  const search = loc.search || (typeof window !== 'undefined' ? window.location.search : '');

  const reservedSlugs = new Set([
    'api',
    'admin',
    'superadmin',
    'login',
    'register',
    'auth',
    'proposta',
    'contrato',
    'assinar',
    'static',
    'assets',
    'www',
    'crm',
    'app',
    'mail',
    'painel',
    'portal',
    'localhost',
    'clientes',
    'contatos',
    'negocios',
    'pipeline',
    'contratos',
    'propostas',
    'itens',
    'produtos',
    'chamados',
    'suporte',
    'catalogo',
    'automacoes',
    'usuarios',
    'configuracoes',
    'empresas',
    'politicas',
    'tickets',
    'servidores',
    'monitoramento',
    'servicos',
    'documentos',
    'financeiro',
    'agenda',
    'integracoes',
  ]);

  // 1. Resolução por Subdomínio Principal: empresaa.lvplataform.com.br ou empresab.lvplataform.com.br (e *.lvplatform.com.br / *.localhost)
  if (hostname && !hostname.startsWith('127.0.0.1') && !hostname.startsWith('192.168.')) {
    if (hostname.endsWith('.lvplataform.com.br') || hostname.endsWith('.lvplatform.com.br')) {
      const baseRemoved = hostname
        .replace(/\.lvplataform\.com\.br$/, '')
        .replace(/\.lvplatform\.com\.br$/, '');
      const parts = baseRemoved.split('.').filter(Boolean);
      if (parts.length > 0) {
        const candidate = parts[0];
        if (!reservedSlugs.has(candidate)) {
          return candidate;
        }
      }
    } else if (hostname.endsWith('.localhost')) {
      const parts = hostname.split('.');
      if (parts.length > 1 && !reservedSlugs.has(parts[0])) {
        return parts[0];
      }
    } else if (hostname.split('.').length >= 3) {
      const sub = hostname.split('.')[0];
      if (sub && !reservedSlugs.has(sub)) {
        return sub;
      }
    }
  }

  // 2. Resolução via Query Parameter (?tenant=empresaa)
  if (search) {
    try {
      const params = new URLSearchParams(search);
      const qTenant = (params.get('tenant') || '').trim().toLowerCase();
      if (qTenant && !reservedSlugs.has(qTenant)) {
        return qTenant;
      }
    } catch {}
  }

  // 3. Resolução por Subcaminho: /empresaa ou /empresab/negocios
  if (pathname && pathname !== '/') {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      const firstSegment = segments[0].toLowerCase();
      if (!reservedSlugs.has(firstSegment)) {
        return firstSegment;
      }
    }
  }

  // 4. Resolução via HTML (<html data-tenant-slug="..."> ou <meta name="tenant-slug" content="...">)
  if (typeof document !== 'undefined' && !locationObj) {
    const htmlAttr = (document.documentElement.getAttribute('data-tenant-slug') || '').trim().toLowerCase();
    if (htmlAttr && !reservedSlugs.has(htmlAttr)) {
      return htmlAttr;
    }
    const metaEl = document.querySelector('meta[name="tenant-slug"]');
    const metaContent = (metaEl?.getAttribute('content') || '').trim().toLowerCase();
    if (metaContent && !reservedSlugs.has(metaContent)) {
      return metaContent;
    }
  }

  return null;
}

// Mantido para retrocompatibilidade de importações existentes
export function extractSlugFromPath(pathname: string): string | null {
  return extractTenantSlugFromLocation({ pathname });
}

// Aplica personalização de cores via CSS custom properties e sincroniza atributos de separação no HTML
export function applyTenantBranding(primaryColor?: string, tenantObj?: Tenant | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const color = primaryColor && /^#[0-9a-fA-F]{3,8}$/.test(primaryColor) ? primaryColor : '#4f46e5';
  root.style.setProperty('--tenant-primary-color', color);
  root.style.setProperty('--primary', color);
  root.style.setProperty('--primary-color', color);

  if (tenantObj) {
    root.setAttribute('data-tenant-id', tenantObj.id);
    root.setAttribute('data-tenant-slug', tenantObj.slug);
    root.setAttribute('data-tenant-name', tenantObj.name);
    root.setAttribute('data-tenant-domain', `${tenantObj.slug}.lvplataform.com.br`);
    const metaEl = document.querySelector('meta[name="tenant-slug"]');
    if (metaEl) {
      metaEl.setAttribute('content', tenantObj.slug);
    }
    document.title = `${tenantObj.trade_name || tenantObj.name} — Iris Horizon CRM`;
  }
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [tenant, setActiveTenant] = useState<Tenant | null>(null);
  const [tenants, setTenantsList] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userTeamIds, setUserTeamIds] = useState<string[]>([]);
  const [resolvedFromUrl, setResolvedFromUrl] = useState(false);
  const [tenantNotFound, setTenantNotFound] = useState(false);
  const [tenantSuspended, setTenantSuspended] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadTenantData = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setActiveTenant(null);
      setTenantsList([]);
      setIsSuperAdmin(false);
      setGlobalIsSuperAdmin(false);
      setUserTeamIds([]);
      setTenantId(null);
      setError(null);
      setResolvedFromUrl(false);
      setTenantNotFound(false);
      setTenantSuspended(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setTenantNotFound(false);
    setTenantSuspended(false);

    try {
      // 1. Consultar perfil do usuário em users_hydra
      let userDoc: any = null;
      try {
        userDoc = await databases.getDocument(DATABASE_ID, USERS_COLLECTION, user.id);
      } catch (err: any) {
        console.warn('[Tenant] Perfil do usuário via banco:', err.message);
      }

      const defaultTenantId = userDoc?.default_tenant_id || null;
      const userIsSuper = !!userDoc?.is_superadmin;

      // 2. Consultar Teams do usuário autenticado no Appwrite
      let teamIds: string[] = [];
      try {
        const teamsResponse = await teams.list();
        teamIds = teamsResponse.teams.map((t) => t.$id);
      } catch (err: any) {
        console.warn('[Tenant] Consulta de teams via SDK:', err.message);
      }

      // Se o usuário pertence a 'superadmins' (ou 'test_team_superadmins' em teste), confirma SuperAdmin
      const hasSuperTeam = teamIds.includes('superadmins') || teamIds.includes('test_team_superadmins');
      const resolvedSuperAdmin = userIsSuper || hasSuperTeam;

      if (!isMountedRef.current) return;
      setIsSuperAdmin(resolvedSuperAdmin);
      setGlobalIsSuperAdmin(resolvedSuperAdmin);
      setUserTeamIds(teamIds);

      // 3. Buscar todas as empresas cadastradas na coleção de tenants
      let allTenants: Tenant[] = [];
      try {
        const tenantsRes = await databases.listDocuments(DATABASE_ID, TENANTS_COLLECTION);
        allTenants = tenantsRes.documents.map((d: any) => ({
          id: d.$id,
          name: d.name || 'Empresa sem nome',
          slug: d.slug || d.$id.replace(/_/g, '-'),
          trade_name: d.trade_name || d.name,
          document: d.document,
          email: d.email,
          phone: d.phone,
          status: (d.status as any) || 'active',
          plan: (d.plan as any) || 'pro',
          logo_url: d.logo_url,
          primary_color: d.primary_color || '#4f46e5',
          address: d.address,
          settings_json: d.settings_json,
          created_at: d.created_at || d.$createdAt,
        }));
      } catch (err: any) {
        console.warn('[Tenant] listDocuments via client SDK falhou:', err.message);
      }

      // Se a listagem pelo SDK do cliente não retornou ou se faltam tenants (ex: sandbox crm_isolated_test),
      // consulta a API autoritativa de provisionamento /api/admin/tenants enviando os headers com JWT de SuperAdmin
      if (resolvedSuperAdmin) {
        try {
          const { fetchAdminTenants } = await import('../lib/adminTenantsApi');
          const apiJson = await fetchAdminTenants();
          if (apiJson && Array.isArray(apiJson.tenants) && apiJson.tenants.length > 0) {
            // Mescla preservando unicidade por id
            const existingIds = new Set(allTenants.map((t) => t.id));
            for (const at of apiJson.tenants) {
              if (!existingIds.has(at.id)) {
                allTenants.push(at);
                existingIds.add(at.id);
              }
            }
          }
        } catch (apiErr: any) {
          console.warn('[Tenant] Fallback fetchAdminTenants:', apiErr.message);
        }
      }

      // 4. Filtrar empresas autorizadas para o usuário:
      // - SuperAdmin: tem autorização para gerenciar todas as empresas
      // - Usuário comum: apenas empresas às quais pertence via default_tenant_id ou Team Appwrite
      let authorizedTenants: Tenant[] = [];
      if (resolvedSuperAdmin) {
        authorizedTenants = allTenants;
      } else {
        authorizedTenants = allTenants.filter((t) => {
          return (defaultTenantId && t.id === defaultTenantId) || teamIds.includes(t.id);
        });
      }

      if (!isMountedRef.current) return;
      setTenantsList(authorizedTenants);

      // 5. Verificar se a URL atual especifica um slug (:slug ou subdomínio)
      const urlSlug = typeof window !== 'undefined' ? extractTenantSlugFromLocation(window.location) : null;

      let selectedTenant: Tenant | null = null;

      if (urlSlug) {
        setResolvedFromUrl(true);
        // Procurar o tenant pelo slug em todas as empresas cadastradas
        let matchedTenant = allTenants.find((t) => t.slug.toLowerCase() === urlSlug.toLowerCase());

        // Se ainda não encontrou em allTenants, consulta o endpoint direto do servidor
        if (!matchedTenant) {
          try {
            const resolveRes = await fetch(`/api/admin/tenants/resolve/${encodeURIComponent(urlSlug)}`);
            if (resolveRes.ok) {
              const resolveJson = await resolveRes.json();
              if (resolveJson.success && resolveJson.tenant) {
                matchedTenant = resolveJson.tenant;
                allTenants.push(matchedTenant!);
              }
            }
          } catch (rErr: any) {
            console.warn('[Tenant] Erro ao consultar /resolve:', rErr.message);
          }
        }

        if (!matchedTenant) {
          // Slug inexistente
          setTenantNotFound(true);
          setActiveTenant(null);
          setTenantId(null);
          setError(`A empresa "/${urlSlug}" não foi encontrada.`);
          setLoading(false);
          return;
        }

        if (matchedTenant.status === 'suspended') {
          // Tenant suspenso
          setTenantSuspended(true);
          setActiveTenant(matchedTenant);
          setTenantId(null);
          setError(`A empresa "${matchedTenant.name}" está temporariamente suspensa.`);
          setLoading(false);
          return;
        }

        // Valida se o usuário tem autorização para este tenant
        const isUserAuthorizedForThisTenant =
          resolvedSuperAdmin ||
          (defaultTenantId && matchedTenant.id === defaultTenantId) ||
          teamIds.includes(matchedTenant.id);

        if (!isUserAuthorizedForThisTenant) {
          setActiveTenant(null);
          setTenantId(null);
          setError(`Você não possui autorização para acessar os dados da empresa "${matchedTenant.name}".`);
          setLoading(false);
          return;
        }

        selectedTenant = matchedTenant;
      } else {
        setResolvedFromUrl(false);
        // Sem slug na URL: usar o selecionado anteriormente na sessão ou default
        const storedTenantId = sessionStorage.getItem(TENANT_STORAGE_KEY);

        if (storedTenantId && authorizedTenants.some((t) => t.id === storedTenantId)) {
          selectedTenant = authorizedTenants.find((t) => t.id === storedTenantId) || null;
        } else if (authorizedTenants.some((t) => t.id === defaultTenantId)) {
          selectedTenant = authorizedTenants.find((t) => t.id === defaultTenantId) || null;
        } else if (authorizedTenants.length > 0) {
          selectedTenant = authorizedTenants[0];
        }
      }

      if (selectedTenant) {
        if (selectedTenant.status === 'suspended') {
          setTenantSuspended(true);
          setActiveTenant(selectedTenant);
          setTenantId(null);
          setError(`A empresa "${selectedTenant.name}" está suspensa.`);
        } else {
          sessionStorage.setItem(TENANT_STORAGE_KEY, selectedTenant.id);
          setTenantId(selectedTenant.id);
          setActiveTenant(selectedTenant);
          applyTenantBranding(selectedTenant.primary_color, selectedTenant);
        }
      } else {
        setActiveTenant(null);
        setTenantId(null);
        if (authorizedTenants.length === 0) {
          setError('Nenhuma empresa autorizada foi encontrada para esta conta. Contate o suporte.');
        } else {
          setError('Falha ao definir a empresa ativa.');
        }
      }
    } catch (err: any) {
      console.error('[Tenant] Erro ao carregar dados multi-tenant:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Erro ao inicializar contexto de empresa.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!authLoading) {
      loadTenantData();
    }
  }, [authLoading, loadTenantData]);

  // Troca de tenant pelo ID interno (com validação estrita de autorização)
  const setTenant = useCallback(
    async (targetTenantId: string): Promise<boolean> => {
      const target = tenants.find((t) => t.id === targetTenantId);

      if (!target) {
        console.warn(`[Tenant] Acesso negado: Tentativa não autorizada de selecionar o tenant "${targetTenantId}".`);
        setError('Acesso negado: Você não possui autorização para acessar esta empresa.');
        return false;
      }

      if (target.status === 'suspended') {
        setTenantSuspended(true);
        setActiveTenant(target);
        setTenantId(null);
        setError(`A empresa "${target.name}" está suspensa.`);
        return false;
      }

      try {
        sessionStorage.setItem(TENANT_STORAGE_KEY, target.id);
        setTenantId(target.id);
        setActiveTenant(target);
        setTenantSuspended(false);
        setTenantNotFound(false);
        setError(null);
        applyTenantBranding(target.primary_color, target);

        // Se a aplicação estiver em rota de tenant, atualiza a URL sem recarregar a tela
        if (typeof window !== 'undefined' && target.slug) {
          const currentPath = window.location.pathname;
          const urlSlug = extractSlugFromPath(currentPath);
          if (urlSlug) {
            const remainder = currentPath.replace(new RegExp(`^\\/${urlSlug}`), '');
            const newPath = `/${target.slug}${remainder}`;
            window.history.pushState(null, '', newPath);
          }
        }

        return true;
      } catch (err: any) {
        console.error('[Tenant] Erro ao trocar de empresa:', err);
        setError('Não foi possível comutar para a empresa selecionada.');
        return false;
      }
    },
    [tenants]
  );

  // Troca de tenant pelo slug
  const setTenantBySlug = useCallback(
    async (slug: string): Promise<boolean> => {
      const clean = slug.trim().toLowerCase();
      const target = tenants.find((t) => t.slug.toLowerCase() === clean);
      if (!target) {
        setError(`Empresa com slug "/${clean}" não encontrada ou não autorizada.`);
        return false;
      }
      return setTenant(target.id);
    },
    [tenants, setTenant]
  );

  const isAuthorized = useMemo(() => {
    return (
      !!tenant &&
      tenant.status !== 'suspended' &&
      !tenantNotFound &&
      tenants.some((t) => t.id === tenant.id)
    );
  }, [tenant, tenantNotFound, tenants]);

  const value = useMemo(
    () => ({
      tenant,
      tenants,
      loading,
      error,
      isSuperAdmin,
      userTeamIds,
      resolvedFromUrl,
      tenantNotFound,
      tenantSuspended,
      setTenant,
      setTenantBySlug,
      refreshTenants: loadTenantData,
      isAuthorized,
    }),
    [
      tenant,
      tenants,
      loading,
      error,
      isSuperAdmin,
      userTeamIds,
      resolvedFromUrl,
      tenantNotFound,
      tenantSuspended,
      setTenant,
      setTenantBySlug,
      loadTenantData,
      isAuthorized,
    ]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextType {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant deve ser utilizado dentro de um TenantProvider');
  }
  return context;
}
