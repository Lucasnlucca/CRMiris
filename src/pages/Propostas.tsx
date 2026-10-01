import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  X,
  FileText,
  ChevronDown,
  ChevronRight,
  Save,
  Send,
  Copy,
  Printer,
  Eye,
  Check,
  AlertCircle,
  Mail,
  MoreHorizontal,
  Trash2,
  Download,
  ExternalLink,
  RefreshCw,
  Filter,
  Layers,
  LayoutGrid,
  List as ListIcon,
  Phone,
  CheckCircle2,
  Clock,
  Calendar,
  ArrowRight,
  Share2,
  DollarSign,
  TrendingUp,
  Percent,
  Sparkles,
  Building,
  User as UserIcon,
  Pencil,
  FileCheck,
  FileX,
  MessageSquare,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Upload,
} from "lucide-react";
import { downloadProposalDocx } from "../utils/proposalDocx";
import { databases, client } from "../lib/appwrite";
import { Query, ID } from "appwrite";
import { useAuth } from "../context/AuthContext";
import { ItemModal, ItemForm, INITIAL_FORM, CrmItem } from "./CrmItems";

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "default";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  fantasy_name?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  cep?: string;
}

export interface ProposalLineItem {
  _key: string;
  item_id: string | null;
  name: string;
  description: string;
  long_description: string;
  qty: number;
  rate: number;
  tax_rate: number;
  amount: number;
  unit: string;
}

export interface Proposal {
  id: string;
  proposal_number?: string;
  subject: string;
  related_type: string;
  related_id: string | null;
  date: string;
  open_until: string;
  currency: string;
  discount_type: string;
  allow_comments: boolean;
  status: string;
  assigned_to: string | null;
  to_name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zip_code: string;
  email: string;
  phone: string;
  subtotal: number;
  discount_value: number;
  discount_percent: number;
  adjustment: number;
  total: number;
  notes: string;
  content?: string;
  created_at: string;
}

export interface ProposalTerm {
  id: string;
  title: string;
  text: string;
  imageUrl?: string;
  imagePosition?: "below" | "above";
}

export interface ProposalTermsData {
  notes?: string;
  terms: ProposalTerm[];
  footerText?: string;
  footerImageUrl?: string;
}

