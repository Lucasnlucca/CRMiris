import { useState, useEffect, useMemo } from "react";
import { X, ChevronRight, Check, CreditCard as Edit3, Paperclip, MessageSquare, Clock, DollarSign, Building2, Sparkles, CheckCircle2, FileText, Flag, User, Calendar } from "lucide-react";
import { databases, storage, client, currentTenantId } from '../../lib/appwrite';
import { Query, ID } from 'appwrite';
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
const STORAGE_BUCKET_ID = import.meta.env.VITE_APPWRITE_BUCKET_ID || 'crm_attachments';
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import {
  notifyDealComment,
  notifyDealMention,
  notifyDealAssigned,
  notifyDealWon,
  notifyActivityAssigned,
} from "../../services/notificationService";
import {
  PipelineDeal, PipelineColumn, PipelineUser,
  PipelineActivity as PipelineActivityItem, PipelineHistoryItem,
  PipelineComment, PipelineChecklistItem, PipelineClient,
} from "./types";
import PipelineFields from "./PipelineFields";
import PipelineActivity from "./PipelineActivity";
import PipelineComments from "./PipelineComments";
import PipelineChecklist from "./PipelineChecklist";
import PipelineAttachments, { Attachment } from "./PipelineAttachments";

type RightPanel = "activity" | "comments";

type NormalizedAttachment = Attachment & {
  fileId?: string;
  bucketId?: string;
};

function extractFileIdFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/files\/([a-zA-Z0-9._-]+)\//);
  return match?.[1];
}

function currencyBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  deal: PipelineDeal;
  columns: PipelineColumn[];
  users: PipelineUser[];
  clients?: PipelineClient[];
  defaultTab?: RightPanel;
  onClose: () => void;
  onUpdated: (deal: PipelineDeal) => void;
}

