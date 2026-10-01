import { useEffect, useMemo, useState, useRef } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  Filter,
  Check,
  Package,
  Wrench,
  Layers,
  LayoutGrid,
  List as ListIcon,
  Tag,
  DollarSign,
  TrendingUp,
  Percent,
  Sparkles,
  ArrowUpDown,
  MoreVertical,
  CheckCircle2,
  FileSpreadsheet,
} from "lucide-react";
import { databases, client } from "../lib/appwrite";
import { Query, ID } from "appwrite";
import { useAuth } from "../context/AuthContext";

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "default";
const COLLECTION_ID = "crm_items";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrmItem {
  id: string;
  name: string;
  short_description?: string;
  long_description?: string;
  category?: string;
  group_name?: string;
  price: number;
  type: "service" | "product";
  tax_rate?: number;
  tax_rate2?: number;
  unit?: string;
  is_active?: boolean;
  created_at?: string;
}

export type ItemForm = {
  name: string;
  long_description: string;
  price: string;
  tax_rate: string;
  tax_rate2: string;
  unit: string;
  group_name: string;
  short_description: string;
  type: "service" | "product";
  is_active: boolean;
};

export const INITIAL_FORM: ItemForm = {
  name: "",
  long_description: "",
  price: "",
  tax_rate: "Sem Taxa",
  tax_rate2: "Sem Taxa",
  unit: "un",
  group_name: "Telecom",
  short_description: "",
  type: "service",
  is_active: true,
};

const TAX_OPTIONS = [
  "Sem Taxa",
  "ISS 2%",
  "ISS 3%",
  "ISS 5%",
  "PIS 0.65%",
  "COFINS 3%",
  "ICMS 12%",
  "ICMS 18%",
  "IPI 5%",
  "IPI 10%",
];

const GROUPS = [
  "Todos",
  "Telecom",
  "Cloud",
  "Suporte",
  "Hardware",
  "Software",
  "Consultoria",
  "Outros",
];

