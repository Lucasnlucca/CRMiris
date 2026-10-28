import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Barcode,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Copy,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Sparkles,
  Trash2,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useTenant } from '../../../context/TenantContext';
import { getAuthoritativeAuthHeaders } from '../../../lib/appwrite';
import {
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
import { date, money, newId, today } from '../../utils/format';
import type { Charge, ChargeStatus, Invoice } from '../../types';
import {
  chargeDay,
  effectiveChargeStatus as chargeStatus,
  isPaidInMonth,
} from '../../utils/finance';
import './operations.css';

const getMonthBounds = (yearOffset = 0, monthOffset = 0) => {
  const now = new Date();
  const d = new Date(now.getFullYear() + yearOffset, now.getMonth() + monthOffset, 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
  const rawLabel = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
    label,
  };
};

const monthBounds = () => getMonthBounds(0, 0);

const getDaysDifference = (targetDateStr: string, refDateStr: string = today()): number => {
  if (!targetDateStr) return 0;
  const target = new Date(targetDateStr.slice(0, 10) + 'T12:00:00Z').getTime();
  const ref = new Date(refDateStr.slice(0, 10) + 'T12:00:00Z').getTime();
  return Math.round((target - ref) / (1000 * 60 * 60 * 24));
};

const matchChargeStatus = (c: Charge, filter: string): boolean => {
  if (!filter) return true;
  const eff = chargeStatus(c);
  if (filter === 'aberto' || filter === 'Em Aberto') {
    return c.status !== 'Pago' && c.status !== 'Cancelado';
  }
  if (filter === 'a_vencer' || filter === 'A Vencer') {
    return c.status !== 'Pago' && c.status !== 'Cancelado' && c.dueDate >= today();
  }
  if (filter === 'Vencido' || filter === 'Vencidas' || filter === 'vencido') {
    return eff === 'Vencido';
  }
  if (filter === 'Pago' || filter === 'Pagas' || filter === 'pago') {
    return c.status === 'Pago';
  }
  if (filter === 'Pendente' || filter === 'Pendentes' || filter === 'pendente') {
    return c.status === 'Pendente';
  }
  if (filter === 'Cancelado' || filter === 'Canceladas') {
    return c.status === 'Cancelado';
  }
  return eff === filter || c.status === filter;
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
  const { data, save, notify, refresh } = useApp();
  const { tenant } = useTenant();
  const [mode, setMode] = useState<'asaas' | 'manual'>(charge ? 'manual' : 'asaas');
  const [form, setForm] = useState<Charge>(
    charge || {
      id: newId('chg'),
      number: `COB-${today().slice(0, 4)}-${String(data.charges.length + 1).padStart(4, '0')}`,
      clientId: clientId || data.clients[0]?.id || '',
      description: '',
      amount: 0,
      dueDate: today(),
      method: 'Boleto',
      status: 'Pendente',
      reference: `${today().slice(5, 7)}/${today().slice(0, 4)}`,
    },
  );
  const [billingType, setBillingType] = useState<'BOLETO' | 'PIX' | 'UNDEFINED'>('BOLETO');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = <K extends keyof Charge>(key: K, value: Charge[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId || !form.description.trim() || !(form.amount > 0) || !form.dueDate) {
      setError('Informe o cliente, a descrição, a data de vencimento e um valor maior que zero.');
      return;
    }
    setSaving(true);
    setError('');

    try {
      if (mode === 'asaas' && !charge) {
        // Emissão oficial via Asaas
        const authHeaders = await getAuthoritativeAuthHeaders().catch(() => ({}));
        const targetTenantId = tenant?.id || 'tenant_default';
        const res = await fetch('/api/asaas/payments/create', {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
            'x-tenant-id': targetTenantId,
          },
          body: JSON.stringify({
            clientId: form.clientId,
            tenantId: targetTenantId,
            value: Number(form.amount),
            dueDate: form.dueDate,
            description: form.description.trim(),
            billingType,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Falha ao emitir cobrança no Asaas.');
        }
        notify('Boleto / Cobrança emitida no Asaas com sucesso!');
        await refresh();
        onClose();
        return;
      }

      // Lançamento manual ou edição
      await save('charges', { ...form, description: form.description.trim() });
      notify(charge ? 'Lançamento atualizado.' : 'Lançamento financeiro registrado.');
      await refresh();
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
      title={charge ? 'Editar lançamento' : 'Novo lançamento / Emissão de Boleto'}
      description="Emita boletos bancários via Asaas ou registre lançamentos financeiros diretamente."
      backLabel="Voltar ao financeiro"
      onBack={onClose}
    >
      <form onSubmit={submit}>
        {!charge && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              type="button"
              className={`btn ${mode === 'asaas' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setMode('asaas');
                change('method', 'Boleto');
              }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Sparkles size={16} /> Emitir no Asaas (Boleto / Pix Oficial)
            </button>
            <button
              type="button"
              className={`btn ${mode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('manual')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <FileText size={16} /> Lançamento Manual (Apenas CRM)
            </button>
          </div>
        )}

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
                  {c.tradeName || c.name} {c.document ? `(${c.document})` : ''}
                </option>
              ))}
            </select>
          </Field>

          {mode === 'asaas' && !charge ? (
            <Field label="Forma de Cobrança no Asaas *">
              <select
                className="select"
                value={billingType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setBillingType(val);
                  change('method', val === 'PIX' ? 'Pix' : 'Boleto');
                }}
              >
                <option value="BOLETO">Boleto Bancário (Com registro bancário e PDF)</option>
                <option value="PIX">Pix (QR Code Dinâmico e Copia e Cola)</option>
                <option value="UNDEFINED">Boleto & Pix (Cliente escolhe como pagar)</option>
              </select>
            </Field>
          ) : (
            <Field label="Número do lançamento *">
              <input
                className="input"
                required
                value={form.number}
                onChange={(e) => change('number', e.target.value)}
              />
            </Field>
          )}

          <div className="ops-form-full">
            <Field label="Descrição da cobrança *">
              <input
                className="input"
                required
                value={form.description}
                onChange={(e) => change('description', e.target.value)}
                placeholder="Ex.: Mensalidade Tronco SIP e Ramais Cloud - Outubro/2026"
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
              placeholder="0,00"
            />
          </Field>

          <Field label="Data de Vencimento *">
            <input
              className="input"
              required
              type="date"
              value={form.dueDate}
              onChange={(e) => change('dueDate', e.target.value)}
            />
          </Field>

          {mode === 'manual' && (
            <>
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
              <Field label="Referência / Mês">
                <input
                  className="input"
                  value={form.reference}
                  onChange={(e) => change('reference', e.target.value)}
                  placeholder="Ex.: 10/2026"
                />
              </Field>
            </>
          )}
        </div>

        <p className="ops-finance-notice">
          {mode === 'asaas' && !charge ? (
            <>
              <Sparkles size={14} />
              Esta cobrança será emitida diretamente no Asaas com geração de código de barras, linha digitável, QR Code Pix e link de pagamento oficial, ficando disponível instantaneamente no sistema e no portal do cliente.
            </>
          ) : (
            <>
              <CreditCard size={14} />
              Este lançamento será registrado na base financeira da empresa no Appwrite.
            </>
          )}
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
            {charge
              ? 'Salvar alterações'
              : mode === 'asaas'
              ? 'Emitir Cobrança / Boleto no Asaas'
              : 'Registrar lançamento manual'}
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
      window.location.reload();
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
  const { data, session, patch, remove, notify, refresh } = useApp();
  const { user: authUser } = useAuth();
  const { tenant } = useTenant();
  const location = useLocation();
  const [params] = useSearchParams();
  const isPortalRoute = location.pathname.startsWith('/portal');
  const portal = session?.role === 'client' || isPortalRoute;
  const bounds = monthBounds();
  const prevBounds = useMemo(() => getMonthBounds(0, -1), []);
  const nextBounds = useMemo(() => getMonthBounds(0, 1), []);
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
    params.get('status') === 'Pago' ? 'paid' : 'due',
  );
  // Sempre mostra as faturas do mês atual por padrão, podendo filtrar outras datas ou todo o período
  const [from, setFrom] = useState(
    params.get('period') === 'all' ? '' : params.get('from') || bounds.from,
  );
  const [to, setTo] = useState(
    params.get('period') === 'all' ? '' : params.get('to') || bounds.to,
  );
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

  // Modal e estado de pagamento do portal
  const [paymentModalCharge, setPaymentModalCharge] = useState<any | null>(null);
  const [payingBusy, setPayingBusy] = useState(false);

  // Resolução autoritativa do cliente do portal
  const authPortalClientId =
    typeof window !== 'undefined' ? localStorage.getItem('portal_client_id') : null;
  const authPortalClientEmail =
    typeof window !== 'undefined'
      ? (localStorage.getItem('portal_client_email') || '').toLowerCase().trim()
      : '';
  const authPortalClientName =
    typeof window !== 'undefined' ? localStorage.getItem('portal_client_name') : null;

  const activeClient = useMemo(() => {
    if (!portal) {
      return client ? data.clients.find((c) => c.id === client) : undefined;
    }
    const matched =
      (authPortalClientId ? data.clients.find((c) => c.id === authPortalClientId) : undefined) ||
      (session?.clientId ? data.clients.find((c) => c.id === session.clientId) : undefined) ||
      (authPortalClientEmail
        ? data.clients.find(
            (c) =>
              c.email.toLowerCase() === authPortalClientEmail ||
              c.portalAccess?.email?.toLowerCase() === authPortalClientEmail ||
              c.contacts.some((ct) => ct.email.toLowerCase() === authPortalClientEmail),
          )
        : undefined);

    if (matched) return matched;

    if (authPortalClientId || session?.role === 'client') {
      return {
        id: authPortalClientId || session?.clientId || 'portal-client',
        name: authPortalClientName || authUser?.name || 'Cliente',
        tradeName: authPortalClientName || authUser?.name || 'Cliente',
        email: authPortalClientEmail || '',
        status: 'Ativo',
        contacts: [],
      } as any;
    }

    return undefined;
  }, [portal, client, session?.clientId, session?.role, authUser?.name, authPortalClientId, authPortalClientEmail, authPortalClientName, data.clients]);

  // Carrega faturas em tempo real e integração Asaas do endpoint /api/portal
  const [liveData, setLiveData] = useState<any | null>(null);
  const [portalLoading, setPortalLoading] = useState(portal);

  // Integração direta com Asaas para a gestão (admin e financeiro)
  const [asaasData, setAsaasData] = useState<any | null>(null);
  const [asaasSyncing, setAsaasSyncing] = useState(false);

  const fetchAsaasPayments = async () => {
    try {
      const tenantId = tenant?.id || 'tenant_default';
      const authHeaders = await getAuthoritativeAuthHeaders().catch(() => ({}));
      const res = await fetch(`/api/asaas/payments?tenantId=${encodeURIComponent(tenantId)}`, {
        headers: {
          ...authHeaders,
          'x-tenant-id': tenantId,
        },
      });
      if (res.ok) {
        const json = await res.json();
        setAsaasData(json);
      }
    } catch (err) {
      console.warn('[FinancePage] Erro ao buscar pagamentos Asaas:', err);
    }
  };

  const handleSyncAsaas = async (showNotification = true) => {
    setAsaasSyncing(true);
    try {
      const tenantId = tenant?.id || 'tenant_default';
      const authHeaders = await getAuthoritativeAuthHeaders().catch(() => ({}));
      const res = await fetch('/api/asaas/sync', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
        },
        body: JSON.stringify({ tenantId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (showNotification) {
          notify(json.message || 'Cobranças do Asaas sincronizadas com sucesso!');
        }
        await refresh();
        await fetchAsaasPayments();
      } else if (showNotification) {
        notify(json.message || 'Falha ao sincronizar com Asaas.', 'error');
      }
    } catch (err: any) {
      if (showNotification) {
        notify('Erro ao sincronizar com Asaas: ' + err.message, 'error');
      }
    } finally {
      setAsaasSyncing(false);
    }
  };

  useEffect(() => {
    fetchAsaasPayments();
  }, [tenant?.id]);

  useEffect(() => {
    if (!portal) {
      setPortalLoading(false);
      return;
    }
    let alive = true;
    setPortalLoading(true);
    const fetchPortalFinance = async () => {
      try {
        const queryParams = new URLSearchParams();
        if (authPortalClientEmail) queryParams.set('email', authPortalClientEmail);
        if (authPortalClientId) queryParams.set('clientId', authPortalClientId);
        else if (activeClient?.id) queryParams.set('clientId', activeClient.id);
        if (tenant?.id) queryParams.set('tenantId', tenant.id);

        const portalToken =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem('crm_portal_token') || ''
            : '';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-portal-token': portalToken,
        };
        if (portalToken) {
          headers['Authorization'] = `Bearer ${portalToken}`;
        }

        const res = await fetch(`/api/portal?${queryParams.toString()}`, {
          headers,
          credentials: 'include',
        });
        if (res.status === 401 || res.status === 403) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('crm_portal_token');
            localStorage.removeItem('portal_client_id');
            localStorage.removeItem('portal_client_email');
            localStorage.removeItem('portal_client_name');
            if (!window.location.pathname.startsWith('/portal-login')) {
              window.location.href = '/portal-login';
            }
          }
          return;
        }
        if (res.ok) {
          const json = await res.json();
          if (alive && json.success) {
            setLiveData(json);
          }
        }
      } catch (err) {
        console.warn('[FinancePage] Leitura do portal via API:', err);
      } finally {
        if (alive) setPortalLoading(false);
      }
    };
    fetchPortalFinance();
    return () => {
      alive = false;
    };
  }, [portal, authPortalClientEmail, authPortalClientId, activeClient?.id, tenant?.id]);

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
    if (params.get('period') === 'all') {
      setFrom('');
      setTo('');
    } else if (params.get('from') || params.get('to')) {
      setFrom(params.get('from') || '');
      setTo(params.get('to') || '');
    } else if (params.get('period') === 'month') {
      setFrom(next.from);
      setTo(next.to);
    }
    if (params.get('status') === 'Pago') {
      setDateBasis('paid');
    }
  }, [params]);

  // F33: Limpa estados de diálogos/modais pendentes ao alternar entre lista e detalhes ou abas
  useEffect(() => {
    setUpdate(null);
    setDeleteFinanceItem(null);
    setPaymentModalCharge(null);
  }, [chargeId, invoiceId, tab]);

  const clientName = (id: string) => {
    const c = data.clients.find((c) => c.id === id);
    return c?.tradeName || c?.name || activeClient?.tradeName || activeClient?.name || 'Cliente';
  };

  // F12: Retorna apenas payload PIX emitido pelo provedor (Asaas), sem fabricar strings
  const getPixPayload = (ch: any): string =>
    (
      ch?.pixCopyPaste ||
      ch?.pixPayload ||
      ch?.asaasBilling?.pix?.payload ||
      ''
    ).trim();

  // F12: Retorna apenas linha digitável emitida pelo provedor (Asaas), sem fabricar códigos
  const getBoletoBarcode = (ch: any): string =>
    (
      ch?.barcode ||
      ch?.identificationField ||
      ch?.asaasBilling?.bankSlip?.identificationField ||
      ''
    ).trim();

  const handleCopyPix = (ch: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const pix = getPixPayload(ch);
    if (!pix) {
      notify('Código de pagamento indisponível no provedor. Verifique a integração Asaas.', 'error');
      return;
    }
    navigator.clipboard.writeText(pix);
    notify('Código PIX Copia e Cola copiado com sucesso!');
  };

  const handleCopyBarcode = (ch: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const barcode = getBoletoBarcode(ch);
    if (!barcode) {
      notify('Código de pagamento indisponível no provedor. Verifique a integração Asaas.', 'error');
      return;
    }
    navigator.clipboard.writeText(barcode);
    notify('Linha digitável do boleto copiada com sucesso!');
  };

  const handleConfirmPayment = async (ch: any) => {
    if (portal) {
      notify('Apenas operadores financeiros autorizados podem realizar baixa manual.', 'error');
      return;
    }
    setPayingBusy(true);
    try {
      const paidDate = today();
      await patch('charges', ch.id, {
        status: 'Pago',
        paidAt: paidDate,
      });

      setLiveData((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          charges: (prev.charges || []).map((item: any) =>
            item.id === ch.id ? { ...item, status: 'Pago', paidAt: paidDate } : item
          ),
        };
      });

      notify(`Pagamento da fatura ${ch.number} registrado com sucesso!`);
      setPaymentModalCharge(null);
    } catch (err: any) {
      notify(err?.message || 'Erro ao registrar pagamento no servidor.', 'error');
    } finally {
      setPayingBusy(false);
    }
  };

  // Resolução e mesclagem unificada de cobranças com dados do Asaas e Appwrite
  const scopedCharges: (Charge & {
    invoiceUrl?: string;
    bankSlipUrl?: string;
    pixPayload?: string;
    barcode?: string;
    asaasPaymentId?: string;
  })[] = useMemo(() => {
    // Lista base de cobranças
    let baseList: any[] = [];
    if (!portal) {
      baseList = !client ? [...data.charges] : data.charges.filter((c) => c.clientId === client);
    } else {
      const targetClientId = activeClient?.id;
      if (liveData?.charges !== undefined) {
        baseList = [...liveData.charges];
      } else if (targetClientId && data.clients.some((c) => c.id === targetClientId)) {
        baseList = data.charges.filter((c) => c.clientId === targetClientId);
      }
    }

    const asaasPaymentsList: any[] = portal
      ? liveData?.asaas?.payments || []
      : asaasData?.payments || [];

    // Enriquece com dados do Asaas (URLs de boletos, pix e código de barras)
    const enriched = baseList.map((ch: any) => {
      const asaasPay = asaasPaymentsList.find(
        (p: any) =>
          p.id === ch.id ||
          p.id === ch.reference ||
          p.id === ch.asaasPaymentId ||
          p.invoiceNumber === ch.number ||
          (p.id && ch.number && p.id.includes(ch.number.replace(/\D/g, '')))
      );
      if (!asaasPay) return ch;
      return {
        ...ch,
        invoiceUrl: ch.invoiceUrl || asaasPay.invoiceUrl,
        bankSlipUrl: ch.bankSlipUrl || asaasPay.bankSlipUrl,
        pixPayload: ch.pixPayload || asaasPay.pixPayload,
        barcode: ch.barcode || asaasPay.barcode,
        asaasPaymentId: asaasPay.id,
      };
    });

    // Se houver cobranças no Asaas que ainda não foram salvas no Appwrite local, inclui na lista
    if (asaasPaymentsList.length > 0) {
      asaasPaymentsList.forEach((p: any) => {
        const exists = enriched.some(
          (c: any) =>
            c.id === p.id ||
            c.asaasPaymentId === p.id ||
            c.number === p.id ||
            c.number === p.invoiceNumber ||
            (c.reference && c.reference.includes(p.id))
        );
        if (!exists) {
          const targetClientId = portal ? activeClient?.id : p.matchedClientId;
          if (client && targetClientId && targetClientId !== client) {
            return;
          }
          const isOverdue =
            p.status === 'OVERDUE' ||
            (p.dueDate && new Date(`${p.dueDate}T23:59:59Z`).getTime() < Date.now());
          enriched.push({
            id: p.id,
            number: p.invoiceNumber || p.id,
            clientId: targetClientId || data.clients[0]?.id || '',
            description: p.description || 'Cobrança Asaas',
            amount: Number(p.value) || 0,
            dueDate: p.dueDate || '',
            status:
              p.status === 'RECEIVED' || p.status === 'CONFIRMED'
                ? 'Pago'
                : isOverdue
                ? 'Vencido'
                : p.status === 'REFUNDED' || p.status === 'CANCELLED'
                ? 'Cancelado'
                : 'Pendente',
            method:
              p.billingType === 'BOLETO'
                ? 'Boleto'
                : p.billingType === 'PIX'
                ? 'Pix'
                : 'Cartão',
            paidAt: p.paymentDate || (p.status === 'RECEIVED' ? today() : null),
            reference: p.id,
            asaasPaymentId: p.id,
            invoiceUrl: p.invoiceUrl,
            bankSlipUrl: p.bankSlipUrl,
            pixPayload: p.pixPayload,
            barcode: p.barcode,
          });
        }
      });
    }

    return enriched;
  }, [portal, client, data.charges, data.clients, activeClient?.id, liveData, asaasData]);

  const scopedInvoices: Invoice[] = useMemo(() => {
    if (!portal) {
      return !client ? data.invoices : data.invoices.filter((i) => i.clientId === client);
    }
    if (liveData?.invoices !== undefined) {
      return liveData.invoices;
    }
    const targetClientId = activeClient?.id;
    if (targetClientId && data.clients.some((c) => c.id === targetClientId)) {
      return data.invoices.filter((i) => i.clientId === targetClientId);
    }
    return [];
  }, [portal, client, data.invoices, data.clients, activeClient?.id, liveData]);

  const selectedClientObj = useMemo(
    () => (client ? data.clients.find((c) => c.id === client) : undefined),
    [data.clients, client],
  );

  const periodCharges = scopedCharges.filter((c) => {
    const selectedDate = dateBasis === 'paid' ? (c.paidAt ? chargeDay(c.paidAt) : c.dueDate) : c.dueDate;
    return !!selectedDate && (!from || selectedDate >= from) && (!to || selectedDate <= to);
  });

  const activeChargeFilterList = from || to ? periodCharges : scopedCharges;
  const rows = activeChargeFilterList.filter(
    (c) =>
      matchChargeStatus(c, status) &&
      `${c.number} ${c.description} ${clientName(c.clientId)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  const statusCounts = useMemo(() => {
    const list = activeChargeFilterList;
    return {
      all: list.length,
      aberto: list.filter((c) => c.status !== 'Pago' && c.status !== 'Cancelado').length,
      a_vencer: list.filter(
        (c) => c.status !== 'Pago' && c.status !== 'Cancelado' && c.dueDate >= today(),
      ).length,
      vencido: list.filter((c) => chargeStatus(c) === 'Vencido').length,
      pago: list.filter((c) => c.status === 'Pago').length,
      pendente: list.filter((c) => c.status === 'Pendente').length,
    };
  }, [activeChargeFilterList]);

  // Q02: Retorno antecipado posicionado estritamente após todos os hooks React
  if (session?.role === 'support') {
    return (
      <EmptyState
        title="Área financeira restrita"
        description="Este perfil não possui acesso aos dados financeiros."
      />
    );
  }

  const invoiceRows = scopedInvoices.filter(
    (i) =>
      (!from || competenceDate(i.competence).slice(0, 7) >= from.slice(0, 7)) &&
      (!to || competenceDate(i.competence).slice(0, 7) <= to.slice(0, 7)) &&
      (!invoiceStatus || i.status === invoiceStatus) &&
      `${i.number} ${clientName(i.clientId)}`.toLowerCase().includes(query.toLowerCase()),
  );

  // Cards de resumo: no portal mostram sempre os totais autoritativos do cliente; na gestão respeitam o período/filtros ativos
  const summaryCharges =
    portal && !(from || to || status)
      ? scopedCharges
      : from || to
        ? periodCharges
        : scopedCharges;
  const total = (test: (c: Charge) => boolean) =>
    summaryCharges.filter(test).reduce((n, c) => n + (Number(c.amount) || 0), 0);
  const paid = total((c) => c.status === 'Pago');
  const pending = total((c) => c.status !== 'Pago' && c.status !== 'Cancelado');
  const overdue = total((c) => chargeStatus(c) === 'Vencido');
  const launched = total((c) => c.status !== 'Cancelado');

  const receivedThisMonth = scopedCharges
    .filter((c) => isPaidInMonth(c))
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
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

  // F33 & F12: Renderização compartilhada de todos os diálogos e modais para que funcionem tanto na lista quanto nos detalhes
  const renderFinanceDialogs = () => (
    <>
      {paymentModalCharge && (
        <Modal
          open={!!paymentModalCharge}
          title={`Fatura #${paymentModalCharge.number}`}
          onClose={() => setPaymentModalCharge(null)}
          wide
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.15)',
              }}
            >
              <div>
                <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {paymentModalCharge.description || 'Mensalidade de Serviços'}
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: '20px', color: '#1e293b' }}>
                  {money(paymentModalCharge.amount)}
                </h3>
              </div>
              <Badge status={chargeStatus(paymentModalCharge)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              {/* Box Pix */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#0f766e' }}>
                  <QrCode size={18} /> Pague com Pix Instantâneo
                </div>
                {getPixPayload(paymentModalCharge) ? (
                  <>
                    <div
                      style={{
                        background: '#ffffff',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(getPixPayload(paymentModalCharge))}`}
                        alt="QR Code Pix"
                        width={160}
                        height={160}
                        style={{ display: 'block' }}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCopyPix(paymentModalCharge)}
                      style={{ width: '100%' }}
                    >
                      <Copy size={13} /> Copiar Código Pix Copia e Cola
                    </Button>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '12px 0' }}>
                      Código de pagamento indisponível no provedor. Verifique a integração Asaas.
                    </p>
                    <Button size="sm" variant="secondary" disabled style={{ width: '100%' }}>
                      <Copy size={13} /> Copiar Código Pix Copia e Cola
                    </Button>
                  </>
                )}
              </div>

              {/* Box Boleto & Informações */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#1e40af' }}>
                  <Barcode size={18} /> Boleto Bancário
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Vencimento: <strong style={{ color: '#0f172a' }}>{date(paymentModalCharge.dueDate)}</strong>
                </div>
                {getBoletoBarcode(paymentModalCharge) ? (
                  <>
                    <div
                      style={{
                        background: '#ffffff',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                        color: '#334155',
                      }}
                    >
                      {getBoletoBarcode(paymentModalCharge)}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCopyBarcode(paymentModalCharge)}
                    >
                      <Copy size={13} /> Copiar Linha Digitável
                    </Button>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        background: '#ffffff',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                        color: '#64748b',
                      }}
                    >
                      Código de pagamento indisponível no provedor. Verifique a integração Asaas.
                    </div>
                    <Button size="sm" variant="secondary" disabled>
                      <Copy size={13} /> Copiar Linha Digitável
                    </Button>
                  </>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
                  {paymentModalCharge.bankSlipUrl && (
                    <a
                      href={paymentModalCharge.bankSlipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-secondary"
                      style={{ flex: 1, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}
                    >
                      <Download size={13} /> Baixar PDF
                    </a>
                  )}
                  {paymentModalCharge.invoiceUrl && (
                    <a
                      href={paymentModalCharge.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-secondary"
                      style={{ flex: 1, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}
                    >
                      <ExternalLink size={13} /> Fatura Asaas
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
              <Button variant="secondary" onClick={() => setPaymentModalCharge(null)}>
                Fechar
              </Button>
              {!portal && paymentModalCharge.status !== 'Pago' && (
                <Button
                  loading={payingBusy}
                  onClick={() => handleConfirmPayment(paymentModalCharge)}
                >
                  <CheckCircle2 size={15} /> Confirmar Pagamento (Baixa Imediata)
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
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
    const hasPix = Boolean(getPixPayload(charge));
    const hasBarcode = Boolean(getBoletoBarcode(charge));
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
          <div className="form-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
            {portal && chargeStatus(charge) !== 'Pago' && chargeStatus(charge) !== 'Cancelado' && (
              <Button onClick={() => setPaymentModalCharge(charge)}>
                <DollarSign size={15} /> Pagar Fatura / Ver Boleto
              </Button>
            )}
            {(charge as any).bankSlipUrl && (
              <a
                href={(charge as any).bankSlipUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={15} /> Baixar PDF Boleto
              </a>
            )}
            {(charge as any).invoiceUrl && (
              <a
                href={(charge as any).invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ExternalLink size={15} /> Fatura Asaas
              </a>
            )}
            <Button
              variant="secondary"
              disabled={!hasPix}
              onClick={(e) => handleCopyPix(charge, e)}
              title={
                hasPix
                  ? 'Copiar Pix Copia e Cola'
                  : 'Código de pagamento indisponível no provedor. Verifique a integração Asaas.'
              }
            >
              <QrCode size={15} /> Copiar Pix Copia e Cola
            </Button>
            <Button
              variant="secondary"
              disabled={!hasBarcode}
              onClick={(e) => handleCopyBarcode(charge, e)}
              title={
                hasBarcode
                  ? 'Copiar Linha Digitável'
                  : 'Código de pagamento indisponível no provedor. Verifique a integração Asaas.'
              }
            >
              <Barcode size={15} /> Copiar Linha Digitável
            </Button>
            {!portal && (
              <>
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
              </>
            )}
          </div>
        </FormPage>
        {renderFinanceDialogs()}
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
        {renderFinanceDialogs()}
      </>
    );
  }
  if (portal && portalLoading) {
    return (
      <div className="page-stack animate-fadeIn">
        <PageHeader
          eyebrow="ÁREA DO CLIENTE · FINANCEIRO"
          title="Minhas Faturas"
          description={
            activeClient?.tradeName || activeClient?.name
              ? `${activeClient.tradeName || activeClient.name} · Sincronizando suas faturas e lançamentos...`
              : 'Sincronizando suas faturas e lançamentos...'
          }
        />

        {/* StatCards Skeleton */}
        <div className="stat-grid animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200/70 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-5 shadow-xs flex flex-col justify-between h-[110px]"
            >
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-28 rounded bg-slate-200 dark:bg-white/[0.08]" />
                <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-white/[0.05]" />
              </div>
              <div className="h-7 w-24 rounded bg-slate-200 dark:bg-white/[0.08]" />
              <div className="h-3 w-36 rounded bg-slate-100 dark:bg-white/[0.04]" />
            </div>
          ))}
        </div>

        {/* Table Skeleton */}
        <div className="rounded-2xl border border-slate-200/70 dark:border-white/[0.08] bg-white dark:bg-[#121824] p-6 shadow-xs space-y-4 animate-pulse">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.05]">
            <div className="h-5 w-44 rounded bg-slate-200 dark:bg-white/[0.08]" />
            <div className="h-8 w-32 rounded-xl bg-slate-100 dark:bg-white/[0.05]" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-3.5 flex items-center justify-between"
              >
                <div className="space-y-2 w-1/3">
                  <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-white/[0.08]" />
                  <div className="h-3 w-1/2 rounded bg-slate-100 dark:bg-white/[0.04]" />
                </div>
                <div className="h-4 w-24 rounded bg-slate-200 dark:bg-white/[0.08]" />
                <div className="h-6 w-20 rounded-full bg-slate-100 dark:bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={portal ? 'ÁREA DO CLIENTE · FINANCEIRO' : 'GESTÃO FINANCEIRA'}
        title={portal ? 'Minhas Faturas' : 'Financeiro'}
        description={
          portal
            ? `${activeClient?.tradeName || activeClient?.name || 'Sua Empresa'} · Consulte seus boletos, notas fiscais e realize pagamentos em tempo real.`
            : 'Uma visão clara dos recebimentos, vencimentos e documentos fiscais.'
        }
        actions={
          <>
            {!portal && (
              <Button
                variant="secondary"
                onClick={() => handleSyncAsaas(true)}
                loading={asaasSyncing}
                title="Sincronizar faturas e boletos com a conta Asaas"
              >
                <RefreshCw size={15} className={asaasSyncing ? 'animate-spin' : ''} />
                Sincronizar Asaas
              </Button>
            )}
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
          detail={
            from || to
              ? `${summaryCharges.length} faturas no período`
              : `${scopedCharges.length} faturas registradas`
          }
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
          detail={`${summaryCharges.filter((c) => c.status === 'Pago').length} faturas pagas`}
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
          detail={`${summaryCharges.filter((c) => c.status !== 'Pago' && c.status !== 'Cancelado').length} faturas a receber`}
          icon={ArrowUpRight}
          tone="navy"
          onClick={() => {
            setStatus('aberto');
            setDateBasis('due');
            setTab('charges');
          }}
        />
        <StatCard
          label="Vencido"
          value={money(overdue)}
          detail={`${summaryCharges.filter((c) => chargeStatus(c) === 'Vencido').length} faturas em atraso`}
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
              <small>Por data de pagamento ({bounds.label})</small>
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
        {/* Banner informativo quando filtrando cliente em específico */}
        {selectedClientObj && !portal && (
          <div className="ops-client-active-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="ops-client-avatar">
                {(selectedClientObj.tradeName || selectedClientObj.name).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="ops-client-name">
                  Faturas de: <strong>{selectedClientObj.tradeName || selectedClientObj.name}</strong>
                  {selectedClientObj.status && (
                    <span className="ops-client-status-tag">{selectedClientObj.status}</span>
                  )}
                </div>
                <div className="ops-client-details">
                  {selectedClientObj.document && <span>CNPJ/CPF: {selectedClientObj.document}</span>}
                  {selectedClientObj.email && <span>Email: {selectedClientObj.email}</span>}
                  <span>{rows.length} lançamentos encontrados</span>
                </div>
              </div>
            </div>
            <div className="ops-client-actions">
              {from || to ? (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setFrom('');
                    setTo('');
                  }}
                >
                  Ver todo o histórico deste cliente
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setFrom(bounds.from);
                    setTo(bounds.to);
                  }}
                >
                  Ver apenas faturas deste mês ({bounds.label})
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setClient('')}
                title="Remover filtro de cliente"
              >
                <X size={14} /> Limpar cliente
              </button>
            </div>
          </div>
        )}

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
                <option value="">Todos os clientes ({data.clients.length})</option>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.name} {c.document ? `(${c.document})` : ''}
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
                <option value="aberto">Em Aberto (Pendentes + Vencidas)</option>
                <option value="a_vencer">A Vencer (No prazo)</option>
                <option value="Vencido">Vencidas (Em atraso)</option>
                <option value="Pago">Pagas (Quitadas)</option>
                <option value="Pendente">Pendentes</option>
                <option value="Cancelado">Canceladas</option>
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

        {/* Quick Status Filter Pills */}
        {tab === 'charges' && (
          <div className="ops-status-pills">
            <button
              type="button"
              className={`ops-status-pill ${status === '' ? 'active' : ''}`}
              onClick={() => setStatus('')}
            >
              <span className="pill-dot all" />
              Todas as Faturas
              <span className="pill-count">{statusCounts.all}</span>
            </button>
            <button
              type="button"
              className={`ops-status-pill ${status === 'aberto' ? 'active' : ''}`}
              onClick={() => setStatus(status === 'aberto' ? '' : 'aberto')}
              title="Todas as faturas não quitadas (em aberto)"
            >
              <span className="pill-dot aberto" />
              Em Aberto
              <span className="pill-count">{statusCounts.aberto}</span>
            </button>
            <button
              type="button"
              className={`ops-status-pill ${status === 'a_vencer' ? 'active' : ''}`}
              onClick={() => setStatus(status === 'a_vencer' ? '' : 'a_vencer')}
              title="Faturas não vencidas (vencimento hoje ou futuro)"
            >
              <span className="pill-dot a_vencer" />
              A Vencer
              <span className="pill-count">{statusCounts.a_vencer}</span>
            </button>
            <button
              type="button"
              className={`ops-status-pill ${status === 'Vencido' ? 'active' : ''}`}
              onClick={() => setStatus(status === 'Vencido' ? '' : 'Vencido')}
              title="Faturas em atraso não pagas"
            >
              <span className="pill-dot vencido" />
              Vencidas
              <span className="pill-count">{statusCounts.vencido}</span>
            </button>
            <button
              type="button"
              className={`ops-status-pill ${status === 'Pago' ? 'active' : ''}`}
              onClick={() => setStatus(status === 'Pago' ? '' : 'Pago')}
              title="Faturas quitadas"
            >
              <span className="pill-dot pago" />
              Pagas
              <span className="pill-count">{statusCounts.pago}</span>
            </button>
            <button
              type="button"
              className={`ops-status-pill ${status === 'Pendente' ? 'active' : ''}`}
              onClick={() => setStatus(status === 'Pendente' ? '' : 'Pendente')}
              title="Faturas pendentes"
            >
              <span className="pill-dot pendente" />
              Pendentes
              <span className="pill-count">{statusCounts.pendente}</span>
            </button>
          </div>
        )}

        {/* Barra de Período com Atalhos para Mês Atual, Anterior e Próximo */}
        <div className="ops-date-toolbar">
          <div className="ops-period-shortcuts">
            <button
              type="button"
              className={`ops-period-btn ${from === bounds.from && to === bounds.to ? 'active' : ''}`}
              onClick={() => {
                setFrom(bounds.from);
                setTo(bounds.to);
              }}
              title={`Exibir faturas deste mês (${bounds.label})`}
            >
              <Calendar size={13} />
              Este Mês ({bounds.label})
            </button>
            <button
              type="button"
              className={`ops-period-btn ${from === prevBounds.from && to === prevBounds.to ? 'active' : ''}`}
              onClick={() => {
                setFrom(prevBounds.from);
                setTo(prevBounds.to);
              }}
              title={`Exibir faturas do mês anterior (${prevBounds.label})`}
            >
              Mês Anterior
            </button>
            <button
              type="button"
              className={`ops-period-btn ${from === nextBounds.from && to === nextBounds.to ? 'active' : ''}`}
              onClick={() => {
                setFrom(nextBounds.from);
                setTo(nextBounds.to);
              }}
              title={`Exibir faturas do próximo mês (${nextBounds.label})`}
            >
              Próximo Mês
            </button>
            <button
              type="button"
              className={`ops-period-btn ${!from && !to ? 'active' : ''}`}
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              title="Visualizar faturas de qualquer data (histórico completo)"
            >
              Todo o Histórico
            </button>
          </div>

          <div className="ops-date-inputs">
            {tab === 'charges' ? (
              <div className="ops-date-group">
                <span className="ops-date-label">Base:</span>
                <select
                  className="select select-sm"
                  value={dateBasis}
                  onChange={(e) => setDateBasis(e.target.value as 'due' | 'paid')}
                  aria-label="Base do período"
                >
                  <option value="due">Vencimento</option>
                  <option value="paid">Data Pagamento</option>
                </select>
              </div>
            ) : null}

            <div className="ops-date-group">
              <span className="ops-date-label">De:</span>
              <input
                className="input input-sm"
                type="date"
                aria-label="Início do período"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>

            <div className="ops-date-group">
              <span className="ops-date-label">Até:</span>
              <input
                className="input input-sm"
                type="date"
                aria-label="Fim do período"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <span className="small muted">
              {tab === 'charges' ? rows.length : invoiceRows.length} registros
            </span>
          </div>
        </div>

        {tab === 'charges' ? (
          <DataTable
            rows={rows}
            onRowClick={(c) => {
              if (portal) {
                setPaymentModalCharge(c);
              } else {
                setChargeId(c.id);
              }
            }}
            pageSize={8}
            emptyTitle="Nenhum lançamento encontrado"
            columns={[
              {
                key: 'number',
                label: 'Lançamento',
                sortValue: (c) => c.number,
                render: (c: any) => {
                  const isAsaas =
                    Boolean(c.asaasPaymentId) ||
                    Boolean(c.bankSlipUrl) ||
                    Boolean(c.invoiceUrl) ||
                    (c.reference && c.reference.startsWith('pay_'));
                  return (
                    <>
                      <div className="cell-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{c.number}</span>
                        {isAsaas && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 600,
                              background: 'rgba(16, 185, 129, 0.1)',
                              color: '#059669',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                            }}
                            title="Cobrança / Boleto Asaas"
                          >
                            <Sparkles size={10} /> Asaas
                          </span>
                        )}
                      </div>
                      <div className="cell-subtitle">{c.description}</div>
                    </>
                  );
                },
              },
              ...(!portal
                ? [
                    {
                      key: 'client',
                      label: 'Cliente',
                      sortValue: (c: Charge) => clientName(c.clientId),
                      render: (c: Charge) => {
                        const cl = data.clients.find((item) => item.id === c.clientId);
                        const cName = cl?.tradeName || cl?.name || clientName(c.clientId);
                        const isFiltered = client === c.clientId;
                        return (
                          <div className="ops-client-cell">
                            <div className="ops-client-title-row">
                              <span className="ops-client-cell-title">{cName}</span>
                              {!isFiltered && (
                                <button
                                  type="button"
                                  className="ops-client-filter-link"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setClient(c.clientId);
                                  }}
                                  title={`Filtrar apenas as faturas de ${cName}`}
                                >
                                  <Filter size={10} />
                                  Filtrar
                                </button>
                              )}
                            </div>
                            {cl?.document && (
                              <span className="ops-client-doc">{cl.document}</span>
                            )}
                          </div>
                        );
                      },
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
                render: (c) => {
                  const daysDiff = getDaysDifference(c.dueDate);
                  const isPaid = c.status === 'Pago';
                  const isOverdue = chargeStatus(c) === 'Vencido';
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: isOverdue ? '#dc2626' : undefined }}>
                        {date(c.dueDate)}
                      </span>
                      {isPaid ? (
                        <span className="ops-delay-tag paid">Quitada</span>
                      ) : isOverdue ? (
                        <span className="ops-delay-tag overdue">
                          Venceu há {Math.abs(daysDiff)} {Math.abs(daysDiff) === 1 ? 'dia' : 'dias'}
                        </span>
                      ) : daysDiff === 0 ? (
                        <span className="ops-delay-tag today">Vence hoje!</span>
                      ) : (
                        <span className="ops-delay-tag upcoming">
                          Em {daysDiff} {daysDiff === 1 ? 'dia' : 'dias'}
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'paidAt',
                label: 'Data de Pagamento',
                sortValue: (c) => c.paidAt || '',
                render: (c) =>
                  c.status === 'Pago' ? (
                    <span className="ops-paid-date">
                      <CheckCircle2 size={13} /> {date(c.paidAt || c.dueDate)}
                    </span>
                  ) : (
                    <span className="ops-unpaid-date">Aguardando pagamento</span>
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
                render: (c) => {
                  const eff = chargeStatus(c);
                  if (c.status === 'Pago') return <Badge status="Pago">Paga</Badge>;
                  if (eff === 'Vencido') return <Badge status="Vencido">Vencida</Badge>;
                  if (c.dueDate >= today()) return <Badge status="A Vencer">A Vencer</Badge>;
                  return <Badge status={c.status}>{c.status}</Badge>;
                },
              },
              {
                key: 'action',
                label: portal ? 'Ações' : '',
                render: (c: any) => (
                  <div className="inline" onClick={(e) => e.stopPropagation()} style={{ gap: '6px' }}>
                    {portal ? (
                      <>
                        {chargeStatus(c) !== 'Cancelado' && (
                          <Button
                            size="sm"
                            variant={c.status === 'Pago' ? 'secondary' : 'primary'}
                            onClick={() => setPaymentModalCharge(c)}
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                          >
                            <DollarSign size={13} /> {c.status === 'Pago' ? 'Ver Fatura' : 'Pagar / Boleto'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!getPixPayload(c)}
                          onClick={(e) => handleCopyPix(c, e)}
                          title={
                            getPixPayload(c)
                              ? 'Copiar Pix Copia e Cola'
                              : 'Código de pagamento indisponível no provedor. Verifique a integração Asaas.'
                          }
                          style={{ padding: '3px 7px' }}
                        >
                          <QrCode size={13} />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!getBoletoBarcode(c)}
                          onClick={(e) => handleCopyBarcode(c, e)}
                          title={
                            getBoletoBarcode(c)
                              ? 'Copiar Linha Digitável do Boleto'
                              : 'Código de pagamento indisponível no provedor. Verifique a integração Asaas.'
                          }
                          style={{ padding: '3px 7px' }}
                        >
                          <Barcode size={13} />
                        </Button>
                        {c.bankSlipUrl && (
                          <a
                            href={c.bankSlipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-secondary"
                            title="Download do Boleto PDF"
                            style={{ padding: '3px 7px', display: 'inline-flex', alignItems: 'center' }}
                          >
                            <Download size={13} />
                          </a>
                        )}
                      </>
                    ) : (
                      <>
                        {c.bankSlipUrl && (
                          <a
                            href={c.bankSlipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-secondary"
                            title="Download do Boleto PDF (Asaas)"
                            style={{ padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Download size={12} /> Boleto
                          </a>
                        )}
                        {c.invoiceUrl && (
                          <a
                            href={c.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-secondary"
                            title="Abrir fatura Asaas no navegador"
                            style={{ padding: '3px 7px', display: 'inline-flex', alignItems: 'center' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!getPixPayload(c)}
                          onClick={(e) => handleCopyPix(c, e)}
                          title={
                            getPixPayload(c)
                              ? 'Copiar Pix Copia e Cola'
                              : 'Código de pagamento indisponível no provedor. Verifique a integração Asaas.'
                          }
                          style={{ padding: '3px 7px' }}
                        >
                          <QrCode size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!getBoletoBarcode(c)}
                          onClick={(e) => handleCopyBarcode(c, e)}
                          title={
                            getBoletoBarcode(c)
                              ? 'Copiar Linha Digitável do Boleto'
                              : 'Código de pagamento indisponível no provedor. Verifique a integração Asaas.'
                          }
                          style={{ padding: '3px 7px' }}
                        >
                          <Barcode size={12} />
                        </Button>
                        {c.status !== 'Pago' && c.status !== 'Cancelado' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setUpdate({ kind: 'charge', item: c, status: 'Pago' })
                            }
                            title="Confirmar recebimento / Baixa imediata"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                          >
                            <CheckCircle2 size={13} className="text-emerald-600" /> Baixar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setUpdate({ kind: 'charge', item: c, status: 'Pendente' })
                            }
                            title="Reabrir fatura"
                            style={{ fontSize: '11px', padding: '3px 6px' }}
                          >
                            <RefreshCw size={12} />
                          </Button>
                        )}
                        <button
                          className="icon-button"
                          aria-label={`Ver lançamento ${c.number}`}
                          title="Ver detalhes do lançamento"
                          onClick={() => setChargeId(c.id)}
                        >
                          <ArrowUpRight size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Excluir lançamento ${c.number}`}
                          title="Excluir lançamento"
                          onClick={() => setDeleteFinanceItem({ kind: 'charge', item: c })}
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

      {renderFinanceDialogs()}
    </div>
  );
}
