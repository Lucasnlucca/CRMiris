import { useEffect, useRef, useState } from "react";
import { Calendar, Flag, Tag, User, X } from "lucide-react";
import { createPortal } from "react-dom";

interface QuickAddUser { id: string; name: string; }

interface QuickAddForm {
  name: string;
  assigned_to: string;
  due_date: string;
  priority: string;
  label: string;
}

interface Props {
  users: QuickAddUser[];
  onSave: (form: QuickAddForm) => Promise<void>;
  onCancel: () => void;
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

const PRIORITIES = [
  { v: "urgente", l: "Urgente", flag: "text-red-500", bg: "bg-red-50" },
  { v: "alta",    l: "Alta",    flag: "text-orange-500", bg: "bg-orange-50" },
  { v: "normal",  l: "Normal",  flag: "text-blue-500",  bg: "bg-blue-50" },
  { v: "baixa",   l: "Baixa",   flag: "text-gray-400",  bg: "bg-gray-50" },
];

type DropdownType = "assignee" | "date" | "priority" | "tag" | null;

interface DropdownPos { top: number; left: number; }

function FixedDropdown({ pos, children, onClose }: { pos: DropdownPos; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="min-w-[200px] rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-2xl overflow-hidden animate-[fadeDropdown_0.12s_ease-out_both]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

export default function QuickAddCard({ users, onSave, onCancel }: Props) {
  const [form, setForm] = useState<QuickAddForm>({ name: "", assigned_to: "", due_date: "", priority: "", label: "" });
  const [saving, setSaving] = useState(false);
  const [openDd, setOpenDd] = useState<DropdownType>(null);
  const [ddPos, setDdPos] = useState<DropdownPos>({ top: 0, left: 0 });

  const assigneeRef = useRef<HTMLButtonElement>(null);
  const dateRef = useRef<HTMLButtonElement>(null);
  const priorityRef = useRef<HTMLButtonElement>(null);
  const tagRef = useRef<HTMLButtonElement>(null);

  function openDropdown(type: DropdownType, ref: React.RefObject<HTMLElement | null>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setDdPos({ top: rect.bottom + 6, left: rect.left });
    setOpenDd(openDd === type ? null : type);
  }

  function closeDropdown() { setOpenDd(null); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const assignedUser = users.find((u) => u.id === form.assigned_to);
  const priorityCfg = PRIORITIES.find((p) => p.v === form.priority);

  return (
    <div className="rounded-[14px] border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-md overflow-visible">
      <form onSubmit={handleSubmit}>
        <div className="px-3 pt-3 pb-2">
          <input
            autoFocus
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
            placeholder="Nome da tarefa..."
            className="w-full bg-transparent text-[13px] font-medium text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder:text-gray-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 border-t border-gray-100 dark:border-white/5 px-3 py-2 flex-wrap">
          {/* Assignee */}
          {assignedUser ? (
            <button
              type="button"
              onClick={() => setForm({ ...form, assigned_to: "" })}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-[9px] font-bold text-white hover:ring-2 hover:ring-rose-400 transition"
              title={`Remover ${assignedUser.name}`}
            >
              {getInitials(assignedUser.name)}
            </button>
          ) : (
            <button
              ref={assigneeRef}
              type="button"
              onClick={() => openDropdown("assignee", assigneeRef)}
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed transition ${openDd === "assignee" ? "border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10" : "border-gray-300 dark:border-white/15 text-gray-400 dark:text-gray-500 hover:border-indigo-400 hover:text-indigo-600"}`}
              title="Responsável"
            >
              <User className="h-3 w-3" />
            </button>
          )}

          {/* Date */}
          <button
            ref={dateRef}
            type="button"
            onClick={() => openDropdown("date", dateRef)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition ${
              form.due_date ? "bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-medium" :
              openDd === "date" ? "bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300" :
              "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-600 dark:hover:text-gray-400"
            }`}
          >
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
            {form.due_date
              ? new Date(form.due_date).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
              : "Adicionar datas"}
          </button>

          {/* Priority */}
          <button
            ref={priorityRef}
            type="button"
            onClick={() => openDropdown("priority", priorityRef)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition ${
              priorityCfg ? `${priorityCfg.flag} ${priorityCfg.bg} font-medium` :
              openDd === "priority" ? "bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300" :
              "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-600 dark:hover:text-gray-400"
            }`}
          >
            <Flag className="h-3.5 w-3.5 flex-shrink-0" />
            {priorityCfg ? priorityCfg.l : "Adicionar prioridade"}
          </button>

          {/* Tag */}
          <button
            ref={tagRef}
            type="button"
            onClick={() => openDropdown("tag", tagRef)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition ${
              form.label ? "bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-medium" :
              openDd === "tag" ? "bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300" :
              "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-600 dark:hover:text-gray-400"
            }`}
          >
            <Tag className="h-3.5 w-3.5 flex-shrink-0" />
            {form.label || "Add tag"}
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-white/5 px-3 py-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10 transition">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!form.name.trim() || saving}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs shadow-indigo-500/20 disabled:opacity-50 transition"
          >
            Salvar
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </form>

      {/* Portaled dropdowns */}
      {openDd === "assignee" && (
        <FixedDropdown pos={ddPos} onClose={closeDropdown}>
          <div className="px-3 py-2 border-b border-gray-100 dark:border-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Responsáveis</p>
          </div>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { setForm({ ...form, assigned_to: u.id }); closeDropdown(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition hover:bg-gray-50 dark:hover:bg-white/5 ${form.assigned_to === u.id ? "bg-gray-50 dark:bg-white/5 font-semibold" : ""}`}
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                {getInitials(u.name)}
              </div>
              <span className="text-gray-800 dark:text-gray-100">{u.name}</span>
              {form.assigned_to === u.id && <span className="ml-auto text-teal-500 text-xs">✓</span>}
            </button>
          ))}
        </FixedDropdown>
      )}

      {openDd === "date" && (
        <FixedDropdown pos={ddPos} onClose={closeDropdown}>
          <div className="p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Data e hora</p>
            <input
              autoFocus
              type="datetime-local"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
            {form.due_date && (
              <button
                type="button"
                onClick={() => { setForm({ ...form, due_date: "" }); closeDropdown(); }}
                className="mt-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition"
              >
                <X className="h-3 w-3" /> Remover data
              </button>
            )}
          </div>
        </FixedDropdown>
      )}

      {openDd === "priority" && (
        <FixedDropdown pos={ddPos} onClose={closeDropdown}>
          <div className="px-3 py-2 border-b border-gray-100 dark:border-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Prioridade</p>
          </div>
          {PRIORITIES.map((p) => (
            <button
              key={p.v}
              type="button"
              onClick={() => { setForm({ ...form, priority: form.priority === p.v ? "" : p.v }); closeDropdown(); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition hover:bg-gray-50 dark:hover:bg-white/5 ${form.priority === p.v ? "font-semibold" : ""}`}
            >
              <Flag className={`h-4 w-4 ${p.flag}`} />
              <span className={p.flag.replace("text-", "text-")}>{p.l}</span>
              {form.priority === p.v && <span className="ml-auto text-green-500 text-xs">✓</span>}
            </button>
          ))}
          {form.priority && (
            <button
              type="button"
              onClick={() => { setForm({ ...form, priority: "" }); closeDropdown(); }}
              className="flex w-full items-center gap-2.5 border-t border-gray-100 dark:border-white/5 px-3 py-2.5 text-sm text-gray-500 transition hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <X className="h-4 w-4" /> Limpar
            </button>
          )}
        </FixedDropdown>
      )}

      {openDd === "tag" && (
        <FixedDropdown pos={ddPos} onClose={closeDropdown}>
          <div className="p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Etiqueta</p>
            <input
              autoFocus
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); closeDropdown(); } }}
              placeholder="Pesquise ou adicione tags..."
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
            {form.label && (
              <button
                type="button"
                onClick={() => { setForm({ ...form, label: "" }); closeDropdown(); }}
                className="mt-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition"
              >
                <X className="h-3 w-3" /> Remover etiqueta
              </button>
            )}
          </div>
        </FixedDropdown>
      )}
    </div>
  );
}
