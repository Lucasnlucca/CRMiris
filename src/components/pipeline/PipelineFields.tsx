import { useState } from "react";
import { Calendar, Tag, User, DollarSign, Phone, Mail, Building2, Briefcase, Clock, AlertCircle, Flag, X, Plus } from "lucide-react";
import { PipelineDeal, PipelineColumn, PipelineUser, PipelinePriority } from "./types";

const PRIORITY_CONFIG: Record<PipelinePriority, { label: string; color: string; bg: string; flag: string }> = {
  urgente: { label: "Urgente", color: "text-red-600", bg: "bg-red-50 border-red-200 hover:bg-red-100", flag: "text-red-500" },
  alta:    { label: "Alta",    color: "text-orange-600", bg: "bg-orange-50 border-orange-200 hover:bg-orange-100", flag: "text-orange-500" },
  normal:  { label: "Normal",  color: "text-blue-600", bg: "bg-blue-50 border-blue-200 hover:bg-blue-100", flag: "text-blue-500" },
  baixa:   { label: "Baixa",   color: "text-gray-500", bg: "bg-gray-50 border-gray-200 hover:bg-gray-100", flag: "text-gray-400" },
};

const PRIORITIES: PipelinePriority[] = ["urgente", "alta", "normal", "baixa"];

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-rose-500",
  "bg-amber-500", "bg-teal-500", "bg-cyan-500",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-white/5 last:border-0">
      <div className="flex items-center gap-2 w-40 flex-shrink-0 text-gray-500 text-sm pt-0.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

interface Props {
  deal: PipelineDeal;
  columns: PipelineColumn[];
  users: PipelineUser[];
  onUpdate: (field: string, value: string | number | boolean | string[] | null) => void;
}

