import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  User,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  FormPage,
  PageHeader,
  SearchInput,
  StatCard,
} from '../../components/ui';
import { date, dateTime, newId, time, today } from '../../utils/format';
import type { AgendaEvent } from '../../types';
import './operations.css';

const eventTypes: AgendaEvent['type'][] = ['Reunião', 'Visita técnica', 'Manutenção', 'Outro'];
const spParts = (value: string) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(value))
    .replace(' ', 'T');
const eventDate = (value: string) => spParts(value).slice(0, 10);
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const typeClass = (type: string) =>
  type === 'Visita técnica' ? 'visita' : type === 'Manutenção' ? 'manutencao' : '';

function EventForm({
  event,
  clientId,
  selectedDay,
  mode,
  onClose,
}: {
  event?: AgendaEvent;
  clientId?: string;
  selectedDay?: string;
  mode?: 'edit' | 'reschedule';
  onClose: () => void;
}) {
  const { data, session, save, notify } = useApp();
  const day = selectedDay || today();
  const [form, setForm] = useState<AgendaEvent>(
    event || {
      id: newId('evt'),
      title: '',
      description: '',
      start: `${day}T09:00:00-03:00`,
      end: `${day}T10:00:00-03:00`,
      assigneeId: session?.userId || '',
      clientId: clientId || '',
      type: 'Reunião',
      location: '',
      status: 'Agendado',
    },
  );
  const [start, setStart] = useState(event ? spParts(event.start) : `${day}T09:00`);
  const [end, setEnd] = useState(event ? spParts(event.end) : `${day}T10:00`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const reschedule = mode === 'reschedule';
  const change = <K extends keyof AgendaEvent>(key: K, value: AgendaEvent[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !start || !end) {
      setError('Informe o título e o período do compromisso.');
      return;
    }
    if (end <= start) {
      setError('O término deve ser posterior ao início do compromisso.');
      return;
    }
    if (!form.assigneeId) {
      setError('Selecione o responsável pelo compromisso.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await save('events', {
        ...form,
        title: form.title.trim(),
        clientId: form.clientId || undefined,
        start: new Date(`${start}:00-03:00`).toISOString(),
        end: new Date(`${end}:00-03:00`).toISOString(),
        status: reschedule ? 'Agendado' : form.status,
      });
      notify(
        reschedule
          ? 'Compromisso reagendado.'
          : event
            ? 'Compromisso atualizado.'
            : 'Compromisso agendado.',
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o compromisso.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormPage
      eyebrow="PLANEJAMENTO E AGENDA"
      title={
        reschedule ? 'Reagendar compromisso' : event ? 'Editar compromisso' : 'Novo compromisso'
      }
      description="Defina horário, responsável, cliente e observações da atividade."
      backLabel="Voltar à agenda"
      onBack={onClose}
    >
      <form onSubmit={submit}>
        {reschedule && (
          <p className="muted">
            Defina o novo período para <strong>{form.title}</strong>.
          </p>
        )}
        <div className="form-grid">
          {!reschedule && (
            <>
              <div className="ops-form-full">
                <Field label="Título *">
                  <input
                    className="input"
                    required
                    value={form.title}
                    onChange={(e) => change('title', e.target.value)}
                    placeholder="Ex.: Visita técnica · instalação de ramais"
                  />
                </Field>
              </div>
              <Field label="Tipo">
                <select
                  className="select"
                  value={form.type}
                  onChange={(e) => change('type', e.target.value as AgendaEvent['type'])}
                >
                  {eventTypes.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Responsável *">
                <select
                  className="select"
                  required
                  value={form.assigneeId}
                  onChange={(e) => change('assigneeId', e.target.value)}
                >
                  <option value="">Selecione o responsável</option>
                  {data.users
                    .filter((u) => u.role !== 'client' && u.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </Field>
            </>
          )}
          <Field label="Início *" hint="Horário de Brasília">
            <input
              className="input"
              type="datetime-local"
              required
              value={start}
              onChange={(e) => {
                const value = e.target.value;
                setStart(value);
                if (value >= end) {
                  const d = new Date(`${value}:00-03:00`);
                  d.setTime(d.getTime() + 60 * 60 * 1000);
                  setEnd(spParts(d.toISOString()));
                }
              }}
            />
          </Field>
          <Field label="Término *" hint="Horário de Brasília">
            <input
              className="input"
              required
              type="datetime-local"
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          {!reschedule && (
            <>
              <Field label="Cliente associado">
                <select
                  className="select"
                  value={form.clientId || ''}
                  onChange={(e) => change('clientId', e.target.value)}
                >
                  <option value="">Compromisso interno</option>
                  {data.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradeName || c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Local">
                <input
                  className="input"
                  value={form.location}
                  onChange={(e) => change('location', e.target.value)}
                  placeholder="Endereço, sala ou reunião online"
                />
              </Field>
              <div className="ops-form-full">
                <Field label="Descrição">
                  <textarea
                    className="textarea"
                    rows={4}
                    value={form.description}
                    onChange={(e) => change('description', e.target.value)}
                    placeholder="Pauta, preparação e informações para o responsável"
                  />
                </Field>
              </div>
            </>
          )}
        </div>
        {error && (
          <div role="alert" className="ops-form-error">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {reschedule
              ? 'Confirmar reagendamento'
              : event
                ? 'Salvar alterações'
                : 'Criar compromisso'}
          </Button>
        </div>
      </form>
    </FormPage>
  );
}

export function AgendaPage() {
  const { data, session, patch, remove, notify } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryEvent = data.events.find((e) => e.id === params.get('id'));
  const [month, setMonth] = useState(() => {
    const d = new Date(`${queryEvent ? eventDate(queryEvent.start) : today()}T12:00:00`);
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const [view, setView] = useState<'month' | 'list'>(params.get('upcoming') ? 'list' : 'month');
  const [upcoming, setUpcoming] = useState(params.get('upcoming') === '1');
  const [query, setQuery] = useState('');
  const [client, setClient] = useState(params.get('client') || '');
  const [assignee, setAssignee] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState<{
    event?: AgendaEvent;
    day?: string;
    mode?: 'edit' | 'reschedule';
  } | null>(params.get('new') ? {} : null);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('id'));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [deleteEvent, setDeleteEvent] = useState<AgendaEvent | null>(null);
  const [update, setUpdate] = useState<{
    event: AgendaEvent;
    status: AgendaEvent['status'];
  } | null>(null);
  useEffect(() => {
    setClient(params.get('client') || '');
    setSelectedId(params.get('id'));
    setUpcoming(params.get('upcoming') === '1');
    if (params.get('upcoming') === '1') setView('list');
    if (params.get('new') === '1') setEditor({});
    const target = data.events.find((e) => e.id === params.get('id'));
    if (target) {
      const d = new Date(`${eventDate(target.start)}T12:00:00`);
      setMonth(new Date(d.getFullYear(), d.getMonth(), 1, 12));
    }
  }, [params]);
  if (session?.role === 'client')
    return (
      <EmptyState
        title="Agenda da equipe"
        description="Consulte a equipe de atendimento para agendar um compromisso."
      />
    );
  const clientName = (id?: string) => {
    const c = data.clients.find((c) => c.id === id);
    return c?.tradeName || c?.name || 'Compromisso interno';
  };
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name || 'Sem responsável';
  const filtered = data.events.filter(
    (e) =>
      (!client || e.clientId === client) &&
      (!assignee || e.assigneeId === assignee) &&
      (!type || e.type === type) &&
      (!status || e.status === status) &&
      (!upcoming || (e.status === 'Agendado' && new Date(e.start).getTime() >= Date.now())) &&
      `${e.title} ${e.description} ${clientName(e.clientId)} ${userName(e.assigneeId)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const monthKey = dayKey(month).slice(0, 7);
  const monthEvents = filtered.filter(
    (e) => eventDate(e.start).slice(0, 7) <= monthKey && eventDate(e.end).slice(0, 7) >= monthKey,
  );
  const rows = upcoming ? filtered : monthEvents;
  const detail = data.events.find((e) => e.id === selectedId);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  const gridStart = new Date(firstDay);
  gridStart.setDate(1 - firstDay.getDay());
  const cells = Array.from(
    { length: Math.ceil((firstDay.getDay() + lastDay.getDate()) / 7) * 7 },
    (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return d;
    },
  );
  const eventsForDay = (key: string) =>
    filtered
      .filter((e) => eventDate(e.start) <= key && eventDate(e.end) >= key)
      .sort((a, b) => a.start.localeCompare(b.start));
  const changeMonth = (offset: number) => {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + offset, 1, 12));
    setUpcoming(false);
  };
  const confirmUpdate = async () => {
    if (!update) return;
    try {
      await patch('events', update.event.id, { status: update.status });
      notify(update.status === 'Concluído' ? 'Compromisso concluído.' : 'Compromisso cancelado.');
      setUpdate(null);
    } catch {
      notify('Não foi possível alterar o compromisso.', 'error');
    }
  };
  if (editor) {
    return (
      <EventForm
        event={editor.event}
        mode={editor.mode}
        selectedDay={editor.day}
        clientId={client}
        onClose={() => setEditor(null)}
      />
    );
  }
  if (detail) {
    return (
      <>
        <FormPage
          eyebrow={detail.type.toUpperCase()}
          title={detail.title}
          description={clientName(detail.clientId)}
          backLabel="Voltar à agenda"
          onBack={() => setSelectedId(null)}
          actions={
            <div className="inline">
              <Badge status={detail.status} />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedId(null);
                  setEditor({ event: detail, mode: 'edit' });
                }}
              >
                <Pencil size={14} />
                Editar
              </Button>
            </div>
          }
        >
          <div className="ops-info">
            <span className="inline">
              <CalendarIcon size={14} />
              Início
            </span>
            <strong>{dateTime(detail.start)}</strong>
          </div>
          <div className="ops-info">
            <span className="inline">
              <Clock3 size={14} />
              Término
            </span>
            <strong>{dateTime(detail.end)}</strong>
          </div>
          <div className="ops-info">
            <span className="inline">
              <User size={14} />
              Responsável
            </span>
            <strong>{userName(detail.assigneeId)}</strong>
          </div>
          <div className="ops-info">
            <span className="inline">
              <Users size={14} />
              Cliente
            </span>
            {detail.clientId ? (
              <button className="link" onClick={() => navigate(`/clientes/${detail.clientId}`)}>
                {clientName(detail.clientId)}
              </button>
            ) : (
              <span>Compromisso interno</span>
            )}
          </div>
          <div className="ops-info">
            <span className="inline">
              <MapPin size={14} />
              Local
            </span>
            <span>{detail.location || 'Não informado'}</span>
          </div>
          <div className="ops-info">
            <span>Descrição</span>
            <p className="ops-pre">{detail.description || 'Sem descrição adicional.'}</p>
          </div>
          <div className="form-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedId(null);
                setEditor({ event: detail, mode: 'reschedule' });
              }}
            >
              <RefreshCw size={14} />
              Reagendar
            </Button>
            {detail.status === 'Agendado' && (
              <Button onClick={() => setUpdate({ event: detail, status: 'Concluído' })}>
                <CheckCircle2 size={14} />
                Concluir
              </Button>
            )}
            {detail.status !== 'Cancelado' && (
              <Button
                variant="danger"
                onClick={() => setUpdate({ event: detail, status: 'Cancelado' })}
              >
                <XCircle size={14} />
                Cancelar compromisso
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => setDeleteEvent(detail)}
              title="Excluir compromisso"
            >
              <Trash2 size={14} />
              Excluir compromisso
            </Button>
          </div>
        </FormPage>
        <ConfirmDialog
          open={!!update}
          title={update?.status === 'Concluído' ? 'Concluir compromisso?' : 'Cancelar compromisso?'}
          description={`“${update?.event.title || ''}” será marcado como ${update?.status.toLowerCase() || ''}. Você poderá reagendá-lo posteriormente.`}
          danger={update?.status === 'Cancelado'}
          onConfirm={confirmUpdate}
          onClose={() => setUpdate(null)}
        />
        <ConfirmDialog
          open={!!deleteEvent}
          title="Excluir compromisso?"
          description={`O compromisso "${deleteEvent?.title || ''}" será removido definitivamente da agenda.`}
          danger
          onConfirm={async () => {
            if (!deleteEvent) return;
            try {
              await remove('events', deleteEvent.id);
              notify('Compromisso excluído da agenda.');
              setDeleteEvent(null);
              setSelectedId(null);
            } catch (error) {
              notify(
                error instanceof Error ? error.message : 'Não foi possível excluir o compromisso.',
                'error',
              );
            }
          }}
          onClose={() => setDeleteEvent(null)}
        />
      </>
    );
  }
  if (selectedDay) {
    return (
      <FormPage
        eyebrow="COMPROMISSOS DO DIA"
        title={`Compromissos · ${date(selectedDay)}`}
        description="Atividades programadas para esta data."
        backLabel="Voltar à agenda"
        onBack={() => setSelectedDay(null)}
        actions={
          <Button
            onClick={() => {
              setEditor({ day: selectedDay });
              setSelectedDay(null);
            }}
          >
            <Plus size={14} />
            Novo compromisso
          </Button>
        }
      >
        <div className="ops-list">
          {eventsForDay(selectedDay).map((event) => (
            <button
              className="ops-link-card"
              key={event.id}
              onClick={() => {
                setSelectedDay(null);
                setSelectedId(event.id);
              }}
            >
              <div>
                <div className="cell-title">
                  {time(event.start)} · {event.title}
                </div>
                <div className="cell-subtitle">{userName(event.assigneeId)}</div>
              </div>
              <Badge status={event.status} />
            </button>
          ))}
        </div>
      </FormPage>
    );
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="PLANEJAMENTO"
        title="Agenda"
        description="Organize os compromissos, visitas e manutenções da sua equipe."
        actions={
          <Button onClick={() => setEditor({})}>
            <Plus size={16} />
            Novo compromisso
          </Button>
        }
      />
      <div className="ops-summary">
        <StatCard
          label="Compromissos no mês"
          value={monthEvents.length}
          detail={month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          icon={CalendarIcon}
          tone="blue"
        />
        <StatCard
          label="Agendados"
          value={monthEvents.filter((e) => e.status === 'Agendado').length}
          detail="Próximas atividades"
          icon={Clock3}
          tone="navy"
          onClick={() => setStatus('Agendado')}
        />
        <StatCard
          label="Visitas técnicas"
          value={
            monthEvents.filter((e) => e.type === 'Visita técnica' && e.status !== 'Cancelado')
              .length
          }
          detail="Atendimento presencial"
          icon={Wrench}
          tone="amber"
          onClick={() => setType('Visita técnica')}
        />
        <StatCard
          label="Concluídos"
          value={monthEvents.filter((e) => e.status === 'Concluído').length}
          detail="Atividades realizadas"
          icon={CalendarCheck}
          tone="green"
          onClick={() => setStatus('Concluído')}
        />
      </div>
      <Card>
        <div className="toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar compromisso ou cliente..."
          />
          <div className="filters">
            <select
              className="select"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              aria-label="Responsável pelo compromisso"
            >
              <option value="">Todos os responsáveis</option>
              {data.users
                .filter((u) => u.role !== 'client')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
            <select
              className="select"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              aria-label="Cliente do compromisso"
            >
              <option value="">Todos os clientes</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tradeName || c.name}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label="Tipo de compromisso"
            >
              <option value="">Todos os tipos</option>
              {eventTypes.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Status do compromisso"
            >
              <option value="">Todos os status</option>
              {['Agendado', 'Concluído', 'Cancelado'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        {upcoming && (
          <div className="ops-actions">
            <span className="chip">Próximos compromissos agendados</span>
            <Button variant="ghost" size="sm" onClick={() => setUpcoming(false)}>
              Exibir o mês
            </Button>
          </div>
        )}
      </Card>
      <Card className="ops-calendar-card">
        <div className="ops-calendar-head">
          <div className="inline">
            <div className="inline">
              <button
                className="icon-button"
                aria-label="Mês anterior"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Próximo mês"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <h3>
              {upcoming
                ? 'Próximos compromissos'
                : month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const d = new Date(`${today()}T12:00:00`);
                setMonth(new Date(d.getFullYear(), d.getMonth(), 1, 12));
                setUpcoming(false);
              }}
            >
              Hoje
            </Button>
          </div>
          <div className="ops-pill-tabs">
            <button
              className={view === 'month' ? 'active' : ''}
              aria-pressed={view === 'month'}
              onClick={() => {
                setView('month');
                setUpcoming(false);
              }}
            >
              <LayoutGrid size={14} />
              Mês
            </button>
            <button
              className={view === 'list' ? 'active' : ''}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List size={15} />
              Lista
            </button>
          </div>
        </div>
        {view === 'month' ? (
          <>
            <div className="ops-calendar-weekdays">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="ops-calendar-grid">
              {cells.map((d) => {
                const key = dayKey(d);
                const events = eventsForDay(key);
                return (
                  <div
                    key={key}
                    className={`ops-calendar-day ${d.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === today() ? 'today' : ''}`}
                    onClick={() => setEditor({ day: key })}
                  >
                    <button
                      className="ops-day-number"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditor({ day: key });
                      }}
                      aria-label={`Novo compromisso em ${date(key)}`}
                    >
                      {d.getDate()}
                    </button>
                    {events.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        className={`ops-calendar-event ${typeClass(event.type)} ${event.status === 'Cancelado' ? 'cancelled' : ''}`}
                        title={`${time(event.start)} · ${event.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(event.id);
                        }}
                      >
                        <b>{time(event.start)}</b>
                        <span>{event.title}</span>
                        {event.status === 'Concluído' && <CheckCircle2 size={10} />}
                      </button>
                    ))}
                    {events.length > 3 && (
                      <button
                        className="ops-calendar-more"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDay(key);
                        }}
                      >
                        + {events.length - 3} compromissos
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="ops-agenda-legend">
              <span>
                <i className="ops-event-dot" />
                Reunião / outros
              </span>
              <span>
                <i className="ops-event-dot visita" />
                Visita técnica
              </span>
              <span>
                <i className="ops-event-dot manutencao" />
                Manutenção
              </span>
              <span className="muted">Agenda interna do CRM · Horário de Brasília</span>
            </div>
          </>
        ) : (
          <div style={{ padding: '0 22px' }}>
            <DataTable
              rows={rows}
              onRowClick={(e) => setSelectedId(e.id)}
              pageSize={8}
              emptyTitle="Nenhum compromisso neste período"
              columns={[
                {
                  key: 'title',
                  label: 'Compromisso',
                  sortValue: (e) => e.title,
                  render: (e) => (
                    <div className="inline">
                      <span className={`ops-event-dot ${typeClass(e.type)}`} />
                      <div>
                        <div className="cell-title">{e.title}</div>
                        <div className="cell-subtitle">{e.type}</div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'start',
                  label: 'Data e horário',
                  sortValue: (e) => e.start,
                  render: (e) => (
                    <>
                      <div className="cell-title">{date(e.start)}</div>
                      <div className="cell-subtitle">
                        {time(e.start)} –{' '}
                        {eventDate(e.start) !== eventDate(e.end) ? `${date(e.end)} ` : ''}
                        {time(e.end)}
                      </div>
                    </>
                  ),
                },
                {
                  key: 'client',
                  label: 'Cliente',
                  sortValue: (e) => clientName(e.clientId),
                  render: (e) => clientName(e.clientId),
                },
                {
                  key: 'assignee',
                  label: 'Responsável',
                  sortValue: (e) => userName(e.assigneeId),
                  render: (e) => <span className="small">{userName(e.assigneeId)}</span>,
                },
                {
                  key: 'status',
                  label: 'Status',
                  sortValue: (e) => e.status,
                  render: (e) => <Badge status={e.status} />,
                },
                {
                  key: 'action',
                  label: '',
                  render: (e) => (
                    <div className="inline" onClick={(click) => click.stopPropagation()}>
                      <button
                        className="icon-button"
                        aria-label={`Editar ${e.title}`}
                        onClick={() => setEditor({ event: e, mode: 'edit' })}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Excluir ${e.title}`}
                        title="Excluir compromisso"
                        onClick={() => setDeleteEvent(e)}
                      >
                        <Trash2 size={15} className="text-rose-600" />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={!!deleteEvent}
        title="Excluir compromisso?"
        description={`O compromisso "${deleteEvent?.title || ''}" será removido definitivamente da agenda.`}
        danger
        onConfirm={async () => {
          if (!deleteEvent) return;
          try {
            await remove('events', deleteEvent.id);
            notify('Compromisso excluído da agenda.');
            setDeleteEvent(null);
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o compromisso.',
              'error',
            );
          }
        }}
        onClose={() => setDeleteEvent(null)}
      />
    </div>
  );
}
