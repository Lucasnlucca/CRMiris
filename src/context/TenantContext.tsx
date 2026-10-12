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
  setTenant: (tenantId: string) => Promise<boolean>;
  refreshTenants: () => Promise<void>;
  isAuthorized: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const TENANT_STORAGE_KEY = 'active_tenant_id';
const TENANTS_COLLECTION = 'tenants';
const USERS_COLLECTION = 'users_hydra';

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [tenant, setActiveTenant] = useState<Tenant | null>(null);
  const [tenants, setTenantsList] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userTeamIds, setUserTeamIds] = useState<string[]>([]);

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
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Consultar perfil do usuário em users_hydra
      let userDoc: any = null;
      try {
        userDoc = await databases.getDocument(DATABASE_ID, USERS_COLLECTION, user.id);
      } catch (err: any) {
        console.warn('[Tenant] Não foi possível carregar documento do usuário:', err.message);
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

      // Se o usuário pertence ao team 'superadmins', confirma SuperAdmin
      const hasSuperTeam = teamIds.includes('superadmins');
      const resolvedSuperAdmin = userIsSuper || hasSuperTeam;

      if (!isMountedRef.current) return;
      setIsSuperAdmin(resolvedSuperAdmin);
      setGlobalIsSuperAdmin(resolvedSuperAdmin);
      setUserTeamIds(teamIds);

      // 3. Buscar todas as empresas cadastradas na coleção 'tenants'
      const tenantsRes = await databases.listDocuments(DATABASE_ID, TENANTS_COLLECTION);
      const allTenants: Tenant[] = tenantsRes.documents.map((d: any) => ({
        id: d.$id,
        name: d.name || 'Empresa sem nome',
        slug: d.slug || '',
        trade_name: d.trade_name,
        document: d.document,
        email: d.email,
        phone: d.phone,
        status: d.status || 'active',
        plan: d.plan || 'pro',
        logo_url: d.logo_url,
        primary_color: d.primary_color || '#6366f1',
        address: d.address,
        settings_json: d.settings_json,
        created_at: d.created_at,
      }));

      // 4. Filtrar empresas autorizadas para o usuário:
      // - SuperAdmin: tem acesso a todas as empresas cadastradas
      // - Usuário comum: apenas empresas que coincidam com seu default_tenant_id ou seus Teams Appwrite
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

      if (authorizedTenants.length === 0) {
        setActiveTenant(null);
        setTenantId(null);
        setError('Nenhuma empresa autorizada foi encontrada para esta conta. Contate o suporte.');
        setLoading(false);
        return;
      }

      // 5. Determinar o tenant ativo
      const storedTenantId = sessionStorage.getItem(TENANT_STORAGE_KEY);
      let selectedTenant: Tenant | null = null;

      if (storedTenantId && authorizedTenants.some((t) => t.id === storedTenantId)) {
        selectedTenant = authorizedTenants.find((t) => t.id === storedTenantId) || null;
      } else if (authorizedTenants.some((t) => t.id === defaultTenantId)) {
        selectedTenant = authorizedTenants.find((t) => t.id === defaultTenantId) || null;
      } else {
        selectedTenant = authorizedTenants[0];
      }

      if (selectedTenant) {
        sessionStorage.setItem(TENANT_STORAGE_KEY, selectedTenant.id);
        setTenantId(selectedTenant.id);
        setActiveTenant(selectedTenant);
      } else {
        setActiveTenant(null);
        setTenantId(null);
        setError('Falha ao definir a empresa ativa.');
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

  const setTenant = useCallback(
    async (targetTenantId: string): Promise<boolean> => {
      // Validação estrita: a empresa deve estar na lista de autorizadas
      const target = tenants.find((t) => t.id === targetTenantId);

      if (!target) {
        console.warn(`[Tenant] Acesso negado: Tentativa não autorizada de selecionar o tenant "${targetTenantId}".`);
        setError('Acesso negado: Você não possui autorização para acessar esta empresa.');
        return false;
      }

      try {
        sessionStorage.setItem(TENANT_STORAGE_KEY, target.id);
        setTenantId(target.id);
        setActiveTenant(target);
        setError(null);
        return true;
      } catch (err: any) {
        console.error('[Tenant] Erro ao trocar de empresa:', err);
        setError('Não foi possível comutar para a empresa selecionada.');
        return false;
      }
    },
    [tenants]
  );

  const isAuthorized = useMemo(() => {
    return !!tenant && tenants.some((t) => t.id === tenant.id);
  }, [tenant, tenants]);

  const value = useMemo(
    () => ({
      tenant,
      tenants,
      loading,
      error,
      isSuperAdmin,
      userTeamIds,
      setTenant,
      refreshTenants: loadTenantData,
      isAuthorized,
    }),
    [tenant, tenants, loading, error, isSuperAdmin, userTeamIds, setTenant, loadTenantData, isAuthorized]
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
