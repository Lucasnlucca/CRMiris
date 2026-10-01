import { useState } from "react";
import { Plus, Trash2, CheckSquare } from "lucide-react";
import { PipelineChecklistItem } from "./types";

interface Props {
  items: PipelineChecklistItem[];
  onAdd: (text: string) => void;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
}

export default function PipelineChecklist({ items, onAdd, onToggle, onDelete }: Props) {
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);

  const done = items.filter((i) => i.checked).length;
  const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  function handleAdd() {
    const t = newText.trim();
    if (!t) return;
    onAdd(t);
    setNewText("");
    setAdding(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Checklist</span>
          {items.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{done}/{items.length}</span>
          )}
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 dark:border-white/15 px-2.5 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar item
        </button>
      </div>

      {items.length > 0 && (
        <div className="mb-3">
          <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[10px] text-gray-400 dark:text-gray-500">{pct}%</p>
        </div>
      )}

      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/5 transition">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => onToggle(item.id, !item.checked)}
              className="h-4 w-4 rounded border-gray-300 dark:border-white/15 accent-emerald-500 cursor-pointer"
            />
            <span className={`flex-1 text-sm ${item.checked ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}>
              {item.text}
            </span>
            <button
              onClick={() => onDelete(item.id)}
              className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-400 dark:text-gray-500 hover:text-red-500 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") { setAdding(false); setNewText(""); }
            }}
            placeholder="Novo item do checklist..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-white/15 px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:bg-white/5 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
          <button
            onClick={handleAdd}
            className="rounded-lg bg-gray-900 dark:bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 dark:hover:bg-emerald-400 transition"
          >
            Adicionar
          </button>
          <button
            onClick={() => { setAdding(false); setNewText(""); }}
            className="rounded-lg border border-gray-200 dark:border-white/10 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5 transition"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
