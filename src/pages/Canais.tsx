import { useState, useEffect } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneOff,
  MessageCircle,
  Clock,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Delete,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  History,
} from 'lucide-react';
import { databases } from '../lib/appwrite';
import { Query } from 'appwrite';
import { sipClient } from '../lib/sipClient';
import { useAuth } from '../context/AuthContext';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';

interface CanaisProps {
  onStartCall: (contactName: string, phoneNumber?: string) => void;
  onNavigate: (page: string) => void;
}

interface RecentCall {
  id: string;
  contact_name: string;
  phone_number: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration: number;
  started_at: string;
}

export default function Canais({ onStartCall, onNavigate }: CanaisProps) {
  const { user } = useAuth();
  const [dialNumber, setDialNumber] = useState('');
  const [sipStatus, setSipStatus] = useState<'online' | 'offline' | 'connecting'>('offline');
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [activeTab, setActiveTab] = useState<'dialer' | 'history'>('dialer');

  useEffect(() => {
    checkSipStatus();
    loadRecentCalls();
  }, []);

  const checkSipStatus = () => {
    if (sipClient.isConnected()) {
      setSipStatus('online');
    } else {
      setSipStatus('offline');
    }
  };

  const loadRecentCalls = async () => {
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, 'call_history', [
        Query.orderDesc('started_at'),
        Query.limit(20)
      ]);
      setRecentCalls(documents.map(d => ({ ...d, id: d.$id } as unknown as RecentCall)));
    } catch (error) {
      console.error('Error loading calls:', error);
    }
  };

  const handleConnectSip = async () => {
    setSipStatus('connecting');
    const success = await sipClient.initialize();
    setSipStatus(success ? 'online' : 'offline');
  };

  const handleDial = () => {
    if (!dialNumber.trim()) return;
    onStartCall(dialNumber, dialNumber);
    setDialNumber('');
  };

  const handleKeypadPress = (key: string) => {
    setDialNumber((prev) => prev + key);
  };

  const handleKeypadDelete = () => {
    setDialNumber((prev) => prev.slice(0, -1));
  };

  const handleCallFromHistory = (call: RecentCall) => {
    onStartCall(call.contact_name || call.phone_number, call.phone_number);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);

    if (hours < 1) return 'Agora';
    if (hours < 24) return `${hours}h atras`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const keypadButtons = [
    { key: '1', sub: '' },
    { key: '2', sub: 'ABC' },
    { key: '3', sub: 'DEF' },
    { key: '4', sub: 'GHI' },
    { key: '5', sub: 'JKL' },
    { key: '6', sub: 'MNO' },
    { key: '7', sub: 'PQRS' },
    { key: '8', sub: 'TUV' },
    { key: '9', sub: 'WXYZ' },
    { key: '*', sub: '' },
    { key: '0', sub: '+' },
    { key: '#', sub: '' },
  ];

  const statusConfig = {
    online: { label: 'Conectado', color: 'bg-green-500', textColor: 'text-green-400' },
    offline: { label: 'Desconectado', color: 'bg-gray-500', textColor: 'text-gray-400' },
    connecting: { label: 'Conectando...', color: 'bg-yellow-500', textColor: 'text-yellow-400' },
  };

  return (
    <div className="p-6 space-y-6 relative min-h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Canais de Atendimento</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gerencie seus canais de comunicacao</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
            sipStatus === 'online'
              ? 'border-green-500/30 bg-green-500/10'
              : sipStatus === 'connecting'
              ? 'border-yellow-500/30 bg-yellow-500/10'
              : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800'
          }`}>
            <div className={`w-2 h-2 rounded-full ${statusConfig[sipStatus].color} ${sipStatus === 'connecting' ? 'animate-pulse' : ''}`} />
            <span className={`text-sm font-medium ${statusConfig[sipStatus].textColor}`}>
              SIP: {statusConfig[sipStatus].label}
            </span>
          </div>
          {sipStatus === 'offline' && (
            <button
              onClick={handleConnectSip}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Conectar SIP
            </button>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Phone Dialer Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-[#121824] rounded-2xl shadow-xs border border-slate-200/80 dark:border-white/[0.08] overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02]">
              <button
                onClick={() => setActiveTab('dialer')}
                className={`flex-1 py-3 px-4 text-xs font-bold uppercase tracking-wider transition-colors relative flex items-center justify-center gap-2 ${
                  activeTab === 'dialer'
                    ? 'text-blue-600 dark:text-blue-400 bg-white dark:bg-[#121824]'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                Discador
                {activeTab === 'dialer' && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-3 px-4 text-xs font-bold uppercase tracking-wider transition-colors relative flex items-center justify-center gap-2 ${
                  activeTab === 'history'
                    ? 'text-blue-600 dark:text-blue-400 bg-white dark:bg-[#121824]'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Recentes
                {activeTab === 'history' && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
                )}
              </button>
            </div>

            {activeTab === 'dialer' ? (
              <div className="p-5">
                {/* Number Display */}
                <div className="mb-4">
                  <div className="relative">
                    <input
                      type="tel"
                      value={dialNumber}
                      onChange={(e) => setDialNumber(e.target.value)}
                      placeholder="Digite o numero"
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-center text-xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    {dialNumber && (
                      <button
                        onClick={handleKeypadDelete}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        <Delete className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {keypadButtons.map((btn) => (
                    <button
                      key={btn.key}
                      onClick={() => handleKeypadPress(btn.key)}
                      className="h-14 rounded-xl bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 active:scale-95 transition-all duration-150 flex flex-col items-center justify-center group"
                    >
                      <span className="text-lg font-semibold text-gray-900 dark:text-white group-hover:scale-110 transition-transform">
                        {btn.key}
                      </span>
                      {btn.sub && (
                        <span className="text-[9px] text-gray-400 font-medium -mt-0.5">
                          {btn.sub}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Call Button */}
                <button
                  onClick={handleDial}
                  disabled={!dialNumber.trim() || sipStatus !== 'online'}
                  className="w-full py-3.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-base font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  <Phone className="w-5 h-5" />
                  Ligar
                </button>

                {sipStatus !== 'online' && (
                  <p className="text-xs text-center text-amber-500 mt-2">
                    Conecte o SIP para realizar chamadas
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 max-h-[500px] overflow-y-auto">
                {recentCalls.length === 0 ? (
                  <div className="py-12 text-center">
                    <Clock className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">Nenhuma chamada recente</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {recentCalls.map((call) => (
                      <button
                        key={call.id}
                        onClick={() => handleCallFromHistory(call)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left group"
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                          call.direction === 'inbound'
                            ? 'bg-blue-100 dark:bg-blue-900/30'
                            : 'bg-green-100 dark:bg-green-900/30'
                        }`}>
                          {call.direction === 'inbound' ? (
                            <ArrowDownLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-green-600 dark:text-green-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {call.contact_name || call.phone_number || 'Desconhecido'}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {call.phone_number} - {formatDuration(call.duration || 0)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] text-gray-400">{formatTime(call.started_at)}</span>
                          <Phone className="w-3.5 h-3.5 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Channel Cards */}
        <div className="lg:col-span-2 space-y-5">
          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Chamadas Hoje</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {recentCalls.filter(c => {
                  const today = new Date();
                  const callDate = new Date(c.started_at);
                  return callDate.toDateString() === today.toDateString();
                }).length}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">WhatsApp</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">Ativo</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                  <PhoneCall className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">SIP Voice</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {sipStatus === 'online' ? 'Ativo' : 'Inativo'}
              </p>
            </div>
          </div>

          {/* Channel Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SIP Voice Card */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 border border-gray-700 relative overflow-hidden group hover:shadow-xl hover:shadow-gray-900/20 transition-all duration-300">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-4">
                  <Phone className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Telefonia SIP</h3>
                <p className="text-sm text-gray-400 mb-4">Realize e receba chamadas diretamente pelo navegador</p>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${sipStatus === 'online' ? 'bg-green-500' : 'bg-gray-500'}`} />
                  <span className={`text-xs font-medium ${sipStatus === 'online' ? 'text-green-400' : 'text-gray-500'}`}>
                    {sipStatus === 'online' ? 'Pronto para uso' : 'Desconectado'}
                  </span>
                </div>
              </div>
            </div>

            {/* WhatsApp Card */}
            <button
              onClick={() => onNavigate('conversas')}
              className="bg-gradient-to-br from-[#075E54] to-[#128C7E] rounded-2xl p-6 border border-green-700/30 relative overflow-hidden group hover:shadow-xl hover:shadow-green-900/20 transition-all duration-300 text-left"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">WhatsApp</h3>
                <p className="text-sm text-white/70 mb-4">Atenda seus clientes via WhatsApp integrado</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-300" />
                  <span className="text-xs font-medium text-green-200">Canal ativo</span>
                </div>
              </div>
            </button>

            {/* DS Voice History Card */}
            <button
              onClick={() => onNavigate('dsvoice')}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all duration-300 text-left"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                  <History className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Historico de Chamadas</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Veja todo o historico detalhado de chamadas</p>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 group-hover:underline">
                  Ver historico completo →
                </span>
              </div>
            </button>

            {/* Contacts Card */}
            <button
              onClick={() => onNavigate('crm-contatos')}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all duration-300 text-left"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Contatos</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Acesse sua base de contatos para ligar ou enviar mensagens</p>
                <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400 group-hover:underline">
                  Ver contatos →
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Floating WhatsApp Button */}
      <button
        onClick={() => onNavigate('conversas')}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#25D366] hover:bg-[#20BD5A] rounded-full shadow-lg shadow-green-500/30 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 z-40 group"
        title="Abrir WhatsApp"
      >
        <MessageCircle className="w-6 h-6 text-white" />
        <div className="absolute -top-10 right-0 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Abrir WhatsApp
        </div>
      </button>
    </div>
  );
}
