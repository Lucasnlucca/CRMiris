import React, { useEffect, useState, useMemo } from 'react';
import { databases } from '../lib/appwrite';
import { Query } from 'appwrite';
import { Proposal, parseProposalTerms, getProposalNumber, ProposalLineItem } from './Propostas';
import { useAuth } from '../context/AuthContext';
import { downloadProposalDocx } from '../utils/proposalDocx';
import { FileText, Printer } from 'lucide-react';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
const COLLECTION_PROPOSALS = 'crm_proposals';
const COLLECTION_ITEMS = 'crm_proposal_items';

export default function ProposalPreview() {
  const { user } = useAuth();
  const isEmployee = Boolean(user);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportingDocx, setExportingDocx] = useState(false);

  const proposalId = window.location.pathname.split('/').pop() || '';
  const isPrint = window.location.search.includes('print=true');

  useEffect(() => {
    async function load() {
      if (!proposalId) {
        setError('ID da proposta não fornecido.');
        setLoading(false);
        return;
      }
      try {
        const p = await databases.getDocument(DATABASE_ID, COLLECTION_PROPOSALS, proposalId);
        setProposal({ ...p, id: p.$id } as unknown as Proposal);

        const { documents } = await databases.listDocuments(DATABASE_ID, COLLECTION_ITEMS, [
          Query.equal('proposal_id', proposalId),
          Query.orderAsc('position')
        ]);
        setItems(documents);
      } catch (err: any) {
        setError('Proposta não encontrada ou sem permissão.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [proposalId]);

  useEffect(() => {
    if (!loading && proposal && isPrint) {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [loading, proposal, isPrint]);

  const termsData = useMemo(() => {
    return proposal ? parseProposalTerms(proposal.content, proposal.notes) : { terms: [] };
  }, [proposal]);

  async function handleDownloadDocx() {
    if (!proposal || !isEmployee) return;
    try {
      setExportingDocx(true);
      const mappedItems: ProposalLineItem[] = items.map((r: any, idx: number) => ({
        _key: r.$id || String(idx),
        item_id: r.item_id,
        name: r.name || "",
        description: r.description || "",
        long_description: r.long_description || "",
        qty: Number(r.qty) || 1,
        rate: Number(r.rate) || 0,
        tax_rate: Number(r.tax_rate) || 0,
        amount: Number(r.amount) || 0,
        unit: "",
      }));
      await downloadProposalDocx(proposal, mappedItems, termsData);
    } catch (err) {
      console.error("Erro ao gerar DOCX:", err);
      alert("Não foi possível gerar o arquivo Word.");
    } finally {
      setExportingDocx(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Carregando proposta...</div>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0f17] text-white p-6">
        <div className="bg-[#121824] border border-red-500/20 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4 font-bold text-xl">!</div>
          <h2 className="text-xl font-bold mb-2">Proposta Indisponível</h2>
          <p className="text-slate-400 text-sm">{error || 'Não foi possível encontrar os dados desta proposta comercial.'}</p>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: proposal.currency || 'BRL' }).format(val || 0);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 py-10 px-4 print:p-0 print:bg-white print:text-black flex flex-col items-center">
      {/* Top Action Bar (hidden on print) */}
      <div className="w-full max-w-4xl mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-black text-white text-xs">
            IH
          </div>
          <span className="text-sm font-semibold tracking-wide text-slate-300">Iris Horizon • Documento Oficial</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Somente visível para Funcionários Autenticados */}
          {isEmployee && (
            <button
              onClick={handleDownloadDocx}
              disabled={exportingDocx}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Baixar Proposta em formato Word (.docx) - Acesso Exclusivo de Funcionário"
            >
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>{exportingDocx ? 'Gerando Word...' : 'Baixar Word (.docx)'}</span>
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Main Document Card */}
      <div className="w-full max-w-4xl bg-[#121824] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden print:bg-white print:border-none print:shadow-none print:rounded-none print:text-black">
        {/* Document Header */}
        <div className="p-8 sm:p-12 bg-gradient-to-br from-[#161d2d] to-[#0f1420] border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start gap-6 print:bg-slate-900 print:text-white" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}>
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-3 print:border-indigo-400 print:text-indigo-300">
              PROPOSTA COMERCIAL #{getProposalNumber(proposal)}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{proposal.subject}</h1>
            <p className="text-xs text-slate-400 mt-2">Emissão: {new Date((proposal.date || new Date().toISOString()) + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
          </div>

          <div className="sm:text-right bg-slate-900/60 border border-slate-800 p-4 rounded-2xl min-w-[200px] print:bg-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Validade da Proposta</span>
            <span className="text-base font-bold text-emerald-400 block mt-0.5 print:text-emerald-300">
              {proposal.open_until ? new Date(proposal.open_until + 'T00:00:00').toLocaleDateString('pt-BR') : 'Consulte condições'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-1">Status: {proposal.status?.toUpperCase() || 'EM ABERTO'}</span>
          </div>
        </div>

        {/* Client & Provider Info */}
        <div className="p-8 sm:p-12 grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-slate-800/80 print:border-gray-200">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 print:text-gray-500">Destinatário</span>
            <h3 className="text-lg font-bold text-white print:text-black">{proposal.to_name}</h3>
            {(proposal.address || proposal.city) && (
              <p className="text-xs text-slate-400 mt-1 print:text-gray-600">
                {proposal.address} {proposal.city ? `• ${proposal.city}` : ''} {proposal.state} {proposal.zip_code}
              </p>
            )}
            {proposal.email && <p className="text-xs text-slate-400 mt-1 print:text-gray-600">Email: {proposal.email}</p>}
            {proposal.phone && <p className="text-xs text-slate-400 mt-1 print:text-gray-600">Telefone: {proposal.phone}</p>}
          </div>

          <div className="sm:text-right">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 print:text-gray-500">Provedor da Solução</span>
            <h3 className="text-lg font-bold text-white print:text-black">Iris Horizon Enterprise</h3>
            <p className="text-xs text-slate-400 mt-1 print:text-gray-600">Soluções Corporativas em Telecom & Nuvem</p>
            <p className="text-xs text-slate-400 mt-1 print:text-gray-600">comercial@irishorizon.com.br</p>
          </div>
        </div>



        {/* Investment Items Table */}
        {items.length > 0 && (
          <div className="p-8 sm:p-12 border-b border-slate-800/80 print:border-gray-200">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 print:text-indigo-600 block mb-4">
              Especificação dos Serviços & Itens
            </span>
            <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-gray-300">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-xs font-extrabold uppercase tracking-wider text-slate-400 print:bg-gray-100 print:border-gray-300 print:text-gray-700">
                    <th className="py-3.5 px-4">Item / Descrição</th>
                    <th className="py-3.5 px-4 text-center">Qtd</th>
                    <th className="py-3.5 px-4 text-right">Valor Unitário</th>
                    <th className="py-3.5 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 print:divide-gray-200">
                  {items.map((item, i) => (
                    <tr key={item.$id || i} className="hover:bg-slate-800/20 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-extrabold text-white print:text-black text-base">{item.name}</div>
                        {item.description && <div className="text-xs text-slate-400 print:text-gray-600 mt-1">{item.description}</div>}
                        {item.long_description && <div className="text-[11px] text-slate-500 print:text-gray-500 mt-1 whitespace-pre-wrap leading-relaxed">{item.long_description}</div>}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-block font-mono text-sm font-black text-indigo-400 print:text-indigo-800 bg-indigo-950/40 print:bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-800/40 print:border-indigo-200">
                          {item.qty}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-sm font-bold text-slate-200 print:text-slate-800">
                        {formatCurrency(item.rate)}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-base font-black text-emerald-400 print:text-emerald-700">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Totals Summary */}
        <div className="p-8 sm:p-12 bg-slate-900/40 flex justify-end print:bg-gray-50" style={{ WebkitPrintColorAdjust: 'exact', colorAdjust: 'exact' }}>
          <div className="w-full max-w-xs space-y-3">
            <div className="flex justify-between text-xs text-slate-400 print:text-gray-600">
              <span>Subtotal:</span>
              <span className="font-mono text-white print:text-black font-medium">{formatCurrency(proposal.subtotal)}</span>
            </div>

            {proposal.discount_value > 0 && (
              <div className="flex justify-between text-xs text-rose-400 print:text-red-600 font-medium">
                <span>Desconto Aplicado:</span>
                <span className="font-mono">-{formatCurrency(proposal.discount_value)}</span>
              </div>
            )}

            {proposal.adjustment !== 0 && (
              <div className="flex justify-between text-xs text-slate-400 print:text-gray-600">
                <span>Ajuste Financeiro:</span>
                <span className="font-mono text-white print:text-black">{formatCurrency(proposal.adjustment)}</span>
              </div>
            )}

            <div className="pt-3 border-t border-slate-800 print:border-gray-300 flex justify-between items-center">
              <span className="text-sm font-bold text-white print:text-black uppercase tracking-wider">Total do Investimento</span>
              <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400 print:text-indigo-600">
                {formatCurrency(proposal.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Notes & Structured Terms */}
        {termsData.terms.length > 0 && (
          <div className="p-8 sm:p-12 border-t border-slate-800/80 bg-slate-900/20 print:bg-white print:border-gray-200 space-y-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-3 print:text-gray-500">
              Termos, Condições & Cláusulas
            </span>
            <div className="space-y-4">
              {termsData.terms.map((t) => (
                <div key={t.id} className="p-4 rounded-2xl bg-slate-900/60 dark:bg-white/[0.02] border border-slate-800 print:border-gray-300 print:bg-white space-y-2">
                  {t.imageUrl && t.imagePosition === 'above' && (
                    <div className="my-2 text-center">
                      <img src={t.imageUrl} alt={t.title} className="max-h-64 max-w-full rounded-xl mx-auto object-contain border border-slate-800 print:border-gray-300" />
                    </div>
                  )}
                  {t.title && <h4 className="font-bold text-white print:text-black text-sm">{t.title}</h4>}
                  {t.text && <p className="text-xs text-slate-300 print:text-gray-700 leading-relaxed whitespace-pre-line">{t.text}</p>}
                  {t.imageUrl && t.imagePosition !== 'above' && (
                    <div className="my-2 text-center">
                      <img src={t.imageUrl} alt={t.title} className="max-h-64 max-w-full rounded-xl mx-auto object-contain border border-slate-800 print:border-gray-300" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Observações Rápidas */}
        {termsData.notes && (
          <div className="p-8 sm:p-12 border-t border-slate-800/80 bg-slate-900/20 print:bg-white print:border-gray-200">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 print:text-gray-500">Condições & Observações</span>
            <p className="text-xs text-slate-400 print:text-gray-600 leading-relaxed whitespace-pre-wrap">{termsData.notes}</p>
          </div>
        )}

        {/* Rodapé da Proposta */}
        {(termsData.footerImageUrl || termsData.footerText) && (
          <div className="p-8 sm:p-12 border-t border-slate-800/80 text-center space-y-3 print:border-gray-200">
            {termsData.footerImageUrl && (
              <div className="my-2">
                <img src={termsData.footerImageUrl} alt="Rodapé da Proposta" className="max-h-32 max-w-full rounded-xl mx-auto object-contain" />
              </div>
            )}
            {termsData.footerText && (
              <p className="text-xs text-slate-500 print:text-gray-500 italic">
                {termsData.footerText}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="w-full max-w-4xl mt-6 text-center text-xs text-slate-600 print:hidden">
        Documento gerado eletronicamente por Iris Horizon CRM Multi-tenant
      </div>
    </div>
  );
}
