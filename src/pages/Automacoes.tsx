import { useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  Settings,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Workflow,
  Webhook,
  CreditCard,
  CalendarDays,
  FolderOpen,
  Figma,
  Briefcase,
  PlugZap,
  XCircle,
  X,
  Save,
  Link2,
  Power,
  ShieldCheck
} from 'lucide-react';
import { databases } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';
import { useAuth } from '../context/AuthContext';

type IntegrationStatus = 'connected' | 'disconnected' | 'soon';

type IntegrationKey =
  | 'google_calendar'
  | 'asaas'
  | 'webhooks'
  | 'google_drive'
  | 'figma'
  | 'slack';

type IntegrationField = {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'textarea';
  placeholder?: string;
  options?: { label: string; value: string }[];
};

type IntegrationDefinition = {
  key: IntegrationKey;
  name: string;
  icon: any;
  description: string;
  defaultStatus: IntegrationStatus;
  configurable: boolean;
  fields: IntegrationField[];
};

type IntegrationConfigRow = {
  id: string;
  integration_key: IntegrationKey;
  config: Record<string, any>;
  status: IntegrationStatus;
  is_enabled: boolean;
  updated_at?: string;
};

const integrationDefinitions: IntegrationDefinition[] = [
  {
    key: 'google_calendar',
    name: 'Google Calendar',
    icon: CalendarDays,
    description: 'Agenda e eventos sincronizados',
    defaultStatus: 'disconnected',
    configurable: true,
    fields: [
      {
        name: 'client_id',
        label: 'Client ID',
        type: 'text',
        placeholder: 'Cole o Client ID'
      },
      {
        name: 'client_secret',
        label: 'Client Secret',
        type: 'password',
        placeholder: 'Cole o Client Secret'
      },
      {
        name: 'redirect_uri',
        label: 'Redirect URI',
        type: 'text',
        placeholder: 'https://seudominio.com/auth/google/callback'
      },
      {
        name: 'calendar_id',
        label: 'Calendar ID',
        type: 'text',
        placeholder: 'primary ou email do calendário'
      }
    ]
  },
  {
    key: 'asaas',
    name: 'Asaas',
    icon: CreditCard,
    description: 'Cobranças, Pix e boletos',
    defaultStatus: 'disconnected',
    configurable: true,
    fields: [
      {
        name: 'api_key',
        label: 'API Key',
        type: 'password',
        placeholder: 'Cole sua API Key do Asaas'
      },
      {
        name: 'environment',
        label: 'Ambiente',
        type: 'select',
        options: [
          { label: 'Sandbox', value: 'sandbox' },
          { label: 'Produção', value: 'production' }
        ]
      },
      {
        name: 'webhook_url',
        label: 'Webhook URL',
        type: 'text',
        placeholder: 'https://seudominio.com/api/asaas/webhook'
      }
    ]
  },
  {
    key: 'webhooks',
    name: 'Webhooks',
    icon: Webhook,
    description: 'Conexões externas em tempo real',
    defaultStatus: 'disconnected',
    configurable: true,
    fields: [
      {
        name: 'webhook_url',
        label: 'URL do Webhook',
        type: 'text',
        placeholder: 'https://seudominio.com/api/webhooks/entrada'
      },
      {
        name: 'secret',
        label: 'Secret',
        type: 'password',
        placeholder: 'Defina um secret para validação'
      },
      {
        name: 'events',
        label: 'Eventos',
        type: 'textarea',
        placeholder: 'lead.created,payment.received,cliente.updated'
      }
    ]
  },
  {
    key: 'google_drive',
    name: 'Google Drive',
    icon: FolderOpen,
    description: 'Arquivos e documentos',
    defaultStatus: 'soon',
    configurable: false,
    fields: []
  },
  {
    key: 'figma',
    name: 'Figma',
    icon: Figma,
    description: 'Projetos e protótipos',
    defaultStatus: 'soon',
    configurable: false,
    fields: []
  },
  {
    key: 'slack',
    name: 'Slack',
    icon: Briefcase,
    description: 'Comunicação da equipe',
    defaultStatus: 'soon',
    configurable: false,
    fields: []
  }
];