function currency(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Modal de Criação / Edição de Item ────────────────────────────────────────

export function ItemModal({
  editing,
  form,
  setForm,
  saving,
  error,
  onClose,
  onSave,
}: {
  editing: CrmItem | null;
  form: ItemForm;
  setForm: (f: ItemForm) => void;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (f: ItemForm) => void;
}) {
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-[560px] rounded-2xl bg-white dark:bg-[#121824] shadow-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              {form.type === "service" ? <Wrench className="w-5 h-5" /> : <Package className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {editing ? "Editar Item do Catálogo" : "Novo Item ou Serviço"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cadastre informações de precificação, impostos e categoria
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08] hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Seletor Tipo: Serviço vs Produto */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Tipo do Item
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, type: "service" })}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all ${
                  form.type === "service"
                    ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                }`}
              >
                <Wrench className="w-4 h-4" /> Serviço / Licença
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, type: "product" })}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all ${
                  form.type === "product"
                    ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                }`}
              >
                <Package className="w-4 h-4" /> Produto Físico / Equipamento
              </button>
            </div>
          </div>

          {/* Nome / Descrição */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Nome do Item <span className="text-rose-500">*</span>
            </label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="Ex: PABX em Nuvem - Plano Pro"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition placeholder-slate-400"
            />
          </div>

          {/* Preço e Unidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Valor Base (R$) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">
                  R$
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] pl-10 pr-3.5 py-2.5 text-sm font-mono font-medium text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Unidade de Cobrança
              </label>
              <select
                value={form.unit || "un"}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
              >
                <option value="un">un (Unidade)</option>
                <option value="mês">mês (Mensalidade)</option>
                <option value="ano">ano (Anual)</option>
                <option value="hora">hora (Por Hora)</option>
                <option value="ramal">ramal (Por Ramal)</option>
                <option value="licença">licença (Por Licença)</option>
              </select>
            </div>
          </div>

          {/* Grupo e Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Categoria / Grupo
              </label>
              <select
                value={form.group_name || "Telecom"}
                onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
              >
                {GROUPS.filter((g) => g !== "Todos").map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Alíquota Fiscal (Imposto)
              </label>
              <select
                value={form.tax_rate || "Sem Taxa"}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
              >
                {TAX_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Descrição Detalhada */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Descrição Comercial / Especificações
            </label>
            <textarea
              value={form.long_description}
              onChange={(e) => setForm({ ...form, long_description: e.target.value })}
              rows={3}
              placeholder="Descreva detalhes, recursos inclusos e escopo do item..."
              className="w-full resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] p-3 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition placeholder-slate-400"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 p-3 text-xs text-rose-700 dark:text-rose-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-white/[0.08] px-6 py-4 bg-slate-50/50 dark:bg-white/[0.01]">
          {editing ? (
            <button
              type="button"
              onClick={() => {
                if (confirm("Tem certeza que deseja excluir este item do catálogo?")) {
                  databases.deleteDocument(DATABASE_ID, COLLECTION_ID, editing.id).catch(console.error);
                  onClose();
                }
              }}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:underline transition"
            >
              Excluir Item
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSaveRef.current(form)}
              disabled={saving || !form.name.trim()}
              className="rounded-xl px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-sm transition active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar no Catálogo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CrmItems() {
  const [items, setItems] = useState<CrmItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("Todos");
  const [selectedType, setSelectedType] = useState<"all" | "service" | "product">("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CrmItem | null>(null);
  const [form, setForm] = useState<ItemForm>(INITIAL_FORM);

  useEffect(() => {
    load();

    const itemsChannel = `databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents`;
    const unsubscribe = client.subscribe(itemsChannel, (response: any) => {
      const events: string[] = response.events || [];
      const payload = response.payload;
      if (!payload) return;

      if (events.some((e: string) => e.includes(".create"))) {
        const newItem: CrmItem = {
          ...payload,
          id: payload.$id,
          created_at: payload.$createdAt,
        };
        setItems((prev) => {
          if (prev.some((i) => i.id === newItem.id)) return prev;
          return [newItem, ...prev];
        });
      } else if (events.some((e: string) => e.includes(".update"))) {
        const updatedItem: CrmItem = {
          ...payload,
          id: payload.$id,
          created_at: payload.$createdAt,
        };
        setItems((prev) => prev.map((i) => (i.id === updatedItem.id ? { ...i, ...updatedItem } : i)));
      } else if (events.some((e: string) => e.includes(".delete"))) {
        const deletedId = payload.$id;
        setItems((prev) => prev.filter((i) => i.id !== deletedId));
      }
    });

    return () => {
      try {
        unsubscribe();
      } catch (e) {}
    };
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.limit(500),
        Query.orderAsc("name"),
      ]);

      const mapped = documents.map((d) => ({
        ...d,
        id: d.$id,
        created_at: d.$createdAt,
      })) as unknown as CrmItem[];

      setItems(mapped);
    } catch (err) {
      console.error("Erro ao carregar itens:", err);
    } finally {
      setLoading(false);
    }
  }

  // Estatísticas do Catálogo
  const stats = useMemo(() => {
    const total = items.length;
    const services = items.filter((i) => i.type === "service").length;
    const products = items.filter((i) => i.type === "product").length;
    const avgPrice = total > 0 ? items.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0) / total : 0;
    return { total, services, products, avgPrice };
  }, [items]);

  // Itens filtrados
  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !search.trim() ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.long_description || "").toLowerCase().includes(search.toLowerCase()) ||
        (item.group_name || "").toLowerCase().includes(search.toLowerCase());

      const matchesGroup = selectedGroup === "Todos" || item.group_name === selectedGroup;
      const matchesType = selectedType === "all" || item.type === selectedType;

      return matchesSearch && matchesGroup && matchesType;
    });
  }, [items, search, selectedGroup, selectedType]);

  function openNew() {
    setEditing(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  }

  function openEdit(item: CrmItem) {
    setEditing(item);
    setForm({
      name: item.name,
      long_description: item.long_description || "",
      price: String(item.price),
      tax_rate: item.tax_rate ? `${item.tax_rate}%` : "Sem Taxa",
      tax_rate2: item.tax_rate2 ? `${item.tax_rate2}%` : "Sem Taxa",
      unit: item.unit || "un",
      group_name: item.group_name || "Telecom",
      short_description: item.short_description || "",
      type: item.type || "service",
      is_active: item.is_active !== false,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setForm(INITIAL_FORM);
    setSaveError("");
  }

  function parseTaxRate(v: string): number {
    if (!v || v === "Sem Taxa") return 0;
    const match = v.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }

  async function save(currentForm: ItemForm) {
    if (!currentForm.name.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        name: currentForm.name.trim(),
        long_description: currentForm.long_description,
        short_description: currentForm.short_description,
        price: parseFloat(currentForm.price) || 0,
        tax_rate: parseTaxRate(currentForm.tax_rate),
        unit: currentForm.unit || "un",
        group_name: currentForm.group_name || "Telecom",
        type: currentForm.type,
        is_active: currentForm.is_active,
      };

      if (editing) {
        await databases.updateDocument(DATABASE_ID, COLLECTION_ID, editing.id, payload);
      } else {
        await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), payload);
      }
      closeModal();
    } catch (err: any) {
      setSaveError(err?.message || "Erro ao salvar item.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Tem certeza que deseja excluir este item?")) return;
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Executivo com Métricas do Catálogo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 px-2.5 py-0.5 rounded-md">
              Catálogo de Produtos & Serviços
            </span>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sincronizado</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Itens, Serviços e Precificação
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Gerencie itens para compor orçamentos, propostas comerciais e contratos.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200/80 dark:border-white/[0.08] rounded-xl transition"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 rounded-xl shadow-sm transition active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" /> Novo Item / Serviço
          </button>
        </div>
      </div>

      {/* 2. Mini Scorecard de Portfólio */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-4 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total de Itens</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-4 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Serviços / Planos</p>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{stats.services}</p>
        </div>
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-4 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Produtos / Físicos</p>
          <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">{stats.products}</p>
        </div>
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-4 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Ticket Médio do Catálogo</p>
          <p className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {currency(stats.avgPrice)}
          </p>
        </div>
      </div>

      {/* 3. Barra de Filtros, Categorias & Busca */}
      <div className="space-y-3">
        {/* Grupos / Categorias Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {GROUPS.map((group) => (
            <button
              key={group}
              onClick={() => setSelectedGroup(group)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                selectedGroup === group
                  ? "bg-indigo-600 text-white shadow-xs font-semibold"
                  : "bg-white dark:bg-[#121824] text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-white/[0.08] hover:border-indigo-500/40"
              }`}
            >
              {group}
            </button>
          ))}
        </div>

        {/* Toolbar de Busca, Tipo e Alternância de Visualização */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#121824] p-3 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <div className="flex items-center gap-2 flex-1">
            {/* Campo de Busca */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, categoria ou descrição..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#0d1117] border border-slate-200/80 dark:border-white/[0.08] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filtro por Tipo */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className="py-2 px-3 bg-slate-50 dark:bg-[#0d1117] border border-slate-200/80 dark:border-white/[0.08] rounded-xl text-xs text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500"
            >
              <option value="all">Todos os Tipos</option>
              <option value="service">Apenas Serviços</option>
              <option value="product">Apenas Produtos</option>
            </select>
          </div>

          {/* Alternador de visualização Grid / Tabela */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#0d1117] p-1 rounded-xl border border-slate-200/80 dark:border-white/[0.08] self-end sm:self-auto">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === "grid"
                  ? "bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-xs font-semibold"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
              title="Visualização em Grade de Cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === "table"
                  ? "bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-xs font-semibold"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
              title="Visualização em Tabela"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Conteúdo: Cards Modernos ou Tabela Refinada */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Carregando catálogo...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-12 text-center border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Nenhum item encontrado</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Não encontramos itens com os filtros selecionados. Tente limpar os filtros ou adicionar um novo item.
          </p>
          <button
            onClick={openNew}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar Primeiro Item
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* Visualização em Grade (Grid Cards) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs hover:border-indigo-500/40 hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.type === "service"
                          ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40"
                          : "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-200/60 dark:border-cyan-800/40"
                      }`}
                    >
                      {item.type === "service" ? <Wrench className="w-2.5 h-2.5" /> : <Package className="w-2.5 h-2.5" />}
                      {item.type === "service" ? "Serviço" : "Produto"}
                    </span>
                    {item.group_name && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-400">
                        {item.group_name}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => remove(item.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {item.name}
                </h3>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  {item.long_description || item.short_description || "Sem descrição detalhada registrada."}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-medium">Valor Unitário</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {currency(item.price)}
                    </span>
                    <span className="text-[10px] text-slate-400">/ {item.unit || "un"}</span>
                  </div>
                </div>

                {item.tax_rate ? (
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.04] px-2 py-1 rounded-md border border-slate-200/50 dark:border-white/5">
                    +{item.tax_rate}% imposto
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Visualização em Tabela Executiva */
        <div className="bg-white dark:bg-[#121824] rounded-2xl border border-slate-200/80 dark:border-white/[0.08] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#0d1117]">
                  <th className="py-3 px-4 text-left font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Categoria
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Preço Base
                  </th>
                  <th className="py-3 px-4 text-center font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Unidade
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{item.name}</p>
                      <p className="text-[11px] text-slate-400 truncate max-w-sm mt-0.5">
                        {item.long_description || "Sem descrição"}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.type === "service"
                            ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                            : "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400"
                        }`}
                      >
                        {item.type === "service" ? "Serviço" : "Produto"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">
                      {item.group_name || "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      {currency(item.price)}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-500 font-medium">
                      {item.unit || "un"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => remove(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Criação / Edição */}
      {showModal && (
        <ItemModal
          editing={editing}
          form={form}
          setForm={setForm}
          saving={saving}
          error={saveError}
          onClose={closeModal}
          onSave={save}
        />
      )}
    </div>
  );
}
