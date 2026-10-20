import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleDollarSign,
  Edit3,
  FilePlus2,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Server as ServerIcon,
  ShieldCheck,
  Ticket as TicketIcon,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  FormPage,
  Modal,
  PageHeader,
  SearchInput,
  StatCard,
  Tabs,
} from '../../components/ui';
import type { Client, Contact, Service, Ticket } from '../../types';
import { date, dateTime, money, newId } from '../../utils/format';
import { effectiveChargeStatus } from '../../utils/finance';
import { maskCep, maskDocument, maskPhone, validateDocument } from '../../utils/validation';
import './clients.css';

const states = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];
const openStatus = ['Novo', 'Em andamento', 'Aguardando retorno'];
const clean = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const digits = (value: string) => value.replace(/\D/g, '');
const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const blankContact = (): Contact => ({
  id: newId('contact'),
  name: '',
  role: '',
  phone: '',
  email: '',
  primary: false,
});
const blankClient = (): Client => ({
  id: newId('client'),
  personType: 'PJ',
  name: '',
  tradeName: '',
  document: '',
  cep: '',
  address: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: 'SP',
  phone: '',
  email: '',
  status: 'Ativo',
  notes: '',
  createdAt: new Date().toISOString(),
  contacts: [],
});
const displayName = (client: Client) => client.tradeName || client.name;

