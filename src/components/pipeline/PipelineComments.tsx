import { useState, useRef, useEffect } from "react";
import { Send, SmilePlus } from "lucide-react";
import { PipelineComment } from "./types";

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-rose-500",
  "bg-amber-500", "bg-teal-500", "bg-orange-500",
];

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface Props {
  comments: PipelineComment[];
  currentUserName: string;
  onAdd: (content: string) => Promise<void>;
  loading?: boolean;
}

export default function PipelineComments({ comments, currentUserName, onAdd, loading }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText("");
    await onAdd(content);
    setSending(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-1">
        {loading && (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">Carregando comentários...</p>
        )}
        {!loading && comments.length === 0 && (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-6">Nenhum comentário ainda.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${getColor(c.user_name || "U")}`}>
              {getInitials(c.user_name || "U")}
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">{c.user_name || "Usuário"}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {new Date(c.created_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                  })}
                </span>
              </div>
              <div className="mt-1 rounded-xl rounded-tl-none bg-gray-100 dark:bg-white/5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {c.content}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="mt-3 border-t border-gray-100 dark:border-white/5 pt-3">
        <div className="flex items-end gap-2">
          <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${getColor(currentUserName)}`}>
            {getInitials(currentUserName)}
          </div>
          <div className="relative flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Escreva um comentário..."
              className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0d1117] px-3 py-2.5 pr-10 text-sm outline-none focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-2 focus:ring-blue-100 transition dark:text-gray-200 dark:placeholder:text-gray-500"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="absolute bottom-2.5 right-2.5 rounded-lg p-1 text-gray-400 dark:text-gray-500 hover:text-blue-500 disabled:opacity-40 transition"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="mt-1.5 ml-9 text-[11px] text-gray-400 dark:text-gray-500">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}