export default function PipelineFields({ deal, columns, users, onUpdate }: Props) {
  const column = columns.find((c) => c.id === deal.column_id);
  const priority = deal.priority ?? "normal";
  const pConf = PRIORITY_CONFIG[priority];
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [addingLabel, setAddingLabel] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const assignees: string[] = deal.assignees ?? [];
  const tags: string[] = deal.tags ?? [];

  function toggleAssignee(userId: string) {
    const next = assignees.includes(userId)
      ? assignees.filter((id) => id !== userId)
      : [...assignees, userId];
    onUpdate("assignees", next);
  }

  function addLabel() {
    const val = labelInput.trim();
    if (!val || tags.includes(val)) { setLabelInput(""); setAddingLabel(false); return; }
    onUpdate("tags", [...tags, val]);
    setLabelInput("");
    setAddingLabel(false);
  }

  function removeLabel(label: string) {
    onUpdate("tags", tags.filter((l) => l !== label));
  }

  const assignedUsers = users.filter((u) => assignees.includes(u.id));
  const unassignedUsers = users.filter((u) => !assignees.includes(u.id));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161b22] p-4">
      {/* Status */}
      <FieldRow icon={<AlertCircle className="h-4 w-4" />} label="Status">
        <select
          value={deal.column_id}
          onChange={(e) => onUpdate("column_id", e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0d1117] px-3 py-1.5 text-sm font-medium outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:text-gray-200"
          style={{ borderLeftColor: column?.color, borderLeftWidth: 3 }}
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </FieldRow>

      {/* Priority */}
      <FieldRow icon={<Flag className="h-4 w-4" />} label="Prioridade">
        <div className="relative">
          <button
            onClick={() => setPriorityOpen((o) => !o)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${pConf.bg} ${pConf.color}`}
          >
            <Flag className={`h-3.5 w-3.5 ${pConf.flag}`} />
            {pConf.label}
          </button>
          {priorityOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-lg overflow-hidden">
              {PRIORITIES.map((p) => {
                const cfg = PRIORITY_CONFIG[p];
                return (
                  <button
                    key={p}
                    onClick={() => { onUpdate("priority", p); setPriorityOpen(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition hover:bg-gray-50 dark:hover:bg-white/5 ${priority === p ? "font-semibold" : ""}`}
                  >
                    <Flag className={`h-4 w-4 ${cfg.flag}`} />
                    <span className={cfg.color}>{cfg.label}</span>
                    {priority === p && <span className="ml-auto text-blue-500 text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </FieldRow>

      {/* Responsáveis (multi) */}
      <FieldRow icon={<User className="h-4 w-4" />} label="Responsáveis">
        <div className="flex flex-wrap items-center gap-2">
          {assignedUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => toggleAssignee(u.id)}
              title={`Remover ${u.name}`}
              className="group flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0d1117] px-2 py-0.5 text-xs hover:border-red-300 hover:bg-red-50 transition"
            >
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor(u.name)}`}>
                {getInitials(u.name)}
              </div>
              <span className="text-gray-700 dark:text-gray-300 group-hover:text-red-600">{u.name}</span>
              <X className="h-3 w-3 text-gray-400 dark:text-gray-500 group-hover:text-red-500" />
            </button>
          ))}
          {unassignedUsers.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setAssigneeOpen(!assigneeOpen)}
                className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 dark:border-white/15 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition"
              >
                <Plus className="h-3 w-3" />
                Adicionar
              </button>
              {assigneeOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-lg overflow-hidden">
                  {unassignedUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { toggleAssignee(u.id); setAssigneeOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition"
                    >
                      <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor(u.name)}`}>
                        {getInitials(u.name)}
                      </div>
                      <span className="truncate">{u.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </FieldRow>

      {/* Criado */}
      <FieldRow icon={<Calendar className="h-4 w-4" />} label="Criado">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {(deal as any).$createdAt ? new Date((deal as any).$createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
        </span>
      </FieldRow>


      {/* Pendências */}
      <FieldRow icon={<Clock className="h-4 w-4" />} label="Pendências">
        <span className="text-sm text-gray-600 dark:text-gray-400">{deal.pending || "—"}</span>
      </FieldRow>

      {/* Etiquetas */}
      <FieldRow icon={<Tag className="h-4 w-4" />} label="Etiquetas">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((label) => (
            <span
              key={label}
              className="flex items-center gap-1 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-2.5 py-0.5 text-[11px] font-medium text-gray-700 dark:text-gray-300"
            >
              {label}
              <button
                onClick={() => removeLabel(label)}
                className="text-gray-400 dark:text-gray-500 hover:text-red-500 transition"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {addingLabel ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addLabel();
                  if (e.key === "Escape") { setLabelInput(""); setAddingLabel(false); }
                }}
                onBlur={addLabel}
                placeholder="Etiqueta..."
                className="w-28 rounded-full border border-blue-300 px-2.5 py-0.5 text-[11px] outline-none focus:ring-2 focus:ring-blue-100 transition"
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingLabel(true)}
              className="flex items-center gap-0.5 rounded-full border border-dashed border-gray-300 dark:border-white/15 px-2 py-0.5 text-[11px] text-gray-500 hover:border-blue-400 hover:text-blue-600 transition"
            >
              <Plus className="h-3 w-3" />
              Nova
            </button>
          )}
          {tags.length === 0 && !addingLabel && (
            <span className="text-sm text-gray-400 dark:text-gray-500">Nenhuma</span>
          )}
        </div>
      </FieldRow>

      {/* Contato */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-white/5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Contato</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Phone className="h-3 w-3" /> Telefone
            </label>
            <input
              type="text"
              defaultValue={deal.contact_phone}
              onBlur={(e) => onUpdate("contact_phone", e.target.value)}
              placeholder="—"
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Mail className="h-3 w-3" /> E-mail
            </label>
            <input
              type="email"
              defaultValue={deal.contact_email}
              onBlur={(e) => onUpdate("contact_email", e.target.value)}
              placeholder="—"
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Building2 className="h-3 w-3" /> Empresa
            </label>
            <input
              type="text"
              defaultValue={deal.contact_company}
              onBlur={(e) => onUpdate("contact_company", e.target.value)}
              placeholder="—"
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Briefcase className="h-3 w-3" /> Cargo
            </label>
            <input
              type="text"
              value={deal.contact_position}
              onChange={(e) => onUpdate("contact_position", e.target.value)}
              placeholder="—"
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
