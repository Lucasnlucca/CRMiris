import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
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
  Tabs,
} from '../../components/ui';
import { date, money, newId, today } from '../../utils/format';
import type { Charge, ChargeStatus, Invoice } from '../../types';
import {
  chargeDay,
  effectiveChargeStatus as chargeStatus,
  isPaidInMonth,
} from '../../utils/finance';
import './operations.css';

const monthBounds = () => {
  const current = today();
  const last = new Date(Number(current.slice(0, 4)), Number(current.slice(5, 7)), 0).getDate();
  return { from: `${current.slice(0, 7)}-01`, to: `${current.slice(0, 7)}-${last}` };
};
const competenceDate = (competence: string) =>
  /^\d{4}-\d{2}/.test(competence)
    ? `${competence.slice(0, 7)}-01`
    : /^\d{2}\/\d{4}$/.test(competence)
      ? `${competence.slice(3)}-${competence.slice(0, 2)}-01`
      : competence;
const competenceLabel = (competence: string) => {
  const v = competenceDate(competence);
  return /^\d{4}-\d{2}/.test(v) ? `${v.slice(5, 7)}/${v.slice(0, 4)}` : competence;
};

function ChargeForm({
  charge,
  clientId,
  onClose,
}: {
  charge?: Charge;
  clientId?: string;
  onClose: () => void;
}) {
  const { data, save, notify } = useApp();
  const [form, setForm] = useState<Charge>(
    charge || {
      id: newId('chg'),
      number: `COB-${today().slice(0, 4)}-${String(data.charges.length + 1).padStart(4, '0')}`,
      clientId: clientId || '',
      description: '',
      amount: 0,
      dueDate: today(),
      method: 'Pix',
      status: 'Pendente',
      reference: `${today().slice(5, 7)}/${today().slice(0, 4)}`,
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = <K extends keyof Charge>(key: K, value: Charge[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId || !form.description.trim() || !form.number.trim() || !(form.amount > 0)) {
      setError('Informe o cliente, a descrição, o número e um valor maior que zero.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await save('charges', { ...form, description: form.description.trim() });
      notify(charge ? 'Lançamento atualizado.' : 'Lançamento financeiro registrado.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormPage
      eyebrow="GESTÃO FINANCEIRA"
      title={charge ? 'Editar lançamento' : 'Novo lançamento financeiro'}
      description="Registre cobranças, faturas e vencimentos vinculados ao cliente."
      backLabel="Voltar ao financeiro"
      onBack={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
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
          <Field label="Número *">
            <input
              className="input"
              required
              value={form.number}
              onChange={(e) => change('number', e.target.value)}
            />
          </Field>
          <div className="ops-form-full">
            <Field label="Descrição *">
              <input
                className="input"
                required
                value={form.description}
                onChange={(e) => change('description', e.target.value)}
                placeholder="Ex.: Mensalidade PABX Cloud"
              />
            </Field>
          </div>
          <Field label="Valor (R$) *">
            <input
              className="input"
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount || ''}
              onChange={(e) => change('amount', Number(e.target.value))}
            />
          </Field>
          <Field label="Vencimento *">
            <input
              className="input"
              required
              type="date"
              value={form.dueDate}
              onChange={(e) => change('dueDate', e.target.value)}
            />
          </Field>
          <Field label="Forma de pagamento">
            <select
              className="select"
              value={form.method}
              onChange={(e) => change('method', e.target.value as Charge['method'])}
            >
              {['Pix', 'Boleto', 'Cartão', 'Transferência'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Referência">
            <input
              className="input"
              value={form.reference}
              onChange={(e) => change('reference', e.target.value)}
              placeholder="Ex.: 10/2026"
            />
          </Field>
        </div>
        <p className="ops-finance-notice">
          <CreditCard size={14} />
          Este lançamento será registrado na base financeira da empresa no Appwrite.
        </p>
        {error && (
          <div className="ops-form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {charge ? 'Salvar alterações' : 'Registrar lançamento'}
          </Button>
        </div>
      </form>
    </FormPage>
  );
}

function InvoiceForm({
  invoice,
  clientId,
  onClose,
}: {
  invoice?: Invoice;
  clientId?: string;
  onClose: () => void;
}) {
  const { data, save, notify } = useApp();
  const [form, setForm] = useState<Invoice>(
    invoice || {
      id: newId('inv'),
      number: `${today().slice(0, 4)}${String(data.invoices.length + 1).padStart(5, '0')}`,
      clientId: clientId || '',
      competence: today().slice(0, 7),
      amount: 0,
      status: 'Pendente',
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = <K extends keyof Invoice>(key: K, value: Invoice[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId || !form.number.trim() || !(form.amount > 0)) {
      setError('Informe o cliente, o número e um valor maior que zero.');
      return;
    }
    setSaving(true);
    try {
      await save('invoices', form);
      notify(invoice ? 'Registro da nota atualizado.' : 'Nota registrada.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a nota.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormPage
      eyebrow="GESTÃO FINANCEIRA"
      title={invoice ? 'Editar registro da nota' : 'Registrar nota fiscal'}
      description="Cadastre e acompanhe o status de emissão de notas fiscais."
      backLabel="Voltar ao financeiro"
      onBack={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
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
          <Field label="Número da nota *">
            <input
              className="input"
              required
              value={form.number}
              onChange={(e) => change('number', e.target.value)}
            />
          </Field>
          <Field label="Competência *">
            <input
              className="input"
              required
              type="month"
              value={competenceDate(form.competence).slice(0, 7)}
              onChange={(e) => change('competence', e.target.value)}
            />
          </Field>
          <Field label="Valor (R$) *">
            <input
              className="input"
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount || ''}
              onChange={(e) => change('amount', Number(e.target.value))}
            />
          </Field>
        </div>
        <p className="ops-finance-notice">
          <FileText size={14} />
          Registro fiscal vinculado ao cliente na base do Appwrite.
        </p>
        {error && (
          <div className="ops-form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Salvar registro
          </Button>
        </div>
      </form>
    </FormPage>
  );
}

export function FinancePage() {
  const { data, session, patch, remove, notify } = useApp();
  const [params] = useSearchParams();
  const portal = session?.role === 'client';
  const bounds = monthBounds();
  const requestedInvoice =
    params.get('tab') === 'notas' ||
    params.get('tab') === 'invoices' ||
    data.invoices.some((i) => i.id === params.get('id'));
  const [tab, setTab] = useState(requestedInvoice ? 'invoices' : 'charges');
  const [query, setQuery] = useState('');
  const [client, setClient] = useState(params.get('client') || '');
  const [status, setStatus] = useState(params.get('status') || '');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [dateBasis, setDateBasis] = useState<'due' | 'paid'>(
    params.get('status') === 'Pago' && params.get('period') === 'month' ? 'paid' : 'due',
  );
  const [from, setFrom] = useState(params.get('period') === 'month' ? bounds.from : '');
  const [to, setTo] = useState(params.get('period') === 'month' ? bounds.to : '');
  const [chargeEditor, setChargeEditor] = useState<Charge | 'new' | null>(null);
  const [invoiceEditor, setInvoiceEditor] = useState<Invoice | 'new' | null>(null);
  const [chargeId, setChargeId] = useState<string | null>(
    requestedInvoice ? null : params.get('id'),
  );
  const [invoiceId, setInvoiceId] = useState<string | null>(
    requestedInvoice ? params.get('id') : null,
  );
  const [update, setUpdate] = useState<
    | { kind: 'charge'; item: Charge; status: ChargeStatus }
    | { kind: 'invoice'; item: Invoice; status: Invoice['status'] }
    | null
  >(null);
  const [deleteFinanceItem, setDeleteFinanceItem] = useState<
    | { kind: 'charge'; item: Charge }
    | { kind: 'invoice'; item: Invoice }
    | null
  >(null);
  useEffect(() => {
    const next = monthBounds();
    setClient(params.get('client') || '');
    setStatus(params.get('status') || '');
    const invoiceQuery =
      params.get('tab') === 'notas' ||
      params.get('tab') === 'invoices' ||
      data.invoices.some((i) => i.id === params.get('id'));
    setTab(invoiceQuery ? 'invoices' : 'charges');
    setChargeId(invoiceQuery ? null : params.get('id'));
    setInvoiceId(invoiceQuery ? params.get('id') : null);
    setFrom(params.get('period') === 'month' ? next.from : '');
    setTo(params.get('period') === 'month' ? next.to : '');
    setDateBasis(
      params.get('status') === 'Pago' && params.get('period') === 'month' ? 'paid' : 'due',
    );
  }, [params]);
  if (session?.role === 'support')
    return (
      <EmptyState
        title="Área financeira restrita"
        description="Este perfil não possui acesso aos dados financeiros."
      />
    );
  const clientName = (id: string) => {
    const c = data.clients.find((c) => c.id === id);
    return c?.tradeName || c?.name || 'Cliente não encontrado';
  };
  const scopedCharges = data.charges.filter((c) =>
    portal ? c.clientId === session?.clientId : !client || c.clientId === client,
  );
  const scopedInvoices = data.invoices.filter((c) =>
    portal ? c.clientId === session?.clientId : !client || c.clientId === client,
  );
  const periodCharges = scopedCharges.filter((c) => {
    const selectedDate = dateBasis === 'paid' ? chargeDay(c.paidAt) : c.dueDate;
    return !!selectedDate && (!from || selectedDate >= from) && (!to || selectedDate <= to);
  });
  const rows = periodCharges.filter(
    (c) =>
      (!status || chargeStatus(c) === status) &&
      `${c.number} ${c.description} ${clientName(c.clientId)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const invoiceRows = scopedInvoices.filter(
    (i) =>
      (!from || competenceDate(i.competence).slice(0, 7) >= from.slice(0, 7)) &&
      (!to || competenceDate(i.competence).slice(0, 7) <= to.slice(0, 7)) &&
      (!invoiceStatus || i.status === invoiceStatus) &&
      `${i.number} ${clientName(i.clientId)}`.toLowerCase().includes(query.toLowerCase()),
  );
  const total = (test: (c: Charge) => boolean) =>
    periodCharges.filter(test).reduce((n, c) => n + c.amount, 0);
  const paid = total((c) => c.status === 'Pago');
  const pending = total((c) => c.status === 'Pendente' || c.status === 'Vencido');
  const overdue = total((c) => chargeStatus(c) === 'Vencido');
  const launched = total((c) => c.status !== 'Cancelado');
  const receivedThisMonth = scopedCharges
    .filter((c) => isPaidInMonth(c))
    .reduce((sum, c) => sum + c.amount, 0);
  const overdueCharges = scopedCharges.filter((c) => chargeStatus(c) === 'Vencido');
  const overdueClients = new Set(overdueCharges.map((c) => c.clientId)).size;
  const charge = scopedCharges.find((c) => c.id === chargeId);
  const invoice = scopedInvoices.find((i) => i.id === invoiceId);
  const confirmUpdate = async () => {
    if (!update || portal) return;
    try {
      if (update.kind === 'charge') {
        await patch('charges', update.item.id, {
          status: update.status,
          paidAt: update.status === 'Pago' ? today() : undefined,
        });
      } else {
        await patch('invoices', update.item.id, { status: update.status });
      }
      notify('Status do registro atualizado.');
      setUpdate(null);
    } catch {
      notify('Não foi possível atualizar o registro.', 'error');
    }
  };
  const exportCsv = () => {
    const dataRows =
      tab === 'charges'
        ? [
            ['Número', 'Cliente', 'Descrição', 'Valor', 'Vencimento', 'Status', 'Referência'],
            ...rows.map((c) => [
              c.number,
              clientName(c.clientId),
              c.description,
              c.amount.toFixed(2),
              c.dueDate,
              chargeStatus(c),
              c.reference,
            ]),
          ]
        : [
            ['Número', 'Cliente', 'Competência', 'Valor', 'Status'],
            ...invoiceRows.map((i) => [
              i.number,
              clientName(i.clientId),
              competenceLabel(i.competence),
              i.amount.toFixed(2),
              i.status,
            ]),
          ];
    const encode = (v: string) => `"${(/^[=+@-]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
    const csv = '\ufeff' + dataRows.map((row) => row.map(encode).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab === 'charges' ? 'lancamentos' : 'notas'}-${today()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Relatório CSV exportado.');
  };
  if (chargeEditor && !portal) {
    return (
      <ChargeForm
        charge={chargeEditor === 'new' ? undefined : chargeEditor}
        clientId={client}
        onClose={() => setChargeEditor(null)}
      />
    );
  }
  if (invoiceEditor && !portal) {
    return (
      <InvoiceForm
        invoice={invoiceEditor === 'new' ? undefined : invoiceEditor}
        clientId={client}
        onClose={() => setInvoiceEditor(null)}
      />
    );
  }
  if (charge) {
    return (
      <>
        <FormPage
          eyebrow="DETALHES DO LANÇAMENTO"
          title={`Lançamento ${charge.number}`}
          description={`${charge.description} · ${clientName(charge.clientId)}`}
          backLabel="Voltar ao financeiro"
          onBack={() => setChargeId(null)}
          actions={
            <div className="inline">
              <Badge status={chargeStatus(charge)} />
              <strong style={{ fontSize: 22 }}>{money(charge.amount)}</strong>
            </div>
          }
        >
          {[
            ['Cliente', clientName(charge.clientId)],
            ['Descrição', charge.description],
            ['Vencimento', date(charge.dueDate)],
            ['Forma de pagamento', charge.method],
            ['Referência', charge.reference],
            ['Pagamento', charge.paidAt ? date(charge.paidAt) : 'Não registrado'],
          ].map(([label, value]) => (
            <div className="ops-info" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
          {!portal && (
            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setChargeId(null);
                  setChargeEditor(charge);
                }}
              >
                <Pencil size={14} />
                Editar
              </Button>
              {charge.status !== 'Pago' && charge.status !== 'Cancelado' && (
                <Button
                  onClick={() => setUpdate({ kind: 'charge', item: charge, status: 'Pago' })}
                >
                  <CheckCircle2 size={14} />
                  Marcar como pago
                </Button>
              )}
              {(charge.status === 'Pago' || charge.status === 'Cancelado') && (
                <Button
                  variant="secondary"
                  onClick={() => setUpdate({ kind: 'charge', item: charge, status: 'Pendente' })}
                >
                  <RefreshCw size={14} />
                  Reabrir
                </Button>
              )}
              {charge.status !== 'Cancelado' && charge.status !== 'Pago' && (
                <Button
                  variant="danger"
                  onClick={() => setUpdate({ kind: 'charge', item: charge, status: 'Cancelado' })}
                >
                  <XCircle size={14} />
                  Cancelar lançamento
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => setDeleteFinanceItem({ kind: 'charge', item: charge })}
                title="Excluir cobrança"
              >
                <Trash2 size={14} />
                Excluir cobrança
              </Button>
            </div>
          )}
        </FormPage>
        <ConfirmDialog
          open={!!update}
          title="Confirmar alteração de status?"
          description={`O registro ${update?.item.number || ''} será marcado como ${update?.status.toLowerCase() || ''} no banco de dados.`}
          danger={update?.status === 'Cancelado' || update?.status === 'Cancelada'}
          onConfirm={confirmUpdate}
          onClose={() => setUpdate(null)}
        />
        <ConfirmDialog
          open={!!deleteFinanceItem}
          title={deleteFinanceItem?.kind === 'charge' ? 'Excluir cobrança?' : 'Excluir nota fiscal?'}
          description={`O registro ${deleteFinanceItem?.item.number || ''} será removido definitivamente do banco de dados.`}
          danger
          onConfirm={async () => {
            if (!deleteFinanceItem) return;
            try {
              if (deleteFinanceItem.kind === 'charge') {
                await remove('charges', deleteFinanceItem.item.id);
                notify('Cobrança excluída com sucesso.');
                if (chargeId === deleteFinanceItem.item.id) setChargeId(null);
              } else {
                await remove('invoices', deleteFinanceItem.item.id);
                notify('Nota fiscal excluída com sucesso.');
                if (invoiceId === deleteFinanceItem.item.id) setInvoiceId(null);
              }
              setDeleteFinanceItem(null);
            } catch (error) {
              notify(
                error instanceof Error ? error.message : 'Não foi possível excluir o registro.',
                'error',
              );
            }
          }}
          onClose={() => setDeleteFinanceItem(null)}
        />
      </>
    );
  }
  if (invoice) {
    return (
      <>
        <FormPage
          eyebrow="DETALHES DA NOTA FISCAL"
          title={`Nota fiscal ${invoice.number}`}
          description={`${clientName(invoice.clientId)} · Competência ${competenceLabel(invoice.competence)}`}
          backLabel="Voltar ao financeiro"
          onBack={() => setInvoiceId(null)}
          actions={
            <div className="inline">
              <Badge status={invoice.status} />
              <strong style={{ fontSize: 22 }}>{money(invoice.amount)}</strong>
            </div>
          }
        >
          <div className="ops-info">
            <span>Cliente</span>
            <strong>{clientName(invoice.clientId)}</strong>
          </div>
          <div className="ops-info">
            <span>Competência</span>
            <strong>{competenceLabel(invoice.competence)}</strong>
          </div>
          <div className="ops-info">
            <span>Documento fiscal</span>
            <span>Arquivo fiscal não anexado a este registro.</span>
          </div>
          {!portal && (
            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setInvoiceId(null);
                  setInvoiceEditor(invoice);
                }}
              >
                <Pencil size={14} />
                Editar registro
              </Button>
              {invoice.status === 'Pendente' && (
                <Button
                  onClick={() => setUpdate({ kind: 'invoice', item: invoice, status: 'Emitida' })}
                >
                  <CheckCircle2 size={14} />
                  Registrar como emitida
                </Button>
              )}
              {invoice.status !== 'Pendente' && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setUpdate({ kind: 'invoice', item: invoice, status: 'Pendente' })
                  }
                >
                  Voltar para pendente
                </Button>
              )}
              {invoice.status !== 'Cancelada' && (
                <Button
                  variant="danger"
                  onClick={() =>
                    setUpdate({ kind: 'invoice', item: invoice, status: 'Cancelada' })
                  }
                >
                  Cancelar registro
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => setDeleteFinanceItem({ kind: 'invoice', item: invoice })}
                title="Excluir nota fiscal"
              >
                <Trash2 size={14} />
                Excluir nota fiscal
              </Button>
            </div>
          )}
        </FormPage>
        <ConfirmDialog
          open={!!update}
          title="Confirmar alteração de status?"
          description={`O registro ${update?.item.number || ''} será marcado como ${update?.status.toLowerCase() || ''} no banco de dados.`}
          danger={update?.status === 'Cancelado' || update?.status === 'Cancelada'}
          onConfirm={confirmUpdate}
          onClose={() => setUpdate(null)}
        />
        <ConfirmDialog
          open={!!deleteFinanceItem}
          title={deleteFinanceItem?.kind === 'charge' ? 'Excluir cobrança?' : 'Excluir nota fiscal?'}
          description={`O registro ${deleteFinanceItem?.item.number || ''} será removido definitivamente do banco de dados.`}
          danger
          onConfirm={async () => {
            if (!deleteFinanceItem) return;
            try {
              if (deleteFinanceItem.kind === 'charge') {
                await remove('charges', deleteFinanceItem.item.id);
                notify('Cobrança excluída com sucesso.');
                if (chargeId === deleteFinanceItem.item.id) setChargeId(null);
              } else {
                await remove('invoices', deleteFinanceItem.item.id);
                notify('Nota fiscal excluída com sucesso.');
                if (invoiceId === deleteFinanceItem.item.id) setInvoiceId(null);
              }
              setDeleteFinanceItem(null);
            } catch (error) {
              notify(
                error instanceof Error ? error.message : 'Não foi possível excluir o registro.',
                'error',
              );
            }
          }}
          onClose={() => setDeleteFinanceItem(null)}
        />
      </>
    );
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={portal ? 'PORTAL DO CLIENTE' : 'GESTÃO FINANCEIRA'}
        title={portal ? 'Meu financeiro' : 'Financeiro'}
        description={
          portal
            ? 'Acompanhe os lançamentos e as notas da sua empresa.'
            : 'Uma visão clara dos recebimentos, vencimentos e documentos fiscais.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={15} />
              Exportar CSV
            </Button>
            {!portal && (
              <Button
                onClick={() =>
                  tab === 'charges' ? setChargeEditor('new') : setInvoiceEditor('new')
                }
              >
                <Plus size={16} />
                {tab === 'charges' ? 'Novo lançamento' : 'Registrar nota'}
              </Button>
            )}
          </>
        }
      />
      <div className="ops-summary">
        <StatCard
          label="Total lançado"
          value={money(launched)}
          detail="No período selecionado"
          icon={Wallet}
          tone="blue"
          onClick={() => {
            setStatus('');
            setDateBasis('due');
            setTab('charges');
          }}
        />
        <StatCard
          label={portal ? 'Total pago' : 'Recebido'}
          value={money(paid)}
          detail={`${periodCharges.filter((c) => c.status === 'Pago').length} lançamentos pagos`}
          icon={ArrowDownLeft}
          tone="green"
          onClick={() => {
            setStatus('Pago');
            setDateBasis('paid');
            setTab('charges');
          }}
        />
        <StatCard
          label={portal ? 'Em aberto' : 'A receber'}
          value={money(pending)}
          detail="Pendentes e vencidos"
          icon={ArrowUpRight}
          tone="navy"
        />
        <StatCard
          label="Vencido"
          value={money(overdue)}
          detail={`${periodCharges.filter((c) => chargeStatus(c) === 'Vencido').length} lançamentos em atraso`}
          icon={CalendarClock}
          tone="amber"
          onClick={() => {
            setStatus('Vencido');
            setDateBasis('due');
            setTab('charges');
          }}
        />
      </div>
      <div className="ops-finance-highlights">
        <button
          type="button"
          onClick={() => {
            setTab('charges');
            setQuery('');
            setStatus('Pago');
            setDateBasis('paid');
            setFrom(bounds.from);
            setTo(bounds.to);
          }}
        >
          <span className="inline">
            <ArrowDownLeft size={17} />
            <span>
              {portal ? 'Pago neste mês' : 'Recebido neste mês'}
              <small>Por data de pagamento</small>
            </span>
          </span>
          <span className="inline">
            <strong>{money(receivedThisMonth)}</strong>
            <ArrowUpRight size={14} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('charges');
            setQuery('');
            setStatus('Vencido');
            setDateBasis('due');
            setFrom('');
            setTo('');
          }}
        >
          <span className="inline">
            <CalendarClock size={17} />
            <span>
              {portal ? 'Cobranças vencidas' : 'Clientes com cobranças vencidas'}
              <small>
                {portal ? 'Lançamentos da sua empresa' : 'Clientes únicos · todos os vencimentos'}
              </small>
            </span>
          </span>
          <span className="inline">
            <strong>{portal ? overdueCharges.length : overdueClients}</strong>
            <ArrowUpRight size={14} />
          </span>
        </button>
      </div>
      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v);
          setQuery('');
        }}
        items={[
          { id: 'charges', label: 'Lançamentos', count: scopedCharges.length },
          { id: 'invoices', label: 'Notas fiscais', count: scopedInvoices.length },
        ]}
      />
      <Card>
        <div className="toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={
              tab === 'charges'
                ? 'Buscar cobrança, descrição ou cliente...'
                : 'Buscar nota ou cliente...'
            }
          />
          <div className="filters">
            {!portal && (
              <select
                className="select"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                aria-label="Cliente financeiro"
              >
                <option value="">Todos os clientes</option>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.name}
                  </option>
                ))}
              </select>
            )}
            {tab === 'charges' ? (
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Status do lançamento"
              >
                <option value="">Todos os status</option>
                {['Pendente', 'Pago', 'Vencido', 'Cancelado'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            ) : (
              <select
                className="select"
                value={invoiceStatus}
                onChange={(e) => setInvoiceStatus(e.target.value)}
                aria-label="Status da nota"
              >
                <option value="">Todos os status</option>
                {['Emitida', 'Pendente', 'Cancelada'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="toolbar">
          <div className="ops-date-filters">
            <span className="small muted">Período:</span>
            {tab === 'charges' ? (
              <select
                className="select"
                value={dateBasis}
                onChange={(e) => setDateBasis(e.target.value as 'due' | 'paid')}
                aria-label="Base do período"
              >
                <option value="due">Vencimento</option>
                <option value="paid">Pagamento</option>
              </select>
            ) : (
              <span className="small muted">Competência</span>
            )}
            <input
              className="input"
              type="date"
              aria-label="Início do período"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="small muted">até</span>
            <input
              className="input"
              type="date"
              aria-label="Fim do período"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom(bounds.from);
                setTo(bounds.to);
              }}
            >
              Este mês
            </Button>
            {(from || to) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
              >
                Limpar período
              </Button>
            )}
          </div>
          <span className="small muted">
            {tab === 'charges' ? rows.length : invoiceRows.length} registros
          </span>
        </div>
        {tab === 'charges' ? (
          <DataTable
            rows={rows}
            onRowClick={(c) => setChargeId(c.id)}
            pageSize={8}
            emptyTitle="Nenhum lançamento encontrado"
            columns={[
              {
                key: 'number',
                label: 'Lançamento',
                sortValue: (c) => c.number,
                render: (c) => (
                  <>
                    <div className="cell-title">{c.number}</div>
                    <div className="cell-subtitle">{c.description}</div>
                  </>
                ),
              },
              ...(!portal
                ? [
                    {
                      key: 'client',
                      label: 'Cliente',
                      sortValue: (c: Charge) => clientName(c.clientId),
                      render: (c: Charge) => clientName(c.clientId),
                    },
                  ]
                : []),
              {
                key: 'amount',
                label: 'Valor',
                sortValue: (c) => c.amount,
                render: (c) => <span className="ops-money">{money(c.amount)}</span>,
              },
              {
                key: 'due',
                label: 'Vencimento',
                sortValue: (c) => c.dueDate,
                render: (c) => (
                  <span style={chargeStatus(c) === 'Vencido' ? { color: '#d17755' } : undefined}>
                    {date(c.dueDate)}
                  </span>
                ),
              },
              {
                key: 'method',
                label: 'Forma',
                sortValue: (c) => c.method,
                render: (c) => <span className="small">{c.method}</span>,
              },
              {
                key: 'status',
                label: 'Status',
                sortValue: (c) => chargeStatus(c),
                render: (c) => <Badge status={chargeStatus(c)} />,
              },
              {
                key: 'action',
                label: '',
                render: (c) => (
                  <div className="inline" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-button"
                      aria-label={`Ver lançamento ${c.number}`}
                      onClick={() => setChargeId(c.id)}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                    {!portal && (
                      <button
                        className="icon-button"
                        aria-label={`Excluir lançamento ${c.number}`}
                        title="Excluir lançamento"
                        onClick={() => setDeleteFinanceItem({ kind: 'charge', item: c })}
                      >
                        <Trash2 size={15} className="text-rose-600" />
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <DataTable
            rows={invoiceRows}
            onRowClick={(i) => setInvoiceId(i.id)}
            pageSize={8}
            emptyTitle="Nenhuma nota encontrada"
            columns={[
              {
                key: 'number',
                label: 'Nota fiscal',
                sortValue: (i) => i.number,
                render: (i) => (
                  <span className="inline">
                    <span className="ops-file-icon">
                      <FileText size={17} />
                    </span>
                    <strong>{i.number}</strong>
                  </span>
                ),
              },
              ...(!portal
                ? [
                    {
                      key: 'client',
                      label: 'Cliente',
                      sortValue: (i: Invoice) => clientName(i.clientId),
                      render: (i: Invoice) => clientName(i.clientId),
                    },
                  ]
                : []),
              {
                key: 'competence',
                label: 'Competência',
                sortValue: (i) => competenceDate(i.competence),
                render: (i) => competenceLabel(i.competence),
              },
              {
                key: 'amount',
                label: 'Valor',
                sortValue: (i) => i.amount,
                render: (i) => <span className="ops-money">{money(i.amount)}</span>,
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
                render: (i) => (
                  <div className="inline" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-button"
                      aria-label={`Ver nota ${i.number}`}
                      onClick={() => setInvoiceId(i.id)}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                    {!portal && (
                      <button
                        className="icon-button"
                        aria-label={`Excluir nota ${i.number}`}
                        title="Excluir nota fiscal"
                        onClick={() => setDeleteFinanceItem({ kind: 'invoice', item: i })}
                      >
                        <Trash2 size={15} className="text-rose-600" />
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      <ConfirmDialog
        open={!!deleteFinanceItem}
        title={deleteFinanceItem?.kind === 'charge' ? 'Excluir cobrança?' : 'Excluir nota fiscal?'}
        description={`O registro ${deleteFinanceItem?.item.number || ''} será removido definitivamente do banco de dados.`}
        danger
        onConfirm={async () => {
          if (!deleteFinanceItem) return;
          try {
            if (deleteFinanceItem.kind === 'charge') {
              await remove('charges', deleteFinanceItem.item.id);
              notify('Cobrança excluída com sucesso.');
              if (chargeId === deleteFinanceItem.item.id) setChargeId(null);
            } else {
              await remove('invoices', deleteFinanceItem.item.id);
              notify('Nota fiscal excluída com sucesso.');
              if (invoiceId === deleteFinanceItem.item.id) setInvoiceId(null);
            }
            setDeleteFinanceItem(null);
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o registro.',
              'error',
            );
          }
        }}
        onClose={() => setDeleteFinanceItem(null)}
      />
    </div>
  );
}