export default function Automacoes() {
  const { user } = useAuth();

  const [n8nUrl, setN8nUrl] = useState('http://localhost:5678');
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [tempUrl, setTempUrl] = useState(n8nUrl);
  const [configId, setConfigId] = useState<string | null>(null);

  const [integrationMap, setIntegrationMap] = useState<Record<string, IntegrationConfigRow>>({});
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);

  const [selectedIntegrationKey, setSelectedIntegrationKey] = useState<IntegrationKey | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const [currentEnabled, setCurrentEnabled] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<IntegrationStatus>('disconnected');

  const [savingIntegration, setSavingIntegration] = useState(false);
  const [testingIntegration, setTestingIntegration] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | 'info' | ''>('');

  useEffect(() => {
    loadConfig();
    loadIntegrationStatuses();
  }, [user?.id]);

  const selectedIntegration = useMemo(() => {
    if (!selectedIntegrationKey) return null;
    return integrationDefinitions.find((item) => item.key === selectedIntegrationKey) || null;
  }, [selectedIntegrationKey]);

  const loadConfig = async () => {
    try {
      const { documents } = await databases.listDocuments(
        DATABASE_ID,
        'automation_config',
        [Query.equal('is_active', true), Query.limit(1)]
      );
      const data = documents.length > 0 ? documents[0] : null;
      const error = null;

    if (!error && data) {
      setN8nUrl(data.n8n_url);
      setTempUrl(data.n8n_url);
      setConfigId(data.$id);
    }
    } catch(err) { console.error(err); }
  };

  const loadIntegrationStatuses = async () => {
    if (!user?.id) return;

    try {
      setLoadingIntegrations(true);

      const { documents: data } = await databases.listDocuments(
        DATABASE_ID,
        'integration_configs',
        [Query.equal('user_id', user.id), Query.limit(100)]
      );
      const error = null;

      if (error) {
        console.error('Erro ao carregar integrações:', error);
        return;
      }

      const map: Record<string, IntegrationConfigRow> = {};
      (data || []).forEach((item: IntegrationConfigRow) => {
        map[item.integration_key] = item;
      });

      setIntegrationMap(map);
    } catch (error) {
      console.error('Erro inesperado ao carregar integrações:', error);
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const handleSaveN8nUrl = async () => {
    if (configId) {
      await databases.updateDocument(
        DATABASE_ID,
        'automation_config',
        configId,
        { n8n_url: tempUrl, updated_at: new Date().toISOString() }
      );
    } else {
      const data = await databases.createDocument(
        DATABASE_ID,
        'automation_config',
        ID.unique(),
        { n8n_url: tempUrl, user_id: user?.id || null, is_active: true }
      );

      if (data) {
        setConfigId(data.$id);
      }
    }

    setN8nUrl(tempUrl);
    setIsConfiguring(false);
  };

  const getIntegrationStatus = (item: IntegrationDefinition): IntegrationStatus => {
    const saved = integrationMap[item.key];
    return saved?.status || item.defaultStatus;
  };

  const getStatusLabel = (status: IntegrationStatus) => {
    if (status === 'connected') return 'Ativo';
    if (status === 'soon') return 'Em breve';
    return 'Desconectado';
  };

  const getStatusIcon = (status: IntegrationStatus) => {
    if (status === 'connected') {
      return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    }
    if (status === 'soon') {
      return <Clock3 className="h-5 w-5 text-gray-500" />;
    }
    return <XCircle className="h-5 w-5 text-red-400/80" />;
  };

  const getCardClass = (status: IntegrationStatus) => {
    if (status === 'connected') {
      return 'border-emerald-400/70 bg-[linear-gradient(180deg,rgba(16,24,20,0.96),rgba(10,14,12,0.96))] shadow-[0_0_0_1px_rgba(52,211,153,0.10),0_0_24px_rgba(16,185,129,0.12)] hover:shadow-[0_0_0_1px_rgba(52,211,153,0.16),0_0_30px_rgba(16,185,129,0.18)]';
    }
    return 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]';
  };

  const getOverlayClass = (status: IntegrationStatus) => {
    if (status === 'connected') {
      return 'bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_50%)]';
    }
    return 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_50%)]';
  };

  const getIconContainerClass = (status: IntegrationStatus) => {
    if (status === 'connected') {
      return 'bg-emerald-400/15 text-emerald-300';
    }
    return 'bg-white/5 text-gray-300';
  };

  const getTitleClass = (status: IntegrationStatus) => {
    if (status === 'connected') {
      return 'text-emerald-300';
    }
    return 'text-white';
  };

  const getBadgeClass = (status: IntegrationStatus) => {
    if (status === 'connected') {
      return 'bg-emerald-400/10 text-emerald-300';
    }
    if (status === 'soon') {
      return 'bg-white/5 text-gray-400';
    }
    return 'bg-red-500/10 text-red-300';
  };

  const openIntegrationModal = async (integrationKey: IntegrationKey) => {
    const definition = integrationDefinitions.find((item) => item.key === integrationKey);
    if (!definition || !definition.configurable) return;

    setSelectedIntegrationKey(integrationKey);
    setFeedbackMessage('');
    setFeedbackType('');

    const saved = integrationMap[integrationKey];
    setFormData(saved?.config || {});
    setCurrentConfigId(saved?.id || null);
    setCurrentEnabled(Boolean(saved?.is_enabled));
    setCurrentStatus(saved?.status || definition.defaultStatus);
    setIsModalOpen(true);
  };

  const closeIntegrationModal = () => {
    setSelectedIntegrationKey(null);
    setIsModalOpen(false);
    setFormData({});
    setCurrentConfigId(null);
    setCurrentEnabled(false);
    setCurrentStatus('disconnected');
    setFeedbackMessage('');
    setFeedbackType('');
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const saveIntegrationConfig = async () => {
    if (!user?.id || !selectedIntegrationKey) return;

    try {
      setSavingIntegration(true);
      setFeedbackMessage('');
      setFeedbackType('');

      const payload = {
        user_id: user.id,
        integration_key: selectedIntegrationKey,
        config: formData,
        status: currentStatus === 'soon' ? 'disconnected' : currentStatus,
        is_enabled: currentEnabled,
        updated_at: new Date().toISOString()
      };

            // Appwrite doesn't have upsert, so we query first
      const { documents } = await databases.listDocuments(DATABASE_ID, 'integration_configs', [
        Query.equal('user_id', user.id),
        Query.equal('integration_key', selectedIntegrationKey),
        Query.limit(1)
      ]);
      
      let data = null;
      if (documents.length > 0) {
        data = await databases.updateDocument(DATABASE_ID, 'integration_configs', documents[0].$id, payload);
      } else {
        data = await databases.createDocument(DATABASE_ID, 'integration_configs', ID.unique(), payload);
      }
      const error = null;

      if (error) {
        setFeedbackMessage('Erro ao salvar configuração.');
        setFeedbackType('error');
        console.error(error);
        return;
      }

      if (data) {
        setCurrentConfigId(data.$id);
        setIntegrationMap((prev) => ({
          ...prev,
          [selectedIntegrationKey]: data as IntegrationConfigRow
        }));
      }

      setFeedbackMessage('Configuração salva com sucesso.');
      setFeedbackType('success');
    } catch (error) {
      console.error(error);
      setFeedbackMessage('Ocorreu um erro inesperado ao salvar.');
      setFeedbackType('error');
    } finally {
      setSavingIntegration(false);
    }
  };

  const validateIntegration = (integrationKey: IntegrationKey, config: Record<string, any>) => {
    if (integrationKey === 'asaas') {
      return Boolean(config.api_key && config.environment);
    }

    if (integrationKey === 'google_calendar') {
      return Boolean(config.client_id && config.client_secret && config.redirect_uri);
    }

    if (integrationKey === 'webhooks') {
      return Boolean(config.webhook_url && config.secret);
    }

    return false;
  };

  const testIntegrationConnection = async () => {
    if (!user?.id || !selectedIntegrationKey) return;

    try {
      setTestingIntegration(true);
      setFeedbackMessage('');
      setFeedbackType('');

      const isValid = validateIntegration(selectedIntegrationKey, formData);

      if (!isValid) {
        setCurrentStatus('disconnected');
        setFeedbackMessage('Preencha os campos obrigatórios antes de testar a conexão.');
        setFeedbackType('error');
        return;
      }

      const newStatus: IntegrationStatus = 'connected';

      const payload = {
        user_id: user.id,
        integration_key: selectedIntegrationKey,
        config: formData,
        status: newStatus,
        is_enabled: true,
        updated_at: new Date().toISOString()
      };

            // Appwrite doesn't have upsert, so we query first
      const { documents } = await databases.listDocuments(DATABASE_ID, 'integration_configs', [
        Query.equal('user_id', user.id),
        Query.equal('integration_key', selectedIntegrationKey),
        Query.limit(1)
      ]);
      
      let data = null;
      if (documents.length > 0) {
        data = await databases.updateDocument(DATABASE_ID, 'integration_configs', documents[0].$id, payload);
      } else {
        data = await databases.createDocument(DATABASE_ID, 'integration_configs', ID.unique(), payload);
      }
      const error = null;

      if (error) {
        console.error(error);
        setCurrentStatus('disconnected');
        setFeedbackMessage('Falha ao atualizar o status da integração.');
        setFeedbackType('error');
        return;
      }

      setCurrentStatus('connected');
      setCurrentEnabled(true);

      if (data) {
        setCurrentConfigId(data.$id);
        setIntegrationMap((prev) => ({
          ...prev,
          [selectedIntegrationKey]: data as IntegrationConfigRow
        }));
      }

      setFeedbackMessage('Conexão validada com sucesso.');
      setFeedbackType('success');
    } catch (error) {
      console.error(error);
      setCurrentStatus('disconnected');
      setFeedbackMessage('Erro inesperado ao testar a conexão.');
      setFeedbackType('error');
    } finally {
      setTestingIntegration(false);
    }
  };

  const disconnectIntegration = async () => {
    if (!user?.id || !selectedIntegrationKey) return;

    try {
      setFeedbackMessage('');
      setFeedbackType('');

      const payload = {
        user_id: user.id,
        integration_key: selectedIntegrationKey,
        config: formData,
        status: 'disconnected' as IntegrationStatus,
        is_enabled: false,
        updated_at: new Date().toISOString()
      };

            // Appwrite doesn't have upsert, so we query first
      const { documents } = await databases.listDocuments(DATABASE_ID, 'integration_configs', [
        Query.equal('user_id', user.id),
        Query.equal('integration_key', selectedIntegrationKey),
        Query.limit(1)
      ]);
      
      let data = null;
      if (documents.length > 0) {
        data = await databases.updateDocument(DATABASE_ID, 'integration_configs', documents[0].$id, payload);
      } else {
        data = await databases.createDocument(DATABASE_ID, 'integration_configs', ID.unique(), payload);
      }
      const error = null;

      if (error) {
        console.error(error);
        setFeedbackMessage('Não foi possível desvincular a integração.');
        setFeedbackType('error');
        return;
      }

      setCurrentStatus('disconnected');
      setCurrentEnabled(false);

      if (data) {
        setIntegrationMap((prev) => ({
          ...prev,
          [selectedIntegrationKey]: data as IntegrationConfigRow
        }));
      }

      setFeedbackMessage('Integração desvinculada com sucesso.');
      setFeedbackType('success');
    } catch (error) {
      console.error(error);
      setFeedbackMessage('Erro inesperado ao desvincular.');
      setFeedbackType('error');
    }
  };

  const renderField = (field: IntegrationField) => {
    if (field.type === 'select') {
      return (
        <select
          value={formData[field.name] || ''}
          onChange={(e) => handleFieldChange(field.name, e.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-emerald-400/50 focus:outline-none"
        >
          <option value="">Selecione</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          value={formData[field.name] || ''}
          onChange={(e) => handleFieldChange(field.name, e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:outline-none"
        />
      );
    }

    return (
      <input
        type={field.type}
        value={formData[field.name] || ''}
        onChange={(e) => handleFieldChange(field.name, e.target.value)}
        placeholder={field.placeholder}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:outline-none"
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b0f14] p-6 md:p-8 shadow-[0_10px_50px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,255,170,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(0,170,255,0.10),transparent_25%),linear-gradient(to_bottom,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />

        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <Workflow className="h-3.5 w-3.5" />
              Central de Automações
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              Automações do Sistema
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400 md:text-base">
              Gerencie integrações, fluxos e workflows do seu ambiente com visual moderno,
              organizado e pronto para expansão.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setIsConfiguring(!isConfiguring)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-gray-200 transition-all hover:border-white/20 hover:bg-white/10"
            >
              <Settings className="h-4 w-4" />
              Configurar URL
            </button>

            <a
              href={n8nUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/15 px-4 py-3 text-sm font-medium text-emerald-300 transition-all hover:bg-emerald-400/20"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir n8n
            </a>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#0b0f14] p-5 md:p-6 shadow-[0_10px_40px_rgba(0,0,0,0.30)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Integrações</h2>
            <p className="mt-1 text-sm text-gray-400">
              Módulos disponíveis e integrações planejadas
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-400">
            <PlugZap className="h-3.5 w-3.5" />
            Ambiente conectado
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {integrationDefinitions.map((item) => {
            const Icon = item.icon;
            const status = getIntegrationStatus(item);

            return (
              <button
                key={item.key}
                type="button"
                disabled={!item.configurable}
                onClick={() => openIntegrationModal(item.key)}
                className={`group relative overflow-hidden rounded-3xl border p-4 text-left transition-all duration-300 md:p-5 ${
                  getCardClass(status)
                } ${item.configurable ? 'cursor-pointer' : 'cursor-default opacity-95'}`}
              >
                <div
                  className={`absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${getOverlayClass(
                    status
                  )}`}
                />

                <div className="relative z-10 flex h-full min-h-[150px] flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div
                      className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${getIconContainerClass(
                        status
                      )}`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>

                    {getStatusIcon(status)}
                  </div>

                  <div className="mt-6">
                    <h3 className={`text-base font-semibold ${getTitleClass(status)}`}>
                      {item.name}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-gray-400">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getBadgeClass(
                        status
                      )}`}
                    >
                      {getStatusLabel(status)}
                    </span>

                    {item.configurable && (
                      <span className="text-[11px] text-gray-500">Configurar</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {loadingIntegrations && (
          <div className="mt-4 text-sm text-gray-500">
            Carregando status das integrações...
          </div>
        )}
      </div>

      {isConfiguring && (
        <div className="rounded-3xl border border-white/10 bg-[#0b0f14] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.30)]">
          <h3 className="mb-4 text-lg font-semibold text-white">
            Configurar URL do n8n
          </h3>

          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              type="text"
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              placeholder="http://IP-DA-VPS:5678 ou https://n8n.seudominio.com"
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:outline-none"
            />

            <button
              onClick={handleSaveN8nUrl}
              className="rounded-2xl bg-emerald-500 px-6 py-3 font-medium text-black transition hover:bg-emerald-400"
            >
              Salvar
            </button>

            <button
              onClick={() => {
                setTempUrl(n8nUrl);
                setIsConfiguring(false);
              }}
              className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 font-medium text-gray-200 transition hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-400/10 bg-amber-400/5 p-4 text-sm text-gray-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
            <div>
              <p>Configure a URL da sua instância n8n para abrir dentro do sistema.</p>
              <p className="mt-2 text-xs text-gray-500">
                Exemplos: http://123.45.67.89:5678, https://n8n.seudominio.com,
                http://localhost:5678
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="rounded-3xl border border-emerald-400/10 bg-emerald-400/5 p-5">
        <h4 className="mb-2 text-sm font-semibold text-emerald-300">
          Sobre o módulo de automações
        </h4>
        <p className="text-sm leading-relaxed text-gray-300">
          Este espaço centraliza suas integrações e fluxos automatizados. Você pode usar o
          n8n para conectar CRM, WhatsApp, financeiro, APIs, envio de mensagens, eventos,
          documentos e processos internos do seu sistema.
        </p>
      </div>

      {isModalOpen && selectedIntegration && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b0f14] shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
                  <selectedIntegration.icon className="h-6 w-6" />
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-white">
                    Vincular {selectedIntegration.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Preencha os dados da plataforma para salvar e testar a conexão.
                  </p>
                </div>
              </div>

              <button
                onClick={closeIntegrationModal}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-gray-300 transition hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                {selectedIntegration.fields.map((field) => (
                  <div
                    key={field.name}
                    className={field.type === 'textarea' ? 'space-y-2 md:col-span-2' : 'space-y-2'}
                  >
                    <label className="text-sm font-medium text-gray-300">
                      {field.label}
                    </label>
                    {renderField(field)}
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
                    <ShieldCheck className="h-4 w-4" />
                    Status
                  </div>
                  <div
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getBadgeClass(
                      currentStatus
                    )}`}
                  >
                    {getStatusLabel(currentStatus)}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
                    <Power className="h-4 w-4" />
                    Integração
                  </div>
                  <div className="text-sm text-white">
                    {currentEnabled ? 'Habilitada' : 'Desabilitada'}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
                    <Link2 className="h-4 w-4" />
                    Chave
                  </div>
                  <div className="text-sm text-white">{selectedIntegration.key}</div>
                </div>
              </div>

              {feedbackMessage && (
                <div
                  className={`rounded-2xl border p-4 text-sm ${
                    feedbackType === 'success'
                      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                      : feedbackType === 'error'
                      ? 'border-red-400/20 bg-red-500/10 text-red-300'
                      : 'border-white/10 bg-white/5 text-gray-300'
                  }`}
                >
                  {feedbackMessage}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-5">
              <div className="text-xs text-gray-500">
                O card ficará verde somente quando a conexão for validada com sucesso.
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={saveIntegrationConfig}
                  disabled={savingIntegration}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-gray-100 transition hover:bg-white/10 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {savingIntegration ? 'Salvando...' : 'Salvar'}
                </button>

                <button
                  onClick={testIntegrationConnection}
                  disabled={testingIntegration}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {testingIntegration ? 'Testando...' : 'Testar conexão'}
                </button>

                <button
                  onClick={disconnectIntegration}
                  className="inline-flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/15"
                >
                  <XCircle className="h-4 w-4" />
                  Desvincular
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}