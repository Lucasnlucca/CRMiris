import { useState, useRef, useEffect, useMemo } from "react";
import { Send, MessageSquare, AtSign, CheckCheck, Sparkles, User as UserIcon, Loader2, Clock } from "lucide-react";
import { PipelineComment, PipelineUser } from "./types";

function getInitials(name: string) {
  if (!name) return "U";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const AVATAR_COLORS = [
  "bg-indigo-600",
  "bg-emerald-600",
  "bg-blue-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-purple-600",
  "bg-teal-600",
  "bg-cyan-600",
];

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface Props {
  comments: PipelineComment[];
  currentUserName: string;
  currentUserId?: string | null;
  assignedUser?: PipelineUser | null;
  users?: PipelineUser[];
  dealTitle?: string;
  onAdd: (content: string) => Promise<void>;
  loading?: boolean;
}

export default function PipelineComments({
  comments,
  currentUserName,
  currentUserId,
  assignedUser,
  users = [],
  dealTitle,
  onAdd,
  loading,
}: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new comments
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // Mention quick-add helper
  function insertMention(name: string) {
    const cleanName = name.trim().split(" ")[0]; // First name for casual @mention
    const mentionTag = `@${cleanName} `;
    setText((prev) => {
      if (prev.endsWith(" ") || prev.length === 0) {
        return prev + mentionTag;
      }
      return `${prev} ${mentionTag}`;
    });
    textareaRef.current?.focus();
  }

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText("");
    try {
      await onAdd(content);
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  // Quick starter prompt
  function setStarterPrompt(prompt: string) {
    setText(prompt);
    textareaRef.current?.focus();
  }

  // Format message content with highlighted @mentions
  function renderFormattedMessage(content: string, isMe: boolean) {
    const parts = content.split(/(@[A-Za-z0-9_À-ÿ]+)/g);
    return (
      <span className="whitespace-pre-wrap break-words leading-relaxed">
        {parts.map((part, i) => {
          if (part.startsWith("@")) {
            return (
              <span
                key={i}
                className={`inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md text-[12px] font-semibold transition ${
                  isMe
                    ? "bg-white/20 text-white border border-white/30"
                    : "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-500/30"
                }`}
              >
                {part}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  }

  // Filter team members for quick mention bar (exclude current user)
  const mentionSuggestions = useMemo(() => {
    const filtered = users.filter((u) => u.name && u.id !== currentUserId);
    // Move assigned user to front if present
    if (assignedUser && assignedUser.id !== currentUserId) {
      const others = filtered.filter((u) => u.id !== assignedUser.id);
      return [assignedUser, ...others].slice(0, 5);
    }
    return filtered.slice(0, 5);
  }, [users, assignedUser, currentUserId]);

  const assignedName = assignedUser?.name ? assignedUser.name.split(" ")[0] : null;

  return (
    <div className="flex h-full flex-col">
      {/* Top Banner: Responsible Person Context */}
      <div className="mb-3 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {assignedUser ? (
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm ${getColor(
                  assignedUser.name
                )}`}
              >
                {getInitials(assignedUser.name)}
              </div>
            ) : (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-slate-200 dark:bg-white/10 text-slate-500">
                <UserIcon className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Responsável pelo Card
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Tempo Real
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                {assignedUser ? assignedUser.name : "Nenhum responsável vinculado"}
              </p>
            </div>
          </div>

          {assignedUser && assignedUser.id !== currentUserId && (
            <button
              type="button"
              onClick={() => insertMention(assignedUser.name)}
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition"
              title={`Mencionar ${assignedUser.name}`}
            >
              <AtSign className="h-3 w-3" />
              <span>Mencionar {assignedName}</span>
            </button>
          )}

          {assignedUser && assignedUser.id === currentUserId && (
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2 py-0.5 rounded-lg">
              Você
            </span>
          )}
        </div>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-1">
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <span className="text-xs font-medium">Carregando mensagens...</span>
          </div>
        )}

        {!loading && comments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.01]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 mb-3 shadow-inner">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
              Nenhuma mensagem nesta negociação
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mb-4 leading-relaxed">
              {assignedUser
                ? `Inicie o alinhamento com a equipe ou mande um recado para ${assignedUser.name}. A pessoa será notificada instantaneamente.`
                : "Envie um recado para a equipe para alinhar os próximos passos deste lead."}
            </p>

            {assignedUser && assignedUser.id !== currentUserId && (
              <button
                type="button"
                onClick={() =>
                  setStarterPrompt(`Olá @${assignedName}, como está o andamento desta proposta?`)
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-white dark:bg-[#121824] px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 shadow-sm hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 transition"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>"Olá @{assignedName}, como está o andamento?"</span>
              </button>
            )}
          </div>
        )}

        {comments.map((c) => {
          const isMe = Boolean(currentUserId && c.user_id && c.user_id === currentUserId);
          const isAssigned = Boolean(
            assignedUser && c.user_id && assignedUser.id === c.user_id
          );

          return (
            <div
              key={c.id}
              className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
            >
              {/* Header: Name + Badge + Time */}
              <div
                className={`flex items-center gap-1.5 mb-1 px-1 text-[11px] ${
                  isMe ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {isMe ? "Você" : c.user_name || "Usuário"}
                </span>

                {isAssigned && (
                  <span className="rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-500/20 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider">
                    Responsável
                  </span>
                )}

                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {new Date(c.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {/* Message Row */}
              <div
                className={`flex items-end gap-2 max-w-[85%] ${
                  isMe ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {!isMe && (
                  <div
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl text-[10px] font-bold text-white shadow-sm ${getColor(
                      c.user_name || "U"
                    )}`}
                  >
                    {getInitials(c.user_name || "U")}
                  </div>
                )}

                <div
                  className={`rounded-2xl px-4 py-2.5 text-xs shadow-sm transition-all ${
                    isMe
                      ? "rounded-tr-none bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-indigo-500/15"
                      : "rounded-tl-none bg-slate-100/90 dark:bg-white/[0.06] text-slate-800 dark:text-slate-100 border border-slate-200/70 dark:border-white/[0.06]"
                  }`}
                >
                  {renderFormattedMessage(c.content, isMe)}

                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${
                      isMe ? "text-indigo-200" : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    <span>
                      {new Date(c.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isMe && (
                      c.id.startsWith("temp-") ? (
                        <span title="Enviando...">
                          <Clock className="h-3 w-3 text-indigo-300 animate-pulse" />
                        </span>
                      ) : (
                        <span title="Enviado">
                          <CheckCheck className="h-3 w-3 text-indigo-200" />
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Bottom Composer */}
      <div className="mt-3 border-t border-slate-200/80 dark:border-white/[0.08] pt-3">
        {/* Quick Mention Chips */}
        {mentionSuggestions.length > 0 && (
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex-shrink-0 mr-1">
              <AtSign className="h-3 w-3" /> Mencionar:
            </span>
            {mentionSuggestions.map((u) => {
              const isLeadOwner = assignedUser && assignedUser.id === u.id;
              const firstName = u.name.split(" ")[0];
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => insertMention(u.name)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium transition flex-shrink-0 ${
                    isLeadOwner
                      ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 font-semibold"
                      : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10"
                  }`}
                >
                  <span className="font-semibold text-indigo-500">@</span>
                  <span>{firstName}</span>
                  {isLeadOwner && (
                    <span className="text-[9px] opacity-75 font-normal">(Resp.)</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm mb-1 ${getColor(
              currentUserName
            )}`}
          >
            {getInitials(currentUserName)}
          </div>

          <div className="relative flex-1 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0d121c] focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:bg-white dark:focus-within:bg-[#121824] transition-all p-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder={
                assignedUser && assignedUser.id !== currentUserId
                  ? `Envie uma mensagem para ${assignedName} ou equipe...`
                  : "Escreva uma mensagem para a equipe ou @mencione alguém..."
              }
              className="w-full resize-none bg-transparent pr-10 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none leading-relaxed"
            />

            <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/[0.04] pt-1.5 mt-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                <kbd className="rounded bg-slate-200/60 dark:bg-white/10 px-1 py-0.2 text-[9px] font-mono">Enter</kbd> para enviar · <kbd className="rounded bg-slate-200/60 dark:bg-white/10 px-1 py-0.2 text-[9px] font-mono">Shift+Enter</kbd> para nova linha
              </span>

              <button
                type="button"
                onClick={handleSend}
                disabled={!text.trim() || sending}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white p-1.5 shadow-sm shadow-indigo-500/25 transition disabled:hover:bg-indigo-600"
                title="Enviar mensagem"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
