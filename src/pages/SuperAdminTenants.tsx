import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ID } from 'appwrite';
import { storage } from '../lib/appwrite';
import {
  Building2,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Globe,
  Lock,
  Users,
  UploadCloud,
  Trash2,
} from 'lucide-react';
import { useTenant, Tenant } from '../context/TenantContext';
import {
  fetchAdminTenants,
  createAdminTenant,
  updateAdminTenant,
  CreateTenantPayload,
  UpdateTenantPayload,
} from '../lib/adminTenantsApi';
import { ALL_CRM_MENUS } from '../lib/tenantUsersApi';
import { optimizeLogoImage, MAX_LOGO_FILE_SIZE } from '../lib/imageOptimizer';

interface SuperAdminTenantsProps {
  onPageChange?: (page: string) => void;
}

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

export default function SuperAdminTenants({ onPageChange }: SuperAdminTenantsProps) {
  const { isSuperAdmin, tenant: currentActiveTenant, setTenant, refreshTenants } = useTenant();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modais de Criação e Edição
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form State
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

  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
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
      const optimizedDataUrl = await optimizeLogoImage(file);
      const bucketId = import.meta.env.VITE_APPWRITE_BUCKET_ID || 'crm_attachments';
      let uploadedUrl = '';
      try {
        const fileId = ID.unique();
        await storage.createFile(bucketId, fileId, file);
        uploadedUrl = storage.getFileView(bucketId, fileId).toString();
      } catch (storageErr: any) {
        console.warn('[Storage] Fallback para imagem otimizada:', storageErr?.message);
      }

      if (!uploadedUrl) {
        uploadedUrl = optimizedDataUrl;
      }

      setFormData((prev) => ({ ...prev, logo_url: uploadedUrl }));
    } catch (err: any) {
      setError(err.message || 'Falha ao processar arquivo da logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminTenants();
      setTenants(res.tenants || []);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar lista de empresas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      primary_color: '#4f46e5',
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
      primary_color: t.primary_color || '#4f46e5',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // F09: Preservar configurações customizadas prévias do tenant via deep merge
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
        // Atualizar
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
        // Criar
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
      await loadData();
      await refreshTenants();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar informações da empresa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenTenantRoute = (slug: string) => {
    if (typeof window === 'undefined') return;
    const hostname = window.location.hostname.toLowerCase();

    // Se estiver rodando no domínio de produção lvplataform.com.br / lvplatform.com.br, abre pelo subdomínio direto
    if (hostname.endsWith('lvplataform.com.br') || hostname.endsWith('lvplatform.com.br')) {
      const protocol = window.location.protocol;
      const baseDomain = hostname.endsWith('lvplataform.com.br') ? 'lvplataform.com.br' : 'lvplatform.com.br';
      const targetUrl = `${protocol}//${slug}.${baseDomain}`;
      window.open(targetUrl, '_blank');
      return;
    }

    // Em localhost/desenvolvimento, abre pelo caminho local (ou ?tenant=slug)
    const origin = window.location.origin;
    const url = `${origin}/${slug}`;
    window.open(url, '_blank');
  };

  const filteredTenants = tenants.filter((t) => {
    const search = searchTerm.toLowerCase();
    return (
      t.name.toLowerCase().includes(search) ||
      t.slug.toLowerCase().includes(search) ||
      (t.trade_name && t.trade_name.toLowerCase().includes(search)) ||
      (t.document && t.document.includes(search))
    );
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Lock className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Acesso Restrito</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md">
          Apenas membros autenticados no grupo oficial de SuperAdministradores podem gerenciar o provisionamento de empresas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Building2 className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Empresas & Multi-Tenant
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Provisionamento, identidade visual e isolamento de organizações no SaaS
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition text-sm font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nova Empresa
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="text-xs font-semibold hover:underline">
            Fechar
          </button>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="bg-white dark:bg-[#121722] p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, slug ou CNPJ..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Total: <span className="font-bold text-slate-900 dark:text-white">{filteredTenants.length}</span> empresas
        </div>
      </div>

      {/* Grid de Empresas */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Carregando empresas cadastradas...
        </div>
      ) : filteredTenants.length === 0 ? (
        <div className="bg-white dark:bg-[#121722] p-12 rounded-2xl border border-slate-200 dark:border-white/10 text-center">
          <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">Nenhuma empresa encontrada</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {searchTerm ? 'Tente ajustar os termos da busca.' : 'Clique em "Nova Empresa" para provisionar a primeira.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTenants.map((t) => {
            const isActive = t.status === 'active';
            const isSelected = currentActiveTenant?.id === t.id;

            return (
              <div
                key={t.id}
                className={`bg-white dark:bg-[#121722] rounded-2xl border transition shadow-sm hover:shadow-md flex flex-col justify-between ${
                  isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-white/10'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {t.logo_url ? (
                        <img
                          src={t.logo_url}
                          alt={t.name}
                          className="w-11 h-11 rounded-xl object-contain bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-1"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-sm"
                          style={{ backgroundColor: t.primary_color || '#4f46e5' }}
                        >
                          {t.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                          {t.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1 truncate">
                          <Globe className="w-3 h-3 text-slate-400" />
                          {t.slug}.lvplataform.com.br
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  {/* Informações detalhadas */}
                  <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-white/5">
                    {t.trade_name && t.trade_name !== t.name && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Nome Fantasia:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                          {t.trade_name}
                        </span>
                      </div>
                    )}
                    {t.document && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">CNPJ/Doc:</span>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                          {t.document}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Plano Ativo:</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold uppercase text-[10px]">
                        {t.plan || 'pro'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Menus Liberados:</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {parseAllowedMenus(t.settings_json).length} / {ALL_CRM_MENUS.length} módulos
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Cor da Marca:</span>
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/10 inline-block"
                          style={{ backgroundColor: t.primary_color || '#4f46e5' }}
                        />
                        {t.primary_color || '#4f46e5'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ações do Card */}
                <div className="p-3 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5 rounded-b-2xl flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenEdit(t)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar & Menus
                  </button>

                  <button
                    onClick={async () => {
                      await setTenant(t.id);
                      if (onPageChange) onPageChange('superadmin-policy');
                    }}
                    title="Configurar permissões de escrita (Criar, Editar, Excluir) para este cliente"
                    className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition text-xs font-semibold"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Permissões
                  </button>

                  <button
                    onClick={async () => {
                      await setTenant(t.id);
                      if (onPageChange) onPageChange('usuarios');
                    }}
                    title="Gerenciar equipe e permissões de usuários desta empresa"
                    className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition text-xs font-semibold"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Equipe
                  </button>

                  <button
                    onClick={() => handleOpenTenantRoute(t.slug)}
                    title={`Abrir ${t.slug}.lvplataform.com.br`}
                    className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition text-xs font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    /{t.slug}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação / Edição */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121722] w-full max-w-xl rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Building2 className="w-5 h-5" />
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {editingTenant ? 'Editar Empresa & Permissões do Cliente' : 'Provisionar Nova Empresa'}
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleSlugAutoGenerate(e.target.value)}
                    placeholder="Ex: Empresa A Tecnologia"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Subdomínio HTML / Slug *
                  </label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      required
                      value={formData.slug}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                        }))
                      }
                      placeholder="empresaa"
                      className="w-full px-3 py-2 rounded-l-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="px-2.5 py-2 bg-slate-100 dark:bg-white/10 border border-l-0 border-slate-200 dark:border-white/10 rounded-r-xl text-[11px] font-mono text-slate-500 whitespace-nowrap">
                      .lvplataform.com.br
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome Fantasia
                  </label>
                  <input
                    type="text"
                    value={formData.trade_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, trade_name: e.target.value }))}
                    placeholder="Empresa A"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    CNPJ / Documento
                  </label>
                  <input
                    type="text"
                    value={formData.document}
                    onChange={(e) => setFormData((prev) => ({ ...prev, document: e.target.value }))}
                    placeholder="00.000.000/0001-00"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail de Contato
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="contato@empresa.com"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status Operacional
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as any }))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="active">Ativa (Acesso Liberado)</option>
                    <option value="suspended">Suspensa (Acesso Bloqueado)</option>
                    <option value="trial">Período de Testes</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Plano Associado
                  </label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData((prev) => ({ ...prev, plan: e.target.value as any }))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="free">Free / Gratuito</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Logomarca da Empresa (Arquivo de Imagem)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
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
                          {formData.logo_url.startsWith('data:') ? 'Arquivo de imagem anexado' : formData.logo_url}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
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
                      onClick={() => fileInputRef.current?.click()}
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

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cor Primária da Identidade Visual
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formData.primary_color}
                      onChange={(e) => setFormData((prev) => ({ ...prev, primary_color: e.target.value }))}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 dark:border-white/10"
                    />
                    <input
                      type="text"
                      value={formData.primary_color}
                      onChange={(e) => setFormData((prev) => ({ ...prev, primary_color: e.target.value }))}
                      className="w-32 px-3 py-2 rounded-xl font-mono text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                    />
                    <div
                      className="px-4 py-1.5 rounded-xl text-white text-xs font-semibold shadow-sm"
                      style={{ backgroundColor: formData.primary_color }}
                    >
                      Prévia do Botão
                    </div>
                  </div>
                </div>

                {/* Permissões de Menus Habilitados para o Cliente */}
                <div className="sm:col-span-2 pt-2 border-t border-slate-100 dark:border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Permissões de Menus Habilitados para este Cliente
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          allowed_menus:
                            prev.allowed_menus.length === ALL_CRM_MENUS.length
                              ? ['visao-geral']
                              : ALL_CRM_MENUS.map((m) => m.id),
                        }))
                      }
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      {formData.allowed_menus.length === ALL_CRM_MENUS.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_CRM_MENUS.map((menu) => {
                      const checked = formData.allowed_menus.includes(menu.id);
                      return (
                        <label
                          key={menu.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition text-xs ${
                            checked
                              ? 'bg-indigo-50/70 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/30 text-indigo-900 dark:text-indigo-200'
                              : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold truncate">{menu.label}</div>
                            <div className="text-[10px] opacity-70 truncate">{menu.category}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleAllowedMenu(menu.id)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-white/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : editingTenant ? 'Salvar Alterações' : 'Provisionar Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
