import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CloudUpload,
  Database,
  Eye,
  EyeOff,
  Info,
  Network,
  RefreshCw,
  Sparkles,
  Video,
  Wallet,
  Webhook,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTenant } from '../../context/TenantContext';
import { Badge, Button, Card, Modal, PageHeader } from '../components/ui';
import { money } from '../utils/format';

interface AsaasStatus {
  isConfigured: boolean;
  environment: string;
  maskedKey: string;
  baseUrl: string;
}

export function IntegrationsPage() {
  const { notify } = useApp();
  const { tenant } = useTenant();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<number | null>(null);

  // Estados da Integração Asaas
  const [asaasModalOpen, setAsaasModalOpen] = useState(false);
  const [asaasStatus, setAsaasStatus] = useState<AsaasStatus | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [envInput, setEnvInput] = useState<'sandbox' | 'production'>('sandbox');
  const [showKey, setShowKey] = useState(false);
  const [testingBusy, setTestingBusy] = useState(false);
  const [savingBusy, setSavingBusy] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    accountName?: string;
    balance?: number;
  } | null>(null);

  const tenantId = tenant?.id || 'tenant_default';

  const loadAsaasConfig = async () => {
    try {
      const res = await fetch(`/api/asaas/config?tenantId=${tenantId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setAsaasStatus(json);
          setEnvInput(json.environment === 'production' ? 'production' : 'sandbox');
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadAsaasConfig();
  }, [tenantId]);

  const handleTestAsaas = async () => {
    setTestingBusy(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/asaas/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim() || undefined,
          environment: envInput,
          tenantId,
        }),
      });
      const json = await res.json();
      setTestResult({
        ok: json.success && json.ok,
        message: json.message || (json.ok ? 'Conexão estabelecida com sucesso!' : 'Falha na conexão.'),
        accountName: json.accountName,
        balance: json.balance,
      });
      if (json.success && json.ok) {
        notify('Conexão com o Asaas validada com sucesso!');
      } else {
        notify(json.message || 'Falha ao testar conexão com o Asaas', 'error');
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err?.message || 'Erro de rede ao comunicar com o servidor.',
      });
      notify('Erro ao testar Asaas: ' + err.message, 'error');
    } finally {
      setTestingBusy(false);
    }
  };

  const handleSaveAsaas = async () => {
    if (!apiKeyInput.trim() && !asaasStatus?.isConfigured) {
      notify('Informe a Chave de API do Asaas.', 'error');
      return;
    }

    setSavingBusy(true);
    try {
      const res = await fetch('/api/asaas/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKeyInput.trim() || asaasStatus?.maskedKey || '',
          environment: envInput,
          tenantId,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        notify(json.message || 'Integração Asaas salva e ativada com sucesso!');
        await loadAsaasConfig();
        setAsaasModalOpen(false);
      } else {
        notify(json.error || 'Erro ao salvar configuração do Asaas', 'error');
      }
    } catch (err: any) {
      notify('Erro ao salvar Asaas: ' + err.message, 'error');
    } finally {
      setSavingBusy(false);
    }
  };

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
      status: (asaasStatus?.isConfigured ? 'Ativo' : 'Planejada') as any,
      action: () => setAsaasModalOpen(true),
      description: 'Cobranças, recebimentos, Pix e boletos bancários automatizados.',
      detail:
        'Conexão direta com a API v3 do Asaas para emissão de boletos, Pix instantâneo, consulta de cobranças e conciliação automática.',
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

  const item = selected === null ? null : integrations[selected];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="ADMINISTRAÇÃO & SISTEMA"
        title="Ecossistema de Integrações"
        description="Conectores ativos e integrações disponíveis para a sua operação."
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setAsaasModalOpen(true)}>
              <Wallet size={14} />
              Configurar Asaas
            </Button>
            <Button onClick={() => navigate('/automacoes')}>
              <Webhook size={14} />
              Gerenciar Automações & Webhooks
            </Button>
          </div>
        }
      />

      <div className="alert alert-info">
        <Info size={16} />
        <span>
          O sincronismo em nuvem, o gateway financeiro Asaas e o módulo de Automações & Webhooks estão ativos para a sua empresa.
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
                onClick={() => {
                  if (i.action) {
                    i.action();
                  } else if (i.route) {
                    navigate(i.route);
                  } else {
                    setSelected(index);
                  }
                }}
              >
                {i.action ? 'Configurar no sistema' : i.route ? 'Abrir módulo' : 'Ver detalhes'}
                <ArrowRight size={12} />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Modal Genérico de Detalhes da Integração */}
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

      {/* Modal Interativo de Vínculo do Asaas no Sistema */}
      {asaasModalOpen && (
        <Modal
          open={asaasModalOpen}
          onClose={() => setAsaasModalOpen(false)}
          title="Vínculo do Gateway Asaas Financeiro"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Status Atual do Vínculo */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: asaasStatus?.isConfigured ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                border: `1px solid ${asaasStatus?.isConfigured ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {asaasStatus?.isConfigured ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                ) : (
                  <Sparkles size={18} style={{ color: '#f59e0b' }} />
                )}
                <div>
                  <strong style={{ fontSize: '13px', color: asaasStatus?.isConfigured ? '#065f46' : '#92400e' }}>
                    {asaasStatus?.isConfigured ? 'Asaas Conectado e Ativo' : 'Asaas Operando em Modo Demonstrativo'}
                  </strong>
                  <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>
                    {asaasStatus?.isConfigured
                      ? `Ambiente: ${asaasStatus.environment.toUpperCase()} • Chave vinculada: ${asaasStatus.maskedKey}`
                      : 'Insira sua chave de API para consultar e emitir cobranças reais.'}
                  </span>
                </div>
              </div>
              <Badge status={asaasStatus?.isConfigured ? 'Ativo' : 'Pendente'} />
            </div>

            {/* Formulário de Configuração Direto no Sistema */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Chave de API do Asaas (Access Token) *
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder={asaasStatus?.isConfigured ? asaasStatus.maskedKey : 'Ex: $aact_YTU5YTE0M2M6N2Nm...'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 40px 9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                  }}
                  title={showKey ? 'Ocultar chave' : 'Visualizar chave'}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                Gere sua chave no painel do Asaas em <strong>Minha Conta &gt; Configurações &gt; Integrações &gt; Chaves de API</strong>.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Ambiente de Conexão *
              </label>
              <select
                value={envInput}
                onChange={(e) => setEnvInput(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  background: '#fff',
                }}
              >
                <option value="sandbox">Sandbox (Ambiente de Testes / Homologação)</option>
                <option value="production">Produção (Ambiente Oficial Asaas com Dinheiro Real)</option>
              </select>
            </div>

            {/* Resultado do Teste de Conexão */}
            {testResult && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: testResult.ok ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid ${testResult.ok ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                {testResult.ok ? (
                  <CheckCircle2 size={16} style={{ color: '#10b981', marginTop: '1px' }} />
                ) : (
                  <XCircle size={16} style={{ color: '#ef4444', marginTop: '1px' }} />
                )}
                <div style={{ flex: 1 }}>
                  <strong style={{ color: testResult.ok ? '#065f46' : '#991b1b', display: 'block' }}>
                    {testResult.message}
                  </strong>
                  {testResult.accountName && (
                    <span style={{ color: '#64748b', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                      Conta: <strong>{testResult.accountName}</strong>
                      {typeof testResult.balance === 'number' && (
                        <> • Saldo: <strong>{money(testResult.balance)}</strong></>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Ações do Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <Button
                variant="secondary"
                size="sm"
                loading={testingBusy}
                onClick={handleTestAsaas}
              >
                <RefreshCw size={13} className={testingBusy ? 'animate-spin' : ''} />
                Testar Conexão
              </Button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="ghost" onClick={() => setAsaasModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  loading={savingBusy}
                  onClick={handleSaveAsaas}
                >
                  <CheckCircle2 size={14} /> Salvar e Vincular
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
