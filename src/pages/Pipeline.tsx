import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Filter, Trash2, CreditCard as Edit2, X, Check, Flag, Calendar, Paperclip, Building2, Clock, Sparkles, AlertTriangle, User } from "lucide-react";
import { databases, client } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
import { useAuth } from "../context/AuthContext";
import PipelineItemView from "../components/pipeline/PipelineItemView";
import QuickAddCard from "../components/pipeline/QuickAddCard";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import confetti from "canvas-confetti";

interface Column {
  id: string;
  name: string;
  color: string;
  position: number;
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
}

interface HistoryItem {
  id: string;
  deal_id: string;
  text: string;
  created_by: string | null;
  created_at: string;
}

interface Deal {
  id: string;
  name: string;
  company: string;
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
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  activities?: Activity[];
  history?: HistoryItem[];
}

type DealFormData = {
  name: string;
  company: string;
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

const initialDealForm: DealFormData = {
  name: "",
  company: "",
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
  name: string;
  fantasy_name: string;
}

interface PipelineProps {
  initialDealId?: string | null;
  onDealOpened?: () => void;
}

export default function Pipeline({ initialDealId, onDealOpened }: PipelineProps) {
  const { user } = useAuth();
  const [columns, setColumns] = useState<Column[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<ClientSuggestion[]>([]);
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

  useEffect(() => {
  
  loadInitialData();

  const cleanup = setupRealtimeSubscriptions();

  return () => {
    cleanup?.();
  };
}, []);

  useEffect(() => {
    if (initialDealId && deals.length > 0 && !loading) {
      const deal = deals.find((d) => d.id === initialDealId);
      if (deal) {
        openDealDetails(deal);
        if (onDealOpened) {
          onDealOpened();
        }
      }
    }
  }, [initialDealId, deals, loading]);

  async function loadInitialData() {
    try {
      setLoading(true);
      await Promise.all([loadColumns(), loadDeals(), loadUsers(), loadClients()]);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    try {
      const { documents: data } = await databases.listDocuments(DATABASE_ID, "clients", [Query.orderAsc("name")]);
      setClients(data.map((d: any) => ({ id: d.$id, name: d.name, fantasy_name: d.fantasy_name })) || []);
    } catch (e) {
      console.error("Erro ao carregar clientes:", e);
    }
  }

  async function loadColumns() {
    let error = null;
    let data: any[] = [];
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, "pipeline_columns", [Query.orderAsc("position")]);
      data = documents;
    } catch (e) {
      error = e;
    }

    if (error) {
      console.error("Erro ao carregar colunas:", error);
      return;
    }

    setColumns(data.map(d => ({...d, id: d.$id})) as any || []);
  }

  async function loadDeals() {
    let error = null;
    let data: any[] = [];
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, "pipeline_deals", [Query.orderAsc("position")]);
      data = documents;
    } catch (e) {
      error = e;
    }

    if (error) {
      console.error("Erro ao carregar deals:", error);
      return;
    }

    setDeals(data.map(d => ({...d, id: d.$id})) as any || []);
  }

  async function loadUsers() {
    let error = null;
    let data: any[] = [];
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, "users_hydra", [Query.equal("is_active", true), Query.orderAsc("name")]);
      data = documents;
    } catch (e) {
      error = e;
    }

    if (error) {
      console.error("Erro ao carregar usuários:", error);
      return;
    }

    setUsers(data || []);
  }

  async function loadDealDetails(dealId: string) {
    const [activitiesRes, historyRes] = await Promise.all([
      databases.listDocuments(DATABASE_ID, "pipeline_activities", [Query.equal("deal_id", dealId), Query.orderDesc("created_at")]),
      databases.listDocuments(DATABASE_ID, "pipeline_history", [Query.equal("deal_id", dealId), Query.orderDesc("created_at")]),
    ]);

    const loadedActivities = activitiesRes.documents as any[] || [];
    const loadedHistory = historyRes.documents as any[] || [];

    setActivities(loadedActivities);
    setHistory(loadedHistory);

    return {
      activities: loadedActivities,
      history: loadedHistory,
    };
  }

  const selectedDealRef = useRef<Deal | null>(null);
  selectedDealRef.current = selectedDeal;

  function setupRealtimeSubscriptions() {
    const dealsChannel = `databases.${DATABASE_ID}.collections.pipeline_deals.documents`;
    const columnsChannel = `databases.${DATABASE_ID}.collections.pipeline_columns.documents`;
    const activitiesChannel = `databases.${DATABASE_ID}.collections.pipeline_activities.documents`;
    const historyChannel = `databases.${DATABASE_ID}.collections.pipeline_history.documents`;

    const unsubscribe = client.subscribe(
      [dealsChannel, columnsChannel, activitiesChannel, historyChannel],
      (response: any) => {
        const events: string[] = response.events || [];
        const payload = response.payload;
        if (!payload) return;

        // Pipeline Deals events
        if (events.some((e: string) => e.includes("pipeline_deals"))) {
          if (events.some((e: string) => e.includes(".create"))) {
            const newDeal: Deal = { ...payload, id: payload.$id };
            setDeals((prev) => {
              if (prev.some((d) => d.id === newDeal.id)) return prev;
              return [...prev, newDeal];
            });
          } else if (events.some((e: string) => e.includes(".update"))) {
            const updatedDeal: Deal = { ...payload, id: payload.$id };
            setDeals((prev) =>
              prev.map((d) => (d.id === updatedDeal.id ? { ...d, ...updatedDeal } : d))
            );
            if (selectedDealRef.current?.id === updatedDeal.id) {
              setSelectedDeal((prev) => (prev ? { ...prev, ...updatedDeal } : null));
            }
          } else if (events.some((e: string) => e.includes(".delete"))) {
            const deletedId = payload.$id;
            setDeals((prev) => prev.filter((d) => d.id !== deletedId));
            if (selectedDealRef.current?.id === deletedId) {
              setSelectedDeal(null);
            }
          }
        }

        // Pipeline Columns events
        if (events.some((e: string) => e.includes("pipeline_columns"))) {
          if (events.some((e: string) => e.includes(".create"))) {
            const newCol: Column = { ...payload, id: payload.$id };
            setColumns((prev) => {
              if (prev.some((c) => c.id === newCol.id)) return prev;
              return [...prev, newCol].sort((a, b) => a.position - b.position);
            });
          } else if (events.some((e: string) => e.includes(".update"))) {
            const updatedCol: Column = { ...payload, id: payload.$id };
            setColumns((prev) =>
              prev
                .map((c) => (c.id === updatedCol.id ? { ...c, ...updatedCol } : c))
                .sort((a, b) => a.position - b.position)
            );
          } else if (events.some((e: string) => e.includes(".delete"))) {
            const deletedId = payload.$id;
            setColumns((prev) => prev.filter((c) => c.id !== deletedId));
          }
        }

        // Pipeline Activities events
        if (events.some((e: string) => e.includes("pipeline_activities"))) {
          if (selectedDealRef.current && payload.deal_id === selectedDealRef.current.id) {
            if (events.some((e: string) => e.includes(".create"))) {
              setActivities((prev) => {
                if (prev.some((a) => a.id === payload.$id)) return prev;
                return [{ ...payload, id: payload.$id }, ...prev];
              });
            } else if (events.some((e: string) => e.includes(".update"))) {
              setActivities((prev) =>
                prev.map((a) => (a.id === payload.$id ? { ...payload, id: payload.$id } : a))
              );
            } else if (events.some((e: string) => e.includes(".delete"))) {
              setActivities((prev) => prev.filter((a) => a.id !== payload.$id));
            }
          }
        }

        // Pipeline History events
        if (events.some((e: string) => e.includes("pipeline_history"))) {
          if (selectedDealRef.current && payload.deal_id === selectedDealRef.current.id) {
            if (events.some((e: string) => e.includes(".create"))) {
              setHistory((prev) => {
                if (prev.some((h) => h.id === payload.$id)) return prev;
                return [{ ...payload, id: payload.$id }, ...prev];
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
      if (priorityFilter !== "all" && ((deal as any).priority || "normal") !== priorityFilter) {
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
    });
    setShowDealModal(true);
  }

  function openEditDealModal(deal: Deal) {
    setEditingDeal(deal);
    setDealForm({
      name: deal.name,
      company: deal.company || "",
      value: String(deal.value || ""),
      column_id: deal.column_id,
      tags: deal.tags.join(", "),
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

    const dealData = {
      name: dealForm.name.trim(),
      company: dealForm.company.trim(),
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
    };

    setSaving(true);
    try {
      if (editingDeal) {
        const previousAssignedTo = editingDeal.assigned_to;

        console.log("Atualizando deal:", editingDeal.id, dealData);
        let error = null;
        try {
          await databases.updateDocument(DATABASE_ID, "pipeline_deals", editingDeal.id, dealData);
        } catch (e) { error = e; }

        if (error) {
          console.error("Erro do Supabase ao atualizar:", error);
          throw error;
        }

        console.log("Deal atualizado com sucesso!");

        await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: editingDeal.id,
          text: "Card editado.",
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
        console.log("Criando novo deal:", dealData);
        let error = null;
        let newDeal = null;
        try {
          newDeal = await databases.createDocument(DATABASE_ID, "pipeline_deals", ID.unique(), dealData);
          if (newDeal) newDeal = { ...newDeal, id: newDeal.$id };
        } catch (e) { error = e; }

        if (error) {
          console.error("Erro do Supabase ao criar:", error);
          throw error;
        }

        console.log("Deal criado com sucesso:", newDeal);

        await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: newDeal?.id,
          text: "Card criado.",
        });

        if (dealForm.assigned_to && dealForm.assigned_to !== user?.id) {
          await sendNotificationToUser(
            dealForm.assigned_to,
            "Voce foi atribuido a um novo card",
            `Voce foi atribuido como responsavel pelo card "${dealForm.name}"`,
            "pipeline_assignment",
            newDeal?.id as string,
            "deal"
          );
        }

        closeDealModal();
        await loadDeals();
        // Auto-open the newly created deal in the task view
        setSelectedDeal(newDeal as unknown as Deal);
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

    setSaving(true);
    try {
      if (editingColumn) {
        console.log("Atualizando coluna:", editingColumn.id, columnForm);
        try {
          await databases.updateDocument(DATABASE_ID, "pipeline_columns", editingColumn.id, {
            name: columnForm.name.trim(),
            color: columnForm.color,
          });
        } catch (error) {
          console.error("Erro ao atualizar coluna:", error);
          throw error;
        }

        console.log("Coluna atualizada com sucesso!");
      } else {
        console.log("Criando nova coluna:", columnForm);
        try {
          await databases.createDocument(DATABASE_ID, "pipeline_columns", ID.unique(), {
            name: columnForm.name.trim(),
            color: columnForm.color,
            position: columns.length,
          });
        } catch (error) {
          console.error("Erro ao criar coluna:", error);
          throw error;
        }

        console.log("Coluna criada com sucesso!");
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

    // Se soltou fora de qualquer coluna
    if (!destination) return;

    // Se soltou no mesmo lugar
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Atualização otimista
    const newDeals = Array.from(deals);
    
    // Separa os deals da coluna de origem e destino
    const sourceDeals = newDeals.filter(d => d.column_id === source.droppableId).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
    const destDeals = source.droppableId === destination.droppableId 
      ? sourceDeals 
      : newDeals.filter(d => d.column_id === destination.droppableId).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));

    // Remove do index original
    const [reorderedItem] = sourceDeals.splice(source.index, 1);
    
    // Atualiza a coluna e insere no novo index
    reorderedItem.column_id = destination.droppableId;
    destDeals.splice(destination.index, 0, reorderedItem);

    // Recalcula positions da coluna de origem
    sourceDeals.forEach((d, idx) => { d.position = idx; });
    // Recalcula positions da coluna de destino se for diferente
    if (source.droppableId !== destination.droppableId) {
      destDeals.forEach((d, idx) => { d.position = idx; });
    }

    setDeals(newDeals); // Atualiza UI instantaneamente

    try {
      // Prepara atualizações pro DB
      const updates = destDeals.map(d => 
        databases.updateDocument(DATABASE_ID, "pipeline_deals", d.id, { position: d.position, column_id: d.column_id })
      );
      
      if (source.droppableId !== destination.droppableId) {
        updates.push(...sourceDeals.map(d => 
          databases.updateDocument(DATABASE_ID, "pipeline_deals", d.id, { position: d.position })
        ));
      }

      await Promise.all(updates);

      // Histórico e Confete (se mudou de coluna)
      if (source.droppableId !== destination.droppableId) {
        const sourceColumn = columns.find(c => c.id === source.droppableId);
        const destinationColumn = columns.find(c => c.id === destination.droppableId);
        
        const historyText = `Card movido de '${sourceColumn?.name || "Desconhecido"}' para '${destinationColumn?.name || "Desconhecido"}'.`;
        await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
          deal_id: draggableId,
          text: historyText,
          created_by: user?.id || null,
        });
        
        // CRM Automation: Celebrate on final stage
        if (destinationColumn?.name.toLowerCase().includes("ganho") || destinationColumn?.name.toLowerCase().includes("fechad") || destinationColumn?.name.toLowerCase().includes("won")) {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#6366F1', '#10B981', '#F59E0B', '#FFFFFF']
          });
        }
      }
    } catch (err) {
      console.error("Erro ao mover card:", err);
      alert("Erro ao sincronizar movimentação do card.");
      loadDeals(); // Reverte para o que está no DB em caso de erro
    }
  }

  async function openDealDetails(deal: Deal) {
    const details = await loadDealDetails(deal.id);
    setSelectedDeal({ ...deal, ...details });
    setActiveTab("atividades");
  }

  function closeDealDetails() {
    setSelectedDeal(null);
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
    try {
      await databases.createDocument(DATABASE_ID, "notifications", ID.unique(), {
        user_id: userId,
        title,
        message,
        type,
        reference_id: referenceId || null,
        reference_type: referenceType || null,
      });
    } catch (error) {
      console.error("Erro ao enviar notificacao:", error);
    }
  }

  async function addActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDeal) return;

    if (!activityForm.subject.trim()) {
      alert("Informe o assunto da atividade.");
      return;
    }

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
        });

      await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
        deal_id: selectedDeal.id,
        text: `Atividade criada: ${activityForm.subject}`,
      });

      if (activityForm.responsible) {
        const responsibleUser = users.find(
          (u) => u.name === activityForm.responsible
        );
        if (responsibleUser && responsibleUser.id !== user?.id) {
          await sendNotificationToUser(
            responsibleUser.id,
            "Nova atividade atribuida",
            `Voce foi atribuido a atividade "${activityForm.subject}" no card "${selectedDeal.name}"`,
            "pipeline_assignment",
            data.id,
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
      console.log("Atualizando notas do deal:", selectedDeal.id);
      await databases.updateDocument(DATABASE_ID, "pipeline_deals", selectedDeal.id, { notes: value });

      console.log("Notas atualizadas com sucesso!");
    } catch (error) {
      console.error("Erro ao atualizar notas:", error);
      alert("Erro ao atualizar notas. Tente novamente.");
    }
  }

  async function updateDealContact(field: string, value: string) {
    if (!selectedDeal) return;

    const updatedDeal = {
      ...selectedDeal,
      [`contact_${field}`]: value
    } as Deal;
    setSelectedDeal(updatedDeal);

    try {
      console.log(`Atualizando contato ${field} do deal:`, selectedDeal.id);
      await databases.updateDocument(DATABASE_ID, "pipeline_deals", selectedDeal.id, { [`contact_${field}`]: value });

      console.log("Contato atualizado com sucesso!");
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
    prev.map((deal) =>
      deal.id === dealId ? { ...deal, ...updateData } : deal
    )
  );

  setSelectedDeal((prev) =>
    prev?.id === dealId ? { ...prev, ...updateData } : prev
  );

  try {
    await databases.updateDocument(DATABASE_ID, "pipeline_deals", dealId, updateData);

    await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), {
      deal_id: dealId,
      text: newCompleted
        ? "Card marcado como concluído"
        : "Card desmarcado como concluído",
      created_by: user?.id || null,
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
      <div className="min-h-screen bg-[#f6f7fb] dark:bg-[#0d1117] flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Carregando pipeline...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-[1800px] space-y-5">
        {/* Ultra-Modern Kanban Toolbar */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs space-y-4">
          {/* Top row: Metrics + Actions */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-500/25">
                  <Filter className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                    Funil de Vendas
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Operação Comercial & Oportunidades
                  </p>
                </div>
              </div>

              <div className="h-5 w-px bg-slate-200 dark:bg-white/[0.08] mx-1 hidden sm:block" />

              {/* Total pipeline value badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08]">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total em Pipeline:</span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {currencyBRL(totalPipelineValue)}
                </span>
              </div>

              {/* Active deals counter badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] text-xs">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{activeDealsCount}</span>
                <span className="font-medium text-slate-500 dark:text-slate-400">negócios ativos</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={openNewColumnModal}
                className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs transition hover:bg-slate-50 dark:hover:bg-white/[0.08] hover:border-slate-300 active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nova Etapa</span>
              </button>

              <button
                type="button"
                onClick={() => columns.length > 0 && openQuickAdd(columns[0].id)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-indigo-500/25 transition hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo Negócio</span>
              </button>
            </div>
          </div>

          {/* Bottom row: Search & Quick Filter Pills */}
          <div className="flex flex-col gap-3 pt-3 border-t border-slate-100 dark:border-white/[0.06] md:flex-row md:items-center md:justify-between">
            {/* Quick Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1">
                Filtrar:
              </span>

              <button
                onClick={() => { setPriorityFilter("all"); setOnlyMyDeals(false); }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  priorityFilter === "all" && !onlyMyDeals
                    ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs"
                    : "bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/[0.08]"
                }`}
              >
                Todos ({deals.length})
              </button>

              <button
                onClick={() => setOnlyMyDeals(!onlyMyDeals)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  onlyMyDeals
                    ? "bg-indigo-600 text-white shadow-xs shadow-indigo-500/30"
                    : "bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/[0.08]"
                }`}
              >
                <span>👤 Meus Cards</span>
              </button>

              <button
                onClick={() => setPriorityFilter(priorityFilter === "urgente" ? "all" : "urgente")}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  priorityFilter === "urgente"
                    ? "bg-rose-500 text-white shadow-xs shadow-rose-500/30"
                    : "bg-slate-100 dark:bg-white/[0.04] text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                }`}
              >
                <span>🔥 Urgentes</span>
              </button>

              <button
                onClick={() => setPriorityFilter(priorityFilter === "alta" ? "all" : "alta")}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  priorityFilter === "alta"
                    ? "bg-amber-500 text-white shadow-xs shadow-amber-500/30"
                    : "bg-slate-100 dark:bg-white/[0.04] text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                }`}
              >
                <span>⚡ Alta Prioridade</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cliente, tag ou valor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.04] py-1.5 pl-9 pr-4 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
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
                  className="flex w-[325px] shrink-0 flex-col rounded-2xl bg-slate-100/70 dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs"
                >
                  {/* Column Header */}
                  <div className="flex flex-col gap-1.5 px-4 pt-3.5 pb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/10"
                          style={{ backgroundColor: column.color }}
                        />
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate tracking-tight">
                          {column.name}
                        </h3>
                        <span
                          className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold bg-slate-200/70 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300"
                        >
                          {columnDeals.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openQuickAdd(column.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
                          title="Novo card"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditColumnModal(column)}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
                          title="Editar coluna"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteColumn(column.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                          title="Excluir coluna"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11.5px] text-slate-500 dark:text-slate-400">
                      <span>Total em aberto</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
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
                        className={`min-h-[500px] flex flex-col gap-2.5 p-2.5 rounded-xl transition-colors duration-150 ${
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
                            onSave={async (form) => {
                              setQuickAddSaving(true);
                              try {
                                let error = null;
                                let newDeal = null;
                                try {
                                  newDeal = await databases.createDocument(DATABASE_ID, "pipeline_deals", ID.unique(), {
                                    name: form.name.trim(),
                                    company: "",
                                    value: 0,
                                    column_id: column.id,
                                    tags: form.label ? [form.label] : [],
                                    last_contact: "0d",
                                    pending: "0/0",
                                    notes: "",
                                    contact_phone: "",
                                    contact_email: "",
                                    contact_company: "",
                                    contact_position: "",
                                    assigned_to: form.assigned_to || null,
                                  });
                                  if (newDeal) newDeal = { ...newDeal, id: newDeal.$id };
                                } catch (e) { error = e; }
                                if (error) throw error;
                                if (newDeal) {
                                  await databases.createDocument(DATABASE_ID, "pipeline_history", ID.unique(), { deal_id: newDeal.id, text: "Card criado.", created_by: user?.id || null });
                                  closeQuickAdd();
                                  await loadDeals();
                                  setSelectedDeal(newDeal as unknown as Deal);
                                }
                              } catch (err) {
                                console.error("Erro ao criar card:", err);
                              } finally {
                                setQuickAddSaving(false);
                              }
                            }}
                          />
                        )}

                        {columnDeals.map((deal, index) => {
                          const assignedUser = users.find((u) => u.id === deal.assigned_to);
                          const priorityColors: Record<string, string> = {
                            urgente: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
                            alta: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                            normal: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                            baixa: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
                          };
                          const priorityLabels: Record<string, string> = {
                            urgente: "Urgente",
                            alta: "Alta",
                            normal: "Normal",
                            baixa: "Baixa",
                          };
                          const dealPriority = (deal as any).priority || "normal";
                          const dealDueDate = (deal as any).due_date as string | null;

                          return (
                            <Draggable key={deal.id} draggableId={deal.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={provided.draggableProps.style}
                                  onClick={() => !isDragging && openDealDetails(deal)}
                                  className={`group relative rounded-xl border p-3 select-none bg-white dark:bg-[#161d2a] transition-colors transition-shadow duration-150 ${
                                    snapshot.isDragging
                                      ? "shadow-2xl ring-2 ring-indigo-500 border-indigo-500 opacity-95 z-[9999]"
                                      : "shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-white/20"
                                  } ${
                                    deal.completed
                                      ? "border-emerald-500/25 bg-emerald-50/30 dark:bg-emerald-500/[0.03]"
                                      : "border-slate-200/80 dark:border-white/[0.07]"
                                  }`}
                                >
                                  {/* Top row: Checkbox, Name, and Hover Actions */}
                                  <div className="flex items-start gap-2.5">
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
                                      className={`flex-1 text-[13.5px] font-semibold leading-snug tracking-tight transition-colors line-clamp-2 ${
                                        deal.completed
                                          ? "line-through text-slate-400 dark:text-slate-500"
                                          : "text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                                      }`}
                                    >
                                      {deal.name}
                                    </h4>

                                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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

                                  {/* Company Name if present */}
                                  {deal.company && (
                                    <div className="flex items-center gap-1.5 mt-1.5 pl-6.5 text-[11.5px] text-slate-500 dark:text-slate-400 font-medium">
                                      <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="truncate">{deal.company}</span>
                                    </div>
                                  )}

                                  {/* Tags & Priority Row */}
                                  {(dealPriority !== "normal" || (deal.tags && deal.tags.length > 0) || (deal as any).labels?.length > 0) && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                      {dealPriority && dealPriority !== "normal" && (
                                        <span
                                          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                            priorityColors[dealPriority] || "bg-slate-500/10 text-slate-500 border-slate-500/20"
                                          }`}
                                        >
                                          <Flag className="h-2.5 w-2.5" />
                                          {priorityLabels[dealPriority] || dealPriority}
                                        </span>
                                      )}

                                      {(deal.tags || []).map((tag: string) => (
                                        <span
                                          key={tag}
                                          className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors ${
                                            tagColors[tag] || "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/10"
                                          }`}
                                        >
                                          {tag}
                                        </span>
                                      ))}

                                      {((deal as any).labels || []).map((lbl: string) => (
                                        <span
                                          key={lbl}
                                          className="rounded-md bg-slate-100 dark:bg-white/5 px-2 py-0.5 text-[10.5px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/10"
                                        >
                                          {lbl}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Footer: Value & Metadata (Assignee, Date) */}
                                  <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/[0.06] mt-3 pt-2.5">
                                    {deal.value > 0 ? (
                                      <span className="inline-flex items-center rounded-md bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                                        {currencyBRL(deal.value)}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-slate-400 italic">Sem valor</span>
                                    )}

                                    <div className="flex items-center gap-2">
                                      {dealDueDate && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                          <Calendar className="h-3 w-3 text-slate-400" />
                                          {new Date(dealDueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                                        </span>
                                      )}

                                      {assignedUser && (
                                        <div
                                          className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-[8.5px] font-bold text-white shadow-xs ring-1 ring-white/20"
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
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 dark:border-white/10 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:border-indigo-500/50 hover:bg-white dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-2xs"
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
                          setDealForm({ ...dealForm, company: client.fantasy_name || client.name });
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
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
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
          deal={selectedDeal as any}
          columns={columns as any}
          users={users as any}
          onClose={closeDealDetails}
          onUpdated={(updated) => {
            setDeals((prev) => prev.map((d) => d.id === updated.id ? { ...d, ...updated } : d));
            setSelectedDeal({ ...selectedDeal, ...updated } as any);
          }}
        />
      )}
    </div>
  );
}
