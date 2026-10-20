import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CloudUpload,
  Database,
  Info,
  Network,
  Sparkles,
  Video,
  Wallet,
  Webhook,
} from 'lucide-react';
import { Badge, Button, Card, Modal, PageHeader } from '../components/ui';
const integrations = [
  {
    name: 'Banco de Dados & Nuvem',
    icon: Database,
    color: '#263d61',
    background: '#edf3fc',
    status: 'Ativo' as const,
    description: 'Sincronização em tempo real de clientes, chamados e operações.',
    detail:
      'Todos os módulos operacionais, comerciais e financeiros contam com sincronização em tempo real, isolamento seguro por organização e controle de acesso.',
  },
  {
    name: 'Automações, Webhooks & ZapSign',
    icon: Webhook,
    color: '#3b82f6',
    background: '#eff6ff',
    status: 'Ativo' as const,
    route: '/automacoes',
    description: 'Gatilhos automáticos, webhooks e assinatura digital ZapSign.',
    detail:
      'Configure integrações de webhook, regras de automação comercial e chaves de assinatura eletrônica ZapSign diretamente no painel de Automações.',
  },
  {
    name: 'Asaas Financeiro',
    icon: Wallet,
    color: '#2870ae',
    background: '#edf6ff',
    status: 'Planejada' as const,
    description: 'Cobranças, recebimentos e conciliação bancária automatizada.',
    detail:
      'A integração permitirá emitir boletos e cobranças Pix automaticamente, conciliar recebimentos por webhook e atualizar o status financeiro de cada cliente em tempo real.',
  },
  {
    name: 'Telefonia & Yeastar P-Series',
    icon: Network,
    color: '#4a92a3',
    background: '#edf8f9',
    status: 'Planejada' as const,
    description: 'Telemetria automática dos ambientes de telefonia, ramais e troncos.',
    detail:
      'Conexão direta via API com centrais Yeastar P-Series e servidores SIP para leitura automática de ramais registrados, chamadas ativas e alertas de disponibilidade.',
  },
  {
    name: 'Google Calendar & Meet',
    icon: CalendarDays,
    color: '#7286ba',
    background: '#f0f4fe',
    status: 'Planejada' as const,
    description: 'Sincronização de reuniões, visitas técnicas e salas de videoconferência.',
    detail:
      'Sincronize os compromissos da Agenda Operacional com o Google Calendar da equipe e gere links do Google Meet automaticamente para reuniões remotas.',
  },
  {
    name: 'Armazenamento em Nuvem',
    icon: CloudUpload,
    color: '#a18bba',
    background: '#f7f1fe',
    status: 'Ativo' as const,
    description: 'Armazenamento seguro de contratos, propostas e arquivos.',
    detail:
      'Documentos e contratos ficam salvos em nuvem de forma criptografada com controle de visibilidade no Portal do Cliente.',
  },
];
export function IntegrationsPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const navigate = useNavigate();
  const item = selected === null ? null : integrations[selected];
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="ADMINISTRAÇÃO & SISTEMA"
        title="Ecossistema de Integrações"
        description="Conectores ativos e integrações disponíveis para a sua operação."
        actions={
          <Button onClick={() => navigate('/automacoes')}>
            <Webhook size={14} />
            Gerenciar Automações & Webhooks
          </Button>
        }
      />
      <div className="alert alert-info">
        <Info size={16} />
        <span>
          O sincronismo em nuvem e o módulo de Automações & Webhooks estão ativos para a sua empresa.
        </span>
      </div>
      <div className="integrations-grid">
        {integrations.map((i, index) => (
          <Card className="integration-card" key={i.name}>
            <div className="integration-icon" style={{ background: i.background, color: i.color }}>
              <i.icon size={23} strokeWidth={1.5} />
            </div>
            <h3>{i.name}</h3>
            <p>{i.description}</p>
            <div className="integration-card-footer">
              <Badge status={i.status} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (i.route ? navigate(i.route) : setSelected(index))}
              >
                {i.route ? 'Abrir módulo' : 'Ver detalhes'}
                <ArrowRight size={12} />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <Modal open={!!item} onClose={() => setSelected(null)} title={item?.name || 'Integração'}>
        {item && (
          <>
            <div
              className="integration-icon"
              style={{ background: item.background, color: item.color }}
            >
              <item.icon size={23} />
            </div>
            <Badge status={item.status} />
            <p style={{ fontSize: 13, color: '#7e8fa7', marginTop: 17, lineHeight: 1.9 }}>
              {item.detail}
            </p>
            <div className="form-actions">
              <Button onClick={() => setSelected(null)}>Fechar</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
