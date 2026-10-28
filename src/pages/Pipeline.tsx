import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, Filter, Trash2, CreditCard as Edit2, X, Check, Flag, Calendar, Paperclip, Building2, Clock, Sparkles, AlertTriangle, User, SlidersHorizontal, Kanban } from "lucide-react";
import { databases, client, currentTenantId } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
import { useAuth } from "../context/AuthContext";
import { useTenant } from "../context/TenantContext";
import PipelineItemView from "../components/pipeline/PipelineItemView";
import QuickAddCard, { QuickAddForm as QuickAddCardPayload } from "../components/pipeline/QuickAddCard";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import confetti from "canvas-confetti";
import {
  sendSystemNotification,
  notifyDealAssigned,
  notifyDealWon,
  notifyActivityAssigned,
} from "../services/notificationService";

interface Column {
  id: string;
  name: string;
  color: string;
  position: number;
  tenant_id?: string;
}

interface Activity {
  id: string;
  deal_id: string;
  type: string;
  responsible: string;
  subject: string;
  scheduled_for: string | null;
  duration: number;
  description: string;
  status: "Planejado" | "Concluído";
  created_at: string;
  tenant_id?: string;
}

interface HistoryItem {
  id: string;
  deal_id: string;
  text: string;
  created_by: string | null;
  created_at: string;
  tenant_id?: string;
}

interface Deal {
  id: string;
  name: string;
  company: string;
  client_id?: string | null;
  value: number;
  column_id: string;
  tags: string[];
  last_contact: string;
  pending: string;
  notes: string;
  contact_phone: string;
  contact_email: string;
  contact_company: string;
  contact_position: string;
  assigned_to: string | null;
  created_by: string | null;
  position: number;
  priority?: "baixa" | "normal" | "alta" | "urgente" | string;
  due_date?: string | null;
  dueDate?: string | null;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  tenant_id?: string;
  activities?: Activity[];
  history?: HistoryItem[];
}

type DealFormData = {
  name: string;
  company: string;
  client_id: string;
  value: string;
  column_id: string;
  tags: string;
  last_contact: string;
  pending: string;
  assigned_to: string;
};

type QuickAddForm = {
  name: string;
  assigned_to: string;
  due_date: string;
  priority: string;
  label: string;
};

type ColumnFormData = {
  name: string;
  color: string;
};

type DetailTab = "negocios" | "atividades" | "historico" | "contato" | "notas";

const VALID_PRIORITIES = new Set(["baixa", "normal", "alta", "urgente"]);

function normalizePriority(value?: string | null): "baixa" | "normal" | "alta" | "urgente" {
  const normalized = (value || "normal").trim().toLowerCase();
  return VALID_PRIORITIES.has(normalized)
    ? (normalized as "baixa" | "normal" | "alta" | "urgente")
    : "normal";
}

