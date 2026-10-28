import { useMemo } from "react";
import {
  Bell, Phone, Users, MessageSquare, Mail, Clock, Check,
  GitBranch, Flag, User, Tag, Building2, Sparkles, CheckCircle2,
  Calendar, AlertCircle
} from "lucide-react";
import { PipelineActivity as PipelineActivityItem, PipelineHistoryItem, PipelineUser } from "./types";

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  Lembrete: <Bell className="h-3.5 w-3.5" />,
  "Ligação": <Phone className="h-3.5 w-3.5" />,
  "Reunião": <Users className="h-3.5 w-3.5" />,
  WhatsApp: <MessageSquare className="h-3.5 w-3.5" />,
  "E-mail": <Mail className="h-3.5 w-3.5" />,
};

function formatHistoryMeta(text: string) {
  if (text.includes("Card criado")) {
    return {
      title: "Oportunidade criada no funil",
      icon: <Sparkles className="h-3.5 w-3.5 text-amber-500" />,
      bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    };
  }
  if (text.includes("concluído")) {
    return {
      title: "Oportunidade marcada como concluída",
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
      bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    };
  }
  if (text.includes("movido de") || text.includes("column_id")) {
    return {
      title: text.includes("movido") ? text : "Etapa da oportunidade alterada",
      icon: <GitBranch className="h-3.5 w-3.5 text-blue-500" />,
      bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    };
  }
  if (text.includes("priority")) {
    return {
      title: "Prioridade do card atualizada",
      icon: <Flag className="h-3.5 w-3.5 text-rose-500" />,
      bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    };
  }
  if (text.includes("assigned_to")) {
    return {
      title: "Responsável atribuído à oportunidade",
      icon: <User className="h-3.5 w-3.5 text-violet-500" />,
      bg: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    };
  }
  if (text.includes("client_id") || text.toLowerCase().includes("cliente")) {
    return {
      title: "Vínculo de cliente atualizado",
      icon: <Building2 className="h-3.5 w-3.5 text-indigo-500" />,
      bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    };
  }
  if (text.includes("tags")) {
    return {
      title: "Etiquetas da oportunidade alteradas",
      icon: <Tag className="h-3.5 w-3.5 text-indigo-500" />,
      bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    };
  }
  if (text.includes("Atividade")) {
    return {
      title: text,
      icon: <Calendar className="h-3.5 w-3.5 text-indigo-500" />,
      bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    };
  }
  return {
    title: text.replace(/^Campo "(.+)" atualizado\.$/, 'Campo "$1" atualizado.'),
    icon: <Clock className="h-3.5 w-3.5 text-slate-400" />,
    bg: "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-white/10",
  };
}

interface Props {
  activities: PipelineActivityItem[];
  history: PipelineHistoryItem[];
  users: PipelineUser[];
  activityForm: {
    type: string;
    responsible: string;
    subject: string;
    scheduled_for: string;
    duration: string;
    description: string;
  };
  onActivityFormChange: (field: string, value: string) => void;
  onAddActivity: (e: React.FormEvent) => void;
  onToggleActivity?: (id: string, status: "Planejado" | "Concluído") => void;
}

export default function PipelineActivity({
  activities,
  history,
  users,
  activityForm,
  onActivityFormChange,
  onAddActivity,
  onToggleActivity,
}: Props) {
  // Deduplicate consecutive identical logs to avoid cluttered feeds
  const cleanHistory = useMemo(() => {
    const list: PipelineHistoryItem[] = [];
    for (let i = 0; i < history.length; i++) {
      const cur = history[i];
      const prev = list[list.length - 1];
      if (prev && prev.text === cur.text) {
        continue;
      }
      list.push(cur);
    }
    return list;
  }, [history]);

  return (
    <div className="flex h-full flex-col">
      {/* Activity feed */}
      <div className="flex-1 space-y-3.5 overflow-y-auto pr-1">
        {cleanHistory.length === 0 && activities.length === 0 && (
          <div className="py-12 text-center">
            <Clock className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Nenhuma atividade registrada.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Crie lembretes, reuniões ou tarefas abaixo.</p>
          </div>
        )}

        {/* Planned / Executed Activities */}
        {activities.map((act) => (
          <div
            key={act.id}
            className={`flex items-start gap-3 rounded-xl border p-3 transition ${
              act.status === "Concluído"
                ? "bg-slate-50/60 dark:bg-white/[0.02] border-slate-200/60 dark:border-white/[0.05]"
                : "bg-white dark:bg-[#121824] border-indigo-100 dark:border-indigo-500/20 shadow-2xs"
            }`}
          >
            <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs ${
              act.status === "Concluído"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
            }`}>
              {ACTIVITY_ICONS[act.type] || <Bell className="h-3.5 w-3.5" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-bold truncate ${act.status === "Concluído" ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"}`}>
                    {act.subject}
                  </p>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{act.type}</span>
                    {act.scheduled_for && (
                      <span> · {new Date(act.scheduled_for).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                    {act.responsible && <span> · {act.responsible}</span>}
                  </p>
                  {act.description && (
                    <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/[0.03] p-2 rounded-lg">
                      {act.description}
                    </p>
                  )}
                </div>

                {onToggleActivity && (
                  <button
                    type="button"
                    onClick={() => onToggleActivity(act.id, act.status === "Concluído" ? "Planejado" : "Concluído")}
                    className={`flex-shrink-0 rounded-lg p-1 transition ${
                      act.status === "Concluído"
                        ? "bg-emerald-500 text-white"
                        : "border border-slate-300 dark:border-white/20 text-slate-400 hover:border-emerald-500 hover:text-emerald-500"
                    }`}
                    title={act.status === "Concluído" ? "Reabrir atividade" : "Concluir atividade"}
                  >
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* History / Audit Timeline */}
        {cleanHistory.map((item) => {
          const meta = formatHistoryMeta(item.text);
          return (
            <div key={item.id} className="flex items-start gap-2.5 px-1 py-1">
              <div className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border ${meta.bg}`}>
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-tight">
                  {meta.title}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {new Date(item.created_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add activity form */}
      <div className="mt-4 border-t border-slate-200/80 dark:border-white/[0.08] pt-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-indigo-500" />
          Agendar Nova Atividade
        </p>

        <form onSubmit={onAddActivity} className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={activityForm.type}
              onChange={(e) => onActivityFormChange("type", e.target.value)}
              className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none transition focus:border-indigo-500"
            >
              <option value="Lembrete">Lembrete</option>
              <option value="Ligação">Ligação</option>
              <option value="Reunião">Reunião</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="E-mail">E-mail</option>
            </select>
            <select
              value={activityForm.responsible}
              onChange={(e) => onActivityFormChange("responsible", e.target.value)}
              className="rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none transition focus:border-indigo-500"
            >
              <option value="">Responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={activityForm.subject}
            onChange={(e) => onActivityFormChange("subject", e.target.value)}
            placeholder="Assunto da atividade *"
            className="w-full rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
          />

          <input
            type="datetime-local"
            value={activityForm.scheduled_for}
            onChange={(e) => onActivityFormChange("scheduled_for", e.target.value)}
            className="w-full rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] px-3 py-2 text-xs text-slate-800 dark:text-slate-200 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
          />

          <textarea
            value={activityForm.description}
            onChange={(e) => onActivityFormChange("description", e.target.value)}
            rows={2}
            placeholder="Observações adicionais (opcional)"
            className="w-full resize-none rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
          />

          <button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition hover:scale-[1.01] active:scale-[0.99]"
          >
            Agendar Atividade
          </button>
        </form>
      </div>
    </div>
  );
}
