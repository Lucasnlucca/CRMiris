import { useState } from 'react';
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
} from 'lucide-react';
import { useApp } from '../context/AppContext';
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
import type { Role, Settings, User } from '../types';
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
  const [tab, setTab] = useState('company'),
    [company, setCompany] = useState<Settings['company']>({ ...data.settings.company }),
    [busy, setBusy] = useState(false),
    [resetOpen, setResetOpen] = useState(false),
    [newTag, setNewTag] = useState(''),
    [removeTag, setRemoveTag] = useState<string | null>(null),
    [userModal, setUserModal] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [userError, setUserError] = useState(''),
    [deactivate, setDeactivate] = useState<User | null>(null),
    [companyError, setCompanyError] = useState('');
  const listKey = tab === 'services' ? 'serviceTypes' : 'ticketCategories';
  const updateCompany = (key: keyof Settings['company'], value: string) =>
    setCompany((c) => ({ ...c, [key]: value }));
  async function saveSettings(next: Settings) {
    setBusy(true);
    try {
      await updateSettings(next);
      notify('Configurações salvas com sucesso.');
    } catch {
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
                disabled={user.id === session?.userId}
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
                disabled={user.id === session?.userId}
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
              <div className="settings-section-head">
                <h2>Perfis de acesso</h2>
                <p>Matriz de permissões operacionais por perfil de usuário.</p>
              </div>
              <div className="table-scroll">
                <table className="role-matrix">
                  <thead>
                    <tr>
                      <th>Módulo</th>
                      <th>Administrador</th>
                      <th>Suporte</th>
                      <th>Financeiro</th>
                      <th>Cliente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        name: 'Clientes & Contatos',
                        values: ['Gerenciar', 'Gerenciar', 'Consultar', 'Próprio cadastro'],
                      },
                      { name: 'Tickets & Chamados', values: ['Gerenciar', 'Gerenciar', '—', 'Seus tickets'] },
                      {
                        name: 'Servidores e Serviços',
                        values: ['Gerenciar', 'Gerenciar', '—', 'Seus serviços'],
                      },
                      {
                        name: 'Documentos & Arquivos',
                        values: ['Gerenciar', 'Gerenciar', 'Gerenciar', 'Disponibilizados'],
                      },
                      {
                        name: 'Cobranças & Notas',
                        values: ['Gerenciar', '—', 'Gerenciar', 'Suas cobranças'],
                      },
                      { name: 'Agenda Operacional', values: ['Gerenciar', 'Gerenciar', 'Gerenciar', '—'] },
                      { name: 'Configurações', values: ['Gerenciar', '—', '—', '—'] },
                    ].map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        {row.values.map((v, i) => (
                          <td key={i} className={v === 'Gerenciar' ? 'allowed' : ''}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="alert alert-info" style={{ marginTop: 20 }}>
                <ShieldCheck size={16} />
                <span>
                  As operações de escrita são validadas pelo motor de políticas (WritePolicyEngine) e isoladas por tenant no Appwrite.
                </span>
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
    </div>
  );
}
