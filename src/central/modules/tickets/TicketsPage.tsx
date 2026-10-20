import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Edit3,
  Eye,
  FileText,
  GripVertical,
  LayoutGrid,
  List,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Server as ServerIcon,
  Trash2,
  X,
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
  Tabs,
} from '../../components/ui';
import type { Attachment, Priority, Ticket, TicketMessage, TicketStatus } from '../../types';
import { date, dateTime, localDateTime, newId, today, translateErrorMessage } from '../../utils/format';
import { fileStore } from '../../services/files';
import './tickets.css';

const statuses: TicketStatus[] = [
  'Novo',
  'Em andamento',
  'Aguardando retorno',
  'Resolvido',
  'Cancelado',
];
const priorities: Priority[] = ['Baixa', 'Média', 'Alta', 'Crítica'];
const activeStatuses = ['Novo', 'Em andamento', 'Aguardando retorno'];
const clean = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const nameFor = (client: { name: string; tradeName: string } | undefined) =>
  client?.tradeName || client?.name || 'Cliente não encontrado';
const shortSize = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${Math.round(size / 1024)} KB`
      : `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
const shiftDay = (base: string, days: number) => {
  const value = new Date(`${base}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const dayOf = (iso: string) => localDateTime(new Date(iso)).slice(0, 10);
const dueLate = (ticket: Ticket) =>
  Boolean(
    ticket.dueAt &&
      activeStatuses.includes(ticket.status) &&
      new Date(ticket.dueAt).getTime() < Date.now(),
  );

function LocalFilePicker({
  onAdd,
  label = 'Anexar arquivos',
  disabled = false,
}: {
  onAdd: (files: Attachment[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const { notify } = useApp();
  function add(event: ChangeEvent<HTMLInputElement>) {
    const files: Attachment[] = [];
    for (const file of Array.from(event.target.files || [])) {
      if (file.size > 20 * 1024 * 1024) {
        notify(`${file.name}: selecione um arquivo de até 20 MB.`, 'error');
        continue;
      }
      files.push(fileStore.add(file));
    }
    if (files.length) onAdd(files);
    event.target.value = '';
  }
  return (
    <label className={`ticket-file-picker${disabled ? ' disabled' : ''}`} htmlFor={inputId}>
      <Paperclip size={16} /> {label}
      <input
        id={inputId}
        aria-label={label}
        type="file"
        multiple
        disabled={disabled}
        onChange={add}
      />
    </label>
  );
}

function PendingAttachments({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div className="ticket-pending-files">
      {attachments.map((file) => (
        <div className="ticket-pending-file" key={file.id}>
          <FileText size={15} />
          <span>
            {file.name} <small>{shortSize(file.size)}</small>
          </span>
          <button
            type="button"
            aria-label={`Remover anexo ${file.name}`}
            onClick={() => onRemove(file.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function AttachmentItem({
  attachment,
  onPreview,
}: {
  attachment: Attachment;
  onPreview: (value: Attachment) => void;
}) {
  const { notify } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [, refresh] = useState(0);
  const url = fileStore.url(attachment.id);
  const previewable = attachment.type === 'application/pdf' || attachment.type.startsWith('image/');
  return (
    <div className="ticket-attachment">
      <div className="ticket-attachment-icon">
        <FileText size={19} />
      </div>
      <div className="ticket-attachment-name">
        <strong>{attachment.name}</strong>
        <span>
          {shortSize(attachment.size)}
          {!url && ' · Selecione novamente o arquivo'}
        </span>
      </div>
      <div className="inline">
        {url ? (
          <>
            {previewable && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Visualizar ${attachment.name}`}
                onClick={() => onPreview(attachment)}
              >
                <Eye size={16} />
              </Button>
            )}
            <a
              href={url}
              download={attachment.name}
              className="ticket-download"
              aria-label={`Baixar ${attachment.name}`}
              title="Baixar arquivo"
            >
              <Download size={16} />
            </a>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => input.current?.click()}
              aria-label={`Selecionar novamente ${attachment.name}`}
            >
              <Paperclip size={15} />
              <span>Selecionar</span>
            </Button>
            <input
              ref={input}
              type="file"
              hidden
              aria-label={`Arquivo local para ${attachment.name}`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (
                  file.name !== attachment.name ||
                  file.size !== attachment.size ||
                  (attachment.type && (file.type || 'application/octet-stream') !== attachment.type)
                ) {
                  notify(
                    'Selecione o mesmo arquivo associado a este anexo. Para um arquivo diferente, adicione um novo anexo.',
                    'error',
                  );
                  event.target.value = '';
                  return;
                }
                fileStore.add(file, attachment.id);
                refresh((value) => value + 1);
                notify('Arquivo disponível nesta sessão.');
                event.target.value = '';
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function FilePreview({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  const url = attachment ? fileStore.url(attachment.id) : undefined;
  return (
    <Modal
      open={!!attachment}
      title={attachment?.name || 'Visualizar anexo'}
      wide
      onClose={onClose}
    >
      {attachment && url ? (
        <div className="ticket-preview">
          {attachment.type === 'application/pdf' ? (
            <iframe title={attachment.name} src={url} />
          ) : attachment.type.startsWith('image/') ? (
            <img src={url} alt={attachment.name} />
          ) : (
            <p>Este formato está disponível para download.</p>
          )}
          <a className="ticket-file-download" href={url} download={attachment.name}>
            <Download size={16} /> Baixar arquivo
          </a>
        </div>
      ) : (
        <p className="muted">Selecione novamente o arquivo para disponibilizá-lo nesta sessão.</p>
      )}
    </Modal>
  );
}

function TicketForm({
  ticket,
  defaultClientId,
  defaultServerId,
  portal,
  onClose,
  onSaved,
}: {
  ticket?: Ticket;
  defaultClientId?: string;
  defaultServerId?: string;
  portal: boolean;
  onClose: () => void;
  onSaved: (value: Ticket) => void;
}) {
  const { data, session, save, notify } = useApp();
  const contextServer =
    !portal && defaultServerId
      ? data.servers.find((item) => item.id === defaultServerId)
      : undefined;
  const initialClientId = portal
    ? session?.clientId || ''
    : defaultClientId || (contextServer?.clientIds.length === 1 ? contextServer.clientIds[0] : '');
  const [form, setForm] = useState<Ticket>(() =>
    ticket
      ? { ...ticket, attachments: [...ticket.attachments] }
      : {
          id: newId('ticket'),
          number: Math.max(1000, ...data.tickets.map((item) => item.number)) + 1,
          title: '',
          description: '',
          clientId: initialClientId,
          category: data.settings.ticketCategories[0] || 'Suporte técnico',
          priority: 'Média',
          status: 'Novo',
          assigneeId: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          dueAt: undefined,
          serverId:
            !portal &&
            defaultServerId &&
            data.services.some(
              (item) =>
                item.clientId === initialClientId &&
                item.serverId === defaultServerId &&
                item.status !== 'Cancelado',
            )
              ? defaultServerId
              : undefined,
          messages: [],
          history: [],
          attachments: [],
        },
  );
  const [dueInput, setDueInput] = useState(
    ticket?.dueAt ? localDateTime(new Date(ticket.dueAt)).slice(0, 16) : '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const set = <K extends keyof Ticket>(key: K, value: Ticket[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const client = data.clients.find((item) => item.id === form.clientId);
  const staff = data.users.filter(
    (user) => ['admin', 'support'].includes(user.role) && user.active,
  );
  const availableServers = data.servers.filter((server) =>
    data.services.some(
      (service) =>
        service.clientId === form.clientId &&
        service.serverId === server.id &&
        service.status !== 'Cancelado',
    ),
  );
  async function persist() {
    setBusy(true);
    try {
      const result = await save('tickets', {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        clientId: portal ? session?.clientId || '' : form.clientId,
        status: portal ? 'Novo' : form.status,
        assigneeId: portal ? '' : form.assigneeId,
        serverId: portal ? undefined : form.serverId || undefined,
        dueAt: portal
          ? undefined
          : dueInput
            ? new Date(`${dueInput}:00-03:00`).toISOString()
            : undefined,
        messages: portal ? [] : form.messages,
        updatedAt: new Date().toISOString(),
        ...(ticket
          ? {}
          : { number: Math.max(1000, ...data.tickets.map((item) => item.number)) + 1 }),
      });
      notify(ticket ? 'Ticket atualizado com sucesso.' : `Ticket #${result.number} aberto com sucesso.`);
      onSaved(result);
    } catch (error) {
      notify(
        translateErrorMessage(error, 'Não foi possível salvar o ticket. Tente novamente.'),
        'error',
      );
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.title.trim().length < 5)
      next.title = 'Descreva o assunto com pelo menos 5 caracteres.';
    if (form.description.trim().length < 10)
      next.description = 'Inclua pelo menos 10 caracteres para explicar a solicitação.';
    if (!client) next.clientId = 'Selecione o cliente do atendimento.';
    if (dueInput && !Number.isFinite(new Date(`${dueInput}:00-03:00`).getTime()))
      next.dueAt = 'Informe uma data e horário válidos.';
    setErrors(next);
    if (Object.keys(next).length) {
      notify('Confira os campos indicados.', 'error');
      return;
    }
    if (ticket && form.status === 'Cancelado' && ticket.status !== 'Cancelado')
      setConfirmCancel(true);
    else void persist();
  }
  return (
    <>
      <FormPage
        eyebrow={portal ? 'PORTAL DO CLIENTE' : 'CENTRAL DE ATENDIMENTO'}
        title={ticket ? `Editar ticket #${ticket.number}` : 'Abrir novo ticket'}
        description={
          portal
            ? 'Conte o que você precisa. Nossa equipe acompanha sua solicitação por aqui.'
            : 'Registre a solicitação e organize o atendimento da equipe.'
        }
        backLabel={ticket ? `Voltar ao ticket #${ticket.number}` : 'Voltar aos tickets'}
        onBack={onClose}
      >
        <form onSubmit={submit} noValidate className="ticket-form">
          {portal && (
            <div className="alert alert-info">
              <strong>{nameFor(client)}</strong>
              <span className="small"> · Cliente vinculado à sua sessão</span>
            </div>
          )}
          {contextServer && (
            <div className="alert alert-info">
              Ambiente: <strong>{contextServer.name}</strong>. Selecione o cliente atendido neste
              servidor.
            </div>
          )}
          <div className="form-grid">
            {!portal && (
              <Field
                label="Cliente *"
                error={errors.clientId}
                hint={
                  contextServer && !contextServer.clientIds.length
                    ? 'Associe um serviço deste servidor a um cliente antes de abrir o atendimento.'
                    : undefined
                }
              >
                <select
                  className="select"
                  aria-label="Cliente do ticket"
                  value={form.clientId}
                  onChange={(event) => {
                    const nextClientId = event.target.value;
                    setForm((previous) => {
                      const candidateServer = defaultServerId || previous.serverId;
                      return {
                        ...previous,
                        clientId: nextClientId,
                        serverId:
                          candidateServer &&
                          data.services.some(
                            (item) =>
                              item.clientId === nextClientId &&
                              item.serverId === candidateServer &&
                              item.status !== 'Cancelado',
                          )
                            ? candidateServer
                            : undefined,
                      };
                    });
                  }}
                  required
                >
                  <option value="">Selecione o cliente</option>
                  {data.clients
                    .filter((item) => !contextServer || contextServer.clientIds.includes(item.id))
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {nameFor(item)}
                        {item.status === 'Inativo' ? ' · Inativo' : ''}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="Categoria">
              <select
                className="select"
                aria-label="Categoria do ticket"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {Array.from(new Set([...data.settings.ticketCategories, form.category])).map(
                  (category) => (
                    <option key={category}>{category}</option>
                  ),
                )}
              </select>
            </Field>
          </div>
          <Field label="Título *" error={errors.title}>
            <input
              className="input"
              aria-label="Título do ticket"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Ex.: ajustar horário de atendimento da URA"
              autoFocus
              maxLength={180}
              required
            />
          </Field>
          <Field label="Descrição *" error={errors.description}>
            <textarea
              className="textarea"
              aria-label="Descrição do ticket"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Descreva a solicitação, o cenário e o resultado esperado..."
              rows={5}
              required
            />
          </Field>
          <div className="form-grid">
            <Field label="Prioridade">
              <select
                className="select"
                aria-label="Prioridade do ticket"
                value={form.priority}
                onChange={(e) => set('priority', e.target.value as Priority)}
              >
                {priorities.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            {!portal && (
              <>
                <Field label="Status">
                  <select
                    className="select"
                    aria-label="Status do ticket"
                    value={form.status}
                    onChange={(e) => set('status', e.target.value as TicketStatus)}
                  >
                    {statuses.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Responsável">
                  <select
                    className="select"
                    aria-label="Responsável do ticket"
                    value={form.assigneeId}
                    onChange={(e) => set('assigneeId', e.target.value)}
                  >
                    <option value="">Não atribuído</option>
                    {staff.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Prazo de atendimento" error={errors.dueAt} hint="Horário de Brasília">
                  <input
                    className="input"
                    aria-label="Prazo de atendimento"
                    type="datetime-local"
                    value={dueInput}
                    onChange={(e) => setDueInput(e.target.value)}
                  />
                </Field>
                <Field label="Servidor relacionado">
                  <select
                    className="select"
                    aria-label="Servidor relacionado ao ticket"
                    value={form.serverId || ''}
                    onChange={(e) => set('serverId', e.target.value)}
                  >
                    <option value="">Sem servidor específico</option>
                    {availableServers.map((server) => (
                      <option value={server.id} key={server.id}>
                        {server.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>
          <div className="ticket-form-attachments">
            <div className="ticket-section-heading">
              <h4>Anexos</h4>
              <LocalFilePicker
                onAdd={(files) => set('attachments', [...form.attachments, ...files])}
              />
            </div>
            <p className="muted small">
              Até 20 MB por arquivo. Os arquivos ficam disponíveis durante esta sessão.
            </p>
            <PendingAttachments
              attachments={form.attachments}
              onRemove={(id) =>
                set(
                  'attachments',
                  form.attachments.filter((file) => file.id !== id),
                )
              }
            />
          </div>
          <div className="form-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              {ticket ? 'Salvar alterações' : 'Abrir ticket'}
            </Button>
          </div>
        </form>
      </FormPage>
      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar este ticket?"
        description="O ticket será marcado como cancelado. As mensagens e o histórico serão preservados."
        danger
        onClose={() => setConfirmCancel(false)}
        onConfirm={persist}
      />
    </>
  );
}

export function TicketsPage() {
  const { data, session, patch, remove, notify } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const portal = session?.role === 'client';
  const canManage = session?.role === 'admin' || session?.role === 'support';
  const canCreate = canManage || portal;
  const basePath = portal ? '/portal/tickets' : '/tickets';
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(
    params.get('status') || (params.get('open') === '1' ? 'open' : ''),
  );
  const [priority, setPriority] = useState(params.get('priority') || '');
  const [clientId, setClientId] = useState(params.get('client') || '');
  const [assignee, setAssignee] = useState('');
  const [period, setPeriod] = useState(params.get('period') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editing, setEditing] = useState<Ticket | 'new' | null>(null);
  const [cancelTicket, setCancelTicket] = useState<Ticket | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<Ticket | null>(null);
  const [moving, setMoving] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TicketStatus | null>(null);
  useEffect(() => {
    setStatus(params.get('status') || (params.get('open') === '1' ? 'open' : ''));
    setPriority(params.get('priority') || '');
    setClientId(params.get('client') || '');
    setPeriod(params.get('period') || '');
    setFrom(params.get('from') || '');
    setTo(params.get('to') || '');
    setAssignee(params.get('assignee') || '');
    setSearch(params.get('q') || '');
    setEditing(params.get('new') === '1' && canCreate ? 'new' : null);
  }, [params, canCreate]);
  const scope = useMemo(
    () => data.tickets.filter((ticket) => !portal || ticket.clientId === session?.clientId),
    [data.tickets, portal, session?.clientId],
  );
  const rows = useMemo(
    () =>
      scope
        .filter((ticket) => {
          const created = dayOf(ticket.createdAt);
          const currentDay = today();
          const periodStart =
            period === 'week'
              ? shiftDay(currentDay, -6)
              : period === 'month'
                ? `${currentDay.slice(0, 7)}-01`
                : period === '30days'
                  ? shiftDay(currentDay, -29)
                  : from;
          const periodEnd = period && period !== 'custom' ? currentDay : to;
          return (
            (!status || status === 'open'
              ? !status || activeStatuses.includes(ticket.status)
              : ticket.status === status) &&
            (!priority || ticket.priority === priority) &&
            (portal || !clientId || ticket.clientId === clientId) &&
            (!assignee ||
              (assignee === 'unassigned' ? !ticket.assigneeId : ticket.assigneeId === assignee)) &&
            (!periodStart || created >= periodStart) &&
            (!periodEnd || created <= periodEnd) &&
            clean(
              [
                ticket.number,
                ticket.title,
                ticket.description,
                portal ? '' : nameFor(data.clients.find((client) => client.id === ticket.clientId)),
              ].join(' '),
            ).includes(clean(search))
          );
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [scope, status, priority, portal, clientId, assignee, period, from, to, data.clients, search],
  );
  function closeForm() {
    setEditing(null);
    if (params.has('new')) {
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
  }
  async function changeStatus(ticket: Ticket, next: TicketStatus, confirmed = false) {
    if (!canManage || next === ticket.status) return;
    if (next === 'Cancelado' && !confirmed) {
      setCancelTicket(ticket);
      return;
    }
    setMoving(true);
    try {
      await patch('tickets', ticket.id, { status: next });
      notify(`Ticket #${ticket.number}: ${next.toLowerCase()}.`);
      setCancelTicket(null);
    } catch (error) {
      notify(
        translateErrorMessage(error, 'Não foi possível alterar o status.'),
        'error',
      );
    } finally {
      setMoving(false);
      setDragged(null);
      setOverColumn(null);
    }
  }
  const staff = data.users.filter((user) => ['admin', 'support'].includes(user.role));
  const filterCount = [
    search,
    status,
    priority,
    !portal && clientId,
    assignee,
    period,
    from,
    to,
  ].filter(Boolean).length;
  if (editing && canCreate) {
    return (
      <TicketForm
        key={
          editing === 'new'
            ? `new-${portal ? session?.clientId : clientId}-${params.get('server') || ''}`
            : editing.id
        }
        ticket={editing === 'new' ? undefined : editing}
        defaultClientId={clientId}
        defaultServerId={editing === 'new' ? params.get('server') || undefined : undefined}
        portal={portal}
        onClose={closeForm}
        onSaved={(ticket) => {
          closeForm();
          navigate(`${basePath}/${ticket.id}`);
        }}
      />
    );
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={portal ? 'PORTAL DO CLIENTE' : 'CENTRAL DE ATENDIMENTO'}
        title={portal ? 'Meus tickets' : 'Tickets'}
        description={
          portal
            ? 'Acompanhe seus chamados e converse com a nossa equipe.'
            : 'Do primeiro contato à solução. Toda a operação em um só lugar.'
        }
        actions={
          canCreate && (
            <Button onClick={() => setEditing('new')}>
              <Plus size={17} /> Abrir ticket
            </Button>
          )
        }
      />
      <div className="ticket-summary-strip">
        {[
          {
            label: 'Em aberto',
            value: scope.filter((ticket) => activeStatuses.includes(ticket.status)).length,
            kind: 'open',
            dot: 'blue',
          },
          {
            label: 'Em andamento',
            value: scope.filter((ticket) => ticket.status === 'Em andamento').length,
            kind: 'Em andamento',
            dot: 'amber',
          },
          {
            label: 'Aguardando retorno',
            value: scope.filter((ticket) => ticket.status === 'Aguardando retorno').length,
            kind: 'Aguardando retorno',
            dot: 'purple',
          },
          {
            label: 'Resolvidos',
            value: scope.filter((ticket) => ticket.status === 'Resolvido').length,
            kind: 'Resolvido',
            dot: 'green',
          },
        ].map((item) => (
          <button
            className={status === item.kind ? 'active' : ''}
            key={item.kind}
            onClick={() => setStatus(status === item.kind ? '' : item.kind)}
          >
            <span className={`ticket-summary-dot ${item.dot}`} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </button>
        ))}
      </div>
      <Card className="tickets-list-card">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              portal ? 'Buscar número ou assunto...' : 'Buscar número, assunto ou cliente...'
            }
          />
          {!portal && (
            <div className="ticket-view-switch" aria-label="Visualização dos tickets">
              <button
                onClick={() => setView('list')}
                className={view === 'list' ? 'active' : ''}
                aria-pressed={view === 'list'}
              >
                <List size={16} /> Lista
              </button>
              <button
                onClick={() => setView('kanban')}
                className={view === 'kanban' ? 'active' : ''}
                aria-pressed={view === 'kanban'}
              >
                <LayoutGrid size={15} /> Kanban
              </button>
            </div>
          )}
        </div>
        <div className="ticket-filter-row">
          <select
            className="select"
            aria-label="Filtrar tickets por status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            <option value="open">Todos em aberto</option>
            {statuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Filtrar tickets por prioridade"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">Todas as prioridades</option>
            {priorities.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          {!portal && (
            <>
              <select
                className="select"
                aria-label="Filtrar tickets por cliente"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Todos os clientes</option>
                {data.clients.map((client) => (
                  <option value={client.id} key={client.id}>
                    {nameFor(client)}
                  </option>
                ))}
              </select>
              <select
                className="select"
                aria-label="Filtrar tickets por responsável"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">Todos os responsáveis</option>
                <option value="unassigned">Não atribuído</option>
                {staff.map((user) => (
                  <option value={user.id} key={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <select
            className="select"
            aria-label="Filtrar período de abertura"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setFrom('');
              setTo('');
            }}
          >
            <option value="">Todo o período</option>
            <option value="week">Últimos 7 dias</option>
            <option value="30days">Últimos 30 dias</option>
            <option value="month">Este mês</option>
            <option value="custom">Período personalizado</option>
          </select>
          {filterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatus('');
                setPriority('');
                setClientId('');
                setAssignee('');
                setPeriod('');
                setFrom('');
                setTo('');
                setParams({});
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
        {period === 'custom' && (
          <div className="ticket-date-filters">
            <Field label="Abertos a partir de">
              <input
                type="date"
                className="input"
                aria-label="Data inicial dos tickets"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="Abertos até">
              <input
                type="date"
                className="input"
                aria-label="Data final dos tickets"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
        )}
        {view === 'list' || portal ? (
          <DataTable
            rows={rows}
            pageSize={9}
            onRowClick={(ticket) => navigate(`${basePath}/${ticket.id}`)}
            emptyTitle="Nenhum ticket encontrado"
            columns={[
              {
                key: 'number',
                label: 'Ticket / assunto',
                sortValue: (ticket) => ticket.number,
                render: (ticket) => (
                  <div className="ticket-subject">
                    <span className="ticket-number">#{ticket.number}</span>
                    <span className="cell-title">{ticket.title}</span>
                    <span className="cell-subtitle">{ticket.category}</span>
                  </div>
                ),
              },
              ...(!portal
                ? [
                    {
                      key: 'clientId',
                      label: 'Cliente',
                      sortValue: (ticket: Ticket) =>
                        nameFor(data.clients.find((client) => client.id === ticket.clientId)),
                      render: (ticket: Ticket) => (
                        <span className="ticket-client-name">
                          {nameFor(data.clients.find((client) => client.id === ticket.clientId))}
                        </span>
                      ),
                    },
                  ]
                : []),
              {
                key: 'priority',
                label: 'Prioridade',
                sortValue: (ticket) => priorities.indexOf(ticket.priority),
                render: (ticket) => <Badge status={ticket.priority} />,
              },
              {
                key: 'status',
                label: 'Status',
                sortValue: (ticket) => statuses.indexOf(ticket.status),
                render: (ticket) => <Badge status={ticket.status} />,
              },
              ...(!portal
                ? [
                    {
                      key: 'assigneeId',
                      label: 'Responsável',
                      sortValue: (ticket: Ticket) =>
                        data.users.find((user) => user.id === ticket.assigneeId)?.name || '',
                      render: (ticket: Ticket) => {
                        const user = data.users.find((user) => user.id === ticket.assigneeId);
                        return user ? (
                          <div className="ticket-assignee">
                            <Avatar name={user.name} size={25} />
                            <span>{user.name.split(' ')[0]}</span>
                          </div>
                        ) : (
                          <span className="muted small">Não atribuído</span>
                        );
                      },
                    },
                  ]
                : []),
              {
                key: 'updatedAt',
                label: 'Última atualização',
                sortValue: (ticket) => ticket.updatedAt,
                render: (ticket) => (
                  <>
                    <span className="ticket-date-cell">{dateTime(ticket.updatedAt)}</span>
                    {dueLate(ticket) && (
                      <span className="ticket-overdue">
                        <Clock3 size={11} /> Prazo ultrapassado
                      </span>
                    )}
                  </>
                ),
              },
              {
                key: 'actions',
                label: 'Ações',
                render: (ticket) => (
                  <div className="inline" onClick={(event) => event.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Abrir ticket ${ticket.number}`}
                      onClick={() => navigate(`${basePath}/${ticket.id}`)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                    {canManage && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar ticket ${ticket.number}`}
                          onClick={() => setEditing(ticket)}
                        >
                          <Edit3 size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Excluir ticket ${ticket.number}`}
                          title="Excluir chamado"
                          onClick={() => setTicketToDelete(ticket)}
                        >
                          <Trash2 size={14} className="text-rose-600" />
                        </Button>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <>
            <div className="ticket-kanban-meta">
              <span>{rows.length} tickets encontrados</span>
              {canManage && (
                <span>
                  <GripVertical size={13} /> Arraste um ticket ou use o seletor para alterar o
                  status
                </span>
              )}
            </div>
            <div className="ticket-kanban">
              {statuses.map((column) => (
                <section
                  key={column}
                  className={`ticket-kanban-column${overColumn === column ? ' over' : ''}`}
                  onDragOver={(event) => {
                    if (canManage && dragged) {
                      event.preventDefault();
                      setOverColumn(column);
                    }
                  }}
                  onDragLeave={() => setOverColumn(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData('text/plain');
                    const ticket = rows.find((item) => item.id === id);
                    if (canManage && ticket) void changeStatus(ticket, column);
                    setOverColumn(null);
                  }}
                  aria-label={`Coluna ${column}`}
                >
                  <div className="ticket-kanban-heading">
                    <Badge status={column} />
                    <span>{rows.filter((ticket) => ticket.status === column).length}</span>
                  </div>
                  <div className="ticket-kanban-cards">
                    {rows
                      .filter((ticket) => ticket.status === column)
                      .map((ticket) => (
                        <article
                          key={ticket.id}
                          className={`ticket-kanban-card${dragged === ticket.id ? ' dragging' : ''}`}
                          draggable={canManage && !moving}
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', ticket.id);
                            event.dataTransfer.effectAllowed = 'move';
                            setDragged(ticket.id);
                          }}
                          onDragEnd={() => {
                            setDragged(null);
                            setOverColumn(null);
                          }}
                        >
                          <div className="ticket-kanban-top">
                            <span className="ticket-number">#{ticket.number}</span>
                            <Badge status={ticket.priority} />
                          </div>
                          <Link to={`${basePath}/${ticket.id}`} className="ticket-kanban-title">
                            {ticket.title}
                          </Link>
                          <p className="ticket-kanban-client">
                            {nameFor(data.clients.find((client) => client.id === ticket.clientId))}
                          </p>
                          <div className="ticket-kanban-footer">
                            <span>
                              <MessageSquare size={12} /> {ticket.messages.length}
                            </span>
                            <span>{date(ticket.createdAt)}</span>
                            {ticket.assigneeId && (
                              <Avatar
                                name={
                                  data.users.find((user) => user.id === ticket.assigneeId)?.name ||
                                  'Equipe'
                                }
                                size={24}
                              />
                            )}
                          </div>
                          {canManage && (
                            <div className="inline" style={{ marginTop: 6, gap: 4 }}>
                              <select
                                className="ticket-kanban-select"
                                aria-label={`Mover ticket ${ticket.number} para status`}
                                value={ticket.status}
                                disabled={moving}
                                onChange={(event) =>
                                  void changeStatus(ticket, event.target.value as TicketStatus)
                                }
                              >
                                {statuses.map((value) => (
                                  <option key={value}>{value}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Excluir ticket ${ticket.number}`}
                                title="Excluir chamado"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTicketToDelete(ticket);
                                }}
                              >
                                <Trash2 size={13} className="text-rose-600" />
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    {!rows.some((ticket) => ticket.status === column) && (
                      <div className="ticket-kanban-empty">
                        Nenhum ticket{canManage && <span>Arraste um atendimento para cá</span>}
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </Card>
      <ConfirmDialog
        open={!!cancelTicket}
        title={`Cancelar ticket #${cancelTicket?.number || ''}?`}
        description="O ticket será marcado como cancelado. As mensagens e o histórico continuarão disponíveis."
        danger
        onClose={() => setCancelTicket(null)}
        onConfirm={async () => {
          if (cancelTicket) await changeStatus(cancelTicket, 'Cancelado', true);
        }}
      />
      <ConfirmDialog
        open={!!ticketToDelete}
        title={`Excluir ticket #${ticketToDelete?.number || ''}?`}
        description="O ticket e todas as suas mensagens serão excluídos permanentemente do sistema."
        danger
        onClose={() => setTicketToDelete(null)}
        onConfirm={async () => {
          if (!ticketToDelete) return;
          try {
            await remove('tickets', ticketToDelete.id);
            notify('Chamado excluído com sucesso.');
            setTicketToDelete(null);
          } catch (error) {
            notify(
              translateErrorMessage(error, 'Não foi possível excluir o ticket.'),
              'error',
            );
          }
        }}
      />
    </div>
  );
}

export function TicketDetailPage() {
  const { id } = useParams();
  const { data, session, patch, remove, notify } = useApp();
  const navigate = useNavigate();
  const portal = session?.role === 'client';
  const canManage = session?.role === 'admin' || session?.role === 'support';
  const canReply = canManage || portal;
  const basePath = portal ? '/portal/tickets' : '/tickets';
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('public');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [activityTab, setActivityTab] = useState('conversation');
  const endOfConversation = useRef<HTMLDivElement>(null);
  const found = data.tickets.find((ticket) => ticket.id === id);
  const ticket = found && (!portal || found.clientId === session?.clientId) ? found : undefined;
  useEffect(() => {
    setMessage('');
    setAttachments([]);
    setMode('public');
    setActivityTab('conversation');
    setEditing(false);
    setPreview(null);
  }, [id, session?.role, session?.clientId]);
  if (!ticket)
    return (
      <EmptyState
        title="Ticket não disponível"
        description="O atendimento não foi encontrado ou não está disponível para este perfil."
        action={
          <Button variant="secondary" onClick={() => navigate(basePath)}>
            Voltar aos tickets
          </Button>
        }
      />
    );
  const client = data.clients.find((item) => item.id === ticket.clientId);
  const server = data.servers.find((item) => item.id === ticket.serverId);
  const staff = data.users.filter(
    (user) => ['admin', 'support'].includes(user.role) && user.active,
  );
  const visibleMessages = ticket.messages
    .filter((item) => !portal || !item.internal)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const allVisibleAttachments = [
    ...ticket.attachments,
    ...visibleMessages.flatMap((item) => item.attachments || []),
  ];
  const actor = portal
    ? client?.contacts.find((contact) => contact.primary)?.name || nameFor(client)
    : data.users.find((user) => user.id === session?.userId)?.name || 'Equipe de suporte';
  async function update(fields: Partial<Ticket>, success = 'Ticket atualizado.') {
    if (!ticket || !canManage) return;
    if (fields.status === 'Cancelado') {
      setCancelOpen(true);
      return;
    }
    setUpdating(true);
    try {
      await patch('tickets', ticket.id, fields);
      notify(success);
    } catch (error) {
      notify(
        translateErrorMessage(error, 'Não foi possível atualizar o ticket.'),
        'error',
      );
    } finally {
      setUpdating(false);
    }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!ticket || !canReply || sending) return;
    if (!message.trim() && !attachments.length) {
      notify('Escreva uma mensagem ou adicione um anexo.', 'error');
      return;
    }
    setSending(true);
    const internal = !portal && mode === 'internal';
    const entry: TicketMessage = {
      id: newId('message'),
      text: message.trim(),
      author: actor,
      internal,
      createdAt: new Date().toISOString(),
      attachments: [...attachments],
    };
    try {
      await patch('tickets', ticket.id, { messages: [...ticket.messages, entry] });
      setMessage('');
      setAttachments([]);
      notify(internal ? 'Nota interna adicionada.' : 'Mensagem adicionada à conversa.');
      setTimeout(
        () => endOfConversation.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
        80,
      );
    } catch (error) {
      notify(
        translateErrorMessage(error, 'Não foi possível adicionar a mensagem.'),
        'error',
      );
    } finally {
      setSending(false);
    }
  }
  if (editing && canManage) {
    return (
      <TicketForm
        ticket={ticket}
        portal={false}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }
  return (
    <div className="page-stack ticket-detail-page">
      <Link to={basePath} className="ticket-back">
        <ArrowLeft size={15} /> {portal ? 'Meus tickets' : 'Tickets'}
      </Link>
      <PageHeader
        eyebrow={`TICKET #${ticket.number}`}
        title={ticket.title}
        description={`${ticket.category} · Aberto em ${dateTime(ticket.createdAt)}`}
        actions={
          canManage && (
            <div className="inline">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Edit3 size={15} /> Editar
              </Button>
              {ticket.status !== 'Resolvido' && ticket.status !== 'Cancelado' && (
                <Button
                  loading={updating}
                  onClick={() =>
                    void update({ status: 'Resolvido' }, 'Ticket marcado como resolvido.')
                  }
                >
                  <CheckCircle2 size={17} /> Resolver ticket
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                title="Excluir este ticket"
              >
                <Trash2 size={15} /> Excluir ticket
              </Button>
            </div>
          )
        }
      />
      <div className="ticket-detail-layout">
        <main className="ticket-detail-main">
          <Card className="ticket-request-card">
            <div className="ticket-section-heading">
              <h3>Solicitação</h3>
              <div className="inline">
                <Badge status={ticket.priority} />
                <Badge status={ticket.status} />
              </div>
            </div>
            <p className="ticket-description">{ticket.description}</p>
            {ticket.attachments.length > 0 && (
              <div className="ticket-attachments-list">
                {ticket.attachments.map((attachment) => (
                  <AttachmentItem
                    key={attachment.id}
                    attachment={attachment}
                    onPreview={setPreview}
                  />
                ))}
              </div>
            )}
          </Card>
          <Card className="ticket-conversation-card">
            <div className="ticket-conversation-heading">
              <Tabs
                value={portal ? 'conversation' : activityTab}
                onChange={setActivityTab}
                items={[
                  { id: 'conversation', label: 'Conversa', count: visibleMessages.length },
                  ...(!portal
                    ? [{ id: 'history', label: 'Histórico', count: ticket.history.length }]
                    : []),
                ]}
              />
              <span className="muted small">
                <MessageSquare size={14} /> Atendimento #{ticket.number}
              </span>
            </div>
            {(activityTab === 'conversation' || portal) && (
              <>
                <div className="ticket-conversation">
                  {visibleMessages.length ? (
                    visibleMessages.map((entry) => (
                      <article
                        key={entry.id}
                        className={`ticket-message${entry.internal ? ' internal' : ''}`}
                      >
                        <Avatar name={entry.author} size={33} />
                        <div className="ticket-message-body">
                          <div className="ticket-message-header">
                            <div>
                              <strong>{entry.author}</strong>
                              {entry.internal ? (
                                <span className="ticket-internal-label">
                                  <LockKeyhole size={11} /> Nota interna
                                </span>
                              ) : (
                                <span className="ticket-public-label">Mensagem</span>
                              )}
                            </div>
                            <time dateTime={entry.createdAt}>{dateTime(entry.createdAt)}</time>
                          </div>
                          {entry.text && <p>{entry.text}</p>}
                          {entry.attachments?.length ? (
                            <div className="ticket-message-attachments">
                              {entry.attachments.map((attachment) => (
                                <AttachmentItem
                                  key={attachment.id}
                                  attachment={attachment}
                                  onPreview={setPreview}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    ))
                  ) : (
                    <EmptyState
                      title="Vamos começar a conversa"
                      description={
                        portal
                          ? 'Sua solicitação já está registrada. Você pode adicionar mais informações abaixo.'
                          : 'Adicione uma mensagem para o cliente ou uma nota para a equipe.'
                      }
                    />
                  )}
                </div>
                <div ref={endOfConversation} />
                {canReply && (
                  <form
                    className={`ticket-composer${!portal && mode === 'internal' ? ' internal' : ''}`}
                    onSubmit={sendMessage}
                  >
                    <div className="ticket-composer-mode">
                      {!portal ? (
                        <div role="group" aria-label="Destino da mensagem">
                          <button
                            type="button"
                            className={mode === 'public' ? 'active' : ''}
                            aria-pressed={mode === 'public'}
                            onClick={() => setMode('public')}
                          >
                            <MessageSquare size={14} /> Mensagem ao cliente
                          </button>
                          <button
                            type="button"
                            className={mode === 'internal' ? 'active internal' : ''}
                            aria-pressed={mode === 'internal'}
                            onClick={() => setMode('internal')}
                          >
                            <LockKeyhole size={14} /> Nota interna
                          </button>
                        </div>
                      ) : (
                        <strong>Adicionar mensagem</strong>
                      )}
                      {!portal && mode === 'internal' && (
                        <p>Apenas a equipe interna pode visualizar esta nota.</p>
                      )}
                    </div>
                    <label className="sr-only" htmlFor="ticket-message-text">
                      {!portal && mode === 'internal'
                        ? 'Texto da nota interna'
                        : 'Texto da mensagem'}
                    </label>
                    <textarea
                      id="ticket-message-text"
                      className="ticket-composer-text"
                      aria-label={
                        !portal && mode === 'internal'
                          ? 'Texto da nota interna'
                          : 'Texto da mensagem'
                      }
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        !portal && mode === 'internal'
                          ? 'Adicione informações para a equipe...'
                          : 'Escreva sua mensagem...'
                      }
                      rows={4}
                      disabled={sending}
                    />
                    <PendingAttachments
                      attachments={attachments}
                      onRemove={(id) =>
                        setAttachments((current) => current.filter((file) => file.id !== id))
                      }
                    />
                    <div className="ticket-composer-footer">
                      <LocalFilePicker
                        disabled={sending}
                        onAdd={(files) => setAttachments((current) => [...current, ...files])}
                      />
                      <Button
                        type="submit"
                        loading={sending}
                        disabled={!message.trim() && !attachments.length}
                      >
                        <Send size={15} />{' '}
                        {!portal && mode === 'internal' ? 'Adicionar nota' : 'Enviar mensagem'}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
            {activityTab === 'history' && !portal && (
              <div className="ticket-history">
                <p className="muted small">Atividades registradas na demonstração.</p>
                {ticket.history.length ? (
                  [...ticket.history]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((entry) => (
                      <div className="ticket-history-entry" key={entry.id}>
                        <span className="ticket-history-dot" />
                        <div>
                          <p>{entry.description}</p>
                          <span>
                            {entry.actor} · {dateTime(entry.date)}
                          </span>
                        </div>
                      </div>
                    ))
                ) : (
                  <EmptyState
                    title="Nenhuma alteração registrada"
                    description="As próximas atualizações serão exibidas aqui."
                  />
                )}
              </div>
            )}
          </Card>
          {allVisibleAttachments.length > 0 && (
            <p className="ticket-files-note">
              <Paperclip size={13} /> Arquivos locais ficam disponíveis nesta sessão. Após
              recarregar, selecione-os novamente quando necessário.
            </p>
          )}
        </main>
        <aside className="ticket-detail-aside">
          <Card className="ticket-properties">
            <h3>Detalhes do ticket</h3>
            <div className="ticket-property">
              <label htmlFor="ticket-status-side">Status</label>
              {canManage ? (
                <select
                  id="ticket-status-side"
                  className="select"
                  aria-label="Alterar status do ticket"
                  value={ticket.status}
                  disabled={updating}
                  onChange={(e) => void update({ status: e.target.value as TicketStatus })}
                >
                  {statuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              ) : (
                <Badge status={ticket.status} />
              )}
            </div>
            <div className="ticket-property">
              <label htmlFor="ticket-priority-side">Prioridade</label>
              {canManage ? (
                <select
                  id="ticket-priority-side"
                  className="select"
                  aria-label="Alterar prioridade do ticket"
                  value={ticket.priority}
                  disabled={updating}
                  onChange={(e) => void update({ priority: e.target.value as Priority })}
                >
                  {priorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              ) : (
                <Badge status={ticket.priority} />
              )}
            </div>
            <div className="ticket-property">
              <label htmlFor="ticket-assignee-side">Responsável</label>
              {canManage ? (
                <select
                  id="ticket-assignee-side"
                  className="select"
                  aria-label="Alterar responsável do ticket"
                  value={ticket.assigneeId}
                  disabled={updating}
                  onChange={(e) => void update({ assigneeId: e.target.value })}
                >
                  <option value="">Não atribuído</option>
                  {staff.map((user) => (
                    <option value={user.id} key={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="small">
                  {portal
                    ? 'Equipe de suporte'
                    : data.users.find((user) => user.id === ticket.assigneeId)?.name ||
                      'Não atribuído'}
                </span>
              )}
            </div>
            <div className="ticket-property">
              <span>Categoria</span>
              <strong>{ticket.category}</strong>
            </div>
            <div className="ticket-properties-divider" />
            <div className="ticket-property">
              <span>Aberto em</span>
              <strong>{dateTime(ticket.createdAt)}</strong>
            </div>
            <div className="ticket-property">
              <span>Última atualização</span>
              <strong>{dateTime(ticket.updatedAt)}</strong>
            </div>
            <div className={`ticket-property${dueLate(ticket) ? ' overdue' : ''}`}>
              <span>Prazo de atendimento</span>
              <strong>{ticket.dueAt ? dateTime(ticket.dueAt) : 'Sem prazo definido'}</strong>
              {dueLate(ticket) && (
                <small>
                  <Clock3 size={12} /> Prazo ultrapassado
                </small>
              )}
            </div>
          </Card>
          <Card className="ticket-client-card">
            <span className="ticket-aside-eyebrow">
              {portal ? 'SUA EMPRESA' : 'CLIENTE VINCULADO'}
            </span>
            <div className="ticket-client-card-name">
              <Avatar name={nameFor(client)} size={39} />
              <div>
                <strong>{nameFor(client)}</strong>
                <span>{client?.document}</span>
              </div>
            </div>
            {!portal && client && (
              <>
                <p>{client.contacts.find((contact) => contact.primary)?.name || client.email}</p>
                <Link className="ticket-client-link" to={`/clientes/${client.id}`}>
                  Abrir ficha do cliente <ArrowRight size={14} />
                </Link>
              </>
            )}
          </Card>
          {!portal && server && canManage && (
            <Card className="ticket-server-card">
              <span className="ticket-aside-eyebrow">AMBIENTE RELACIONADO</span>
              <div className="ticket-server-name">
                <ServerIcon size={19} />
                <strong>{server.name}</strong>
              </div>
              <span className="muted small">{server.domain}</span>
              <div className="ticket-section-heading">
                <Badge status={server.status} />
                <Link className="link small" to={`/servidores/${server.id}`}>
                  Ver ambiente <ArrowRight size={12} />
                </Link>
              </div>
            </Card>
          )}
          {!portal && canManage && ticket.status === 'Resolvido' && (
            <div className="ticket-closed-box">
              <CheckCircle2 size={19} />
              <strong>Atendimento resolvido</strong>
              <p>Se houver novas informações, você pode reabrir este ticket.</p>
              <Button
                variant="secondary"
                size="sm"
                loading={updating}
                onClick={() =>
                  void update({ status: 'Em andamento' }, 'Ticket reaberto para atendimento.')
                }
              >
                Reabrir ticket
              </Button>
            </div>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={cancelOpen}
        title={`Cancelar ticket #${ticket.number}?`}
        description="O ticket ficará cancelado, com as mensagens e o histórico preservados."
        danger
        onClose={() => setCancelOpen(false)}
        onConfirm={async () => {
          setUpdating(true);
          try {
            await patch('tickets', ticket.id, { status: 'Cancelado' });
            notify('Ticket cancelado.');
            setCancelOpen(false);
          } catch (error) {
            notify(
              translateErrorMessage(error, 'Não foi possível cancelar o ticket.'),
              'error',
            );
          } finally {
            setUpdating(false);
          }
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title={`Excluir ticket #${ticket.number}?`}
        description="O ticket e todas as suas mensagens serão excluídos permanentemente."
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          setUpdating(true);
          try {
            await remove('tickets', ticket.id);
            notify('Ticket excluído com sucesso.');
            setDeleteOpen(false);
            navigate(basePath);
          } catch (error) {
            notify(
              translateErrorMessage(error, 'Não foi possível excluir o ticket.'),
              'error',
            );
          } finally {
            setUpdating(false);
          }
        }}
      />
      <FilePreview
        attachment={
          preview && allVisibleAttachments.some((item) => item.id === preview.id) ? preview : null
        }
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
