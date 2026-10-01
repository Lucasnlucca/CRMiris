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
import { account, databases, setTenantUserId } from '../lib/appwrite';
import { api, rest } from '../lib/api';

// Configurações do banco do Appwrite (você deverá definir isso no .env depois)
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';
const USERS_COLLECTION = 'users_hydra';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_online?: boolean;
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
  }, []);

  const updateOnlineStatus = useCallback(async (userId: string, isOnline: boolean) => {
    try {
      await databases.updateDocument(DATABASE_ID, USERS_COLLECTION, userId, {
        is_online: isOnline,
        last_seen: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Error updating online status (db might not exist yet):', error);
    }
  }, []);

  const updateLastSeen = useCallback(async (userId: string) => {
    try {
      await databases.updateDocument(DATABASE_ID, USERS_COLLECTION, userId, {
        is_online: true,
        last_seen: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Error updating last seen:', error);
    }
  }, []);

  const applyUser = useCallback((nextUser: User | null) => {
    setUser(nextUser);
    setTenantUserId(nextUser?.id || null);
  }, []);

  const restoreAuth = useCallback(async () => {
    setLoading(true);

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
      setLoading(true);
      try {
        // Limpa sessão prévia para evitar conflito de sessão ativa no Appwrite
        try {
          await account.deleteSession('current');
        } catch {
          // Não há sessão ativa
        }

        await account.createEmailPasswordSession(email.trim().toLowerCase(), password);
        await restoreAuth();
      } catch (err: any) {
        console.error('[Auth] Erro ao autenticar:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [restoreAuth]
  );

  const logout = useCallback(async () => {
    const currentUserId = user?.id ?? null;

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
      applyUser(null);
    }
  }, [applyUser, clearStoredToken, updateOnlineStatus, user?.id]);

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
