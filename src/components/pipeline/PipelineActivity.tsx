import { Bell, Phone, Users, MessageSquare, Mail, Clock, Check } from "lucide-react";
import { PipelineActivity as PipelineActivityItem, PipelineHistoryItem, PipelineUser } from "./types";

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  Lembrete: <Bell className="h-3.5 w-3.5" />,
  "Ligação": <Phone className="h-3.5 w-3.5" />,
  "Reunião": <Users className="h-3.5 w-3.5" />,
  WhatsApp: <MessageSquare className="h-3.5 w-3.5" />,
  "E-mail": <Mail className="h-3.5 w-3.5" />,
};

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
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
  return (
    <div className="flex h-full flex-col">
      {/* Activity feed */}
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {history.length === 0 && activities.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Nenhuma atividade ainda.</p>
        )}

        {history.map((item) => (
          <div key={item.id} className="flex gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/5 text-[10px] font-semibold text-gray-500">
              <Clock className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{item.text}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                {new Date(item.created_at).toLocaleString("pt-BR", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                })}
              </p>
            </div>
          </div>
        ))}

        {activities.map((act) => (
          <div key={act.id} className="flex gap-2.5">
            <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] ${
              act.status === "Concluído" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
            }`}>
              {ACTIVITY_ICONS[act.type] || <Bell className="h-3.5 w-3.5" />}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{act.subject}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {act.type}
                    {act.scheduled_for ? ` · ${new Date(act.scheduled_for).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                    {act.responsible ? ` · ${act.responsible}` : ""}
                  </p>
                  {act.description && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{act.description}</p>
                  )}
                </div>
                {onToggleActivity && (
                  <button
                    onClick={() => onToggleActivity(act.id, act.status === "Concluído" ? "Planejado" : "Concluído")}
                    className={`flex-shrink-0 rounded-full p-1 transition ${
                      act.status === "Concluído"
                        ? "bg-emerald-500 text-white"
                        : "border border-gray-300 dark:border-white/15 text-gray-400 dark:text-gray-500 hover:border-emerald-400 hover:text-emerald-500"
                    }`}
                    title={act.status === "Concluído" ? "Reabrir" : "Concluir"}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add activity form */}
      <div className="mt-4 border-t border-gray-100 dark:border-white/5 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Nova atividade</p>
        <form onSubmit={onAddActivity} className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={activityForm.type}
              onChange={(e) => onActivityFormChange("type", e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
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
              className="rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
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
            placeholder="Assunto *"
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
          <input
            type="datetime-local"
            value={activityForm.scheduled_for}
            onChange={(e) => onActivityFormChange("scheduled_for", e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
          <textarea
            value={activityForm.description}
            onChange={(e) => onActivityFormChange("description", e.target.value)}
            rows={2}
            placeholder="Descrição (opcional)"
            className="w-full resize-none rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-gray-900 dark:bg-emerald-500 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:hover:bg-emerald-400 transition"
          >
            Criar atividade
          </button>
        </form>
      </div>
    </div>
  );
}
