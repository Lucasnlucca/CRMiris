import { useEffect, useState } from 'react';
import { Plus, TrendingUp, Users, DollarSign } from 'lucide-react';
import { databases } from '../lib/appwrite';
import { Query } from 'appwrite';
import { Campaign } from '../types';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
const COLLECTION_ID = 'campaigns';

export default function Campanha() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    try {
      const { documents } = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [Query.orderDesc('created_at'), Query.limit(100)]
      );
      if (documents) {
        const mapped = documents.map(d => ({
          ...d,
          id: d.$id,
          created_at: d.$createdAt,
        })) as unknown as Campaign[];
        setCampaigns(mapped);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Campanhas</h2>
        <button className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm transition-all flex items-center gap-2 text-sm font-medium">
          <Plus className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-gray-200 dark:border-white/[0.08] shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center mb-3">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Campanhas Ativas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{campaigns.length}</p>
        </div>
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-gray-200 dark:border-white/[0.08] shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total de Conversões</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {campaigns.reduce((sum, c) => sum + c.conversions, 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-gray-200 dark:border-white/[0.08] shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center mb-3">
            <DollarSign className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Orçamento Total</p>
          <p className="text-2xl font-bold font-mono text-gray-900 dark:text-white">
            R$ {campaigns.reduce((sum, c) => sum + c.budget, 0).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="bg-white dark:bg-[#121824] rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-white/[0.08] hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{campaign.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(campaign.start_date).toLocaleDateString('pt-BR')} -{' '}
                  {new Date(campaign.end_date).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium">
                Ativa
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 dark:bg-[#0d1117] border border-gray-100 dark:border-white/[0.04] rounded-xl p-3.5">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Mensagens Enviadas</p>
                <p className="text-xl font-bold font-mono text-gray-900 dark:text-white">{campaign.messages_sent}</p>
              </div>
              <div className="bg-gray-50 dark:bg-[#0d1117] border border-gray-100 dark:border-white/[0.04] rounded-xl p-3.5">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Taxa de Resposta</p>
                <p className="text-xl font-bold font-mono text-gray-900 dark:text-white">{campaign.response_rate}%</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-white/[0.06]">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Conversões</p>
                <p className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{campaign.conversions}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">Orçamento</p>
                <p className="text-lg font-bold font-mono text-gray-900 dark:text-white">
                  R$ {campaign.budget.toLocaleString('pt-BR')}
                </p>
              </div>
            </div>

            <button className="w-full mt-4 px-4 py-2 border border-indigo-600/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors text-xs font-semibold">
              Ver Detalhes
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
