import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
  Eye,
  Printer,
  Maximize2,
  CheckCircle2,
  ShieldCheck,
  Layers,
  UserCheck,
  Wrench,
  X,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Building2,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Field,
  FormPage,
  PageHeader,
  SearchInput,
  StatCard,
} from '../../components/ui';
import { computeBlobSha256, fileStore, normalizeFileMime } from '../../services/files';
import { date, dateTime, money, newId, today } from '../../utils/format';
import type { DocumentCategory, DocumentRecord } from '../../types';
import './operations.css';

const categories: DocumentCategory[] = [
  'Contrato',
  'Aditivo',
  'Proposta',
  'Documento cadastral',
  'Documento técnico',
  'Outros',
];

const CATEGORY_ITEMS: {
  id: string;
  label: string;
  icon: any;
  tone: string;
  description: string;
}[] = [
  { id: '', label: 'Todas as categorias', icon: FolderOpen, tone: '#3b82f6', description: 'Todos os arquivos do sistema' },
  { id: 'Contrato', label: 'Contratos', icon: FileCheck2, tone: '#8b5cf6', description: 'Contratos de prestação de serviços' },
  { id: 'Aditivo', label: 'Aditivos', icon: Layers, tone: '#6366f1', description: 'Termos aditivos e repactuações' },
  { id: 'Proposta', label: 'Propostas', icon: FileText, tone: '#f59e0b', description: 'Orçamentos e propostas comerciais' },
  { id: 'Documento cadastral', label: 'Cadastrais', icon: UserCheck, tone: '#0ea5e9', description: 'Fichas cadastrais e compliance' },
  { id: 'Documento técnico', label: 'Técnicos', icon: Wrench, tone: '#10b981', description: 'Laudos técnicos e topologia' },
  { id: 'Outros', label: 'Outros', icon: FileText, tone: '#64748b', description: 'Demais registros documentais' },
];

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const isContract = (d: DocumentRecord) => d.category === 'Contrato' || d.category === 'Aditivo';

