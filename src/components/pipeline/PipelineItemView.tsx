import { useState, useEffect } from "react";
import { X, ChevronRight, Check, CreditCard as Edit3, Paperclip, MessageSquare, Clock, DollarSign, Building2, Sparkles, CheckCircle2 } from "lucide-react";
import { databases, storage, client } from '../../lib/appwrite';
import { Query, ID } from 'appwrite';
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
import { useAuth } from "../../context/AuthContext";
import {
  PipelineDeal, PipelineColumn, PipelineUser,
  PipelineActivity as PipelineActivityItem, PipelineHistoryItem,
  PipelineComment, PipelineChecklistItem,
} from "./types";
import PipelineFields from "./PipelineFields";
import PipelineActivity from "./PipelineActivity";
import PipelineComments from "./PipelineComments";
import PipelineChecklist from "./PipelineChecklist";
import PipelineAttachments, { Attachment } from "./PipelineAttachments";

type RightPanel = "activity" | "comments";

function currencyBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  deal: PipelineDeal;
  columns: PipelineColumn[];
  users: PipelineUser[];
  onClose: () => void;
  onUpdated: (deal: PipelineDeal) => void;
}

export default function PipelineItemView({ deal, columns, users, onClose, onUpdated }: Props) {
  const { user } = useAuth();
  const [localDeal, setLocalDeal] = useState(deal);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(deal.name);
  const [saving, setSaving] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("activity");

  // Sub-data
  const [activities, setActivities] = useState<PipelineActivityItem[]>([]);
  const [history, setHistory] = useState<PipelineHistoryItem[]>([]);
  const [comments, setComments] = useState<PipelineComment[]>([]);
  const [checklist, setChecklist] = useState<PipelineChecklistItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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

  useEffect(() => {
    loadAllDetails();
    const cleanup = setupRealtime();
    return cleanup;
  }, [deal.id]);

  async function loadAllDetails() {
    const [activRes, histRes, commRes, checkRes, attRes] = await Promise.all([
      databases.listDocuments(DATABASE_ID, "pipeline_activities", [Query.equal("deal_id", deal.id), Query.orderDesc("created_at")]),
      databases.listDocuments(DATABASE_ID, "pipeline_history", [Query.equal("deal_id", deal.id), Query.orderDesc("created_at")]),
      databases.listDocuments(DATABASE_ID, "pipeline_comments", [Query.equal("deal_id", deal.id), Query.orderAsc("created_at")]),
      databases.listDocuments(DATABASE_ID, "pipeline_checklist", [Query.equal("deal_id", deal.id), Query.orderAsc("position")]),
      databases.listDocuments(DATABASE_ID, "pipeline_attachments", [Query.equal("deal_id", deal.id), Query.orderDesc("created_at")]),
    ]);

    if (activRes.documents) setActivities(activRes.documents.map((d: any) => ({ ...d, id: d.$id, created_at: d.$createdAt })));
    if (histRes.documents) setHistory(histRes.documents.map((d: any) => ({ ...d, id: d.$id, created_at: d.$createdAt })));
    if (commRes.documents) setComments(commRes.documents.map((d: any) => ({ ...d, id: d.$id, created_at: d.$createdAt })));
    if (checkRes.documents) setChecklist(checkRes.documents.map((d: any) => ({ ...d, id: d.$id, created_at: d.$createdAt })));
    if (attRes.documents) setAttachments(attRes.documents.map((f: any) => ({
      id: f.$id || f.id,
      name: f.file_name,
      url: f.file_url,
      type: f.file_type || "application/octet-stream",
      size: f.file_size,
      created_at: f.$createdAt || f.created_at,
      uploaded_by: f.user_id,
    })));

    setLoadingComments(false);
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

        // Comments
        if (events.some((e) => e.includes("pipeline_comments"))) {
          if (events.some((e) => e.includes(".create"))) {
            setComments((prev) => {
              if (prev.some((c) => c.id === payload.$id)) return prev;
              return [...prev, { ...payload, id: payload.$id, created_at: payload.$createdAt }];
            });
          } else if (events.some((e) => e.includes(".delete"))) {
            setComments((prev) => prev.filter((c) => c.id !== payload.$id));
          }
        }

        // Checklist
        if (events.some((e) => e.includes("pipeline_checklist"))) {
          if (events.some((e) => e.includes(".create"))) {
            setChecklist((prev) => {
              if (prev.some((c) => c.id === payload.$id)) return prev;
              return [...prev, { ...payload, id: payload.$id, created_at: payload.$createdAt }];
            });
          } else if (events.some((e) => e.includes(".update"))) {
            setChecklist((prev) => prev.map((c) => c.id === payload.$id ? { ...payload, id: payload.$id } : c));
          } else if (events.some((e) => e.includes(".delete"))) {
            setChecklist((prev) => prev.filter((c) => c.id !== payload.$id));
          }
        }

        // Attachments
        if (events.some((e) => e.includes("pipeline_attachments"))) {
          if (events.some((e) => e.includes(".create"))) {
            setAttachments((prev) => {
              if (prev.some((a) => a.id === payload.$id)) return prev;
              return [{
                id: payload.$id,
                name: payload.file_name,
                url: payload.file_url,
                type: payload.file_type || "application/octet-stream",
                size: payload.file_size,
                created_at: payload.$createdAt,
                uploaded_by: payload.user_id,
              }, ...prev];
            });
          } else if (events.some((e) => e.includes(".delete"))) {
            setAttachments((prev) => prev.filter((a) => a.id !== payload.$id));
          }
        }

        // Activities
        if (events.some((e) => e.includes("pipeline_activities"))) {
          if (events.some((e) => e.includes(".create"))) {
            setActivities((prev) => {
              if (prev.some((a) => a.id === payload.$id)) return prev;
              return [{ ...payload, id: payload.$id, created_at: payload.$createdAt }, ...prev];
            });
          } else if (events.some((e) => e.includes(".update"))) {
            setActivities((prev) => prev.map((a) => a.id === payload.$id ? { ...payload, id: payload.$id } : a));
          } else if (events.some((e) => e.includes(".delete"))) {
            setActivities((prev) => prev.filter((a) => a.id !== payload.$id));
          }
        }

        // History
        if (events.some((e) => e.includes("pipeline_history"))) {
          if (events.some((e) => e.includes(".create"))) {
            setHistory((prev) => {
              if (prev.some((h) => h.id === payload.$id)) return prev;
              return [{ ...payload, id: payload.$id, created_at: payload.$createdAt }, ...prev];
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

  async function saveDealField(field: string, value: string | number | boolean | string[] | null) {
    setSaving(true);
    const update: Record<string, unknown> = { [field]: value };
    const updated = { ...localDeal, ...update } as PipelineDeal;
    setLocalDeal(updated);
    onUpdated(updated);

    try {
      await databases.updateDocument(DATABASE_ID, "pipeline_deals", deal.id, update);
      await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
        deal_id: deal.id,
        text: `Campo "${field}" atualizado.`,
        created_by: user?.id || null,
      });
    } catch (err) {
      console.error("Erro ao salvar campo:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleDescChange(val: string) {
    setLocalDeal((prev) => ({ ...prev, notes: val }));
    if (descTimeout) clearTimeout(descTimeout);
    setDescSaving(true);
    setDescTimeout(setTimeout(async () => {
      await databases.updateDocument(DATABASE_ID, "pipeline_deals", deal.id, { notes: val });
      setDescSaving(false);
    }, 800));
  }

  async function saveName() {
    const n = nameInput.trim();
    if (!n || n === localDeal.name) { setEditingName(false); return; }
    await saveDealField("name", n);
    setEditingName(false);
  }

  async function toggleCompleted() {
    const newVal = !localDeal.completed;
    await saveDealField("completed", newVal);
    if (newVal) {
      await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
        deal_id: deal.id,
        text: "Card marcado como concluído.",
        created_by: user?.id || null,
      });
    }
  }

  async function addActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!activityForm.subject.trim()) return;

    const data = await databases.createDocument(DATABASE_ID, "pipeline_activities", ID.unique(), {
      deal_id: deal.id,
      type: activityForm.type,
      responsible: activityForm.responsible,
      subject: activityForm.subject,
      scheduled_for: activityForm.scheduled_for || null,
      duration: Number(activityForm.duration),
      description: activityForm.description,
      status: "Planejado",
    })

    const newActivity = {
      id: data.$id,
      deal_id: deal.id,
      type: activityForm.type,
      responsible: activityForm.responsible,
      subject: activityForm.subject,
      scheduled_for: activityForm.scheduled_for || null,
      duration: Number(activityForm.duration),
      description: activityForm.description,
      status: "Planejado" as const,
      created_at: data.$createdAt
    };

    setActivities(prev => [newActivity, ...prev]);

    const histData = await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
      deal_id: deal.id,
      text: `Atividade criada: ${activityForm.subject}`,
      created_by: user?.id || null,
    });
    setHistory(prev => [{ id: histData.$id, deal_id: deal.id, text: histData.text, created_at: histData.$createdAt, created_by: histData.created_by }, ...prev]);

    setActivityForm({ type: "Lembrete", responsible: "", subject: "", scheduled_for: "", duration: "30", description: "" });
  }

  async function toggleActivity(id: string, status: "Planejado" | "Concluído") {
    setActivities(prev => prev.map(a => a.id === id || (a as any).$id === id ? { ...a, status } : a));
    await databases.updateDocument(DATABASE_ID, "pipeline_activities", id, { status });
  }

  async function addComment(content: string) {
    const userName = currentUser?.name || user?.email || "Usuário";
    const data = await databases.createDocument(DATABASE_ID, "pipeline_comments", ID.unique(), {
      deal_id: deal.id,
      user_id: user?.id || null,
      user_name: userName,
      content,
    });
    setComments(prev => [...prev, { id: data.$id, deal_id: deal.id, user_id: data.user_id, user_name: userName, content, created_at: data.$createdAt }]);
  }

  async function addChecklistItem(text: string) {
    const data = await databases.createDocument(DATABASE_ID, "pipeline_checklist", ID.unique(), {
      deal_id: deal.id,
      text,
      checked: false,
      position: checklist.length,
    });
    setChecklist(prev => [...prev, { id: data.$id, deal_id: deal.id, text, checked: false, position: checklist.length }]);
  }

  async function toggleChecklistItem(id: string, checked: boolean) {
    setChecklist(prev => prev.map(c => c.id === id || (c as any).$id === id ? { ...c, checked } : c));
    await databases.updateDocument(DATABASE_ID, "pipeline_checklist", id, { checked });
  }

  async function deleteChecklistItem(id: string) {
    setChecklist(prev => prev.filter(c => c.id !== id && (c as any).$id !== id));
    await databases.deleteDocument(DATABASE_ID, "pipeline_checklist", id);
  }

  async function uploadFile(files: FileList) {
    if (!files.length) return;
    setUploadingFile(true);
    try {
      for (const file of Array.from(files)) {
        const path = `pipeline/${deal.id}/${Date.now()}_${file.name}`;
        const fileId = ID.unique();
        try {
          await storage.createFile(STORAGE_BUCKET_ID, fileId, file);
        } catch (e) {
          console.error("Erro ao subir arquivo:", e);
          continue;
        }

        const fileUrl = file.type.startsWith("image/")
          ? storage.getFileView(STORAGE_BUCKET_ID, fileId).toString()
          : storage.getFileDownload(STORAGE_BUCKET_ID, fileId).toString();

        const attRow = await databases.createDocument(DATABASE_ID, "pipeline_attachments", ID.unique(), {
          deal_id: deal.id,
          file_name: file.name,
          file_url: fileUrl,
          file_type: file.type,
          file_size: file.size,
          user_id: user?.id || null,
        })

        const newAtt: Attachment = {
          id: attRow?.id || path,
          name: file.name,
          url: fileUrl,
          type: file.type,
          size: file.size,
          created_at: new Date().toISOString(),
        };
        setAttachments((prev) => [newAtt, ...prev]);

        await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: deal.id,
          text: `Arquivo "${file.name}" enviado.`,
          created_by: user?.id || null,
        });
      }
    } catch (err) {
      console.error("Erro no upload:", err);
    } finally {
      setUploadingFile(false);
    }
  }

  async function deleteAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    await databases.deleteDocument(DATABASE_ID, "pipeline_attachments", id);
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

          {/* Interactive Pipeline Stage Stepper Ribbon */}
          <div className="flex items-center overflow-x-auto border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-100/60 dark:bg-white/[0.02] px-6 py-2.5 gap-2 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Etapa:</span>
            {columns.map((col, idx) => {
              const isCurrent = col.id === localDeal.column_id;
              const currentIdx = columns.findIndex((c) => c.id === localDeal.column_id);
              const isPassed = idx < currentIdx;

              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => saveDealField("column_id", col.id)}
                  className={`group flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all shrink-0 border ${
                    isCurrent
                      ? "bg-white dark:bg-[#161f30] text-slate-900 dark:text-white shadow-xs border-slate-300 dark:border-white/20 ring-2"
                      : isPassed
                      ? "bg-slate-200/50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-white/[0.06] hover:bg-slate-200/80 dark:hover:bg-white/[0.08]"
                      : "text-slate-400 dark:text-slate-500 border-transparent hover:bg-slate-200/40 dark:hover:bg-white/[0.04]"
                  }`}
                  style={{ ringColor: isCurrent ? col.color : "transparent" }}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: col.color }}
                  />
                  <span>{col.name}</span>
                  {isPassed && <Check className="w-3 h-3 text-emerald-500 stroke-[3]" />}
                  {isCurrent && (
                    <span
                      className="ml-1 text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${col.color}20`, color: col.color }}
                    >
                      Atual
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Main Form & Sub-panels Area */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-6">
            {/* Title & Completion toggle */}
            <div className="flex items-start gap-3.5">
              <button
                type="button"
                onClick={toggleCompleted}
                className={`mt-1.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                  localDeal.completed
                    ? "border-emerald-500 bg-emerald-500 text-white shadow-xs"
                    : "border-slate-300 dark:border-white/20 hover:border-emerald-500 dark:hover:border-emerald-400"
                }`}
                title={localDeal.completed ? "Reabrir oportunidade" : "Marcar como oportunidade ganha/concluída"}
              >
                {localDeal.completed && <Check className="h-3.5 w-3.5 stroke-[3]" />}
              </button>

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
                  className="flex-1 rounded-xl border border-indigo-500 bg-white dark:bg-[#121824] px-3.5 py-1.5 text-2xl font-bold text-slate-900 dark:text-white outline-none ring-4 ring-indigo-500/10"
                />
              ) : (
                <h1
                  className={`flex-1 cursor-pointer text-2xl font-bold tracking-tight text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors ${
                    localDeal.completed ? "line-through text-slate-400 dark:text-slate-500" : ""
                  }`}
                  onClick={() => {
                    setEditingName(true);
                    setNameInput(localDeal.name);
                  }}
                  title="Clique para editar o título"
                >
                  {localDeal.name}
                  <Edit3 className="ml-2 inline h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h1>
              )}
            </div>

            {/* Description Notes */}
            <div className="relative">
              <textarea
                value={localDeal.notes || ""}
                onChange={(e) => handleDescChange(e.target.value)}
                placeholder="Adicione anotações, resumo da negociação, próximos passos..."
                rows={3}
                className="w-full resize-none rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.03] p-4 text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#121824] focus:ring-4 focus:ring-indigo-500/10"
              />
              {descSaving && (
                <span className="absolute bottom-3 right-4 text-[11px] text-slate-400">
                  Salvando notas...
                </span>
              )}
            </div>

            {/* Core Fields Card */}
            <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Propriedades da Oportunidade
              </h2>
              <PipelineFields
                deal={localDeal}
                columns={columns}
                users={users}
                onUpdate={saveDealField}
              />
            </div>

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
              onClick={() => setRightPanel("comments")}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-xs font-bold uppercase tracking-wider transition-all relative ${
                rightPanel === "comments"
                  ? "text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#101622]"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Comentários
              {comments.length > 0 && (
                <span className="rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.2 text-[10px] font-bold">
                  {comments.length}
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
                currentUserName={currentUser?.name || user?.email || "Usuário"}
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
