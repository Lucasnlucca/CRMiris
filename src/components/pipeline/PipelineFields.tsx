import { useState, useMemo } from "react";
import {
  Calendar, Tag, User, DollarSign, Phone, Mail, Building2, Briefcase,
  Clock, AlertCircle, Flag, X, Plus, ExternalLink, Search, Check,
  Sparkles, MessageSquare, ArrowRight, Unlink, RefreshCw
} from "lucide-react";
import { PipelineDeal, PipelineColumn, PipelineUser, PipelinePriority, PipelineClient } from "./types";

const PRIORITY_CONFIG: Record<PipelinePriority, { label: string; color: string; bg: string; border: string; flag: string }> = {
  urgente: { label: "Urgente", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-500/10", border: "border-rose-200 dark:border-rose-500/30", flag: "text-rose-500" },
  alta:    { label: "Alta",    color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/30", flag: "text-amber-500" },
  normal:  { label: "Normal",  color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/30", flag: "text-blue-500" },
  baixa:   { label: "Baixa",   color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-100 dark:bg-white/5", border: "border-slate-200 dark:border-white/10", flag: "text-slate-400" },
};

const PRIORITIES: PipelinePriority[] = ["urgente", "alta", "normal", "baixa"];

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-rose-500",
  "bg-amber-500", "bg-teal-500", "bg-cyan-500", "bg-indigo-500", "bg-violet-500"
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

interface Props {
  deal: PipelineDeal;
  columns: PipelineColumn[];
  users: PipelineUser[];
  clients?: PipelineClient[];
  onUpdate: (field: string, value: string | number | boolean | string[] | null) => void;
  onUpdateFields?: (updates: Record<string, any>) => void;
}

export default function PipelineFields({ deal, columns, users, clients = [], onUpdate, onUpdateFields }: Props) {
  const column = columns.find((c) => c.id === deal.column_id);
  const priority = deal.priority ?? "normal";
  const pConf = PRIORITY_CONFIG[priority];
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [addingLabel, setAddingLabel] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [clientSelectorOpen, setClientSelectorOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [valueInput, setValueInput] = useState(deal.value ? String(deal.value) : "");

  const linkedClient = useMemo(() => {
    if (!deal.client_id) return null;
    return clients.find((c) => {
      const cid = c.id || c.$id;
      return cid && cid === deal.client_id;
    }) || null;
  }, [clients, deal.client_id]);

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    if (!term) return clients.slice(0, 15);
    return clients.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const fantasy = (c.fantasy_name || "").toLowerCase();
      const doc = (c.document || "").toLowerCase();
      return name.includes(term) || fantasy.includes(term) || doc.includes(term);
    }).slice(0, 20);
  }, [clients, clientSearch]);

  function handleLinkClient(client: PipelineClient) {
    const clientId = client.id || client.$id;
    if (!clientId) return;

    const updates: Record<string, any> = { client_id: clientId };
    const clientName = client.fantasy_name || client.name;

    if (!deal.company && clientName) updates.company = clientName;
    if (!deal.contact_company && clientName) updates.contact_company = clientName;
    if (!deal.contact_phone && client.phone) updates.contact_phone = client.phone;
    if (!deal.contact_email && client.email) updates.contact_email = client.email;

    if (onUpdateFields) {
      onUpdateFields(updates);
    } else {
      Object.entries(updates).forEach(([k, v]) => onUpdate(k, v));
    }

    setClientSelectorOpen(false);
    setClientSearch("");
  }

  function handleUnlinkClient() {
    if (onUpdateFields) {
      onUpdateFields({ client_id: null });
    } else {
      onUpdate("client_id", null);
    }
  }

  const tags: string[] = deal.tags ?? [];
  const currentAssigneeId = deal.assigned_to || (Array.isArray(deal.assignees) && deal.assignees[0]) || "";
  const assignedUser = users.find((u) => {
    const uid = u.id || (u as any).$id;
    return uid && uid === currentAssigneeId;
  });

  function handleAssign(userId: string | null) {
    onUpdate("assigned_to", userId);
    setAssigneeOpen(false);
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

  function handleSaveValue() {
    const num = parseFloat(valueInput.replace(/\./g, "").replace(",", ".")) || 0;
    if (num !== deal.value) {
      onUpdate("value", num);
    }
  }

  return (
    <div className="space-y-5">
      {/* 1. SEÇÃO: CLIENTE VINCULADO (DESTAQUE CORPORATIVO) */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Cliente & Empresa
            </span>
          </div>

          {(linkedClient || deal.client_id) && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setClientSelectorOpen(true)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition"
              >
                <RefreshCw className="h-3 w-3" />
                Trocar
              </button>
              <button
                type="button"
                onClick={handleUnlinkClient}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                title="Desvincular cliente"
              >
                <Unlink className="h-3 w-3" />
                Desvincular
              </button>
            </div>
          )}
        </div>

        {linkedClient || deal.client_id ? (
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50/30 dark:from-[#151c2c] dark:via-[#121824] dark:to-[#0f1420] p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-base shadow-xs">
                  {getInitials(linkedClient ? (linkedClient.fantasy_name || linkedClient.name) : (deal.company || "CL"))}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {linkedClient ? (linkedClient.fantasy_name || linkedClient.name) : deal.company || `Cliente ID: ${deal.client_id}`}
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                      Vinculado
                    </span>
                  </div>

                  {linkedClient?.fantasy_name && linkedClient.name !== linkedClient.fantasy_name && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {linkedClient.name}
                    </p>
                  )}

                  {linkedClient?.document && (
                    <span className="inline-block text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-1">
                      {linkedClient.document}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-white/[0.05]">
                <a
                  href="#/crm-contatos"
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] shadow-2xs transition"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-indigo-500" />
                  Ver Cadastro
                </a>
              </div>
            </div>

            {/* Quick Contact Info from Client */}
            {(linkedClient?.phone || linkedClient?.email) && (
              <div className="mt-3.5 pt-3 border-t border-slate-200/60 dark:border-white/[0.06] flex flex-wrap items-center gap-3">
                {linkedClient.phone && (
                  <a
                    href={`https://wa.me/55${linkedClient.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
                  >
                    <Phone className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    <span>{linkedClient.phone}</span>
                  </a>
                )}
                {linkedClient.email && (
                  <a
                    href={`mailto:${linkedClient.email}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 transition"
                  >
                    <Mail className="h-3 w-3 text-slate-500" />
                    <span>{linkedClient.email}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] p-6 text-center transition hover:border-indigo-400/60 hover:bg-white/60 dark:hover:bg-white/[0.03]">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 mb-2">
              <Building2 className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Nenhum cliente vinculado a esta oportunidade
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm mx-auto">
              Vincule um cliente cadastrado para sincronizar dados fiscais, contatos e histórico unificado.
            </p>
            <button
              type="button"
              onClick={() => setClientSelectorOpen(true)}
              className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Vincular Cliente da Base
            </button>
          </div>
        )}

        {/* Client Search Popover */}
        {clientSelectorOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121824] p-5 shadow-2xl space-y-3.5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Vincular Cliente à Oportunidade
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => { setClientSelectorOpen(false); setClientSearch(""); }}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Buscar cliente por nome, razão ou documento..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] py-2.5 pl-9 pr-4 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Client List */}
              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {deal.client_id && (
                  <button
                    type="button"
                    onClick={() => { handleUnlinkClient(); setClientSelectorOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-rose-200/80 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition"
                  >
                    <Unlink className="h-4 w-4" />
                    <span>Desvincular cliente atual (Deixar como Lead avulso)</span>
                  </button>
                )}

                {filteredClients.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    Nenhum cliente cadastrado encontrado com este termo.
                  </div>
                ) : (
                  filteredClients.map((c) => {
                    const cid = c.id || c.$id;
                    const isSelected = Boolean(deal.client_id && cid === deal.client_id);
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => handleLinkClient(c)}
                        className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition border ${
                          isSelected
                            ? "bg-indigo-50/80 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/30 text-indigo-900 dark:text-indigo-200 shadow-2xs"
                            : "border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:border-slate-200 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                            {c.fantasy_name || c.name}
                          </div>
                          {c.fantasy_name && c.name !== c.fantasy_name && (
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {c.name}
                            </div>
                          )}
                          {c.document && (
                            <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                              {c.document}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex justify-end">
                <button
                  type="button"
                  onClick={() => { setClientSelectorOpen(false); setClientSearch(""); }}
                  className="rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. SEÇÃO: PROPRIEDADES DA OPORTUNIDADE (GRID EQUILIBRADO 2 COLUNAS) */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          Propriedades da Negociação
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Status / Etapa */}
          <div className="rounded-xl border border-slate-100 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02] p-3">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              <AlertCircle className="h-3.5 w-3.5 text-indigo-500" />
              Etapa do Funil
            </label>
            <select
              value={deal.column_id}
              onChange={(e) => onUpdate("column_id", e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161f30] px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
              style={{ borderLeftColor: column?.color || "#6366F1", borderLeftWidth: 4 }}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Valor */}
          <div className="rounded-xl border border-slate-100 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02] p-3">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
              Valor da Oportunidade
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                defaultValue={deal.value || ""}
                onBlur={(e) => onUpdate("value", Number(e.target.value) || 0)}
                placeholder="0,00"
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161f30] py-2 pl-9 pr-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
              />
            </div>
          </div>

          {/* Prioridade */}
          <div className="rounded-xl border border-slate-100 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02] p-3 relative">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              <Flag className="h-3.5 w-3.5 text-amber-500" />
              Prioridade
            </label>
            <button
              type="button"
              onClick={() => setPriorityOpen(!priorityOpen)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition ${pConf.bg} ${pConf.color} ${pConf.border}`}
            >
              <div className="flex items-center gap-2">
                <Flag className={`h-3.5 w-3.5 ${pConf.flag}`} />
                <span>{pConf.label}</span>
              </div>
              <span className="text-[10px] text-slate-400">Alterar</span>
            </button>

            {priorityOpen && (
              <div className="absolute left-3 right-3 top-full z-30 mt-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161f30] shadow-xl p-1 overflow-hidden">
                {PRIORITIES.map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { onUpdate("priority", p); setPriorityOpen(false); }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition ${
                        priority === p ? "bg-slate-100 dark:bg-white/10 font-bold" : "hover:bg-slate-50 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Flag className={`h-3.5 w-3.5 ${cfg.flag}`} />
                        <span className={cfg.color}>{cfg.label}</span>
                      </div>
                      {priority === p && <span className="text-indigo-600 dark:text-indigo-400 text-xs font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Responsável */}
          <div className="rounded-xl border border-slate-100 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02] p-3 relative">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              <User className="h-3.5 w-3.5 text-indigo-500" />
              Responsável
            </label>
            {assignedUser ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161f30] px-2.5 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor(assignedUser.name)}`}>
                    {getInitials(assignedUser.name)}
                  </div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {assignedUser.name}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAssigneeOpen(!assigneeOpen)}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline px-1"
                  >
                    Trocar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAssign(null)}
                    title="Remover responsável"
                    className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAssigneeOpen(!assigneeOpen)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 dark:border-white/15 bg-white dark:bg-[#161f30] py-2 text-xs font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Atribuir responsável
              </button>
            )}

            {assigneeOpen && (
              <div className="absolute left-3 right-3 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161f30] shadow-xl p-1">
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Membros da equipe
                </div>
                {users.map((u) => {
                  const uId = u.id || (u as any).$id;
                  const isSelected = Boolean(currentAssigneeId && uId === currentAssigneeId);
                  return (
                    <button
                      key={uId}
                      type="button"
                      onClick={() => handleAssign(uId)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition ${
                        isSelected
                          ? "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8.5px] font-bold text-white ${avatarColor(u.name)}`}>
                          {getInitials(u.name)}
                        </div>
                        <div className="truncate text-left">
                          <div className="truncate font-medium">{u.name}</div>
                          <div className="text-[10px] text-slate-400">{u.role || u.email}</div>
                        </div>
                      </div>
                      {isSelected && <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Prazo / Fechamento */}
          <div className="rounded-xl border border-slate-100 dark:border-white/[0.05] bg-slate-50/50 dark:bg-white/[0.02] p-3 md:col-span-2">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              <Calendar className="h-3.5 w-3.5 text-indigo-500" />
              Previsão de Fechamento
            </label>
            <input
              type="date"
              defaultValue={deal.due_date ? deal.due_date.slice(0, 10) : ""}
              onChange={(e) => onUpdate("due_date", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#161f30] px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>

        {/* Etiquetas */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-white/[0.05]">
          <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            <Tag className="h-3.5 w-3.5 text-indigo-500" />
            Etiquetas da Oportunidade
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200/80 dark:border-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300"
              >
                {label}
                <button
                  type="button"
                  onClick={() => removeLabel(label)}
                  className="text-indigo-400 hover:text-rose-500 transition"
                >
                  <X className="h-3 w-3" />
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
                  placeholder="Nova tag..."
                  className="w-28 rounded-lg border border-indigo-300 dark:border-indigo-500/40 bg-white dark:bg-[#161f30] px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingLabel(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 dark:border-white/15 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition"
              >
                <Plus className="h-3 w-3" />
                Nova Etiqueta
              </button>
            )}

            {tags.length === 0 && !addingLabel && (
              <span className="text-xs text-slate-400">Nenhuma etiqueta atribuída</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. SEÇÃO: CONTATO DIRETO (FORMULÁRIO 2x2 LIMPO) */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-indigo-500" />
          Dados de Contato da Oportunidade
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              <Phone className="h-3.5 w-3.5 text-slate-400" /> Telefone / WhatsApp
            </label>
            <input
              type="text"
              defaultValue={deal.contact_phone || ""}
              onBlur={(e) => onUpdate("contact_phone", e.target.value)}
              placeholder="Ex: (11) 98765-4321"
              className="w-full rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              <Mail className="h-3.5 w-3.5 text-slate-400" /> E-mail Comercial
            </label>
            <input
              type="email"
              defaultValue={deal.contact_email || ""}
              onBlur={(e) => onUpdate("contact_email", e.target.value)}
              placeholder="Ex: contato@empresa.com"
              className="w-full rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400" /> Empresa / Razão Social
            </label>
            <input
              type="text"
              defaultValue={deal.contact_company || deal.company || ""}
              onBlur={(e) => {
                onUpdate("contact_company", e.target.value);
                if (!deal.company) onUpdate("company", e.target.value);
              }}
              placeholder="Ex: Acme Corp"
              className="w-full rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              <Briefcase className="h-3.5 w-3.5 text-slate-400" /> Cargo / Função
            </label>
            <input
              type="text"
              defaultValue={deal.contact_position || ""}
              onBlur={(e) => onUpdate("contact_position", e.target.value)}
              placeholder="Ex: Diretor Comercial"
              className="w-full rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
