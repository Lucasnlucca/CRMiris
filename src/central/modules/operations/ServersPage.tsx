import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  RefreshCw,
  Server as ServerIcon,
  Activity,
  AlertTriangle,
  Radio,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Field,
  FormPage,
  PageHeader,
  SearchInput,
  StatCard,
} from '../../components/ui';
import { dateTime, newId } from '../../utils/format';
import type { Server, ServerStatus } from '../../types';
import './operations.css';

const statuses: ServerStatus[] = ['Disponível', 'Em atenção', 'Indisponível', 'Sem dados'];

export function ServerForm({ server, onClose }: { server?: Server; onClose: () => void }) {
  const { data, save, notify } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState<Server>(
    server || {
      id: newId('srv'),
      name: '',
      type: 'PABX',
      platform: 'Yeastar P-Series',
      domain: '',
      port: 443,
      environment: 'Produção',
      clientIds: [],
      status: 'Sem dados',
      lastCheck: new Date().toISOString(),
      registeredExtensions: 0,
      unavailableExtensions: 0,
      uptime: 0,
      notes: '',
      incidents: [],
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const linkedClients = data.services
    .filter((s) => s.serverId === form.id && s.status !== 'Cancelado')
    .map((s) => s.clientId);
  const change = <K extends keyof Server>(key: K, value: Server[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.domain.trim()) {
      setError('Informe o nome e o endereço do servidor.');
      return;
    }
    if (form.port && (form.port < 1 || form.port > 65535)) {
      setError('A porta deve estar entre 1 e 65535.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await save('servers', {
        ...form,
        name: form.name.trim(),
        domain: form.domain.trim(),
        // F14: Preservar tanto as associações manuais quanto as derivadas automaticamente
        clientIds: [...new Set([...(form.clientIds || []), ...linkedClients])],
      });
      notify(server ? 'Servidor atualizado.' : 'Servidor cadastrado.');
      onClose();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o servidor.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormPage
      eyebrow="INFRAESTRUTURA"
      title={server ? 'Editar servidor' : 'Novo servidor'}
      description="Configure o ambiente, domínio, capacidade de ramais e status operacional."
      backLabel={server ? `Voltar para ${server.name}` : 'Voltar aos servidores'}
      onBack={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Nome do servidor *">
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => change('name', e.target.value)}
              placeholder="Ex.: PABX Cloud · SP 01"
            />
          </Field>
          <Field label="Tipo">
            <select
              className="select"
              value={form.type}
              onChange={(e) => change('type', e.target.value as Server['type'])}
            >
              {['PABX', 'Telefonia', 'Aplicação', 'Outro'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Plataforma">
            <input
              className="input"
              value={form.platform}
              onChange={(e) => change('platform', e.target.value)}
              placeholder="Ex.: Yeastar P-Series"
            />
          </Field>
          <Field label="Ambiente">
            <select
              className="select"
              value={form.environment}
              onChange={(e) => change('environment', e.target.value)}
            >
              {['Produção', 'Homologação', 'Desenvolvimento'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Domínio ou endereço *" hint="Endereço de referência para a equipe.">
            <input
              className="input"
              required
              value={form.domain}
              onChange={(e) => change('domain', e.target.value)}
              placeholder="pabx.exemplo.invalid"
            />
          </Field>
          <Field label="Porta">
            <input
              className="input"
              type="number"
              min="1"
              max="65535"
              value={form.port || ''}
              onChange={(e) => change('port', e.target.value ? Number(e.target.value) : undefined)}
            />
          </Field>
          <Field label="Status">
            <select
              className="select"
              value={form.status}
              onChange={(e) => change('status', e.target.value as ServerStatus)}
            >
              {statuses.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Disponibilidade (%)">
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.uptime}
              onChange={(e) => change('uptime', Number(e.target.value))}
            />
          </Field>
          <Field label="Ramais registrados">
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              value={form.registeredExtensions}
              onChange={(e) => change('registeredExtensions', Number(e.target.value))}
            />
          </Field>
          <Field label="Ramais indisponíveis">
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              value={form.unavailableExtensions}
              onChange={(e) => change('unavailableExtensions', Number(e.target.value))}
            />
          </Field>
          <div className="ops-form-full">
            <div className="field">
              <span className="field-label">Clientes vinculados pelos serviços associados</span>
              {linkedClients.length ? (
                <div className="ops-choice-list">
                  {data.clients
                    .filter((c) => linkedClients.includes(c.id))
                    .map((c) => (
                      <span className="ops-choice" key={c.id}>
                        {c.tradeName || c.name}
                      </span>
                    ))}
                </div>
              ) : (
                <p className="small muted">
                  {server
                    ? 'Nenhum serviço associado a este servidor.'
                    : 'Salve o servidor e associe um serviço para vincular o cliente.'}
                </p>
              )}
              {server && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    navigate(`/servicos?new=1&server=${server.id}`);
                  }}
                >
                  <Plus size={14} />
                  Associar serviço
                </Button>
              )}
            </div>
          </div>
          <div className="ops-form-full">
            <Field label="Observações">
              <textarea
                className="textarea"
                rows={3}
                value={form.notes}
                onChange={(e) => change('notes', e.target.value)}
                placeholder="Informações úteis para a equipe de operações"
              />
            </Field>
          </div>
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
            {server ? 'Salvar alterações' : 'Cadastrar servidor'}
          </Button>
        </div>
      </form>
    </FormPage>
  );
}

export function ServersPage() {
  const { data, remove, notify, refresh: refreshData } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const [type, setType] = useState('');
  const [client, setClient] = useState(params.get('client') || '');
  const [editor, setEditor] = useState<Server | 'new' | null>(params.get('new') ? 'new' : null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteServer, setDeleteServer] = useState<Server | null>(null);
  useEffect(() => {
    setStatus(params.get('status') || '');
    setClient(params.get('client') || '');
    if (params.get('new') === '1') setEditor('new');
  }, [params]);
  const rows = data.servers.filter(
    (s) =>
      (!status ||
        (status === 'needs_attention'
          ? s.status === 'Em atenção' || s.status === 'Indisponível'
          : s.status === status)) &&
      (!type || s.type === type) &&
      (!client || s.clientIds.includes(client)) &&
      `${s.name} ${s.domain} ${s.platform}`.toLowerCase().includes(query.toLowerCase()),
  );
  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
      notify(
        'Dados sincronizados do banco. Verificação ativa indisponível (sem agente de monitoramento ativo).',
      );
    } catch {
      notify('Não foi possível atualizar os dados.', 'error');
    } finally {
      setRefreshing(false);
    }
  };
  if (editor) {
    return (
      <ServerForm
        server={editor === 'new' ? undefined : editor}
        onClose={() => setEditor(null)}
      />
    );
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="INFRAESTRUTURA"
        title="Servidores"
        description="Acompanhe a disponibilidade e os ambientes dos seus clientes."
        actions={
          <>
            <Button variant="secondary" onClick={refresh} loading={refreshing}>
              <RefreshCw size={15} />
              Atualizar status
            </Button>
            <Button onClick={() => setEditor('new')}>
              <Plus size={16} />
              Novo servidor
            </Button>
          </>
        }
      />
      <div className="ops-summary">
        <StatCard
          label="Total de servidores"
          value={data.servers.length}
          detail="Ambientes cadastrados"
          icon={ServerIcon}
          tone="blue"
          onClick={() => setStatus('')}
        />
        <StatCard
          label="Disponíveis"
          value={data.servers.filter((s) => s.status === 'Disponível').length}
          detail="Operação normal"
          icon={Activity}
          tone="green"
          onClick={() => setStatus('Disponível')}
        />
        <StatCard
          label="Precisam de atenção"
          value={
            data.servers.filter((s) => s.status === 'Em atenção' || s.status === 'Indisponível')
              .length
          }
          detail="Verifique os incidentes"
          icon={AlertTriangle}
          tone="amber"
          onClick={() => setStatus('needs_attention')}
        />
        <StatCard
          label="Ramais registrados"
          value={data.servers.reduce((sum, s) => sum + s.registeredExtensions, 0)}
          detail={`${data.servers.reduce((sum, s) => sum + s.unavailableExtensions, 0)} indisponíveis`}
          icon={Radio}
          tone="navy"
        />
      </div>
      <Card>
        <div className="toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar servidor, domínio ou plataforma..."
          />
          <div className="filters">
            <select
              className="select"
              aria-label="Filtrar por status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              <option value="needs_attention">Precisam de atenção</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              className="select"
              aria-label="Filtrar por tipo"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Todos os tipos</option>
              {['PABX', 'Telefonia', 'Aplicação', 'Outro'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              className="select"
              aria-label="Filtrar por cliente"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            >
              <option value="">Todos os clientes</option>
              {data.clients.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.tradeName || c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DataTable
          rows={rows}
          onRowClick={(s) => navigate(`/servidores/${s.id}`)}
          emptyTitle="Nenhum servidor encontrado"
          pageSize={8}
          columns={[
            {
              key: 'name',
              label: 'Servidor',
              sortValue: (s) => s.name,
              render: (s) => (
                <div className="inline">
                  <span className="ops-server-icon">
                    <ServerIcon size={19} />
                  </span>
                  <div>
                    <div className="cell-title">{s.name}</div>
                    <div className="cell-subtitle ops-domain">{s.domain}</div>
                  </div>
                </div>
              ),
            },
            {
              key: 'platform',
              label: 'Plataforma',
              sortValue: (s) => s.platform,
              render: (s) => (
                <>
                  <div className="cell-title">{s.platform}</div>
                  <div className="cell-subtitle">
                    {s.type} · {s.environment}
                  </div>
                </>
              ),
            },
            {
              key: 'clients',
              label: 'Clientes',
              sortValue: (s) => s.clientIds.length,
              render: (s) => (
                <span>
                  {s.clientIds.length} {s.clientIds.length === 1 ? 'cliente' : 'clientes'}
                </span>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              sortValue: (s) => s.status,
              render: (s) => <Badge status={s.status} />,
            },
            {
              key: 'extensions',
              label: 'Ramais',
              sortValue: (s) => s.registeredExtensions,
              render: (s) => (
                <>
                  <div className="cell-title">{s.registeredExtensions} online</div>
                  <div className="cell-subtitle">{s.unavailableExtensions} indisponíveis</div>
                </>
              ),
            },
            {
              key: 'last',
              label: 'Última consulta',
              sortValue: (s) => s.lastCheck || '',
              render: (s) => (
                <span className="small muted">
                  {s.lastCheck ? dateTime(s.lastCheck) : 'Não verificado (sem agente ativo)'}
                </span>
              ),
            },
            {
              key: 'actions',
              label: '',
              render: (s) => (
                <div className="inline">
                  <button
                    className="icon-button"
                    aria-label={`Editar ${s.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditor(s);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Excluir ${s.name}`}
                    title="Excluir servidor"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteServer(s);
                    }}
                  >
                    <Trash2 size={15} className="text-rose-600" />
                  </button>
                  <ChevronRight size={16} className="muted" />
                </div>
              ),
            },
          ]}
        />
      </Card>
      <ConfirmDialog
        open={!!deleteServer}
        title="Excluir servidor?"
        description={`O servidor "${deleteServer?.name || ''}" será removido definitivamente.`}
        confirmTextMatch={deleteServer?.name}
        confirmInputPlaceholder={`Digite ${deleteServer?.name || ''}...`}
        confirmButtonLabel="Excluir Servidor"
        danger
        onConfirm={async () => {
          if (!deleteServer) return;
          try {
            await remove('servers', deleteServer.id);
            notify('Servidor excluído com sucesso.');
            setDeleteServer(null);
            window.location.reload();
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o servidor.',
              'error',
            );
          }
        }}
        onClose={() => setDeleteServer(null)}
      />
    </div>
  );
}
