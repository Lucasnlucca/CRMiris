import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
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
import { fileStore } from '../../services/files';
import { date, dateTime, money, newId, today } from '../../utils/format';
import type { DocumentCategory, DocumentRecord } from '../../types';
import './operations.css';

const categories: DocumentCategory[] = [
  'Contrato',
  'Aditivo',
  'Proposta',
  'Documento cadastral',
  'Documento técnico',
  'Outros',
];
const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const isContract = (d: DocumentRecord) => d.category === 'Contrato' || d.category === 'Aditivo';
function futureDate(days: number) {
  const d = new Date(`${today()}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const isExpiring = (d: DocumentRecord) =>
  d.category === 'Contrato' &&
  d.status !== 'Encerrado' &&
  !!d.endDate &&
  d.endDate >= today() &&
  d.endDate <= futureDate(30);

function DocumentForm({
  document,
  clientId,
  onClose,
}: {
  document?: DocumentRecord;
  clientId?: string;
  onClose: () => void;
}) {
  const { data, session, save, notify } = useApp();
  const [form, setForm] = useState<DocumentRecord>(
    document || {
      id: newId('doc'),
      name: '',
      type: 'application/pdf',
      size: 0,
      clientId: clientId || '',
      category: 'Contrato',
      createdAt: new Date().toISOString(),
      responsibleId: session?.userId || '',
      notes: '',
      shared: false,
      number: '',
      startDate: today(),
      endDate: '',
      status: 'Vigente',
      value: 0,
      renewal: '',
    },
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = <K extends keyof DocumentRecord>(key: K, value: DocumentRecord[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const selectFile = (selected?: File) => {
    if (!selected) return;
    if (selected.size > 30 * 1024 * 1024) {
      setError('Selecione um arquivo de até 30 MB.');
      return;
    }
    setFile(selected);
    setError('');
    if (!document)
      setForm((f) => ({
        ...f,
        name: selected.name,
        type: selected.type || 'application/octet-stream',
        size: selected.size,
      }));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.clientId) {
      setError('Informe o nome do documento e o cliente.');
      return;
    }
    if (!document && !file) {
      setError('Selecione o arquivo do documento.');
      return;
    }
    if (isContract(form) && form.startDate && form.endDate && form.endDate < form.startDate) {
      setError('A data final deve ser igual ou posterior ao início da vigência.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const attachment = file ? fileStore.add(file, form.id) : null;
      const record = {
        ...form,
        ...(attachment ? { type: attachment.type, size: attachment.size } : {}),
        name: form.name.trim(),
      };
      if (!isContract(record)) {
        delete record.number;
        delete record.startDate;
        delete record.endDate;
        delete record.status;
        delete record.value;
        delete record.renewal;
      }
      await save('documents', record);
      notify(document ? 'Documento atualizado.' : 'Documento adicionado.');
      onClose();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o documento.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormPage
      eyebrow="GESTÃO DOCUMENTAL"
      title={document ? 'Editar documento' : 'Adicionar documento'}
      description="Vincule arquivos, contratos ou termos aditivos e gerencie prazos de vigência."
      backLabel="Voltar aos documentos"
      onBack={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="ops-form-full">
            <div className="ops-upload">
              <Upload size={24} />
              <p>
                {file
                  ? file.name
                  : document
                    ? 'Selecione um arquivo para substituir o documento, se necessário.'
                    : 'Selecione o documento que será vinculado ao cliente.'}
              </p>
              <input
                type="file"
                aria-label="Arquivo do documento"
                onChange={(e) => selectFile(e.target.files?.[0])}
                accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt"
              />
              <p className="ops-tiny">
                PDF, imagens e documentos · até 30 MB · arquivo disponível nesta sessão
              </p>
            </div>
          </div>
          <Field label="Nome do documento *">
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => change('name', e.target.value)}
              placeholder="Ex.: Contrato de prestação de serviços.pdf"
            />
          </Field>
          <Field label="Categoria">
            <select
              className="select"
              value={form.category}
              onChange={(e) => change('category', e.target.value as DocumentCategory)}
            >
              {categories.map((v) => (
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
                <option key={c.id} value={c.id}>
                  {c.tradeName || c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <select
              className="select"
              value={form.responsibleId}
              onChange={(e) => change('responsibleId', e.target.value)}
            >
              <option value="">Sem responsável</option>
              {data.users
                .filter((u) => u.role !== 'client')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          {isContract(form) && (
            <>
              <div className="ops-divider-heading">Dados contratuais</div>
              <Field label="Número do contrato / aditivo">
                <input
                  className="input"
                  value={form.number || ''}
                  onChange={(e) => change('number', e.target.value)}
                  placeholder="Ex.: 018/2026"
                />
              </Field>
              <Field label="Situação">
                <select
                  className="select"
                  value={form.status || 'Vigente'}
                  onChange={(e) => change('status', e.target.value as DocumentRecord['status'])}
                >
                  {['Vigente', 'Em renovação', 'Encerrado'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Início da vigência">
                <input
                  className="input"
                  type="date"
                  value={form.startDate || ''}
                  onChange={(e) => change('startDate', e.target.value)}
                />
              </Field>
              <Field label="Fim da vigência">
                <input
                  className="input"
                  type="date"
                  value={form.endDate || ''}
                  min={form.startDate || undefined}
                  onChange={(e) => change('endDate', e.target.value)}
                />
              </Field>
              <Field label="Valor contratado (R$)">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.value ?? ''}
                  onChange={(e) =>
                    change('value', e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </Field>
              <Field label="Condição de renovação">
                <input
                  className="input"
                  value={form.renewal || ''}
                  onChange={(e) => change('renewal', e.target.value)}
                  placeholder="Ex.: Renovação por 12 meses"
                />
              </Field>
            </>
          )}
          <div className="ops-form-full">
            <Field label="Observações">
              <textarea
                className="textarea"
                rows={3}
                value={form.notes}
                onChange={(e) => change('notes', e.target.value)}
              />
            </Field>
          </div>
          <div className="ops-form-full">
            <label className="ops-choice">
              <input
                type="checkbox"
                checked={form.shared}
                onChange={(e) => change('shared', e.target.checked)}
              />
              <span>
                <strong>Disponibilizar no portal do cliente</strong>
                <br />
                <span className="muted small">
                  O cliente poderá visualizar os dados e baixar o arquivo disponível.
                </span>
              </span>
            </label>
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
          <Button loading={saving} type="submit">
            {document ? 'Salvar alterações' : 'Adicionar documento'}
          </Button>
        </div>
      </form>
    </FormPage>
  );
}

export function DocumentsPage() {
  const { data, session, patch, remove, notify } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const portal = session?.role === 'client';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [client, setClient] = useState(params.get('client') || '');
  const [status, setStatus] = useState('');
  const [expiring, setExpiring] = useState(params.get('expiring') === '1');
  const [editor, setEditor] = useState<DocumentRecord | 'new' | null>(
    !portal && params.get('new') ? 'new' : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(params.get('id'));
  const [sharing, setSharing] = useState<DocumentRecord | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentRecord | null>(null);
  const [, setFileRevision] = useState(0);
  const reselect = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setClient(params.get('client') || '');
    setExpiring(params.get('expiring') === '1');
    setSelectedId(params.get('id'));
    setEditor(!portal && params.get('new') === '1' ? 'new' : null);
  }, [params, portal]);
  const clientName = (id: string) => {
    const c = data.clients.find((c) => c.id === id);
    return c?.tradeName || c?.name || 'Cliente não encontrado';
  };
  const scoped = data.documents.filter(
    (d) => !portal || (d.clientId === session?.clientId && d.shared),
  );
  const rows = scoped.filter(
    (d) =>
      (!category || d.category === category) &&
      (!client || portal || d.clientId === client) &&
      (!status || d.status === status) &&
      (!expiring || isExpiring(d)) &&
      `${d.name} ${d.number || ''} ${clientName(d.clientId)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const detail = scoped.find((d) => d.id === selectedId);
  const fileUrl = detail ? fileStore.url(detail.id) : undefined;
  const actualFile = detail ? fileStore.get(detail.id) : undefined;
  const replaceFile = async (file?: File) => {
    if (!file || !detail || portal) return;
    if (file.size > 30 * 1024 * 1024) {
      notify('Selecione um arquivo de até 30 MB.', 'error');
      return;
    }
    try {
      const attachment = fileStore.add(file, detail.id);
      await patch('documents', detail.id, { type: attachment.type, size: attachment.size });
      setFileRevision((n) => n + 1);
      notify('Arquivo disponível para visualizar e baixar nesta sessão.');
    } catch {
      notify('Não foi possível selecionar o arquivo.', 'error');
    }
  };
  const toggleSharing = async () => {
    if (!sharing) return;
    try {
      await patch('documents', sharing.id, { shared: !sharing.shared });
      notify(
        sharing.shared ? 'Documento retirado do portal.' : 'Documento compartilhado com o cliente.',
      );
      setSharing(null);
    } catch {
      notify('Não foi possível atualizar o compartilhamento.', 'error');
    }
  };
  const download = (d: DocumentRecord) => {
    const url = fileStore.url(d.id);
    if (!url) {
      setSelectedId(d.id);
      notify('Selecione o arquivo para disponibilizar o download nesta sessão.', 'info');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileStore.get(d.id)?.name || d.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };
  if (editor && !portal) {
    return (
      <DocumentForm
        document={editor === 'new' ? undefined : editor}
        clientId={client}
        onClose={() => setEditor(null)}
      />
    );
  }
  if (detail) {
    return (
      <>
        <FormPage
          eyebrow={detail.category.toUpperCase()}
          title={detail.name}
          description={clientName(detail.clientId)}
          backLabel="Voltar aos documentos"
          onBack={() => setSelectedId(null)}
          actions={
            <div className="ops-actions">
              {detail.status && <Badge status={detail.status} />}
              {fileUrl && (
                <Button size="sm" onClick={() => download(detail)}>
                  <Download size={14} />
                  Baixar arquivo
                </Button>
              )}
              {!portal && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedId(null);
                    setEditor(detail);
                  }}
                >
                  <Pencil size={14} />
                  Editar
                </Button>
              )}
            </div>
          }
        >
          <div className="ops-document-preview">
            {fileUrl && actualFile ? (
              actualFile.type.startsWith('image/') ? (
                <img src={fileUrl} alt={`Prévia de ${detail.name}`} />
              ) : actualFile.type === 'application/pdf' ? (
                <iframe title={`Prévia de ${detail.name}`} src={fileUrl} />
              ) : (
                <div className="ops-empty-preview">
                  <FileText size={42} />
                  <h4>Arquivo pronto para download</h4>
                  <p>
                    Este formato pode ser aberto no aplicativo correspondente após o download.
                  </p>
                  <Button onClick={() => download(detail)}>
                    <Download size={15} />
                    Baixar arquivo
                  </Button>
                </div>
              )
            ) : (
              <div className="ops-empty-preview">
                <FileText size={42} />
                <h4>Arquivo indisponível nesta sessão</h4>
                <p>
                  {portal
                    ? 'Os dados do documento estão disponíveis. Peça à equipe responsável o envio do arquivo.'
                    : 'Os dados do documento foram preservados. Selecione o arquivo original para visualizar ou baixar nesta sessão.'}
                </p>
                {!portal && (
                  <Button variant="secondary" onClick={() => reselect.current?.click()}>
                    <Upload size={15} />
                    Selecionar arquivo
                  </Button>
                )}
              </div>
            )}
          </div>
          {!portal && (
            <input
              ref={reselect}
              type="file"
              hidden
              aria-label="Selecionar arquivo do documento"
              onChange={(e) => {
                void replaceFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          )}
          <div className="ops-info">
            <span>Cliente</span>
            {portal ? (
              <strong>{clientName(detail.clientId)}</strong>
            ) : (
              <button className="link" onClick={() => navigate(`/clientes/${detail.clientId}`)}>
                {clientName(detail.clientId)} <ExternalLink size={12} />
              </button>
            )}
          </div>
          <div className="ops-info">
            <span>Adicionado em</span>
            <span>{dateTime(detail.createdAt)}</span>
          </div>
          <div className="ops-info">
            <span>Responsável</span>
            <span>
              {data.users.find((u) => u.id === detail.responsibleId)?.name || 'Não informado'}
            </span>
          </div>
          {isContract(detail) && (
            <>
              <div className="ops-info">
                <span>Número</span>
                <strong>{detail.number || 'Não informado'}</strong>
              </div>
              <div className="ops-info">
                <span>Vigência</span>
                <span>
                  {date(detail.startDate)} a {date(detail.endDate)}
                </span>
              </div>
              <div className="ops-info">
                <span>Valor contratado</span>
                <strong>
                  {detail.value !== undefined ? money(detail.value) : 'Não informado'}
                </strong>
              </div>
              <div className="ops-info">
                <span>Renovação</span>
                <span>{detail.renewal || 'Não informada'}</span>
              </div>
            </>
          )}
          <div className="ops-info">
            <span>Observações</span>
            <p className="ops-pre">{detail.notes || 'Nenhuma observação.'}</p>
          </div>
          {!portal && (
            <div className="form-actions">
              {fileUrl && (
                <Button variant="secondary" onClick={() => reselect.current?.click()}>
                  <RefreshCw size={14} />
                  Selecionar novamente
                </Button>
              )}
              <Button variant="secondary" onClick={() => setSharing(detail)}>
                <Share2 size={14} />
                {detail.shared ? 'Retirar do portal' : 'Compartilhar no portal'}
              </Button>
              <Button
                variant="danger"
                onClick={() => setDeleteDoc(detail)}
                title="Excluir documento"
              >
                <Trash2 size={14} />
                Excluir documento
              </Button>
            </div>
          )}
        </FormPage>
        <ConfirmDialog
          danger={false}
          open={!!sharing}
          title={sharing?.shared ? 'Retirar documento do portal?' : 'Compartilhar documento?'}
          description={
            sharing?.shared
              ? 'O cliente deixará de visualizar este documento no portal.'
              : `O documento ficará visível para ${sharing ? clientName(sharing.clientId) : 'o cliente'} no portal.`
          }
          onConfirm={toggleSharing}
          onClose={() => setSharing(null)}
        />
        <ConfirmDialog
          danger
          open={!!deleteDoc}
          title="Excluir documento?"
          description={`O documento "${deleteDoc?.name || ''}" será removido definitivamente.`}
          onConfirm={async () => {
            if (!deleteDoc) return;
            try {
              await remove('documents', deleteDoc.id);
              notify('Documento excluído com sucesso.');
              setDeleteDoc(null);
              setSelectedId(null);
              window.location.reload();
            } catch (error) {
              notify(
                error instanceof Error ? error.message : 'Não foi possível excluir o documento.',
                'error',
              );
            }
          }}
          onClose={() => setDeleteDoc(null)}
        />
      </>
    );
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={portal ? 'PORTAL DO CLIENTE' : 'GESTÃO DOCUMENTAL'}
        title={portal ? 'Meus documentos' : 'Documentos e contratos'}
        description={
          portal
            ? 'Consulte os documentos e contratos compartilhados com sua empresa.'
            : 'Centralize arquivos, acompanhe vigências e mantenha os documentos organizados.'
        }
        actions={
          !portal ? (
            <Button onClick={() => setEditor('new')}>
              <Plus size={16} />
              Adicionar documento
            </Button>
          ) : undefined
        }
      />
      <div className="ops-summary">
        <StatCard
          label="Documentos"
          value={scoped.length}
          detail="Arquivos cadastrados"
          icon={FolderOpen}
          tone="blue"
          onClick={() => {
            setCategory('');
            setStatus('');
            setExpiring(false);
          }}
        />
        <StatCard
          label="Contratos vigentes"
          value={scoped.filter((d) => isContract(d) && d.status === 'Vigente').length}
          detail="Contratos e aditivos"
          icon={FileCheck2}
          tone="green"
          onClick={() => {
            setCategory('');
            setStatus('Vigente');
            setExpiring(false);
          }}
        />
        <StatCard
          label="Vencem em 30 dias"
          value={scoped.filter(isExpiring).length}
          detail="Acompanhe a renovação"
          icon={CalendarClock}
          tone="amber"
          onClick={() => {
            setExpiring((v) => !v);
            setStatus('');
            setCategory('');
          }}
        />
        <StatCard
          label={portal ? 'Em renovação' : 'Compartilhados'}
          value={scoped.filter((d) => (portal ? d.status === 'Em renovação' : d.shared)).length}
          detail={portal ? 'Contratos em análise' : 'Disponíveis no portal do cliente'}
          icon={Share2}
          tone="navy"
        />
      </div>
      <Card>
        <div className="toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar documento, contrato ou cliente..."
          />
          <div className="filters">
            <select
              className="select"
              aria-label="Categoria do documento"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {categories.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            {!portal && (
              <select
                className="select"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                aria-label="Cliente do documento"
              >
                <option value="">Todos os clientes</option>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.name}
                  </option>
                ))}
              </select>
            )}
            <select
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Situação do contrato"
            >
              <option value="">Todas as situações</option>
              {['Vigente', 'Em renovação', 'Encerrado'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <label className="ops-choice">
              <input
                type="checkbox"
                checked={expiring}
                onChange={(e) => setExpiring(e.target.checked)}
              />
              <span>Vencem em 30 dias</span>
            </label>
          </div>
        </div>
        <DataTable
          rows={rows}
          onRowClick={(d) => setSelectedId(d.id)}
          pageSize={8}
          emptyTitle="Nenhum documento encontrado"
          columns={[
            {
              key: 'name',
              label: 'Documento',
              sortValue: (d) => d.name,
              render: (d) => (
                <div className="inline">
                  <span className={`ops-file-icon ${d.type === 'application/pdf' ? 'pdf' : ''}`}>
                    {d.type.startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}
                  </span>
                  <div>
                    <div className="cell-title">{d.name}</div>
                    <div className="cell-subtitle">
                      {d.category} · {fileSize(d.size)}
                    </div>
                  </div>
                </div>
              ),
            },
            ...(!portal
              ? [
                  {
                    key: 'client',
                    label: 'Cliente',
                    sortValue: (d: DocumentRecord) => clientName(d.clientId),
                    render: (d: DocumentRecord) => clientName(d.clientId),
                  },
                ]
              : []),
            {
              key: 'date',
              label: 'Adicionado em',
              sortValue: (d) => d.createdAt,
              render: (d) => <span className="small">{date(d.createdAt)}</span>,
            },
            {
              key: 'end',
              label: 'Vigência até',
              sortValue: (d) => d.endDate || '9999',
              render: (d) =>
                d.endDate ? (
                  <>
                    <div className="small">{date(d.endDate)}</div>
                    {isExpiring(d) && (
                      <span className="ops-tiny" style={{ color: '#c39432' }}>
                        Renovação próxima
                      </span>
                    )}
                  </>
                ) : (
                  <span className="muted">—</span>
                ),
            },
            {
              key: 'status',
              label: 'Situação',
              sortValue: (d) => d.status || '',
              render: (d) =>
                d.status ? <Badge status={d.status} /> : <span className="muted">—</span>,
            },
            ...(!portal
              ? [
                  {
                    key: 'share',
                    label: 'Portal',
                    sortValue: (d: DocumentRecord) => (d.shared ? 1 : 0),
                    render: (d: DocumentRecord) =>
                      d.shared ? (
                        <span className="small inline" style={{ color: '#509879' }}>
                          <Share2 size={13} />
                          Compartilhado
                        </span>
                      ) : (
                        <span className="small muted">Interno</span>
                      ),
                  },
                ]
              : []),
            {
              key: 'actions',
              label: '',
              render: (d) => (
                <div className="inline">
                  <button
                    className="icon-button"
                    aria-label={`Baixar ${d.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      download(d);
                    }}
                  >
                    <Download size={15} />
                  </button>
                  {!portal && (
                    <>
                      <button
                        className="icon-button"
                        aria-label={`Editar ${d.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditor(d);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Excluir ${d.name}`}
                        title="Excluir documento"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDoc(d);
                        }}
                      >
                        <Trash2 size={15} className="text-rose-600" />
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
      <ConfirmDialog
        danger
        open={!!deleteDoc}
        title="Excluir documento?"
        description={`O documento "${deleteDoc?.name || ''}" será removido definitivamente.`}
        onConfirm={async () => {
          if (!deleteDoc) return;
          try {
            await remove('documents', deleteDoc.id);
            notify('Documento excluído com sucesso.');
            setDeleteDoc(null);
            if (selectedId === deleteDoc.id) setSelectedId(null);
            window.location.reload();
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o documento.',
              'error',
            );
          }
        }}
        onClose={() => setDeleteDoc(null)}
      />
    </div>
  );
}
