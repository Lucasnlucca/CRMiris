import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Boxes,
  DollarSign,
  Layers3,
  Pencil,
  Plus,
  Radio,
  Server as ServerIcon,
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
import { money, newId } from '../../utils/format';
import type { Service } from '../../types';
import './operations.css';

function ServiceForm({
  service,
  clientId,
  serverId,
  onClose,
}: {
  service?: Service;
  clientId?: string;
  serverId?: string;
  onClose: () => void;
}) {
  const { data, session, save, notify } = useApp();
  const [form, setForm] = useState<Service>(
    service || {
      id: newId('svc'),
      clientId: clientId || '',
      serverId: serverId || '',
      name: '',
      type: data.settings.serviceTypes[0] || 'PABX em nuvem',
      status: 'Ativo',
      extensions: 0,
      channels: 2,
      monthlyValue: 0,
      notes: '',
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = <K extends keyof Service>(key: K, value: Service[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.clientId) {
      setError('Informe o nome do serviço e o cliente.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await save('services', {
        ...form,
        name: form.name.trim(),
        serverId: form.serverId || undefined,
      });
      notify(service ? 'Serviço atualizado.' : 'Serviço associado ao cliente.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o serviço.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormPage
      eyebrow="OPERAÇÃO"
      title={service ? 'Editar serviço' : 'Novo serviço'}
      description="Configure os parâmetros do serviço contratado, ramais, canais e servidor vinculado."
      backLabel="Voltar aos serviços"
      onBack={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Nome do serviço *">
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => change('name', e.target.value)}
              placeholder="Ex.: PABX Cloud + linha ilimitada"
            />
          </Field>
          <Field label="Tipo de serviço">
            <select
              className="select"
              value={form.type}
              onChange={(e) => change('type', e.target.value)}
            >
              {[...new Set([...data.settings.serviceTypes, form.type])].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Cliente *">
            <select
              className="select"
              required
              value={form.clientId}
              onChange={(e) => change('clientId', e.target.value)}
            >
              <option value="">Selecione o cliente</option>
              {data.clients.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.tradeName || c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Servidor associado" hint="O vínculo com o servidor é atualizado ao salvar.">
            <select
              className="select"
              value={form.serverId || ''}
              onChange={(e) => change('serverId', e.target.value)}
            >
              <option value="">Sem servidor associado</option>
              {data.servers.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name} · {s.platform}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantidade de ramais">
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              value={form.extensions}
              onChange={(e) => change('extensions', Number(e.target.value))}
            />
          </Field>
          <Field label="Canais simultâneos">
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              value={form.channels}
              onChange={(e) => change('channels', Number(e.target.value))}
            />
          </Field>
          {session?.role !== 'support' && (
            <Field label="Mensalidade (R$)">
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyValue}
                onChange={(e) => change('monthlyValue', Number(e.target.value))}
              />
            </Field>
          )}
          <Field label="Status">
            <select
              className="select"
              value={form.status}
              onChange={(e) => change('status', e.target.value as Service['status'])}
            >
              {['Ativo', 'Suspenso', 'Cancelado'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <div className="ops-form-full">
            <Field label="Observações">
              <textarea
                className="textarea"
                rows={4}
                value={form.notes}
                onChange={(e) => change('notes', e.target.value)}
                placeholder="Escopo, condições e informações sobre o serviço"
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
            {service ? 'Salvar alterações' : 'Associar serviço'}
          </Button>
        </div>
      </form>
    </FormPage>
  );
}

export function ServicesPage() {
  const { data, session, patch, remove, notify } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const [type, setType] = useState('');
  const [client, setClient] = useState(params.get('client') || '');
  const [server, setServer] = useState(params.get('server') || '');
  const [editor, setEditor] = useState<Service | 'new' | null>(params.get('new') ? 'new' : null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteService, setDeleteService] = useState<Service | null>(null);
  const [statusChange, setStatusChange] = useState<{
    service: Service;
    status: Service['status'];
  } | null>(null);
  useEffect(() => {
    setStatus(params.get('status') || '');
    setClient(params.get('client') || '');
    setServer(params.get('server') || '');
    if (params.get('new') === '1') setEditor('new');
  }, [params]);
  const canSeeValue = session?.role !== 'support';
  const clientName = (id: string) => {
    const c = data.clients.find((c) => c.id === id);
    return c?.tradeName || c?.name || 'Cliente não encontrado';
  };
  const rows = data.services.filter(
    (s) =>
      (!status || s.status === status) &&
      (!type || s.type === type) &&
      (!client || s.clientId === client) &&
      (!server || s.serverId === server) &&
      `${s.name} ${s.type} ${clientName(s.clientId)}`.toLowerCase().includes(query.toLowerCase()),
  );
  const detail = data.services.find((s) => s.id === detailId);
  const detailServer = data.servers.find((s) => s.id === detail?.serverId);
  const active = data.services.filter((s) => s.status === 'Ativo');
  const confirmStatus = async () => {
    if (!statusChange) return;
    try {
      await patch('services', statusChange.service.id, { status: statusChange.status });
      notify(`Serviço ${statusChange.status.toLowerCase()}.`);
      setStatusChange(null);
    } catch {
      notify('Não foi possível alterar o serviço.', 'error');
    }
  };
  if (editor) {
    return (
      <ServiceForm
        service={editor === 'new' ? undefined : editor}
        clientId={client}
        serverId={server}
        onClose={() => setEditor(null)}
      />
    );
  }
  if (detail) {
    return (
      <>
        <FormPage
          eyebrow="DETALHES DO SERVIÇO"
          title={detail.name}
          description={`${detail.type} · ${clientName(detail.clientId)}`}
          backLabel="Voltar aos serviços"
          onBack={() => setDetailId(null)}
          actions={
            <div className="inline">
              <Badge status={detail.status} />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDetailId(null);
                  setEditor(detail);
                }}
              >
                <Pencil size={14} />
                Editar serviço
              </Button>
            </div>
          }
        >
          <div className="ops-info">
            <span>Cliente</span>
            <button className="link" onClick={() => navigate(`/clientes/${detail.clientId}`)}>
              {clientName(detail.clientId)} <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="ops-info">
            <span>Tipo</span>
            <strong>{detail.type}</strong>
          </div>
          <div className="ops-info">
            <span>Servidor</span>
            {detailServer ? (
              <button className="link" onClick={() => navigate(`/servidores/${detailServer.id}`)}>
                {detailServer.name} <ArrowUpRight size={13} />
              </button>
            ) : (
              <span>Sem servidor associado</span>
            )}
          </div>
          <div className="ops-info">
            <span>Ramais / canais</span>
            <strong>
              {detail.extensions} ramais · {detail.channels} canais
            </strong>
          </div>
          {canSeeValue && (
            <div className="ops-info">
              <span>Mensalidade</span>
              <strong>{money(detail.monthlyValue)}</strong>
            </div>
          )}
          <div className="ops-info">
            <span>Observações</span>
            <p className="ops-pre">{detail.notes || 'Nenhuma observação.'}</p>
          </div>
          <div className="form-actions">
            {detail.status !== 'Ativo' && (
              <Button
                variant="secondary"
                onClick={() => setStatusChange({ service: detail, status: 'Ativo' })}
              >
                Ativar serviço
              </Button>
            )}
            {detail.status === 'Ativo' && (
              <Button
                variant="secondary"
                onClick={() => setStatusChange({ service: detail, status: 'Suspenso' })}
              >
                Suspender serviço
              </Button>
            )}
            {detail.status !== 'Cancelado' && (
              <Button
                variant="danger"
                onClick={() => setStatusChange({ service: detail, status: 'Cancelado' })}
              >
                Cancelar serviço
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => setDeleteService(detail)}
              title="Excluir serviço"
            >
              <Trash2 size={14} />
              Excluir serviço
            </Button>
          </div>
        </FormPage>
        <ConfirmDialog
          open={!!statusChange}
          title={`${statusChange?.status === 'Ativo' ? 'Ativar' : statusChange?.status === 'Suspenso' ? 'Suspender' : 'Cancelar'} serviço?`}
          description={`O status de “${statusChange?.service.name || ''}” será alterado para ${statusChange?.status.toLowerCase() || ''} neste cadastro.`}
          danger={statusChange?.status === 'Cancelado'}
          onConfirm={confirmStatus}
          onClose={() => setStatusChange(null)}
        />
        <ConfirmDialog
          open={!!deleteService}
          title="Excluir serviço?"
          description={`O serviço "${deleteService?.name || ''}" será removido definitivamente.`}
          danger
          onConfirm={async () => {
            if (!deleteService) return;
            try {
              await remove('services', deleteService.id);
              notify('Serviço excluído com sucesso.');
              setDeleteService(null);
              setDetailId(null);
            } catch (error) {
              notify(
                error instanceof Error ? error.message : 'Não foi possível excluir o serviço.',
                'error',
              );
            }
          }}
          onClose={() => setDeleteService(null)}
        />
      </>
    );
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="OPERAÇÃO"
        title="Serviços"
        description="Gerencie os serviços contratados e seus vínculos com a infraestrutura."
        actions={
          <Button onClick={() => setEditor('new')}>
            <Plus size={16} />
            Novo serviço
          </Button>
        }
      />
      <div className="ops-summary">
        <StatCard
          label="Serviços cadastrados"
          value={data.services.length}
          detail="Portfólio de clientes"
          icon={Boxes}
          tone="blue"
          onClick={() => setStatus('')}
        />
        <StatCard
          label="Serviços ativos"
          value={active.length}
          detail="Em operação"
          icon={Layers3}
          tone="green"
          onClick={() => setStatus('Ativo')}
        />
        <StatCard
          label="Ramais contratados"
          value={active.reduce((n, s) => n + s.extensions, 0)}
          detail={`${active.reduce((n, s) => n + s.channels, 0)} canais simultâneos`}
          icon={Radio}
          tone="navy"
        />
        {canSeeValue ? (
          <StatCard
            label="Receita mensal prevista"
            value={money(active.reduce((n, s) => n + s.monthlyValue, 0))}
            detail="Mensalidades dos serviços ativos"
            icon={DollarSign}
            tone="blue"
          />
        ) : (
          <StatCard
            label="Servidores utilizados"
            value={new Set(active.map((s) => s.serverId).filter(Boolean)).size}
            detail="Ambientes com serviços ativos"
            icon={ServerIcon}
            tone="blue"
          />
        )}
      </div>
      <Card>
        <div className="toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar serviço ou cliente..."
          />
          <div className="filters">
            <select
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Status do serviço"
            >
              <option value="">Todos os status</option>
              {['Ativo', 'Suspenso', 'Cancelado'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              className="select"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              aria-label="Cliente do serviço"
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
              aria-label="Tipo de serviço"
            >
              <option value="">Todos os tipos</option>
              {[...new Set(data.services.map((s) => s.type))].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              className="select"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              aria-label="Servidor do serviço"
            >
              <option value="">Todos os servidores</option>
              {data.servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DataTable
          rows={rows}
          onRowClick={(s) => setDetailId(s.id)}
          emptyTitle="Nenhum serviço encontrado"
          pageSize={8}
          columns={[
            {
              key: 'name',
              label: 'Serviço',
              sortValue: (s) => s.name,
              render: (s) => (
                <>
                  <div className="cell-title">{s.name}</div>
                  <div className="cell-subtitle">{s.type}</div>
                </>
              ),
            },
            {
              key: 'client',
              label: 'Cliente',
              sortValue: (s) => clientName(s.clientId),
              render: (s) => clientName(s.clientId),
            },
            {
              key: 'server',
              label: 'Servidor',
              sortValue: (s) => data.servers.find((v) => v.id === s.serverId)?.name || '',
              render: (s) => (
                <span className="small">
                  {data.servers.find((v) => v.id === s.serverId)?.name || 'Sem vínculo'}
                </span>
              ),
            },
            {
              key: 'extensions',
              label: 'Ramais / canais',
              sortValue: (s) => s.extensions,
              render: (s) => (
                <>
                  <strong>{s.extensions}</strong>
                  <span className="muted"> / {s.channels}</span>
                </>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              sortValue: (s) => s.status,
              render: (s) => <Badge status={s.status} />,
            },
            ...(canSeeValue
              ? [
                  {
                    key: 'value',
                    label: 'Mensalidade',
                    sortValue: (s: Service) => s.monthlyValue,
                    render: (s: Service) => (
                      <span className="ops-money">{money(s.monthlyValue)}</span>
                    ),
                  },
                ]
              : []),
            {
              key: 'edit',
              label: '',
              render: (s) => (
                <div className="inline" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-button"
                    aria-label={`Editar ${s.name}`}
                    onClick={() => setEditor(s)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Excluir ${s.name}`}
                    title="Excluir serviço"
                    onClick={() => setDeleteService(s)}
                  >
                    <Trash2 size={15} className="text-rose-600" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </Card>
      <ConfirmDialog
        open={!!deleteService}
        title="Excluir serviço?"
        description={`O serviço "${deleteService?.name || ''}" será removido definitivamente.`}
        danger
        onConfirm={async () => {
          if (!deleteService) return;
          try {
            await remove('services', deleteService.id);
            notify('Serviço excluído com sucesso.');
            setDeleteService(null);
            if (detailId === deleteService.id) setDetailId(null);
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o serviço.',
              'error',
            );
          }
        }}
        onClose={() => setDeleteService(null)}
      />
    </div>
  );
}
