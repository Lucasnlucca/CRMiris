import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileText,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Ticket,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, StatCard } from '../components/ui';
import { date, dateTime, localDateTime, money, time, today } from '../utils/format';
import { effectiveChargeStatus, isPaidInMonth } from '../utils/finance';
import type { Database, TicketStatus } from '../types';

const statusColors: Record<TicketStatus, string> = {
  Novo: '#7ca1e4',
  'Em andamento': '#263d61',
  'Aguardando retorno': '#e4bc7c',
  Resolvido: '#88c6b0',
  Cancelado: '#dce2eb',
};
function offsetDay(base: string, amount: number) {
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
function localDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateTime(new Date(value)).slice(0, 10);
}
export function dashboardMetrics(data: Database, reference = today()) {
  const open = data.tickets.filter((t) => !['Resolvido', 'Cancelado'].includes(t.status));
  const expiring = data.documents.filter(
    (d) =>
      d.category === 'Contrato' &&
      d.status !== 'Encerrado' &&
      d.endDate &&
      d.endDate >= reference &&
      d.endDate <= offsetDay(reference, 30),
  );
  const upcoming = data.events
    .filter(
      (e) =>
        e.status === 'Agendado' && e.start >= new Date(`${reference}T00:00:00-03:00`).toISOString(),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const received = data.charges
    .filter((c) => isPaidInMonth(c, reference))
    .reduce((s, c) => s + c.amount, 0);
  return {
    active: data.clients.filter((c) => c.status === 'Ativo').length,
    open,
    critical: open.filter((t) => t.priority === 'Crítica'),
    available: data.servers.filter((s) => s.status === 'Disponível'),
    unavailable: data.servers.filter((s) => s.status === 'Indisponível'),
    overdue: data.charges.filter((c) => effectiveChargeStatus(c, reference) === 'Vencido'),
    received,
    expiring,
    upcoming,
  };
}
export function DashboardPage() {
  const { data, session, refresh, notify } = useApp();
  const navigate = useNavigate();
  const isSupport = session?.role === 'support',
    isFinance = session?.role === 'finance';
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const nowDay = today();
  const m = dashboardMetrics(data, nowDay);
  const counts = (Object.keys(statusColors) as TicketStatus[]).map((name) => ({
    name,
    value: data.tickets.filter((t) => t.status === name).length,
    color: statusColors[name],
  }));
  const chart = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const day = offsetDay(nowDay, -(days - 1 - i));
        return {
          day: day.slice(8, 10) + '/' + day.slice(5, 7),
          full: day,
          Recebidos: data.tickets.filter((t) => localDay(t.createdAt) === day).length,
          Resolvidos: data.tickets.filter(
            (t) => t.status === 'Resolvido' && localDay(t.updatedAt) === day,
          ).length,
        };
      }),
    [data.tickets, days, nowDay],
  );
  const recent = [...data.tickets]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const notices = data.servers.filter(
    (s) => s.status === 'Indisponível' || s.status === 'Em atenção',
  );
  const totalPending = data.charges
    .filter((c) => effectiveChargeStatus(c) === 'Pendente')
    .reduce((s, c) => s + c.amount, 0);
  const totalOverdue = m.overdue.reduce((s, c) => s + c.amount, 0);
  const chargeCounts = [
    { name: 'Pago', label: 'Pagas', color: '#8cc8b3' },
    { name: 'Pendente', label: 'Pendentes', color: '#e6c386' },
    { name: 'Vencido', label: 'Vencidas', color: '#d98980' },
    { name: 'Cancelado', label: 'Canceladas', color: '#dce3ec' },
  ].map((s) => ({
    ...s,
    value: data.charges.filter((c) => effectiveChargeStatus(c) === s.name).length,
  }));
  const currentMonth = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  const topTickets = isFinance
    ? data.charges.filter((c) => effectiveChargeStatus(c) === 'Vencido').slice(0, 5)
    : [];
  return (
    <div className="page-stack">
      <PageHeader
        title="Visão Geral da Operação"
        description="Acompanhe indicadores, chamados, infraestrutura e financeiro em tempo real."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/agenda')}>
              <CalendarDays size={13} />
              {date(nowDay)}
            </Button>
            <Button
              variant="secondary"
              aria-label="Atualizar indicadores"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await refresh();
                  notify('Indicadores atualizados com sucesso.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw size={13} />
            </Button>
            <Button onClick={() => navigate(isFinance ? '/financeiro' : '/tickets?new=1')}>
              {isFinance ? <Wallet size={14} /> : <Plus size={14} />}{' '}
              {isFinance ? 'Ver financeiro' : 'Novo ticket'}
            </Button>
          </>
        }
      />
      <div className="stat-grid">
        <StatCard
          label="Clientes ativos"
          value={m.active.toString().padStart(2, '0')}
          icon={Building2}
          tone="blue"
          detail={
            <>
              <span className="positive">{data.clients.length} clientes</span> na sua base
            </>
          }
          onClick={() => navigate('/clientes?status=Ativo')}
        />
        {isFinance ? (
          <StatCard
            label="Valores pendentes"
            value={money(totalPending)}
            icon={Clock3}
            tone="amber"
            detail="Cobranças aguardando pagamento"
            onClick={() => navigate('/financeiro?status=Pendente')}
          />
        ) : (
          <StatCard
            label="Tickets abertos"
            value={m.open.length.toString().padStart(2, '0')}
            icon={Ticket}
            tone="amber"
            detail={
              <>
                <span className="negative">{m.critical.length} críticos</span> precisam de atenção
              </>
            }
            onClick={() => navigate('/tickets?open=1')}
          />
        )}
        {isFinance ? (
          <StatCard
            label="Cobranças vencidas"
            value={money(totalOverdue)}
            icon={CircleAlert}
            tone="red"
            detail={`${m.overdue.length} cobranças em atraso`}
            onClick={() => navigate('/financeiro?status=Vencido')}
          />
        ) : (
          <StatCard
            label="Servidores disponíveis"
            value={
              <>
                {m.available.length}
                <span style={{ fontSize: 17, color: '#b5bdc9', fontWeight: 400 }}>
                  {' '}
                  / {data.servers.length}
                </span>
              </>
            }
            icon={Server}
            tone="green"
            detail={
              <>
                <span className="positive">Infraestrutura monitorada</span>
              </>
            }
            onClick={() => navigate('/servidores?status=Disponível')}
          />
        )}
        {isSupport ? (
          <StatCard
            label="Serviços ativos"
            value={data.services.filter((s) => s.status === 'Ativo').length}
            icon={ShieldCheck}
            tone="navy"
            detail="Vinculados aos seus clientes"
            onClick={() => navigate('/servicos?status=Ativo')}
          />
        ) : (
          <StatCard
            label="Recebido neste mês"
            value={money(m.received)}
            icon={Wallet}
            tone="navy"
            detail={
              <>
                <ArrowUpRight size={11} className="positive" />
                Pagamentos de {currentMonth}
              </>
            }
            onClick={() => navigate('/financeiro?status=Pago&period=month')}
          />
        )}
      </div>
      <div className="dashboard-quick-metrics">
        {!isFinance && (
          <Link to="/tickets?open=1&priority=Crítica">
            <span className="quick-icon red">
              <CircleAlert size={13} />
            </span>
            <span>Tickets críticos</span>
            <strong>{m.critical.length}</strong>
            <ChevronRight size={12} />
          </Link>
        )}
        {!isFinance && (
          <Link to="/servidores?status=Indisponível">
            <span className="quick-icon amber">
              <Server size={13} />
            </span>
            <span>Servidores indisponíveis</span>
            <strong>{m.unavailable.length}</strong>
            <ChevronRight size={12} />
          </Link>
        )}
        {!isSupport && !isFinance && (
          <Link to="/financeiro?status=Vencido">
            <span className="quick-icon amber">
              <Wallet size={13} />
            </span>
            <span>Cobranças vencidas</span>
            <strong>{m.overdue.length}</strong>
            <ChevronRight size={12} />
          </Link>
        )}
        <Link to="/documentos?expiring=1">
          <span className="quick-icon blue">
            <FileCheck2 size={13} />
          </span>
          <span>Contratos a vencer</span>
          <strong>{m.expiring.length}</strong>
          <ChevronRight size={12} />
        </Link>
        {(isSupport || isFinance) && (
          <Link to="/agenda?upcoming=1">
            <span className="quick-icon blue">
              <CalendarDays size={13} />
            </span>
            <span>Próximos compromissos</span>
            <strong>{m.upcoming.length}</strong>
            <ChevronRight size={12} />
          </Link>
        )}
      </div>
      {!isFinance && (
        <div className="dashboard-charts">
          <Card>
            <div className="card-header">
              <div>
                <h2>Movimentação de chamados</h2>
                <p>Acompanhe o ritmo do atendimento</p>
              </div>
              <div className="filters">
                <select
                  aria-label="Período do gráfico de chamados"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  <option value={7}>Últimos 7 dias</option>
                  <option value={14}>Últimos 14 dias</option>
                  <option value={30}>Últimos 30 dias</option>
                </select>
              </div>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-dot" style={{ background: '#435f87' }} />
                Recebidos
              </span>
              <span>
                <i className="legend-dot" style={{ background: '#83bda8' }} />
                Resolvidos
              </span>
            </div>
            <div
              className="chart-body"
              role="img"
              aria-label={`Gráfico de chamados recebidos e resolvidos nos últimos ${days} dias. ${chart.reduce((s, d) => s + d.Recebidos, 0)} recebidos e ${chart.reduce((s, d) => s + d.Resolvidos, 0)} resolvidos.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 20, right: 16, left: -29, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ticketFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9ab0d0" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#9ab0d0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#edf1f6" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#b0b9c6', fontSize: 9 }}
                    minTickGap={24}
                    dy={9}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tick={{ fill: '#b0b9c6', fontSize: 9 }}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 11, border: '1px solid #e4eaf2', borderRadius: 8 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Recebidos"
                    stroke="#536e94"
                    strokeWidth={2}
                    fill="url(#ticketFill)"
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Resolvidos"
                    stroke="#8cbfab"
                    strokeWidth={1.7}
                    fill="transparent"
                    strokeDasharray="4 4"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <div className="card-header">
              <div>
                <h2>Tickets por status</h2>
                <p>Distribuição de todos os chamados</p>
              </div>
              <Link to="/tickets" className="icon-button" aria-label="Ver todos os tickets">
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="status-chart">
              <div
                className="donut-wrap"
                role="img"
                aria-label={counts.map((c) => `${c.name}: ${c.value}`).join(', ')}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={counts}
                      cx="50%"
                      cy="50%"
                      innerRadius="74%"
                      outerRadius="95%"
                      dataKey="value"
                      paddingAngle={3}
                      stroke="none"
                      onClick={(s: any) => s?.name && navigate(`/tickets?status=${encodeURIComponent(String(s.name))}`)}
                    >
                      {counts.map((c) => (
                        <Cell key={c.name} fill={c.color} style={{ cursor: 'pointer' }} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 11, border: '1px solid #e5ebf3', borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong>{data.tickets.length}</strong>
                  <span>tickets no total</span>
                </div>
              </div>
              <div className="status-legend">
                {counts.map((c) => (
                  <Link
                    key={c.name}
                    className="status-legend-row"
                    to={`/tickets?status=${encodeURIComponent(c.name)}`}
                  >
                    <span>
                      <i className="legend-dot" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <strong>{c.value.toString().padStart(2, '0')}</strong>
                  </Link>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
      <Card className="dashboard-recent">
        <div className="card-header">
          <div>
            <h2>
              {isFinance ? 'Cobranças que precisam de atenção' : 'Tickets recentes'}{' '}
              <span className="chip" style={{ marginLeft: 7, fontSize: 8 }}>
                {isFinance ? m.overdue.length : m.open.length + ' abertos'}
              </span>
            </h2>
            <p>
              {isFinance ? 'Acompanhe os valores em atraso' : 'Os últimos movimentos da sua equipe'}
            </p>
          </div>
          <Link to={isFinance ? '/financeiro?status=Vencido' : '/tickets'} className="link small">
            Ver {isFinance ? 'cobranças' : 'todos'}
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                {(isFinance
                  ? ['Cobrança', 'Cliente', 'Vencimento', 'Valor', 'Status', '']
                  : [
                      'Ticket / assunto',
                      'Cliente',
                      'Prioridade',
                      'Status',
                      'Responsável',
                      'Atualizado',
                    ]
                ).map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isFinance
                ? topTickets.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/financeiro?id=${c.id}`} className="cell-title">
                          {c.number}
                        </Link>
                        <div className="cell-subtitle">{c.description}</div>
                      </td>
                      <td>{data.clients.find((x) => x.id === c.clientId)?.tradeName}</td>
                      <td>{date(c.dueDate)}</td>
                      <td>{money(c.amount)}</td>
                      <td>
                        <Badge status={effectiveChargeStatus(c)} />
                      </td>
                      <td>
                        <Link
                          to={`/financeiro?id=${c.id}`}
                          className="icon-button"
                          aria-label={`Ver cobrança ${c.number}`}
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))
                : recent.map((t) => {
                    const c = data.clients.find((c) => c.id === t.clientId);
                    const u = data.users.find((u) => u.id === t.assigneeId);
                    return (
                      <tr key={t.id}>
                        <td>
                          <Link to={`/tickets/${t.id}`}>
                            <span className="cell-subtitle" style={{ margin: 0, fontSize: 9 }}>
                              #{t.number}
                            </span>
                            <div className="cell-title" style={{ marginTop: 3 }}>
                              {t.title}
                            </div>
                          </Link>
                        </td>
                        <td>
                          <Link to={`/clientes/${c?.id}`} className="inline">
                            <Avatar name={c?.tradeName || c?.name || ''} size={27} />
                            <span>{c?.tradeName || c?.name}</span>
                          </Link>
                        </td>
                        <td>
                          <Badge status={t.priority} />
                        </td>
                        <td>
                          <Badge status={t.status} />
                        </td>
                        <td>
                          <span className="inline">
                            <Avatar name={u?.name || '?'} size={23} />
                            <span className="small">
                              {u?.name.split(' ')[0] || 'Não atribuído'}
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="cell-subtitle">{dateTime(t.updatedAt)}</span>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {(isFinance ? !topTickets.length : !recent.length) && (
            <EmptyState
              title="Tudo tranquilo por aqui"
              description="Os novos registros aparecerão nesta lista."
            />
          )}
        </div>
      </Card>
      <div className="dashboard-bottom">
        <Card>
          <div className="card-header">
            <h2>{isFinance ? 'Situação das cobranças' : 'Alertas operacionais'}</h2>
            {!isFinance && (
              <span className="chip">{notices.length + (m.critical.length ? 1 : 0)}</span>
            )}
          </div>
          {isFinance ? (
            <ChargeChart data={chargeCounts} />
          ) : (
            <div>
              {notices.map((s) => (
                <Link to={`/servidores/${s.id}`} className="list-item" key={s.id}>
                  <span className={`alert-symbol ${s.status === 'Indisponível' ? 'red' : ''}`}>
                    <CircleAlert size={14} />
                  </span>
                  <div className="list-item-content">
                    <span className="list-item-title">{s.name}</span>
                    <div className="list-item-subtitle">
                      {s.status} · {s.unavailableExtensions} ramais indisponíveis
                    </div>
                  </div>
                  <ChevronRight size={12} className="muted" />
                </Link>
              ))}
              {m.critical.length > 0 && (
                <Link to="/tickets?open=1&priority=Crítica" className="list-item">
                  <span className="alert-symbol blue">
                    <Ticket size={14} />
                  </span>
                  <div>
                    <span className="list-item-title">
                      {m.critical.length} tickets de prioridade crítica
                    </span>
                    <div className="list-item-subtitle">Confira os atendimentos prioritários</div>
                  </div>
                </Link>
              )}
              {!notices.length && !m.critical.length && <EmptyState title="Nenhum alerta ativo" />}
            </div>
          )}
        </Card>
        <Card>
          <div className="card-header">
            <h2>Contratos a vencer</h2>
            <Link to="/documentos?expiring=1" className="link small">
              Ver todos
              <ArrowRight size={11} />
            </Link>
          </div>
          {m.expiring.slice(0, 3).map((d) => (
            <Link to={`/documentos?id=${d.id}`} className="list-item" key={d.id}>
              <span className="alert-symbol blue">
                <FileText size={15} />
              </span>
              <div className="list-item-content">
                <span className="list-item-title">
                  {data.clients.find((c) => c.id === d.clientId)?.tradeName}
                </span>
                <div className="list-item-subtitle">
                  {d.number || 'Contrato'} · {date(d.endDate)}
                </div>
              </div>
              <span className="list-item-end">
                {Math.ceil(
                  (new Date(`${d.endDate}T12:00:00Z`).getTime() -
                    new Date(`${nowDay}T12:00:00Z`).getTime()) /
                    86400000,
                )}{' '}
                dias
              </span>
            </Link>
          ))}
          {!m.expiring.length && (
            <EmptyState
              title="Nenhum contrato próximo do vencimento"
              description="A janela considera os próximos 30 dias."
            />
          )}
        </Card>
        <Card>
          <div className="card-header">
            <h2>
              Próximos compromissos{' '}
              <span className="chip" style={{ fontSize: 8 }}>
                {m.upcoming.length}
              </span>
            </h2>
            <Link to="/agenda?upcoming=1" className="link small">
              Agenda
              <ArrowRight size={11} />
            </Link>
          </div>
          {m.upcoming.slice(0, 3).map((e) => (
            <Link to={`/agenda?id=${e.id}`} className="list-item" key={e.id}>
              <div className="mini-date">
                <span>
                  {new Intl.DateTimeFormat('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    month: 'short',
                  })
                    .format(new Date(e.start))
                    .replace('.', '')}
                </span>
                <strong>{localDay(e.start).slice(-2)}</strong>
              </div>
              <div className="list-item-content">
                <span className="list-item-title">{e.title}</span>
                <div className="list-item-subtitle">
                  {time(e.start)} · {e.type}
                </div>
              </div>
            </Link>
          ))}
          {!m.upcoming.length && (
            <EmptyState
              title="Agenda livre"
              description="Agende sua próxima reunião ou visita técnica."
            />
          )}
        </Card>
      </div>
      {!isSupport && !isFinance && (
        <Card>
          <div className="financial-summary-row">
            <div>
              <div className="card-header" style={{ marginBottom: 8 }}>
                <h2>Situação das cobranças</h2>
              </div>
              <p className="muted small">Resumo consolidado de cobranças da empresa</p>
            </div>
            <div className="financial-summary-chart">
              <div
                className="mini-bars"
                role="img"
                aria-label={chargeCounts.map((c) => `${c.label}: ${c.value}`).join(', ')}
              >
                {chargeCounts
                  .filter((c) => c.value > 0)
                  .map((c) => (
                    <Link
                      title={`${c.label}: ${c.value}`}
                      aria-label={`${c.label}: ${c.value}. Ver cobranças`}
                      key={c.name}
                      to={`/financeiro?status=${c.name}`}
                      style={{ flex: c.value, background: c.color, borderRadius: 3 }}
                    />
                  ))}
              </div>
              <div className="chart-legend">
                {chargeCounts.map((c) => (
                  <Link key={c.name} to={`/financeiro?status=${c.name}`}>
                    <i className="legend-dot" style={{ background: c.color }} />
                    {c.label} <strong>{c.value}</strong>
                  </Link>
                ))}
              </div>
            </div>
            <Link className="link small" to="/financeiro">
              Ver financeiro
              <ArrowRight size={13} />
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
function ChargeChart({
  data,
}: {
  data: { name: string; label: string; color: string; value: number }[];
}) {
  return (
    <>
      <div
        className="mini-bars"
        role="img"
        aria-label={data.map((c) => `${c.label}: ${c.value}`).join(', ')}
        style={{ height: 12, marginTop: 24 }}
      >
        {data
          .filter((c) => c.value)
          .map((c) => (
            <Link
              key={c.name}
              to={`/financeiro?status=${c.name}`}
              style={{ flex: c.value, background: c.color }}
              aria-label={`${c.label}: ${c.value}`}
            />
          ))}
      </div>
      <div className="status-legend" style={{ marginTop: 20 }}>
        {data.map((c) => (
          <Link key={c.name} className="status-legend-row" to={`/financeiro?status=${c.name}`}>
            <span>
              <i className="legend-dot" style={{ background: c.color }} />
              {c.label}
            </span>
            <strong>{c.value}</strong>
          </Link>
        ))}
      </div>
    </>
  );
}
