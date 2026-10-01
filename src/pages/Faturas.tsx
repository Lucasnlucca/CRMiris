import { useEffect, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { databases } from '../lib/appwrite';
import { Query } from 'appwrite';
import { Invoice } from '../types';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
const COLLECTION_ID = 'invoices';

export default function Faturas() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    try {
      const { documents } = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [Query.orderDesc('date'), Query.limit(100)]
      );
      if (documents) {
        const mapped = documents.map(d => ({
          ...d,
          id: d.$id,
          created_at: d.$createdAt,
        })) as unknown as Invoice[];
        setInvoices(mapped);
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    }
  }

  const totalPaid = invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + inv.amount, 0);
  const totalPending = invoices.filter((inv) => inv.status === 'pending').reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Faturas</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-gray-200 dark:border-white/[0.08] shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total de Faturas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{invoices.length}</p>
        </div>
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-gray-200 dark:border-white/[0.08] shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Faturas Pagas</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white dark:bg-[#121824] rounded-2xl p-5 border border-gray-200 dark:border-white/[0.08] shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Faturas Pendentes</p>
          <p className="text-2xl font-bold text-amber-500 dark:text-amber-400 font-mono">
            R$ {totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#121824] rounded-2xl shadow-sm border border-gray-200 dark:border-white/[0.08]">
        <div className="p-5 border-b border-gray-200 dark:border-white/[0.08]">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Lista de Faturas</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/[0.08]">
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nº Fatura</th>
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data</th>
                <th className="text-right py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valor</th>
                <th className="text-left py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-center py-3.5 px-6 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-gray-100 dark:border-white/[0.04] hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="py-3.5 px-6 text-sm font-medium text-gray-900 dark:text-white">{invoice.invoice_number}</td>
                  <td className="py-3.5 px-6 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(invoice.date).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-3.5 px-6 text-sm text-right font-medium font-mono text-gray-900 dark:text-white">
                    R$ {invoice.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-6">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        invoice.status === 'paid'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {invoice.status === 'paid' ? 'Pago' : 'Em aberto'}
                    </span>
                  </td>
                  <td className="py-3.5 px-6">
                    <div className="flex items-center justify-center gap-2">
                      <button className="p-2 bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-lg shadow-sm transition-all">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
