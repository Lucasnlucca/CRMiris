import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Bell, X, Check, CheckCheck, Trash2 } from 'lucide-react';
import { databases, client, currentTenantId } from '../lib/appwrite';
import { Query } from 'appwrite';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';

interface Notification {
  id: string;
  user_id: string;
  tenant_id?: string | null;
  title: string;
  message: string;
  type: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationBellProps {
  isCollapsed?: boolean;
  onNavigate?: (page: string, referenceId?: string | null) => void;
  currentPage?: string;
}

export default function NotificationBell({ isCollapsed = false, onNavigate, currentPage }: NotificationBellProps) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const activeTenantId = tenant?.id || currentTenantId || null;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(currentPage);
  const loadGenRef = useRef(0);

  useLayoutEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const hasUnread = unreadCount > 0;

  const loadNotifications = useCallback(async () => {
    if (!user?.id || !activeTenantId) {
      setNotifications([]);
      return;
    }

    const gen = ++loadGenRef.current;
    setLoading(true);
    try {
      const { documents } = await databases.listDocuments(
        DATABASE_ID,
        'notifications',
        [
          Query.equal('user_id', user.id),
          Query.equal('tenant_id', activeTenantId),
          Query.orderDesc('created_at'),
          Query.limit(25),
        ]
      );

      if (gen !== loadGenRef.current) return;

      const scopedDocs = (documents || []).filter(
        (d: any) => !d.tenant_id || d.tenant_id === activeTenantId
      );

      setNotifications(scopedDocs.map((d: any) => {
        const refId = d.reference_id || (d.type?.includes(':') ? d.type.split(':')[1] : null);
        const refType = d.reference_type || (d.type?.includes(':') ? d.type.split(':')[0] : (d.type?.startsWith('deal') ? 'deal' : null));
        const hasSeparator = d.message?.includes(' · ');
        const title = d.title || (hasSeparator ? d.message.split(' · ')[0] : (d.type?.includes('pipeline') || d.type?.startsWith('deal:') ? '💬 Mensagem no CRM' : 'Notificação'));
        const displayMessage = hasSeparator ? d.message.split(' · ').slice(1).join(' · ') : (d.message || '');

        return {
          id: d.$id || d.id,
          user_id: d.user_id,
          tenant_id: d.tenant_id || activeTenantId,
          title,
          message: displayMessage,
          type: d.type || 'info',
          reference_id: refId,
          reference_type: refType,
          is_read: Boolean(d.is_read),
          created_at: d.created_at || d.$createdAt
        };
      }));
    } catch (error) {
      console.error('Erro ao carregar notificacoes:', error);
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
      }
    }
  }, [user?.id, activeTenantId]);

  function playNotificationSound() {
    try {
      const audio = new Audio('/sounds/message.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {}
  }

  useEffect(() => {
    setNotifications([]);
    if (!user?.id || !activeTenantId) return;

    loadNotifications();

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = client.subscribe(
        `databases.${DATABASE_ID}.collections.notifications.documents`,
        (response: any) => {
          const events: string[] = response.events || [];
          const payload = response.payload;
          if (!payload || payload.user_id !== user.id) return;
          if (payload.tenant_id !== activeTenantId) return;

          const docId = payload.$id || payload.id;

          if (events.some((e) => e.includes('.create'))) {
            playNotificationSound();
            const refId = payload.reference_id || (payload.type?.includes(':') ? payload.type.split(':')[1] : null);
            const refType = payload.reference_type || (payload.type?.includes(':') ? payload.type.split(':')[0] : (payload.type?.startsWith('deal') ? 'deal' : null));
            const hasSeparator = payload.message?.includes(' · ');
            const title = payload.title || (hasSeparator ? payload.message.split(' · ')[0] : (payload.type?.includes('pipeline') || payload.type?.startsWith('deal:') ? '💬 Mensagem no CRM' : 'Notificação'));
            const displayMessage = hasSeparator ? payload.message.split(' · ').slice(1).join(' · ') : (payload.message || '');

            setNotifications((prev) => {
              if (prev.some((n) => n.id === docId)) return prev;
              return [
                {
                  id: docId,
                  user_id: payload.user_id,
                  tenant_id: payload.tenant_id || activeTenantId,
                  title,
                  message: displayMessage,
                  type: payload.type || 'info',
                  reference_id: refId,
                  reference_type: refType,
                  is_read: Boolean(payload.is_read),
                  created_at: payload.$createdAt || payload.created_at || new Date().toISOString(),
                },
                ...prev,
              ];
            });
          } else if (events.some((e) => e.includes('.update'))) {
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === docId ? { ...n, is_read: payload.is_read ?? n.is_read } : n
              )
            );
          } else if (events.some((e) => e.includes('.delete'))) {
            setNotifications((prev) => prev.filter((n) => n.id !== docId));
          }
        }
      );
    } catch (err) {
      console.warn('Erro ao assinar notificações em tempo real:', err);
    }

    const pollInterval = setInterval(() => {
      loadNotifications();
    }, 12000);

    return () => {
      unsubscribe?.();
      clearInterval(pollInterval);
    };
  }, [user?.id, activeTenantId, loadNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function markAsRead(notificationId: string) {
    if (!activeTenantId) return;
    try {
      const res = await databases.updateDocument(DATABASE_ID, 'notifications', notificationId, {
        is_read: true,
        tenant_id: activeTenantId,
      });
      if (res && (res as any).success === false) {
        throw new Error((res as any).error || 'Falha ao marcar notificação como lida.');
      }

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    } catch (error) {
      console.error('Erro ao marcar como lida:', error);
    }
  }

  async function markAllAsRead() {
    if (!user?.id || !activeTenantId) return;

    try {
      const unread = notifications.filter((n) => !n.is_read);
      if (unread.length === 0) return;

      const results = await Promise.allSettled(
        unread.map(async (n) => {
          const res = await databases.updateDocument(DATABASE_ID, 'notifications', n.id, {
            is_read: true,
            tenant_id: activeTenantId,
          });
          if (res && (res as any).success === false) {
            throw new Error((res as any).error || 'Falha ao atualizar notificação.');
          }
          return n.id;
        })
      );

      const updatedIds = new Set<string>();
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) {
          updatedIds.add(r.value);
        }
      });

      if (updatedIds.size > 0) {
        setNotifications((prev) =>
          prev.map((n) => (updatedIds.has(n.id) ? { ...n, is_read: true } : n))
        );
      }
    } catch (error) {
      console.error('Erro ao marcar todas como lidas:', error);
    }
  }

  async function deleteNotification(notificationId: string) {
    if (!activeTenantId) return;
    try {
      const res = await databases.deleteDocument(DATABASE_ID, 'notifications', notificationId);
      if (res && (res as any).success === false) {
        throw new Error((res as any).error || 'Falha ao excluir notificação.');
      }
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } catch (error) {
      console.error('Erro ao deletar notificacao:', error);
    }
  }

  async function clearAllNotifications() {
    if (!user?.id || !activeTenantId) return;

    try {
      const results = await Promise.allSettled(
        notifications.map(async (n) => {
          const res = await databases.deleteDocument(DATABASE_ID, 'notifications', n.id);
          if (res && (res as any).success === false) {
            throw new Error((res as any).error || 'Falha ao excluir notificação.');
          }
          return n.id;
        })
      );

      const deletedIds = new Set<string>();
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) {
          deletedIds.add(r.value);
        }
      });

      if (deletedIds.size > 0) {
        setNotifications((prev) => prev.filter((n) => !deletedIds.has(n.id)));
      }
    } catch (error) {
      console.error('Erro ao limpar notificacoes:', error);
    }
  }

  function formatTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('pt-BR');
  }

  function getNotificationIcon(type: string) {
    if (type.includes('ticket')) return 'bg-cyan-500';
    if (type.includes('contract')) return 'bg-violet-500';
    if (type.includes('proposal')) return 'bg-emerald-500';
    if (type.includes('activity')) return 'bg-amber-500';
    if (type.includes('whatsapp')) return 'bg-emerald-500';
    if (type.includes('won') || type.includes('completed')) return 'bg-green-500';
    if (type.includes('assignment')) return 'bg-blue-500';
    if (type.includes('mention')) return 'bg-purple-500';
    return 'bg-indigo-500';
  }

  async function handleNotificationClick(notification: Notification) {
    await markAsRead(notification.id);
    setShowDropdown(false);

    if (onNavigate) {
      let targetPage = '';

      switch (notification.reference_type) {
        case 'whatsapp_contact':
        case 'conversation':
        case 'contact':
        case 'client':
          targetPage = 'crm-contatos';
          break;
        case 'deal':
        case 'activity':
          targetPage = 'crm-pipeline';
          break;
        case 'ticket':
          targetPage = 'tickets';
          break;
        case 'proposal':
          targetPage = 'propostas';
          break;
        case 'contract':
          targetPage = 'contratos-crm';
          break;
        default:
          if (notification.type?.includes('ticket')) targetPage = 'tickets';
          else if (notification.type?.includes('contract')) targetPage = 'contratos-crm';
          else if (notification.type?.includes('proposal')) targetPage = 'propostas';
          else if (notification.type?.includes('client') || notification.type?.includes('contact')) targetPage = 'crm-contatos';
          else targetPage = 'crm-pipeline';
      }

      onNavigate(targetPage, notification.reference_id);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`relative p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors ${
          hasUnread ? 'animate-bell-shake' : ''
        }`}
      >
        <Bell className={`w-5 h-5 ${hasUnread ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} />

        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {showDropdown && !isCollapsed && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-[#121824] rounded-2xl shadow-2xl border border-slate-200/80 dark:border-white/[0.08] overflow-hidden z-[100]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Notificações
            </h3>
            <div className="flex items-center gap-1">
              {hasUnread && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Limpar todas"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setShowDropdown(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                Carregando...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center">
                <Bell className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Nenhuma notificacao
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`group relative px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${
                    !notification.is_read ? 'bg-green-50/50 dark:bg-green-900/10' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <div
                      className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${getNotificationIcon(notification.type)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          !notification.is_read
                            ? 'font-semibold text-gray-900 dark:text-white'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatTimeAgo(notification.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!notification.is_read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id);
                        }}
                        className="p-1 text-gray-400 hover:text-indigo-500 hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded transition-colors"
                        title="Marcar como lida"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                      title="Remover"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bell-shake {
          0%, 100% { transform: rotate(0deg); }
          10%, 30%, 50%, 70%, 90% { transform: rotate(-8deg); }
          20%, 40%, 60%, 80% { transform: rotate(8deg); }
        }
        .animate-bell-shake {
          animation: bell-shake 0.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}