import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Barcode,
  Building2,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Server as ServerIcon,
  ShieldCheck,
  Sparkles,
  Ticket as TicketIcon,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTenant } from '../../../context/TenantContext';
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
import type { Client, ClientPortalAccess, Contact, Service, Ticket } from '../../types';
import { date, dateTime, money, newId } from '../../utils/format';
import { effectiveChargeStatus } from '../../utils/finance';
import { maskCep, maskDocument, maskPhone, validateDocument } from '../../utils/validation';
import { getAuthoritativeAuthHeaders } from '../../../lib/appwrite';
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
          if (isNew) {
            window.location.href = `/clientes/${client.id}`;
          } else {
            window.location.reload();
          }
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
            window.location.reload();
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
  const { data, session, patch, remove, notify, login: appLogin } = useApp();
  const { tenant } = useTenant();
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

  // Estados para Acesso ao Portal do Cliente
  const [portalEmail, setPortalEmail] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalEnabled, setPortalEnabled] = useState(true);
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  // Estados para Integração com Asaas
  const [asaasData, setAsaasData] = useState<{
    configured: boolean;
    environment: string;
    customer: any | null;
    payments: any[];
    message: string;
  } | null>(null);
  const [asaasError, setAsaasError] = useState<string | null>(null);
  const [asaasLoading, setAsaasLoading] = useState(false);
  const asaasRequestRef = useRef<{ seq: number; key: string }>({ seq: 0, key: '' });
  const [newPaymentModalOpen, setNewPaymentModalOpen] = useState(false);
  const [newPaymentValue, setNewPaymentValue] = useState('');
  const [newPaymentDueDate, setNewPaymentDueDate] = useState('');
  const [newPaymentDescription, setNewPaymentDescription] = useState('');
  const [newPaymentBillingType, setNewPaymentBillingType] = useState<'BOLETO' | 'PIX'>('BOLETO');
  const [creatingPaymentBusy, setCreatingPaymentBusy] = useState(false);

  const client = data.clients.find((item) => item.id === id);
  const effectiveTenantId = (client as any)?.tenant_id || tenant?.id || 'tenant_default';

  const loadClientAsaasData = async (targetClient = client, targetTenantId = effectiveTenantId) => {
    if (!targetClient) {
      setAsaasData(null);
      setAsaasError(null);
      setAsaasLoading(false);
      return;
    }
    const requestKey = `${targetTenantId}:${targetClient.id}`;
    const nextSeq = asaasRequestRef.current.seq + 1;
    asaasRequestRef.current = { seq: nextSeq, key: requestKey };
    setAsaasLoading(true);
    setAsaasError(null);
    try {
      const authHeaders = await getAuthoritativeAuthHeaders().catch(() => ({}));
      const res = await fetch(
        `/api/asaas/client?clientId=${encodeURIComponent(targetClient.id)}&email=${encodeURIComponent(targetClient.email || '')}&document=${encodeURIComponent(targetClient.document || '')}&tenantId=${encodeURIComponent(targetTenantId)}`,
        {
          headers: {
            ...authHeaders,
            'x-tenant-id': targetTenantId,
          },
        }
      );
      if (
        asaasRequestRef.current.seq !== nextSeq ||
        asaasRequestRef.current.key !== requestKey
      ) {
        return;
      }
      if (res.ok) {
        const json = await res.json();
        // F38: Re-verify request sequence after await res.json() to prevent race conditions
        if (
          asaasRequestRef.current.seq !== nextSeq ||
          asaasRequestRef.current.key !== requestKey
        ) {
          return;
        }
        if (json.success && json.asaas) {
          setAsaasData(json.asaas);
          setAsaasError(null);
        } else {
          setAsaasData(null);
          setAsaasError(json.error || 'Dados do Asaas indisponíveis para este cliente.');
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        // F38: Re-verify request sequence after await res.json() to prevent race conditions
        if (
          asaasRequestRef.current.seq !== nextSeq ||
          asaasRequestRef.current.key !== requestKey
        ) {
          return;
        }
        setAsaasData(null);
        setAsaasError(errJson?.error || `Falha ao consultar Asaas (HTTP ${res.status}).`);
      }
    } catch (err: any) {
      if (
        asaasRequestRef.current.seq !== nextSeq ||
        asaasRequestRef.current.key !== requestKey
      ) {
        return;
      }
      setAsaasData(null);
      setAsaasError(err?.message || 'Erro de comunicação ao consultar Asaas.');
    } finally {
      if (
        asaasRequestRef.current.seq === nextSeq &&
        asaasRequestRef.current.key === requestKey
      ) {
        setAsaasLoading(false);
      }
    }
  };

  const handleSyncAsaas = async () => {
    if (!client) return;
    const requestKey = `${effectiveTenantId}:${client.id}`;
    const nextSeq = asaasRequestRef.current.seq + 1;
    asaasRequestRef.current = { seq: nextSeq, key: requestKey };
    setAsaasLoading(true);
    setAsaasError(null);
    try {
      const res = await fetch('/api/asaas/client/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, tenantId: effectiveTenantId }),
      });
      const json = await res.json();
      if (
        asaasRequestRef.current.seq !== nextSeq ||
        asaasRequestRef.current.key !== requestKey
      ) {
        return;
      }
      if (res.ok && json.success) {
        setAsaasData(json.asaas);
        setAsaasError(null);
        notify(json.message || 'Cliente sincronizado com o Asaas com sucesso!');
      } else {
        setAsaasData(null);
        setAsaasError(json.error || 'Falha ao sincronizar com Asaas');
        notify(json.error || 'Falha ao sincronizar com Asaas', 'error');
      }
    } catch (err: any) {
      if (
        asaasRequestRef.current.seq === nextSeq &&
        asaasRequestRef.current.key === requestKey
      ) {
        setAsaasData(null);
        setAsaasError('Erro ao sincronizar: ' + err.message);
      }
      notify('Erro ao sincronizar: ' + err.message, 'error');
    } finally {
      if (
        asaasRequestRef.current.seq === nextSeq &&
        asaasRequestRef.current.key === requestKey
      ) {
        setAsaasLoading(false);
      }
    }
  };

  const handleCreatePaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!client || !newPaymentValue || !newPaymentDueDate) {
      notify('Preencha o valor e a data de vencimento.', 'error');
      return;
    }
    setCreatingPaymentBusy(true);
    try {
      const authHeaders = await getAuthoritativeAuthHeaders().catch(() => ({}));
      const res = await fetch('/api/asaas/payments/create', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          'x-tenant-id': effectiveTenantId,
        },
        body: JSON.stringify({
          clientId: client.id,
          crmClientId: client.id,
          customerName: client.name || (client as any)?.company || 'Cliente',
          customerEmail: client.email || '',
          customerDocument: client.document || (client as any)?.cpfCnpj || '',
          customerPhone: client.phone || '',
          tenantId: effectiveTenantId,
          value: Number(newPaymentValue),
          dueDate: newPaymentDueDate,
          description: newPaymentDescription || `Cobrança de Serviços - ${client.name}`,
          billingType: newPaymentBillingType,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        notify('Cobrança emitida no Asaas com sucesso!');
        setNewPaymentModalOpen(false);
        setNewPaymentValue('');
        setNewPaymentDueDate('');
        setNewPaymentDescription('');
        await loadClientAsaasData();
      } else {
        notify(json.error || 'Erro ao emitir cobrança', 'error');
      }
    } catch (err: any) {
      notify('Erro ao emitir cobrança: ' + err.message, 'error');
    } finally {
      setCreatingPaymentBusy(false);
    }
  };

  useEffect(() => {
    setAsaasData(null);
    setAsaasError(null);
    if (client) {
      setPortalEmail(client.portalAccess?.email || client.email || client.contacts[0]?.email || '');
      setPortalPassword('');
      setPortalEnabled(client.portalAccess?.enabled ?? true);
      void loadClientAsaasData(client, effectiveTenantId);
    } else {
      asaasRequestRef.current = { seq: asaasRequestRef.current.seq + 1, key: '' };
      setAsaasLoading(false);
    }
  }, [client?.id, effectiveTenantId]);

  const generateRandomPassword = () => {
    const prefixes = ['Telecom', 'Voip', 'Facil', 'Cliente', 'Acesso', 'Conecta'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const specials = ['@', '#', '$', '!'];
    const randomSpecial = specials[Math.floor(Math.random() * specials.length)];
    const newPass = `${randomPrefix}${randomSpecial}${randomNum}`;
    setPortalPassword(newPass);
    notify(`Nova senha gerada: ${newPass}`);
  };

  const handleSavePortalAccess = async () => {
    if (!client) return;
    setBusy(true);
    try {
      const normEmail = portalEmail.trim().toLowerCase();
      const nextPortalAccess: ClientPortalAccess = {
        enabled: portalEnabled,
        email: normEmail,
        lastAccess: client.portalAccess?.lastAccess,
      };
      await patch('clients', client.id, { portalAccess: nextPortalAccess });
      if (portalPassword.trim()) {
        await fetch('/api/portal/auth/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: client.id,
            tenantId: effectiveTenantId,
            email: normEmail,
            password: portalPassword.trim(),
            enabled: portalEnabled,
          }),
        }).catch(() => {});
        setPortalPassword('');
      }
      notify('Credenciais de acesso ao Portal do Cliente salvas com sucesso!');
    } catch (err: any) {
      notify(err?.message || 'Erro ao salvar credenciais do portal', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!client) return;
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const tenantSlug = tenant?.slug || 'matriz';
    const loginUrl = isLocal ? `${window.location.origin}/portal-login?tenant=${tenantSlug}` : `${window.location.origin}/portal-login`;
    const message = `🔐 *Acesso ao Portal do Cliente*\n\nOlá! Seguem seus dados de acesso ao seu portal de autoatendimento:\n\n🌐 *Link de Acesso:* ${loginUrl}\n👤 *Usuário / E-mail:* ${portalEmail}\n🔑 *Senha:* ${portalPassword}\n\nAtravés do portal você pode consultar boletos em aberto, assinar/visualizar contratos e solicitar suporte.`;
    navigator.clipboard.writeText(message);
    setCopiedNotice(true);
    notify('Dados de acesso copiados para a área de transferência!');
    setTimeout(() => setCopiedNotice(false), 3000);
  };

  const handleImpersonateClient = async () => {
    if (!client) return;
    try {
      await appLogin('client', client.id);
      navigate('/portal');
    } catch (err: any) {
      notify(err?.message || 'Erro ao entrar como cliente', 'error');
    }
  };

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
    { id: 'portal', label: 'Acesso Portal' },
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
                <Button variant="secondary" onClick={() => setTab('portal')}>
                  <KeyRound size={16} /> Acesso Portal
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
      {tab === 'portal' && (
        <Card>
          <div className="client-section-heading">
            <div>
              <h3>Acesso do Cliente ao Portal do Assinante</h3>
              <p className="muted small">
                Configure as credenciais para o cliente acessar faturas, contratos e suporte técnico.
              </p>
            </div>
            <div className="inline">
              <Button variant="secondary" onClick={handleImpersonateClient}>
                <ExternalLink size={15} /> Acessar Portal como este Cliente
              </Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '16px' }}>
            {/* Status do Acesso */}
            <div style={{ background: 'var(--card-subtle, rgba(255,255,255,0.03))', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Status do Acesso
                </span>
                <Badge status={portalEnabled ? 'Ativo' : 'Inativo'} />
              </div>
              <p className="muted small" style={{ marginBottom: '16px', lineHeight: '1.5' }}>
                {portalEnabled
                  ? 'O cliente possui permissão ativa para efetuar login e consultar seus dados no Portal.'
                  : 'O acesso ao portal está temporariamente bloqueado para este cliente.'}
              </p>
              <Button
                variant={portalEnabled ? 'danger' : 'secondary'}
                size="sm"
                onClick={() => setPortalEnabled(!portalEnabled)}
              >
                {portalEnabled ? 'Bloquear Acesso ao Portal' : 'Habilitar Acesso ao Portal'}
              </Button>
            </div>

            {/* Credenciais de Login */}
            <div style={{ background: 'var(--card-subtle, rgba(255,255,255,0.03))', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
              <Field label="E-mail de Login do Cliente">
                <input
                  type="email"
                  value={portalEmail}
                  onChange={(e) => setPortalEmail(e.target.value)}
                  placeholder="cliente@empresa.com"
                  required
                />
              </Field>

              <div style={{ marginTop: '12px' }}>
                <Field label="Senha de Acesso ao Portal">
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type={showPortalPassword ? 'text' : 'password'}
                        value={portalPassword}
                        onChange={(e) => setPortalPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        style={{ paddingRight: '36px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPortalPassword(!showPortalPassword)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#94a3b8',
                        }}
                      >
                        {showPortalPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={generateRandomPassword}
                      title="Gerar uma nova senha forte automaticamente"
                    >
                      <Sparkles size={14} /> Gerar Senha
                    </Button>
                  </div>
                </Field>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                <Button onClick={handleSavePortalAccess} disabled={busy}>
                  Salvar Acesso
                </Button>
                <Button variant="secondary" onClick={handleCopyCredentials}>
                  <Copy size={14} /> {copiedNotice ? 'Copiado!' : 'Copiar Dados de Acesso'}
                </Button>
              </div>
            </div>
          </div>

          {/* Dica para o operador */}
          <div style={{ marginTop: '20px', padding: '16px', borderRadius: '12px', background: 'rgba(14, 165, 233, 0.08)', border: '1px solid rgba(14, 165, 233, 0.2)', fontSize: '13px', lineHeight: '1.6' }}>
            <strong style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Sparkles size={16} /> Como funciona para o cliente final:
            </strong>
            <p className="muted small" style={{ margin: 0, lineHeight: '1.6' }}>
              • O cliente acessa pelo link exclusivo do portal: <code>/portal-login</code>.<br />
              • Ele digita o e-mail e a senha configurados acima.<br />
              • Ele tem acesso imediato aos boletos em aberto (com Pix e código de barras), contratos com prévia interativa em PDF/imagem e abertura de chamados.
            </p>
          </div>
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

          {/* Card: Integração Asaas do Cliente */}
          <Card>
            <div className="client-section-heading">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Wallet size={18} style={{ color: '#2563eb' }} />
                  <h3>Boletos & Faturas Asaas (Gateway Oficial)</h3>
                  {asaasData?.customer?.id && (
                    <span
                      style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#059669',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      ID Asaas: {asaasData.customer.id}
                    </span>
                  )}
                </div>
                <p className="muted small">
                  Consulta de faturas, boletos bancários e baixa automática via Asaas.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={asaasLoading}
                  onClick={handleSyncAsaas}
                  title="Sincronizar cadastro e cobranças do cliente com o Asaas"
                >
                  <RefreshCw size={13} className={asaasLoading ? 'animate-spin' : ''} />
                  Sincronizar Asaas
                </Button>
                <Button
                  size="sm"
                  onClick={() => setNewPaymentModalOpen(true)}
                  title="Emitir nova cobrança ou boleto bancário no Asaas"
                >
                  <Plus size={13} /> Emitir Boleto / Cobrança
                </Button>
              </div>
            </div>

            {asaasError && (
              <div
                role="alert"
                style={{
                  marginBottom: '12px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: '12px',
                }}
              >
                {asaasError}
              </div>
            )}

            {asaasData?.payments && asaasData.payments.length > 0 ? (
              <DataTable
                rows={asaasData.payments}
                emptyTitle="Nenhuma cobrança localizada no Asaas"
                columns={[
                  {
                    key: 'id',
                    label: 'ID / Cobrança',
                    render: (item: any) => (
                      <div>
                        <strong style={{ fontSize: '12px', color: '#1e293b' }}>
                          {item.invoiceNumber || item.id}
                        </strong>
                        <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>
                          {item.description || 'Cobrança Asaas'}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'value',
                    label: 'Valor',
                    render: (item: any) => (
                      <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                        {money(item.value || 0)}
                      </strong>
                    ),
                  },
                  {
                    key: 'dueDate',
                    label: 'Vencimento',
                    render: (item: any) => date(item.dueDate),
                  },
                  {
                    key: 'billingType',
                    label: 'Forma',
                    render: (item: any) => (
                      <span style={{ fontSize: '12px' }}>
                        {item.billingType === 'BOLETO'
                          ? 'Boleto Bancário'
                          : item.billingType === 'PIX'
                          ? 'Pix Instantâneo'
                          : 'Cartão de Crédito'}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (item: any) => {
                      const st =
                        item.status === 'RECEIVED' || item.status === 'CONFIRMED'
                          ? 'Pago'
                          : item.status === 'OVERDUE'
                          ? 'Vencido'
                          : 'Pendente';
                      return <Badge status={st} />;
                    },
                  },
                  {
                    key: 'actions',
                    label: 'Ações Oficiais Asaas',
                    render: (item: any) => (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {item.invoiceUrl && (
                          <a
                            href={item.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontSize: '11px', padding: '3px 8px' }}
                            title="Abrir fatura oficial hospedada no Asaas"
                          >
                            <ExternalLink size={11} /> Fatura
                          </a>
                        )}
                        {item.bankSlipUrl && (
                          <a
                            href={item.bankSlipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontSize: '11px', padding: '3px 8px' }}
                            title="Baixar PDF oficial do Boleto"
                          >
                            <Download size={11} /> PDF
                          </a>
                        )}
                        {item.pixPayload && (
                          <Button
                            size="sm"
                            variant="secondary"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                            onClick={() => {
                              navigator.clipboard.writeText(item.pixPayload);
                              notify('Código Pix copiado com sucesso!');
                            }}
                            title="Copiar código Pix Copia e Cola"
                          >
                            <QrCode size={11} /> Pix
                          </Button>
                        )}
                        {item.barcode && (
                          <Button
                            size="sm"
                            variant="secondary"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                            onClick={() => {
                              navigator.clipboard.writeText(item.barcode);
                              notify('Linha digitável copiada com sucesso!');
                            }}
                            title="Copiar linha digitável do boleto"
                          >
                            <Barcode size={11} /> Código
                          </Button>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            ) : (
              <div
                style={{
                  padding: '24px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  textAlign: 'center',
                }}
              >
                <Wallet size={28} style={{ color: '#94a3b8', margin: '0 auto 8px auto' }} />
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#334155', margin: '0 0 4px 0' }}>
                  Nenhum boleto encontrado no Asaas para este cliente
                </h4>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0' }}>
                  Clique em &quot;Sincronizar Asaas&quot; para vincular o cliente ou &quot;Emitir Boleto / Cobrança&quot; para criar o primeiro boleto.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                  <Button size="sm" variant="secondary" onClick={handleSyncAsaas}>
                    <RefreshCw size={13} /> Sincronizar Cadastro
                  </Button>
                  <Button size="sm" onClick={() => setNewPaymentModalOpen(true)}>
                    <Plus size={13} /> Emitir Cobrança
                  </Button>
                </div>
              </div>
            )}
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
            window.location.href = '/clientes';
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o cliente.',
              'error',
            );
          }
        }}
      />

      {/* Modal para Emissão de Boleto / Cobrança Asaas */}
      {newPaymentModalOpen && (
        <Modal
          open={newPaymentModalOpen}
          onClose={() => setNewPaymentModalOpen(false)}
          title={`Emitir Cobrança Asaas para ${client.tradeName || client.name}`}
        >
          <form onSubmit={handleCreatePaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Valor da Cobrança (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="Ex: 890.00"
                  value={newPaymentValue}
                  onChange={(e) => setNewPaymentValue(e.target.value)}
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Data de Vencimento *
                </label>
                <input
                  type="date"
                  value={newPaymentDueDate}
                  onChange={(e) => setNewPaymentDueDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Forma de Cobrança *
              </label>
              <select
                value={newPaymentBillingType}
                onChange={(e) => setNewPaymentBillingType(e.target.value as any)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
              >
                <option value="BOLETO">Boleto Bancário (Com código de barras e baixa automática)</option>
                <option value="PIX">Pix Instantâneo (QR Code e Copia e Cola)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Descrição da Fatura / Serviço
              </label>
              <input
                type="text"
                placeholder="Ex: Mensalidade PABX em Nuvem - Mês Atual"
                value={newPaymentDescription}
                onChange={(e) => setNewPaymentDescription(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div style={{ fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }}>
              💡 O cliente receberá a fatura automaticamente e ela ficará disponível para consulta e pagamento imediato na área do cliente.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <Button variant="ghost" onClick={() => setNewPaymentModalOpen(false)}>
                Cancelar
              </Button>
              <Button loading={creatingPaymentBusy} type="submit">
                <CheckCircle2 size={14} /> Emitir no Asaas
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
