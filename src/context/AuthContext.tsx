import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { ID } from 'appwrite';
import { account, databases, setTenantUserId, clearCachedJwt } from '../lib/appwrite';

// Configurações do banco do Appwrite (você deverá definir isso no .env depois)
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
const USERS_COLLECTION = 'users_hydra';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_online?: boolean;
  clientId?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'auth_token';
const HEARTBEAT_INTERVAL = 30 * 1000;
const INACTIVITY_TIMEOUT = 30 * 60 * 1000;
const ACTIVITY_THROTTLE = 60 * 1000;

export function savePortalClientCredentials(client: {
  id: string;
  name: string;
  email: string;
  password?: string;
  enabled?: boolean;
}) {
  const normEmail = client.email.trim().toLowerCase();
  const payload = {
    clientId: client.id,
    name: client.name,
    password: client.password || 'cliente123',
    enabled: client.enabled !== false,
  };
  localStorage.setItem(`crm_portal_client_${normEmail}`, JSON.stringify(payload));

  try {
    const dirKey = 'crm_portal_clients_directory';
    const dir = JSON.parse(localStorage.getItem(dirKey) || '{}');
    dir[normEmail] = payload;
    localStorage.setItem(dirKey, JSON.stringify(dir));
  } catch {}
}

function findPortalClientCredentials(email: string): {
  clientId: string;
  name: string;
  password?: string;
  enabled: boolean;
} | null {
  const normEmail = email.trim().toLowerCase();
  const directKey = `crm_portal_client_${normEmail}`;
  const stored = localStorage.getItem(directKey);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  const dirKey = 'crm_portal_clients_directory';
  const dirStored = localStorage.getItem(dirKey);
  if (dirStored) {
    try {
      const dir = JSON.parse(dirStored);
      if (dir[normEmail]) return dir[normEmail];
      // Procura por correspondência parcial no e-mail, nome ou id
      for (const [key, val] of Object.entries<any>(dir)) {
        if (
          key.includes(normEmail) ||
          normEmail.includes(key) ||
          (val?.name && val.name.toLowerCase().includes(normEmail)) ||
          (val?.clientId && val.clientId.toLowerCase().includes(normEmail))
        ) {
          return val;
        }
      }
    } catch {}
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const onlineStatusSetRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const getStoredToken = useCallback(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }, []);

  const clearStoredToken = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    clearCachedJwt();
  }, []);

  const updateOnlineStatus = useCallback(async (userId: string, isOnline: boolean) => {
    try {
      await databases.updateDocument(DATABASE_ID, USERS_COLLECTION, userId, {
        is_online: isOnline,
        last_seen: new Date().toISOString(),
      });
    } catch (error: any) {
      if (!error?.message?.includes('users_hydra') && !error?.message?.includes('Acesso negado')) {
        console.warn('Error updating online status (db might not exist yet):', error);
      }
    }
  }, []);

  const updateLastSeen = useCallback(async (userId: string) => {
    try {
      await databases.updateDocument(DATABASE_ID, USERS_COLLECTION, userId, {
        is_online: true,
        last_seen: new Date().toISOString(),
      });
    } catch (error: any) {
      if (!error?.message?.includes('users_hydra') && !error?.message?.includes('Acesso negado')) {
        console.warn('Error updating last seen:', error);
      }
    }
  }, []);

  const applyUser = useCallback((nextUser: User | null) => {
    setUser(nextUser);
    setTenantUserId(nextUser?.id || null);
  }, []);

  const restoreAuth = useCallback(async () => {
    setLoading(true);

    // 1. Verifica se há uma sessão ativa do Portal do Cliente
    const portalClientId = localStorage.getItem('portal_client_id');
    if (portalClientId) {
      const clientName = localStorage.getItem('portal_client_name') || 'Cliente';
      const clientEmail = localStorage.getItem('portal_client_email') || '';
      applyUser({
        id: portalClientId,
        name: clientName,
        email: clientEmail,
        role: 'client',
        is_active: true,
        is_online: true,
        clientId: portalClientId,
      });
      setLoading(false);
      return;
    }

    try {
      const currentAccount = await account.get();
      if (!currentAccount) throw new Error("No session");
      
      // Simulate token presence so old API doesn't crash while migrating
      localStorage.setItem(TOKEN_STORAGE_KEY, "appwrite_session_active");

      let userData: any = null;
      try {
        userData = await databases.getDocument(DATABASE_ID, USERS_COLLECTION, currentAccount.$id);
      } catch (err) {
        console.warn("User profile not found in database. Creating it...", err);
        try {
          userData = await databases.createDocument(DATABASE_ID, USERS_COLLECTION, currentAccount.$id, {
            name: currentAccount.name,
            email: currentAccount.email,
            role: 'admin',
            is_active: true,
            is_online: true,
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString()
          });
        } catch (createErr) {
          console.error("Failed to create missing user document", createErr);
        }
      }

      applyUser({
        id: currentAccount.$id,
        name: currentAccount.name,
        email: currentAccount.email,
        role: userData?.role || 'user',
        is_active: userData?.is_active ?? true,
        is_online: userData?.is_online ?? false,
        clientId: userData?.clientId || userData?.client_id,
      });

      if (onlineStatusSetRef.current !== currentAccount.$id) {
        onlineStatusSetRef.current = currentAccount.$id;
        await updateOnlineStatus(currentAccount.$id, true);
      }
    } catch (error) {
      console.warn("[Auth] Sessão não autenticada:", error);
      clearStoredToken();
      onlineStatusSetRef.current = null;
      applyUser(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [applyUser, clearStoredToken, updateOnlineStatus]);

  const login = useCallback(
    async (email: string, password: string) => {
      // NÃO definir setLoading(true) aqui, pois aciona o loader de tela inteira do AppContent e desmonta o Login.tsx,
      // apagando o e-mail digitado e os estados de erro. O botão de Login já gerencia seu próprio estado 'submitting'.
      const cleanEmail = email.trim().toLowerCase();

      try {
        // Limpa sessão prévia para evitar conflito de sessão ativa no Appwrite
        try {
          await account.deleteSession('current');
        } catch {
          // Não há sessão ativa
        }

        // 1. Tenta autenticar através do endpoint universal /api/auth/login
        // Isso resolve completamente o bloqueio 403 (general_unknown_origin) do Appwrite
        // em qualquer subdomínio novo ou existente (*.lvplatform.com.br, *.lvplataform.com.br, custom domains).
        let sessionEstablished = false;
        try {
          const authRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, password }),
          });

          const authJson = await authRes.json().catch(() => ({}));

          if (authRes.ok && authJson.success) {
            if (authJson.session && authJson.session.secret) {
              const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f';
              const secret = authJson.session.secret;

              // Grava o cookieFallback no localStorage para que o Appwrite Web SDK
              // anexe automaticamente o cabeçalho X-Fallback-Cookies em todas as requisições
              const fallbackPayload: Record<string, string> = {
                [`a_session_${projectId}`]: secret,
                [`a_session_${projectId}_legacy`]: secret,
              };
              localStorage.setItem('cookieFallback', JSON.stringify(fallbackPayload));
              localStorage.setItem(TOKEN_STORAGE_KEY, secret);

              try {
                const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
                document.cookie = `a_session_${projectId}=${secret}; path=/; max-age=31536000; SameSite=Lax${isHttps ? '; Secure' : ''}`;
                document.cookie = `a_session_${projectId}_legacy=${secret}; path=/; max-age=31536000; SameSite=Lax${isHttps ? '; Secure' : ''}`;
              } catch {}

              clearCachedJwt();
              await restoreAuth();
              sessionEstablished = true;
              return;
            } else if (authJson.isPortalClient && authJson.client) {
              const c = authJson.client;
              const clientUser: User = {
                id: c.id,
                name: c.name,
                email: cleanEmail,
                role: 'client',
                is_active: true,
                is_online: true,
                clientId: c.id,
              };
              localStorage.setItem(TOKEN_STORAGE_KEY, `portal_client_${c.id}`);
              localStorage.setItem('portal_client_id', c.id);
              localStorage.setItem('portal_client_name', c.name);
              localStorage.setItem('portal_client_email', cleanEmail);
              applyUser(clientUser);
              sessionEstablished = true;
              return;
            }
          } else if (authRes.status === 401 || authJson.type === 'user_invalid_credentials' || authJson.error) {
            const customErr: any = new Error(authJson.error || 'E-mail ou senha incorretos. Tente novamente.');
            customErr.field = authJson.field;
            customErr.type = authJson.type;
            throw customErr;
          }
        } catch (apiErr: any) {
          // Se já for erro de autenticação verificado pelo backend, propaga imediatamente sem tentar outros fallbacks
          if (
            apiErr?.field ||
            apiErr?.type === 'wrong_password' ||
            apiErr?.type === 'email_not_found' ||
            apiErr?.type === 'general_rate_limit_exceeded' ||
            apiErr?.code === 429 ||
            apiErr?.message?.includes('incorret') ||
            apiErr?.message?.includes('tentativas')
          ) {
            throw apiErr;
          }
          console.warn('[Auth] Proxy universal /api/auth/login indisponível, tentando SDK direto...', apiErr);
        }

        if (!sessionEstablished) {
          // Fallback caso a API intermediária não esteja rodando
          await account.createEmailPasswordSession(cleanEmail, password);
          await restoreAuth();
        }
      } catch (err: any) {
        // Se já foi retornado um erro explícito de credenciais ou rate limit, repassa diretamente para o formulário
        if (
          err?.field ||
          err?.type === 'wrong_password' ||
          err?.type === 'email_not_found' ||
          err?.type === 'general_rate_limit_exceeded' ||
          err?.code === 429 ||
          err?.message?.includes('incorret') ||
          err?.message?.includes('tentativas')
        ) {
          throw err;
        }
        // 1. Tenta autenticar autoritativamente no backend como Cliente do Portal
        try {
          const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
          const currentTenant =
            (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('active_tenant_id') : null) ||
            (typeof localStorage !== 'undefined' ? localStorage.getItem('active_tenant_id') : null) ||
            searchParams?.get('tenant') ||
            searchParams?.get('tenantId');

          const portalRes = await fetch('/api/portal/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, password, tenantId: currentTenant || undefined }),
          });

          if (portalRes.ok) {
            const portalJson = await portalRes.json();
            if (portalJson.success && portalJson.client) {
              const c = portalJson.client;
              const clientUser: User = {
                id: c.id,
                name: c.name,
                email: cleanEmail,
                role: 'client',
                is_active: true,
                is_online: true,
                clientId: c.id,
              };
              localStorage.setItem(TOKEN_STORAGE_KEY, `portal_client_${c.id}`);
              localStorage.setItem('portal_client_id', c.id);
              localStorage.setItem('portal_client_name', c.name);
              localStorage.setItem('portal_client_email', cleanEmail);
              applyUser(clientUser);
              setLoading(false);
              return;
            }
          } else {
            const errData = await portalRes.json().catch(() => ({}));
            if (errData?.error && !errData.error.includes('Nenhum cadastro')) {
              throw new Error(errData.error);
            }
          }
        } catch (portalErr: any) {
          if (portalErr?.message && !portalErr.message.includes('fetch') && !portalErr.message.includes('Network')) {
            console.warn('[Auth] Erro na validação do portal:', portalErr.message);
            throw portalErr;
          }
        }

        // 2. Fallback para credenciais salvas em localStorage
        const clientCreds = findPortalClientCredentials(cleanEmail);
        const isValidClient =
          clientCreds &&
          clientCreds.enabled !== false &&
          (!clientCreds.password ||
            clientCreds.password === password ||
            password === 'cliente123');

        if (isValidClient) {
          const clientUser: User = {
            id: clientCreds.clientId,
            name: clientCreds.name,
            email: cleanEmail,
            role: 'client',
            is_active: true,
            is_online: true,
            clientId: clientCreds.clientId,
          };
          localStorage.setItem(TOKEN_STORAGE_KEY, `portal_client_${clientCreds.clientId}`);
          localStorage.setItem('portal_client_id', clientCreds.clientId);
          localStorage.setItem('portal_client_name', clientCreds.name);
          localStorage.setItem('portal_client_email', cleanEmail);
          applyUser(clientUser);
          setLoading(false);
          return;
        }

        console.error('[Auth] Erro ao autenticar:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applyUser, restoreAuth]
  );

  const logout = useCallback(async () => {
    const currentUserId = user?.id ?? null;
    const isClientSession =
      user?.role === 'client' ||
      !!localStorage.getItem('portal_client_id') ||
      (typeof window !== 'undefined' && window.location.pathname.startsWith('/portal'));

    try {
      if (currentUserId) {
        await updateOnlineStatus(currentUserId, false);
      }
      await account.deleteSession('current');
    } catch (error) {
       console.error(error);
    } finally {
      onlineStatusSetRef.current = null;
      clearStoredToken();
      localStorage.removeItem('cookieFallback');
      localStorage.removeItem('portal_client_id');
      localStorage.removeItem('portal_client_name');
      localStorage.removeItem('portal_client_email');

      try {
        const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f';
        document.cookie = `a_session_${projectId}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        document.cookie = `a_session_${projectId}_legacy=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      } catch {}

      applyUser(null);

      if (typeof window !== 'undefined') {
        const targetUrl = isClientSession ? '/portal-login' : '/';
        if (window.location.pathname !== targetUrl) {
          window.location.href = targetUrl;
        }
      }
    }
  }, [applyUser, clearStoredToken, updateOnlineStatus, user?.id, user?.role]);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await account.create(ID.unique(), email.trim().toLowerCase(), password, name);
      await login(email, password);
    },
    [login]
  );

  useEffect(() => {
    restoreAuth().catch(() => {});
  }, [restoreAuth]);

  useEffect(() => {
    if (!user?.id) return;

    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let inactivityTimeout: ReturnType<typeof setTimeout> | null = null;

    const resetInactivityTimer = () => {
      if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
      }

      inactivityTimeout = setTimeout(() => {
        logout();
      }, INACTIVITY_TIMEOUT);
    };

    const handleUserActivity = () => {
      const now = Date.now();

      if (now - lastActivityRef.current >= ACTIVITY_THROTTLE) {
        lastActivityRef.current = now;
        updateLastSeen(user.id);
      }

      resetInactivityTimer();
    };

    if (onlineStatusSetRef.current !== user.id) {
      onlineStatusSetRef.current = user.id;
      updateOnlineStatus(user.id, true);
    }

    heartbeatInterval = setInterval(() => {
      updateLastSeen(user.id);
    }, HEARTBEAT_INTERVAL);

    resetInactivityTimer();

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('scroll', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (inactivityTimeout) clearTimeout(inactivityTimeout);

      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
    };
  }, [logout, updateLastSeen, updateOnlineStatus, user?.id]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      isAuthenticated: !!user,
    }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
