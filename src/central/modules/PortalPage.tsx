import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  FileText,
  Headphones,
  Layers3,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Ticket,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Badge, Button, Card, EmptyState, PageHeader, StatCard } from '../components/ui';
import { date, money } from '../utils/format';
import { effectiveChargeStatus } from '../utils/finance';
export function PortalPage() {
  const { data, session } = useApp();
  const navigate = useNavigate();
  const client = data.clients.find((c) => c.id === session?.clientId);
  if (!client)
    return (
      <EmptyState
        title="Cliente não selecionado"
        description="Volte à seleção de perfil para escolher um cliente."
        action={<Button onClick={() => navigate('/acesso')}>Selecionar cliente</Button>}
      />
    );
  const tickets = data.tickets.filter((t) => t.clientId === client.id);
  const documents = data.documents.filter((d) => d.clientId === client.id && d.shared);
  const charges = data.charges.filter((c) => c.clientId === client.id);
  const pending = charges.filter((c) => ['Pendente', 'Vencido'].includes(effectiveChargeStatus(c)));
  const services = data.services.filter((s) => s.clientId === client.id);
  const recent = [...tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  return (
    <div className="page-stack">
      <PageHeader
        title="Portal do cliente"
        description={`${client.tradeName || client.name} · Seu relacionamento com a Telefonia Fácil.`}
      />
      <div className="portal-hero">
        <div>
          <span className="eyebrow" style={{ color: '#8fabc4' }}>
            BEM-VINDO À SUA CENTRAL
          </span>
          <h2>Como podemos ajudar hoje?</h2>
          <p>
            Acompanhe seus chamados, consulte documentos e mantenha suas cobranças organizadas. Sua
            equipe de atendimento está logo aqui.
          </p>
        </div>
        <Button onClick={() => navigate('/portal/tickets?new=1')}>
          <Plus size={15} />
          Abrir um chamado
        </Button>
      </div>
      <div className="stat-grid">
        <StatCard
          label="Meus tickets abertos"
          value={tickets.filter((t) => !['Resolvido', 'Cancelado'].includes(t.status)).length}
          icon={Ticket}
          tone="blue"
          detail="Acompanhe suas solicitações"
          onClick={() => navigate('/portal/tickets?open=1')}
        />
        <StatCard
          label="Serviços ativos"
          value={services.filter((s) => s.status === 'Ativo').length}
          icon={Layers3}
          tone="green"
          detail="Seus serviços de telefonia"
          onClick={() =>
            document
              .getElementById('portal-services')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        />
        <StatCard
          label="Documentos disponíveis"
          value={documents.length}
          icon={FileText}
          tone="navy"
          detail="Arquivos disponibilizados para você"
          onClick={() => navigate('/portal/documentos')}
        />
        <StatCard
          label="Valores em aberto"
          value={money(pending.reduce((sum, c) => sum + c.amount, 0))}
          icon={Wallet}
          tone="amber"
          detail={`${pending.length} cobrança(s) pendente(s) ou vencida(s)`}
          onClick={() => navigate('/portal/financeiro')}
        />
      </div>
      <div className="grid-2">
        <Card>
          <div className="card-header">
            <div>
              <h2>Seus últimos chamados</h2>
              <p>Acompanhe a conversa com nossa equipe</p>
            </div>
            <Link className="link small" to="/portal/tickets">
              Ver todos
              <ArrowRight size={12} />
            </Link>
          </div>
          {recent.map((t) => {
            const message = t.messages.filter((m) => !m.internal).at(-1);
            return (
              <Link key={t.id} className="list-item" to={`/portal/tickets/${t.id}`}>
                <span className="alert-symbol blue">
                  <MessageSquare size={15} />
                </span>
                <div className="list-item-content">
                  <span className="cell-subtitle">#{t.number}</span>
                  <span className="list-item-title" style={{ marginTop: 3, fontSize: 11 }}>
                    {t.title}
                  </span>
                  <div className="list-item-subtitle">
                    {message
                      ? message.text.slice(0, 92) + (message.text.length > 92 ? '…' : '')
                      : 'Acompanhe as respostas ao seu chamado.'}
                  </div>
                  <div className="list-item-subtitle">Atualizado em {date(t.updatedAt)}</div>
                </div>
                <Badge status={t.status} />
              </Link>
            );
          })}
          {!recent.length && (
            <EmptyState
              title="Nenhum chamado por aqui"
              description="Abra um ticket quando precisar da nossa equipe."
              action={
                <Button size="sm" onClick={() => navigate('/portal/tickets?new=1')}>
                  Abrir chamado
                </Button>
              }
            />
          )}
        </Card>
        <Card>
          <div className="card-header">
            <div>
              <h2>Resumo de cobranças</h2>
              <p>Histórico financeiro vinculado à sua empresa</p>
            </div>
            <Link className="link small" to="/portal/financeiro">
              Ver todas
              <ArrowRight size={12} />
            </Link>
          </div>
          {[...charges]
            .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
            .slice(0, 4)
            .map((c) => (
              <Link key={c.id} className="list-item" to={`/portal/financeiro?id=${c.id}`}>
                <span className="alert-symbol blue">
                  <Wallet size={15} />
                </span>
                <div className="list-item-content">
                  <span className="list-item-title" style={{ fontSize: 11 }}>
                    {c.description}
                  </span>
                  <div className="list-item-subtitle">Vencimento {date(c.dueDate)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong
                    style={{ fontSize: 12, color: '#647893', display: 'block', marginBottom: 7 }}
                  >
                    {money(c.amount)}
                  </strong>
                  <Badge status={effectiveChargeStatus(c)} />
                </div>
              </Link>
            ))}
          {!charges.length && <EmptyState title="Nenhuma cobrança cadastrada" />}
          <p className="search-hint" style={{ lineHeight: 1.8 }}>
            Consulte os detalhes de cada lançamento na área financeira do portal.
          </p>
        </Card>
      </div>
      <div className="grid-2">
        <div id="portal-services">
          <Card>
            <div className="card-header">
              <div>
                <h2>Seus serviços</h2>
                <p>O que conecta a sua empresa</p>
              </div>
              <Layers3 size={17} className="muted" />
            </div>
            <div className="portal-services">
              {services.map((s) => (
                <div className="portal-service" key={s.id}>
                  <div>
                    <strong style={{ fontSize: 11, fontWeight: 550 }}>{s.name}</strong>
                    <div className="list-item-subtitle">
                      {s.extensions} ramais · {s.channels} canais
                    </div>
                  </div>
                  <Badge status={s.status} />
                </div>
              ))}
              {!services.length && <EmptyState title="Nenhum serviço associado" />}
            </div>
          </Card>
        </div>
        <Card>
          <div className="card-header">
            <h2>Dados de contato</h2>
            <Building2 size={16} className="muted" />
          </div>
          <div className="info-row">
            <span>Cliente</span>
            <span>{client.name}</span>
          </div>
          <div className="info-row">
            <span>Telefone</span>
            <span>{client.phone}</span>
          </div>
          <div className="info-row">
            <span>E-mail</span>
            <span style={{ overflowWrap: 'anywhere' }}>{client.email}</span>
          </div>
          <div className="info-row">
            <span>Cidade</span>
            <span>
              {client.city} / {client.state}
            </span>
          </div>
          <p className="search-hint" style={{ lineHeight: 1.8 }}>
            Precisa corrigir alguma informação?{' '}
            <Link className="link" to="/portal/tickets?new=1">
              Fale com nossa equipe.
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