function ContactFields({
  contact,
  onChange,
  errors = {},
}: {
  contact: Contact;
  onChange: (value: Contact) => void;
  errors?: Record<string, string>;
}) {
  const set = (key: keyof Contact, value: string | boolean) =>
    onChange({ ...contact, [key]: value });
  return (
    <div className="form-grid">
      <Field label="Nome do contato *" error={errors.name}>
        <input
          className="input"
          aria-label="Nome do contato"
          value={contact.name}
          onChange={(e) => set('name', e.target.value)}
          required
        />
      </Field>
      <Field label="Cargo / departamento">
        <input
          className="input"
          aria-label="Cargo do contato"
          value={contact.role}
          onChange={(e) => set('role', e.target.value)}
          placeholder="Ex.: responsável de TI"
        />
      </Field>
      <Field label="Telefone" error={errors.phone}>
        <input
          className="input"
          aria-label="Telefone do contato"
          type="tel"
          value={contact.phone}
          onChange={(e) => set('phone', maskPhone(e.target.value))}
          placeholder="(11) 99999-0000"
        />
      </Field>
      <Field label="E-mail" error={errors.email}>
        <input
          className="input"
          aria-label="E-mail do contato"
          type="email"
          value={contact.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="contato@empresa.example"
        />
      </Field>
      <label className="client-check">
        <input
          type="checkbox"
          checked={contact.primary}
          onChange={(e) => set('primary', e.target.checked)}
        />{' '}
        Contato principal
      </label>
    </div>
  );
}

function contactErrors(contact: Contact) {
  const errors: Record<string, string> = {};
  if (contact.name.trim().length < 2) errors.name = 'Informe o nome do contato.';
  if (contact.phone && ![10, 11].includes(digits(contact.phone).length))
    errors.phone = 'Informe um telefone com DDD.';
  if (contact.email && !emailValid(contact.email)) errors.email = 'Informe um e-mail válido.';
  return errors;
}

function ClientForm({
  client,
  onClose,
  onSaved,
}: {
  client?: Client;
  onClose: () => void;
  onSaved: (value: Client) => void;
}) {
  const { data, save, notify } = useApp();
  const [form, setForm] = useState<Client>(() =>
    client ? { ...client, contacts: client.contacts.map((c) => ({ ...c })) } : blankClient(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactError, setContactError] = useState<Record<string, string>>({});
  const set = <K extends keyof Client>(key: K, value: Client[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  function addContact() {
    if (!contact) return;
    const next = contactErrors(contact);
    setContactError(next);
    if (Object.keys(next).length) return;
    const normalized = {
      ...contact,
      name: contact.name.trim(),
      primary: contact.primary || form.contacts.length === 0,
    };
    const current = form.contacts
      .filter((item) => item.id !== contact.id)
      .map((item) => (normalized.primary ? { ...item, primary: false } : item));
    const contacts = [...current, normalized];
    if (!contacts.some((item) => item.primary) && contacts[0])
      contacts[0] = { ...contacts[0], primary: true };
    set('contacts', contacts);
    setContact(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 3) next.name = 'Informe pelo menos 3 caracteres.';
    if (!validateDocument(form.document, form.personType))
      next.document = `Informe um ${form.personType === 'PJ' ? 'CNPJ' : 'CPF'} válido.`;
    if (
      data.clients.some(
        (item) => item.id !== form.id && digits(item.document) === digits(form.document),
      )
    )
      next.document = 'Já existe um cliente com este documento.';
    if (![10, 11].includes(digits(form.phone).length)) next.phone = 'Informe um telefone com DDD.';
    if (!emailValid(form.email)) next.email = 'Informe um e-mail válido.';
    if (form.cep && digits(form.cep).length !== 8) next.cep = 'O CEP deve conter 8 dígitos.';
    if (contact) next.contact = 'Adicione ou cancele o contato em edição antes de salvar.';
    setErrors(next);
    if (Object.keys(next).length) {
      notify('Confira os campos indicados no formulário.', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await save('clients', {
        ...form,
        name: form.name.trim(),
        tradeName: form.personType === 'PF' ? '' : form.tradeName.trim(),
        email: form.email.trim(),
        notes: form.notes.trim(),
      });
      notify(client ? 'Cadastro do cliente atualizado.' : 'Cliente cadastrado com sucesso.');
      onSaved(result);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o cliente.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormPage
      eyebrow="GESTÃO DE CLIENTES"
      title={client ? `Editar cliente · ${displayName(client)}` : 'Cadastrar novo cliente'}
      description="Preencha os dados cadastrais, endereço e contatos principais da empresa ou cliente."
      backLabel={client ? 'Voltar para ficha do cliente' : 'Voltar para clientes'}
      onBack={onClose}
    >
      <form onSubmit={submit} className="client-form" noValidate>
        <p className="muted small">
          Preencha o cadastro para centralizar os serviços e atendimentos. Os campos com * são
          obrigatórios.
        </p>
        <h3 className="client-form-section">
          <Building2 size={17} /> Identificação
        </h3>
        <div className="form-grid">
          <Field label="Tipo de pessoa *">
            <select
              className="select"
              aria-label="Tipo de pessoa"
              value={form.personType}
              onChange={(e) => {
                const personType = e.target.value as Client['personType'];
                setForm((previous) => ({
                  ...previous,
                  personType,
                  document: maskDocument(previous.document, personType),
                }));
              }}
            >
              <option value="PJ">Pessoa jurídica</option>
              <option value="PF">Pessoa física</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              className="select"
              aria-label="Status do cliente"
              value={form.status}
              onChange={(e) => set('status', e.target.value as Client['status'])}
            >
              <option>Ativo</option>
              <option>Inativo</option>
            </select>
          </Field>
          <Field
            label={form.personType === 'PJ' ? 'Razão social *' : 'Nome completo *'}
            error={errors.name}
          >
            <input
              className="input"
              aria-label={form.personType === 'PJ' ? 'Razão social' : 'Nome completo'}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={form.personType === 'PJ' ? 'Razão social da empresa' : 'Nome do cliente'}
              autoFocus
              required
            />
          </Field>
          {form.personType === 'PJ' && (
            <Field label="Nome fantasia">
              <input
                className="input"
                aria-label="Nome fantasia"
                value={form.tradeName}
                onChange={(e) => set('tradeName', e.target.value)}
                placeholder="Nome comercial"
              />
            </Field>
          )}
          <Field label={`${form.personType === 'PJ' ? 'CNPJ' : 'CPF'} *`} error={errors.document}>
            <input
              className="input"
              aria-label={form.personType === 'PJ' ? 'CNPJ' : 'CPF'}
              inputMode="numeric"
              value={form.document}
              onChange={(e) => set('document', maskDocument(e.target.value, form.personType))}
              placeholder={form.personType === 'PJ' ? '00.000.000/0001-00' : '000.000.000-00'}
              required
            />
          </Field>
        </div>
        <h3 className="client-form-section">
          <MapPin size={17} /> Endereço
        </h3>
        <div className="form-grid">
          <Field label="CEP" error={errors.cep} hint="Preenchimento manual.">
            <input
              className="input"
              aria-label="CEP"
              inputMode="numeric"
              value={form.cep}
              onChange={(e) => set('cep', maskCep(e.target.value))}
              placeholder="00000-000"
            />
          </Field>
          <Field label="Endereço">
            <input
              className="input"
              aria-label="Endereço"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Rua ou avenida"
            />
          </Field>
          <Field label="Número">
            <input
              className="input"
              aria-label="Número do endereço"
              value={form.number}
              onChange={(e) => set('number', e.target.value)}
            />
          </Field>
          <Field label="Complemento">
            <input
              className="input"
              aria-label="Complemento"
              value={form.complement}
              onChange={(e) => set('complement', e.target.value)}
            />
          </Field>
          <Field label="Bairro">
            <input
              className="input"
              aria-label="Bairro"
              value={form.neighborhood}
              onChange={(e) => set('neighborhood', e.target.value)}
            />
          </Field>
          <Field label="Cidade">
            <input
              className="input"
              aria-label="Cidade"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
            />
          </Field>
          <Field label="Estado">
            <select
              className="select"
              aria-label="Estado"
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
            >
              {states.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </Field>
        </div>
        <h3 className="client-form-section">
          <Phone size={17} /> Canais de contato
        </h3>
        <div className="form-grid">
          <Field label="Telefone *" error={errors.phone}>
            <input
              className="input"
              aria-label="Telefone do cliente"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', maskPhone(e.target.value))}
              placeholder="(11) 99999-0000"
              required
            />
          </Field>
          <Field label="E-mail *" error={errors.email}>
            <input
              className="input"
              aria-label="E-mail do cliente"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="contato@empresa.com.br"
              required
            />
          </Field>
        </div>
        <div className="client-contact-editor">
          <div className="client-section-heading">
            <h4>Contatos da empresa</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setContact({ ...blankContact(), primary: form.contacts.length === 0 });
                setContactError({});
              }}
            >
              <Plus size={15} /> Adicionar contato
            </Button>
          </div>
          {form.contacts.map((item) => (
            <div className="client-contact-line" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span className="muted small">
                  {item.role || 'Contato'} {item.primary ? '· Principal' : ''}
                </span>
              </div>
              <div className="inline">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Editar contato ${item.name}`}
                  onClick={() => {
                    setContact({ ...item });
                    setContactError({});
                  }}
                >
                  <Edit3 size={15} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover contato ${item.name}`}
                  onClick={() => {
                    const remaining = form.contacts.filter((c) => c.id !== item.id);
                    if (item.primary && remaining[0])
                      remaining[0] = { ...remaining[0], primary: true };
                    set('contacts', remaining);
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
          {contact && (
            <div className="client-contact-fields">
              <ContactFields contact={contact} onChange={setContact} errors={contactError} />
              <div className="form-actions">
                <Button type="button" variant="ghost" size="sm" onClick={() => setContact(null)}>
                  Cancelar contato
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={addContact}>
                  <Check size={15} /> Adicionar ao cadastro
                </Button>
              </div>
            </div>
          )}
          {errors.contact && (
            <p className="client-error" role="alert">
              {errors.contact}
            </p>
          )}
          {!form.contacts.length && !contact && (
            <p className="muted small">
              Você pode adicionar os responsáveis pelo atendimento e pela empresa.
            </p>
          )}
        </div>
        <Field label="Observações">
          <textarea
            className="textarea"
            aria-label="Observações do cliente"
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Informações úteis para a equipe"
          />
        </Field>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            {client ? 'Salvar alterações' : 'Cadastrar cliente'}
          </Button>
        </div>
      </form>
    </FormPage>
  );
}

export function ClientsPage() {
  const { data, session, patch, remove, notify } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const [personType, setPersonType] = useState('');
  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const [toggle, setToggle] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const canManage = session?.role === 'admin' || session?.role === 'support';
  useEffect(() => {
    setStatus(params.get('status') || '');
    setSearch(params.get('q') || '');
    setPersonType(params.get('type') || '');
    setEditing(params.get('new') === '1' && canManage ? 'new' : null);
  }, [params, canManage]);
  const rows = useMemo(
    () =>
      data.clients.filter(
        (client) =>
          (!status || client.status === status) &&
          (!personType || client.personType === personType) &&
          clean(
            [
              client.name,
              client.tradeName,
              client.document,
              client.phone,
              client.email,
              client.city,
              ...client.contacts.map((contact) => contact.name),
            ].join(' '),
          ).includes(clean(search)),
      ),
    [data.clients, status, personType, search],
  );
  function closeForm() {
    setEditing(null);
    if (params.has('new')) {
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
  }
  if (session?.role === 'client')
    return (
      <EmptyState
        title="Área de uso interno"
        description="Acesse seus atendimentos no portal."
        action={<Button onClick={() => navigate('/portal/tickets')}>Meus tickets</Button>}
      />
    );
  if (editing)
    return (
      <ClientForm
        client={editing === 'new' ? undefined : editing}
        onClose={closeForm}
        onSaved={(client) => {
          const isNew = editing === 'new';
          closeForm();
          if (isNew) navigate(`/clientes/${client.id}`);
        }}
      />
    );
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="RELACIONAMENTO"
        title="Clientes & Contatos"
        description="Cada cliente, seus serviços e toda a jornada de atendimento."
        actions={
          canManage && (
            <Button onClick={() => setEditing('new')}>
              <Plus size={17} /> Novo cliente
            </Button>
          )
        }
      />
      <div className="client-stats">
        <StatCard
          label="Clientes cadastrados"
          value={data.clients.length}
          detail="Base de relacionamento"
          icon={Users}
          tone="blue"
        />
        <StatCard
          label="Clientes ativos"
          value={data.clients.filter((c) => c.status === 'Ativo').length}
          detail="Operação em andamento"
          icon={ShieldCheck}
          tone="green"
          onClick={() => setStatus('Ativo')}
        />
        <StatCard
          label="Serviços associados"
          value={data.services.length}
          detail="Distribuídos entre os clientes"
          icon={ServerIcon}
          tone="navy"
        />
      </div>
      <Card className="client-list-card">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar nome, documento ou contato..."
          />
          <div className="filters">
            <select
              className="select"
              aria-label="Filtrar clientes por status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              <option>Ativo</option>
              <option>Inativo</option>
            </select>
            <select
              className="select"
              aria-label="Filtrar tipo de pessoa"
              value={personType}
              onChange={(e) => setPersonType(e.target.value)}
            >
              <option value="">Todos os tipos</option>
              <option value="PJ">Pessoa jurídica</option>
              <option value="PF">Pessoa física</option>
            </select>
            {(search || status || personType) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setPersonType('');
                  setParams({});
                }}
              >
                Limpar
              </Button>
            )}
          </div>
        </div>
        <DataTable
          rows={rows}
          pageSize={8}
          onRowClick={(client) => navigate(`/clientes/${client.id}`)}
          emptyTitle="Nenhum cliente encontrado"
          columns={[
            {
              key: 'name',
              label: 'Cliente / razão social',
              sortValue: (c) => c.name,
              render: (c) => (
                <div className="client-name-cell">
                  <Avatar name={displayName(c)} size={36} />
                  <div>
                    <span className="cell-title">{displayName(c)}</span>
                    <span className="cell-subtitle">
                      {c.name !== displayName(c)
                        ? c.name
                        : c.personType === 'PJ'
                          ? 'Pessoa jurídica'
                          : 'Pessoa física'}
                    </span>
                  </div>
                </div>
              ),
            },
            {
              key: 'document',
              label: 'CPF / CNPJ',
              sortValue: (c) => c.document,
              render: (c) => <span className="client-nowrap">{c.document}</span>,
            },
            {
              key: 'contact',
              label: 'Contato principal',
              sortValue: (c) =>
                c.contacts.find((item) => item.primary)?.name || c.contacts[0]?.name || '',
              render: (c) => (
                <>
                  <span className="cell-title">
                    {c.contacts.find((item) => item.primary)?.name ||
                      c.contacts[0]?.name ||
                      'Não informado'}
                  </span>
                  <span className="cell-subtitle">{c.phone}</span>
                  <span className="cell-subtitle">{c.email}</span>
                </>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              sortValue: (c) => c.status,
              render: (c) => <Badge status={c.status} />,
            },
            {
              key: 'services',
              label: 'Serviços',
              sortValue: (c) => data.services.filter((service) => service.clientId === c.id).length,
              render: (c) => (
                <span className="client-service-count">
                  {data.services.filter((service) => service.clientId === c.id).length}
                  <span className="muted small"> associados</span>
                </span>
              ),
            },
            {
              key: 'actions',
              label: 'Ações',
              render: (c) => (
                <div className="inline" onClick={(event) => event.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Visualizar ${displayName(c)}`}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <ChevronRight size={17} />
                  </Button>
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${displayName(c)}`}
                        onClick={() => setEditing(c)}
                      >
                        <Edit3 size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`${c.status === 'Ativo' ? 'Inativar' : 'Ativar'} ${displayName(c)}`}
                        onClick={() => setToggle(c)}
                      >
                        <MoreHorizontal size={17} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Excluir ${displayName(c)}`}
                        title="Excluir cliente"
                        onClick={() => setClientToDelete(c)}
                      >
                        <Trash2 size={15} className="text-rose-600" />
                      </Button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
      <ConfirmDialog
        open={!!toggle}
        title={toggle?.status === 'Ativo' ? 'Inativar cliente?' : 'Ativar cliente?'}
        description={`${toggle ? displayName(toggle) : ''} ficará ${toggle?.status === 'Ativo' ? 'inativo' : 'ativo'} na base da empresa. Os registros relacionados serão preservados.`}
        danger={toggle?.status === 'Ativo'}
        onClose={() => setToggle(null)}
        onConfirm={async () => {
          if (!toggle) return;
          try {
            await patch('clients', toggle.id, {
              status: toggle.status === 'Ativo' ? 'Inativo' : 'Ativo',
            });
            notify('Status do cliente atualizado.');
            setToggle(null);
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível alterar o status.',
              'error',
            );
          }
        }}
      />
      <ConfirmDialog
        open={!!clientToDelete}
        title="Excluir cliente?"
        description={`Tem certeza que deseja excluir "${clientToDelete ? displayName(clientToDelete) : ''}"? O cadastro e seus dados serão removidos.`}
        danger
        onClose={() => setClientToDelete(null)}
        onConfirm={async () => {
          if (!clientToDelete) return;
          try {
            await remove('clients', clientToDelete.id);
            notify('Cliente excluído com sucesso.');
            setClientToDelete(null);
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o cliente.',
              'error',
            );
          }
        }}
      />
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="client-info">
      <span>{label}</span>
      <strong>{children || 'Não informado'}</strong>
    </div>
  );
}

function ServiceForm({
  client,
  service,
  onClose,
}: {
  client: Client;
  service?: Service;
  onClose: () => void;
}) {
  const { data, session, save, notify } = useApp();
  const [form, setForm] = useState<Service>(() =>
    service
      ? { ...service }
      : {
          id: newId('service'),
          clientId: client.id,
          name: '',
          type: data.settings.serviceTypes[0] || 'PABX Cloud',
          serverId: '',
          status: 'Ativo',
          extensions: 1,
          channels: 2,
          monthlyValue: 0,
          notes: '',
        },
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Service>(key: K, value: Service[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim().length < 3) {
      setError('Informe um nome com pelo menos 3 caracteres.');
      return;
    }
    if (
      [form.extensions, form.channels, form.monthlyValue].some(
        (number) => !Number.isFinite(number) || number < 0,
      ) ||
      !Number.isInteger(form.extensions) ||
      !Number.isInteger(form.channels)
    ) {
      setError('Informe quantidades inteiras e valores não negativos.');
      return;
    }
    setBusy(true);
    try {
      await save('services', {
        ...form,
        name: form.name.trim(),
        serverId: form.serverId || undefined,
      });
      notify(service ? 'Serviço atualizado.' : 'Serviço associado ao cliente.');
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormPage
      eyebrow="OPERAÇÕES & SERVIÇOS"
      title={service ? `Editar serviço · ${service.name}` : 'Associar novo serviço'}
      description={`Vincule serviços e recursos de telefonia ao cliente ${displayName(client)}.`}
      backLabel={`Voltar para ${displayName(client)}`}
      onBack={onClose}
    >
      <form onSubmit={submit} noValidate>
        <div className="alert alert-info">
          Cliente: <strong>{displayName(client)}</strong>
        </div>
        <div className="form-grid">
          <Field label="Nome do serviço *">
            <input
              className="input"
              aria-label="Nome do serviço"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex.: PABX Cloud · Matriz"
              required
              autoFocus
            />
          </Field>
          <Field label="Tipo de serviço">
            <select
              className="select"
              aria-label="Tipo de serviço"
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
            >
              {Array.from(new Set([...data.settings.serviceTypes, form.type])).map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="Servidor / ambiente">
            <select
              className="select"
              aria-label="Servidor do serviço"
              value={form.serverId || ''}
              onChange={(e) => set('serverId', e.target.value)}
            >
              <option value="">Sem servidor associado</option>
              {data.servers.map((server) => (
                <option value={server.id} key={server.id}>
                  {server.name} · {server.domain}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className="select"
              aria-label="Status do serviço"
              value={form.status}
              onChange={(e) => set('status', e.target.value as Service['status'])}
            >
              <option>Ativo</option>
              <option>Suspenso</option>
              <option>Cancelado</option>
            </select>
          </Field>
          <Field label="Quantidade de ramais">
            <input
              className="input"
              aria-label="Quantidade de ramais"
              type="number"
              min="0"
              step="1"
              value={form.extensions}
              onChange={(e) => set('extensions', Number(e.target.value))}
            />
          </Field>
          <Field label="Canais simultâneos">
            <input
              className="input"
              aria-label="Canais simultâneos"
              type="number"
              min="0"
              step="1"
              value={form.channels}
              onChange={(e) => set('channels', Number(e.target.value))}
            />
          </Field>
          {session?.role !== 'support' && (
            <Field label="Valor mensal (R$)">
              <input
                className="input"
                aria-label="Valor mensal do serviço"
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyValue}
                onChange={(e) => set('monthlyValue', Number(e.target.value))}
              />
            </Field>
          )}
        </div>
        <Field label="Observações">
          <textarea
            className="textarea"
            aria-label="Observações do serviço"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
          />
        </Field>
        {error && (
          <p role="alert" className="client-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            {service ? 'Salvar alterações' : 'Associar serviço'}
          </Button>
        </div>
      </form>
    </FormPage>
  );
}

export function ClientDetailPage() {
  const { id } = useParams();
  const { data, session, patch, remove, notify } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactError, setContactError] = useState<Record<string, string>>({});
  const [removeContact, setRemoveContact] = useState<Contact | null>(null);
  const [service, setService] = useState<Service | 'new' | null>(null);
  const [associateServer, setAssociateServer] = useState(false);
  const [selectedServer, setSelectedServer] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [toggle, setToggle] = useState(false);
  const [deleteClientOpen, setDeleteClientOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const client = data.clients.find((item) => item.id === id);
  useEffect(() => {
    setEditing(false);
    setContact(null);
    setContactError({});
    setRemoveContact(null);
    setService(null);
    setAssociateServer(false);
    setSelectedServer('');
    setSelectedServiceId('');
    setToggle(false);
  }, [id, session?.role]);
  const canManage = session?.role === 'admin' || session?.role === 'support';
  const canFinance = session?.role === 'admin' || session?.role === 'finance';
  if (!client || session?.role === 'client')
    return (
      <EmptyState
        title="Cliente não disponível"
        description="O cadastro não foi encontrado ou não está disponível para este perfil."
        action={
          <Button
            variant="secondary"
            onClick={() => navigate(session?.role === 'client' ? '/portal' : '/clientes')}
          >
            Voltar
          </Button>
        }
      />
    );
  const services = data.services.filter((item) => item.clientId === client.id);
  const servers = data.servers.filter(
    (item) =>
      item.clientIds.includes(client.id) ||
      services.some((s) => s.serverId === item.id && s.status !== 'Cancelado'),
  );
  const tickets = data.tickets
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const documents = data.documents.filter((item) => item.clientId === client.id);
  const charges = data.charges
    .filter((item) => item.clientId === client.id)
    .map((item) => ({ ...item, status: effectiveChargeStatus(item) }));
  const events = data.events
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => a.start.localeCompare(b.start));
  const activities = data.activities
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const mainContact = client.contacts.find((item) => item.primary) || client.contacts[0];
  const tabItems = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'registration', label: 'Dados cadastrais' },
    { id: 'contacts', label: 'Contatos', count: client.contacts.length },
    { id: 'services', label: 'Serviços', count: services.length },
    { id: 'servers', label: 'Servidores e domínios', count: servers.length },
    { id: 'tickets', label: 'Tickets', count: tickets.length },
    { id: 'documents', label: 'Contratos e documentos', count: documents.length },
    ...(canFinance ? [{ id: 'finance', label: 'Financeiro' }] : []),
    { id: 'agenda', label: 'Agenda' },
    { id: 'history', label: 'Histórico' },
  ];
  const requestedTab = params.get('tab') || 'overview';
  const tab = tabItems.some((item) => item.id === requestedTab) ? requestedTab : 'overview';
  const setTab = (value: string) => setParams({ tab: value }, { replace: true });
  async function saveContact(event: FormEvent) {
    event.preventDefault();
    if (!client || !contact) return;
    const errors = contactErrors(contact);
    setContactError(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const normalized = {
        ...contact,
        name: contact.name.trim(),
        primary: contact.primary || client.contacts.length === 0,
      };
      let contacts = client.contacts.some((item) => item.id === contact.id)
        ? client.contacts.map((item) => (item.id === contact.id ? normalized : item))
        : [...client.contacts, normalized];
      if (normalized.primary)
        contacts = contacts.map((item) => ({ ...item, primary: item.id === normalized.id }));
      if (!contacts.some((item) => item.primary) && contacts[0])
        contacts[0] = { ...contacts[0], primary: true };
      await patch('clients', client.id, { contacts });
      setContact(null);
      notify('Contato salvo no cadastro.');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Não foi possível salvar o contato.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }
  const openContact = (value?: Contact) => {
    setContact(value ? { ...value } : { ...blankContact(), primary: client.contacts.length === 0 });
    setContactError({});
  };
  const ticketTable = (rows: Ticket[], compact = false) => (
    <DataTable
      rows={rows}
      pageSize={compact ? 4 : 8}
      onRowClick={(ticket) => navigate(`/tickets/${ticket.id}`)}
      emptyTitle="Este cliente ainda não tem tickets"
      columns={[
        {
          key: 'ticket',
          label: 'Ticket',
          sortValue: (ticket) => ticket.number,
          render: (ticket) => (
            <>
              <span className="cell-subtitle">#{ticket.number}</span>
              <span className="cell-title">{ticket.title}</span>
            </>
          ),
        },
        {
          key: 'status',
          label: 'Status',
          sortValue: (ticket) => ticket.status,
          render: (ticket) => <Badge status={ticket.status} />,
        },
        {
          key: 'priority',
          label: 'Prioridade',
          sortValue: (ticket) => ticket.priority,
          render: (ticket) => <Badge status={ticket.priority} />,
        },
        {
          key: 'updatedAt',
          label: 'Atualização',
          sortValue: (ticket) => ticket.updatedAt,
          render: (ticket) => <span className="small">{dateTime(ticket.updatedAt)}</span>,
        },
      ]}
    />
  );
  if (editing) {
    return (
      <ClientForm
        client={client}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }
  if (service) {
    return (
      <ServiceForm
        client={client}
        service={service === 'new' ? undefined : service}
        onClose={() => setService(null)}
      />
    );
  }
  if (contact) {
    return (
      <FormPage
        eyebrow={displayName(client)}
        title={
          client.contacts.some((item) => item.id === contact.id) ? 'Editar contato' : 'Novo contato'
        }
        description="Contatos podem receber tickets, comunicados operacionais e cobranças."
        backLabel={`Voltar para ${displayName(client)}`}
        onBack={() => setContact(null)}
      >
        <form className="modal-form" onSubmit={saveContact}>
          <ContactFields
            contact={contact}
            errors={contactError}
            onChange={(updated) => setContact(updated)}
          />
          <label className="check-item">
            <input
              type="checkbox"
              checked={contact.primary}
              onChange={(event) => setContact({ ...contact, primary: event.target.checked })}
            />
            Definir como contato principal
          </label>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setContact(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar contato'}
            </Button>
          </div>
        </form>
      </FormPage>
    );
  }
  if (associateServer) {
    return (
      <FormPage
        eyebrow={displayName(client)}
        title="Associar servidor ao cliente"
        description="Vincule um servidor existente e, opcionalmente, um serviço do cliente."
        backLabel={`Voltar para ${displayName(client)}`}
        onBack={() => setAssociateServer(false)}
      >
        <form
          className="modal-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedServer) return;
            setBusy(true);
            try {
              const server = data.servers.find((item) => item.id === selectedServer);
              if (server && !server.clientIds.includes(client.id)) {
                await patch('servers', server.id, { clientIds: [...server.clientIds, client.id] });
              }
              if (selectedServiceId) {
                await patch('services', selectedServiceId, { serverId: selectedServer });
              }
              setAssociateServer(false);
              setSelectedServer('');
              setSelectedServiceId('');
              notify('Servidor associado ao cliente.');
            } catch (error) {
              notify(
                error instanceof Error ? error.message : 'Não foi possível associar o servidor.',
                'error',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Servidor">
            <select
              className="select"
              value={selectedServer}
              onChange={(event) => setSelectedServer(event.target.value)}
            >
              <option value="">Selecione um servidor</option>
              {data.servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} · {server.domain} ({server.environment})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vincular a um serviço do cliente">
            <select
              className="select"
              value={selectedServiceId}
              onChange={(event) => setSelectedServiceId(event.target.value)}
            >
              <option value="">Apenas associar ao cadastro</option>
              {services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.type}
                </option>
              ))}
            </select>
          </Field>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setAssociateServer(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!selectedServer || busy}>
              {busy ? 'Salvando...' : 'Associar servidor'}
            </Button>
          </div>
        </form>
      </FormPage>
    );
  }
  return (
    <div className="page-stack">
      <Link to="/clientes" className="client-back">
        <ArrowLeft size={15} /> Clientes
      </Link>
      <PageHeader
        eyebrow="FICHA DO CLIENTE"
        title={displayName(client)}
        description={
          client.name !== displayName(client)
            ? client.name
            : client.personType === 'PJ'
              ? 'Pessoa jurídica'
              : 'Pessoa física'
        }
        actions={
          <div className="inline">
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Edit3 size={16} /> Editar cadastro
                </Button>
                <Button onClick={() => navigate(`/tickets?client=${client.id}&new=1`)}>
                  <Plus size={17} /> Abrir ticket
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setDeleteClientOpen(true)}
                  title="Excluir este cliente"
                >
                  <Trash2 size={16} /> Excluir cliente
                </Button>
              </>
            )}
          </div>
        }
      />
      <Card className="client-summary-card">
        <div className="client-summary-main">
          <Avatar name={displayName(client)} size={56} />
          <div>
            <div className="inline">
              <strong>{displayName(client)}</strong>
              <Badge status={client.status} />
            </div>
            <p className="muted small">
              {client.document} <span>·</span> Cliente desde {date(client.createdAt)}
            </p>
          </div>
        </div>
        <div className="client-summary-details">
          <span>
            <MapPin size={15} />{' '}
            {[client.city, client.state].filter(Boolean).join(' / ') || 'Localidade não informada'}
          </span>
          <span>
            <Phone size={15} /> {client.phone}
          </span>
          <span>
            <Mail size={15} /> {client.email}
          </span>
        </div>
      </Card>
      <Tabs items={tabItems} value={tab} onChange={setTab} />
      {tab === 'overview' && (
        <>
          <div className="client-stats">
            <StatCard
              label="Serviços ativos"
              value={services.filter((item) => item.status === 'Ativo').length}
              detail={`${servers.length} ambiente(s) associado(s)`}
              icon={ServerIcon}
              tone="blue"
              onClick={() => setTab('services')}
            />
            <StatCard
              label="Tickets em aberto"
              value={tickets.filter((item) => openStatus.includes(item.status)).length}
              detail={`${tickets.length} no histórico de atendimento`}
              icon={TicketIcon}
              tone="amber"
              onClick={() => setTab('tickets')}
            />
            {canFinance ? (
              <StatCard
                label="Valores em aberto"
                value={money(
                  charges
                    .filter((item) => ['Pendente', 'Vencido'].includes(item.status))
                    .reduce((sum, item) => sum + item.amount, 0),
                )}
                detail="Cobranças pendentes e vencidas"
                icon={CircleDollarSign}
                tone="navy"
                onClick={() => setTab('finance')}
              />
            ) : (
              <StatCard
                label="Documentos"
                value={documents.length}
                detail="Arquivos e contratos vinculados"
                icon={FileText}
                tone="navy"
                onClick={() => setTab('documents')}
              />
            )}
          </div>
          <div className="client-overview-grid">
            <Card>
              <div className="client-section-heading">
                <h3>Relacionamento</h3>
                <Button variant="ghost" size="sm" onClick={() => setTab('registration')}>
                  Ver cadastro <ArrowRight size={14} />
                </Button>
              </div>
              <div className="client-information-grid">
                <Info label="Contato principal">{mainContact?.name}</Info>
                <Info label="Departamento">{mainContact?.role}</Info>
                <Info label="Telefone">{mainContact?.phone || client.phone}</Info>
                <Info label="E-mail">{mainContact?.email || client.email}</Info>
                <Info label="Endereço">
                  {[client.address, client.number].filter(Boolean).join(', ')}
                </Info>
                <Info label="Cidade / UF">
                  {[client.city, client.state].filter(Boolean).join(' / ')}
                </Info>
              </div>
              {client.notes && (
                <div className="client-notes">
                  <span className="muted small">OBSERVAÇÕES</span>
                  <p>{client.notes}</p>
                </div>
              )}
            </Card>
            <Card>
              <div className="client-section-heading">
                <h3>{canManage ? 'Ações rápidas' : 'Acessos rápidos'}</h3>
              </div>
              <div className="client-quick-actions">
                {canManage ? (
                  <>
                    <button
                      onClick={() => {
                        setService('new');
                      }}
                    >
                      <span>
                        <ServerIcon size={18} /> Associar serviço
                      </span>
                      <ChevronRight size={15} />
                    </button>
                    <button onClick={() => openContact()}>
                      <span>
                        <UserPlus size={18} /> Adicionar contato
                      </span>
                      <ChevronRight size={15} />
                    </button>
                    <button onClick={() => navigate(`/documentos?client=${client.id}&new=1`)}>
                      <span>
                        <FilePlus2 size={18} /> Adicionar documento
                      </span>
                      <ChevronRight size={15} />
                    </button>
                    <button onClick={() => navigate(`/agenda?client=${client.id}&new=1`)}>
                      <span>
                        <CalendarPlus size={18} /> Agendar compromisso
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setTab('documents')}>
                      <span>
                        <FileText size={18} /> Documentos do cliente
                      </span>
                      <ChevronRight size={15} />
                    </button>
                    <button onClick={() => setTab('finance')}>
                      <span>
                        <CircleDollarSign size={18} /> Histórico financeiro
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  </>
                )}
              </div>
            </Card>
          </div>
          <Card>
            <div className="client-section-heading">
              <h3>Atendimentos recentes</h3>
              <Button variant="ghost" size="sm" onClick={() => setTab('tickets')}>
                Todos os tickets <ArrowRight size={14} />
              </Button>
            </div>
            {ticketTable(tickets.slice(0, 4), true)}
          </Card>
        </>
      )}
      {tab === 'registration' && (
        <Card>
          <div className="client-section-heading">
            <h3>Dados cadastrais</h3>
            {canManage && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Edit3 size={15} /> Editar
              </Button>
            )}
          </div>
          <div className="client-information-grid registration">
            <Info label="Tipo de pessoa">
              {client.personType === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}
            </Info>
            <Info label="Status">
              <Badge status={client.status} />
            </Info>
            <Info label={client.personType === 'PJ' ? 'Razão social' : 'Nome completo'}>
              {client.name}
            </Info>
            {client.personType === 'PJ' && <Info label="Nome fantasia">{client.tradeName}</Info>}
            <Info label={client.personType === 'PJ' ? 'CNPJ' : 'CPF'}>{client.document}</Info>
            <Info label="CEP">{client.cep}</Info>
            <Info label="Endereço">{client.address}</Info>
            <Info label="Número">{client.number}</Info>
            <Info label="Complemento">{client.complement}</Info>
            <Info label="Bairro">{client.neighborhood}</Info>
            <Info label="Cidade">{client.city}</Info>
            <Info label="Estado">{client.state}</Info>
            <Info label="Telefone">{client.phone}</Info>
            <Info label="E-mail">{client.email}</Info>
            <Info label="Data de cadastro">{dateTime(client.createdAt)}</Info>
          </div>
          <div className="client-notes">
            <span className="muted small">OBSERVAÇÕES</span>
            <p>{client.notes || 'Nenhuma observação cadastrada.'}</p>
          </div>
          {canManage && (
            <div className="client-status-action">
              <div>
                <strong>
                  {client.status === 'Ativo' ? 'Inativar cadastro' : 'Reativar cadastro'}
                </strong>
                <p className="small muted">
                  O histórico e os registros relacionados são preservados.
                </p>
              </div>
              <Button
                variant={client.status === 'Ativo' ? 'danger' : 'secondary'}
                size="sm"
                onClick={() => setToggle(true)}
              >
                {client.status === 'Ativo' ? 'Inativar cliente' : 'Ativar cliente'}
              </Button>
            </div>
          )}
        </Card>
      )}
      {tab === 'contacts' && (
        <Card>
          <div className="client-section-heading">
            <div>
              <h3>Contatos</h3>
              <p className="muted small">Pessoas de referência para os atendimentos.</p>
            </div>
            {canManage && (
              <Button onClick={() => openContact()} size="sm">
                <UserPlus size={16} /> Adicionar contato
              </Button>
            )}
          </div>
          {client.contacts.length ? (
            <div className="client-contacts-grid">
              {client.contacts.map((item) => (
                <div className="client-contact-card" key={item.id}>
                  <div className="client-section-heading">
                    <Avatar name={item.name} size={40} />
                    {item.primary && <Badge status="Ativo">Principal</Badge>}
                  </div>
                  <h4>{item.name}</h4>
                  <p className="muted small">{item.role || 'Contato do cliente'}</p>
                  <div className="client-contact-methods">
                    <span>
                      <Phone size={14} /> {item.phone || 'Telefone não informado'}
                    </span>
                    <span>
                      <Mail size={14} /> {item.email || 'E-mail não informado'}
                    </span>
                  </div>
                  {canManage && (
                    <div className="client-contact-actions">
                      <Button variant="ghost" size="sm" onClick={() => openContact(item)}>
                        <Edit3 size={14} /> Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Excluir contato ${item.name}`}
                        onClick={() => setRemoveContact(item)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nenhum contato cadastrado"
              description="Adicione os responsáveis pelo relacionamento com este cliente."
              action={canManage && <Button onClick={() => openContact()}>Adicionar contato</Button>}
            />
          )}
        </Card>
      )}
      {tab === 'services' && (
        <Card>
          <div className="client-section-heading">
            <div>
              <h3>Serviços associados</h3>
              <p className="muted small">Planos, ramais e recursos contratados pelo cliente.</p>
            </div>
            {canManage && (
              <Button size="sm" onClick={() => setService('new')}>
                <Plus size={16} /> Associar serviço
              </Button>
            )}
          </div>
          <DataTable
            rows={services}
            emptyTitle="Nenhum serviço associado"
            columns={[
              {
                key: 'name',
                label: 'Serviço',
                sortValue: (item) => item.name,
                render: (item) => (
                  <>
                    <span className="cell-title">{item.name}</span>
                    <span className="cell-subtitle">{item.type}</span>
                  </>
                ),
              },
              {
                key: 'server',
                label: 'Servidor',
                render: (item) => {
                  const server = data.servers.find((s) => s.id === item.serverId);
                  return server ? (
                    session?.role === 'finance' ? (
                      <span>{server.name}</span>
                    ) : (
                      <Link className="link" to={`/servidores/${server.id}`}>
                        {server.name}
                      </Link>
                    )
                  ) : (
                    <span className="muted">Não associado</span>
                  );
                },
              },
              {
                key: 'extensions',
                label: 'Ramais / canais',
                sortValue: (item) => item.extensions,
                render: (item) => `${item.extensions} ramais · ${item.channels} canais`,
              },
              ...(canFinance
                ? [
                    {
                      key: 'monthlyValue',
                      label: 'Mensalidade',
                      sortValue: (item: Service) => item.monthlyValue,
                      render: (item: Service) => money(item.monthlyValue),
                    },
                  ]
                : []),
              {
                key: 'status',
                label: 'Status',
                sortValue: (item) => item.status,
                render: (item) => <Badge status={item.status} />,
              },
              ...(canManage
                ? [
                    {
                      key: 'actions',
                      label: 'Ações',
                      render: (item: Service) => (
                        <Button variant="ghost" size="sm" onClick={() => setService(item)}>
                          <Edit3 size={15} /> Editar
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Card>
      )}
      {tab === 'servers' && (
        <Card>
          <div className="client-section-heading">
            <div>
              <h3>Servidores e domínios</h3>
              <p className="muted small">
                Ambientes dedicados ou compartilhados associados ao cliente.
              </p>
            </div>
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedServer('');
                  setAssociateServer(true);
                }}
              >
                <Plus size={16} /> Associar servidor
              </Button>
            )}
          </div>
          {servers.length ? (
            <div className="client-server-grid">
              {servers.map((server) => (
                <div className="client-server-card" key={server.id}>
                  <div className="client-section-heading">
                    <span className="client-server-icon">
                      <ServerIcon size={21} />
                    </span>
                    <Badge status={server.status} />
                  </div>
                  <h4>{server.name}</h4>
                  <p className="muted small">
                    {server.platform} · {server.environment}
                  </p>
                  {session?.role !== 'finance' && (
                    <p className="client-server-domain">
                      {server.domain}
                      {server.port ? `:${server.port}` : ''}
                    </p>
                  )}
                  <div className="client-server-meta">
                    <span>{server.clientIds.length} cliente(s)</span>
                    <span>
                      {services.filter((item) => item.serverId === server.id).length} serviço(s)
                    </span>
                  </div>
                  {session?.role !== 'finance' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/servidores/${server.id}`)}
                    >
                      Ver ambiente <ArrowRight size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nenhum servidor associado"
              description="Associe um ambiente ao cliente ou selecione um servidor ao cadastrar um serviço."
              action={
                canManage && (
                  <Button onClick={() => setAssociateServer(true)}>Associar servidor</Button>
                )
              }
            />
          )}
        </Card>
      )}
      {tab === 'tickets' && (
        <Card>
          <div className="client-section-heading">
            <h3>Tickets do cliente</h3>
            {canManage && (
              <Button size="sm" onClick={() => navigate(`/tickets?client=${client.id}&new=1`)}>
                <Plus size={16} /> Abrir ticket
              </Button>
            )}
          </div>
          {ticketTable(tickets)}
        </Card>
      )}
      {tab === 'documents' && (
        <Card>
          <div className="client-section-heading">
            <h3>Contratos e documentos</h3>
            <Button
              size="sm"
              variant={canManage ? 'primary' : 'secondary'}
              onClick={() =>
                navigate(`/documentos?client=${client.id}${canManage ? '&new=1' : ''}`)
              }
            >
              {canManage ? (
                <>
                  <FilePlus2 size={16} /> Adicionar documento
                </>
              ) : (
                <>
                  Ver biblioteca <ArrowRight size={14} />
                </>
              )}
            </Button>
          </div>
          <DataTable
            rows={documents}
            onRowClick={(item) => navigate(`/documentos?client=${client.id}&id=${item.id}`)}
            emptyTitle="Nenhum documento vinculado"
            columns={[
              {
                key: 'name',
                label: 'Documento',
                sortValue: (item) => item.name,
                render: (item) => (
                  <div className="inline">
                    <FileText size={18} />
                    <div>
                      <span className="cell-title">{item.name}</span>
                      <span className="cell-subtitle">{item.number || item.type}</span>
                    </div>
                  </div>
                ),
              },
              {
                key: 'category',
                label: 'Categoria',
                sortValue: (item) => item.category,
                render: (item) => item.category,
              },
              {
                key: 'createdAt',
                label: 'Inclusão',
                sortValue: (item) => item.createdAt,
                render: (item) => date(item.createdAt),
              },
              {
                key: 'endDate',
                label: 'Vencimento',
                sortValue: (item) => item.endDate || '',
                render: (item) => (item.endDate ? date(item.endDate) : '—'),
              },
              {
                key: 'status',
                label: 'Status',
                render: (item) =>
                  item.status ? (
                    <Badge status={item.status} />
                  ) : (
                    <span className="muted">Documento</span>
                  ),
              },
            ]}
          />
        </Card>
      )}
      {tab === 'finance' && canFinance && (
        <>
          <div className="client-stats">
            <StatCard
              label="Recebido"
              value={money(
                charges
                  .filter((item) => item.status === 'Pago')
                  .reduce((sum, item) => sum + item.amount, 0),
              )}
              detail="Histórico do cliente"
              tone="green"
            />
            <StatCard
              label="Pendente"
              value={money(
                charges
                  .filter((item) => item.status === 'Pendente')
                  .reduce((sum, item) => sum + item.amount, 0),
              )}
              detail="Aguardando pagamento"
              tone="amber"
            />
            <StatCard
              label="Vencido"
              value={money(
                charges
                  .filter((item) => item.status === 'Vencido')
                  .reduce((sum, item) => sum + item.amount, 0),
              )}
              detail="Cobranças em atraso"
              tone="red"
            />
          </div>
          <Card>
            <div className="client-section-heading">
              <h3>Histórico financeiro</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/financeiro?client=${client.id}`)}
              >
                Abrir financeiro <ArrowRight size={14} />
              </Button>
            </div>
            <DataTable
              rows={charges}
              emptyTitle="Nenhuma cobrança cadastrada"
              columns={[
                {
                  key: 'number',
                  label: 'Cobrança',
                  sortValue: (item) => item.number,
                  render: (item) => (
                    <>
                      <span className="cell-title">{item.number}</span>
                      <span className="cell-subtitle">{item.description}</span>
                    </>
                  ),
                },
                {
                  key: 'amount',
                  label: 'Valor',
                  sortValue: (item) => item.amount,
                  render: (item) => money(item.amount),
                },
                {
                  key: 'dueDate',
                  label: 'Vencimento',
                  sortValue: (item) => item.dueDate,
                  render: (item) => date(item.dueDate),
                },
                {
                  key: 'paidAt',
                  label: 'Pagamento',
                  sortValue: (item) => item.paidAt || '',
                  render: (item) => (item.paidAt ? date(item.paidAt) : '—'),
                },
                {
                  key: 'method',
                  label: 'Forma',
                  sortValue: (item) => item.method,
                  render: (item) => item.method,
                },
                {
                  key: 'status',
                  label: 'Status',
                  sortValue: (item) => item.status,
                  render: (item) => <Badge status={item.status} />,
                },
              ]}
            />
          </Card>
        </>
      )}
      {tab === 'agenda' && (
        <Card>
          <div className="client-section-heading">
            <h3>Agenda do cliente</h3>
            {canManage && (
              <Button size="sm" onClick={() => navigate(`/agenda?client=${client.id}&new=1`)}>
                <CalendarPlus size={16} /> Agendar compromisso
              </Button>
            )}
          </div>
          <DataTable
            rows={events}
            emptyTitle="Nenhum compromisso cadastrado"
            onRowClick={() => navigate(`/agenda?client=${client.id}`)}
            columns={[
              {
                key: 'title',
                label: 'Compromisso',
                sortValue: (item) => item.title,
                render: (item) => (
                  <>
                    <span className="cell-title">{item.title}</span>
                    <span className="cell-subtitle">{item.location || item.description}</span>
                  </>
                ),
              },
              {
                key: 'start',
                label: 'Data e horário',
                sortValue: (item) => item.start,
                render: (item) => dateTime(item.start),
              },
              {
                key: 'type',
                label: 'Tipo',
                sortValue: (item) => item.type,
                render: (item) => item.type,
              },
              {
                key: 'assigneeId',
                label: 'Responsável',
                render: (item) =>
                  data.users.find((user) => user.id === item.assigneeId)?.name || 'Não atribuído',
              },
              {
                key: 'status',
                label: 'Status',
                sortValue: (item) => item.status,
                render: (item) => <Badge status={item.status} />,
              },
            ]}
          />
        </Card>
      )}
      {tab === 'history' && (
        <Card>
          <div className="client-section-heading">
            <div>
              <h3>Histórico de atividades</h3>
              <p className="muted small">
                Alterações e interações realizadas na ficha do cliente.
              </p>
            </div>
          </div>
          {activities.length ? (
            <div className="client-timeline">
              {activities.map((item) => (
                <div className="client-timeline-item" key={item.id}>
                  <span className="client-timeline-dot" />
                  <div>
                    <p>{item.description}</p>
                    <span className="muted small">
                      {item.actor} · {dateTime(item.date)}
                    </span>
                    {item.ticketId && (
                      <Link className="link small" to={`/tickets/${item.ticketId}`}>
                        Abrir ticket <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Ainda não há atividades"
              description="As próximas alterações do cadastro e dos registros vinculados aparecerão aqui."
            />
          )}
        </Card>
      )}
      <ConfirmDialog
        open={!!removeContact}
        title="Excluir contato?"
        description={`O contato ${removeContact?.name || ''} será removido deste cadastro.`}
        danger
        onClose={() => setRemoveContact(null)}
        onConfirm={async () => {
          if (!removeContact) return;
          try {
            const contacts = client.contacts.filter((item) => item.id !== removeContact.id);
            if (!contacts.some((item) => item.primary) && contacts[0])
              contacts[0] = { ...contacts[0], primary: true };
            await patch('clients', client.id, { contacts });
            notify('Contato removido.');
            setRemoveContact(null);
          } catch (error) {
            notify(error instanceof Error ? error.message : 'Não foi possível remover.', 'error');
          }
        }}
      />
      <ConfirmDialog
        open={toggle}
        title={client.status === 'Ativo' ? 'Inativar cliente?' : 'Ativar cliente?'}
        description="A alteração será aplicada ao cadastro da empresa. Os registros relacionados serão preservados."
        danger={client.status === 'Ativo'}
        onClose={() => setToggle(false)}
        onConfirm={async () => {
          try {
            await patch('clients', client.id, {
              status: client.status === 'Ativo' ? 'Inativo' : 'Ativo',
            });
            notify('Status do cliente atualizado.');
            setToggle(false);
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível alterar o status.',
              'error',
            );
          }
        }}
      />
      <ConfirmDialog
        open={deleteClientOpen}
        title="Excluir cliente?"
        description={`Tem certeza que deseja excluir "${displayName(client)}"? Todo o cadastro deste cliente será removido definitivamente.`}
        danger
        onClose={() => setDeleteClientOpen(false)}
        onConfirm={async () => {
          try {
            await remove('clients', client.id);
            notify('Cliente excluído com sucesso.');
            setDeleteClientOpen(false);
            navigate('/clientes');
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o cliente.',
              'error',
            );
          }
        }}
      />
    </div>
  );
}