export function parseProposalTerms(contentStr?: string, notesStr?: string): ProposalTermsData {
  if (contentStr) {
    try {
      const parsed = JSON.parse(contentStr);
      if (parsed && (Array.isArray(parsed.terms) || parsed.footerText || parsed.footerImageUrl)) {
        return {
          notes: parsed.notes || notesStr || "",
          terms: Array.isArray(parsed.terms) ? parsed.terms : [],
          footerText: parsed.footerText || "",
          footerImageUrl: parsed.footerImageUrl || "",
        };
      }
    } catch {}
  }

  const defaultTerms: ProposalTerm[] = [];
  if (contentStr && !contentStr.startsWith("{")) {
    defaultTerms.push({
      id: "term-1",
      title: "1. ESCOPO & ESPECIFICAÇÕES TÉCNICAS",
      text: contentStr,
    });
  }
  if (notesStr) {
    defaultTerms.push({
      id: "term-2",
      title: "2. CONDIÇÕES COMERCIAIS & PAGAMENTO",
      text: notesStr,
    });
  }
  if (defaultTerms.length === 0) {
    defaultTerms.push(
      {
        id: "term-1",
        title: "1. CONDIÇÕES GERAIS E FORMA DE PAGAMENTO",
        text: "O faturamento será realizado conforme os marcos acordados. Os pagamentos deverão ser efetuados via boleto bancário ou transferência PIX em até 10 dias do faturamento.",
      },
      {
        id: "term-2",
        title: "2. PRAZO DE ENTREGA E IMPLANTAÇÃO",
        text: "O início das atividades ocorrerá em até 5 (cinco) dias úteis após o aceite formal desta proposta e alinhamento do cronograma operacional.",
      },
      {
        id: "term-3",
        title: "3. SUPORTE TÉCNICO E SLA",
        text: "A CONTRATADA assegura suporte técnico qualificado de segunda a sexta-feira, das 08h às 18h, com índice de disponibilidade de 99,5%.",
      },
      {
        id: "term-4",
        title: "4. VALIDADE DA PROPOSTA",
        text: "As condições comerciais, valores e escopo descritos neste documento possuem validade de 15 (quinze) dias corridos a contar da data de emissão.",
      }
    );
  }

  return {
    notes: notesStr || "",
    terms: defaultTerms,
    footerText: "Iris Horizon Soluções Tecnológicas • Documento Oficial",
    footerImageUrl: "",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currency(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextWeek() {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

function makeKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function getProposalNumber(p?: { proposal_number?: string; id?: string; $id?: string; $sequence?: number } | null): string {
  if (!p) return "";
  if (p.proposal_number) return p.proposal_number;
  if (p.$sequence) return `PROP-${String(p.$sequence).padStart(4, "0")}`;
  const rawId = p.id || p.$id || "";
  return rawId ? `PROP-${rawId.slice(0, 8).toUpperCase()}` : "PROP-NOVA";
}

export const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; badgeClass: string }
> = {
  draft: {
    label: "Rascunho",
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800",
    border: "border-slate-300 dark:border-slate-700",
    badgeClass: "bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10",
  },
  sent: {
    label: "Enviada",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800/40",
    badgeClass: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/40",
  },
  open: {
    label: "Em Análise",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800/40",
    badgeClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/40",
  },
  revised: {
    label: "Revisada",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    border: "border-violet-200 dark:border-violet-800/40",
    badgeClass: "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800/40",
  },
  accepted: {
    label: "Aceita / Ganha",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800/40",
    badgeClass: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40",
  },
  declined: {
    label: "Declinada",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-800/40",
    badgeClass: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/40",
  },
};

const STATUS_KEYS = ["draft", "sent", "open", "revised", "accepted", "declined"];

// ─── Modal do Editor de Proposta Comercial ────────────────────────────────────

function ProposalEditorModal({
  proposal,
  initialLineItems,
  crmItems,
  clients,
  onClose,
  onSaveSuccess,
}: {
  proposal: Proposal | null;
  initialLineItems: ProposalLineItem[];
  crmItems: CrmItem[];
  clients: Client[];
  onClose: () => void;
  onSaveSuccess: (saved: Proposal) => void;
}) {
  const isEditing = !!proposal;
  const [activeTab, setActiveTab] = useState<"dados" | "itens" | "termos">("dados");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Dados da Proposta
  const [subject, setSubject] = useState(proposal?.subject || "Proposta Comercial");
  const [relatedId, setRelatedId] = useState(proposal?.related_id || "");
  const [date, setDate] = useState(proposal?.date || today());
  const [openUntil, setOpenUntil] = useState(proposal?.open_until || nextWeek());
  const [status, setStatus] = useState(proposal?.status || "draft");

  // Dados do Cliente
  const [toName, setToName] = useState(proposal?.to_name || "");
  const [email, setEmail] = useState(proposal?.email || "");
  const [phone, setPhone] = useState(proposal?.phone || "");
  const [address, setAddress] = useState(proposal?.address || "");
  const [city, setCity] = useState(proposal?.city || "");
  const [stateVal, setStateVal] = useState(proposal?.state || "");
  const [zipCode, setZipCode] = useState(proposal?.zip_code || "");

  // Itens & Finanças
  const [lineItems, setLineItems] = useState<ProposalLineItem[]>(
    initialLineItems.length > 0
      ? initialLineItems
      : [
          {
            _key: makeKey(),
            item_id: null,
            name: "Serviço de Telecomunicação",
            description: "Plano de comunicação integrada",
            long_description: "",
            qty: 1,
            rate: 250,
            tax_rate: 0,
            amount: 250,
            unit: "mês",
          },
        ]
  );

  const initialTermsData = useMemo(() => {
    return parseProposalTerms(proposal?.content, proposal?.notes);
  }, [proposal]);

  const [discountType, setDiscountType] = useState(proposal?.discount_type || "percent");
  const [discountPercent, setDiscountPercent] = useState(proposal?.discount_percent ?? 0);
  const [discountValue, setDiscountValue] = useState(proposal?.discount_value ?? 0);
  const [adjustment, setAdjustment] = useState(proposal?.adjustment ?? 0);
  const [content, setContent] = useState(() => {
    if (proposal?.content) {
      if (proposal.content.startsWith("{")) {
        try {
          const parsed = JSON.parse(proposal.content);
          if (parsed && Array.isArray(parsed.terms) && parsed.terms.length > 0) {
            return parsed.terms.map((t: any) => `${t.title || ""}\n${t.text || ""}`).join("\n\n");
          }
        } catch {}
      } else {
        return proposal.content;
      }
    }
    return initialTermsData.terms?.[0]?.text || "";
  });
  const [notes, setNotes] = useState(
    proposal?.notes || initialTermsData.notes || "Proposta válida por 15 dias corridos. Faturamento mensal conforme cronograma acordado."
  );

  // Catálogo Dropdown
  const [itemSearch, setItemSearch] = useState("");
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false);

  // Selecionar Cliente
  function handleSelectClient(clientId: string) {
    setRelatedId(clientId);
    const c = clients.find((cl) => cl.id === clientId);
    if (!c) return;
    setToName(c.fantasy_name || c.name);
    setEmail(c.email || "");
    setPhone(c.phone || "");
    setAddress(c.street || "");
    setCity(c.city || "");
    setStateVal(c.state || "");
    setZipCode(c.cep || "");
  }

  // Cálculos Financeiros
  const subtotal = useMemo(() => {
    return lineItems.reduce((acc, curr) => acc + (Number(curr.qty) || 0) * (Number(curr.rate) || 0), 0);
  }, [lineItems]);

  const discountAmount = useMemo(() => {
    if (discountType === "percent") {
      return (subtotal * (Number(discountPercent) || 0)) / 100;
    }
    return Number(discountValue) || 0;
  }, [subtotal, discountType, discountPercent, discountValue]);

  const totalCalculated = useMemo(() => {
    return Math.max(subtotal - discountAmount + (Number(adjustment) || 0), 0);
  }, [subtotal, discountAmount, adjustment]);

  // Manipular Itens
  function addFromCatalog(item: CrmItem) {
    setLineItems((prev) => [
      ...prev,
      {
        _key: makeKey(),
        item_id: item.id,
        name: item.name,
        description: item.short_description || "",
        long_description: item.long_description || "",
        qty: 1,
        rate: item.price || 0,
        tax_rate: item.tax_rate || 0,
        amount: item.price || 0,
        unit: item.unit || "un",
      },
    ]);
    setShowCatalogDropdown(false);
    setItemSearch("");
  }

  function addCustomItem() {
    setLineItems((prev) => [
      ...prev,
      {
        _key: makeKey(),
        item_id: null,
        name: "Novo Item Personalizado",
        description: "",
        long_description: "",
        qty: 1,
        rate: 0,
        tax_rate: 0,
        amount: 0,
        unit: "un",
      },
    ]);
  }

  function updateLineItem(key: string, field: keyof ProposalLineItem, val: any) {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item._key !== key) return item;
        const updated = { ...item, [field]: val };
        if (field === "qty" || field === "rate") {
          updated.amount = (Number(updated.qty) || 0) * (Number(updated.rate) || 0);
        }
        return updated;
      })
    );
  }

  function removeLineItem(key: string) {
    setLineItems((prev) => prev.filter((i) => i._key !== key));
  }

  // Salvar no Appwrite
  async function handleSave() {
    if (!subject.trim()) {
      setSaveError("Informe o assunto da proposta.");
      return;
    }
    if (!toName.trim()) {
      setSaveError("Informe o nome do cliente / destinatário.");
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      const payload = {
        subject: subject.trim(),
        related_type: "cliente",
        related_id: relatedId || null,
        client_id: relatedId || null,
        date,
        open_until: openUntil || null,
        currency: "BRL",
        discount_type: discountType,
        allow_comments: true,
        status,
        to_name: toName.trim(),
        address,
        city,
        state: stateVal,
        country: "Brasil",
        zip_code: zipCode,
        email,
        phone,
        notes: notes.trim(),
        content: content.trim(),
        subtotal,
        discount_value: discountAmount,
        discount_percent: discountType === "percent" ? Number(discountPercent) || 0 : 0,
        adjustment: Number(adjustment) || 0,
        total: totalCalculated,
        total_amount: totalCalculated,
        created_at: proposal?.created_at || new Date().toISOString(),
      };

      let targetProposalId = proposal?.id;
      let savedDoc: any;

      if (isEditing && targetProposalId) {
        savedDoc = await databases.updateDocument(DATABASE_ID, "crm_proposals", targetProposalId, payload);
      } else {
        savedDoc = await databases.createDocument(DATABASE_ID, "crm_proposals", ID.unique(), payload);
        targetProposalId = savedDoc.$id;
      }

      // Persistir Itens
      if (targetProposalId) {
        const { documents: existing } = await databases.listDocuments(DATABASE_ID, "crm_proposal_items", [
          Query.equal("proposal_id", targetProposalId),
          Query.limit(100),
        ]);
        if (existing.length > 0) {
          await Promise.all(
            existing.map((ex) => databases.deleteDocument(DATABASE_ID, "crm_proposal_items", ex.$id))
          );
        }

        for (let i = 0; i < lineItems.length; i++) {
          const li = lineItems[i];
          await databases.createDocument(DATABASE_ID, "crm_proposal_items", ID.unique(), {
            proposal_id: targetProposalId,
            item_id: li.item_id,
            name: li.name,
            description: li.description,
            long_description: li.long_description,
            qty: Number(li.qty) || 1,
            rate: Number(li.rate) || 0,
            tax_rate: Number(li.tax_rate) || 0,
            amount: (Number(li.qty) || 1) * (Number(li.rate) || 0),
            position: i,
          });
        }
      }

      onSaveSuccess({ ...savedDoc, id: savedDoc.$id } as Proposal);
      onClose();
    } catch (err: any) {
      console.error("Erro ao salvar proposta:", err);
      setSaveError(err?.message || "Erro ao salvar proposta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-4xl h-[90vh] rounded-2xl bg-white dark:bg-[#121824] shadow-2xl border border-slate-200 dark:border-white/[0.08] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.08] px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isEditing ? `Editar Proposta #${getProposalNumber(proposal)}` : "Criar Nova Proposta Comercial"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure os dados do cliente, itens negociados e condições de pagamento
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

        {/* Abas de Navegação */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0 bg-slate-50/50 dark:bg-white/[0.01]">
          <button
            type="button"
            onClick={() => setActiveTab("dados")}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "dados"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" /> 1. Cliente & Informações
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("itens")}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "itens"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" /> 2. Itens & Precificação ({lineItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("termos")}
            className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "termos"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> 3. Escopo & Observações
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === "dados" && (
            <div className="space-y-4">
              {/* Assunto da Proposta */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Assunto / Título da Proposta <span className="text-rose-500">*</span>
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Proposta de Implantação Telefonia IP & Ramais Nuvem"
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                />
              </div>

              {/* Seleção de Cliente Cadastrado */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Vincular a um Cliente Existente
                </label>
                <select
                  value={relatedId}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                >
                  <option value="">Selecione um cliente para preenchimento automático...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.fantasy_name ? `(${c.fantasy_name})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dados do Destinatário */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Nome / Razão Social do Destinatário <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={toName}
                    onChange={(e) => setToName(e.target.value)}
                    placeholder="Nome da empresa ou cliente"
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    E-mail do Cliente
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@empresa.com"
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Telefone / WhatsApp
                  </label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Endereço / Cidade
                  </label>
                  <input
                    value={city ? `${city} - ${stateVal}` : address}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Cidade - UF"
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Datas & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Data de Emissão
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Válida Até (Data Limite)
                  </label>
                  <input
                    type="date"
                    value={openUntil}
                    onChange={(e) => setOpenUntil(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Status da Proposta
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition font-medium"
                  >
                    {STATUS_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {STATUS_CONFIG[k].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === "itens" && (
            <div className="space-y-4">
              {/* Botões de Ação para Inserir Itens */}
              <div className="flex items-center justify-between gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCatalogDropdown(!showCatalogDropdown)}
                    className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar do Catálogo
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {/* Dropdown do Catálogo */}
                  {showCatalogDropdown && (
                    <div className="absolute left-0 top-full mt-2 w-80 rounded-2xl bg-white dark:bg-[#121824] shadow-2xl border border-slate-200 dark:border-white/10 z-30 p-2">
                      <div className="p-2 border-b border-slate-100 dark:border-white/[0.08]">
                        <input
                          autoFocus
                          value={itemSearch}
                          onChange={(e) => setItemSearch(e.target.value)}
                          placeholder="Buscar no catálogo..."
                          className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-white/10 rounded-lg outline-none text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1 space-y-1">
                        {crmItems
                          .filter((i) => !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase()))
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => addFromCatalog(item)}
                              className="w-full text-left p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] transition flex items-center justify-between text-xs"
                            >
                              <div className="truncate pr-2">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">{item.name}</p>
                                <span className="text-[10px] text-slate-400">{item.group_name || "Geral"}</span>
                              </div>
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                                {currency(item.price)}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={addCustomItem}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] rounded-xl transition"
                >
                  + Item Personalizado
                </button>
              </div>

              {/* Tabela de Linhas de Itens */}
              <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden bg-white dark:bg-[#0d1117]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02]">
                      <th className="py-2.5 px-3 text-left font-semibold text-slate-600 dark:text-slate-400">Item</th>
                      <th className="py-2.5 px-3 text-left font-semibold text-slate-600 dark:text-slate-400">Descrição</th>
                      <th className="py-2.5 px-2 text-center font-semibold text-slate-600 dark:text-slate-400 w-20">Qtd</th>
                      <th className="py-2.5 px-3 text-right font-semibold text-slate-600 dark:text-slate-400 w-28">Preço (R$)</th>
                      <th className="py-2.5 px-3 text-right font-semibold text-slate-600 dark:text-slate-400 w-28">Total</th>
                      <th className="py-2.5 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {lineItems.map((li) => (
                      <tr key={li._key} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                        <td className="p-2">
                          <input
                            value={li.name}
                            onChange={(e) => updateLineItem(li._key, "name", e.target.value)}
                            placeholder="Nome do item"
                            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-[#121824] border border-slate-200 dark:border-white/10 rounded-lg text-xs font-semibold text-slate-900 dark:text-white outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={li.description}
                            onChange={(e) => updateLineItem(li._key, "description", e.target.value)}
                            placeholder="Breve descrição ou especificação..."
                            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-[#121824] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-600 dark:text-slate-300 outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="1"
                            value={li.qty}
                            onChange={(e) => updateLineItem(li._key, "qty", Math.max(Number(e.target.value) || 1, 1))}
                            className="w-full px-2 py-1.5 text-center bg-slate-50 dark:bg-[#121824] border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold text-slate-900 dark:text-white outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={li.rate}
                            onChange={(e) => updateLineItem(li._key, "rate", Math.max(Number(e.target.value) || 0, 0))}
                            className="w-full px-2.5 py-1.5 text-right font-mono font-medium bg-slate-50 dark:bg-[#121824] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-white outline-none"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {currency(li.amount)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeLineItem(li._key)}
                            className="p-1 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Quadro Resumo de Fechamento Financeiro */}
              <div className="flex justify-end pt-2">
                <div className="w-full sm:w-80 bg-slate-50 dark:bg-[#0d1117] p-4 rounded-2xl border border-slate-200 dark:border-white/[0.08] space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">{currency(subtotal)}</span>
                  </div>

                  {/* Desconto */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-400">Desconto:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        value={discountType === "percent" ? discountPercent : discountValue}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          if (discountType === "percent") setDiscountPercent(v);
                          else setDiscountValue(v);
                        }}
                        className="w-20 px-2 py-1 text-right font-mono bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/10 rounded-md text-xs text-slate-900 dark:text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setDiscountType(discountType === "percent" ? "fixed" : "percent")}
                        className="px-2 py-1 bg-slate-200 dark:bg-white/10 rounded-md text-[10px] font-bold text-slate-700 dark:text-slate-300"
                      >
                        {discountType === "percent" ? "%" : "R$"}
                      </button>
                    </div>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-rose-500 font-medium">
                      <span>Valor do Desconto:</span>
                      <span>-{currency(discountAmount)}</span>
                    </div>
                  )}

                  {/* Total Final */}
                  <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-between items-baseline">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">TOTAL GERAL:</span>
                    <span className="font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400">
                      {currency(totalCalculated)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "termos" && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-800/30">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Escopo da Proposta & Observações Comerciais
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Defina o escopo dos serviços e as condições comerciais desta proposta. As cláusulas e termos jurídicos detalhados do contrato serão configurados na emissão do contrato.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Escopo Técnico & Descrição dos Serviços
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                  placeholder="Descreva detalhadamente o escopo técnico do projeto, soluções inclusas, entregáveis, arquitetura e especificações acordadas com o cliente..."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] p-3 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition leading-relaxed resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Condições Comerciais & Observações de Pagamento
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Ex: Proposta válida por 15 dias corridos. Faturamento mensal via boleto ou PIX bancário com vencimento em até 10 dias da emissão da nota fiscal."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0d1117] p-3 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition leading-relaxed resize-y"
                />
              </div>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 rounded-xl text-xs text-rose-700 dark:text-rose-400">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/[0.08] px-6 py-4 flex-shrink-0 bg-slate-50/50 dark:bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Total Proposta:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {currency(totalCalculated)}
            </span>
          </div>

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
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl px-5 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-sm transition active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? "Salvando Proposta..." : isEditing ? "Salvar Alterações" : "Salvar Proposta Comercial"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de Pré-visualização Executiva da Proposta ──────────────────────────

function ProposalDocumentModal({
  proposal,
  lineItems,
  onClose,
  onStatusChange,
  onGenerateContract,
}: {
  proposal: Proposal;
  lineItems: ProposalLineItem[];
  onClose: () => void;
  onStatusChange: (newStatus: string) => void;
  onGenerateContract?: (proposal: Proposal) => void;
}) {
  const statusCfg = STATUS_CONFIG[proposal.status] || STATUS_CONFIG.draft;
  const [copySuccess, setCopySuccess] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);

  const termsData = useMemo(() => {
    return parseProposalTerms(proposal.content, proposal.notes);
  }, [proposal]);

  async function handleDownloadDocx() {
    try {
      setExportingDocx(true);
      await downloadProposalDocx(proposal, lineItems, termsData);
    } catch (err) {
      console.error("Erro ao gerar DOCX:", err);
      alert("Não foi possível gerar o arquivo Word.");
    } finally {
      setExportingDocx(false);
    }
  }

  function handleShareWhatsApp() {
    const text = encodeURIComponent(
      `Olá ${proposal.to_name}, segue a nossa proposta comercial #${getProposalNumber(proposal)}:\n*${proposal.subject}*\nValor Total: ${currency(proposal.total)}\nValidade: ${proposal.open_until ? new Date(proposal.open_until + "T00:00:00").toLocaleDateString("pt-BR") : "A combinar"}`
    );
    window.open(`https://wa.me/${(proposal.phone || "").replace(/\D/g, "")}?text=${text}`, "_blank");
  }

  function handleCopySummary() {
    navigator.clipboard.writeText(
      `Proposta #${getProposalNumber(proposal)} - ${proposal.subject} - Total: ${currency(proposal.total)}`
    );
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in print:p-0 print:bg-white">
      <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white dark:bg-[#121824] shadow-2xl border border-slate-200 dark:border-white/[0.08] flex flex-col overflow-hidden print:max-h-none print:shadow-none print:border-none">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.08] px-6 py-3 flex-shrink-0 bg-slate-50 dark:bg-[#0d1117] print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-4 h-4" /> Fechar
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
              {statusCfg.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareWhatsApp}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-xl hover:bg-emerald-100 transition"
            >
              <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
            </button>
            <button
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 transition"
            >
              {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copySuccess ? "Copiado!" : "Copiar"}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 transition"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button
              onClick={handleDownloadDocx}
              disabled={exportingDocx}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/40 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition cursor-pointer disabled:opacity-50"
              title="Baixar Proposta em formato Word (.docx)"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{exportingDocx ? "Gerando Word..." : "Baixar Word (.docx)"}</span>
            </button>
            {proposal.status !== "accepted" && (
              <button
                onClick={() => onStatusChange("accepted")}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
              >
                <Check className="w-3.5 h-3.5" /> Aprovar / Aceitar
              </button>
            )}
            {proposal.status === "accepted" && (
              <button
                onClick={() => {
                  onGenerateContract?.(proposal);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl shadow-md shadow-violet-600/25 transition"
                title="Criar contrato jurídico baseado nesta proposta"
              >
                <FileCheck className="w-3.5 h-3.5" /> Gerar Contrato
              </button>
            )}
            {proposal.status !== "declined" && (
              <button
                onClick={() => onStatusChange("declined")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/30 hover:bg-rose-100 rounded-xl transition"
              >
                <X className="w-3.5 h-3.5" /> Declinar
              </button>
            )}
          </div>
        </div>

        {/* Document Body (Estilo Papel Executivo) */}
        <div className="flex-1 overflow-y-auto p-8 sm:p-12 space-y-8 bg-white dark:bg-[#0c1017] text-slate-900 dark:text-slate-100">
          {/* Cabeçalho do Documento */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-100 dark:border-white/[0.08] pb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white font-bold text-sm">
                  IH
                </div>
                <span className="text-xl font-extrabold tracking-tight">Iris Horizon</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Soluções Corporativas em Nuvem & Telefonia IP</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">comercial@irishorizon.com.br</p>
            </div>

            <div className="sm:text-right space-y-1">
              <span className="text-xs uppercase font-bold tracking-widest text-indigo-600 dark:text-indigo-400">
                PROPOSTA COMERCIAL
              </span>
              <h2 className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                #{getProposalNumber(proposal)}
              </h2>
              <div className="text-xs text-slate-500 space-y-0.5 pt-1">
                <p>Emissão: {new Date(proposal.date + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                {proposal.open_until && (
                  <p className="font-semibold text-indigo-600 dark:text-indigo-400">
                    Válido até: {new Date(proposal.open_until + "T00:00:00").toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Dados do Cliente & Assunto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 dark:bg-white/[0.02] p-5 rounded-2xl border border-slate-100 dark:border-white/[0.04]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Elaborado Para</p>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{proposal.to_name}</h3>
              {proposal.email && <p className="text-xs text-slate-500 mt-0.5">{proposal.email}</p>}
              {proposal.phone && <p className="text-xs text-slate-500">{proposal.phone}</p>}
              {proposal.city && (
                <p className="text-xs text-slate-500 mt-1">
                  {proposal.address} {proposal.city ? `- ${proposal.city}` : ""} {proposal.state}
                </p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Objeto da Proposta</p>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{proposal.subject}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Fornecimento e prestação de serviços conforme descritivo técnico e condições comerciais abaixo.
              </p>
            </div>
          </div>

          {/* Tabela de Itens */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Itens & Serviços Inclusos
            </h4>
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-4 text-left font-bold text-slate-700 dark:text-slate-300">Item / Serviço</th>
                    <th className="py-3.5 px-4 text-left font-bold text-slate-700 dark:text-slate-300">Descrição</th>
                    <th className="py-3.5 px-3 text-center font-bold text-slate-700 dark:text-slate-300 w-20">Qtd</th>
                    <th className="py-3.5 px-4 text-right font-bold text-slate-700 dark:text-slate-300 w-32">Valor Unit.</th>
                    <th className="py-3.5 px-4 text-right font-bold text-slate-700 dark:text-slate-300 w-32">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {lineItems.map((li) => (
                    <tr key={li._key} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white text-sm">{li.name}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">{li.description || "—"}</td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="inline-block font-mono font-black text-sm text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/40">
                          {li.qty}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-800 dark:text-slate-200 text-sm">{currency(li.rate)}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-base">
                        {currency(li.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumo de Totais */}
          <div className="flex justify-end pt-2">
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal dos itens:</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">{currency(proposal.subtotal)}</span>
              </div>
              {proposal.discount_value > 0 && (
                <div className="flex justify-between text-rose-500 font-medium">
                  <span>Desconto concedido:</span>
                  <span>-{currency(proposal.discount_value)}</span>
                </div>
              )}
              {proposal.adjustment !== 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Ajustes:</span>
                  <span className="font-mono">{currency(proposal.adjustment)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex justify-between items-baseline">
                <span className="font-bold text-slate-900 dark:text-white text-sm">TOTAL GERAL:</span>
                <span className="font-mono font-bold text-xl text-emerald-600 dark:text-emerald-400">
                  {currency(proposal.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Termos & Condições Estruturadas */}
          {termsData.terms.length > 0 && (
            <div className="pt-6 border-t border-slate-100 dark:border-white/[0.08] space-y-4 text-xs">
              <h5 className="font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Termos, Condições & Cláusulas
              </h5>
              <div className="space-y-4">
                {termsData.terms.map((t) => (
                  <div key={t.id} className="p-4 rounded-xl bg-slate-50/70 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/[0.04] space-y-2">
                    {t.imageUrl && t.imagePosition === "above" && (
                      <div className="my-2 text-center">
                        <img src={t.imageUrl} alt={t.title} className="max-h-56 max-w-full rounded-lg mx-auto object-contain border border-slate-200 dark:border-white/10" />
                      </div>
                    )}
                    {t.title && <h6 className="font-bold text-slate-800 dark:text-slate-200">{t.title}</h6>}
                    {t.text && <p className="text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">{t.text}</p>}
                    {t.imageUrl && t.imagePosition !== "above" && (
                      <div className="my-2 text-center">
                        <img src={t.imageUrl} alt={t.title} className="max-h-56 max-w-full rounded-lg mx-auto object-contain border border-slate-200 dark:border-white/10" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observações Rápidas */}
          {termsData.notes && (
            <div className="pt-4 border-t border-slate-100 dark:border-white/[0.08] text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <h5 className="font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Observações Adicionais</h5>
              <p className="leading-relaxed whitespace-pre-line">{termsData.notes}</p>
            </div>
          )}

          {/* Rodapé da Proposta */}
          {(termsData.footerImageUrl || termsData.footerText) && (
            <div className="pt-6 border-t border-slate-100 dark:border-white/[0.08] text-center space-y-2">
              {termsData.footerImageUrl && (
                <div className="my-2">
                  <img src={termsData.footerImageUrl} alt="Rodapé" className="max-h-28 max-w-full rounded-lg mx-auto object-contain" />
                </div>
              )}
              {termsData.footerText && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                  {termsData.footerText}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component: Propostas ────────────────────────────────────────────────

export default function Propostas({ onPageChange }: { onPageChange?: (page: string) => void } = {}) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [crmItems, setCrmItems] = useState<CrmItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirecionar para Contratos com proposta selecionada
  const handleGenerateContract = (p: Proposal) => {
    try {
      sessionStorage.setItem(
        'create_contract_from_proposal',
        JSON.stringify({
          id: p.id,
          proposal_number: getProposalNumber(p),
          subject: p.subject,
          to_name: p.to_name,
          email: p.email,
          phone: p.phone,
          address: [p.address, p.city, p.state, p.zip_code].filter(Boolean).join(', '),
          total: p.total,
          related_id: p.related_id,
          date: p.date,
        })
      );
    } catch {}

    if (onPageChange) {
      onPageChange('crm-contratos');
    } else {
      try { sessionStorage.setItem('currentPage', 'crm-contratos'); } catch {}
      window.location.reload();
    }
  };

  // Filtros & Visualização
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");

  // Modais de Criação/Edição e Visualização
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [editingLineItems, setEditingLineItems] = useState<ProposalLineItem[]>([]);
  const [showEditorModal, setShowEditorModal] = useState(false);

  const [previewProposal, setPreviewProposal] = useState<Proposal | null>(null);
  const [previewLineItems, setPreviewLineItems] = useState<ProposalLineItem[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    loadAll();

    const proposalsChannel = `databases.${DATABASE_ID}.collections.crm_proposals.documents`;
    const unsubscribe = client.subscribe(proposalsChannel, (response: any) => {
      const events: string[] = response.events || [];
      const payload = response.payload;
      if (!payload) return;

      if (events.some((e: string) => e.includes(".create"))) {
        const newP: Proposal = { ...payload, id: payload.$id };
        setProposals((prev) => (prev.some((p) => p.id === newP.id) ? prev : [newP, ...prev]));
      } else if (events.some((e: string) => e.includes(".update"))) {
        const updatedP: Proposal = { ...payload, id: payload.$id };
        setProposals((prev) => prev.map((p) => (p.id === updatedP.id ? { ...p, ...updatedP } : p)));
      } else if (events.some((e: string) => e.includes(".delete"))) {
        setProposals((prev) => prev.filter((p) => p.id !== payload.$id));
      }
    });

    return () => {
      try {
        unsubscribe();
      } catch (e) {}
    };
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [pRes, iRes, cRes]: any[] = await Promise.all([
        databases.listDocuments(DATABASE_ID, "crm_proposals", [Query.orderDesc("created_at"), Query.limit(200)]),
        databases.listDocuments(DATABASE_ID, "crm_items", [Query.equal("is_active", true), Query.limit(200)]),
        databases.listDocuments(DATABASE_ID, "clients", [Query.orderAsc("name"), Query.limit(300)]),
      ]);

      setProposals(pRes.documents.map((d: any) => ({ ...d, id: d.$id })) || []);
      setCrmItems(iRes.documents.map((d: any) => ({ ...d, id: d.$id })) || []);
      setClients(cRes.documents.map((d: any) => ({ ...d, id: d.$id })) || []);
    } catch (err) {
      console.error("Erro ao carregar propostas:", err);
    } finally {
      setLoading(false);
    }
  }

  // Métricas do Painel de Propostas
  const metrics = useMemo(() => {
    const totalCount = proposals.length;
    let openValue = 0;
    let wonValue = 0;
    let wonCount = 0;
    let openCount = 0;

    proposals.forEach((p) => {
      const val = Number(p.total) || 0;
      if (p.status === "accepted") {
        wonValue += val;
        wonCount++;
      } else if (p.status !== "declined") {
        openValue += val;
        openCount++;
      }
    });

    const winRate = totalCount > 0 ? Math.round((wonCount / totalCount) * 100) : 0;
    const avgTicket = totalCount > 0 ? (openValue + wonValue) / totalCount : 0;

    return { totalCount, openValue, wonValue, wonCount, winRate, avgTicket, openCount };
  }, [proposals]);

  // Contagem por Status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: proposals.length };
    STATUS_KEYS.forEach((k) => (counts[k] = 0));
    proposals.forEach((p) => {
      if (counts[p.status] !== undefined) counts[p.status]++;
    });
    return counts;
  }, [proposals]);

  // Lista Filtrada
  const filtered = useMemo(() => {
    return proposals.filter((p) => {
      const matchesSearch =
        !search.trim() ||
        p.subject.toLowerCase().includes(search.toLowerCase()) ||
        p.to_name.toLowerCase().includes(search.toLowerCase()) ||
        getProposalNumber(p).toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [proposals, search, statusFilter]);

  // Abrir Modal de Edição
  async function openEditProposal(p: Proposal) {
    try {
      const { documents: itemsData } = await databases.listDocuments(DATABASE_ID, "crm_proposal_items", [
        Query.equal("proposal_id", p.id),
        Query.orderAsc("position"),
      ]);
      const mappedItems: ProposalLineItem[] = itemsData.map((r: any) => ({
        _key: makeKey(),
        item_id: r.item_id,
        name: r.name || "",
        description: r.description || "",
        long_description: r.long_description || "",
        qty: Number(r.qty) || 1,
        rate: Number(r.rate) || 0,
        tax_rate: Number(r.tax_rate) || 0,
        amount: Number(r.amount) || 0,
        unit: "",
      }));
      setEditingProposal(p);
      setEditingLineItems(mappedItems);
      setShowEditorModal(true);
    } catch (e) {
      console.error(e);
    }
  }

  // Abrir Modal de Visualização Executiva
  async function openPreviewProposal(p: Proposal) {
    try {
      const { documents: itemsData } = await databases.listDocuments(DATABASE_ID, "crm_proposal_items", [
        Query.equal("proposal_id", p.id),
        Query.orderAsc("position"),
      ]);
      const mappedItems: ProposalLineItem[] = itemsData.map((r: any) => ({
        _key: makeKey(),
        item_id: r.item_id,
        name: r.name || "",
        description: r.description || "",
        long_description: r.long_description || "",
        qty: Number(r.qty) || 1,
        rate: Number(r.rate) || 0,
        tax_rate: Number(r.tax_rate) || 0,
        amount: Number(r.amount) || 0,
        unit: "",
      }));
      setPreviewProposal(p);
      setPreviewLineItems(mappedItems);
      setShowPreviewModal(true);
    } catch (e) {
      console.error(e);
    }
  }

  function openCreateNew() {
    setEditingProposal(null);
    setEditingLineItems([]);
    setShowEditorModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta proposta?")) return;
    try {
      await databases.deleteDocument(DATABASE_ID, "crm_proposals", id);
      setProposals((prev) => prev.filter((p) => p.id !== id));
      if (previewProposal?.id === id) setShowPreviewModal(false);
      if (editingProposal?.id === id) setShowEditorModal(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleQuickStatusChange(id: string, newStatus: string) {
    try {
      const updated = await databases.updateDocument(DATABASE_ID, "crm_proposals", id, {
        status: newStatus,
        updated_at: new Date().toISOString(),
      });
      setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
      if (previewProposal?.id === id) {
        setPreviewProposal((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleQuickDownloadDocx(p: Proposal) {
    try {
      const { documents: itemsData } = await databases.listDocuments(DATABASE_ID, "crm_proposal_items", [
        Query.equal("proposal_id", p.id),
        Query.orderAsc("position"),
      ]);
      const mappedItems: ProposalLineItem[] = itemsData.map((r: any) => ({
        _key: makeKey(),
        item_id: r.item_id,
        name: r.name || "",
        description: r.description || "",
        long_description: r.long_description || "",
        qty: Number(r.qty) || 1,
        rate: Number(r.rate) || 0,
        tax_rate: Number(r.tax_rate) || 0,
        amount: Number(r.amount) || 0,
        unit: "",
      }));
      const tData = parseProposalTerms(p.content, p.notes);
      await downloadProposalDocx(p, mappedItems, tData);
    } catch (err) {
      console.error("Erro ao baixar docx:", err);
      alert("Não foi possível gerar o arquivo Word.");
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Executivo com Indicadores de Negócios */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 px-2.5 py-0.5 rounded-md">
              Gestão Comercial
            </span>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sincronizado</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Propostas Comerciais & Orçamentos
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Elabore orçamentos inteligentes, envie por WhatsApp/Email e acompanhe conversões em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadAll}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200/80 dark:border-white/[0.08] rounded-xl transition"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-500" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={openCreateNew}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 rounded-xl shadow-sm transition active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" /> Nova Proposta Comercial
          </button>
        </div>
      </div>

      {/* 2. Scorecard Executivo de Propostas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Em Aberto */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Propostas Ativas
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {currency(metrics.openValue)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {metrics.openCount} propostas em negociação
          </p>
        </div>

        {/* Card 2: Aceitas / Ganhos */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Receita Aceita
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {currency(metrics.wonValue)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {metrics.wonCount} propostas aprovadas
          </p>
        </div>

        {/* Card 3: Taxa de Aceitação (Win Rate) */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Taxa de Conversão
            </span>
            <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center text-violet-600 dark:text-violet-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {metrics.winRate}%
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Taxa média de aprovação
          </p>
        </div>

        {/* Card 4: Ticket Médio */}
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ticket Médio
            </span>
            <div className="w-8 h-8 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {currency(metrics.avgTicket)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Média por proposta emitida
          </p>
        </div>
      </div>

      {/* 3. Filtros, Status Chips & Barra de Busca */}
      <div className="space-y-3">
        {/* Status Chips com Contadores */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
              statusFilter === "all"
                ? "bg-indigo-600 text-white shadow-xs font-semibold"
                : "bg-white dark:bg-[#121824] text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-white/[0.08] hover:border-indigo-500/40"
            }`}
          >
            Todas as Propostas
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10 dark:bg-white/10 font-mono">
              {statusCounts.all}
            </span>
          </button>

          {STATUS_KEYS.map((k) => {
            const cfg = STATUS_CONFIG[k];
            return (
              <button
                key={k}
                onClick={() => setStatusFilter(k)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                  statusFilter === k
                    ? "bg-indigo-600 text-white shadow-xs font-semibold"
                    : "bg-white dark:bg-[#121824] text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-white/[0.08] hover:border-indigo-500/40"
                }`}
              >
                {cfg.label}
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/10 dark:bg-white/10 font-mono">
                  {statusCounts[k] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Toolbar de Ações & Busca */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#121824] p-3 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por proposta, cliente ou assunto..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#0d1117] border border-slate-200/80 dark:border-white/[0.08] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500 transition"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Alternador de Modo de Visualização */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#0d1117] p-1 rounded-xl border border-slate-200/80 dark:border-white/[0.08]">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === "list"
                    ? "bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-xs font-semibold"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
                title="Tabela de Propostas"
              >
                <ListIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("pipeline")}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === "pipeline"
                    ? "bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-xs font-semibold"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
                title="Quadro por Status"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Conteúdo: Lista Executiva ou Pipeline Kanban */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Carregando propostas...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-12 text-center border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
          <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Nenhuma proposta encontrada</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Não encontramos propostas para o filtro atual. Crie uma nova proposta para iniciar negociações.
          </p>
          <button
            onClick={openCreateNew}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Criar Primeira Proposta
          </button>
        </div>
      ) : viewMode === "list" ? (
        /* Visualização em Lista / Tabela Executiva */
        <div className="bg-white dark:bg-[#121824] rounded-2xl border border-slate-200/80 dark:border-white/[0.08] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#0d1117]">
                  <th className="py-3 px-4 text-left font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Ref. / Assunto
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Cliente / Destinatário
                  </th>
                  <th className="py-3 px-4 text-left font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Emissão & Validade
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Valor Total
                  </th>
                  <th className="py-3 px-4 text-center font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {filtered.map((p) => {
                  const statusCfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.draft;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => openPreviewProposal(p)}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-slate-400">
                            #{getProposalNumber(p)}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mt-0.5">
                          {p.subject}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{p.to_name}</p>
                        {p.phone && <p className="text-[11px] text-slate-400 mt-0.5">{p.phone}</p>}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                        <p>Emissão: {new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                        {p.open_until && (
                          <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                            Até: {new Date(p.open_until + "T00:00:00").toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                        {currency(p.total)}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusCfg.badgeClass}`}>
                          {statusCfg.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {p.status === "accepted" && (
                            <button
                              onClick={() => handleGenerateContract(p)}
                              className="px-2 py-1 rounded-lg text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition flex items-center gap-1 font-semibold text-[11px]"
                              title="Gerar Contrato a partir desta Proposta Aceita"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                              <span className="hidden xl:inline">Gerar Contrato</span>
                            </button>
                          )}
                          <button
                            onClick={() => openPreviewProposal(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition"
                            title="Visualizar Documento"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleQuickDownloadDocx(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition"
                            title="Baixar Proposta em Word (.docx)"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditProposal(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition"
                            title="Editar Proposta"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Visualização em Pipeline / Kanban de Status */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {STATUS_KEYS.filter((k) => k !== "declined" || statusCounts.declined > 0).map((key) => {
            const cfg = STATUS_CONFIG[key];
            const colProposals = filtered.filter((p) => p.status === key);
            const colTotal = colProposals.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);

            return (
              <div
                key={key}
                className="bg-slate-50/60 dark:bg-[#0c1017] rounded-2xl p-3 border border-slate-200/80 dark:border-white/[0.06] flex flex-col min-w-[240px]"
              >
                {/* Cabeçalho da Coluna */}
                <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-200/60 dark:border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200">{cfg.label}</h3>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-white/10 text-slate-600 dark:text-slate-300">
                    {colProposals.length}
                  </span>
                </div>

                <div className="px-2 pb-2 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {currency(colTotal)}
                </div>

                {/* Cards na Coluna */}
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[600px] p-1">
                  {colProposals.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => openPreviewProposal(p)}
                      className="bg-white dark:bg-[#121824] rounded-xl p-3.5 border border-slate-200/80 dark:border-white/[0.08] shadow-xs hover:border-indigo-500/40 hover:shadow-md transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-mono text-[10px] text-slate-400">
                          #{getProposalNumber(p)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </span>
                      </div>

                      <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 mb-2">
                        {p.subject}
                      </h4>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-2">
                        {p.to_name}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                        <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {currency(p.total)}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação / Edição */}
      {showEditorModal && (
        <ProposalEditorModal
          proposal={editingProposal}
          initialLineItems={editingLineItems}
          crmItems={crmItems}
          clients={clients}
          onClose={() => setShowEditorModal(false)}
          onSaveSuccess={(saved) => {
            setProposals((prev) => {
              const idx = prev.findIndex((p) => p.id === saved.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = saved;
                return next;
              }
              return [saved, ...prev];
            });
            setShowEditorModal(false);
          }}
        />
      )}

      {/* Modal de Pré-visualização Executiva */}
      {showPreviewModal && previewProposal && (
        <ProposalDocumentModal
          proposal={previewProposal}
          lineItems={previewLineItems}
          onClose={() => setShowPreviewModal(false)}
          onStatusChange={(newStatus) => handleQuickStatusChange(previewProposal.id, newStatus)}
          onGenerateContract={handleGenerateContract}
        />
      )}
    </div>
  );
}
