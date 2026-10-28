import { useState, useEffect } from 'react';
import {
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  Eye,
  Layers3,
  ListFilter,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Tag,
  Trash2,
  Users,
  X,
  Headphones,
  CreditCard,
  Globe,
  Search,
  Info,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTenant } from '../../context/TenantContext';
import { DEFAULT_ROLE_PERMISSIONS } from '../services/mockApi';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Field,
  FormPage,
  PageHeader,
} from '../components/ui';
import { roleNames } from '../layouts/AppLayout';
import { newId } from '../utils/format';
import { maskDocument, maskPhone, validateDocument, validateEmail } from '../utils/validation';
import type { Role, Settings, User, ModulePermissionRule, PermissionLevel } from '../types';
const sections = [
  { id: 'company', label: 'Dados da empresa', icon: Building2 },
  { id: 'users', label: 'Equipe operacional', icon: Users },
  { id: 'roles', label: 'Perfis de acesso', icon: ShieldCheck },
  { id: 'categories', label: 'Categorias de tickets', icon: Tag },
  { id: 'services', label: 'Tipos de serviços', icon: Layers3 },
  { id: 'preferences', label: 'Preferências visuais', icon: Palette },
  { id: 'reset', label: 'Sincronização & Banco', icon: RotateCcw },
];
export function SettingsPage() {
  const { data, session, updateSettings, save, patch, reset, notify } = useApp();
  const { tenant, isSuperAdmin, refreshTenants } = useTenant();
  const [tab, setTab] = useState('company'),
    [company, setCompany] = useState<Settings['company']>({
      name: tenant?.name || data.settings.company.name || '',
      tradeName: tenant?.trade_name || tenant?.name || data.settings.company.tradeName || '',
      document: tenant?.document || data.settings.company.document || '',
      phone: tenant?.phone || data.settings.company.phone || '',
      email: tenant?.email || data.settings.company.email || '',
      address: tenant?.address || data.settings.company.address || '',
    }),
    [adminTenantMeta, setAdminTenantMeta] = useState({
      slug: tenant?.slug || '',
      plan: tenant?.plan || 'pro',
      status: tenant?.status || 'active',
      primaryColor: tenant?.primary_color || '#4f46e5',
    }),
    [rolePermissions, setRolePermissions] = useState<ModulePermissionRule[]>(
      data.settings.rolePermissions && data.settings.rolePermissions.length > 0
        ? data.settings.rolePermissions
        : DEFAULT_ROLE_PERMISSIONS
    ),
    [permSearch, setPermSearch] = useState(''),
    [savingPerms, setSavingPerms] = useState(false),
    [resetPermsConfirm, setResetPermsConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [resetOpen, setResetOpen] = useState(false),
    [newTag, setNewTag] = useState(''),
    [removeTag, setRemoveTag] = useState<string | null>(null),
    [userModal, setUserModal] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [userError, setUserError] = useState(''),
    [deactivate, setDeactivate] = useState<User | null>(null),
    [companyError, setCompanyError] = useState('');

  useEffect(() => {
    if (tenant) {
      setCompany({
        name: tenant.name || data.settings.company.name || '',
        tradeName: tenant.trade_name || tenant.name || data.settings.company.tradeName || '',
        document: tenant.document || data.settings.company.document || '',
        phone: tenant.phone || data.settings.company.phone || '',
        email: tenant.email || data.settings.company.email || '',
        address: tenant.address || data.settings.company.address || '',
      });
      setAdminTenantMeta({
        slug: tenant.slug || '',
        plan: tenant.plan || 'pro',
        status: tenant.status || 'active',
        primaryColor: tenant.primary_color || '#4f46e5',
      });
    } else if (data.settings?.company) {
      setCompany({ ...data.settings.company });
    }
  }, [tenant, data.settings.company]);

  useEffect(() => {
    if (data.settings?.rolePermissions && data.settings.rolePermissions.length > 0) {
      setRolePermissions(data.settings.rolePermissions);
    }
  }, [data.settings.rolePermissions]);

  const updatePermissionLevel = (
    moduleId: string,
    roleKey: 'admin' | 'support' | 'finance' | 'client',
    level: PermissionLevel
  ) => {
    setRolePermissions((prev) =>
      prev.map((item) =>
        item.moduleId === moduleId
          ? { ...item, [roleKey]: level }
          : item
      )
    );
  };

  async function saveRolePermissionsList(permsToSave = rolePermissions) {
    setSavingPerms(true);
    try {
      await saveSettings({
        ...data.settings,
        rolePermissions: permsToSave,
      });
      notify('Matriz de permissões salva com sucesso.');
    } catch (err: any) {
      notify(err?.message || 'Erro ao salvar permissões.', 'error');
    } finally {
      setSavingPerms(false);
    }
  }

  function handleResetDefaultPermissions() {
    setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
    void saveRolePermissionsList(DEFAULT_ROLE_PERMISSIONS);
    setResetPermsConfirm(false);
  }

  const listKey = tab === 'services' ? 'serviceTypes' : 'ticketCategories';
  const updateCompany = (key: keyof Settings['company'], value: string) =>
    setCompany((c) => ({ ...c, [key]: value }));

  async function saveSettings(next: Settings) {
    setBusy(true);
    setCompanyError('');
    try {
      await updateSettings(next);

      // Sincroniza metadados extras de SuperAdmin caso aplicável, sem suprimir falhas
      const targetTenantId = tenant?.id;
      if (targetTenantId) {
        if (
          isSuperAdmin &&
          (adminTenantMeta.slug ||
            adminTenantMeta.plan ||
            adminTenantMeta.status ||
            adminTenantMeta.primaryColor)
        ) {
          const { updateAdminTenant } = await import('../../lib/adminTenantsApi');
          await updateAdminTenant(targetTenantId, {
            name: next.company.name.trim(),
            trade_name: (next.company.tradeName || next.company.name).trim(),
            document: next.company.document || '',
            phone: next.company.phone || '',
            email: next.company.email || '',
            address: next.company.address || '',
            ...(adminTenantMeta.slug ? { slug: adminTenantMeta.slug.trim().toLowerCase() } : {}),
            ...(adminTenantMeta.plan ? { plan: adminTenantMeta.plan as any } : {}),
            ...(adminTenantMeta.status ? { status: adminTenantMeta.status as any } : {}),
            ...(adminTenantMeta.primaryColor ? { primary_color: adminTenantMeta.primaryColor } : {}),
          });
        }
        await refreshTenants();
      }

      notify('Configurações salvas com sucesso.');
    } catch (err: any) {
      const msg = err?.message || 'Erro ao salvar configurações.';
      setCompanyError(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  }
  function openUser(value?: User) {
    setUser(
      value
        ? { ...value }
        : { id: newId('user'), name: '', email: '', role: 'support', active: true },
    );
    setUserError('');
    setUserModal(true);
  }
  async function addTag() {
    const v = newTag.trim();
    if (v.length < 2) {
      notify('Informe um nome com pelo menos 2 caracteres.', 'error');
      return;
    }
    if (data.settings[listKey].some((x) => x.toLocaleLowerCase() === v.toLocaleLowerCase())) {
      notify('Esse item já está cadastrado.', 'error');
      return;
    }
    await saveSettings({ ...data.settings, [listKey]: [...data.settings[listKey], v] });
    setNewTag('');
  }
  if (userModal && user) {
    return (
      <FormPage
        eyebrow="EQUIPE OPERACIONAL"
        title={data.users.some((u) => u.id === user.id) ? 'Editar colaborador' : 'Novo colaborador'}
        description="Configure nome, e-mail corporativo e perfil operacional do colaborador."
        backLabel="Voltar às configurações"
        onBack={() => setUserModal(false)}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (user.name.trim().length < 3) {
              setUserError('Informe o nome completo.');
              return;
            }
            if (!validateEmail(user.email)) {
              setUserError('Informe um e-mail válido.');
              return;
            }
            if (
              data.users.some(
                (u) => u.id !== user.id && u.email.toLowerCase() === user.email.toLowerCase(),
              )
            ) {
              setUserError('Já existe um usuário com este e-mail.');
              return;
            }
            setBusy(true);
            try {
              await save('users', user);
              notify('Colaborador salvo com sucesso.');
              setUserModal(false);
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <Field label="Nome">
              <input
                value={user.name}
                onChange={(e) => setUser({ ...user, name: e.target.value })}
                required
              />
            </Field>
            <Field label="E-mail corporativo">
              <input
                type="email"
                value={user.email}
                onChange={(e) => setUser({ ...user, email: e.target.value })}
                required
                placeholder="colaborador@empresa.com.br"
              />
            </Field>
            <Field label="Perfil">
              <select
                value={user.role}
                disabled={!isSuperAdmin && user.id === session?.userId}
                onChange={(e) => setUser({ ...user, role: e.target.value as Role })}
              >
                {Object.entries(roleNames).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={user.active ? 'Ativo' : 'Inativo'}
                disabled={!isSuperAdmin && user.id === session?.userId}
                onChange={(e) => setUser({ ...user, active: e.target.value === 'Ativo' })}
              >
                <option>Ativo</option>
                <option>Inativo</option>
              </select>
            </Field>
          </div>
          {userError && (
            <p className="field-error" style={{ marginTop: 12 }} role="alert">
              {userError}
            </p>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setUserModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              Salvar colaborador
            </Button>
          </div>
        </form>
      </FormPage>
    );
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="ADMINISTRAÇÃO & SISTEMA"
        title="Configurações da Empresa"
        description="Gerencie os dados institucionais, categorias operacionais e parâmetros da sua organização."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Seções de configuração">
          {sections.map((s) => (
            <button
              key={s.id}
              className={tab === s.id ? 'active' : ''}
              onClick={() => {
                setTab(s.id);
                setNewTag('');
              }}
            >
              <s.icon size={15} />
              {s.label}
            </button>
          ))}
        </nav>
        <Card>
          {tab === 'company' && (
            <>
              <div className="settings-section-head">
                <h2>Dados da empresa</h2>
                <p>Informações institucionais da sua empresa na plataforma.</p>
              </div>

              {isSuperAdmin && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 12,
                  marginBottom: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#10b981',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                    }}>
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        Autonomia SuperAdministrador Ativa
                        <Badge status="Ativo" />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>
                        Você possui autonomia irrestrita para gerenciar e alterar os dados cadastrais, parâmetros do servidor e governança desta organização.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!company.name.trim()) {
                    setCompanyError('Informe a razão social.');
                    return;
                  }
                  if (company.document && !validateDocument(company.document, 'PJ')) {
                    setCompanyError(
                      'Informe um CNPJ válido ou deixe o campo vazio.',
                    );
                    return;
                  }
                  if (!validateEmail(company.email)) {
                    setCompanyError('Informe um e-mail válido.');
                    return;
                  }
                  setCompanyError('');
                  await saveSettings({ ...data.settings, company });
                }}
              >
                <div className="form-grid">
                  <Field label="Razão social">
                    <input
                      value={company.name}
                      onChange={(e) => updateCompany('name', e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Nome fantasia">
                    <input
                      value={company.tradeName}
                      onChange={(e) => updateCompany('tradeName', e.target.value)}
                    />
                  </Field>
                  <Field label="CNPJ">
                    <input
                      value={company.document}
                      onChange={(e) =>
                        updateCompany('document', maskDocument(e.target.value, 'PJ'))
                      }
                    />
                  </Field>
                  <Field label="Telefone">
                    <input
                      value={company.phone}
                      onChange={(e) => updateCompany('phone', maskPhone(e.target.value))}
                    />
                  </Field>
                  <Field label="E-mail">
                    <input
                      type="email"
                      value={company.email}
                      onChange={(e) => updateCompany('email', e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Endereço">
                    <input
                      value={company.address}
                      onChange={(e) => updateCompany('address', e.target.value)}
                    />
                  </Field>
                </div>

                {isSuperAdmin && (
                  <>
                    <div style={{ marginTop: 24, marginBottom: 8, borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 20 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #0f172a)', marginBottom: 4 }}>
                        Parâmetros do Servidor & Governança (SuperAdmin)
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginBottom: 16 }}>
                        Configurações avançadas de roteamento de domínio, licenciamento de recursos e ciclo de vida da organização.
                      </p>
                    </div>
                    <div className="form-grid">
                      <Field label="Identificador / Slug (URL)">
                        <input
                          value={adminTenantMeta.slug}
                          onChange={(e) => setAdminTenantMeta((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                          placeholder="matriz"
                        />
                      </Field>
                      <Field label="Plano Contratado">
                        <select
                          value={adminTenantMeta.plan}
                          onChange={(e) => setAdminTenantMeta((prev) => ({ ...prev, plan: e.target.value as any }))}
                        >
                          <option value="free">Gratuito (Free)</option>
                          <option value="starter">Starter</option>
                          <option value="pro">Profissional (Pro)</option>
                          <option value="enterprise">Corporativo (Enterprise)</option>
                        </select>
                      </Field>
                      <Field label="Status Operacional">
                        <select
                          value={adminTenantMeta.status}
                          onChange={(e) => setAdminTenantMeta((prev) => ({ ...prev, status: e.target.value as any }))}
                        >
                          <option value="active">Ativo</option>
                          <option value="trial">Em Avaliação (Trial)</option>
                          <option value="suspended">Suspenso</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                      </Field>
                      <Field label="Cor Primária da Marca">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="color"
                            value={adminTenantMeta.primaryColor}
                            onChange={(e) => setAdminTenantMeta((prev) => ({ ...prev, primaryColor: e.target.value }))}
                            style={{ width: 40, height: 38, padding: 2, cursor: 'pointer', borderRadius: 6, border: '1px solid var(--border-color, #cbd5e1)' }}
                          />
                          <input
                            value={adminTenantMeta.primaryColor}
                            onChange={(e) => setAdminTenantMeta((prev) => ({ ...prev, primaryColor: e.target.value }))}
                            placeholder="#4f46e5"
                          />
                        </div>
                      </Field>
                    </div>
                  </>
                )}

                {companyError && (
                  <p className="field-error" role="alert" style={{ marginTop: 12 }}>
                    {companyError}
                  </p>
                )}
                <div className="form-actions">
                  <Button type="submit" loading={busy}>
                    <Save size={13} />
                    Salvar alterações
                  </Button>
                </div>
              </form>
            </>
          )}
          {tab === 'users' && (
            <>
              <div className="card-header">
                <div className="settings-section-head" style={{ margin: 0 }}>
                  <h2>Equipe operacional</h2>
                  <p>Colaboradores cadastrados na organização para atribuição de chamados e agenda.</p>
                </div>
                <Button size="sm" onClick={() => openUser()}>
                  <Plus size={13} />
                  Novo colaborador
                </Button>
              </div>
              <DataTable
                rows={data.users}
                columns={[
                  {
                    key: 'name',
                    label: 'Usuário',
                    sortValue: (u) => u.name,
                    render: (u) => (
                      <span className="inline">
                        <Avatar name={u.name} size={29} />
                        <span>
                          <span className="cell-title">{u.name}</span>
                          <span className="cell-subtitle" style={{ display: 'block' }}>
                            {u.email}
                          </span>
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: 'role',
                    label: 'Perfil',
                    sortValue: (u) => u.role,
                    render: (u) => roleNames[u.role],
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (u) => <Badge status={u.active ? 'Ativo' : 'Inativo'} />,
                  },
                  {
                    key: 'actions',
                    label: 'Ações',
                    render: (u) => (
                      <div className="inline">
                        <button
                          className="icon-button"
                          aria-label={`Editar ${u.name}`}
                          onClick={() => openUser(u)}
                        >
                          <Pencil size={14} />
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={u.id === session?.userId}
                          onClick={() => setDeactivate(u)}
                        >
                          {u.active ? 'Inativar' : 'Ativar'}
                        </Button>
                      </div>
                    ),
                  },
                ]}
                pageSize={8}
              />
              <p className="search-hint">
                Para gerenciar credenciais de acesso e permissões granulares por menu, acesse o módulo Equipe & Acessos no menu lateral.
              </p>
            </>
          )}
          {tab === 'roles' && (
            <>
              <div className="settings-section-head" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h2>Perfis de acesso & Matriz de Permissões</h2>
                    <p>Gerencie o que cada perfil operacional pode fazer: editar registros, somente visualizar ou sem acesso.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setResetPermsConfirm(true)}
                      disabled={savingPerms}
                    >
                      <RotateCcw size={13} />
                      Restaurar padrões
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void saveRolePermissionsList()}
                      loading={savingPerms}
                    >
                      <Save size={13} />
                      Salvar alterações
                    </Button>
                  </div>
                </div>
              </div>

              {/* Guia de Funções e Responsabilidades Operacionais */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ marginBottom: 10 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary, #64748b)', margin: 0 }}>
                    Guia de Funções & Responsabilidades Operacionais
                  </h3>
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                    Conheça a finalidade e o escopo de atuação de cada perfil de acesso na organização:
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {/* Superadministrador */}
                  <div style={{
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 6, background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShieldCheck size={15} />
                      </div>
                      <div>
                        <strong style={{ fontSize: 12, color: 'var(--text-primary, #0f172a)' }}>Superadmin</strong>
                        <span style={{ display: 'block', fontSize: 10, color: '#6366f1', fontWeight: 600 }}>Governança Global</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', margin: 0, lineHeight: 1.4 }}>
                      Autonomia soberana sobre todas as empresas, instâncias e parametrizações sem restrições.
                    </p>
                  </div>

                  {/* Administrador */}
                  <div style={{
                    border: '1px solid rgba(14, 165, 233, 0.25)',
                    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 6, background: '#0ea5e9', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={15} />
                      </div>
                      <div>
                        <strong style={{ fontSize: 12, color: 'var(--text-primary, #0f172a)' }}>Administrador</strong>
                        <span style={{ display: 'block', fontSize: 10, color: '#0ea5e9', fontWeight: 600 }}>Gestão Completa</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', margin: 0, lineHeight: 1.4 }}>
                      Gestão integral de clientes, colaboradores, regras da empresa e infraestrutura.
                    </p>
                  </div>

                  {/* Suporte Técnico */}
                  <div style={{
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.05) 100%)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 6, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Headphones size={15} />
                      </div>
                      <div>
                        <strong style={{ fontSize: 12, color: 'var(--text-primary, #0f172a)' }}>Suporte</strong>
                        <span style={{ display: 'block', fontSize: 10, color: '#10b981', fontWeight: 600 }}>Atendimento Técnico</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', margin: 0, lineHeight: 1.4 }}>
                      Abertura e resolução de chamados, monitoramento de ramais/PBX e agenda técnica.
                    </p>
                  </div>

                  {/* Financeiro */}
                  <div style={{
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(217, 119, 6, 0.05) 100%)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 6, background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CreditCard size={15} />
                      </div>
                      <div>
                        <strong style={{ fontSize: 12, color: 'var(--text-primary, #0f172a)' }}>Financeiro</strong>
                        <span style={{ display: 'block', fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>Faturamento & Contas</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', margin: 0, lineHeight: 1.4 }}>
                      Emissão de cobranças Pix/Boleto, conciliação bancária Asaas e controle de receitas.
                    </p>
                  </div>

                  {/* Portal do Cliente */}
                  <div style={{
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(124, 58, 237, 0.05) 100%)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 6, background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Globe size={15} />
                      </div>
                      <div>
                        <strong style={{ fontSize: 12, color: 'var(--text-primary, #0f172a)' }}>Cliente</strong>
                        <span style={{ display: 'block', fontSize: 10, color: '#8b5cf6', fontWeight: 600 }}>Autosserviço Restrito</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', margin: 0, lineHeight: 1.4 }}>
                      Área restrita onde o cliente visualiza unicamente seus próprios tickets e faturas.
                    </p>
                  </div>
                </div>
              </div>

              {/* Barra de Busca e Legenda de Níveis */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                padding: '12px 16px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
                  <Search size={14} style={{ color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    placeholder="Filtrar por nome do módulo ou descrição..."
                    style={{
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      fontSize: 12,
                      width: '100%',
                      color: 'var(--text-primary, #0f172a)',
                    }}
                  />
                  {permSearch && (
                    <button
                      onClick={() => setPermSearch('')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>Legenda:</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontWeight: 600 }}>
                    🟢 Pode editar
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', fontWeight: 600 }}>
                    🔵 Somente visualizar
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: 600 }}>
                    ⚪ Sem acesso
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe', fontWeight: 600 }}>
                    🟣 Seus registros
                  </span>
                </div>
              </div>

              {/* Tabela interativa de permissões */}
              <div className="table-scroll">
                <table className="role-matrix">
                  <thead>
                    <tr>
                      <th style={{ width: '34%' }}>Módulo do Sistema & Finalidade</th>
                      <th style={{ width: '16.5%' }}>Administrador</th>
                      <th style={{ width: '16.5%' }}>Suporte</th>
                      <th style={{ width: '16.5%' }}>Financeiro</th>
                      <th style={{ width: '16.5%' }}>Cliente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rolePermissions
                      .filter((r) =>
                        !permSearch ||
                        r.moduleName.toLowerCase().includes(permSearch.toLowerCase()) ||
                        r.description.toLowerCase().includes(permSearch.toLowerCase())
                      )
                      .map((rule) => (
                        <tr key={rule.moduleId}>
                          <td style={{ textAlign: 'left', padding: '14px 16px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary, #0f172a)', fontSize: 13, marginBottom: 2 }}>
                              {rule.moduleName}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', lineHeight: 1.35 }}>
                              {rule.description}
                            </div>
                          </td>

                          {/* Administrador */}
                          <td>
                            <select
                              value={rule.admin}
                              onChange={(e) => updatePermissionLevel(rule.moduleId, 'admin', e.target.value as PermissionLevel)}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                borderRadius: 8,
                                padding: '6px 8px',
                                borderWidth: 1,
                                cursor: 'pointer',
                                outline: 'none',
                                background: rule.admin === 'manage' ? '#ecfdf5' : rule.admin === 'view' ? '#eff6ff' : '#f8fafc',
                                color: rule.admin === 'manage' ? '#065f46' : rule.admin === 'view' ? '#1e40af' : '#64748b',
                                borderColor: rule.admin === 'manage' ? '#a7f3d0' : rule.admin === 'view' ? '#bfdbfe' : '#e2e8f0',
                              }}
                            >
                              <option value="manage">🟢 Pode editar</option>
                              <option value="view">🔵 Somente visualizar</option>
                              <option value="none">⚪ Sem acesso</option>
                            </select>
                          </td>

                          {/* Suporte */}
                          <td>
                            <select
                              value={rule.support}
                              onChange={(e) => updatePermissionLevel(rule.moduleId, 'support', e.target.value as PermissionLevel)}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                borderRadius: 8,
                                padding: '6px 8px',
                                borderWidth: 1,
                                cursor: 'pointer',
                                outline: 'none',
                                background: rule.support === 'manage' ? '#ecfdf5' : rule.support === 'view' ? '#eff6ff' : '#f8fafc',
                                color: rule.support === 'manage' ? '#065f46' : rule.support === 'view' ? '#1e40af' : '#64748b',
                                borderColor: rule.support === 'manage' ? '#a7f3d0' : rule.support === 'view' ? '#bfdbfe' : '#e2e8f0',
                              }}
                            >
                              <option value="manage">🟢 Pode editar</option>
                              <option value="view">🔵 Somente visualizar</option>
                              <option value="none">⚪ Sem acesso</option>
                            </select>
                          </td>

                          {/* Financeiro */}
                          <td>
                            <select
                              value={rule.finance}
                              onChange={(e) => updatePermissionLevel(rule.moduleId, 'finance', e.target.value as PermissionLevel)}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                borderRadius: 8,
                                padding: '6px 8px',
                                borderWidth: 1,
                                cursor: 'pointer',
                                outline: 'none',
                                background: rule.finance === 'manage' ? '#ecfdf5' : rule.finance === 'view' ? '#eff6ff' : '#f8fafc',
                                color: rule.finance === 'manage' ? '#065f46' : rule.finance === 'view' ? '#1e40af' : '#64748b',
                                borderColor: rule.finance === 'manage' ? '#a7f3d0' : rule.finance === 'view' ? '#bfdbfe' : '#e2e8f0',
                              }}
                            >
                              <option value="manage">🟢 Pode editar</option>
                              <option value="view">🔵 Somente visualizar</option>
                              <option value="none">⚪ Sem acesso</option>
                            </select>
                          </td>

                          {/* Cliente */}
                          <td>
                            <select
                              value={rule.client}
                              onChange={(e) => updatePermissionLevel(rule.moduleId, 'client', e.target.value as PermissionLevel)}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                borderRadius: 8,
                                padding: '6px 8px',
                                borderWidth: 1,
                                cursor: 'pointer',
                                outline: 'none',
                                background: rule.client === 'own' ? '#f5f3ff' : rule.client === 'view' ? '#eff6ff' : '#f8fafc',
                                color: rule.client === 'own' ? '#5b21b6' : rule.client === 'view' ? '#1e40af' : '#64748b',
                                borderColor: rule.client === 'own' ? '#ddd6fe' : rule.client === 'view' ? '#bfdbfe' : '#e2e8f0',
                              }}
                            >
                              <option value="own">🟣 Seus registros</option>
                              <option value="view">🔵 Somente visualizar</option>
                              <option value="none">⚪ Sem acesso</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Rodapé com botão de salvar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 16, borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} style={{ color: '#10b981' }} />
                  <span>
                    As regras configuradas são gravadas de forma persistente e validadas pelo motor de governança (WritePolicyEngine).
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="secondary"
                    onClick={() => setResetPermsConfirm(true)}
                    disabled={savingPerms}
                  >
                    <RotateCcw size={14} />
                    Restaurar padrões
                  </Button>
                  <Button
                    onClick={() => void saveRolePermissionsList()}
                    loading={savingPerms}
                  >
                    <Save size={14} />
                    Salvar alterações
                  </Button>
                </div>
              </div>
            </>
          )}
          {(tab === 'categories' || tab === 'services') && (
            <>
              <div className="settings-section-head">
                <h2>{tab === 'categories' ? 'Categorias de tickets' : 'Tipos de serviços'}</h2>
                <p>
                  {tab === 'categories'
                    ? 'Classifique os chamados para organizar o atendimento.'
                    : 'Organize os serviços que podem ser associados aos clientes.'}
                </p>
              </div>
              <form
                className="tag-input-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addTag();
                }}
              >
                <input
                  className="input"
                  aria-label={tab === 'categories' ? 'Nova categoria' : 'Novo tipo de serviço'}
                  placeholder={
                    tab === 'categories' ? 'Nome da categoria' : 'Nome do tipo de serviço'
                  }
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  maxLength={60}
                />
                <Button type="submit" loading={busy}>
                  <Plus size={14} />
                  Adicionar
                </Button>
              </form>
              <div className="tag-list">
                {data.settings[listKey].map((t) => (
                  <span className="editable-tag" key={t}>
                    {t}
                    <button aria-label={`Remover ${t}`} onClick={() => setRemoveTag(t)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <p className="search-hint">
                Os itens já utilizados em registros são preservados para manter os vínculos
                existentes.
              </p>
            </>
          )}
          {tab === 'preferences' && (
            <>
              <div className="settings-section-head">
                <h2>Preferências visuais</h2>
                <p>Ajuste a densidade de informações para sua rotina.</p>
              </div>
              <div className="role-options" style={{ maxWidth: 500 }}>
                {[
                  {
                    id: 'comfortable',
                    name: 'Confortável',
                    description: 'Mais espaço entre registros',
                  },
                  { id: 'compact', name: 'Compacta', description: 'Mais informações por tela' },
                ].map((d) => (
                  <button
                    className={`role-option ${data.settings.density === d.id ? 'selected' : ''}`}
                    key={d.id}
                    onClick={() =>
                      void saveSettings({ ...data.settings, density: d.id as Settings['density'] })
                    }
                    aria-pressed={data.settings.density === d.id}
                  >
                    <span className="role-check">
                      {data.settings.density === d.id && <Check size={9} />}
                    </span>
                    <ListFilter size={20} />
                    <strong>{d.name}</strong>
                    <small>{d.description}</small>
                  </button>
                ))}
              </div>
              <div className="alert">
                <Palette size={16} />
                <span>
                  A identidade visual da central usa o azul-escuro institucional e superfícies
                  claras.
                </span>
              </div>
            </>
          )}
          {tab === 'reset' && (
            <>
              <div className="settings-section-head">
                <h2>Sincronização de Dados</h2>
                <p>Resumo dos registros armazenados na sua organização.</p>
              </div>
              <div className="grid-3" style={{ gap: 12, marginBottom: 24 }}>
                {[
                  { name: 'Clientes', value: data.clients.length },
                  { name: 'Tickets', value: data.tickets.length },
                  { name: 'Servidores', value: data.servers.length },
                ].map((d) => (
                  <div className="stat-card" key={d.name}>
                    <div className="stat-top">{d.name}</div>
                    <div className="stat-value" style={{ fontSize: 24 }}>
                      {d.value}
                    </div>
                  </div>
                ))}
              </div>
              <div className="reset-block">
                <h3>Sincronizar dados com a nuvem</h3>
                <p>
                  Esta ação atualiza o cache local e força uma sincronização
                  completa de todos os registros da empresa com a nuvem.
                </p>
                <Button variant="secondary" onClick={() => setResetOpen(true)}>
                  <RotateCcw size={14} />
                  Sincronizar dados agora
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={resetOpen}
        title="Sincronizar dados com a nuvem?"
        description="A sessão atualizará todos os indicadores e registros da organização. Deseja continuar?"
        onClose={() => setResetOpen(false)}
        onConfirm={reset}
      />
      <ConfirmDialog
        open={!!removeTag}
        title={`Remover ${tab === 'services' ? 'tipo de serviço' : 'categoria'}?`}
        description={`O item “${removeTag}” será removido das opções para novos cadastros. Itens em uso não podem ser removidos.`}
        onClose={() => setRemoveTag(null)}
        onConfirm={async () => {
          if (!removeTag) return;
          const used =
            tab === 'services'
              ? data.services.some((s) => s.type === removeTag)
              : data.tickets.some((t) => t.category === removeTag);
          if (used) {
            notify(
              'Este item está em uso. Atualize os registros vinculados antes de removê-lo.',
              'error',
            );
            throw new Error('Item em uso');
          }
          await updateSettings({
            ...data.settings,
            [listKey]: data.settings[listKey].filter((x) => x !== removeTag),
          });
          notify('Item removido.');
        }}
      />
      <ConfirmDialog
        open={!!deactivate}
        danger={deactivate?.active ?? true}
        title={`${deactivate?.active ? 'Inativar' : 'Ativar'} usuário?`}
        description={`Deseja ${deactivate?.active ? 'inativar' : 'ativar'} ${deactivate?.name}? Os registros anteriores continuarão vinculados.`}
        onClose={() => setDeactivate(null)}
        onConfirm={async () => {
          if (deactivate) {
            await patch('users', deactivate.id, { active: !deactivate.active });
            notify('Usuário atualizado.');
          }
        }}
      />
      <ConfirmDialog
        open={resetPermsConfirm}
        title="Restaurar padrões de permissões?"
        description="Deseja redefinir a matriz de permissões operacionais para os valores recomendados de fábrica? As regras customizadas atuais serão substituídas."
        onClose={() => setResetPermsConfirm(false)}
        onConfirm={handleResetDefaultPermissions}
      />
    </div>
  );
}