function normalizeDueDate(value?: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDealRecord(d: any): Deal {
  const resolvedDueDate = normalizeDueDate(d.due_date ?? d.dueDate ?? null);
  return {
    ...d,
    id: d.$id || d.id,
    tags: Array.isArray(d.tags) ? [...d.tags] : [],
    priority: normalizePriority(d.priority),
    due_date: resolvedDueDate,
    dueDate: resolvedDueDate,
  };
}

async function fetchAllCollectionPages(
  collectionId: string,
  baseQueries: string[] = [],
  pageSize = 100
): Promise<any[]> {
  const allDocs: any[] = [];
  const seenIds = new Set<string>();
  let lastId: string | null = null;
  let offset = 0;
  let useOffsetFallback = false;
  const maxPages = 100;

  for (let page = 0; page < maxPages; page++) {
    const pageQueries = [...baseQueries, Query.limit(pageSize)];
    if (useOffsetFallback) {
      if (offset > 0) pageQueries.push(Query.offset(offset));
    } else if (lastId) {
      pageQueries.push(Query.cursorAfter(lastId));
    }

    let response: any;
    try {
      response = await databases.listDocuments(DATABASE_ID, collectionId, pageQueries);
    } catch (err) {
      if (!useOffsetFallback && lastId) {
        useOffsetFallback = true;
        const fallbackQueries = [...baseQueries, Query.limit(pageSize), Query.offset(offset)];
        response = await databases.listDocuments(DATABASE_ID, collectionId, fallbackQueries);
      } else {
        throw err;
      }
    }

    const docs: any[] = Array.isArray(response?.documents) ? response.documents : [];
    if (docs.length === 0) break;

    let addedInBatch = 0;
    for (const doc of docs) {
      const docId = String(doc?.$id || doc?.id || "");
      if (docId) {
        if (seenIds.has(docId)) continue;
        seenIds.add(docId);
      }
      allDocs.push(doc);
      addedInBatch++;
    }

    if (docs.length < pageSize || addedInBatch === 0) {
      break;
    }

    if (page === maxPages - 1 && docs.length >= pageSize) {
      console.warn(`[fetchAllCollectionPages] Limite máximo de paginação (${maxPages} páginas, ${allDocs.length} itens) atingido para '${collectionId}'. Notificando carregamento parcial.`);
      (allDocs as any).isTruncated = true;
    }

    const tailDoc = docs[docs.length - 1];
    const tailId = String(tailDoc?.$id || tailDoc?.id || "");
    if (!tailId) {
      useOffsetFallback = true;
    } else {
      lastId = tailId;
    }
    offset += docs.length;
  }

  return allDocs;
}

const initialDealForm: DealFormData = {
  name: "",
  company: "",
  client_id: "",
  value: "",
  column_id: "",
  tags: "",
  last_contact: "0d",
  pending: "0/0",
  assigned_to: "",
};

const initialColumnForm: ColumnFormData = {
  name: "",
  color: "#3B82F6",
};

const tagColors: Record<string, string> = {
  Follow: "bg-blue-100 text-blue-600",
  "ICP Ideal": "bg-indigo-100 text-indigo-600",
  MQL: "bg-purple-100 text-purple-600",
  tem_timing: "bg-amber-100 text-amber-600",
  "Reunião Agendada": "bg-emerald-100 text-emerald-600",
  "Outros Nicho": "bg-orange-100 text-orange-600",
};

function currencyBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

interface ClientSuggestion {
  id: string;
  $id?: string;
  name: string;
  fantasy_name: string;
  phone?: string;
  email?: string;
  document?: string;
}

interface PipelineProps {
  initialDealId?: string | null;
  onDealOpened?: () => void;
}

export default function Pipeline({ initialDealId, onDealOpened }: PipelineProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const activeTenantId = tenant?.id || currentTenantId || "";

  const [columns, setColumns] = useState<Column[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<ClientSuggestion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const companyInputRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showDealModal, setShowDealModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [dealForm, setDealForm] = useState<DealFormData>(initialDealForm);
  const [columnForm, setColumnForm] = useState<ColumnFormData>(initialColumnForm);

  const [quickAddColumnId, setQuickAddColumnId] = useState<string | null>(null);
  const [quickAddForm, setQuickAddForm] = useState<QuickAddForm>({ name: "", assigned_to: "", due_date: "", priority: "", label: "" });
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [onlyMyDeals, setOnlyMyDeals] = useState<boolean>(false);
  const [compactView, setCompactView] = useState<boolean>(() => {
    try {
      return localStorage.getItem("crm_pipeline_view_mode") !== "detailed";
    } catch {
      return true;
    }
  });

  const toggleViewMode = () => {
    setCompactView((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("crm_pipeline_view_mode", next ? "compact" : "detailed");
      } catch {}
      return next;
    });
  };

  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("atividades");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activityForm, setActivityForm] = useState({
    type: "Lembrete",
    responsible: "",
    subject: "",
    scheduled_for: "",
    duration: "30",
    description: "",
  });

  // Generation counter bound to userId + tenantId to discard delayed/out-of-order responses
  const loadGenerationRef = useRef<number>(0);
  const activeTenantIdRef = useRef<string>(activeTenantId);
  activeTenantIdRef.current = activeTenantId;

  useEffect(() => {
    loadGenerationRef.current += 1;
    const currentGen = loadGenerationRef.current;

    // Clear state immediately on tenant/user switch so stale cross-tenant data is never shown
    setColumns([]);
    setDeals([]);
    setUsers([]);
    setClients([]);
    setSelectedDeal(null);
    setEditingDeal(null);
    setEditingColumn(null);
    setShowDealModal(false);
    setShowColumnModal(false);
    setQuickAddColumnId(null);
    setActivities([]);
    setHistory([]);
    setLoadError(null);

    if (!activeTenantId) {
      setLoading(false);
      return;
    }

    loadInitialData(currentGen, activeTenantId);

    const cleanup = setupRealtimeSubscriptions(activeTenantId, currentGen);

    return () => {
      cleanup?.();
    };
  }, [activeTenantId, user?.id]);

  useEffect(() => {
    const queryDealId = searchParams.get("deal") || searchParams.get("dealId");
    const targetDealId = initialDealId || queryDealId;

    if (targetDealId && deals.length > 0 && !loading) {
      const deal = deals.find((d) => d.id === targetDealId);
      if (deal) {
        openDealDetails(deal);
        if (onDealOpened) {
          onDealOpened();
        }
      }
    }
  }, [initialDealId, searchParams, deals, loading]);

  async function loadInitialData(gen = loadGenerationRef.current, targetTenantId = activeTenantId) {
    if (!targetTenantId) {
      if (gen === loadGenerationRef.current) {
        setLoading(false);
      }
      return;
    }

    try {
      if (gen === loadGenerationRef.current) {
        setLoading(true);
        setLoadError(null);
      }
      await Promise.all([
        loadColumns(gen, targetTenantId),
        loadDeals(gen, targetTenantId),
        loadUsers(gen),
        loadClients(gen, targetTenantId),
      ]);
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      if (gen === loadGenerationRef.current) {
        setLoadError(error?.message || "Erro ao carregar dados do pipeline.");
      }
    } finally {
      if (gen === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }

  async function loadClients(gen = loadGenerationRef.current, targetTenantId = activeTenantId) {
    if (!targetTenantId) return;
    try {
      const tenantQuery = [Query.equal("tenant_id", targetTenantId), Query.orderAsc("name")];
      const data = await fetchAllCollectionPages("clients", tenantQuery);
      if (gen !== loadGenerationRef.current) return;

      setClients(
        (data || []).map((d: any) => ({
          id: d.$id || d.id,
          $id: d.$id || d.id,
          name: d.name,
          fantasy_name: d.fantasy_name || d.tradeName || "",
          phone: d.phone || "",
          email: d.email || "",
          document: d.document || "",
        }))
      );
    } catch (e) {
      console.error("Erro ao carregar clientes:", e);
    }
  }

  async function loadColumns(gen = loadGenerationRef.current, targetTenantId = activeTenantId) {
    if (!targetTenantId) return;
    try {
      const tenantQuery = [Query.equal("tenant_id", targetTenantId), Query.orderAsc("position")];
      const data = await fetchAllCollectionPages("pipeline_columns", tenantQuery);
      if (gen !== loadGenerationRef.current) return;

      setColumns(
        (data || [])
          .filter((d: any) => !d.tenant_id || d.tenant_id === targetTenantId)
          .map((d: any) => ({ ...d, id: d.$id || d.id }))
      );
    } catch (error: any) {
      console.error("Erro ao carregar colunas:", error);
      if (gen === loadGenerationRef.current) {
        setLoadError(error?.message || "Falha ao sincronizar colunas do funil.");
      }
    }
  }

  async function loadDeals(gen = loadGenerationRef.current, targetTenantId = activeTenantId) {
    if (!targetTenantId) return;
    try {
      const tenantQuery = [Query.equal("tenant_id", targetTenantId), Query.orderAsc("position")];
      const data = await fetchAllCollectionPages("pipeline_deals", tenantQuery);
      if (gen !== loadGenerationRef.current) return;

      setDeals(
        (data || [])
          .filter((d: any) => !d.tenant_id || d.tenant_id === targetTenantId)
          .map((d: any) => normalizeDealRecord(d))
      );
    } catch (error: any) {
      console.error("Erro ao carregar deals:", error);
      if (gen === loadGenerationRef.current) {
        setLoadError(error?.message || "Falha ao sincronizar negócios do funil.");
      }
    }
  }

  async function loadUsers(gen = loadGenerationRef.current) {
    try {
      const data = await fetchAllCollectionPages("users_hydra", [
        Query.equal("is_active", true),
        Query.orderAsc("name"),
      ]);
      if (gen !== loadGenerationRef.current) return;

      setUsers((data || []).map((d: any) => ({ ...d, id: d.$id || d.id })));
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    }
  }

  async function loadDealDetails(dealId: string, gen = loadGenerationRef.current) {
    const tenantFilter = activeTenantId ? [Query.equal("tenant_id", activeTenantId)] : [];
    const [loadedActivities, loadedHistory] = await Promise.all([
      fetchAllCollectionPages("pipeline_activities", [
        ...tenantFilter,
        Query.equal("deal_id", dealId),
        Query.orderDesc("created_at"),
      ]),
      fetchAllCollectionPages("pipeline_history", [
        ...tenantFilter,
        Query.equal("deal_id", dealId),
        Query.orderDesc("created_at"),
      ]),
    ]);

    const normalizedActivities = (loadedActivities || []).map((a: any) => ({ ...a, id: a.$id || a.id }));
    const normalizedHistory = (loadedHistory || []).map((h: any) => ({ ...h, id: h.$id || h.id }));

    if (gen === loadGenerationRef.current) {
      setActivities(normalizedActivities);
      setHistory(normalizedHistory);
    }

    return {
      activities: normalizedActivities,
      history: normalizedHistory,
    };
  }

  const selectedDealRef = useRef<Deal | null>(null);
  selectedDealRef.current = selectedDeal;

  function setupRealtimeSubscriptions(boundTenantId: string, boundGen: number) {
    const dealsChannel = `databases.${DATABASE_ID}.collections.pipeline_deals.documents`;
    const columnsChannel = `databases.${DATABASE_ID}.collections.pipeline_columns.documents`;
    const activitiesChannel = `databases.${DATABASE_ID}.collections.pipeline_activities.documents`;
    const historyChannel = `databases.${DATABASE_ID}.collections.pipeline_history.documents`;

    const unsubscribe = client.subscribe(
      [dealsChannel, columnsChannel, activitiesChannel, historyChannel],
      (response: any) => {
        if (boundGen !== loadGenerationRef.current) return;
        const events: string[] = response.events || [];
        const payload = response.payload;

        // Mandatory tenant isolation check for all realtime events (create, update, delete)
        if (!payload || !boundTenantId || payload.tenant_id !== boundTenantId) return;

        // Pipeline Deals events
        if (events.some((e: string) => e.includes("pipeline_deals"))) {
          if (events.some((e: string) => e.includes(".create"))) {
            const newDeal: Deal = normalizeDealRecord(payload);
            setDeals((prev) => {
              if (prev.some((d) => d.id === newDeal.id)) return prev;
              return [...prev, newDeal];
            });
          } else if (events.some((e: string) => e.includes(".update"))) {
            const updatedDeal: Deal = normalizeDealRecord(payload);
            setDeals((prev) =>
              prev.map((d) => (d.id === updatedDeal.id ? { ...d, ...updatedDeal } : d))
            );
            if (selectedDealRef.current?.id === updatedDeal.id) {
              setSelectedDeal((prev) => (prev ? { ...prev, ...updatedDeal } : null));
            }
          } else if (events.some((e: string) => e.includes(".delete"))) {
            const deletedId = payload.$id || payload.id;
            setDeals((prev) => prev.filter((d) => d.id !== deletedId));
            if (selectedDealRef.current?.id === deletedId) {
              setSelectedDeal(null);
            }
          }
        }

        // Pipeline Columns events
        if (events.some((e: string) => e.includes("pipeline_columns"))) {
          if (events.some((e: string) => e.includes(".create"))) {
            const newCol: Column = { ...payload, id: payload.$id || payload.id };
            setColumns((prev) => {
              if (prev.some((c) => c.id === newCol.id)) return prev;
              return [...prev, newCol].sort((a, b) => a.position - b.position);
            });
          } else if (events.some((e: string) => e.includes(".update"))) {
            const updatedCol: Column = { ...payload, id: payload.$id || payload.id };
            setColumns((prev) =>
              prev
                .map((c) => (c.id === updatedCol.id ? { ...c, ...updatedCol } : c))
                .sort((a, b) => a.position - b.position)
            );
          } else if (events.some((e: string) => e.includes(".delete"))) {
            const deletedId = payload.$id || payload.id;
            setColumns((prev) => prev.filter((c) => c.id !== deletedId));
          }
        }

        // Pipeline Activities events
        if (events.some((e: string) => e.includes("pipeline_activities"))) {
          if (selectedDealRef.current && payload.deal_id === selectedDealRef.current.id) {
            const actId = payload.$id || payload.id;
            if (events.some((e: string) => e.includes(".create"))) {
              setActivities((prev) => {
                if (prev.some((a) => a.id === actId)) return prev;
                return [{ ...payload, id: actId }, ...prev];
              });
            } else if (events.some((e: string) => e.includes(".update"))) {
              setActivities((prev) =>
                prev.map((a) => (a.id === actId ? { ...payload, id: actId } : a))
              );
            } else if (events.some((e: string) => e.includes(".delete"))) {
              setActivities((prev) => prev.filter((a) => a.id !== actId));
            }
          }
        }

        // Pipeline History events
        if (events.some((e: string) => e.includes("pipeline_history"))) {
          if (selectedDealRef.current && payload.deal_id === selectedDealRef.current.id) {
            const histId = payload.$id || payload.id;
            if (events.some((e: string) => e.includes(".create"))) {
              setHistory((prev) => {
                if (prev.some((h) => h.id === histId)) return prev;
                return [{ ...payload, id: histId }, ...prev];
              });
            }
          }
        }
      }
    );

    return () => {
      try {
        unsubscribe();
      } catch (e) {}
    };
  }

  const filteredCompanySuggestions = useMemo(() => {
    const term = dealForm.company.toLowerCase().trim();
    if (!term) return clients.slice(0, 8);
    return clients.filter((c) =>
      c.name.toLowerCase().includes(term) ||
      (c.fantasy_name && c.fantasy_name.toLowerCase().includes(term))
    ).slice(0, 8);
  }, [clients, dealForm.company]);

  const filteredDeals = useMemo(() => {
    const term = search.trim().toLowerCase();

    return deals.filter((deal) => {
      if (priorityFilter !== "all" && (deal.priority || "normal") !== priorityFilter) {
        return false;
      }
      if (onlyMyDeals && deal.assigned_to !== user?.id) {
        return false;
      }
      if (!term) return true;

      const text = [deal.name, deal.company || "", (deal.tags || []).join(" ")]
        .join(" ")
        .toLowerCase();

      return text.includes(term);
    });
  }, [deals, search, priorityFilter, onlyMyDeals, user?.id]);

  const totalPipelineValue = useMemo(() => {
    return deals.reduce((sum, d) => sum + (d.value || 0), 0);
  }, [deals]);

  const activeDealsCount = useMemo(() => {
    return deals.filter((d) => !d.completed).length;
  }, [deals]);

  const currentDealActivities = useMemo(() => {
    if (!selectedDeal) return [];
    return activities.filter((activity) => activity.deal_id === selectedDeal.id);
  }, [activities, selectedDeal]);

  const currentDealHistory = useMemo(() => {
    if (!selectedDeal) return [];
    return history.filter((item) => item.deal_id === selectedDeal.id);
  }, [history, selectedDeal]);

  function getDealsByColumn(columnId: string) {
    return filteredDeals.filter((deal) => deal.column_id === columnId);
  }

  function getColumnTotal(columnId: string) {
    return deals
      .filter((deal) => deal.column_id === columnId)
      .reduce((sum, deal) => sum + deal.value, 0);
  }

  function resetDealForm() {
    setDealForm(initialDealForm);
    setEditingDeal(null);
  }

  function resetColumnForm() {
    setColumnForm(initialColumnForm);
    setEditingColumn(null);
  }

  function openNewDealModal(columnId?: string) {
    setEditingDeal(null);
    setDealForm({
      ...initialDealForm,
      column_id: columnId || columns[0]?.id || "",
      assigned_to: "",
      client_id: "",
    });
    setShowDealModal(true);
  }

  function openEditDealModal(deal: Deal) {
    setEditingDeal(deal);
    setDealForm({
      name: deal.name,
      company: deal.company || "",
      client_id: deal.client_id || "",
      value: String(deal.value || ""),
      column_id: deal.column_id,
      tags: (deal.tags || []).join(", "),
      last_contact: deal.last_contact,
      pending: deal.pending,
      assigned_to: deal.assigned_to || "",
    });
    setShowDealModal(true);
  }

  function closeDealModal() {
    setShowDealModal(false);
    setShowCompanySuggestions(false);
    resetDealForm();
  }

  function openNewColumnModal() {
    setEditingColumn(null);
    setColumnForm(initialColumnForm);
    setShowColumnModal(true);
  }

  function openEditColumnModal(column: Column) {
    setEditingColumn(column);
    setColumnForm({
      name: column.name,
      color: column.color,
    });
    setShowColumnModal(true);
  }

  function closeColumnModal() {
    setShowColumnModal(false);
    resetColumnForm();
  }

  function openQuickAdd(columnId: string) {
    setQuickAddColumnId(columnId);
    setQuickAddForm({ name: "", assigned_to: "", due_date: "", priority: "", label: "" });
  }

  function closeQuickAdd() {
    setQuickAddColumnId(null);
    setQuickAddForm({ name: "", assigned_to: "", due_date: "", priority: "", label: "" });
  }

  async function handleQuickAddSave(columnId: string, form: QuickAddCardPayload) {
    const targetTenantId = tenant?.id || currentTenantId || "tenant_default";
    const resolvedPriority = normalizePriority(form.priority);
    const resolvedDueDate = normalizeDueDate(form.due_date ?? form.dueDate ?? null);
    const currentColumnDeals = deals.filter((d) => d.column_id === columnId);

    setQuickAddSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        company: "",
        value: 0,
        column_id: columnId,
        tags: form.label ? [form.label] : [],
        last_contact: "0d",
        pending: "0/0",
        notes: "",
        contact_phone: "",
        contact_email: "",
        contact_company: "",
        contact_position: "",
        assigned_to: form.assigned_to || null,
        priority: resolvedPriority,
        due_date: resolvedDueDate,
        position: currentColumnDeals.length,
        tenant_id: targetTenantId,
      };

      const createdDoc = await databases.createDocument(
        DATABASE_ID,
        "pipeline_deals",
        ID.unique(),
        payload
      );

      if (!createdDoc) {
        throw new Error("Falha ao criar card.");
      }

      const normalizedCreatedDeal: Deal = normalizeDealRecord({
        ...payload,
        ...createdDoc,
        id: createdDoc.$id || (createdDoc as any).id,
        priority: createdDoc.priority || resolvedPriority,
        due_date: createdDoc.due_date ?? resolvedDueDate,
        dueDate: createdDoc.due_date ?? resolvedDueDate,
      });

      setDeals((prev) => {
        const exists = prev.some((d) => d.id === normalizedCreatedDeal.id);
        if (exists) {
          return prev.map((d) => (d.id === normalizedCreatedDeal.id ? normalizedCreatedDeal : d));
        }
        return [...prev, normalizedCreatedDeal];
      });

      await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
        deal_id: normalizedCreatedDeal.id,
        text: "Card criado.",
        created_by: user?.id || null,
        tenant_id: targetTenantId,
      });

      if (form.assigned_to && form.assigned_to !== user?.id) {
        notifyDealAssigned(
          form.assigned_to,
          form.name.trim(),
          normalizedCreatedDeal.id,
          user?.name,
          targetTenantId
        ).catch(() => {});
      }

      closeQuickAdd();
      await loadDeals(loadGenerationRef.current, activeTenantId || targetTenantId);
      setSelectedDeal(normalizedCreatedDeal);
    } catch (err) {
      console.error("Erro ao criar card:", err);
      throw err;
    } finally {
      setQuickAddSaving(false);
    }
  }

  async function saveDeal(e: React.FormEvent) {
    e.preventDefault();

    if (!dealForm.name.trim()) {
      alert("Informe o nome do card.");
      return;
    }

    if (!dealForm.column_id) {
      alert("Selecione uma coluna.");
      return;
    }

    const targetTenantId = tenant?.id || currentTenantId || "tenant_default";

    const dealData = {
      name: dealForm.name.trim(),
      company: dealForm.company.trim(),
      client_id: dealForm.client_id || null,
      value: Number(dealForm.value || 0),
      column_id: dealForm.column_id,
      tags: dealForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      last_contact: dealForm.last_contact.trim() || "0d",
      pending: dealForm.pending.trim() || "0/0",
      notes: editingDeal?.notes || "",
      contact_phone: editingDeal?.contact_phone || "",
      contact_email: editingDeal?.contact_email || "",
      contact_company: dealForm.company.trim(),
      contact_position: editingDeal?.contact_position || "",
      assigned_to: dealForm.assigned_to || null,
      priority: normalizePriority(editingDeal?.priority),
      due_date: normalizeDueDate(editingDeal?.due_date ?? editingDeal?.dueDate ?? null),
      tenant_id: targetTenantId,
    };

    setSaving(true);
    try {
      if (editingDeal) {
        const previousAssignedTo = editingDeal.assigned_to;

        await databases.updateDocument(DATABASE_ID, "pipeline_deals", editingDeal.id, dealData);

        await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: editingDeal.id,
          text: "Card editado.",
          created_by: user?.id || null,
          tenant_id: targetTenantId,
        });

        if (dealForm.assigned_to && dealForm.assigned_to !== previousAssignedTo && dealForm.assigned_to !== user?.id) {
          await sendNotificationToUser(
            dealForm.assigned_to,
            "Voce foi atribuido a um card",
            `Voce foi atribuido como responsavel pelo card "${dealForm.name}"`,
            "pipeline_assignment",
            editingDeal.id,
            "deal"
          );
        }
      } else {
        const createdDoc = await databases.createDocument(
          DATABASE_ID,
          "pipeline_deals",
          ID.unique(),
          dealData
        );
        const newDeal = normalizeDealRecord({
          ...dealData,
          ...createdDoc,
          id: createdDoc.$id || (createdDoc as any).id,
        });

        await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: newDeal.id,
          text: "Card criado.",
          created_by: user?.id || null,
          tenant_id: targetTenantId,
        });

        if (dealForm.assigned_to && dealForm.assigned_to !== user?.id) {
          await sendNotificationToUser(
            dealForm.assigned_to,
            "Voce foi atribuido a um novo card",
            `Voce foi atribuido como responsavel pelo card "${dealForm.name}"`,
            "pipeline_assignment",
            newDeal.id,
            "deal"
          );
        }

        closeDealModal();
        await loadDeals();
        setSelectedDeal(newDeal);
        return;
      }

      closeDealModal();
      await loadDeals();
    } catch (error: any) {
      console.error("Erro ao salvar deal:", error);
      alert(`Erro ao salvar card: ${error.message || "Tente novamente."}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveColumn(e: React.FormEvent) {
    e.preventDefault();

    if (!columnForm.name.trim()) {
      alert("Informe o nome da coluna.");
      return;
    }

    const targetTenantId = tenant?.id || currentTenantId || "tenant_default";

    setSaving(true);
    try {
      if (editingColumn) {
        await databases.updateDocument(DATABASE_ID, "pipeline_columns", editingColumn.id, {
          name: columnForm.name.trim(),
          color: columnForm.color,
          tenant_id: targetTenantId,
        });
      } else {
        await databases.createDocument(DATABASE_ID, "pipeline_columns", ID.unique(), {
          name: columnForm.name.trim(),
          color: columnForm.color,
          position: columns.length,
          tenant_id: targetTenantId,
        });
      }

      closeColumnModal();
      await loadColumns();
    } catch (error: any) {
      console.error("Erro ao salvar coluna:", error);
      alert(`Erro ao salvar coluna: ${error.message || "Tente novamente."}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDeal(dealId: string) {
    const confirmed = window.confirm("Deseja excluir este card?");
    if (!confirmed) return;

    try {
      await databases.deleteDocument(DATABASE_ID, "pipeline_deals", dealId);
      setDeals((prev) => prev.filter((d) => d.id !== dealId));

      if (selectedDeal?.id === dealId) {
        setSelectedDeal(null);
      }
    } catch (error) {
      console.error("Erro ao excluir deal:", error);
      alert("Erro ao excluir card. Tente novamente.");
    }
  }

  async function deleteColumn(columnId: string) {
    if (columns.length <= 2) {
      alert("O pipeline precisa ter no mínimo 2 colunas.");
      return;
    }

    const hasDeal = deals.some((deal) => deal.column_id === columnId);
    if (hasDeal) {
      alert("Essa coluna ainda possui cards.");
      return;
    }

    const confirmed = window.confirm("Deseja excluir esta coluna?");
    if (!confirmed) return;

    try {
      await databases.deleteDocument(DATABASE_ID, "pipeline_columns", columnId);
      setColumns((prev) => prev.filter((c) => c.id !== columnId));
    } catch (error) {
      console.error("Erro ao excluir coluna:", error);
      alert("Erro ao excluir coluna. Tente novamente.");
    }
  }

  async function handleDragEnd(result: DropResult) {
    setIsDragging(false);
    setDraggedDealId(null);
    setDragOverColumnId(null);

    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Deep-clone columns and deals before optimistic update (never mutate items in place)
    const previousColumnsSnapshot: Column[] = columns.map((col) => ({ ...col }));
    const previousDealsSnapshot: Deal[] = deals.map((deal) => ({
      ...deal,
      tags: Array.isArray(deal.tags) ? [...deal.tags] : [],
    }));

    // Always locate the moved card by its draggableId, never by source.index on unfiltered deals
    const movedOriginal = previousDealsSnapshot.find((d) => d.id === draggableId);
    if (!movedOriginal) return;

    const sameColumn = source.droppableId === destination.droppableId;

    // Unfiltered deals in source and destination columns sorted by current position
    const allSourceDeals = previousDealsSnapshot
      .filter((d) => d.column_id === source.droppableId)
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    const allDestDeals = sameColumn
      ? allSourceDeals
      : previousDealsSnapshot
          .filter((d) => d.column_id === destination.droppableId)
          .sort((a, b) => (a.position || 0) - (b.position || 0));

    // Visible (filtered) deals in the destination column excluding the moved card
    const visibleDestWithoutMoved = filteredDeals
      .filter((d) => d.column_id === destination.droppableId && d.id !== draggableId)
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    // Unfiltered destination deals excluding the moved card
    const destWithoutMoved = allDestDeals
      .filter((d) => d.id !== draggableId)
      .map((d) => ({ ...d, tags: Array.isArray(d.tags) ? [...d.tags] : [] }));

    const movedUpdated: Deal = {
      ...movedOriginal,
      tags: Array.isArray(movedOriginal.tags) ? [...movedOriginal.tags] : [],
      column_id: destination.droppableId,
    };

    // Determine exact insertion index in destWithoutMoved relative to visible cards
    let insertIndexInDest = destWithoutMoved.length;
    if (destination.index <= 0) {
      if (visibleDestWithoutMoved.length > 0) {
        const firstVisibleId = visibleDestWithoutMoved[0].id;
        const idx = destWithoutMoved.findIndex((d) => d.id === firstVisibleId);
        insertIndexInDest = idx >= 0 ? idx : 0;
      } else {
        insertIndexInDest = 0;
      }
    } else if (destination.index < visibleDestWithoutMoved.length) {
      const targetVisibleAfter = visibleDestWithoutMoved[destination.index];
      const idx = destWithoutMoved.findIndex((d) => d.id === targetVisibleAfter.id);
      insertIndexInDest = idx >= 0 ? idx : destWithoutMoved.length;
    } else if (visibleDestWithoutMoved.length > 0) {
      const lastVisibleBefore = visibleDestWithoutMoved[visibleDestWithoutMoved.length - 1];
      const idx = destWithoutMoved.findIndex((d) => d.id === lastVisibleBefore.id);
      insertIndexInDest = idx >= 0 ? idx + 1 : destWithoutMoved.length;
    }

    destWithoutMoved.splice(insertIndexInDest, 0, movedUpdated);

    const updatedDestDeals: Deal[] = destWithoutMoved.map((d, idx) => ({
      ...d,
      column_id: destination.droppableId,
      position: idx,
    }));

    const updatedSourceDeals: Deal[] = sameColumn
      ? []
      : allSourceDeals
          .filter((d) => d.id !== draggableId)
          .map((d, idx) => ({
            ...d,
            tags: Array.isArray(d.tags) ? [...d.tags] : [],
            position: idx,
          }));

    const updatedMap = new Map<string, Deal>();
    for (const d of updatedDestDeals) {
      updatedMap.set(d.id, d);
    }
    for (const d of updatedSourceDeals) {
      updatedMap.set(d.id, d);
    }

    const nextDeals: Deal[] = previousDealsSnapshot.map((d) => {
      const replacement = updatedMap.get(d.id);
      return replacement
        ? { ...replacement, tags: Array.isArray(replacement.tags) ? [...replacement.tags] : [] }
        : { ...d, tags: Array.isArray(d.tags) ? [...d.tags] : [] };
    });

    setDeals(nextDeals);

    try {
      const targetTenantId = tenant?.id || currentTenantId || "tenant_default";
      const updates = updatedDestDeals.map((d) =>
        databases.updateDocument(DATABASE_ID, "pipeline_deals", d.id, {
          position: d.position,
          column_id: d.column_id,
          tenant_id: d.tenant_id || targetTenantId,
        })
      );

      if (!sameColumn) {
        updates.push(
          ...updatedSourceDeals.map((d) =>
            databases.updateDocument(DATABASE_ID, "pipeline_deals", d.id, {
              position: d.position,
              tenant_id: d.tenant_id || targetTenantId,
            })
          )
        );
      }

      await Promise.all(updates);

      if (!sameColumn) {
        const sourceColumn = columns.find((c) => c.id === source.droppableId);
        const destinationColumn = columns.find((c) => c.id === destination.droppableId);

        const historyText = `Card movido de '${sourceColumn?.name || "Desconhecido"}' para '${destinationColumn?.name || "Desconhecido"}'.`;
        await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: draggableId,
          text: historyText,
          created_by: user?.id || null,
          tenant_id: targetTenantId,
        });

        if (
          destinationColumn?.name.toLowerCase().includes("ganho") ||
          destinationColumn?.name.toLowerCase().includes("fechad") ||
          destinationColumn?.name.toLowerCase().includes("won")
        ) {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#6366F1", "#10B981", "#F59E0B", "#FFFFFF"],
          });

          if (movedUpdated.assigned_to) {
            const formattedVal = movedUpdated.value
              ? Number(movedUpdated.value).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })
              : undefined;
            notifyDealWon(
              movedUpdated.assigned_to,
              movedUpdated.name,
              movedUpdated.id,
              formattedVal,
              targetTenantId
            ).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error("Erro ao mover card:", err);
      // Roll back strictly to the pre-drag deep snapshot
      setColumns(previousColumnsSnapshot);
      setDeals(previousDealsSnapshot);
      alert("Erro ao sincronizar movimentação do card.");
    }
  }

  async function openDealDetails(deal: Deal) {
    const details = await loadDealDetails(deal.id);
    setSelectedDeal({ ...deal, ...details });
    setActiveTab("atividades");
  }

  function closeDealDetails() {
    setSelectedDeal(null);
    if (searchParams.get("deal") || searchParams.get("dealId") || searchParams.get("tab")) {
      const next = new URLSearchParams(searchParams);
      next.delete("deal");
      next.delete("dealId");
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
    setActivityForm({
      type: "Lembrete",
      responsible: "",
      subject: "",
      scheduled_for: "",
      duration: "30",
      description: "",
    });
  }

  async function sendNotificationToUser(
    userId: string,
    title: string,
    message: string,
    type: string,
    referenceId?: string,
    referenceType?: string
  ) {
    await sendSystemNotification({
      userId,
      title,
      message,
      type,
      referenceId,
      referenceType,
      tenantId: activeTenantId || undefined,
    });
  }

  async function addActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDeal) return;

    if (!activityForm.subject.trim()) {
      alert("Informe o assunto da atividade.");
      return;
    }

    const targetTenantId = tenant?.id || currentTenantId || "tenant_default";

    try {
      const data = await databases.createDocument(DATABASE_ID, "pipeline_activities", ID.unique(), {
        deal_id: selectedDeal.id,
        type: activityForm.type,
        responsible: activityForm.responsible,
        subject: activityForm.subject,
        scheduled_for: activityForm.scheduled_for || null,
        duration: Number(activityForm.duration),
        description: activityForm.description,
        status: "Planejado",
        tenant_id: targetTenantId,
      });

      await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
        deal_id: selectedDeal.id,
        text: `Atividade criada: ${activityForm.subject}`,
        created_by: user?.id || null,
        tenant_id: targetTenantId,
      });

      if (activityForm.responsible) {
        const responsibleUser = users.find((u) => u.name === activityForm.responsible);
        if (responsibleUser && responsibleUser.id !== user?.id) {
          await sendNotificationToUser(
            responsibleUser.id,
            "Nova atividade atribuida",
            `Voce foi atribuido a atividade "${activityForm.subject}" no card "${selectedDeal.name}"`,
            "pipeline_assignment",
            data.$id || (data as any).id,
            "activity"
          );
        }
      }

      const details = await loadDealDetails(selectedDeal.id);
      setSelectedDeal({ ...selectedDeal, ...details });

      setActivityForm({
        type: "Lembrete",
        responsible: "",
        subject: "",
        scheduled_for: "",
        duration: "30",
        description: "",
      });
    } catch (error) {
      console.error("Erro ao criar atividade:", error);
      alert("Erro ao criar atividade. Tente novamente.");
    }
  }

  async function updateDealNotes(value: string) {
    if (!selectedDeal) return;

    setSelectedDeal({ ...selectedDeal, notes: value });

    try {
      await databases.updateDocument(DATABASE_ID, "pipeline_deals", selectedDeal.id, { notes: value });
    } catch (error) {
      console.error("Erro ao atualizar notas:", error);
      alert("Erro ao atualizar notas. Tente novamente.");
    }
  }

  async function updateDealContact(field: string, value: string) {
    if (!selectedDeal) return;

    const updatedDeal = {
      ...selectedDeal,
      [`contact_${field}`]: value,
    } as Deal;
    setSelectedDeal(updatedDeal);

    try {
      await databases.updateDocument(DATABASE_ID, "pipeline_deals", selectedDeal.id, {
        [`contact_${field}`]: value,
      });
    } catch (error) {
      console.error("Erro ao atualizar contato:", error);
      alert("Erro ao atualizar contato. Tente novamente.");
    }
  }

  async function toggleDealCompleted(dealId: string, currentCompleted: boolean) {
    const newCompleted = !currentCompleted;

    const updateData = {
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
      completed_by: newCompleted ? user?.id || null : null,
    };

    const previousDeal = deals.find((deal) => deal.id === dealId);

    setDeals((prev) =>
      prev.map((deal) => (deal.id === dealId ? { ...deal, ...updateData } : deal))
    );

    setSelectedDeal((prev) =>
      prev?.id === dealId ? { ...prev, ...updateData } : prev
    );

    try {
      const targetTenantId = tenant?.id || currentTenantId || "tenant_default";
      await databases.updateDocument(DATABASE_ID, "pipeline_deals", dealId, updateData);

      await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
        deal_id: dealId,
        text: newCompleted
          ? "Card marcado como concluído"
          : "Card desmarcado como concluído",
        created_by: user?.id || null,
        tenant_id: targetTenantId,
      });
    } catch (error) {
      console.error("Erro ao atualizar status de conclusão:", error);

      if (previousDeal) {
        setDeals((prev) =>
          prev.map((deal) => (deal.id === dealId ? previousDeal : deal))
        );

        setSelectedDeal((prev) =>
          prev?.id === dealId ? { ...prev, ...previousDeal } : prev
        );
      }

      alert("Erro ao atualizar status. Tente novamente.");
    }
  }

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="mx-auto max-w-[1800px] space-y-4">
          {/* Skeleton Toolbar */}
          <div className="rounded-2xl border border-slate-200/70 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-white/[0.08]" />
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-slate-200 dark:bg-white/[0.08]" />
                  <div className="h-3 w-48 rounded bg-slate-100 dark:bg-white/[0.04]" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-28 rounded-xl bg-slate-200 dark:bg-white/[0.08]" />
                <div className="h-8 w-24 rounded-xl bg-slate-200 dark:bg-white/[0.08]" />
                <div className="h-8 w-32 rounded-xl bg-indigo-200 dark:bg-indigo-500/20" />
              </div>
            </div>
          </div>

          {/* Skeleton Columns */}
          <div className="flex gap-4 overflow-hidden pb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-[315px] shrink-0 rounded-2xl bg-slate-100/60 dark:bg-[#121824] border border-slate-200/70 dark:border-white/[0.07] p-3.5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-white/[0.05]">
                  <div className="h-4 w-28 rounded bg-slate-200 dark:bg-white/[0.08]" />
                  <div className="h-4 w-8 rounded-full bg-slate-200 dark:bg-white/[0.08]" />
                </div>
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-28 rounded-xl bg-white dark:bg-[#161d2a] border border-slate-200/70 dark:border-white/[0.06] p-3.5 space-y-2.5">
                    <div className="h-3 w-20 rounded bg-slate-100 dark:bg-white/[0.05]" />
                    <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-white/[0.08]" />
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                      <div className="h-3.5 w-16 rounded bg-emerald-100 dark:bg-emerald-500/20" />
                      <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-white/[0.08]" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="mx-auto max-w-[1800px] space-y-4">
        {loadError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => loadInitialData(loadGenerationRef.current, activeTenantId)}
              className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500 transition"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Streamlined, Organized Toolbar */}
        <div className="rounded-2xl border border-slate-200/70 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-4 sm:p-5 shadow-xs space-y-3.5">
          {/* Top Row: Title, Summary & Quick Actions */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-500/25">
                  <Kanban className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                      Funil de Vendas
                    </h2>
                    <span className="flex h-5 items-center justify-center rounded-full px-2 text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      {activeDealsCount} {activeDealsCount === 1 ? "ativo" : "ativos"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Volume em aberto: <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{currencyBRL(totalPipelineValue)}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons & View mode toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleViewMode}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  compactView
                    ? "bg-indigo-50/80 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30"
                    : "border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.08]"
                }`}
                title={compactView ? "Modo Limpo ativo (menos informações visuais). Clique para modo completo." : "Modo Completo ativo. Clique para modo limpo."}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{compactView ? "Visão Limpa" : "Visão Completa"}</span>
              </button>

              <button
                type="button"
                onClick={openNewColumnModal}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs transition hover:bg-slate-50 dark:hover:bg-white/[0.08] hover:border-slate-300 active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nova Etapa</span>
              </button>

              <button
                type="button"
                onClick={() => columns.length > 0 && openQuickAdd(columns[0].id)}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-500/25 transition hover:scale-[1.01] active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Novo Negócio</span>
              </button>
            </div>
          </div>

          {/* Bottom Row: Quick Filters & Search */}
          <div className="flex flex-col gap-2.5 pt-3 border-t border-slate-100 dark:border-white/[0.06] md:flex-row md:items-center md:justify-between">
            {/* Filter Capsule Group */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-100/70 dark:bg-white/[0.04] p-1 rounded-xl border border-slate-200/60 dark:border-white/[0.05]">
              <button
                onClick={() => { setPriorityFilter("all"); setOnlyMyDeals(false); }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  priorityFilter === "all" && !onlyMyDeals
                    ? "bg-white dark:bg-[#1a2232] text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Todos ({deals.length})
              </button>

              <button
                onClick={() => setOnlyMyDeals(!onlyMyDeals)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  onlyMyDeals
                    ? "bg-indigo-600 text-white shadow-xs shadow-indigo-500/20"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <span>Meus Cards</span>
              </button>

              <button
                onClick={() => setPriorityFilter(priorityFilter === "urgente" ? "all" : "urgente")}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  priorityFilter === "urgente"
                    ? "bg-rose-500 text-white shadow-xs shadow-rose-500/20"
                    : "text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                }`}
              >
                <span>🔥 Urgentes</span>
              </button>

              <button
                onClick={() => setPriorityFilter(priorityFilter === "alta" ? "all" : "alta")}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  priorityFilter === "alta"
                    ? "bg-amber-500 text-white shadow-xs shadow-amber-500/20"
                    : "text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400"
                }`}
              >
                <span>⚡ Alta</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[260px] max-w-sm w-full md:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cliente, tag ou valor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.03] py-1.5 pl-8.5 pr-8 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Kanban Board Container */}
        <div className="overflow-x-auto pb-4">
          <DragDropContext onDragEnd={handleDragEnd} onDragStart={() => setIsDragging(true)}>
            <div className="flex min-w-max gap-4">
            {columns.map((column) => {
              const columnDeals = filteredDeals
                .filter((d) => d.column_id === column.id)
                .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
              const columnTotal = columnDeals.reduce((sum, d) => sum + (d.value || 0), 0);

              return (
                <div
                  key={column.id}
                  className="group/col flex w-[315px] shrink-0 flex-col rounded-2xl bg-slate-100/60 dark:bg-[#121824] border border-slate-200/70 dark:border-white/[0.07] shadow-xs"
                >
                  {/* Column Header */}
                  <div className="flex flex-col gap-1 px-4 pt-3 pb-2 border-b border-slate-200/50 dark:border-white/[0.05]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/10"
                          style={{ backgroundColor: column.color }}
                        />
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate tracking-tight">
                          {column.name}
                        </h3>
                        <span
                          className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold bg-slate-200/70 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300"
                        >
                          {columnDeals.length}
                        </span>
                      </div>

                      {/* Header Actions - '+' is visible, edit & delete revealed on hover */}
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openQuickAdd(column.id)}
                          className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
                          title="Novo card nesta coluna"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>

                        <div className="opacity-0 group-hover/col:opacity-100 transition-opacity flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => openEditColumnModal(column)}
                            className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
                            title="Editar coluna"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteColumn(column.id)}
                            className="rounded-lg p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                            title="Excluir coluna"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                      <span>Subtotal</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {currencyBRL(columnTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Droppable Card List */}
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[460px] flex flex-col gap-2 p-2 rounded-xl transition-colors duration-150 ${
                          snapshot.isDraggingOver
                            ? "bg-indigo-500/[0.04] dark:bg-indigo-500/[0.08] ring-2 ring-dashed ring-indigo-400/50 dark:ring-indigo-500/40"
                            : ""
                        }`}
                      >
                        {/* Inline quick-add form */}
                        {quickAddColumnId === column.id && (
                          <QuickAddCard
                            users={users}
                            onCancel={closeQuickAdd}
                            onSave={(form) => handleQuickAddSave(column.id, form)}
                          />
                        )}

                        {columnDeals.map((deal, index) => {
                          const assignedUser = users.find((u) => (u.id || (u as any).$id) === deal.assigned_to);
                          const dealPriority = normalizePriority(deal.priority);
                          const dealDueDate = normalizeDueDate(deal.due_date ?? deal.dueDate ?? null);

                          return (
                            <Draggable key={deal.id} draggableId={deal.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={provided.draggableProps.style}
                                  onClick={() => !isDragging && openDealDetails(deal)}
                                  className={`group relative rounded-xl border p-3 select-none bg-white dark:bg-[#161d2a] transition-all duration-150 cursor-pointer ${
                                    snapshot.isDragging
                                      ? "shadow-2xl ring-2 ring-indigo-500 border-indigo-500 opacity-95 z-[9999]"
                                      : "shadow-2xs hover:shadow-md hover:border-indigo-400/50 dark:hover:border-indigo-500/40"
                                  } ${
                                    deal.completed
                                      ? "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-500/[0.02]"
                                      : "border-slate-200/70 dark:border-white/[0.07]"
                                  }`}
                                >
                                  {/* Top Row: Company or Priority + Hover Actions */}
                                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      {deal.company ? (
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
                                          {deal.company}
                                        </span>
                                      ) : (
                                        <span className="text-[11px] font-medium text-slate-300 dark:text-slate-600">
                                          Oportunidade
                                        </span>
                                      )}

                                      {dealPriority === "urgente" && (
                                        <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9.5px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                          🔥 Urgente
                                        </span>
                                      )}
                                      {dealPriority === "alta" && (
                                        <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9.5px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                          ⚡ Alta
                                        </span>
                                      )}
                                      {dealPriority === "baixa" && (
                                        <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[9.5px] font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                                          Baixa
                                        </span>
                                      )}
                                    </div>

                                    {/* Action icons revealed on card hover */}
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEditDealModal(deal);
                                        }}
                                        className="rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                                        title="Editar card"
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteDeal(deal.id);
                                        }}
                                        className="rounded-md p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                        title="Excluir card"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Title & Checkbox */}
                                  <div className="flex items-start gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleDealCompleted(deal.id, deal.completed);
                                      }}
                                      className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                                        deal.completed
                                          ? "border-emerald-500 bg-emerald-500 text-white shadow-xs"
                                          : "border-slate-300 dark:border-white/20 hover:border-emerald-500 dark:hover:border-emerald-400"
                                      }`}
                                      title={deal.completed ? "Reabrir card" : "Marcar como concluído"}
                                    >
                                      {deal.completed && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                                    </button>

                                    <h4
                                      className={`flex-1 text-[13.5px] font-semibold leading-snug tracking-tight line-clamp-2 transition-colors ${
                                        deal.completed
                                          ? "line-through text-slate-400 dark:text-slate-500"
                                          : "text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                                      }`}
                                    >
                                      {deal.name}
                                    </h4>
                                  </div>

                                  {/* Company & Linked Client */}
                                  {deal.company && (
                                    <div className="flex items-center gap-1.5 mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                      <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                                      <span className="truncate">{deal.company}</span>
                                      {deal.client_id && (
                                        <span
                                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-500/30 shrink-0"
                                          title="Cliente cadastrado vinculado"
                                        >
                                          ✓ Cliente
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Detailed View Tags (Hidden in Clean Mode for Less Clutter) */}
                                  {!compactView && ((deal.tags && deal.tags.length > 0) || ((deal as any).labels && (deal as any).labels.length > 0)) && (
                                    <div className="flex flex-wrap items-center gap-1 mt-2">
                                      {(deal.tags || []).map((tag: string) => (
                                        <span
                                          key={tag}
                                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                            tagColors[tag] || "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/10"
                                          }`}
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Footer: Value, Date & Assignee */}
                                  <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/[0.05] mt-2.5 pt-2">
                                    {deal.value > 0 ? (
                                      <span className="text-[12px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                        {currencyBRL(deal.value)}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                                        R$ 0,00
                                      </span>
                                    )}

                                    <div className="flex items-center gap-1.5">
                                      {dealDueDate && (
                                        <span
                                          className="inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-400 dark:text-slate-500"
                                          title={`Prazo: ${dealDueDate}`}
                                        >
                                          <Calendar className="h-3 w-3" />
                                          {new Date(dealDueDate.includes("T") ? dealDueDate : `${dealDueDate}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                                        </span>
                                      )}

                                      {assignedUser && (
                                        <div
                                          className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-[8.5px] font-bold text-white shadow-2xs ring-1 ring-white/20"
                                          title={`Responsável: ${assignedUser.name}`}
                                        >
                                          {getInitials(assignedUser.name)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}

                        {/* Quick add trigger button */}
                        {quickAddColumnId !== column.id && (
                          <button
                            type="button"
                            onClick={() => openQuickAdd(column.id)}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 dark:border-white/10 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 hover:border-indigo-400/60 hover:bg-white/80 dark:hover:bg-white/[0.03] hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-2xs"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Adicionar card
                          </button>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
            </div>
          </DragDropContext>
        </div>
      </div>

      {showDealModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4 backdrop-blur-sm transition">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-[#161b22] shadow-2xl transition-all duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/5 px-6 py-5">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingDeal ? "Editar Card" : "Novo Card"}
              </h3>

              <button
                type="button"
                onClick={closeDealModal}
                className="rounded-xl p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveDeal} className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nome
                </label>
                <input
                  type="text"
                  value={dealForm.name}
                  onChange={(e) => setDealForm({ ...dealForm, name: e.target.value })}
                  className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 dark:placeholder:text-gray-500 outline-none transition focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-4 focus:ring-blue-100 dark:focus:ring-emerald-400/20"
                  placeholder="Ex: Pedro Henrique"
                />
              </div>

              {/* Vincular Cliente */}
              <div>
                <label className="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-indigo-500" />
                    Vincular Cliente <span className="text-xs text-gray-400 font-normal">(opcional)</span>
                  </span>
                  {dealForm.client_id && (
                    <button
                      type="button"
                      onClick={() => setDealForm({ ...dealForm, client_id: "" })}
                      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-semibold transition"
                    >
                      Desvincular
                    </button>
                  )}
                </label>

                {dealForm.client_id ? (
                  <div className="flex items-center justify-between p-3 rounded-2xl border border-indigo-200/80 dark:border-indigo-500/20 bg-indigo-50/60 dark:bg-indigo-500/10">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-indigo-950 dark:text-indigo-200 truncate">
                          {(() => {
                            const sel = clients.find(c => (c.id || c.$id) === dealForm.client_id);
                            return sel ? (sel.fantasy_name || sel.name) : dealForm.company || "Cliente Vinculado";
                          })()}
                        </div>
                        <div className="text-[11px] text-indigo-600/80 dark:text-indigo-400">
                          Cliente cadastrado vinculado
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDealForm({ ...dealForm, client_id: "" })}
                      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <select
                    value={dealForm.client_id}
                    onChange={(e) => {
                      const cid = e.target.value;
                      const selClient = clients.find(c => (c.id || c.$id) === cid);
                      setDealForm({
                        ...dealForm,
                        client_id: cid,
                        company: selClient ? (selClient.fantasy_name || selClient.name) : dealForm.company,
                      });
                    }}
                    className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 outline-none transition focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-4 focus:ring-blue-100 dark:focus:ring-emerald-400/20 text-sm"
                  >
                    <option value="">Nenhum cliente vinculado (Lead avulso)</option>
                    {clients.map((client) => {
                      const cid = client.id || client.$id;
                      return (
                        <option key={cid} value={cid}>
                          {client.fantasy_name || client.name} {client.fantasy_name && client.name !== client.fantasy_name ? `(${client.name})` : ""}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              <div className="relative" ref={companyInputRef}>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Empresa / observação
                </label>
                <input
                  type="text"
                  value={dealForm.company}
                  onChange={(e) => {
                    setDealForm({ ...dealForm, company: e.target.value });
                    setShowCompanySuggestions(true);
                  }}
                  onFocus={() => setShowCompanySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowCompanySuggestions(false), 150)}
                  className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 dark:placeholder:text-gray-500 outline-none transition focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-4 focus:ring-blue-100 dark:focus:ring-emerald-400/20"
                  placeholder="Digite ou selecione uma empresa..."
                  autoComplete="off"
                />
                {showCompanySuggestions && filteredCompanySuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161b22] shadow-lg dark:shadow-none">
                    {filteredCompanySuggestions.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onMouseDown={() => {
                          setDealForm({
                            ...dealForm,
                            client_id: client.id || client.$id || "",
                            company: client.fantasy_name || client.name,
                          });
                          setShowCompanySuggestions(false);
                        }}
                        className="flex w-full flex-col px-4 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-white/5"
                      >
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {client.fantasy_name || client.name}
                        </span>
                        {client.fantasy_name && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">{client.name}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Valor
                  </label>
                  <input
                    type="number"
                    value={dealForm.value}
                    onChange={(e) => setDealForm({ ...dealForm, value: e.target.value })}
                    className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 dark:placeholder:text-gray-500 outline-none transition focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-4 focus:ring-blue-100 dark:focus:ring-emerald-400/20"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Coluna
                  </label>
                  <select
                    value={dealForm.column_id}
                    onChange={(e) => setDealForm({ ...dealForm, column_id: e.target.value })}
                    className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 outline-none transition focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-4 focus:ring-blue-100 dark:focus:ring-emerald-400/20"
                  >
                    {columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={dealForm.tags}
                    onChange={(e) => setDealForm({ ...dealForm, tags: e.target.value })}
                    placeholder="Ex: Follow, MQL, ICP Ideal"
                    className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 dark:placeholder:text-gray-500 outline-none transition focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-4 focus:ring-blue-100 dark:focus:ring-emerald-400/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Responsavel
                  </label>
                  <select
                    value={dealForm.assigned_to}
                    onChange={(e) => setDealForm({ ...dealForm, assigned_to: e.target.value })}
                    className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 outline-none transition focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-4 focus:ring-blue-100 dark:focus:ring-emerald-400/20"
                  >
                    <option value="">Selecione um responsavel</option>
                    {users.map((u) => {
                      const uId = u.id || (u as any).$id;
                      return (
                        <option key={uId} value={uId}>
                          {u.name} ({u.role})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Ultimo contato
                  </label>
                  <input
                    type="text"
                    value={dealForm.last_contact}
                    onChange={(e) =>
                      setDealForm({ ...dealForm, last_contact: e.target.value })
                    }
                    className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 dark:placeholder:text-gray-500 outline-none transition focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-4 focus:ring-blue-100 dark:focus:ring-emerald-400/20"
                    placeholder="Ex: 2d ou 5h"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Pendências
                  </label>
                  <input
                    type="text"
                    value={dealForm.pending}
                    onChange={(e) => setDealForm({ ...dealForm, pending: e.target.value })}
                    className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 dark:placeholder:text-gray-500 outline-none transition focus:border-blue-400 dark:focus:border-emerald-400/50 focus:ring-4 focus:ring-blue-100 dark:focus:ring-emerald-400/20"
                    placeholder="Ex: 0/2"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeDealModal}
                  disabled={saving}
                  className="flex-1 rounded-2xl border border-gray-200 dark:border-white/10 px-4 py-3 font-medium text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 px-4 py-3 font-semibold text-white shadow-sm shadow-indigo-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Salvando..." : editingDeal ? "Salvar alterações" : "Criar card"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showColumnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4 backdrop-blur-sm transition">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#161b22] shadow-2xl transition-all duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/5 px-6 py-5">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingColumn ? "Editar Coluna" : "Nova Coluna"}
              </h3>

              <button
                type="button"
                onClick={closeColumnModal}
                className="rounded-xl p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveColumn} className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nome da coluna
                </label>
                <input
                  type="text"
                  value={columnForm.name}
                  onChange={(e) => setColumnForm({ ...columnForm, name: e.target.value })}
                  className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 dark:placeholder:text-gray-500 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Ex: Proposta enviada"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Cor
                </label>

                <div className="flex gap-3">
                  <input
                    type="color"
                    value={columnForm.color}
                    onChange={(e) => setColumnForm({ ...columnForm, color: e.target.value })}
                    className="h-12 w-16 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5"
                  />

                  <input
                    type="text"
                    value={columnForm.color}
                    onChange={(e) => setColumnForm({ ...columnForm, color: e.target.value })}
                    className="flex-1 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-200 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div
                className="rounded-2xl border-t-[4px] bg-gray-50 dark:bg-[#0d1117] px-4 py-4 text-sm font-semibold text-gray-800 dark:text-gray-100"
                style={{ borderTopColor: columnForm.color }}
              >
                Prévia: {columnForm.name || "Nome da coluna"}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeColumnModal}
                  disabled={saving}
                  className="flex-1 rounded-2xl border border-gray-200 dark:border-white/10 px-4 py-3 font-medium text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 px-4 py-3 font-semibold text-white shadow-sm shadow-indigo-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Salvando..." : editingColumn ? "Salvar coluna" : "Criar coluna"}
                </button>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                O pipeline precisa ter no mínimo 2 colunas.
              </p>
            </form>
          </div>
        </div>
      )}

      {selectedDeal && (
        <PipelineItemView
          key={selectedDeal.id}
          deal={selectedDeal as any}
          columns={columns as any}
          users={users as any}
          clients={clients as any}
          defaultTab={searchParams.get("tab") === "comments" || searchParams.get("tab") === "mensagens" ? "comments" : "activity"}
          onClose={closeDealDetails}
          onUpdated={(updated) => {
            const normalizedUpdated = normalizeDealRecord({ ...selectedDeal, ...updated });
            setDeals((prev) => prev.map((d) => d.id === normalizedUpdated.id ? { ...d, ...normalizedUpdated } : d));
            setSelectedDeal(normalizedUpdated);
          }}
        />
      )}
    </div>
  );
}
