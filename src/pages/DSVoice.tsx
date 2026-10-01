import { useEffect, useState } from 'react';
import { Phone, PhoneOff, Mic, Clock } from 'lucide-react';
import { databases } from '../lib/appwrite';
import { Query } from 'appwrite';
import { Call } from '../types';
import { useAuth } from '../context/AuthContext';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';

export default function DSVoice() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<Call[]>([]);
  const [sipStatus, setSipStatus] = useState<'online' | 'offline' | 'error'>('online');
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    loadCalls();

    const pollInterval = setInterval(() => {
      loadCalls();
    }, 10000);

    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(timer);
    };
  }, []);

  async function loadCalls() {
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, 'call_history', [
        Query.orderDesc('created_at'),
        Query.limit(100)
      ]);
      setCalls(documents.map(d => ({ ...d, id: d.$id } as unknown as Call)));
    } catch (error) {
      console.error('Error loading calls:', error);
      setSipStatus('error');
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCallDuration = (call: Call): number => {
    if (call.status === 'answered' && !call.ended_at) {
      const startTime = new Date(call.started_at).getTime();
      return Math.floor((currentTime - startTime) / 1000);
    }
    return call.duration || 0;
  };

  const statusColors = {
    online: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    offline: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const callStatusColors = {
    ringing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    answered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    ended: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
    missed: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const callStatusLabels = {
    ringing: 'Tocando',
    answered: 'Em Atendimento',
    ended: 'Encerrada',
    missed: 'Não Atendida',
    failed: 'Falhou',
  };

  const activeCalls = calls.filter(c => c.status === 'ringing' || c.status === 'answered');
  const totalDuration = calls
    .filter(c => c.status === 'ended')
    .reduce((sum, c) => sum + (c.duration || 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">DS Voice</h2>
        <div
          className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${statusColors[sipStatus]}`}
        >
          <span className="w-2 h-2 rounded-full bg-current"></span>
          Status SIP: {sipStatus === 'online' ? 'Online' : sipStatus === 'offline' ? 'Offline' : 'Erro'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-gray-200 dark:border-white/[0.08] shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
            <Phone className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Chamadas Ativas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeCalls.length}</p>
        </div>
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-gray-200 dark:border-white/[0.08] shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center mb-3">
            <Phone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total de Chamadas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{calls.length}</p>
        </div>
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-gray-200 dark:border-white/[0.08] shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center mb-3">
            <Clock className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tempo Total</p>
          <p className="text-2xl font-bold font-mono text-gray-900 dark:text-white">{formatDuration(totalDuration)}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#121824] rounded-2xl shadow-sm border border-gray-200 dark:border-white/[0.08]">
        <div className="p-5 border-b border-gray-200 dark:border-white/[0.08]">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Histórico de Chamadas</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/[0.08]">
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contato</th>
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Número</th>
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</th>
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Direção</th>
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Duração</th>
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                    Nenhuma chamada registrada
                  </td>
                </tr>
              ) : (
                calls.map((call) => {
                  const duration = getCallDuration(call);
                  const isActive = call.status === 'ringing' || call.status === 'answered';

                  return (
                    <tr key={call.id} className="border-b border-gray-100 dark:border-white/[0.04] hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-semibold text-xs shadow-sm">
                            {(call.caller?.name || 'Desconhecido').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{call.caller?.name || 'Desconhecido'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400">
                        {call.phone_number || '-'}
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                          {call.contact_type === 'internal' ? 'Interno' : call.contact_type === 'whatsapp' ? 'WhatsApp' : 'Externo'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                          call.direction === 'inbound'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        }`}>
                          {call.direction === 'inbound' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400 font-mono">
                        {isActive && call.status === 'answered' ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <Clock className="w-3 h-3 animate-pulse" />
                            {formatDuration(duration)}
                          </span>
                        ) : (
                          formatDuration(duration)
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${callStatusColors[call.status]}`}>
                          {callStatusLabels[call.status]}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600 dark:text-gray-400">
                        {new Date(call.started_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
