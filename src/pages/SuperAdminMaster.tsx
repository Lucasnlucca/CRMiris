import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ID } from 'appwrite';
import { storage } from '../lib/appwrite';
import {
  Building2,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Globe,
  Lock,
  Unlock,
  Users,
  LayoutDashboard,
  Palette,
  Clock,
  Sparkles,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  PauseCircle,
  PlayCircle,
  Database,
  ArrowRight,
  Eye,
  Sliders,
  Check,
  AlertTriangle,
  GitBranch,
  LifeBuoy,
  FileText,
  FileCheck2,
  Package,
  BookUser,
  Bell,
  PhoneCall,
  UploadCloud,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import { useTenant, Tenant } from '../context/TenantContext';
import { useAuth } from '../context/AuthContext';
import {
  fetchAdminTenants,
  createAdminTenant,
  updateAdminTenant,
  CreateTenantPayload,
  UpdateTenantPayload,
} from '../lib/adminTenantsApi';
import { ALL_CRM_MENUS } from '../lib/tenantUsersApi';
import {
  fetchPolicyStatus,
  toggleGlobalLockdown,
  toggleModulePause,
  toggleGranularRule,
  ModulePolicyStatus,
  AdminAuditLogEntry,
  PolicyStatusResponse,
} from '../lib/adminPolicyApi';
import { optimizeLogoImage, MAX_LOGO_FILE_SIZE } from '../lib/imageOptimizer';

// Cores pré-definidas exatamente iguais às do print do usuário
const PRESET_COLORS = [
  { name: 'Verde Esmeralda', hex: '#10b981' },
  { name: 'Azul Real', hex: '#3b82f6' },
  { name: 'Roxo / Lavanda', hex: '#8b5cf6' },
  { name: 'Laranja Solar', hex: '#f97316' },
  { name: 'Rosa Vibrante', hex: '#ec4899' },
  { name: 'Amarelo Ouro', hex: '#eab308' },
  { name: 'Ciano / Turquesa', hex: '#06b6d4' },
  { name: 'Vermelho Carmim', hex: '#ef4444' },
];

const ICON_MAP: Record<string, React.ElementType> = {
  Users,
  GitBranch,
  LifeBuoy,
  FileText,
  FileCheck2,
  Package,
  BookUser,
  Sparkles,
  Bell,
};

function parseAllowedMenus(settingsJson?: string): string[] {
  const defaultMenus = ALL_CRM_MENUS.map((m) => m.id);
  if (!settingsJson) return defaultMenus;
  try {
    const parsed = JSON.parse(settingsJson);
    if (Array.isArray(parsed.allowed_menus)) {
      return parsed.allowed_menus;
    }
  } catch {}
  return defaultMenus;
}

interface SuperAdminMasterProps {
  defaultTab?: 'dashboard' | 'tenants' | 'branding' | 'policy';
}

export default function SuperAdminMaster({ defaultTab = 'dashboard' }: SuperAdminMasterProps) {
  const { isSuperAdmin, tenant: currentActiveTenant, setTenant, refreshTenants } = useTenant();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Aba ativa com suporte a URL query param ?tab=...
  const tabFromUrl = searchParams.get('tab') as 'dashboard' | 'tenants' | 'branding' | 'policy' | null;
  const activeTab = tabFromUrl || defaultTab;

  const handleTabChange = (newTab: 'dashboard' | 'tenants' | 'branding' | 'policy') => {
    setSearchParams({ tab: newTab });
  };

  // Estado geral de Tenants
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');

  // Modais de Criação / Edição de Tenant
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form State para Tenants
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    trade_name: '',
    document: '',
    email: '',
    phone: '',
    status: 'active' as 'active' | 'suspended' | 'trial' | 'cancelled',
    plan: 'pro' as 'free' | 'starter' | 'pro' | 'enterprise',
    logo_url: '',
    primary_color: '#4f46e5',
    allowed_menus: ALL_CRM_MENUS.map((m) => m.id),
  });

  // Estado da aba de Personalização (Branding)
  const [selectedBrandingTenantId, setSelectedBrandingTenantId] = useState<string>('');
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string>('');
  const [brandingColor, setBrandingColor] = useState<string>('#3b82f6');
  const [savingBranding, setSavingBranding] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const brandingFileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Processador de upload de arquivo de logo (Otimizador de imagem + Storage / Base64 fallback resiliente)
  const handleFileUpload = async (file: File, isModal: boolean = false) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione um arquivo de imagem válido (PNG, SVG, JPG, WebP).');
      return;
    }

    if (file.size > MAX_LOGO_FILE_SIZE) {
      setError('O arquivo de imagem deve ter no máximo 5MB.');
      return;
    }

    setUploadingLogo(true);
    setError(null);

    try {
      // Otimiza proporcionalmente no Canvas preservando transparência alfa (PNG/WebP) e SVGs vetoriais
      const optimizedDataUrl = await optimizeLogoImage(file);

      const bucketId = import.meta.env.VITE_APPWRITE_BUCKET_ID || 'crm_attachments';
      let uploadedUrl = '';

      try {
        const fileId = ID.unique();
        await storage.createFile(bucketId, fileId, file);
        uploadedUrl = storage.getFileView(bucketId, fileId).toString();
      } catch (storageErr: any) {
        console.warn('[Storage] Upload via bucket não disponível, utilizando imagem otimizada em alta definição:', storageErr?.message);
      }

      if (!uploadedUrl) {
        uploadedUrl = optimizedDataUrl;
      }

      if (isModal) {
        setFormData((prev) => ({ ...prev, logo_url: uploadedUrl }));
      } else {
        setBrandingLogoUrl(uploadedUrl);
      }

      setSuccessNotice(`Arquivo da logo "${file.name}" carregado com sucesso!`);
    } catch (err: any) {
      setError(err.message || 'Falha ao processar arquivo da logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Estado da aba de Políticas & Disjuntores
  const [policyDbId, setPolicyDbId] = useState<'crm_isolated_test' | 'crm_db'>('crm_db');
  const [policyTenantId, setPolicyTenantId] = useState<string>(currentActiveTenant?.id || 'tenant_default');
  const [policyData, setPolicyData] = useState<PolicyStatusResponse | null>(null);
  const [policyLoading, setPolicyLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showExplainBox, setShowExplainBox] = useState<boolean>(true);
  const [showLockdownModal, setShowLockdownModal] = useState<boolean>(false);
  const [lockdownReason, setLockdownReason] = useState<string>('');
  const [pauseModalTarget, setPauseModalTarget] = useState<ModulePolicyStatus | null>(null);
  const [modulePauseReason, setModulePauseReason] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>([]);
  const [policySubTab, setPolicySubTab] = useState<'modules' | 'audit'>('modules');

  // Carrega lista de empresas
  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminTenants();
      setTenants(res.tenants || []);
      if (res.tenants?.length > 0 && !selectedBrandingTenantId) {
        const initial = currentActiveTenant || res.tenants[0];
        setSelectedBrandingTenantId(initial.id);
        setBrandingLogoUrl(initial.logo_url || '');
        setBrandingColor(initial.primary_color || '#3b82f6');
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar lista de empresas.');
    } finally {
      setLoading(false);
    }
  }, [currentActiveTenant, selectedBrandingTenantId]);

  // Carrega status das políticas
  const loadPolicy = useCallback(async () => {
    setPolicyLoading(true);
    try {
      const data = await fetchPolicyStatus(policyDbId, policyTenantId);
      setPolicyData(data);
      setAuditLogs(data.auditLogs || []);
    } catch (err: any) {
      console.warn('[Policy] Erro ao carregar status:', err.message);
    } finally {
      setPolicyLoading(false);
    }
  }, [policyDbId, policyTenantId]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (activeTab === 'policy') {
      loadPolicy();
    }
  }, [activeTab, loadPolicy]);

  // Auto-dismiss alertas
  useEffect(() => {
    if (successNotice) {
      const timer = setTimeout(() => setSuccessNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successNotice]);

  // Atualiza form da personalização quando o tenant selecionado muda
  const handleSelectBrandingTenant = (tenantId: string) => {
    setSelectedBrandingTenantId(tenantId);
    const t = tenants.find((item) => item.id === tenantId);
    if (t) {
      setBrandingLogoUrl(t.logo_url || '');
      setBrandingColor(t.primary_color || '#3b82f6');
    }
  };

  // Salvar Personalização
  const handleSaveBranding = async () => {
    if (!selectedBrandingTenantId) return;
    setSavingBranding(true);
    setError(null);
    try {
      const target = tenants.find((t) => t.id === selectedBrandingTenantId);
      if (!target) throw new Error('Empresa não encontrada.');

      const payload: UpdateTenantPayload = {
        logo_url: brandingLogoUrl.trim(),
        primary_color: brandingColor,
      };

      const res = await updateAdminTenant(selectedBrandingTenantId, payload);
      if (res.tenant?.logo_url) {
        setBrandingLogoUrl(res.tenant.logo_url);
      }
      setSuccessNotice(`Personalização de "${target.name}" salva com sucesso!`);
      await loadTenants();
      await refreshTenants();
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar personalização.');
    } finally {
      setSavingBranding(false);
    }
  };

  // Criar / Editar Tenant Modal Handlers
  const handleOpenCreate = () => {
    setFormData({
      name: '',
      slug: '',
      trade_name: '',
      document: '',
      email: '',
      phone: '',
      status: 'active',
      plan: 'pro',
      logo_url: '',
      primary_color: '#3b82f6',
      allowed_menus: ALL_CRM_MENUS.map((m) => m.id),
    });
    setEditingTenant(null);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (t: Tenant) => {
    setEditingTenant(t);
    setFormData({
      name: t.name || '',
      slug: t.slug || '',
      trade_name: t.trade_name || t.name || '',
      document: t.document || '',
      email: t.email || '',
      phone: t.phone || '',
      status: t.status || 'active',
      plan: t.plan || 'pro',
      logo_url: t.logo_url || '',
      primary_color: t.primary_color || '#3b82f6',
      allowed_menus: parseAllowedMenus(t.settings_json),
    });
    setShowCreateModal(true);
  };

  const handleToggleAllowedMenu = (menuId: string) => {
    setFormData((prev) => {
      const exists = prev.allowed_menus.includes(menuId);
      const next = exists
        ? prev.allowed_menus.filter((id) => id !== menuId)
        : [...prev.allowed_menus, menuId];
      return { ...prev, allowed_menus: next };
    });
  };

  const handleSlugAutoGenerate = (name: string) => {
    if (!editingTenant) {
      const generated = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormData((prev) => ({ ...prev, name, slug: generated }));
    } else {
      setFormData((prev) => ({ ...prev, name }));
    }
  };

  const handleSubmitTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    let existingSettings: Record<string, any> = {};
    if (editingTenant && editingTenant.settings_json) {
      try {
        existingSettings = JSON.parse(editingTenant.settings_json);
      } catch {}
    }

    const settingsJson = JSON.stringify({
      ...existingSettings,
      allowed_menus: formData.allowed_menus,
      domain: `${formData.slug}.lvplataform.com.br`,
    });

    try {
      if (editingTenant) {
        const payload: UpdateTenantPayload = {
          name: formData.name,
          slug: formData.slug,
          trade_name: formData.trade_name,
          document: formData.document,
          email: formData.email,
          phone: formData.phone,
          status: formData.status,
          plan: formData.plan,
          logo_url: formData.logo_url,
          primary_color: formData.primary_color,
          settings_json: settingsJson,
        };
        const res = await updateAdminTenant(editingTenant.id, payload);
        setSuccessNotice(res.message);
      } else {
        const payload: CreateTenantPayload = {
          name: formData.name,
          slug: formData.slug,
          trade_name: formData.trade_name,
          document: formData.document,
          email: formData.email,
          phone: formData.phone,
          status: formData.status,
          plan: formData.plan,
          logo_url: formData.logo_url,
          primary_color: formData.primary_color,
          settings_json: settingsJson,
        };
        const res = await createAdminTenant(payload);
        setSuccessNotice(res.message);
      }

      setShowCreateModal(false);
      await loadTenants();
      await refreshTenants();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar informações da empresa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Políticas: Lockdown Handler
  const handleToggleLockdown = async () => {
    if (!policyData) return;
    const nextState = !policyData.globalLockdown;
    setActionLoading('lockdown');
    try {
      const res = await toggleGlobalLockdown(
        nextState,
        lockdownReason || undefined,
        policyDbId,
        policyData.stateVersion
      );
      setSuccessNotice(res.message);
      setShowLockdownModal(false);
      setLockdownReason('');
      await loadPolicy();
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar Lockdown Global.');
    } finally {
      setActionLoading(null);
    }
  };

  // Políticas: Pausar Módulo
  const handleToggleModulePause = async (mod: ModulePolicyStatus) => {
    const nextPaused = !mod.isPaused;
    if (nextPaused) {
      setPauseModalTarget(mod);
      setModulePauseReason('');
      return;
    }

    setActionLoading(`pause-${mod.activeCollection}`);
    try {
      const res = await toggleModulePause(mod.activeCollection, false, undefined, policyDbId, policyData?.stateVersion);
      setSuccessNotice(res.message);
      await loadPolicy();
    } catch (err: any) {
      setError(err.message || 'Erro ao pausar/retomar módulo.');
    } finally {
      setActionLoading(null);
    }
  };

  const confirmModulePause = async () => {
    if (!pauseModalTarget) return;
    setActionLoading(`pause-${pauseModalTarget.activeCollection}`);
    try {
      const res = await toggleModulePause(
        pauseModalTarget.activeCollection,
        true,
        modulePauseReason || undefined,
        policyDbId,
        policyData?.stateVersion
      );
      setSuccessNotice(res.message);
      setPauseModalTarget(null);
      setModulePauseReason('');
      await loadPolicy();
    } catch (err: any) {
      setError(err.message || 'Erro ao pausar módulo.');
    } finally {
      setActionLoading(null);
    }
  };

  // Políticas: Regra Granular
  const handleToggleGranularRule = async (collection: string, action: 'create' | 'update' | 'delete', currentAllowed: boolean) => {
    const nextAllowed = !currentAllowed;
    setActionLoading(`rule-${collection}-${action}`);
    try {
      const res = await toggleGranularRule(collection, action, nextAllowed, undefined, policyDbId, policyData?.stateVersion);
      setSuccessNotice(res.message);
      await loadPolicy();
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar regra de escrita.');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtros de Tenants
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch =
        (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.trade_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.slug || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.document || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.email || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tenants, searchTerm, statusFilter]);

  const activeTenantsCount = useMemo(() => tenants.filter((t) => t.status === 'active').length, [tenants]);
  const trialTenantsCount = useMemo(() => tenants.filter((t) => t.status === 'trial').length, [tenants]);
  const pausedModulesCount = useMemo(() => (policyData?.modules || []).filter((m) => m.isPaused).length, [policyData]);

  const selectedTenantObj = useMemo(
    () => tenants.find((t) => t.id === selectedBrandingTenantId) || tenants[0] || null,
    [tenants, selectedBrandingTenantId]
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header conforme Imagem 3 */}
      <div className="border-b border-slate-200 dark:border-white/10 pb-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-500/20">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Administração
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Gestão e financeiro, gestão de clientes e configurações do sistema SaaS.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                loadTenants();
                if (activeTab === 'policy') loadPolicy();
              }}
              disabled={loading || policyLoading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading || policyLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition text-sm font-semibold shadow-sm shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              Novo CRM / Empresa
            </button>
          </div>
        </div>

        {/* Abas Horizontais conforme Imagem 3 */}
        <div className="flex items-center gap-2 mt-6 overflow-x-auto no-scrollbar">
          <button
            onClick={() => handleTabChange('dashboard')}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>

          <button
            onClick={() => handleTabChange('tenants')}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'tenants'
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Clientes (CRMs)
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
              {tenants.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('branding')}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'branding'
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <Palette className="w-4 h-4" />
            Personalização
          </button>

          <button
            onClick={() => handleTabChange('policy')}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'policy'
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Políticas & Disjuntores
            {pausedModulesCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                {pausedModulesCount} pausado(s)
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Alertas Globais */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-semibold hover:underline">
            Fechar
          </button>
        </div>
      )}

      {successNotice && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="text-xs font-semibold hover:underline">
            Fechar
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 1: DASHBOARD MASTER                                                   */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Cards de Métricas do SaaS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {tenants.length}
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total de Empresas (CRMs)
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {activeTenantsCount}
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  CRMs Ativos & Operacionais
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {trialTenantsCount}
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Contas em Período Trial
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                policyData?.globalLockdown
                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600'
                  : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}>
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className={`text-base font-bold ${
                  policyData?.globalLockdown ? 'text-rose-600' : 'text-slate-900 dark:text-white'
                }`}>
                  {policyData?.globalLockdown ? 'LOCKDOWN ATIVO' : 'DISJUNTORES: NORMAL'}
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Write Policy Engine Ativo
                </div>
              </div>
            </div>
          </div>

          {/* Visão Rápida dos Clientes do CRM */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Empresas Clientes Ativas no CRM
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Organizações com instância dedicada operando na plataforma
                </p>
              </div>
              <button
                onClick={() => handleTabChange('tenants')}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Ver todos os clientes <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/5 text-xs font-semibold text-slate-400">
                    <th className="pb-3">Empresa</th>
                    <th className="pb-3">Subdomínio</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Plano</th>
                    <th className="pb-3 text-right">Ação Rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {tenants.slice(0, 6).map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                      <td className="py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                            style={{ backgroundColor: t.primary_color || '#3b82f6' }}
                          >
                            {t.logo_url ? (
                              <img src={t.logo_url} alt={t.name} className="w-6 h-6 object-contain" />
                            ) : (
                              (t.name || 'E').substring(0, 2).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {t.trade_name || t.name}
                            </div>
                            <div className="text-xs text-slate-400">{t.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                        {t.slug}.lvplataform.com.br
                      </td>
                      <td className="py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            t.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : t.status === 'trial'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {t.status === 'active' ? 'Ativo' : t.status === 'trial' ? 'Trial' : 'Suspenso'}
                        </span>
                      </td>
                      <td className="py-3.5 capitalize font-medium text-slate-700 dark:text-slate-300 text-xs">
                        {t.plan || 'Pro'}
                      </td>
                      <td className="py-3.5 text-right">
                        <button
                          onClick={() => {
                            setTenant(t.id);
                            setSuccessNotice(`Sessão alterada para ${t.name}`);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition"
                        >
                          Entrar no CRM
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: CLIENTES (CRMs ATIVOS)                                             */}
      {/* ========================================================================= */}
      {activeTab === 'tenants' && (
        <div className="space-y-6">
          {/* Barra de Filtros e Busca */}
          <div className="bg-white dark:bg-[#121722] p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, slug ou CNPJ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-semibold text-slate-400">Status:</span>
              <div className="flex gap-1.5 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                {(['all', 'active', 'trial', 'suspended'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      statusFilter === st
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {st === 'all' ? 'Todos' : st === 'active' ? 'Ativos' : st === 'trial' ? 'Trial' : 'Suspensos'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grid de Cards de Empresas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTenants.map((t) => {
              const isActive = t.status === 'active';
              const isTrial = t.status === 'trial';
              const isCurrentSession = currentActiveTenant?.id === t.id;

              return (
                <div
                  key={t.id}
                  className={`p-5 rounded-2xl bg-white dark:bg-[#121722] border transition-all shadow-sm flex flex-col justify-between ${
                    isCurrentSession
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                >
                  <div>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0"
                          style={{ backgroundColor: t.primary_color || '#3b82f6' }}
                        >
                          {t.logo_url ? (
                            <img src={t.logo_url} alt={t.name} className="w-8 h-8 object-contain" />
                          ) : (
                            (t.name || 'E').substring(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug">
                            {t.trade_name || t.name}
                          </h3>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            {t.slug}.lvplataform.com.br
                          </div>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : isTrial
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isActive ? 'Ativo' : isTrial ? 'Trial' : 'Suspenso'}
                      </span>
                    </div>

                    {/* Detalhes */}
                    <div className="space-y-1.5 py-3 border-y border-slate-100 dark:border-white/5 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex justify-between">
                        <span>Plano:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                          {t.plan || 'Pro'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>CNPJ/CPF:</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          {t.document || 'Não informado'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cor da Marca:</span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/10 inline-block"
                            style={{ backgroundColor: t.primary_color || '#3b82f6' }}
                          />
                          <span>{t.primary_color || '#3b82f6'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="pt-4 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setTenant(t.id);
                        setSuccessNotice(`Sessão alternada para ${t.name}`);
                      }}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                        isCurrentSession
                          ? 'bg-indigo-600 text-white'
                          : 'border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isCurrentSession ? 'CRM Ativo na Sessão' : 'Entrar no CRM'}
                    </button>

                    <button
                      onClick={() => handleOpenEdit(t)}
                      title="Editar Empresa"
                      className="p-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        handleSelectBrandingTenant(t.id);
                        handleTabChange('branding');
                      }}
                      title="Personalizar Cores e Logo"
                      className="p-2 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400"
                    >
                      <Palette className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: PERSONALIZAÇÃO & CORES (WHITE-LABEL)                               */}
      {/* ========================================================================= */}
      {activeTab === 'branding' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Coluna da Esquerda: Configurações */}
            <div className="lg:col-span-7 space-y-6">
              {/* Seleção de Empresa */}
              <div className="p-6 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Selecione o CRM / Empresa para Personalizar
                  </h2>
                </div>
                <select
                  value={selectedBrandingTenantId}
                  onChange={(e) => handleSelectBrandingTenant(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id} className="dark:bg-[#121722]">
                      {t.trade_name || t.name} ({t.slug}.lvplataform.com.br)
                    </option>
                  ))}
                </select>
              </div>

              {/* Logo do CRM */}
              <div className="p-6 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Logo do CRM
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Faça o upload do arquivo de imagem da logo (PNG transparente, SVG, JPG ou WebP)
                    </p>
                  </div>
                </div>

                {/* Input oculto para seleção de arquivo */}
                <input
                  ref={brandingFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, false);
                    e.target.value = '';
                  }}
                />

                {brandingLogoUrl ? (
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/20">
                    <div className="w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-2 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                      <img
                        src={brandingLogoUrl}
                        alt="Logo Atual"
                        className="max-h-full max-w-full object-contain rounded-xl"
                      />
                    </div>
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs mb-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Arquivo de logo carregado com sucesso</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {brandingLogoUrl.startsWith('data:') ? 'Arquivo de imagem de alta resolução anexado' : brandingLogoUrl}
                      </p>
                      <div className="flex items-center justify-center sm:justify-start gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => brandingFileInputRef.current?.click()}
                          disabled={uploadingLogo}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/15 transition flex items-center gap-1.5 shadow-2xs"
                        >
                          {uploadingLogo ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UploadCloud className="w-3.5 h-3.5 text-indigo-500" />
                          )}
                          <span>Substituir Arquivo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setBrandingLogoUrl('')}
                          disabled={uploadingLogo}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remover Logo</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => brandingFileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileUpload(file, false);
                    }}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 group ${
                      uploadingLogo
                        ? 'border-indigo-400 bg-indigo-50/30 opacity-70 cursor-wait'
                        : 'border-slate-300 dark:border-white/15 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/20 dark:hover:bg-indigo-950/20'
                    }`}
                  >
                    {uploadingLogo ? (
                      <>
                        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Processando arquivo de imagem...
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition shadow-xs">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            Clique ou arraste o arquivo da logo aqui
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Suporta PNG (com transparência), SVG, JPG ou WebP (máx. 5MB)
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Preview da Logo com cantos arredondados */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center min-h-[90px]">
                    <span className="text-[11px] font-semibold text-slate-400 mb-2">Fundo Claro</span>
                    {brandingLogoUrl ? (
                      <img src={brandingLogoUrl} alt="Logo Preview" className="max-h-12 max-w-full object-contain rounded-xl shadow-xs" />
                    ) : (
                      <span className="text-xs text-slate-400 italic">Sem imagem</span>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-slate-800 bg-[#0f172a] flex flex-col items-center justify-center min-h-[90px]">
                    <span className="text-[11px] font-semibold text-slate-500 mb-2">Fundo Escuro</span>
                    {brandingLogoUrl ? (
                      <img src={brandingLogoUrl} alt="Logo Preview" className="max-h-12 max-w-full object-contain rounded-xl shadow-xs" />
                    ) : (
                      <span className="text-xs text-slate-500 italic">Sem imagem</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cores Pré-definidas conforme Print 1 */}
              <div className="p-6 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Cor Principal do CRM
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Selecione uma das cores pré-definidas ou informe um tom personalizado
                  </p>
                </div>

                {/* Círculos de Cores (Exatamente igual ao Print 1) */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Cores Pré-definidas:
                  </label>
                  <div className="flex flex-wrap items-center gap-3.5 p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                    {PRESET_COLORS.map((color) => {
                      const isSelected = brandingColor.toLowerCase() === color.hex.toLowerCase();
                      return (
                        <button
                          key={color.hex}
                          type="button"
                          onClick={() => setBrandingColor(color.hex)}
                          title={`${color.name} (${color.hex})`}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                            isSelected
                              ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-md'
                              : 'hover:scale-105 opacity-90 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: color.hex }}
                        >
                          {/* Dot central branco idêntico ao Print 1 */}
                          {isSelected && (
                            <div className="w-2.5 h-2.5 bg-white rounded-full shadow-xs" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Seletor Hexadecimal customizado */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    Ou escolha um código Hexadecimal:
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={brandingColor}
                      onChange={(e) => setBrandingColor(e.target.value)}
                      className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer p-0.5 bg-transparent"
                    />
                    <input
                      type="text"
                      value={brandingColor}
                      onChange={(e) => setBrandingColor(e.target.value)}
                      placeholder="#3b82f6"
                      className="w-36 p-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-end">
                  <button
                    onClick={handleSaveBranding}
                    disabled={savingBranding}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition shadow-sm shadow-indigo-600/20"
                  >
                    {savingBranding ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Salvar Personalização
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Coluna da Direita: Mockup Preview Ao Vivo */}
            <div className="lg:col-span-5">
              <div className="p-6 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm space-y-4 sticky top-24">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Pré-visualização Ao Vivo do CRM
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Como a marca e cor aparecerão para os usuários de {selectedTenantObj?.name || 'sua empresa'}
                  </p>
                </div>

                {/* Frame Simulador do CRM */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-lg bg-slate-50 dark:bg-slate-950">
                  {/* Top Header Mockup */}
                  <div className="h-14 px-4 bg-white dark:bg-[#0c1017] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {brandingLogoUrl ? (
                        <img
                          src={brandingLogoUrl}
                          alt="Logo"
                          className="h-8 max-h-8 w-auto max-w-[120px] object-contain rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-xs flex-shrink-0"
                          style={{ backgroundColor: brandingColor }}
                        >
                          <PhoneCall className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-white leading-tight">
                          {selectedTenantObj?.trade_name || selectedTenantObj?.name || 'Iris Horizon CRM'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {selectedTenantObj?.slug || 'empresa'}.lvplataform.com.br
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800" />
                    </div>
                  </div>

                  {/* Body Simulation */}
                  <div className="p-4 flex gap-4 min-h-[220px]">
                    {/* Mini Sidebar */}
                    <div className="w-36 bg-white dark:bg-[#0c1017] rounded-xl p-2.5 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div
                        className="p-1.5 rounded-lg text-white text-[11px] font-semibold flex items-center gap-1.5"
                        style={{ backgroundColor: brandingColor }}
                      >
                        <LayoutDashboard className="w-3 h-3" />
                        Dashboard
                      </div>
                      <div className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 text-[11px] flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-900">
                        <Users className="w-3 h-3" />
                        Clientes
                      </div>
                      <div className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 text-[11px] flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-900">
                        <FileText className="w-3 h-3" />
                        Chamados
                      </div>
                    </div>

                    {/* Main Preview Area */}
                    <div className="flex-1 space-y-3">
                      <div className="p-3 bg-white dark:bg-[#0c1017] rounded-xl border border-slate-200 dark:border-slate-800">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                          Ambiente Personalizado
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          A cor primária selecionada será aplicada aos botões principais, status ativos e destaques visuais deste CRM.
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold shadow-xs"
                          style={{ backgroundColor: brandingColor }}
                        >
                          Botão Ativo
                        </button>
                        <button className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                          Secundário
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 4: POLÍTICAS & DISJUNTORES (WRITE POLICY ENGINE)                      */}
      {/* ========================================================================= */}
      {activeTab === 'policy' && (
        <div className="space-y-6">
          {/* Card Didático Explicativo */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-slate-50 dark:from-indigo-950/20 dark:to-slate-900/40 border border-indigo-200/60 dark:border-indigo-500/20 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    O que é o Write Policy Engine e como funcionam os Disjuntores?
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Entenda a salvaguarda de segurança, isolamento multitenant e proteção contra falhas
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowExplainBox(!showExplainBox)}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline"
              >
                {showExplainBox ? 'Ocultar detalhes' : 'Ver explicação'}
                {showExplainBox ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showExplainBox && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-indigo-100 dark:border-white/5 text-xs text-slate-600 dark:text-slate-300">
                <div className="space-y-1.5 p-3.5 rounded-xl bg-white/70 dark:bg-white/5 border border-indigo-100/50 dark:border-white/5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-indigo-500" />
                    1. Matriz de Menor Privilégio
                  </div>
                  <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                    Controla permissões granulares de gravação (Criar, Editar, Excluir) por papel em cada módulo (Clientes, Contratos, Funil, Chamados, etc.), impedindo que colaboradores excluam dados acidentalmente.
                  </p>
                </div>

                <div className="space-y-1.5 p-3.5 rounded-xl bg-white/70 dark:bg-white/5 border border-indigo-100/50 dark:border-white/5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <PauseCircle className="w-4 h-4 text-amber-500" />
                    2. Disjuntores (Circuit Breakers)
                  </div>
                  <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                    Funcionam como disjuntores elétricos da vida real: se um módulo estiver sob manutenção ou houver suspeita de anomalia, você pode "desarmar" o disjuntor daquele módulo em 1 clique sem derrubar o restante do sistema.
                  </p>
                </div>

                <div className="space-y-1.5 p-3.5 rounded-xl bg-white/70 dark:bg-white/5 border border-indigo-100/50 dark:border-white/5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-emerald-500" />
                    3. É necessário no sistema?
                  </div>
                  <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                    <strong>Sim, é fundamental!</strong> Em uma arquitetura SaaS Multitenant, garante que o banco compartilhado esteja 100% blindado contra invasões, scripts com erro e corrupção acidental de dados.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Barra de Status e Controles da Governança */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ambiente:</span>
                <div className="flex gap-1.5 bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                  <button
                    onClick={() => setPolicyDbId('crm_db')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      policyDbId === 'crm_db'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Produção (crm_db)
                  </button>
                  <button
                    onClick={() => setPolicyDbId('crm_isolated_test')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      policyDbId === 'crm_isolated_test'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Sandbox de Teste
                  </button>
                </div>

                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 ml-2">Empresa:</span>
                <select
                  value={policyTenantId}
                  onChange={(e) => setPolicyTenantId(e.target.value)}
                  className="p-1.5 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id} className="dark:bg-[#121722]">
                      {t.trade_name || t.name} ({t.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Botão de Lockdown */}
              <button
                onClick={() => setShowLockdownModal(true)}
                disabled={actionLoading === 'lockdown'}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition shadow-sm ${
                  policyData?.globalLockdown
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                }`}
              >
                {policyData?.globalLockdown ? (
                  <>
                    <Unlock className="w-4 h-4" />
                    DESATIVAR LOCKDOWN GLOBAL
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    ACIONAR LOCKDOWN GLOBAL
                  </>
                )}
              </button>
            </div>

            {/* Sub-abas de Módulos vs Auditoria */}
            <div className="flex gap-2 border-b border-slate-100 dark:border-white/5 pb-2">
              <button
                onClick={() => setPolicySubTab('modules')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  policySubTab === 'modules'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Matriz de Módulos & Disjuntores ({policyData?.modules?.length || 0})
              </button>
              <button
                onClick={() => setPolicySubTab('audit')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  policySubTab === 'audit'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Trilha de Auditoria ({auditLogs.length})
              </button>
            </div>
          </div>

          {/* Grid de Módulos */}
          {policySubTab === 'modules' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {(policyData?.modules || []).map((mod) => {
                const IconComponent = ICON_MAP[mod.icon || ''] || ShieldCheck;
                const isPaused = mod.isPaused;

                return (
                  <div
                    key={mod.activeCollection}
                    className={`p-5 rounded-2xl bg-white dark:bg-[#121722] border transition-all shadow-sm flex flex-col justify-between ${
                      isPaused
                        ? 'border-amber-400/80 bg-amber-500/[0.02]'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <div>
                      {/* Top info */}
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${
                            isPaused
                              ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60'
                              : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                          }`}>
                            <IconComponent className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                              {mod.name}
                            </h4>
                            <div className="text-[11px] font-mono text-slate-400">
                              {mod.activeCollection}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            isPaused
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isPaused ? 'PAUSADO' : 'LIBERADO'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">
                        {mod.description}
                      </p>

                      {/* Toggles granulares */}
                      <div className="space-y-2 py-3 border-t border-slate-100 dark:border-white/5">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Ações Granulares (Escrita)
                        </div>

                        {(['create', 'update', 'delete'] as const).map((act) => {
                          const allowed = mod.actions[act]?.allowed ?? true;
                          const label = act === 'create' ? 'Criar (Create)' : act === 'update' ? 'Editar (Update)' : 'Excluir (Delete)';
                          const isLoadingThis = actionLoading === `rule-${mod.activeCollection}-${act}`;

                          return (
                            <div key={act} className="flex items-center justify-between text-xs py-1">
                              <span className="text-slate-700 dark:text-slate-300 font-medium">
                                {label}
                              </span>

                              <button
                                type="button"
                                disabled={isPaused || isLoadingThis}
                                onClick={() => handleToggleGranularRule(mod.activeCollection, act, allowed)}
                                className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                                  allowed ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                                } ${isPaused ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <div
                                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                    allowed ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Botão de Disjuntor */}
                    <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                      <button
                        onClick={() => handleToggleModulePause(mod)}
                        disabled={actionLoading?.startsWith(`pause-${mod.activeCollection}`)}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 ${
                          isPaused
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'border border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20'
                        }`}
                      >
                        {isPaused ? (
                          <>
                            <PlayCircle className="w-4 h-4" />
                            Reativar Módulo
                          </>
                        ) : (
                          <>
                            <PauseCircle className="w-4 h-4" />
                            Pausar Módulo (Disjuntor)
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Aba de Auditoria */}
          {policySubTab === 'audit' && (
            <div className="p-6 rounded-2xl bg-white dark:bg-[#121722] border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Trilha de Auditoria da Governança
              </h3>

              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Nenhum registro de auditoria encontrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 text-slate-400">
                        <th className="pb-2.5">Data/Hora</th>
                        <th className="pb-2.5">Operador</th>
                        <th className="pb-2.5">Ação</th>
                        <th className="pb-2.5">Alvo</th>
                        <th className="pb-2.5">Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2.5 font-mono text-slate-500">
                            {new Date(log.timestamp).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                            {log.userEmail || log.userId}
                          </td>
                          <td className="py-2.5 font-semibold text-indigo-600 dark:text-indigo-400">
                            {log.action}
                          </td>
                          <td className="py-2.5 font-mono text-slate-600 dark:text-slate-300">
                            {log.target}
                          </td>
                          <td className="py-2.5 text-slate-500 italic">
                            {log.reason || 'Não informado'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Confirmação: Lockdown Global */}
      {showLockdownModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0c1017] rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {policyData?.globalLockdown ? 'Desativar Lockdown?' : 'Acionar Lockdown Global?'}
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              O Lockdown Global suspende todas as escritas no banco de dados selecionado em caso de emergência ou incidente de segurança.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Motivo do Acionamento:
              </label>
              <textarea
                value={lockdownReason}
                onChange={(e) => setLockdownReason(e.target.value)}
                placeholder="Ex: Auditoria de segurança de emergência..."
                rows={2}
                className="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowLockdownModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleToggleLockdown}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20"
              >
                Confirmar Ação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação: Pausa de Módulo */}
      {pauseModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0c1017] rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-2.5 rounded-2xl bg-amber-100 dark:bg-amber-950/60">
                <PauseCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Pausar Módulo "{pauseModalTarget.name}"?
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              O módulo <code className="font-mono text-amber-500">{pauseModalTarget.activeCollection}</code> terá todas as suas escritas suspensas com Circuit Breaker sem afetar a leitura dos dados.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Motivo da Interrupção:
              </label>
              <textarea
                value={modulePauseReason}
                onChange={(e) => setModulePauseReason(e.target.value)}
                placeholder="Ex: Manutenção preventiva de banco de dados..."
                rows={2}
                className="w-full text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPauseModalTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={confirmModulePause}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20"
              >
                Confirmar Pausa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Provisionamento / Edição de Tenant */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0c1017] rounded-3xl max-w-xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl my-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingTenant ? 'Editar Empresa / CRM' : 'Provisionar Novo CRM'}
                </h3>
                <p className="text-xs text-slate-500">
                  Configure os dados cadastrais, subdomínio e identidade visual
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitTenant} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleSlugAutoGenerate(e.target.value)}
                    placeholder="Ex: Empresa Telecom"
                    className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome Fantasia
                  </label>
                  <input
                    type="text"
                    value={formData.trade_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, trade_name: e.target.value }))}
                    placeholder="Ex: Telecom Fácil"
                    className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Subdomínio / Slug *
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                    placeholder="telecom"
                    className="flex-1 text-xs p-2.5 rounded-l-xl bg-slate-50 dark:bg-white/5 border border-r-0 border-slate-200 dark:border-white/10 font-mono text-indigo-600"
                  />
                  <span className="px-3 py-2.5 bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-r-xl text-xs text-slate-500 font-mono">
                    .lvplataform.com.br
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    CNPJ ou CPF
                  </label>
                  <input
                    type="text"
                    value={formData.document}
                    onChange={(e) => setFormData((prev) => ({ ...prev, document: e.target.value }))}
                    placeholder="00.000.000/0001-00"
                    className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail do Administrador
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="admin@empresa.com"
                    className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Plano
                  </label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData((prev) => ({ ...prev, plan: e.target.value as any }))}
                    className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  >
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as any }))}
                    className="w-full text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  >
                    <option value="active">Ativo</option>
                    <option value="trial">Trial (Avaliação)</option>
                    <option value="suspended">Suspenso</option>
                  </select>
                </div>
              </div>

              {/* Upload da Logo da Empresa em formato de arquivo */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Logomarca da Empresa (Arquivo de Imagem)
                </label>
                <input
                  ref={modalFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, true);
                    e.target.value = '';
                  }}
                />
                {formData.logo_url ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-indigo-200 dark:border-white/10 bg-indigo-50/40 dark:bg-white/5">
                    <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                      <img
                        src={formData.logo_url}
                        alt="Logo"
                        className="max-h-full max-w-full object-contain rounded-lg"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Arquivo de logo anexado
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {formData.logo_url.startsWith('data:') ? 'Imagem de alta resolução' : formData.logo_url}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => modalFileInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 hover:bg-slate-50 text-slate-700 dark:text-slate-200"
                      >
                        Substituir
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, logo_url: '' }))}
                        className="p-1 text-rose-500 hover:text-rose-700"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => modalFileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-300 dark:border-white/15 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                  >
                    {uploadingLogo ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                        <span>Carregando arquivo...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4 text-indigo-500" />
                        <span>Selecionar Arquivo da Logo (PNG, SVG, JPG, WebP - máx. 5MB)</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Módulos Permitidos */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Módulos Autorizados no CRM:
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                  {ALL_CRM_MENUS.map((menu) => (
                    <label key={menu.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allowed_menus.includes(menu.id)}
                        onChange={() => handleToggleAllowedMenu(menu.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{menu.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                >
                  {isSubmitting ? 'Salvando...' : editingTenant ? 'Salvar Alterações' : 'Provisionar CRM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
