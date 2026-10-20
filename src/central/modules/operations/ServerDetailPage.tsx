import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Server as ServerIcon,
  Ticket as TicketIcon,
  Trash2,
  Users,
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
  StatCard,
  Tabs,
} from '../../components/ui';
import { dateTime, money, newId } from '../../utils/format';
import { ServerForm } from './ServersPage';
import type { ServerIncident, Service } from '../../types';
import './operations.css';

export function ServerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, session, patch, remove, notify } = useApp();
  const server = data.servers.find((s) => s.id === id);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [resolve, setResolve] = useState<ServerIncident | null>(null);
  const [deleteServerOpen, setDeleteServerOpen] = useState(false);
  if (!server)
    return (
      <EmptyState
        title="Servidor não encontrado"
        description="Este ambiente não está disponível."
        action={<Button onClick={() => navigate('/servidores')}>Voltar aos servidores</Button>}
      />
    );
  const clients = data.clients.filter((c) => server.clientIds.includes(c.id));
  const services = data.services.filter((s) => s.serverId === server.id);
  const tickets = data.tickets.filter((t) => t.serverId === server.id);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await patch('servers', server.id, { lastCheck: new Date().toISOString() });
      notify('Consulta local atualizada.');
    } catch {
      notify('Não foi possível atualizar o servidor.', 'error');
    } finally {
      setRefreshing(false);
    }
  };
  const createIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentTitle.trim()) return;
    try {
      await patch('servers', server.id, {
        incidents: [
          {
            id: newId('inc'),
            title: incidentTitle.trim(),
            date: new Date().toISOString(),
            status: 'Aberto',
          },
          ...server.incidents,
        ],
      });
      notify('Incidente registrado.');
      setIncidentOpen(false);
      setIncidentTitle('');
    } catch {
      notify('Não foi possível registrar o incidente.', 'error');
    }
  };
  const resolveIncident = async () => {
    if (!resolve) return;
    try {
      await patch('servers', server.id, {
        incidents: server.incidents.map((i) =>
          i.id === resolve.id ? { ...i, status: 'Resolvido' as const } : i,
        ),
      });
      notify('Incidente resolvido.');
      setResolve(null);
    } catch {
      notify('Não foi possível resolver o incidente.', 'error');
    }
  };
  if (editing) {
    return <ServerForm server={server} onClose={() => setEditing(false)} />;
  }
  if (incidentOpen) {
    return (
      <FormPage
        eyebrow={server.name}
        title="Registrar incidente"
        description="Registre uma ocorrência técnica ou indisponibilidade neste ambiente."
        backLabel={`Voltar para ${server.name}`}
        onBack={() => setIncidentOpen(false)}
      >
        <form onSubmit={createIncident}>
          <Field label="Descrição da ocorrência *">
            <textarea
              className="textarea"
              required
              rows={4}
              value={incidentTitle}
              onChange={(e) => setIncidentTitle(e.target.value)}
              placeholder="Descreva o problema e o impacto observado"
            />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setIncidentOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Registrar incidente</Button>
          </div>
        </form>
      </FormPage>
    );
  }
  return (
    <div className="page-stack">
      <button className="link inline" onClick={() => navigate('/servidores')}>
        <ArrowLeft size={15} />
        Voltar para servidores
      </button>
      <PageHeader
        eyebrow="INFRAESTRUTURA / DETALHES"
        title={server.name}
        description={`${server.platform} · ${server.environment} · ${server.domain}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={15} />
              Editar servidor
            </Button>
            <Button onClick={refresh} loading={refreshing}>
              <RefreshCw size={15} />
              Atualizar dados
            </Button>
            <Button
              variant="danger"
              onClick={() => setDeleteServerOpen(true)}
              title="Excluir servidor"
            >
              <Trash2 size={15} />
              Excluir servidor
            </Button>
          </>
        }
      />
      <div className="ops-summary">
        <StatCard
          label="Status do servidor"
          value={<Badge status={server.status} />}
          detail="Último estado informado"
          icon={ServerIcon}
          tone={server.status === 'Disponível' ? 'green' : 'amber'}
        />
        <StatCard
          label="Disponibilidade"
          value={`${server.uptime.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}
          detail="Indicador de referência"
          icon={Activity}
          tone="blue"
        />
        <StatCard
          label="Ramais registrados"
          value={server.registeredExtensions}
          detail={`${server.unavailableExtensions} ramais indisponíveis`}
          icon={Radio}
          tone="navy"
        />
        <StatCard
          label="Clientes associados"
          value={clients.length}
          detail={`${services.length} serviços vinculados`}
          icon={Users}
          tone="blue"
        />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'overview', label: 'Visão geral' },
          { id: 'clients', label: 'Clientes e serviços', count: clients.length },
          {
            id: 'incidents',
            label: 'Incidentes',
            count: server.incidents.filter((i) => i.status === 'Aberto').length,
          },
          { id: 'tickets', label: 'Tickets relacionados', count: tickets.length },
        ]}
      />
      {tab === 'overview' && (
        <div className="detail-grid">
          <div className="detail-main">
            <Card>
              <div className="ops-section-head">
                <h3>Informações do ambiente</h3>
                <Badge status={server.status} />
              </div>
              {[
                ['Nome', server.name],
                ['Tipo', server.type],
                ['Plataforma', server.platform],
                ['Domínio', server.domain],
                ['Porta', String(server.port || '—')],
                ['Ambiente', server.environment],
                ['Última consulta', dateTime(server.lastCheck)],
              ].map(([label, value]) => (
                <div className="ops-info" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </Card>
            <Card>
              <h3 className="section-title">Observações operacionais</h3>
              <p className="ops-pre muted">
                {server.notes || 'Nenhuma observação registrada para este servidor.'}
              </p>
            </Card>
          </div>
          <div className="detail-aside">
            <Card>
              <h3 className="section-title">Ramais do ambiente</h3>
              <div className="ops-info">
                <span>Registrados</span>
                <strong>{server.registeredExtensions}</strong>
              </div>
              <div className="ops-info">
                <span>Indisponíveis</span>
                <strong>{server.unavailableExtensions}</strong>
              </div>
              <div className="ops-meter">
                <span
                  style={{
                    width: `${server.registeredExtensions + server.unavailableExtensions ? (server.registeredExtensions / (server.registeredExtensions + server.unavailableExtensions)) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="small muted">
                Total de {server.registeredExtensions + server.unavailableExtensions} ramais
                monitorados.
              </p>
            </Card>
            <Card>
              <h3 className="section-title">Ações rápidas</h3>
              <div className="ops-list">
                <button
                  className="ops-link-card"
                  onClick={() => navigate(`/tickets?new=1&server=${server.id}`)}
                >
                  <span className="inline">
                    <TicketIcon size={16} />
                    Abrir ticket
                  </span>
                  <Plus size={15} />
                </button>
                <button
                  className="ops-link-card"
                  onClick={() => {
                    setTab('incidents');
                    setIncidentOpen(true);
                  }}
                >
                  <span className="inline">
                    <Clock3 size={16} />
                    Registrar incidente
                  </span>
                  <Plus size={15} />
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}
      {tab === 'clients' && (
        <>
          <Card>
            <div className="ops-section-head">
              <h3>Clientes associados</h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(`/servicos?new=1&server=${server.id}`)}
              >
                Associar serviço
              </Button>
            </div>
            {clients.length ? (
              <div className="grid-3">
                {clients.map((c) => (
                  <button
                    key={c.id}
                    className="ops-link-card"
                    onClick={() => navigate(`/clientes/${c.id}`)}
                  >
                    <div>
                      <div className="cell-title">{c.tradeName || c.name}</div>
                      <div className="cell-subtitle">
                        {c.city} · {c.state}
                      </div>
                    </div>
                    <Badge status={c.status} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum cliente associado"
                description="Edite o servidor ou associe um serviço para vincular clientes."
              />
            )}
          </Card>
          <Card>
            <div className="ops-section-head">
              <h3>Serviços deste servidor</h3>
              <Button size="sm" onClick={() => navigate(`/servicos?new=1&server=${server.id}`)}>
                <Plus size={14} />
                Vincular serviço
              </Button>
            </div>
            <DataTable
              rows={services}
              columns={[
                {
                  key: 'name',
                  label: 'Serviço',
                  sortValue: (s) => s.name,
                  render: (s) => <strong>{s.name}</strong>,
                },
                {
                  key: 'client',
                  label: 'Cliente',
                  sortValue: (s) => data.clients.find((c) => c.id === s.clientId)?.name || '',
                  render: (s) =>
                    data.clients.find((c) => c.id === s.clientId)?.tradeName ||
                    data.clients.find((c) => c.id === s.clientId)?.name ||
                    '—',
                },
                {
                  key: 'extensions',
                  label: 'Ramais',
                  sortValue: (s) => s.extensions,
                  render: (s) => s.extensions,
                },
                {
                  key: 'channels',
                  label: 'Canais',
                  sortValue: (s) => s.channels,
                  render: (s) => s.channels,
                },
                {
                  key: 'status',
                  label: 'Status',
                  sortValue: (s) => s.status,
                  render: (s) => <Badge status={s.status} />,
                },
                ...(session?.role !== 'support'
                  ? [
                      {
                        key: 'monthly',
                        label: 'Mensalidade',
                        sortValue: (s: Service) => s.monthlyValue,
                        render: (s: Service) => money(s.monthlyValue),
                      },
                    ]
                  : []),
              ]}
              emptyTitle="Nenhum serviço vinculado"
            />
          </Card>
        </>
      )}
      {tab === 'incidents' && (
        <Card>
          <div className="ops-section-head">
            <h3>Histórico de incidentes</h3>
            <Button size="sm" onClick={() => setIncidentOpen(true)}>
              <Plus size={15} />
              Registrar incidente
            </Button>
          </div>
          <DataTable
            rows={server.incidents}
            emptyTitle="Nenhum incidente registrado"
            columns={[
              {
                key: 'title',
                label: 'Ocorrência',
                sortValue: (i) => i.title,
                render: (i) => <strong>{i.title}</strong>,
              },
              {
                key: 'date',
                label: 'Registrado em',
                sortValue: (i) => i.date,
                render: (i) => dateTime(i.date),
              },
              {
                key: 'status',
                label: 'Status',
                sortValue: (i) => i.status,
                render: (i) => <Badge status={i.status} />,
              },
              {
                key: 'action',
                label: '',
                render: (i) =>
                  i.status === 'Aberto' ? (
                    <Button size="sm" variant="secondary" onClick={() => setResolve(i)}>
                      <CheckCircle2 size={14} />
                      Resolver
                    </Button>
                  ) : (
                    <span className="small muted">Concluído</span>
                  ),
              },
            ]}
          />
        </Card>
      )}
      {tab === 'tickets' && (
        <Card>
          <div className="ops-section-head">
            <h3>Tickets relacionados</h3>
            <Button size="sm" onClick={() => navigate(`/tickets?new=1&server=${server.id}`)}>
              <Plus size={15} />
              Novo ticket
            </Button>
          </div>
          <DataTable
            rows={tickets}
            onRowClick={(t) => navigate(`/tickets/${t.id}`)}
            emptyTitle="Nenhum ticket relacionado"
            columns={[
              {
                key: 'number',
                label: 'Ticket',
                sortValue: (t) => t.number,
                render: (t) => (
                  <>
                    <div className="cell-title">
                      #{t.number} · {t.title}
                    </div>
                    <div className="cell-subtitle">
                      {data.clients.find((c) => c.id === t.clientId)?.tradeName}
                    </div>
                  </>
                ),
              },
              {
                key: 'priority',
                label: 'Prioridade',
                sortValue: (t) => t.priority,
                render: (t) => <Badge status={t.priority} />,
              },
              {
                key: 'status',
                label: 'Status',
                sortValue: (t) => t.status,
                render: (t) => <Badge status={t.status} />,
              },
              {
                key: 'updated',
                label: 'Atualização',
                sortValue: (t) => t.updatedAt,
                render: (t) => dateTime(t.updatedAt),
              },
            ]}
          />
        </Card>
      )}
      <ConfirmDialog
        danger={false}
        open={!!resolve}
        title="Resolver incidente?"
        description={`A ocorrência “${resolve?.title || ''}” será marcada como resolvida.`}
        onConfirm={resolveIncident}
        onClose={() => setResolve(null)}
      />
      <ConfirmDialog
        danger
        open={deleteServerOpen}
        title="Excluir servidor?"
        description={`O servidor "${server.name}" será excluído permanentemente.`}
        onConfirm={async () => {
          try {
            await remove('servers', server.id);
            notify('Servidor excluído com sucesso.');
            setDeleteServerOpen(false);
            navigate('/servidores');
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o servidor.',
              'error',
            );
          }
        }}
        onClose={() => setDeleteServerOpen(false)}
      />
    </div>
  );
}