function futureDate(days: number) {
  const d = new Date(`${today()}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const isExpiring = (d: DocumentRecord) =>
  d.category === 'Contrato' &&
  d.status !== 'Encerrado' &&
  !!d.endDate &&
  d.endDate >= today() &&
  d.endDate <= futureDate(30);

/* ─── Visualizador Oficial de Documento no Próprio Sistema ─── */
function InSystemDocumentPreview({
  doc,
  clientName,
  portal,
  fileUrl,
  actualFile,
  onFullscreen,
  onDownload,
  onPrint,
  onEdit,
  onOpenDetail,
  onReselect,
}: {
  doc: DocumentRecord;
  clientName: string;
  portal?: boolean;
  fileUrl?: string;
  actualFile?: File;
  onFullscreen?: () => void;
  onDownload?: () => void;
  onPrint?: () => void;
  onEdit?: () => void;
  onOpenDetail?: () => void;
  onReselect?: () => void;
}) {
  const { data } = useApp();
  const company = data.settings.company;
  const extDoc = doc as DocumentRecord & {
    storageFileId?: string;
    bucketId?: string;
    sha256?: string;
    signedAt?: string;
    signatureHash?: string;
    signerName?: string;
  };

  // O modo padrão de visualização é SEMPRE a prévia visual do arquivo original (PDF ou Imagem)
  const [activeTab, setActiveTab] = useState<'file' | 'sheet'>('file');
  const [localUrl, setLocalUrl] = useState<string | undefined>(fileUrl);
  const [computedHash, setComputedHash] = useState<string>('');

  useEffect(() => {
    if (fileUrl) {
      setLocalUrl(fileUrl);
    } else {
      void fileStore
        .ensure(doc.id, {
          storageFileId: extDoc.storageFileId,
          bucketId: extDoc.bucketId,
          name: doc.name,
          type: doc.type,
        })
        .then((u) => {
          if (u) setLocalUrl(u);
        });
    }
  }, [fileUrl, doc.id, doc.name, doc.type, extDoc.storageFileId, extDoc.bucketId]);

  useEffect(() => {
    let alive = true;
    const meta = fileStore.getMeta(doc.id);
    const existingSha = extDoc.sha256 || meta?.sha256;
    if (existingSha) {
      setComputedHash(existingSha);
    }
    const blobSource = actualFile || fileStore.get(doc.id);
    if (blobSource) {
      computeBlobSha256(blobSource)
        .then((hash) => {
          if (alive && hash) setComputedHash(hash);
        })
        .catch(() => {});
    } else if (!existingSha) {
      const canonicalPayload = JSON.stringify({
        id: doc.id,
        name: doc.name,
        category: doc.category,
        clientId: doc.clientId,
        createdAt: doc.createdAt,
        size: doc.size,
        notes: doc.notes,
      });
      computeBlobSha256(new Blob([canonicalPayload], { type: 'application/json' }))
        .then((hash) => {
          if (alive && hash) setComputedHash(hash);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [doc, actualFile, extDoc.sha256]);

  const docCode = doc.number || `DOC-${doc.id.replace('document-', '').toUpperCase()}`;
  const isDocContract = doc.category === 'Contrato' || doc.category === 'Aditivo';

  const isPdf =
    actualFile?.type === 'application/pdf' ||
    doc.type === 'application/pdf' ||
    doc.name.toLowerCase().endsWith('.pdf');

  const isImage =
    actualFile?.type?.startsWith('image/') ||
    doc.type?.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.name);

  const effectiveUrl = localUrl || fileUrl;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121824] shadow-xs overflow-hidden flex flex-col">
      {/* Barra de Ações Superior da Prévia */}
      <div className="p-4 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            {isPdf ? <FileText size={16} /> : isImage ? <ImageIcon size={16} /> : isDocContract ? <FileCheck2 size={16} /> : <FileText size={16} />}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
              Prévia: {doc.name}
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>{clientName}</span>
              <span>•</span>
              <span className="font-mono">{docCode}</span>
              <span>•</span>
              <span>{fileSize(doc.size)}</span>
            </div>
          </div>
        </div>

        {/* Botões de Ação na Prévia */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center p-0.5 rounded-lg bg-slate-200/80 dark:bg-white/10 mr-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('file')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                activeTab === 'file'
                  ? 'bg-white dark:bg-[#121824] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Prévia do Documento
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sheet')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                activeTab === 'sheet'
                  ? 'bg-white dark:bg-[#121824] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Ficha & Cláusulas
            </button>
          </div>

          {effectiveUrl && (
            <a
              href={effectiveUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
              title="Abrir arquivo em nova aba"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Nova Aba</span>
            </a>
          )}

          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
              title="Imprimir documento"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
          )}

          {onFullscreen && (
            <button
              type="button"
              onClick={onFullscreen}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
              title="Expandir em tela cheia"
            >
              <Maximize2 size={14} />
              <span className="hidden sm:inline">Tela Cheia</span>
            </button>
          )}

          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
              title="Baixar arquivo do documento"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Baixar</span>
            </button>
          )}

          {!portal && onReselect && (
            <button
              type="button"
              onClick={onReselect}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
              title="Substituir arquivo por novo PDF ou Imagem"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">Substituir</span>
            </button>
          )}

          {onOpenDetail && (
            <button
              type="button"
              onClick={onOpenDetail}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
              title="Ver detalhes completos do cadastro"
            >
              <ChevronRight size={14} />
              <span className="hidden sm:inline">Detalhes</span>
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo da Prévia */}
      <div className="p-4 sm:p-6 overflow-y-auto max-h-[720px] bg-slate-100/50 dark:bg-[#0b0f17]/50 flex justify-center">
        {activeTab === 'file' ? (
          effectiveUrl ? (
            <div className="w-full">
              {isImage ? (
                <div className="flex flex-col items-center justify-center bg-white dark:bg-[#121824] p-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
                  <img
                    src={effectiveUrl}
                    alt={doc.name}
                    className="max-w-full max-h-[620px] object-contain rounded-lg"
                  />
                  <div className="mt-3 text-center text-xs text-slate-500">
                    {doc.name} · {fileSize(doc.size)}
                  </div>
                </div>
              ) : (
                /* Visualizador embutido de PDF no sistema */
                <div className="w-full bg-white dark:bg-[#121824] rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-sm">
                  <iframe
                    title={doc.name}
                    src={effectiveUrl}
                    className="w-full h-[660px] bg-white border-0"
                  />
                </div>
              )}
            </div>
          ) : (
            /* Sem arquivo físico carregado na memória do navegador */
            <div className="w-full p-8 text-center bg-white dark:bg-[#121824] rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-900/50 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-xs">
                {isPdf ? <FileText size={28} /> : isImage ? <ImageIcon size={28} /> : <Upload size={28} />}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Prévia de {doc.name}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  {isPdf
                    ? 'Este documento está registrado como arquivo PDF. Selecione ou anexe o arquivo PDF original para renderizar a prévia visual interativa.'
                    : isImage
                    ? 'Este documento é uma imagem. Selecione o arquivo para renderizar a prévia visual.'
                    : 'Apenas arquivos PDF e imagens (PNG, JPG, WEBP) possuem prévia visual integrada.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                {!portal && onReselect && (
                  <Button onClick={onReselect}>
                    <Upload size={14} /> Selecionar arquivo ({isPdf ? 'PDF' : isImage ? 'Imagem' : 'PDF / Imagem'})
                  </Button>
                )}
                {onDownload && (
                  <Button variant="secondary" onClick={onDownload}>
                    <Download size={14} /> Baixar dados
                  </Button>
                )}
              </div>
            </div>
          )
        ) : (
          /* Folha Oficial A4 do Documento formatada no Sistema */
          <div className="ops-doc-sheet w-full max-w-2xl bg-white dark:bg-[#121824] text-slate-800 dark:text-slate-200 shadow-lg">
            <div className="ops-doc-sheet-watermark">{doc.category.toUpperCase()}</div>

            {/* Cabeçalho Oficial do Documento */}
            <div className="border-b-2 border-slate-200 dark:border-white/10 pb-4 mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-indigo-600 text-white flex items-center justify-center font-black text-xs">
                    {(company.tradeName || company.name || 'CR').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs font-black tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                    {company.tradeName || company.name || 'CRM Corporativo'}
                  </span>
                </div>
                <h2 className="text-base font-black text-slate-900 dark:text-white mt-2 leading-tight">
                  {doc.category === 'Contrato'
                    ? 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS'
                    : doc.category === 'Aditivo'
                    ? 'TERMO ADITIVO CONTRATUAL'
                    : doc.category === 'Proposta'
                    ? 'PROPOSTA COMERCIAL & ORÇAMENTO'
                    : doc.category === 'Documento técnico'
                    ? 'RELATÓRIO & ESPECIFICAÇÃO TÉCNICA'
                    : doc.category === 'Documento cadastral'
                    ? 'FICHA CADASTRAL & COMPLIANCE'
                    : doc.name}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Instrumento de Registro Corporativo • Registro nº <strong className="text-slate-700 dark:text-slate-300">{docCode}</strong>
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40 block">
                  {doc.category}
                </span>
                {doc.status && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1 block">
                    ● {doc.status}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 block mt-1">
                  Emissão: {date(doc.createdAt)}
                </span>
              </div>
            </div>

            {/* Qualificação das Partes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] mb-5 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  CONTRATADA (EMPRESA)
                </span>
                <p className="font-bold text-slate-900 dark:text-white">{company.name || 'Empresa'}</p>
                <p className="text-[11px] text-slate-500">CNPJ: {company.document || 'Não informado'}</p>
                <p className="text-[11px] text-slate-500">{company.address || company.email || 'Endereço não informado'}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  CONTRATANTE (CLIENTE)
                </span>
                <p className="font-bold text-slate-900 dark:text-white">{clientName}</p>
                <p className="text-[11px] text-slate-500">Código do Cliente: #{doc.clientId}</p>
                <p className="text-[11px] text-slate-500">Cadastro ativo e homologado no CRM</p>
              </div>
            </div>

            {/* Condições Comerciais e Vigência (quando aplicável) */}
            {(isDocContract || doc.value !== undefined || doc.startDate || doc.endDate) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 mb-5 text-xs">
                <div>
                  <span className="text-[10px] font-medium text-indigo-700 dark:text-indigo-300 block">
                    Valor do Documento
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">
                    {doc.value !== undefined ? money(doc.value) : 'Sob consulta'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-medium text-indigo-700 dark:text-indigo-300 block">
                    Vigência Contratual
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {doc.startDate && doc.endDate ? `${date(doc.startDate)} a ${date(doc.endDate)}` : 'Indeterminado'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-medium text-indigo-700 dark:text-indigo-300 block">
                    Condição de Renovação
                  </span>
                  <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                    {doc.renewal || 'Renovação periódica'}
                  </span>
                </div>
              </div>
            )}

            {/* Cláusulas e Objeto Detalhado */}
            <div className="space-y-3 mb-6 text-xs text-slate-700 dark:text-slate-300">
              <h5 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] border-b border-slate-100 dark:border-white/[0.06] pb-1.5">
                Cláusulas e Especificações do Instrumento
              </h5>

              {doc.category === 'Contrato' && (
                <>
                  <p>
                    <strong>CLÁUSULA 1ª (DO OBJETO):</strong> O presente instrumento consolida a prestação contínua de serviços de telecomunicações corporativas, PABX em nuvem, telefonia IP e infraestrutura digital disponibilizada pela CONTRATADA em favor da CONTRATANTE, de acordo com as especificações pactuadas.
                  </p>
                  <p>
                    <strong>CLÁUSULA 2ª (DOS NÍVEIS DE SERVIÇO E SUPORTE):</strong> A CONTRATADA garante disponibilidade de rede e assistência técnica especializada conforme SLA corporativo, através da central de chamados e canais dedicados de suporte.
                  </p>
                  <p>
                    <strong>CLÁUSULA 3ª (DO FATURAMENTO E PAGAMENTO):</strong> Os valores ajustados serão faturados periodicamente conforme ciclo comercial acordado, sujeitos aos termos fiscais e bancários vigentes.
                  </p>
                </>
              )}

              {doc.category === 'Aditivo' && (
                <>
                  <p>
                    <strong>CLÁUSULA 1ª (DA REPACTUAÇÃO):</strong> Pelo presente Termo Aditivo, as partes concordam expressamente em repactuar condições técnicas, acréscimo de ramais ou adequação de valores estipulados no contrato originário.
                  </p>
                  <p>
                    <strong>CLÁUSULA 2ª (DA RATIFICAÇÃO):</strong> Ficam plenamente ratificadas todas as demais cláusulas e condições do instrumento contratual principal que não tenham sido alteradas por este aditamento.
                  </p>
                </>
              )}

              {doc.category === 'Proposta' && (
                <>
                  <p>
                    <strong>ESCOPO COMERCIAL:</strong> Proposta comercial formal contendo a especificação dos produtos, licenças e serviços sob medida para a CONTRATANTE, com condições comerciais garantidas pelo prazo de validade indicado.
                  </p>
                  <p>
                    <strong>CONDIÇÕES DE IMPLEMENTAÇÃO:</strong> Os serviços e entregáveis serão provisionados e configurados pela equipe técnica após o aceite e formalização do contrato.
                  </p>
                </>
              )}

              {doc.category === 'Documento técnico' && (
                <>
                  <p>
                    <strong>ESPECIFICAÇÃO DE TOPOLOGIA:</strong> Documento técnico comprobatório de homologação de roteamento SIP, arquitetura de ramais, troncos de comunicação e relatórios de conformidade técnica da infraestrutura.
                  </p>
                  <p>
                    <strong>HOMOLOGAÇÃO TÉCNICA:</strong> Equipamentos e regras de firewall validados de acordo com as melhores práticas de segurança da informação e telefonia IP.
                  </p>
                </>
              )}

              {doc.category === 'Documento cadastral' && (
                <>
                  <p>
                    <strong>VERIFICAÇÃO CADASTRAL:</strong> Dossiê de homologação cadastral, conferência de quadro de sócios/representantes legais, comprovante de endereço e conformidade fiscal e jurídica do cliente.
                  </p>
                </>
              )}

              {doc.category === 'Outros' && (
                <p>
                  <strong>REGISTRO CORPORATIVO:</strong> Documento corporativo digitalizado e armazenado de forma segura no repositório de arquivos do cliente com total rastreabilidade.
                </p>
              )}

              {doc.notes && (
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/[0.06] text-[11px]">
                  <strong>Observações:</strong> {doc.notes}
                </div>
              )}
            </div>

            {/* Selo de Assinatura Eletrônica (apenas quando houver evidência persistida) ou Hash de Integridade Técnica */}
            {extDoc.signedAt && extDoc.signatureHash ? (
              <div className="ops-doc-stamp">
                <ShieldCheck size={28} className="text-emerald-600 shrink-0" />
                <div>
                  <strong className="block text-emerald-800 dark:text-emerald-300 font-bold">
                    Documento Assinado Eletronicamente ({extDoc.signerName || 'Signatário Verificado'})
                  </strong>
                  <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400 block font-mono">
                    Assinado em {dateTime(extDoc.signedAt)} • Hash da Assinatura: {extDoc.signatureHash}
                  </span>
                </div>
              </div>
            ) : (
              <div className="ops-doc-stamp">
                <ShieldCheck size={28} className="text-slate-500 shrink-0" />
                <div>
                  <strong className="block text-slate-800 dark:text-slate-200 font-bold">
                    Registro de Integridade Técnica (Documento sem assinatura eletrônica vinculada)
                  </strong>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 block font-mono">
                    Hash de integridade técnica (SHA-256): {computedHash || 'calculando...'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rodapé da Prévia com Ações Adicionais */}
      <div className="p-3 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between text-xs text-slate-500 no-print">
        <span className="truncate">
          Tamanho registrado: {fileSize(doc.size)} • {doc.type}
        </span>
        {!portal && onReselect && (
          <button
            type="button"
            onClick={onReselect}
            className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Upload size={13} />
            <span>Substituir arquivo físico</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Modal de Criação / Edição de Documento ─── */
function DocumentForm({
  document,
  clientId,
  onClose,
  portal,
}: {
  document?: DocumentRecord;
  clientId?: string;
  onClose: () => void;
  portal?: boolean;
}) {
  const { data, session, save, notify } = useApp();
  const [form, setForm] = useState<DocumentRecord>(
    document || {
      id: newId('doc'),
      name: '',
      type: 'application/pdf',
      size: 0,
      clientId: clientId || '',
      category: 'Contrato',
      createdAt: new Date().toISOString(),
      responsibleId: session?.userId || '',
      notes: '',
      shared: false,
      number: '',
      startDate: today(),
      endDate: '',
      status: 'Vigente',
      value: 0,
      renewal: '',
    },
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = <K extends keyof DocumentRecord>(key: K, value: DocumentRecord[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const selectFile = (selected?: File) => {
    if (!selected) return;
    const isAllowed =
      selected.type === 'application/pdf' ||
      selected.type.startsWith('image/') ||
      /\.(pdf|png|jpe?g|webp)$/i.test(selected.name);
    if (!isAllowed) {
      setError('Apenas arquivos em PDF ou Imagens (PNG, JPG, WEBP) podem subir na plataforma para permitir a visualização em prévia.');
      return;
    }
    if (selected.size > 30 * 1024 * 1024) {
      setError('Selecione um arquivo de até 30 MB.');
      return;
    }
    setFile(selected);
    setError('');
    const mime = normalizeFileMime(selected.name, selected.type || 'application/pdf');
    if (!document)
      setForm((f) => ({
        ...f,
        name: selected.name,
        type: mime,
        size: selected.size,
      }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.clientId) {
      setError('Informe o nome do documento e o cliente.');
      return;
    }
    if (!document && !file) {
      setError('Selecione o arquivo do documento.');
      return;
    }
    if (isContract(form) && form.startDate && form.endDate && form.endDate < form.startDate) {
      setError('A data final deve ser igual ou posterior ao início da vigência.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let attachment: any = null;
      if (file) {
        attachment = await fileStore.uploadRemote(file, form.id);
        // F10: Exige confirmação de sincronização remota antes de persistir metadados
        if (!attachment || !attachment.syncedRemote) {
          throw new Error('Falha na sincronização remota do arquivo com o Appwrite Storage. Operação cancelada para garantir consistência de metadados.');
        }
      }
      const record: DocumentRecord & {
        storageFileId?: string;
        bucketId?: string;
        sha256?: string;
      } = {
        ...form,
        ...(attachment
          ? {
              type: attachment.type,
              size: attachment.size,
              storageFileId: attachment.storageFileId,
              bucketId: attachment.bucketId,
              sha256: attachment.sha256,
            }
          : {}),
        name: form.name.trim(),
      };
      if (!isContract(record)) {
        delete record.number;
        delete record.startDate;
        delete record.endDate;
        delete record.status;
        delete record.value;
        delete record.renewal;
      }
      await save('documents', record);
      notify(document ? 'Documento atualizado.' : 'Documento adicionado.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o documento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPage
      eyebrow="GESTÃO DOCUMENTAL"
      title={document ? 'Editar documento' : 'Adicionar documento'}
      description="Vincule arquivos em PDF ou imagens e gerencie prazos de vigência com prévia visual."
      backLabel="Voltar aos documentos"
      onBack={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="ops-form-full">
            <div className="ops-upload">
              <Upload size={24} />
              <p>
                {file
                  ? file.name
                  : document
                    ? 'Selecione um novo PDF ou imagem para substituir o documento, se necessário.'
                    : 'Selecione o documento (PDF ou imagem) que será vinculado ao cliente.'}
              </p>
              <input
                type="file"
                aria-label="Arquivo do documento"
                onChange={(e) => selectFile(e.target.files?.[0])}
                accept="application/pdf,image/png,image/jpeg,image/webp,image/jpg"
              />
              <p className="ops-tiny">
                Apenas arquivos PDF e Imagens (PNG, JPG, WEBP) · até 30 MB · com prévia visual integrada
              </p>
            </div>
          </div>
          <Field label="Nome do documento *">
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => change('name', e.target.value)}
              placeholder="Ex.: Contrato de prestação de serviços.pdf"
            />
          </Field>
          <Field label="Categoria">
            <select
              className="select"
              value={form.category}
              onChange={(e) => change('category', e.target.value as DocumentCategory)}
            >
              {categories.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Cliente *">
            <select
              className="select"
              required
              value={form.clientId}
              onChange={(e) => change('clientId', e.target.value)}
            >
              <option value="">Selecione o cliente</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tradeName || c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <select
              className="select"
              value={form.responsibleId}
              onChange={(e) => change('responsibleId', e.target.value)}
            >
              <option value="">Sem responsável</option>
              {data.users
                .filter((u) => u.role !== 'client')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          {isContract(form) && (
            <>
              <div className="ops-divider-heading">Dados contratuais</div>
              <Field label="Número do contrato / aditivo">
                <input
                  className="input"
                  value={form.number || ''}
                  onChange={(e) => change('number', e.target.value)}
                  placeholder="Ex.: 018/2026"
                />
              </Field>
              <Field label="Situação">
                <select
                  className="select"
                  value={form.status || 'Vigente'}
                  onChange={(e) => change('status', e.target.value as DocumentRecord['status'])}
                >
                  {['Vigente', 'Em renovação', 'Encerrado'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Início da vigência">
                <input
                  className="input"
                  type="date"
                  value={form.startDate || ''}
                  onChange={(e) => change('startDate', e.target.value)}
                />
              </Field>
              <Field label="Fim da vigência">
                <input
                  className="input"
                  type="date"
                  value={form.endDate || ''}
                  min={form.startDate || undefined}
                  onChange={(e) => change('endDate', e.target.value)}
                />
              </Field>
              <Field label="Valor contratado (R$)">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.value ?? ''}
                  onChange={(e) =>
                    change('value', e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </Field>
              <Field label="Condição de renovação">
                <input
                  className="input"
                  value={form.renewal || ''}
                  onChange={(e) => change('renewal', e.target.value)}
                  placeholder="Ex.: Renovação por 12 meses"
                />
              </Field>
            </>
          )}
          <div className="ops-form-full">
            <Field label="Observações">
              <textarea
                className="textarea"
                rows={3}
                value={form.notes}
                onChange={(e) => change('notes', e.target.value)}
                placeholder="Condições especiais, escopo, observações internas..."
              />
            </Field>
          </div>
          {!portal && (
            <div className="ops-form-full">
              <label className="ops-choice">
                <input
                  type="checkbox"
                  checked={form.shared}
                  onChange={(e) => change('shared', e.target.checked)}
                />
                <span>Disponibilizar este documento no portal do cliente</span>
              </label>
            </div>
          )}
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} type="submit">
            {document ? 'Salvar alterações' : 'Adicionar documento'}
          </Button>
        </div>
      </form>
    </FormPage>
  );
}

/* ─── Página Principal de Documentos ─── */
export function DocumentsPage({ portal: portalProp }: { portal?: boolean } = {}) {
  const { data, session, patch, remove, notify } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const portal = portalProp ?? session?.role === 'client';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(params.get('category') || '');
  const [client, setClient] = useState(params.get('client') || '');
  const [status, setStatus] = useState('');
  const [expiring, setExpiring] = useState(params.get('expiring') === '1');
  const [editor, setEditor] = useState<DocumentRecord | 'new' | null>(
    !portal && params.get('new') ? 'new' : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(params.get('id'));
  const [sharing, setSharing] = useState<DocumentRecord | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentRecord | null>(null);
  const [, setFileRevision] = useState(0);
  const reselect = useRef<HTMLInputElement>(null);

  // Estados de Visualização e Prévia
  const [viewMode, setViewMode] = useState<'split' | 'table'>('split');
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [fullscreenDoc, setFullscreenDoc] = useState<DocumentRecord | null>(null);

  useEffect(() => {
    setClient(params.get('client') || '');
    setExpiring(params.get('expiring') === '1');
    setSelectedId(params.get('id'));
    setEditor(!portal && params.get('new') === '1' ? 'new' : null);
    if (params.get('category')) {
      setCategory(params.get('category') || '');
    }
  }, [params, portal]);

  const clientName = (id: string) => {
    const c = data.clients.find((c) => c.id === id);
    return c?.tradeName || c?.name || 'Cliente não encontrado';
  };

  const scoped = data.documents.filter(
    (d) => !portal || (d.clientId === session?.clientId && d.shared),
  );

  const rows = scoped.filter(
    (d) =>
      (!category || d.category === category) &&
      (!client || portal || d.clientId === client) &&
      (!status || d.status === status) &&
      (!expiring || isExpiring(d)) &&
      `${d.name} ${d.number || ''} ${clientName(d.clientId)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  // Seleção automática do primeiro documento ao entrar em uma categoria
  useEffect(() => {
    if (rows.length > 0) {
      if (!previewDocId || !rows.some((r) => r.id === previewDocId)) {
        setPreviewDocId(rows[0].id);
      }
    } else {
      setPreviewDocId(null);
    }
  }, [category, rows.length]);

  const activePreviewDoc = useMemo(() => {
    if (!previewDocId) return rows[0] || null;
    return scoped.find((d) => d.id === previewDocId) || rows[0] || null;
  }, [previewDocId, scoped, rows]);

  const detail = scoped.find((d) => d.id === selectedId);
  const fileUrl = detail ? fileStore.url(detail.id) : activePreviewDoc ? fileStore.url(activePreviewDoc.id) : undefined;
  const actualFile = detail ? fileStore.get(detail.id) : activePreviewDoc ? fileStore.get(activePreviewDoc.id) : undefined;

  useEffect(() => {
    const unsub = fileStore.subscribe(() => {
      setFileRevision((r) => r + 1);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const targetId = selectedId || previewDocId;
    if (targetId) {
      void fileStore.ensure(targetId).then((u) => {
        if (u) setFileRevision((r) => r + 1);
      });
    }
  }, [selectedId, previewDocId]);

  const replaceFile = async (file?: File) => {
    const targetDoc = detail || activePreviewDoc;
    if (!file || !targetDoc || portal) return;
    const isAllowed =
      file.type === 'application/pdf' ||
      file.type.startsWith('image/') ||
      /\.(pdf|png|jpe?g|webp)$/i.test(file.name);
    if (!isAllowed) {
      notify('Apenas arquivos em PDF ou Imagens (PNG, JPG, WEBP) podem ser enviados.', 'error');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      notify('Selecione um arquivo de até 30 MB.', 'error');
      return;
    }
    try {
      const attachment = await fileStore.uploadRemote(file, targetDoc.id);
      await patch('documents', targetDoc.id, {
        type: attachment.type,
        size: attachment.size,
        ...(attachment.storageFileId ? { storageFileId: attachment.storageFileId } : {}),
        ...(attachment.bucketId ? { bucketId: attachment.bucketId } : {}),
        ...(attachment.sha256 ? { sha256: attachment.sha256 } : {}),
      } as Partial<DocumentRecord>);
      setFileRevision((n) => n + 1);
      notify('Arquivo atualizado! Prévia visual disponível.');
    } catch {
      notify('Não foi possível selecionar o arquivo.', 'error');
    }
  };

  const toggleSharing = async () => {
    if (!sharing) return;
    try {
      await patch('documents', sharing.id, { shared: !sharing.shared });
      notify(
        sharing.shared ? 'Documento retirado do portal.' : 'Documento compartilhado com o cliente.',
      );
      setSharing(null);
    } catch {
      notify('Não foi possível atualizar o compartilhamento.', 'error');
    }
  };

  const download = async (d: DocumentRecord) => {
    const extDoc = d as DocumentRecord & { storageFileId?: string; bucketId?: string };
    let url = fileStore.url(d.id);
    if (!url) {
      url = await fileStore.ensure(d.id, {
        storageFileId: extDoc.storageFileId,
        bucketId: extDoc.bucketId,
        name: d.name,
        type: d.type,
      });
    }
    if (!url) {
      notify('Arquivo binário indisponível no armazenamento remoto e local.', 'error');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileStore.get(d.id)?.name || d.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleSelectCategory = (catId: string) => {
    setCategory(catId);
    const catRows = scoped.filter((d) => !catId || d.category === catId);
    if (catRows.length > 0) {
      setPreviewDocId(catRows[0].id);
    }
  };

  if (editor && !portal) {
    return (
      <DocumentForm
        document={editor === 'new' ? undefined : editor}
        clientId={client}
        onClose={() => setEditor(null)}
        portal={portal}
      />
    );
  }

  /* ─── Visualização Detalhada Individual do Documento ─── */
  if (detail) {
    return (
      <>
        <FormPage
          eyebrow={detail.category.toUpperCase()}
          title={detail.name}
          description={clientName(detail.clientId)}
          backLabel="Voltar aos documentos"
          onBack={() => setSelectedId(null)}
          actions={
            <div className="ops-actions">
              {detail.status && <Badge status={detail.status} />}
              <Button size="sm" onClick={() => download(detail)}>
                <Download size={14} />
                Baixar documento
              </Button>
              {!portal && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedId(null);
                    setEditor(detail);
                  }}
                >
                  <Pencil size={14} />
                  Editar
                </Button>
              )}
            </div>
          }
        >
          {/* Prévia do Documento Oficial no Sistema */}
          <div className="my-5">
            <InSystemDocumentPreview
              doc={detail}
              clientName={clientName(detail.clientId)}
              portal={portal}
              fileUrl={fileUrl}
              actualFile={actualFile}
              onPrint={() => window.print()}
              onFullscreen={() => setFullscreenDoc(detail)}
              onDownload={() => download(detail)}
              onEdit={!portal ? () => { setSelectedId(null); setEditor(detail); } : undefined}
              onReselect={!portal ? () => reselect.current?.click() : undefined}
            />
          </div>

          {!portal && (
            <input
              ref={reselect}
              type="file"
              hidden
              accept="application/pdf,image/png,image/jpeg,image/webp,image/jpg"
              aria-label="Selecionar arquivo do documento"
              onChange={(e) => {
                void replaceFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          )}

          <div className="ops-info">
            <span>Cliente</span>
            {portal ? (
              <strong>{clientName(detail.clientId)}</strong>
            ) : (
              <button className="link" onClick={() => navigate(`/clientes/${detail.clientId}`)}>
                {clientName(detail.clientId)} <ExternalLink size={12} />
              </button>
            )}
          </div>
          <div className="ops-info">
            <span>Adicionado em</span>
            <span>{dateTime(detail.createdAt)}</span>
          </div>
          <div className="ops-info">
            <span>Responsável</span>
            <span>
              {data.users.find((u) => u.id === detail.responsibleId)?.name || 'Não informado'}
            </span>
          </div>
          {isContract(detail) && (
            <>
              <div className="ops-info">
                <span>Número</span>
                <strong>{detail.number || 'Não informado'}</strong>
              </div>
              <div className="ops-info">
                <span>Vigência</span>
                <span>
                  {date(detail.startDate)} a {date(detail.endDate)}
                </span>
              </div>
              <div className="ops-info">
                <span>Valor contratado</span>
                <strong>
                  {detail.value !== undefined ? money(detail.value) : 'Não informado'}
                </strong>
              </div>
              <div className="ops-info">
                <span>Renovação</span>
                <span>{detail.renewal || 'Não informada'}</span>
              </div>
            </>
          )}
          <div className="ops-info">
            <span>Observações</span>
            <p className="ops-pre">{detail.notes || 'Nenhuma observação.'}</p>
          </div>
          {!portal && (
            <div className="form-actions">
              <Button variant="secondary" onClick={() => reselect.current?.click()}>
                <Upload size={14} />
                Substituir arquivo físico
              </Button>
              <Button variant="secondary" onClick={() => setSharing(detail)}>
                <Share2 size={14} />
                {detail.shared ? 'Retirar do portal' : 'Compartilhar no portal'}
              </Button>
              <Button
                variant="danger"
                onClick={() => setDeleteDoc(detail)}
                title="Excluir documento"
              >
                <Trash2 size={14} />
                Excluir documento
              </Button>
            </div>
          )}
        </FormPage>

        <ConfirmDialog
          danger={false}
          open={!!sharing}
          title={sharing?.shared ? 'Retirar documento do portal?' : 'Compartilhar documento?'}
          description={
            sharing?.shared
              ? 'O cliente deixará de visualizar este documento no portal.'
              : `O documento ficará visível para ${sharing ? clientName(sharing.clientId) : 'o cliente'} no portal.`
          }
          onConfirm={toggleSharing}
          onClose={() => setSharing(null)}
        />
        <ConfirmDialog
          danger
          open={!!deleteDoc}
          title="Excluir documento?"
          description={`O documento "${deleteDoc?.name || ''}" será removido definitivamente.`}
          onConfirm={async () => {
            if (!deleteDoc) return;
            try {
              await remove('documents', deleteDoc.id);
              notify('Documento excluído com sucesso.');
              setDeleteDoc(null);
              setSelectedId(null);
              window.location.reload();
            } catch (error) {
              notify(
                error instanceof Error ? error.message : 'Não foi possível excluir o documento.',
                'error',
              );
            }
          }}
          onClose={() => setDeleteDoc(null)}
        />
      </>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={portal ? 'PORTAL DO CLIENTE' : 'GESTÃO DOCUMENTAL'}
        title={portal ? 'Meus documentos' : 'Arquivos & Documentos'}
        description={
          portal
            ? 'Consulte os documentos e contratos compartilhados com sua empresa com prévia imediata no sistema.'
            : 'Centralize contratos, propostas e arquivos técnicos com visualização prévia direta no sistema.'
        }
        actions={
          <div className="flex items-center gap-2">
            {/* Alternador de Modo: Dividido com Prévia vs Tabela */}
            <div className="inline-flex p-1 rounded-xl bg-slate-200/80 dark:bg-white/10 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                  viewMode === 'split'
                    ? 'bg-white dark:bg-[#121824] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Eye size={13} />
                <span>Prévia ao Entrar</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-[#121824] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <ListIcon size={13} />
                <span>Tabela Completa</span>
              </button>
            </div>

            {!portal && (
              <Button onClick={() => setEditor('new')}>
                <Plus size={16} />
                Adicionar documento
              </Button>
            )}
          </div>
        }
      />

      {/* ─── 1. Estatísticas Rápidas ─── */}
      <div className="ops-summary">
        <StatCard
          label="Documentos"
          value={scoped.length}
          detail="Arquivos cadastrados"
          icon={FolderOpen}
          tone="blue"
          onClick={() => {
            setCategory('');
            setStatus('');
            setExpiring(false);
          }}
        />
        <StatCard
          label="Contratos vigentes"
          value={scoped.filter((d) => isContract(d) && d.status === 'Vigente').length}
          detail="Contratos e aditivos"
          icon={FileCheck2}
          tone="green"
          onClick={() => {
            handleSelectCategory('Contrato');
            setStatus('Vigente');
            setExpiring(false);
          }}
        />
        <StatCard
          label="Vencem em 30 dias"
          value={scoped.filter(isExpiring).length}
          detail="Acompanhe a renovação"
          icon={CalendarClock}
          tone="amber"
          onClick={() => {
            setExpiring((v) => !v);
            setStatus('');
            setCategory('Contrato');
          }}
        />
        <StatCard
          label={portal ? 'Em renovação' : 'Compartilhados'}
          value={scoped.filter((d) => (portal ? d.status === 'Em renovação' : d.shared)).length}
          detail={portal ? 'Contratos em análise' : 'Disponíveis no portal do cliente'}
          icon={Share2}
          tone="navy"
        />
      </div>

      {/* ─── 2. Barra de Categorias Interativas com Contadores ─── */}
      <div className="ops-category-tabs">
        {CATEGORY_ITEMS.map((cat) => {
          const count = scoped.filter((d) => !cat.id || d.category === cat.id).length;
          const isActive = category === cat.id;
          const Icon = cat.icon;
          return (
            <button
              key={cat.id || 'all'}
              type="button"
              onClick={() => handleSelectCategory(cat.id)}
              className={`ops-category-tab ${isActive ? 'active' : ''}`}
              title={cat.description}
            >
              <Icon size={15} style={{ color: isActive ? 'white' : cat.tone }} />
              <span>{cat.label}</span>
              <span className="badge-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ─── 3. Toolbar com Busca e Filtros Complementares ─── */}
      <Card>
        <div className="toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nome do documento, contrato ou cliente..."
          />
          <div className="filters">
            {!portal && (
              <select
                className="select"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                aria-label="Cliente do documento"
              >
                <option value="">Todos os clientes</option>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.name}
                  </option>
                ))}
              </select>
            )}
            <select
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Situação do contrato"
            >
              <option value="">Todas as situações</option>
              {['Vigente', 'Em renovação', 'Encerrado'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <label className="ops-choice">
              <input
                type="checkbox"
                checked={expiring}
                onChange={(e) => setExpiring(e.target.checked)}
              />
              <span>Vencem em 30 dias</span>
            </label>
          </div>
        </div>

        {/* ─── 4. Modo Dividido: Lista de Documentos + Prévia Imediata ─── */}
        {viewMode === 'split' ? (
          <div className="ops-docs-split mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.08]">
            {/* Coluna Esquerda: Lista de Documentos da Categoria */}
            <div className="ops-docs-list space-y-2">
              <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-semibold mb-1">
                <span>{category ? `Documentos em "${category}"` : 'Todos os documentos'}</span>
                <span className="text-[11px] bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full font-bold">
                  {rows.length} {rows.length === 1 ? 'arquivo' : 'arquivos'}
                </span>
              </div>

              {rows.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-white/[0.02] rounded-xl border border-dashed border-slate-200 dark:border-white/10 text-xs text-slate-500 space-y-2">
                  <FolderOpen size={32} className="mx-auto text-slate-400" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Nenhum documento encontrado nesta categoria.</p>
                  {!portal && (
                    <Button size="sm" onClick={() => setEditor('new')}>
                      <Plus size={14} /> Adicionar nesta categoria
                    </Button>
                  )}
                </div>
              ) : (
                rows.map((d) => {
                  const isSelected = activePreviewDoc?.id === d.id;
                  return (
                    <div
                      key={d.id}
                      onClick={() => setPreviewDocId(d.id)}
                      className={`ops-doc-card ${isSelected ? 'active' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`ops-file-icon ${d.type === 'application/pdf' ? 'pdf' : ''} !w-6 !h-6 !rounded-md shrink-0`}>
                              {d.type.startsWith('image/') ? <ImageIcon size={13} /> : <FileText size={13} />}
                            </span>
                            <h5 className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                              {d.name}
                            </h5>
                          </div>

                          <p className="text-[11px] text-slate-500 truncate mt-1">
                            {clientName(d.clientId)}
                          </p>

                          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                            <span>{d.category}</span>
                            <span>•</span>
                            <span>{fileSize(d.size)}</span>
                            {d.endDate && (
                              <>
                                <span>•</span>
                                <span>Vigência: {date(d.endDate)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-right flex flex-col items-end gap-1">
                          {d.status && <Badge status={d.status} />}
                          {isSelected && (
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 mt-1">
                              <Eye size={11} /> Prévia
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Coluna Direita: Prévia do Documento Selecionado */}
            <div className="sticky top-4">
              {activePreviewDoc ? (
                <InSystemDocumentPreview
                  doc={activePreviewDoc}
                  clientName={clientName(activePreviewDoc.clientId)}
                  portal={portal}
                  fileUrl={fileStore.url(activePreviewDoc.id)}
                  actualFile={fileStore.get(activePreviewDoc.id)}
                  onPrint={() => window.print()}
                  onFullscreen={() => setFullscreenDoc(activePreviewDoc)}
                  onDownload={() => download(activePreviewDoc)}
                  onOpenDetail={() => setSelectedId(activePreviewDoc.id)}
                  onEdit={!portal ? () => setEditor(activePreviewDoc) : undefined}
                  onReselect={!portal ? () => reselect.current?.click() : undefined}
                />
              ) : (
                <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-xs text-slate-500 space-y-2">
                  <Eye size={36} className="mx-auto text-slate-400" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Selecione um documento ao lado para visualizar a prévia oficial.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ─── Modo Tabela Completa Tradicional ─── */
          <div className="mt-4">
            <DataTable
              rows={rows}
              onRowClick={(d) => setSelectedId(d.id)}
              pageSize={8}
              emptyTitle="Nenhum documento encontrado"
              columns={[
                {
                  key: 'name',
                  label: 'Documento',
                  sortValue: (d) => d.name,
                  render: (d) => (
                    <div className="inline">
                      <span className={`ops-file-icon ${d.type === 'application/pdf' ? 'pdf' : ''}`}>
                        {d.type.startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}
                      </span>
                      <div>
                        <div className="cell-title font-semibold">{d.name}</div>
                        <div className="cell-subtitle">
                          {d.category} · {fileSize(d.size)}
                        </div>
                      </div>
                    </div>
                  ),
                },
                ...(!portal
                  ? [
                      {
                        key: 'client',
                        label: 'Cliente',
                        sortValue: (d: DocumentRecord) => clientName(d.clientId),
                        render: (d: DocumentRecord) => clientName(d.clientId),
                      },
                    ]
                  : []),
                {
                  key: 'date',
                  label: 'Adicionado em',
                  sortValue: (d) => d.createdAt,
                  render: (d) => <span className="small">{date(d.createdAt)}</span>,
                },
                {
                  key: 'end',
                  label: 'Vigência até',
                  sortValue: (d) => d.endDate || '9999',
                  render: (d) =>
                    d.endDate ? (
                      <>
                        <div className="small">{date(d.endDate)}</div>
                        {isExpiring(d) && (
                          <span className="ops-tiny" style={{ color: '#c39432' }}>
                            Renovação próxima
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    ),
                },
                {
                  key: 'status',
                  label: 'Situação',
                  sortValue: (d) => d.status || '',
                  render: (d) =>
                    d.status ? <Badge status={d.status} /> : <span className="muted">—</span>,
                },
                {
                  key: 'actions',
                  label: 'Ações',
                  render: (d) => (
                    <div className="inline" onClick={(e) => e.stopPropagation()}>
                      {/* Botão de Prévia Imediata */}
                      <button
                        type="button"
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-1 transition cursor-pointer"
                        onClick={() => setFullscreenDoc(d)}
                        title="Visualizar prévia no sistema"
                      >
                        <Eye size={14} />
                        <span>Prévia</span>
                      </button>

                      <button
                        className="icon-button"
                        aria-label={`Baixar ${d.name}`}
                        onClick={() => download(d)}
                        title="Baixar arquivo"
                      >
                        <Download size={14} />
                      </button>

                      {!portal && (
                        <>
                          <button
                            className="icon-button"
                            aria-label={`Editar ${d.name}`}
                            onClick={() => setEditor(d)}
                            title="Editar documento"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Excluir ${d.name}`}
                            title="Excluir documento"
                            onClick={() => setDeleteDoc(d)}
                          >
                            <Trash2 size={14} className="text-rose-600" />
                          </button>
                        </>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Card>

      {/* ─── 5. Modal de Prévia em Tela Cheia (Visualização no Próprio Sistema) ─── */}
      {fullscreenDoc && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white dark:bg-[#0e1420] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden my-8">
            <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-[#121824] no-print">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Visualização do Documento no Sistema
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFullscreenDoc(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto bg-slate-100/60 dark:bg-[#0b0f17]/60">
              <InSystemDocumentPreview
                doc={fullscreenDoc}
                clientName={clientName(fullscreenDoc.clientId)}
                portal={portal}
                fileUrl={fileStore.url(fullscreenDoc.id)}
                actualFile={fileStore.get(fullscreenDoc.id)}
                onPrint={() => window.print()}
                onDownload={() => download(fullscreenDoc)}
                onEdit={!portal ? () => { setFullscreenDoc(null); setEditor(fullscreenDoc); } : undefined}
                onReselect={!portal ? () => reselect.current?.click() : undefined}
              />
            </div>
          </div>
        </div>
      )}

      {!portal && (
        <input
          ref={reselect}
          type="file"
          hidden
          accept="application/pdf,image/png,image/jpeg,image/webp,image/jpg"
          aria-label="Selecionar arquivo do documento"
          onChange={(e) => {
            void replaceFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      )}

      {/* Confirmação de Exclusão */}
      <ConfirmDialog
        danger
        open={!!deleteDoc}
        title="Excluir documento?"
        description={`O documento "${deleteDoc?.name || ''}" será removido definitivamente.`}
        onConfirm={async () => {
          if (!deleteDoc) return;
          try {
            fileStore.delete(deleteDoc.id);
            await remove('documents', deleteDoc.id);
            notify('Documento excluído com sucesso.');
            setDeleteDoc(null);
            if (selectedId === deleteDoc.id) setSelectedId(null);
            if (previewDocId === deleteDoc.id) setPreviewDocId(null);
          } catch (error) {
            notify(
              error instanceof Error ? error.message : 'Não foi possível excluir o documento.',
              'error',
            );
          }
        }}
        onClose={() => setDeleteDoc(null)}
      />
    </div>
  );
}
