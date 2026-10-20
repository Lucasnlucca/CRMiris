import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { CollectionKey, Collections, Database, Role, Session, Settings } from '../types';
import { appwriteRepository } from '../services/mockApi';
import { newId, translateErrorMessage } from '../utils/format';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}
export interface AppContextValue {
  data: Database;
  session: Session | null;
  save<K extends CollectionKey>(key: K, item: Collections[K]): Promise<Collections[K]>;
  patch<K extends CollectionKey>(
    key: K,
    id: string,
    changes: Partial<Collections[K]>,
  ): Promise<Collections[K]>;
  remove<K extends CollectionKey>(key: K, id: string): Promise<void>;
  refresh(): Promise<void>;
  reset(): Promise<void>;
  login(role: Role, clientId?: string): Promise<void>;
  logout(): void;
  notify(message: string, tone?: ToastTone): void;
  updateSettings(settings: Settings): Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();
  const { tenant } = useTenant();

  const [snapshot, setSnapshot] = useState(() => ({
    data: appwriteRepository.getSnapshot(),
    session: appwriteRepository.getSession(),
  }));
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const translated = translateErrorMessage(message);
      setToasts((items) => {
        if (items.some((item) => item.message === translated && item.tone === tone)) {
          return items;
        }
        const id = newId('toast');
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4600),
        );
        return [...items.slice(-3), { id, message: translated, tone }];
      });
    },
    [dismiss],
  );

  useEffect(() => {
    let alive = true;
    const unsubscribe = appwriteRepository.subscribe(() => {
      if (alive) {
        setSnapshot({
          data: appwriteRepository.getSnapshot(),
          session: appwriteRepository.getSession(),
        });
      }
    });

    void appwriteRepository
      .syncWithContext(tenant, authUser)
      .then(() => {
        if (!alive) return;
        setSnapshot({
          data: appwriteRepository.getSnapshot(),
          session: appwriteRepository.getSession(),
        });
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setReady(true);
        notify(
          error instanceof Error
            ? error.message
            : 'Não foi possível sincronizar os dados com o Appwrite.',
          'error',
        );
      });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [tenant, authUser, notify]);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const handleError = useCallback(
    (error: unknown): never => {
      const normalizedMsg = translateErrorMessage(error);
      const normalized = new Error(normalizedMsg);
      notify(normalizedMsg, 'error');
      throw normalized;
    },
    [notify],
  );

  const save = useCallback(
    async <K extends CollectionKey>(key: K, item: Collections[K]): Promise<Collections[K]> => {
      try {
        return await appwriteRepository.save(key, item);
      } catch (error) {
        return handleError(error);
      }
    },
    [handleError],
  );

  const patch = useCallback(
    async <K extends CollectionKey>(
      key: K,
      id: string,
      changes: Partial<Collections[K]>,
    ): Promise<Collections[K]> => {
      try {
        return await appwriteRepository.update(key, id, changes);
      } catch (error) {
        return handleError(error);
      }
    },
    [handleError],
  );

  const remove = useCallback(
    async <K extends CollectionKey>(key: K, id: string): Promise<void> => {
      try {
        await appwriteRepository.remove(key, id);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError],
  );

  const refresh = useCallback(async () => {
    try {
      await appwriteRepository.refresh();
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const reset = useCallback(async () => {
    try {
      await appwriteRepository.reset();
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  const login = useCallback(
    async (role: Role, clientId?: string) => {
      try {
        await appwriteRepository.login(role, clientId);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError],
  );

  const logout = useCallback(() => {
    appwriteRepository.logout();
  }, []);

  const updateSettings = useCallback(
    async (settings: Settings) => {
      try {
        await appwriteRepository.updateSettings(settings);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ...snapshot,
      save,
      patch,
      remove,
      refresh,
      reset,
      login,
      logout,
      notify,
      updateSettings,
    }),
    [snapshot, save, patch, remove, refresh, reset, login, logout, notify, updateSettings],
  );

  return (
    <AppContext.Provider value={value}>
      {ready ? (
        children
      ) : (
        <div
          className="app-loading"
          role="status"
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeContent: 'center',
            gap: 16,
            textAlign: 'center',
            background: '#f5f7fb',
            color: '#64748b',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <strong style={{ color: '#131e38', fontSize: 24 }}>
            {tenant?.trade_name || tenant?.name || 'Central de Operações & CRM'}
          </strong>
          <span>Sincronizando dados com o Appwrite…</span>
        </div>
      )}
      <div
        className="toast-stack"
        aria-live="polite"
        aria-relevant="additions"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 10000,
          display: 'grid',
          gap: 10,
          width: 'min(390px, calc(100vw - 40px))',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.tone}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '15px 16px',
              border: '1px solid #e4e9f1',
              borderLeft: `4px solid ${toast.tone === 'error' ? '#dc3545' : toast.tone === 'success' ? '#16a078' : '#4678e8'}`,
              borderRadius: 10,
              boxShadow: '0 10px 35px #131e381a',
              background: '#fff',
              color: '#25324a',
              fontSize: 13,
            }}
          >
            <span style={{ flex: 1, lineHeight: 1.5 }}>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Fechar notificação"
              style={{
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                color: '#778399',
                fontSize: 20,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp precisa ser usado dentro de AppProvider.');
  return value;
}