export default function PipelineItemView({ deal, columns, users, clients = [], defaultTab, onClose, onUpdated }: Props) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const activeTenantId = (deal as any)?.tenant_id || tenant?.id || currentTenantId || null;

  const [localDeal, setLocalDeal] = useState(deal);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(deal.name);
  const [saving, setSaving] = useState(false);
  const initialPanel: RightPanel = defaultTab || (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("tab") === "comments" || new URLSearchParams(window.location.search).get("tab") === "mensagens") ? "comments" : "activity");
  const [rightPanel, setRightPanel] = useState<RightPanel>(initialPanel);

  // Sub-data
  const [activities, setActivities] = useState<PipelineActivityItem[]>([]);
  const [history, setHistory] = useState<PipelineHistoryItem[]>([]);
  const [comments, setComments] = useState<PipelineComment[]>([]);
  const [checklist, setChecklist] = useState<PipelineChecklistItem[]>([]);
  const [attachments, setAttachments] = useState<NormalizedAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);
  const [descSaving, setDescSaving] = useState(false);
  const [descTimeout, setDescTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [activityForm, setActivityForm] = useState({
    type: "Lembrete",
    responsible: "",
    subject: "",
    scheduled_for: "",
    duration: "30",
    description: "",
  });

  const column = columns.find((c) => c.id === localDeal.column_id);
  const currentUser = users.find((u) => u.id === user?.id);
  const assignedUser = users.find((u) => u.id === localDeal.assigned_to) || null;

  // Gerenciamento inteligente de mensagens não lidas
  const readStorageKey = `crm_chat_read_${deal.id}_${user?.id || 'anon'}`;
  const [lastReadTime, setLastReadTime] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(readStorageKey);
      if (saved) return parseInt(saved, 10);
      return initialPanel === "comments" ? Date.now() : 0;
    } catch {
      return Date.now();
    }
  });

  // Atualiza lastReadTime quando o card selecionado mudar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(readStorageKey);
      if (saved) {
        setLastReadTime(parseInt(saved, 10));
      } else {
        setLastReadTime(rightPanel === "comments" ? Date.now() : 0);
      }
    } catch {
      setLastReadTime(Date.now());
    }
  }, [deal.id, readStorageKey]);

  // Sempre que a aba de mensagens estiver ativa ou visível, marca tudo como lido imediatamente
  useEffect(() => {
    if (rightPanel === "comments") {
      const now = Date.now();
      setLastReadTime(now);
      try {
        localStorage.setItem(readStorageKey, String(now));
      } catch {}

      // Baixa e limpa notificações persistentes no sino para este card
      if (user?.id && activeTenantId) {
        databases
          .listDocuments(DATABASE_ID, "notifications", [
            Query.equal("user_id", user.id),
            Query.equal("tenant_id", activeTenantId),
            Query.equal("is_read", false),
            Query.limit(25),
          ])
          .then(({ documents }) => {
            documents.forEach((n: any) => {
              if (n.type === `deal:${deal.id}` || n.message?.includes(deal.name)) {
                databases
                  .updateDocument(DATABASE_ID, "notifications", n.$id || n.id, {
                    is_read: true,
                    tenant_id: activeTenantId,
                  })
                  .catch(() => {});
              }
            });
          })
          .catch(() => {});
      }
    }
  }, [rightPanel, comments.length, deal.id, user?.id, activeTenantId]);

  // Contagem estrita de não lidas: SÓ notifica mensagens de OUTROS usuários enquanto o usuário NÃO estiver na aba
  const unreadMessagesCount = useMemo(() => {
    if (rightPanel === "comments") return 0;

    return comments.filter((c) => {
      // Mensagens enviadas pelo próprio usuário logado nunca contam como não lidas para ele
      if (user?.id && c.user_id === user.id) return false;
      const msgTime = new Date(c.created_at).getTime();
      return msgTime > lastReadTime;
    }).length;
  }, [comments, rightPanel, lastReadTime, user?.id]);

  useEffect(() => {
    loadAllDetails();
    const cleanup = setupRealtime();
    return cleanup;
  }, [deal.id, activeTenantId]);

  async function loadAllDetails() {
    try {
      const [activRes, histRes, commRes, checkRes, attRes] = await Promise.all([
        databases.listDocuments(DATABASE_ID, "pipeline_activities", [Query.equal("deal_id", deal.id), Query.orderDesc("created_at")]),
        databases.listDocuments(DATABASE_ID, "pipeline_history", [Query.equal("deal_id", deal.id), Query.orderDesc("created_at")]),
        databases.listDocuments(DATABASE_ID, "pipeline_comments", [Query.equal("deal_id", deal.id), Query.orderAsc("created_at")]),
        databases.listDocuments(DATABASE_ID, "pipeline_checklist", [Query.equal("deal_id", deal.id), Query.orderAsc("position")]),
        databases.listDocuments(DATABASE_ID, "pipeline_attachments", [Query.equal("deal_id", deal.id), Query.orderDesc("created_at")]),
      ]);

      if (activRes.documents) setActivities(activRes.documents.map((d: any) => ({ ...d, id: d.$id || d.id, created_at: d.$createdAt || d.created_at })));
      if (histRes.documents) setHistory(histRes.documents.map((d: any) => ({ ...d, id: d.$id || d.id, created_at: d.$createdAt || d.created_at })));
      if (commRes.documents) {
        setComments(commRes.documents.map((d: any) => ({
          ...d,
          id: d.$id || d.id,
          content: d.content || d.text || "",
          user_name: d.user_name || "Usuário",
          created_at: d.created_at || d.$createdAt || new Date().toISOString(),
        })));
      }
      if (checkRes.documents) setChecklist(checkRes.documents.map((d: any) => ({ ...d, id: d.$id || d.id, created_at: d.$createdAt || d.created_at })));
      if (attRes.documents) {
        setAttachments(attRes.documents.map((f: any) => ({
          id: f.$id || f.id,
          fileId: f.file_id || f.fileId || extractFileIdFromUrl(f.file_url),
          bucketId: f.bucket_id || f.bucketId || STORAGE_BUCKET_ID,
          name: f.file_name,
          url: f.file_url,
          type: f.file_type || "application/octet-stream",
          size: f.file_size,
          created_at: f.$createdAt || f.created_at,
          uploaded_by: f.user_id,
        })));
      }
    } catch (err) {
      console.error("Erro ao carregar detalhes da oportunidade:", err);
    } finally {
      setLoadingComments(false);
    }
  }

  function setupRealtime() {
    try {
      const unsubscribe = client.subscribe([
        `databases.${DATABASE_ID}.collections.pipeline_comments.documents`,
        `databases.${DATABASE_ID}.collections.pipeline_checklist.documents`,
        `databases.${DATABASE_ID}.collections.pipeline_attachments.documents`,
        `databases.${DATABASE_ID}.collections.pipeline_activities.documents`,
        `databases.${DATABASE_ID}.collections.pipeline_history.documents`,
      ], (response: any) => {
        const events: string[] = response.events || [];
        const payload: any = response.payload;
        if (!payload || payload.deal_id !== deal.id) return;
        if (activeTenantId && payload.tenant_id && payload.tenant_id !== activeTenantId) return;

        // Comments with Instant Optimistic Reconciliation
        if (events.some((e) => e.includes("pipeline_comments"))) {
          const docId = payload.$id || payload.id;
          if (events.some((e) => e.includes(".create"))) {
            const incomingContent = payload.content || payload.text || "";
            setComments((prev) => {
              if (prev.some((c) => c.id === docId)) return prev;
              const tempIdx = prev.findIndex((c) => c.id.startsWith("temp-") && c.content === incomingContent);
              if (tempIdx !== -1) {
                const next = [...prev];
                next[tempIdx] = {
                  ...payload,
                  id: docId,
                  content: incomingContent,
                  user_name: payload.user_name || "Usuário",
                  created_at: payload.created_at || payload.$createdAt || new Date().toISOString(),
                };
                return next;
              }
              return [
                ...prev,
                {
                  ...payload,
                  id: docId,
                  content: incomingContent,
                  user_name: payload.user_name || "Usuário",
                  created_at: payload.created_at || payload.$createdAt || new Date().toISOString(),
                },
              ];
            });
          } else if (events.some((e) => e.includes(".delete"))) {
            setComments((prev) => prev.filter((c) => c.id !== docId));
          }
        }

        // Checklist
        if (events.some((e) => e.includes("pipeline_checklist"))) {
          const docId = payload.$id || payload.id;
          if (events.some((e) => e.includes(".create"))) {
            setChecklist((prev) => {
              if (prev.some((c) => c.id === docId)) return prev;
              return [...prev, { ...payload, id: docId, created_at: payload.$createdAt || payload.created_at }];
            });
          } else if (events.some((e) => e.includes(".update"))) {
            setChecklist((prev) => prev.map((c) => c.id === docId ? { ...payload, id: docId } : c));
          } else if (events.some((e) => e.includes(".delete"))) {
            setChecklist((prev) => prev.filter((c) => c.id !== docId));
          }
        }

        // Attachments
        if (events.some((e) => e.includes("pipeline_attachments"))) {
          const docId = payload.$id || payload.id;
          if (events.some((e) => e.includes(".create"))) {
            setAttachments((prev) => {
              if (!docId || prev.some((a) => a.id === docId)) return prev;
              return [{
                id: docId,
                fileId: payload.file_id || payload.fileId || extractFileIdFromUrl(payload.file_url),
                bucketId: payload.bucket_id || payload.bucketId || STORAGE_BUCKET_ID,
                name: payload.file_name,
                url: payload.file_url,
                type: payload.file_type || "application/octet-stream",
                size: payload.file_size,
                created_at: payload.$createdAt || payload.created_at || new Date().toISOString(),
                uploaded_by: payload.user_id,
              }, ...prev];
            });
          } else if (events.some((e) => e.includes(".delete"))) {
            setAttachments((prev) => prev.filter((a) => a.id !== docId));
          }
        }

        // Activities
        if (events.some((e) => e.includes("pipeline_activities"))) {
          const docId = payload.$id || payload.id;
          if (events.some((e) => e.includes(".create"))) {
            setActivities((prev) => {
              if (prev.some((a) => a.id === docId)) return prev;
              return [{ ...payload, id: docId, created_at: payload.$createdAt || payload.created_at }, ...prev];
            });
          } else if (events.some((e) => e.includes(".update"))) {
            setActivities((prev) => prev.map((a) => a.id === docId ? { ...payload, id: docId } : a));
          } else if (events.some((e) => e.includes(".delete"))) {
            setActivities((prev) => prev.filter((a) => a.id !== docId));
          }
        }

        // History
        if (events.some((e) => e.includes("pipeline_history"))) {
          const docId = payload.$id || payload.id;
          if (events.some((e) => e.includes(".create"))) {
            setHistory((prev) => {
              if (prev.some((h) => h.id === docId)) return prev;
              return [{ ...payload, id: docId, created_at: payload.$createdAt || payload.created_at }, ...prev];
            });
          }
        }
      });

      return () => {
        try { unsubscribe(); } catch (e) {}
      };
    } catch (e) {
      console.warn("Realtime subscription failed", e);
      return () => {};
    }
  }

  async function saveDealFields(updates: Record<string, unknown>) {
    setSaving(true);
    const previousDeal = { ...localDeal };
    const updated = { ...localDeal, ...updates } as PipelineDeal;
    setLocalDeal(updated);
    onUpdated(updated);

    try {
      const res = await databases.updateDocument(DATABASE_ID, "pipeline_deals", deal.id, {
        ...updates,
        ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
      });
      if (res && (res as any).success === false) {
        throw new Error((res as any).error || "Falha ao atualizar oportunidade.");
      }
      await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
        deal_id: deal.id,
        text: `Dados da oportunidade atualizados.`,
        created_by: user?.id || null,
        ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
      });
    } catch (err: any) {
      console.error("Erro ao salvar campos:", err);
      setLocalDeal(previousDeal);
      onUpdated(previousDeal);
      alert(`Erro ao salvar alterações: ${err?.message || "Permissão negada ou falha no servidor."}`);
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function saveDealField(field: string, value: string | number | boolean | string[] | null) {
    await saveDealFields({ [field]: value });
    if (field === "assigned_to" && value && value !== user?.id) {
      notifyDealAssigned(value as string, localDeal.name, deal.id, user?.name, activeTenantId).catch(() => {});
    }
  }

  function handleDescChange(val: string) {
    setLocalDeal((prev) => ({ ...prev, notes: val }));
    if (descTimeout) clearTimeout(descTimeout);
    setDescSaving(true);
    setDescTimeout(setTimeout(async () => {
      try {
        const res = await databases.updateDocument(DATABASE_ID, "pipeline_deals", deal.id, {
          notes: val,
          ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
        });
        if (res && (res as any).success === false) {
          throw new Error((res as any).error || "Falha ao salvar anotações.");
        }
      } catch (err) {
        console.error("Erro ao salvar anotações:", err);
      } finally {
        setDescSaving(false);
      }
    }, 800));
  }

  async function saveName() {
    const n = nameInput.trim();
    if (!n || n === localDeal.name) { setEditingName(false); return; }
    try {
      await saveDealField("name", n);
      setEditingName(false);
    } catch {
      setNameInput(localDeal.name);
    }
  }

  async function toggleCompleted() {
    const newVal = !localDeal.completed;
    try {
      await saveDealField("completed", newVal);
      if (newVal) {
        await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: deal.id,
          text: "Card marcado como concluído.",
          created_by: user?.id || null,
          ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
        });
        if (localDeal.assigned_to) {
          notifyDealWon(localDeal.assigned_to, localDeal.name, deal.id, currencyBRL(Number(localDeal.value) || 0), activeTenantId).catch(() => {});
        }
      }
    } catch {}
  }

  async function addActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!activityForm.subject.trim()) return;

    try {
      const data = await databases.createDocument(DATABASE_ID, "pipeline_activities", ID.unique(), {
        deal_id: deal.id,
        type: activityForm.type,
        responsible: activityForm.responsible,
        subject: activityForm.subject.trim(),
        scheduled_for: activityForm.scheduled_for || null,
        duration: Number(activityForm.duration),
        description: activityForm.description,
        status: "Planejado",
        ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
      });

      if (!data || (data as any).success === false) {
        throw new Error((data as any)?.error || "Falha ao criar atividade no servidor.");
      }

      const activityId = data.$id || (data as any).id;
      if (!activityId) {
        throw new Error("O servidor não retornou um identificador válido para a atividade.");
      }

      const newActivity: PipelineActivityItem = {
        id: activityId,
        deal_id: deal.id,
        type: activityForm.type,
        responsible: activityForm.responsible,
        subject: activityForm.subject.trim(),
        scheduled_for: activityForm.scheduled_for || null,
        duration: Number(activityForm.duration),
        description: activityForm.description,
        status: "Planejado" as const,
        created_at: data.$createdAt || (data as any).created_at || new Date().toISOString(),
      };

      setActivities((prev) => (prev.some((a) => a.id === activityId) ? prev : [newActivity, ...prev]));

      try {
        const histData = await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: deal.id,
          text: `Atividade criada: ${activityForm.subject.trim()}`,
          created_by: user?.id || null,
          ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
        });
        const histId = histData?.$id || (histData as any)?.id;
        if (histId) {
          setHistory((prev) => [
            {
              id: histId,
              deal_id: deal.id,
              text: histData.text,
              created_at: histData.$createdAt || new Date().toISOString(),
              created_by: histData.created_by,
            },
            ...prev,
          ]);
        }
      } catch (histErr) {
        console.warn("Aviso ao registrar histórico da atividade:", histErr);
      }

      if (activityForm.responsible && activityForm.responsible !== user?.id) {
        notifyActivityAssigned(activityForm.responsible, activityForm.subject.trim(), localDeal.name, deal.id, activeTenantId).catch(() => {});
      }

      setActivityForm({ type: "Lembrete", responsible: "", subject: "", scheduled_for: "", duration: "30", description: "" });
    } catch (err: any) {
      console.error("Erro ao criar atividade:", err);
      alert(`Erro ao criar atividade: ${err?.message || "Operação negada ou falha no servidor."}`);
    }
  }

  async function toggleActivity(id: string, status: "Planejado" | "Concluído") {
    const previousActivities = activities.map((a) => ({ ...a }));
    setActivities((prev) => prev.map((a) => (a.id === id || (a as any).$id === id ? { ...a, status } : a)));

    try {
      const res = await databases.updateDocument(DATABASE_ID, "pipeline_activities", id, {
        status,
        ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
      });
      if (!res || (res as any).success === false) {
        throw new Error((res as any)?.error || "Falha ao atualizar status da atividade.");
      }
    } catch (err: any) {
      console.error("Erro ao atualizar atividade:", err);
      setActivities(previousActivities);
      alert(`Erro ao atualizar atividade: ${err?.message || "Operação negada ou falha no servidor."}`);
    }
  }

  async function addComment(content: string) {
    const userName = currentUser?.name || (user as any)?.name || user?.email || "Usuário";
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    // 1. Instant Optimistic UI
    const optimisticItem: PipelineComment = {
      id: tempId,
      deal_id: deal.id,
      user_id: user?.id || null,
      user_name: userName,
      content,
      created_at: now,
    };
    setComments((prev) => [...prev, optimisticItem]);

    // 2. Persist to Appwrite Database via authorized Backend Write Bridge
    try {
      const data = await databases.createDocument(DATABASE_ID, "pipeline_comments", ID.unique(), {
        deal_id: deal.id,
        content,
        text: content,
        user_id: user?.id || null,
        user_name: userName,
        created_by: user?.id || null,
        created_at: now,
        ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
      });

      if (!data || (data as any).success === false) {
        throw new Error((data as any)?.error || "Falha ao enviar comentário.");
      }

      const commentId = data.$id || (data as any).id;
      if (!commentId) {
        throw new Error("O servidor não confirmou o ID da mensagem.");
      }

      // Update the optimistic item with real document ID
      setComments((prev) =>
        prev.map((c) =>
          c.id === tempId
            ? {
                ...c,
                id: commentId,
                created_at: data.created_at || data.$createdAt || c.created_at,
              }
            : c
        )
      );

      // 3. Log to pipeline_history
      databases
        .createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: deal.id,
          text: `Mensagem enviada por ${userName}: "${content.slice(0, 80)}${content.length > 80 ? "..." : ""}"`,
          created_by: user?.id || null,
          created_at: now,
          ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
        })
        .then((histData) => {
          const histId = histData?.$id || (histData as any)?.id;
          if (!histId) return;
          setHistory((prev) => [
            {
              id: histId,
              deal_id: deal.id,
              text: histData.text,
              created_at: histData.$createdAt || now,
              created_by: histData.created_by,
            },
            ...prev,
          ]);
        })
        .catch((e) => console.warn("Erro ao salvar histórico de comentário:", e));

      // 4. Dispatch notifications to assigned user and any @mentioned user (F08: passing tenant_id)
      const notifiedIds = new Set<string>();
      if (user?.id) notifiedIds.add(user.id);

      const dealName = localDeal.name || "Negociação";
      const snippet = content.length > 90 ? `${content.slice(0, 90)}...` : content;

      // Notify deal owner if sender is not the owner
      if (localDeal.assigned_to && !notifiedIds.has(localDeal.assigned_to)) {
        notifiedIds.add(localDeal.assigned_to);
        notifyDealComment(localDeal.assigned_to, dealName, deal.id, userName, snippet, activeTenantId)
          .catch((err) => console.warn("Erro ao notificar responsável:", err));
      }

      // Check for mentioned users in content (@Nome)
      const lowerContent = content.toLowerCase();
      for (const u of users) {
        if (!u.id || notifiedIds.has(u.id)) continue;
        const firstName = u.name ? u.name.split(" ")[0].toLowerCase() : "";
        const fullName = u.name ? u.name.toLowerCase() : "";
        if (
          (firstName && lowerContent.includes(`@${firstName}`)) ||
          (fullName && lowerContent.includes(`@${fullName}`))
        ) {
          notifiedIds.add(u.id);
          notifyDealMention(u.id, dealName, deal.id, userName, snippet, activeTenantId)
            .catch((err) => console.warn("Erro ao notificar menção:", err));
        }
      }
    } catch (err: any) {
      console.error("Erro ao persistir mensagem:", err);
      // Remove optimistic comment and inform user
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      alert(`Erro ao enviar mensagem: ${err.message || "Falha na comunicação com o banco de dados."}`);
      throw err;
    }
  }

  async function addChecklistItem(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      const nextPos = checklist.length;
      const data = await databases.createDocument(DATABASE_ID, "pipeline_checklist", ID.unique(), {
        deal_id: deal.id,
        text: trimmed,
        checked: false,
        position: nextPos,
        ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
      });

      if (!data || (data as any).success === false) {
        throw new Error((data as any)?.error || "Falha ao adicionar item ao checklist.");
      }

      const itemId = data.$id || (data as any).id;
      if (!itemId) {
        throw new Error("O servidor não retornou um ID válido para o item do checklist.");
      }

      setChecklist((prev) =>
        prev.some((c) => c.id === itemId)
          ? prev
          : [
              ...prev,
              {
                id: itemId,
                deal_id: deal.id,
                text: trimmed,
                checked: false,
                position: nextPos,
                created_at: data.$createdAt || (data as any).created_at || new Date().toISOString(),
              },
            ]
      );
    } catch (err: any) {
      console.error("Erro ao criar item do checklist:", err);
      alert(`Erro ao adicionar item no checklist: ${err?.message || "Permissão negada ou falha no servidor."}`);
    }
  }

  async function toggleChecklistItem(id: string, checked: boolean) {
    const previousChecklist = checklist.map((c) => ({ ...c }));
    setChecklist((prev) => prev.map((c) => (c.id === id || (c as any).$id === id ? { ...c, checked } : c)));

    try {
      const res = await databases.updateDocument(DATABASE_ID, "pipeline_checklist", id, {
        checked,
        ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
      });
      if (!res || (res as any).success === false) {
        throw new Error((res as any)?.error || "Falha ao atualizar item do checklist.");
      }
    } catch (err: any) {
      console.error("Erro ao atualizar item do checklist:", err);
      setChecklist(previousChecklist);
      alert(`Erro ao atualizar checklist: ${err?.message || "Permissão negada ou falha no servidor."}`);
    }
  }

  async function deleteChecklistItem(id: string) {
    const previousChecklist = checklist.map((c) => ({ ...c }));
    setChecklist((prev) => prev.filter((c) => c.id !== id && (c as any).$id !== id));

    try {
      const res = await databases.deleteDocument(DATABASE_ID, "pipeline_checklist", id);
      if (!res || (res as any).success === false) {
        throw new Error((res as any)?.error || "Falha ao excluir item do checklist.");
      }
    } catch (err: any) {
      console.error("Erro ao excluir item do checklist:", err);
      setChecklist(previousChecklist);
      alert(`Erro ao excluir item do checklist: ${err?.message || "Permissão negada ou falha no servidor."}`);
    }
  }

  async function uploadFile(files: FileList) {
    if (!files.length) return;
    setUploadingFile(true);
    try {
      for (const file of Array.from(files)) {
        const requestedFileId = ID.unique();
        let uploadedFile: any;
        try {
          uploadedFile = await storage.createFile(STORAGE_BUCKET_ID, requestedFileId, file);
        } catch (e: any) {
          console.error("Erro ao subir arquivo:", e);
          alert(`Erro ao enviar arquivo "${file.name}": ${e?.message || "Falha no armazenamento."}`);
          continue;
        }

        const resolvedFileId = uploadedFile?.$id || uploadedFile?.id || requestedFileId;
        const fileUrl = file.type.startsWith("image/")
          ? storage.getFileView(STORAGE_BUCKET_ID, resolvedFileId).toString()
          : storage.getFileDownload(STORAGE_BUCKET_ID, resolvedFileId).toString();

        let attRow: any;
        try {
          attRow = await databases.createDocument(DATABASE_ID, "pipeline_attachments", ID.unique(), {
            deal_id: deal.id,
            file_name: file.name,
            file_url: fileUrl,
            file_type: file.type,
            file_size: file.size,
            user_id: user?.id || null,
            ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
          });
          if (!attRow || attRow.success === false) {
            throw new Error(attRow?.error || "Falha ao registrar metadados do anexo.");
          }
        } catch (metaErr: any) {
          // F09: Evita binário órfão no Storage se a gravação do metadado falhar
          try {
            await storage.deleteFile(STORAGE_BUCKET_ID, resolvedFileId);
          } catch (cleanupErr) {
            console.warn("[uploadFile] Aviso ao remover binário órfão após falha de metadado:", cleanupErr);
          }
          throw metaErr;
        }

        // F09: Normaliza sempre usando $id || id do documento Appwrite (nunca usa path local!)
        const normalizedDocId = attRow.$id || attRow.id;
        if (!normalizedDocId) {
          try {
            await storage.deleteFile(STORAGE_BUCKET_ID, resolvedFileId);
          } catch {}
          throw new Error("O servidor não retornou um ID válido ($id) para o anexo.");
        }

        const newAtt: NormalizedAttachment = {
          id: normalizedDocId,
          fileId: uploadedFile?.$id || resolvedFileId,
          bucketId: STORAGE_BUCKET_ID,
          name: file.name,
          url: fileUrl,
          type: file.type,
          size: file.size,
          created_at: attRow.$createdAt || attRow.created_at || new Date().toISOString(),
          uploaded_by: user?.id || undefined,
        };
        setAttachments((prev) => (prev.some((a) => a.id === normalizedDocId) ? prev : [newAtt, ...prev]));

        await databases
          .createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
            deal_id: deal.id,
            text: `Arquivo "${file.name}" enviado.`,
            created_by: user?.id || null,
            ...(activeTenantId ? { tenant_id: activeTenantId } : {}),
          })
          .catch(() => {});
      }
    } catch (err: any) {
      console.error("Erro no upload:", err);
      alert(`Erro no envio do anexo: ${err?.message || "Não foi possível concluir o envio."}`);
    } finally {
      setUploadingFile(false);
    }
  }

  async function deleteAttachment(id: string) {
    const target = attachments.find((a) => a.id === id);
    const normalizedDocId = target?.id || id;
    const resolvedFileId = target?.fileId || extractFileIdFromUrl(target?.url);
    const resolvedBucketId = target?.bucketId || STORAGE_BUCKET_ID;

    // F09: Coordena exclusão de metadado e binário sem deixar referência quebrada nem fingir sucesso em falha
    try {
      const delRes = await databases.deleteDocument(DATABASE_ID, "pipeline_attachments", normalizedDocId);
      if (delRes && (delRes as any).success === false) {
        throw new Error((delRes as any).error || "Falha ao excluir metadados do anexo.");
      }
    } catch (metaErr: any) {
      const isAlreadyGone =
        metaErr?.code === 404 ||
        String(metaErr?.message || "").includes("404") ||
        String(metaErr?.message || "").toLowerCase().includes("not found");
      if (!isAlreadyGone) {
        console.error("[deleteAttachment] Falha ao excluir metadado do anexo:", metaErr);
        alert(`Não foi possível excluir o anexo: ${metaErr?.message || "Falha ao remover registro no servidor."}`);
        return;
      }
    }

    // Metadado removido com sucesso (ou 404 confirmado): atualiza estado e remove binário do Storage usando fileId
    setAttachments((prev) => prev.filter((a) => a.id !== normalizedDocId));

    if (resolvedFileId) {
      try {
        await storage.deleteFile(resolvedBucketId, resolvedFileId);
      } catch (storageErr: any) {
        const isStorageNotFound =
          storageErr?.code === 404 ||
          String(storageErr?.message || "").includes("404") ||
          String(storageErr?.message || "").toLowerCase().includes("not found");
        if (!isStorageNotFound) {
          console.error("[deleteAttachment] Falha ao excluir binário no Storage:", storageErr);
          alert(
            `O registro do anexo foi removido, mas houve falha ao excluir o arquivo binário (${resolvedFileId}) do armazenamento: ${
              storageErr?.message || "Erro de armazenamento."
            }`
          );
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-2 sm:p-4 transition-all duration-200 animate-in fade-in" onClick={onClose}>
      <div
        className="relative flex h-[94vh] w-[96vw] max-w-[1550px] flex-col md:flex-row overflow-hidden rounded-3xl bg-slate-50 dark:bg-[#0c1017] border border-slate-200/90 dark:border-white/[0.08] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* LEFT COLUMN: Main Deal Workspace */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header breadcrumb */}
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-[#111722]/80 backdrop-blur-md px-6 py-3.5 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Pipeline</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow-2xs shrink-0"
                style={{ backgroundColor: `${column?.color}20`, color: column?.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: column?.color }} />
                {column?.name}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-900 dark:text-white truncate max-w-[320px]">{localDeal.name}</span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {saving ? (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-amber-500 dark:text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Salvando...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <Check className="w-3 h-3 stroke-[3]" />
                  Salvo
                </span>
              )}

              <button
                onClick={onClose}
                className="rounded-xl p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                title="Fechar (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Main Form & Sub-panels Area */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-6">
            {/* Hero Deal Header Card */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 sm:p-6 shadow-xs">
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={toggleCompleted}
                  className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border-2 transition-all ${
                    localDeal.completed
                      ? "border-emerald-500 bg-emerald-500 text-white shadow-xs"
                      : "border-slate-300 dark:border-white/20 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                  }`}
                  title={localDeal.completed ? "Reabrir oportunidade" : "Marcar como ganho/concluído"}
                >
                  {localDeal.completed ? <Check className="h-4 w-4 stroke-[3]" /> : null}
                </button>

                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onBlur={saveName}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveName();
                        if (e.key === "Escape") setEditingName(false);
                      }}
                      className="w-full rounded-xl border border-indigo-500 bg-white dark:bg-[#0c1017] px-3.5 py-1 text-2xl font-extrabold text-slate-900 dark:text-white outline-none ring-4 ring-indigo-500/10"
                    />
                  ) : (
                    <div
                      onClick={() => { setEditingName(true); setNameInput(localDeal.name); }}
                      className="group flex items-center gap-2 cursor-pointer"
                      title="Clique para editar o título"
                    >
                      <h1 className={`text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors ${
                        localDeal.completed ? "line-through text-slate-400 dark:text-slate-500" : ""
                      }`}>
                        {localDeal.name}
                      </h1>
                      <Edit3 className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}

                  {/* Quick Meta Pills Strip */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {/* Value */}
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/20">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      {localDeal.value ? currencyBRL(localDeal.value) : "R$ 0,00"}
                    </span>

                    {/* Stage */}
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs"
                      style={{ backgroundColor: `${column?.color}15`, color: column?.color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: column?.color }} />
                      {column?.name}
                    </span>

                    {/* Priority */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      localDeal.priority === "urgente" ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200/80 dark:border-rose-500/30" :
                      localDeal.priority === "alta" ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/80 dark:border-amber-500/30" :
                      "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200/80 dark:border-blue-500/30"
                    }`}>
                      <Flag className="w-3 h-3" />
                      {localDeal.priority || "normal"}
                    </span>

                    {/* Assignee */}
                    {currentUser && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10">
                        <User className="w-3 h-3 text-slate-400" />
                        {currentUser.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modular Pipeline Fields (Client, Properties & Contacts) */}
            <PipelineFields
              deal={localDeal}
              columns={columns}
              users={users}
              clients={clients}
              onUpdate={saveDealField}
              onUpdateFields={saveDealFields}
            />

            {/* Checklist Card */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs">
              <PipelineChecklist
                items={checklist}
                onAdd={addChecklistItem}
                onToggle={toggleChecklistItem}
                onDelete={deleteChecklistItem}
              />
            </div>

            {/* Attachments Card */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-4">
                <Paperclip className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Documentos & Anexos</span>
                {attachments.length > 0 && (
                  <span className="rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 text-[11px] font-bold">
                    {attachments.length}
                  </span>
                )}
              </div>
              <PipelineAttachments
                attachments={attachments}
                onUpload={uploadFile}
                onDelete={deleteAttachment}
                uploading={uploadingFile}
              />
            </div>

            {/* Notes Section Card (Posicionada abaixo de Documentos & Anexos) */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  Anotações & Resumo da Oportunidade
                </span>
                {descSaving ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Salvando anotações...
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 font-medium">
                    Salvo automaticamente
                  </span>
                )}
              </div>
              <textarea
                value={localDeal.notes || ""}
                onChange={(e) => handleDescChange(e.target.value)}
                placeholder="Adicione anotações, resumo da negociação, próximos passos com o cliente..."
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] p-3.5 text-xs text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR: Timeline & Chat */}
        <div className="flex w-full md:w-[440px] flex-shrink-0 flex-col border-t md:border-t-0 md:border-l border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#101622]">
          {/* Panel tabs */}
          <div className="flex items-center border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setRightPanel("activity")}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-xs font-bold uppercase tracking-wider transition-all relative ${
                rightPanel === "activity"
                  ? "text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#101622]"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              Atividades & Histórico
              {rightPanel === "activity" && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setRightPanel("comments");
                const now = Date.now();
                setLastReadTime(now);
                try {
                  localStorage.setItem(readStorageKey, String(now));
                } catch {}
              }}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-xs font-bold uppercase tracking-wider transition-all relative ${
                rightPanel === "comments"
                  ? "text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#101622]"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Mensagens
              {unreadMessagesCount > 0 && (
                <span className="rounded-full bg-rose-500 text-white px-1.5 py-0.2 text-[10px] font-bold shadow-sm animate-pulse">
                  {unreadMessagesCount}
                </span>
              )}
              {rightPanel === "comments" && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {rightPanel === "activity" && (
              <PipelineActivity
                activities={activities}
                history={history}
                users={users}
                activityForm={activityForm}
                onActivityFormChange={(field, value) => setActivityForm((prev) => ({ ...prev, [field]: value }))}
                onAddActivity={addActivity}
                onToggleActivity={toggleActivity}
              />
            )}
            {rightPanel === "comments" && (
              <PipelineComments
                comments={comments}
                currentUserName={currentUser?.name || (user as any)?.name || user?.email || "Usuário"}
                currentUserId={user?.id}
                assignedUser={assignedUser}
                users={users}
                dealTitle={localDeal.name}
                onAdd={addComment}
                loading={loadingComments}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
