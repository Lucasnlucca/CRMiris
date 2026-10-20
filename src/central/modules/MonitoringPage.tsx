import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CircleAlert,
  Radio,
  RefreshCw,
  Server as ServerIcon,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Badge, Button, Card, PageHeader, SearchInput, StatCard } from '../components/ui';
import { dateTime } from '../utils/format';
import type { ServerStatus } from '../types';
export function MonitoringPage() {
  const { data, patch, notify } = useApp();
  const navigate = useNavigate();
  const [filter, setFilter] = useState(''),
    [busy, setBusy] = useState(false);
  const servers = data.servers.filter((s) =>
    `${s.name} ${s.platform} ${s.domain}`.toLowerCase().includes(filter.toLowerCase()),
  );
  async function refresh() {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      for (const s of data.servers) {
        await patch('servers', s.id, { lastCheck: now });
      }
      notify('Horário de verificação registrado. Métricas ativas de telemetria requerem conector AMI/ARI com o PABX.', 'info');
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="OPERAÇÕES & INFRAESTRUTURA"
        title="Monitoramento de Ambientes"
        description="Visão cadastral dos ambientes de telefonia. (Nota: Telemetria em tempo real de tráfego/ramais requer conector AMI/ARI)."
        actions={
          <Button onClick={() => void refresh()} loading={busy}>
            <RefreshCw size={14} />
            Registrar checagem
          </Button>
        }
      />
      <div className="stat-grid">
        {(
          [
            { label: 'Disponíveis', status: 'Disponível', icon: ShieldCheck, tone: 'green' },
            { label: 'Em atenção', status: 'Em atenção', icon: CircleAlert, tone: 'amber' },
            { label: 'Indisponíveis', status: 'Indisponível', icon: WifiOff, tone: 'red' },
            { label: 'Sem dados', status: 'Sem dados', icon: ServerIcon, tone: 'navy' },
          ] as const
        ).map((s) => (
          <StatCard
            key={s.status}
            label={s.label}
            value={data.servers.filter((x) => x.status === s.status).length}
            icon={s.icon}
            tone={s.tone}
            detail="Ambientes monitorados"
            onClick={() => navigate(`/servidores?status=${encodeURIComponent(s.status)}`)}
          />
        ))}
      </div>
      <div className="toolbar" style={{ margin: 0 }}>
        <h2>
          Ambientes da operação{' '}
          <span className="chip" style={{ marginLeft: 7 }}>
            {servers.length}
          </span>
        </h2>
        <SearchInput
          value={filter}
          onChange={setFilter}
          placeholder="Buscar ambiente ou domínio..."
        />
      </div>
      <div className="grid-3">
        {servers.map((s) => {
          const total = s.registeredExtensions + s.unavailableExtensions;
          return (
            <Card key={s.id}>
              <div className="card-header">
                <span className="integration-icon" style={{ margin: 0, width: 35, height: 35 }}>
                  <ServerIcon size={18} />
                </span>
                <Badge status={s.status} />
              </div>
              <Link to={`/servidores/${s.id}`}>
                <h3 style={{ fontSize: 13 }}>{s.name}</h3>
                <p className="muted small" style={{ marginTop: 7 }}>
                  {s.platform} · {s.environment}
                </p>
              </Link>
              <div className="divider" />
              <div className="info-row">
                <span>Disponibilidade (SLA)</span>
                <strong>
                  {s.status === 'Sem dados'
                    ? '—'
                    : s.uptime.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '%'}
                </strong>
              </div>
              <div className="info-row">
                <span>Ramais registrados</span>
                <span>
                  {s.status === 'Sem dados' ? '—' : `${s.registeredExtensions} / ${total}`}
                </span>
              </div>
              <div
                className="mini-bars"
                style={{ margin: '14px 0' }}
                role="img"
                aria-label={`${s.registeredExtensions} ramais registrados e ${s.unavailableExtensions} indisponíveis`}
              >
                <span style={{ background: '#8fc7b1', flex: s.registeredExtensions || 0.01 }} />
                <span
                  style={{
                    background: total ? '#da8f85' : '#e5ebf2',
                    flex: s.unavailableExtensions || (total ? 0.01 : 1),
                  }}
                />
              </div>
              <div className="list-item-subtitle">Última verificação: {dateTime(s.lastCheck)}</div>
              <Link to={`/servidores/${s.id}`} className="link small" style={{ marginTop: 17 }}>
                Ver ambiente e incidentes
                <ArrowRight size={12} />
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
