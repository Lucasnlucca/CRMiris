import React, { useEffect, useMemo, useState } from 'react';
import {
  FileCheck2,
  Plus,
  Search,
  Filter,
  Copy,
  ExternalLink,
  MessageSquare,
  Printer,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  FileText,
  DollarSign,
  Calendar,
  Building,
  User,
  ShieldCheck,
  Shield,
  Trash2,
  Check,
  ChevronDown,
  Sparkles,
  RefreshCw,
  Eye,
  FileSignature,
  ArrowRight,
  TrendingUp,
  KeyRound,
  Layers,
  LayoutGrid,
  List as ListIcon,
  BookOpen,
  Download,
  Image as ImageIcon,
  Upload,
  ArrowUp,
  ArrowDown,
  Lock,
} from 'lucide-react';
import { downloadContractDocx } from '../utils/contractDocx';
import { databases, client } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
import { useAuth } from '../context/AuthContext';
import { parseLegalRepresentative, encodeNotesWithLegalRep } from './Contatos';
import { parseAuditDossier } from '../utils/auditTrail';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';
const COLLECTION_CONTRACTS = 'crm_contracts';

// ─── Interfaces & Tipagens de Cláusulas ────────────────────────────────────────

export interface ContractItem {
  name: string;
  description?: string;
  qty: number;
  rate: number;
  amount: number;
  unit?: string;
}

export type ClauseCategory =
  | 'Telefonia'
  | 'Chip'
  | 'Equipamentos'
  | 'SLA'
  | 'LGPD'
  | 'Faturamento'
  | 'Geral';

export interface ContractClause {
  id: string;
  category: ClauseCategory;
  title: string;
  text: string;
  imageUrl?: string;
  imagePosition?: 'below' | 'above';
  enabledByDefault?: boolean;
}

export const CLAUSE_CATEGORIES: {
  id: ClauseCategory;
  label: string;
  icon: string;
  badgeClass: string;
  desc: string;
}[] = [
  {
    id: 'Telefonia',
    label: 'Telefonia & PABX',
    icon: '📞',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40',
    desc: 'Ramais SIP, PABX em nuvem, minutos e portabilidade',
  },
  {
    id: 'Chip',
    label: 'Chip & Conectividade',
    icon: '📱',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40',
    desc: 'SIM Cards móveis corporativos, franquia de dados e roaming',
  },
  {
    id: 'Equipamentos',
    label: 'Equipamentos & Comodato',
    icon: '🖥️',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40',
    desc: 'Aparelhos IP, roteadores, switches e regras de devolução',
  },
  {
    id: 'SLA',
    label: 'SLA & Suporte',
    icon: '⏱️',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40',
    desc: 'Níveis de serviço, tempo de resposta e plantão técnico',
  },
  {
    id: 'Faturamento',
    label: 'Faturamento & Reajuste',
    icon: '💳',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/40',
    desc: 'Vencimento, mora, ciclo de cobrança e índice IPCA',
  },
  {
    id: 'LGPD',
    label: 'LGPD & Privacidade',
    icon: '🔒',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/40',
    desc: 'Tratamento de dados pessoais em conformidade com Lei 13.709/18',
  },
  {
    id: 'Geral',
    label: 'Validade & Foro',
    icon: '⚖️',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    desc: 'Assinatura digital (MP 2.200-2/01) e foro de eleição',
  },
];

export const DEFAULT_LIBRARY_CLAUSES: ContractClause[] = [
  {
    id: 'cl-telefonia-1',
    category: 'Telefonia',
    title: 'CLÁUSULA 1ª - DA PRESTAÇÃO DE TELEFONIA & PABX EM NUVEM',
    text: 'A CONTRATADA disponibilizará infraestrutura corporativa de Telefonia IP e PABX Virtual em Nuvem, contemplando ramais digitais, URA de atendimento, gravação de chamadas e roteamento inteligente. A CONTRATANTE é responsável por garantir banda e estabilidade de conexão de dados (QoS) para correta fluidez do tráfego de voz.',
    enabledByDefault: true,
  },
  {
    id: 'cl-chip-1',
    category: 'Chip',
    title: 'CLÁUSULA 2ª - DOS CHIPS E CONECTIVIDADE MÓVEL (VOZ & DADOS)',
    text: 'O fornecimento de SIM Cards / Chips móveis corporativos contempla o pacote de franquia mensal de dados e minutos estipulado no escopo. É vedado o uso indevido ou desvio de finalidade. Tráfegos excedentes ou consumo fora da cobertura nacional (roaming internacional) serão faturados à parte, consoante tabela tarifária vigente.',
    enabledByDefault: false,
  },
  {
    id: 'cl-equipamentos-1',
    category: 'Equipamentos',
    title: 'CLÁUSULA 3ª - DOS EQUIPAMENTOS EM REGIME DE COMODATO',
    text: 'Os aparelhos telefônicos IP, gateways, switches e roteadores fornecidos para a viabilização dos serviços são cedidos sob regime de Comodato Gratuito durante a vigência do contrato. Os equipamentos permanecem sob propriedade inalienável da CONTRATADA, obrigando-se a CONTRATANTE a zelar por sua guarda e conservação, restituindo-os ao término do contrato em perfeito estado de funcionamento.',
    enabledByDefault: true,
  },
  {
    id: 'cl-sla-1',
    category: 'SLA',
    title: 'CLÁUSULA 4ª - DOS NÍVEIS DE SERVIÇO (SLA) E SUPORTE TÉCNICO',
    text: 'A CONTRATADA assegura suporte técnico especializado de segunda a sexta-feira, das 08h às 18h, com índice de disponibilidade de plataforma de 99,5% (noventa e nove vírgula cinco por cento) ao mês. Chamados de gravidade crítica (interrupção total) terão início de atendimento em até 2 (duas) horas úteis, e demandas operacionais rotineiras em até 8 (oito) horas úteis.',
    enabledByDefault: true,
  },
  {
    id: 'cl-faturamento-1',
    category: 'Faturamento',
    title: 'CLÁUSULA 5ª - DO PREÇO, FATURAMENTO E REAJUSTE ANUAL',
    text: 'Pelo cumprimento do objeto deste contrato, o CONTRATANTE pagará à CONTRATADA o valor recorrente e eventuais taxas discriminadas, respeitando o ciclo contratado. O atraso no adimplemento ensejará multa moratória de 2% (dois por cento) sobre o débito, juros de 1% ao mês e correção legal. Os valores acordados serão reajustados anualmente pela variação acumulada do índice IPCA/IBGE ou, na sua ausência, pelo IGP-M/FGV.',
    enabledByDefault: true,
  },
  {
    id: 'cl-lgpd-1',
    category: 'LGPD',
    title: 'CLÁUSULA 6ª - DA PROTEÇÃO DE DADOS PESSOAIS (LGPD)',
    text: 'As partes declaram formalmente conhecer e cumprir integralmente as normas da Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados - LGPD). Comprometem-se a tratar dados pessoais estritamente no limite necessário à consecução do objeto deste contrato, adotando medidas técnicas e administrativas aptas a resguardar a integridade, sigilo e privacidade dos titulares.',
    enabledByDefault: true,
  },
  {
    id: 'cl-geral-1',
    category: 'Geral',
    title: 'CLÁUSULA 7ª - DA ASSINATURA ELETRÔNICA E FORO DE ELEIÇÃO',
    text: 'As partes reconhecem a plena validade, higidez jurídica e exequibilidade deste documento formalizado por meio de assinatura eletrônica, nos termos do art. 10, § 2º da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020. Fica eleito o Foro da Comarca da sede da CONTRATADA para dirimir quaisquer controvérsias oriundas deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.',
    enabledByDefault: true,
  },
];

export const DEFAULT_TELEFONIA_FULL_TEXT = `TELEFONIA FÁCIL, inscrita no CNPJ sob o nº 27.693.221/0001-49, com sede na Rua Conceição, 233, Andar 9, Sala 916, Centro, Campinas/SP, CEP 13010-050, neste ato representada por seu representante legal, doravante denominada simplesmente "TELEFONIA FÁCIL", e a CONTRATANTE, qualificada no Anexo I deste instrumento, resolvem celebrar o presente Contrato de Prestação de Serviços de Telefonia e Comodato de Equipamentos, que se regerá pelas cláusulas e condições a seguir.

1. DO OBJETO
1.1. Constitui objeto deste Contrato a prestação, pela TELEFONIA FÁCIL, de serviços de telefonia, disponibilização de números DID, procedimentos, plataforma de gerência e demais funcionalidades desenvolvidas, licenciadas ou contratadas pela TELEFONIA FÁCIL, conforme especificações constantes neste instrumento e em seus anexos.
1.2. Quando expressamente previsto no Anexo I, poderão ser disponibilizados equipamentos em comodato para viabilizar a prestação dos serviços contratados.

2. DOS ANEXOS E DOCUMENTOS APLICÁVEIS
2.1. Integram o presente Contrato, para todos os fins de direito:
a) Anexo I – Termo de Adesão e Condições Comerciais, no qual constam a qualificação das partes, os serviços, os equipamentos, os preços e a forma de pagamento contratados pela CONTRATANTE;
b) Anexo II – Acordo de Nível de Serviço (SLA);
c) Anexo III – Termo de Comodato de Equipamentos.

3. DOS DIREITOS E OBRIGAÇÕES DAS PARTES
3.1. A CONTRATADA compromete-se a fornecer a infraestrutura necessária e adequada para a prestação dos serviços de telefonia em nuvem e comunicação corporativa, garantindo a estabilidade e prestando assistência e suporte técnico de acordo com os níveis de serviço estipulados no Anexo II.
3.2. A CONTRATANTE é responsável por garantir banda e estabilidade de conexão de dados (QoS) para correta fluidez do tráfego de voz, efetuando o pagamento pontual das mensalidades e encargos contratuais.

4. DA CONFIDENCIALIDADE E PROTEÇÃO DE DADOS (LGPD)
4.1. As Partes obrigam-se a manter sob sigilo todas as informações confidenciais a que tiverem acesso em razão deste Contrato e a cumprir integralmente a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados - LGPD).

5. DA VIGÊNCIA E RESCISÃO
5.1. O presente instrumento entra em vigor na data de sua assinatura digital e permanecerá vigente pelo prazo estipulado no Anexo I, renovando-se automaticamente por períodos iguais e sucessivos caso não haja manifestação formal em contrário com antecedência de 30 (trinta) dias.

6. DO FORO DE ELEIÇÃO
6.1. Fica eleito o Foro da Comarca da sede da CONTRATADA para dirimir quaisquer controvérsias decorrentes deste Contrato, com expressa renúncia a qualquer outro, por mais privilegiado que seja.`;

export const DEFAULT_CHIP_FULL_TEXT = `CONTRATO DE FORNECIMENTO DE CONECTIVIDADE MÓVEL E CHIPS CORPORATIVOS M2M/IOT

1. DO OBJETO
1.1. Constitui objeto deste instrumento o fornecimento de SIM Cards (Chips móveis corporativos) com plano de dados e voz conforme especificado no Quadro Resumo comercial.
1.2. A CONTRATADA assegura a cobertura de sinal dentro do território nacional conforme área de cobertura das operadoras homologadas pela Anatel.

2. DAS CONDIÇÕES DE USO E FRANQUIA
2.1. O consumo de dados é restrito à finalidade corporativa e equipamentos autorizados.
2.2. O consumo excedente à franquia contratada ou o uso em roaming internacional será tarifado conforme tabela de serviços adicionais.

3. DA SEGURANÇA E BLOQUEIO
3.1. Em caso de perda, furto ou extravio do chip, a CONTRATANTE deverá comunicar imediatamente à CONTRATADA para bloqueio preventivo da linha.`;

export const DEFAULT_EQUIPAMENTOS_FULL_TEXT = `TERMO DE COMODATO DE EQUIPAMENTOS DE TELECOMUNICAÇÃO E TI

1. DO OBJETO DO COMODATO
1.1. A CONTRATADA cede à CONTRATANTE, a título de COMODATO GRATUITO, os equipamentos discriminados na relação de itens contratados (aparelhos IP, gateways, roteadores e switches), para uso exclusivo na execução dos serviços acordados.

2. DA PROPRIEDADE E CONSERVAÇÃO
2.1. Os equipamentos permanecem sob propriedade inalienável da CONTRATADA.
2.2. A CONTRATANTE assume a responsabilidade pela guarda, conservação e integridade física dos aparelhos durante todo o período de permanência sob sua posse.

3. DA RESTITUIÇÃO
3.1. Ao término ou rescisão do contrato de prestação de serviços, a CONTRATANTE obriga-se a devolver todos os equipamentos em perfeito estado de conservação no prazo improrrogável de até 15 (quinze) dias corridos.`;

const CLAUSES_STORAGE_KEY = 'crm_contract_clauses_library_v1';
const CONTRACT_FULL_TEXT_KEY = 'crm_contract_full_text_template_v1';

export function getStoredContractFullText(): string {
  try {
    const saved = localStorage.getItem(CONTRACT_FULL_TEXT_KEY);
    if (saved && saved.trim()) return saved;
  } catch {}
  return DEFAULT_TELEFONIA_FULL_TEXT;
}

export function saveStoredContractFullText(text: string): void {
  try {
    localStorage.setItem(CONTRACT_FULL_TEXT_KEY, text);
  } catch (e) {
    console.error('Erro ao salvar minuta padrão:', e);
  }
}

export function clausesToContinuousText(clauses: ContractClause[]): string {
  if (!clauses || clauses.length === 0) return '';
  return clauses.map((c, i) => `${c.title || `CLÁUSULA ${i + 1}ª`}\n${c.text}`).join('\n\n');
}

export function continuousTextToClauses(text: string, defaultCategory: ClauseCategory = 'Telefonia'): ContractClause[] {
  if (!text || !text.trim()) return [];
  const regex = /(?:^|\n)(?=(?:\d+\.|\bCLÁUSULA\s*\d*[ªaºo]?\b))/i;
  const parts = text.split(regex).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) {
    return [
      {
        id: `cl-${Date.now()}`,
        category: defaultCategory,
        title: 'CONDIÇÕES CONTRATUAIS',
        text: text.trim(),
        enabledByDefault: true,
      },
    ];
  }

  return parts.map((part, idx) => {
    const lines = part.split('\n');
    const firstLine = lines[0].trim();
    const isHeader = /^(\d+\.|\bCLÁUSULA\b)/i.test(firstLine);
    const title = isHeader ? firstLine : `ITEM ${idx + 1}`;
    const body = isHeader ? lines.slice(1).join('\n').trim() : part;

    let cat: ClauseCategory = defaultCategory;
    const combined = `${title} ${body}`.toLowerCase();
    if (combined.includes('chip') || combined.includes('móvel') || combined.includes('sim card')) cat = 'Chip';
    else if (combined.includes('equipamento') || combined.includes('comodato') || combined.includes('aparelho')) cat = 'Equipamentos';
    else if (combined.includes('sla') || combined.includes('nível de serviço') || combined.includes('suporte')) cat = 'SLA';
    else if (combined.includes('faturamento') || combined.includes('reajuste') || combined.includes('preço')) cat = 'Faturamento';
    else if (combined.includes('lgpd') || combined.includes('dados') || combined.includes('privacidade')) cat = 'LGPD';
    else if (combined.includes('foro') || combined.includes('vigência') || combined.includes('rescisão')) cat = 'Geral';

    return {
      id: `cl-txt-${idx + 1}`,
      category: cat,
      title,
      text: body,
      enabledByDefault: true,
    };
  });
}

export function getStoredClauseLibrary(): ContractClause[] {
  try {
    const saved = localStorage.getItem(CLAUSES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_LIBRARY_CLAUSES;
}

export function saveStoredClauseLibrary(clauses: ContractClause[]): void {
  try {
    localStorage.setItem(CLAUSES_STORAGE_KEY, JSON.stringify(clauses));
  } catch (e) {
    console.error('Erro ao salvar biblioteca de cláusulas:', e);
  }
}

export function compressImageToBase64(file: File, callback: (base64: string) => void) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 700;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL('image/jpeg', 0.72));
      }
    };
    img.src = e.target?.result as string;
  };
  reader.readAsDataURL(file);
}

export function encodeClausesForAppwrite(clauses: ContractClause[], fullText?: string): string {
  // Se for texto contínuo, grava um payload compacto
  if (fullText && fullText.trim()) {
    const compactObj = {
      mode: 'full_text',
      text: fullText.length > 2500 ? fullText.slice(0, 2400) + '...' : fullText,
    };
    const json = JSON.stringify(compactObj);
    if (json.length <= 2700) return json;
  }

  // Strip all base64 data: URLs so it doesn't blow past Appwrite's 3000 chars limit
  let compact = clauses.map((c) => ({
    id: c.id,
    cat: c.category,
    t: c.title,
    txt: c.text,
    img: c.imageUrl && !c.imageUrl.startsWith('data:') && c.imageUrl.length < 150 ? c.imageUrl : undefined,
    pos: c.imagePosition || 'below',
  }));

  let json = JSON.stringify(compact);
  if (json.length <= 2700) return json;

  // Se exceder 2700 caracteres, trunca o texto proporcionalmente para caber com ampla folga
  const perClauseLimit = Math.max(60, Math.floor(2100 / compact.length));
  compact = compact.map((c) => ({
    ...c,
    txt: c.txt.length > perClauseLimit ? c.txt.slice(0, perClauseLimit) + '...' : c.txt,
  }));
  json = JSON.stringify(compact);
  if (json.length <= 2700) return json;

  // Limite extremo de segurança: títulos e IDs
  const ultraCompact = compact.map((c) => ({
    id: c.id,
    cat: c.cat,
    t: c.t,
    txt: c.txt.slice(0, 40),
  }));
  return JSON.stringify(ultraCompact).slice(0, 2700);
}

export function parseContractClauses(clausesJson?: string, contractId?: string): ContractClause[] {
  // 1. Prioridade máxima: localStorage específico deste contrato (com imagens integrais e sem cortes)
  if (contractId) {
    try {
      const local = localStorage.getItem(`contract_clauses_${contractId}`);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const localText = localStorage.getItem(`contract_text_${contractId}`);
      if (localText && localText.trim()) {
        return continuousTextToClauses(localText);
      }
    } catch {}
  }

  // 2. Parse do JSON gravado no banco Appwrite
  if (clausesJson) {
    try {
      const parsed = JSON.parse(clausesJson);
      // Se gravado como modo texto contínuo
      if (parsed && typeof parsed === 'object' && parsed.mode === 'full_text' && parsed.text) {
        return continuousTextToClauses(parsed.text);
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        const lib = getStoredClauseLibrary();
        return parsed.map((item, idx) => {
          const id = item.id || `cl-${idx}`;
          const category = (item.category || item.cat || 'Geral') as ClauseCategory;
          const title = item.title || item.t || `CLÁUSULA ${idx + 1}ª`;
          let text = item.text || item.txt || '';
          let imageUrl = item.imageUrl || item.img || '';
          const imagePosition = (item.imagePosition || item.pos || 'below') as 'above' | 'below';

          // Se o texto foi encurtado para caber no limite do Appwrite, recupera o original da biblioteca
          const matchLib = lib.find((l) => l.id === id || l.title.toLowerCase() === title.toLowerCase());
          if (matchLib) {
            if (!text || text.endsWith('...') || text.length < matchLib.text.length) {
              text = matchLib.text;
            }
            if (!imageUrl && matchLib.imageUrl) {
              imageUrl = matchLib.imageUrl;
            }
          }

          return {
            id,
            category,
            title,
            text,
            imageUrl,
            imagePosition,
            enabledByDefault: true,
          };
        });
      }
    } catch {}
  }

  return continuousTextToClauses(getStoredContractFullText());
}

export function parseContractItems(itemsJson?: string): ContractItem[] {
  if (!itemsJson) return [];
  try {
    const parsed = JSON.parse(itemsJson);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

export function getContractFullText(contract: any): string {
  if (contract?.id) {
    try {
      const local = localStorage.getItem(`contract_text_${contract.id}`);
      if (local && local.trim()) return local;
    } catch {}
  }
  if (contract?.clauses_json) {
    try {
      const parsed = JSON.parse(contract.clauses_json);
      if (parsed && typeof parsed === 'object' && parsed.mode === 'full_text' && parsed.text) {
        return parsed.text;
      }
    } catch {}
  }
  const clauses = parseContractClauses(contract?.clauses_json, contract?.id);
  return clausesToContinuousText(clauses);
}

const DEFAULT_PROVIDER = {
  name: 'Iris Horizon Soluções Tecnológicas Ltda',
  document: '45.123.456/0001-89',
  address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, CEP 01310-100',
};

// Formata CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) com separadores
export function formatDocumentMask(value?: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 11) {
    return digits
      .slice(0, 11)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return digits
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function Contratos() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [proposals, setProposals] = useState<ProposalOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtros e Visualização
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_signature' | 'signed' | 'draft' | 'cancelled'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');

  // Modais
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [activeShareContract, setActiveShareContract] = useState<Contract | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [activeAuditContract, setActiveAuditContract] = useState<Contract | null>(null);

  // Toast / Feedback de cópia
  const [copiedContractId, setCopiedContractId] = useState<string | null>(null);
  const [copiedLinkFeedback, setCopiedLinkFeedback] = useState(false);

  // Estado do Formulário de Criação
  const [selectedProposalId, setSelectedProposalId] = useState<string>('');
  const [formContractNumber, setFormContractNumber] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formClientDocument, setFormClientDocument] = useState('');
  const [formClientEmail, setFormClientEmail] = useState('');
  const [formClientPhone, setFormClientPhone] = useState('');
  const [formClientAddress, setFormClientAddress] = useState('');
  const [formLegalRepName, setFormLegalRepName] = useState('');
  const [formLegalRepCpf, setFormLegalRepCpf] = useState('');
  const [formProviderName, setFormProviderName] = useState(DEFAULT_PROVIDER.name);
  const [formProviderDocument, setFormProviderDocument] = useState(DEFAULT_PROVIDER.document);
  const [formProviderAddress, setFormProviderAddress] = useState(DEFAULT_PROVIDER.address);
  const [formStartDate, setFormStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formEndDate, setFormEndDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [formBillingCycle, setFormBillingCycle] = useState('Mensal');
  const [formTotalValue, setFormTotalValue] = useState<number>(0);
  const [formSetupFee, setFormSetupFee] = useState<number>(0);
  const [formItems, setFormItems] = useState<ContractItem[]>([]);

  // Gestão de Biblioteca de Cláusulas Padrão (Fora do Contrato)
  const [libraryClauses, setLibraryClauses] = useState<ContractClause[]>(getStoredClauseLibrary);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState<string>('all');
  const [librarySavedFeedback, setLibrarySavedFeedback] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'full_text' | 'modular'>('full_text');
  const [libraryFullText, setLibraryFullText] = useState<string>(getStoredContractFullText);

  // Modo de Edição de Termos Contratuais: 'full_text' (Minuta Contínua estilo Word) ou 'modular' (Cláusulas Modulares)
  const [clauseEditorMode, setClauseEditorMode] = useState<'full_text' | 'modular'>('full_text');
  const [formContractFullText, setFormContractFullText] = useState<string>(getStoredContractFullText);
  const [formContractImage, setFormContractImage] = useState<string>('');

  // Cláusulas Selecionadas & Customizadas para o Contrato em Edição (No Contrato)
  const [formClauses, setFormClauses] = useState<ContractClause[]>(() =>
    getStoredClauseLibrary().filter((c) => c.enabledByDefault)
  );
  const [contractCategoryFilter, setContractCategoryFilter] = useState<string>('all');
  const [expandedClauseCustomizer, setExpandedClauseCustomizer] = useState<string | null>(null);

  // Download Word (.docx)
  const [downloadingDocxId, setDownloadingDocxId] = useState<string | null>(null);

  const [formNotes, setFormNotes] = useState('');
  const [savingContract, setSavingContract] = useState(false);
  const [createError, setCreateError] = useState('');

  // ─── Carregamento Inicial & Realtime ─────────────────────────────────────────

  const loadData = async () => {
    try {
      const [cRes, pRes, clRes]: any[] = await Promise.all([
        databases.listDocuments(DATABASE_ID, COLLECTION_CONTRACTS, [
          Query.orderDesc('$createdAt'),
          Query.limit(100),
        ]),
        databases.listDocuments(DATABASE_ID, 'crm_proposals', [
          Query.orderDesc('created_at'),
          Query.limit(100),
        ]),
        databases.listDocuments(DATABASE_ID, 'clients', [
          Query.orderAsc('name'),
          Query.limit(300),
        ]),
      ]);

      setContracts(cRes.documents.map((d: any) => ({ ...d, id: d.$id })));
      setProposals(pRes.documents.map((d: any) => ({ ...d, id: d.$id })));
      setClients(clRes.documents.map((d: any) => ({ ...d, id: d.$id })));
    } catch (err) {
      console.error('Erro ao carregar dados de contratos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Inscrição em tempo real para status de assinatura do contrato
    const channel = `databases.${DATABASE_ID}.collections.${COLLECTION_CONTRACTS}.documents`;
    const unsubscribe = client.subscribe(channel, (response: any) => {
      if (response.events.some((e: string) => e.includes('.create'))) {
        setContracts((prev) => [{ ...response.payload, id: response.payload.$id }, ...prev]);
      } else if (response.events.some((e: string) => e.includes('.update'))) {
        setContracts((prev) =>
          prev.map((c) => (c.id === response.payload.$id ? { ...response.payload, id: response.payload.$id } : c))
        );
      } else if (response.events.some((e: string) => e.includes('.delete'))) {
        setContracts((prev) => prev.filter((c) => c.id !== response.payload.$id));
      }
    });

    return () => {
      try {
        unsubscribe();
      } catch {}
    };
  }, []);

  // Verificar se há proposta ou cliente enviado para criação de contrato via sessionStorage
  useEffect(() => {
    try {
      const rawProp = sessionStorage.getItem('create_contract_from_proposal');
      if (rawProp) {
        sessionStorage.removeItem('create_contract_from_proposal');
        const p = JSON.parse(rawProp);
        if (p?.id) {
          handleOpenCreateModal(p.id);
          return;
        }
      }

      const rawClient = sessionStorage.getItem('create_contract_from_client');
      if (rawClient) {
        sessionStorage.removeItem('create_contract_from_client');
        const c = JSON.parse(rawClient);
        if (c?.name || c?.id) {
          handleOpenCreateModalWithClient(c);
        }
      }
    } catch {}
  }, [proposals, clients]);

  // ─── Métricas ───────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = contracts.length;
    const signed = contracts.filter((c) => c.status === 'signed').length;
    const pending = contracts.filter((c) => c.status === 'pending_signature').length;
    const totalValue = contracts.reduce((acc, c) => acc + (Number(c.total_value) || 0), 0);
    const signedValue = contracts
      .filter((c) => c.status === 'signed')
      .reduce((acc, c) => acc + (Number(c.total_value) || 0), 0);

    return { total, signed, pending, totalValue, signedValue };
  }, [contracts]);

  // ─── Filtragem ──────────────────────────────────────────────────────────────

  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNum = c.contract_number?.toLowerCase().includes(q);
        const matchTitle = c.title?.toLowerCase().includes(q);
        const matchClient = c.client_name?.toLowerCase().includes(q);
        const matchDoc = c.client_document?.toLowerCase().includes(q);
        return matchNum || matchTitle || matchClient || matchDoc;
      }
      return true;
    });
  }, [contracts, statusFilter, search]);

  // ─── Abrir Modal de Criação ─────────────────────────────────────────────────

  const handleOpenCreateModal = async (initialProposalId?: string) => {
    const nextNumber = `CTR-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(4, '0')}`;
    setFormContractNumber(nextNumber);
    setFormTitle('Contrato de Prestação de Serviços & Soluções Tecnológicas');
    setFormProviderName(DEFAULT_PROVIDER.name);
    setFormProviderDocument(DEFAULT_PROVIDER.document);
    setFormProviderAddress(DEFAULT_PROVIDER.address);
    setFormClauses(getStoredClauseLibrary().filter((c) => c.enabledByDefault));
    setClauseEditorMode('full_text');
    setFormContractFullText(getStoredContractFullText());
    setFormContractImage('');
    setFormBillingCycle('Mensal');
    setFormStartDate(new Date().toISOString().slice(0, 10));
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setFormEndDate(nextYear.toISOString().slice(0, 10));
    setCreateError('');

    if (initialProposalId) {
      setSelectedProposalId(initialProposalId);
      await applyProposalToForm(initialProposalId);
    } else {
      setSelectedProposalId('');
      setFormClientId('');
      setFormClientName('');
      setFormClientDocument('');
      setFormClientEmail('');
      setFormClientPhone('');
      setFormClientAddress('');
      setFormLegalRepName('');
      setFormLegalRepCpf('');
      setFormTotalValue(0);
      setFormSetupFee(0);
      setFormItems([
        { name: 'Licença Corporativa Mensal', description: 'Acesso total à plataforma e suporte', qty: 1, rate: 0, amount: 0, unit: 'un' },
      ]);
    }

    setShowCreateModal(true);
  };

  // Abrir Modal de Criação já com cliente selecionado da página de clientes
  const handleOpenCreateModalWithClient = async (clientData: any) => {
    const nextNumber = `CTR-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(4, '0')}`;
    setFormContractNumber(nextNumber);
    setFormTitle(`Contrato de Prestação de Serviços - ${clientData.name || 'Cliente'}`);
    setFormProviderName(DEFAULT_PROVIDER.name);
    setFormProviderDocument(DEFAULT_PROVIDER.document);
    setFormProviderAddress(DEFAULT_PROVIDER.address);
    setFormClauses(getStoredClauseLibrary().filter((c) => c.enabledByDefault));
    setClauseEditorMode('full_text');
    setFormContractFullText(getStoredContractFullText());
    setFormContractImage('');
    setFormBillingCycle('Mensal');
    setFormStartDate(new Date().toISOString().slice(0, 10));
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setFormEndDate(nextYear.toISOString().slice(0, 10));
    setCreateError('');

    setFormClientId(clientData.id || '');
    setFormClientName(clientData.name || '');
    setFormClientDocument(formatDocumentMask(clientData.document || ''));
    setFormClientEmail(clientData.email || '');
    setFormClientPhone(clientData.phone || '');
    setFormClientAddress(clientData.address || '');

    const rep = parseLegalRepresentative(clientData.notes);
    setFormLegalRepName(clientData.legal_representative_name || rep.name || '');
    setFormLegalRepCpf(clientData.legal_representative_cpf || rep.cpf || '');

    // Verifica se esse cliente possui proposta comercial cadastrada
    const matchedProp = proposals.find(
      (p) =>
        (clientData.id && p.related_id === clientData.id) ||
        (clientData.name && p.to_name && p.to_name.toLowerCase() === clientData.name.toLowerCase())
    );

    if (matchedProp) {
      setSelectedProposalId(matchedProp.id);
      await applyProposalToForm(matchedProp.id);
    } else {
      setSelectedProposalId('');
      setFormTotalValue(0);
      setFormSetupFee(0);
      setFormItems([
        { name: 'Licença Corporativa Mensal', description: 'Acesso total à plataforma e suporte', qty: 1, rate: 0, amount: 0, unit: 'un' },
      ]);
    }

    setShowCreateModal(true);
  };

  // Puxar dados ao selecionar cliente diretamente no modal
  const applyClientToForm = async (clientId: string) => {
    const cl = clients.find((c) => c.id === clientId);
    if (!cl) return;

    setFormClientId(cl.id);
    setFormClientName(cl.name || '');
    setFormClientDocument(formatDocumentMask(cl.document || ''));
    setFormClientEmail(cl.email || '');
    setFormClientPhone(cl.phone || '');

    const rep = parseLegalRepresentative(cl.notes);
    setFormLegalRepName((cl as any).legal_representative_name || rep.name || '');
    setFormLegalRepCpf((cl as any).legal_representative_cpf || rep.cpf || '');

    const addr = [
      cl.street,
      cl.city ? `${cl.city}/${cl.state || ''}` : '',
      cl.cep ? `CEP: ${cl.cep}` : ''
    ].filter(Boolean).join(' - ');
    setFormClientAddress(addr);
    setFormTitle(`Contrato de Prestação de Serviços - ${cl.name}`);

    // Procurar proposta comercial deste cliente (preferência por proposta aceita)
    const clientProposal = proposals.find(
      (p) =>
        (p.related_id && p.related_id === cl.id) ||
        (p.to_name && p.to_name.toLowerCase() === cl.name.toLowerCase())
    );

    if (clientProposal) {
      setSelectedProposalId(clientProposal.id);
      await applyProposalToForm(clientProposal.id);
    }
  };

  // Preenche dados completos ao selecionar ou importar uma proposta comercial
  const applyProposalToForm = async (propId: string) => {
    const p = proposals.find((item) => item.id === propId);
    if (!p) return;

    setFormTitle(`Contrato de Prestação de Serviços - ${p.to_name || p.subject}`);
    setFormClientName(p.to_name || '');
    setFormClientEmail(p.email || '');
    setFormClientPhone(p.phone || '');

    const addr = [p.address, p.city, p.state, p.zip_code ? `CEP: ${p.zip_code}` : ''].filter(Boolean).join(', ');
    setFormClientAddress(addr);

    // Início de vigência: puxa da proposta (data de emissão ou vigência acordada)
    const startDate = p.start_date || p.date || new Date().toISOString().slice(0, 10);
    setFormStartDate(startDate);

    try {
      const sDate = new Date(startDate + 'T00:00:00');
      if (!isNaN(sDate.getTime())) {
        sDate.setFullYear(sDate.getFullYear() + 1);
        setFormEndDate(sDate.toISOString().slice(0, 10));
      }
    } catch {}

    // Tentar localizar documento do cliente na lista de clientes para garantir CPF/CNPJ com separadores
    let clientDoc = '';
    if (p.related_id) {
      setFormClientId(p.related_id);
      const cl = clients.find((c) => c.id === p.related_id);
      if (cl) {
        if (cl.document) clientDoc = cl.document;
        if (!addr && (cl.street || cl.city)) {
          const fullAddr = [
            cl.street,
            cl.city ? `${cl.city}/${cl.state || ''}` : '',
            cl.cep ? `CEP: ${cl.cep}` : '',
          ].filter(Boolean).join(' - ');
          setFormClientAddress(fullAddr);
        }
      }
    } else {
      const cl = clients.find((c) => c.name.toLowerCase() === (p.to_name || '').toLowerCase());
      if (cl) {
        setFormClientId(cl.id);
        if (cl.document) clientDoc = cl.document;
      }
    }

    if (clientDoc) {
      setFormClientDocument(formatDocumentMask(clientDoc));
    } else if (p.client_document || p.document) {
      setFormClientDocument(formatDocumentMask(p.client_document || p.document));
    }

    // Carregar itens da proposta comercial e discriminar taxas, recorrência e ciclo
    try {
      const { documents: itemsData } = await databases.listDocuments(DATABASE_ID, 'crm_proposal_items', [
        Query.equal('proposal_id', propId),
        Query.limit(50),
      ]);

      let detectedSetupFee = 0;
      let detectedRecurringValue = 0;
      let detectedBillingCycle = p.billing_cycle || 'Mensal';

      if (itemsData && itemsData.length > 0) {
        const mappedItems: ContractItem[] = itemsData.map((d: any) => {
          const name = d.name || '';
          const desc = d.description || d.long_description || '';
          const qty = Number(d.qty) || 1;
          const rate = Number(d.rate) || 0;
          const amount = Number(d.amount) || qty * rate;

          // Detecta taxa de implantação / setup / adesão / instalação
          const isSetup = /(implanta|implant|setup|ades|instal|treinamento|ativa)/i.test(`${name} ${desc}`);
          if (isSetup) {
            detectedSetupFee += amount;
          } else {
            detectedRecurringValue += amount;
          }

          // Detecta ciclo de faturamento se mencionado no item
          if (/(anual|ano|12 meses)/i.test(`${name} ${desc}`)) {
            detectedBillingCycle = 'Anual';
          } else if (/(semestral|6 meses)/i.test(`${name} ${desc}`)) {
            detectedBillingCycle = 'Semestral';
          } else if (/(trimestral|3 meses)/i.test(`${name} ${desc}`)) {
            detectedBillingCycle = 'Trimestral';
          }

          return {
            name,
            description: desc,
            qty,
            rate,
            amount,
            unit: d.unit || 'un',
          };
        });

        setFormItems(mappedItems);

        // Se a proposta tiver setup_fee explícito no cabeçalho
        if (Number(p.setup_fee) > 0) {
          detectedSetupFee = Number(p.setup_fee);
        }

        // Se detectedRecurringValue for 0, calcula como total menos o setup
        if (detectedRecurringValue === 0) {
          detectedRecurringValue = Math.max(0, (Number(p.total) || 0) - detectedSetupFee);
        }

        setFormSetupFee(detectedSetupFee);
        setFormTotalValue(detectedRecurringValue > 0 ? detectedRecurringValue : (Number(p.total) || 0));
        setFormBillingCycle(detectedBillingCycle);
      } else {
        const totalProp = Number(p.total) || 0;
        const setupFeeProp = Number(p.setup_fee) || 0;
        const recurringProp = totalProp - setupFeeProp > 0 ? totalProp - setupFeeProp : totalProp;

        setFormTotalValue(recurringProp);
        setFormSetupFee(setupFeeProp);
        setFormBillingCycle(p.billing_cycle || 'Mensal');

        setFormItems([
          {
            name: p.subject || 'Prestação de Serviços Especializados',
            description: 'Conforme condições estabelecidas na proposta comercial aceita',
            qty: 1,
            rate: recurringProp,
            amount: recurringProp,
            unit: 'un',
          },
        ]);
      }
    } catch (err) {
      console.warn('Não foi possível carregar itens detalhados da proposta, usando resumo:', err);
      const totalProp = Number(p.total) || 0;
      const setupFeeProp = Number(p.setup_fee) || 0;
      const recurringProp = totalProp - setupFeeProp > 0 ? totalProp - setupFeeProp : totalProp;

      setFormTotalValue(recurringProp);
      setFormSetupFee(setupFeeProp);
      setFormBillingCycle(p.billing_cycle || 'Mensal');
      setFormItems([
        {
          name: p.subject || 'Serviços Contratados',
          description: 'Prestação de serviços corporativos',
          qty: 1,
          rate: recurringProp,
          amount: recurringProp,
          unit: 'un',
        },
      ]);
    }
  };

  // ─── Salvar Novo Contrato ───────────────────────────────────────────────────

  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (!formClientName.trim()) {
      setCreateError('O nome do cliente / contratante é obrigatório.');
      return;
    }

    if (!formClientDocument.trim()) {
      setCreateError('O documento (CPF ou CNPJ) do cliente é obrigatório para validação jurídica da assinatura.');
      return;
    }

    setSavingContract(true);
    try {
      const signatureToken = ID.unique();
      const contractId = ID.unique();

      // Compilar cláusulas ativas com base no modo selecionado
      let activeClauses = formClauses;
      if (clauseEditorMode === 'full_text') {
        activeClauses = continuousTextToClauses(formContractFullText);
        if (formContractImage && activeClauses.length > 0) {
          activeClauses[0].imageUrl = formContractImage;
          activeClauses[0].imagePosition = 'below';
        }
      }

      // 1. Salvar cópia local integral tanto do texto contínuo quanto das cláusulas estruturadas
      try {
        localStorage.setItem(`contract_text_${contractId}`, formContractFullText);
        localStorage.setItem(`contract_clauses_${contractId}`, JSON.stringify(activeClauses));
      } catch (err) {
        console.warn('Erro ao salvar cláusulas em cache local:', err);
      }

      // 2. Codificar JSON ultra-seguro para o Appwrite (estritamente <= 2700 caracteres, evitando erro de 3000 chars)
      const safeItemsJson = JSON.stringify(formItems);
      const safeClausesJson = encodeClausesForAppwrite(
        activeClauses,
        clauseEditorMode === 'full_text' ? formContractFullText : undefined
      );

      const encodedNotes = encodeNotesWithLegalRep(
        formNotes.trim(),
        formLegalRepName,
        formLegalRepCpf
      );

      const payload = {
        contract_number: formContractNumber.trim(),
        title: formTitle.trim(),
        proposal_id: selectedProposalId || '',
        client_id: formClientId || '',
        client_name: formClientName.trim(),
        client_document: formClientDocument.trim(),
        client_email: formClientEmail.trim(),
        client_phone: formClientPhone.trim(),
        client_address: formClientAddress.trim(),
        provider_name: formProviderName.trim(),
        provider_document: formProviderDocument.trim(),
        provider_address: formProviderAddress.trim(),
        start_date: formStartDate,
        end_date: formEndDate,
        billing_cycle: formBillingCycle,
        total_value: Number(formTotalValue) || 0,
        setup_fee: Number(formSetupFee) || 0,
        items_json: safeItemsJson,
        clauses_json: safeClausesJson,
        notes: encodedNotes,
        status: 'pending_signature',
        signature_token: signatureToken,
        created_at: new Date().toISOString(),
      };

      const doc = await databases.createDocument(DATABASE_ID, COLLECTION_CONTRACTS, contractId, payload);
      try {
        localStorage.setItem(`contract_text_${doc.$id}`, formContractFullText);
        localStorage.setItem(`contract_clauses_${doc.$id}`, JSON.stringify(activeClauses));
        localStorage.setItem(`contract_rep_${doc.$id}`, JSON.stringify({ name: formLegalRepName, cpf: formLegalRepCpf }));
      } catch {}
      const newContract: Contract = {
        ...doc,
        id: doc.$id,
      } as unknown as Contract;

      setContracts((prev) => [newContract, ...prev]);
      setShowCreateModal(false);

      // Abrir modal de compartilhamento imediato
      setActiveShareContract(newContract);
      setShowShareModal(true);
    } catch (err: any) {
      console.error('Erro ao criar contrato:', err);
      setCreateError(err.message || 'Erro ao gerar o contrato no banco de dados.');
    } finally {
      setSavingContract(false);
    }
  };

  // ─── Handlers de Gestão de Cláusulas (No Contrato) ─────────────────────────

  const toggleStandardClauseInContract = (libClause: ContractClause) => {
    setFormClauses((prev) => {
      const exists = prev.some((c) => c.id === libClause.id || c.title === libClause.title);
      if (exists) {
        return prev.filter((c) => c.id !== libClause.id && c.title !== libClause.title);
      } else {
        return [
          ...prev,
          {
            ...libClause,
            id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          },
        ];
      }
    });
  };

  const addCategoryClausesToContract = (category: ClauseCategory) => {
    const fromLib = libraryClauses.filter((c) => c.category === category);
    setFormClauses((prev) => {
      const newItems = fromLib
        .filter((lc) => !prev.some((c) => c.category === category && c.title === lc.title))
        .map((lc) => ({
          ...lc,
          id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        }));
      return [...prev, ...newItems];
    });
  };

  const updateContractClause = (index: number, field: keyof ContractClause, val: any) => {
    setFormClauses((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const removeContractClause = (index: number) => {
    setFormClauses((prev) => prev.filter((_, i) => i !== index));
  };

  const moveContractClause = (index: number, dir: 'up' | 'down') => {
    setFormClauses((prev) => {
      const target = dir === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  const addCustomClauseToContract = () => {
    const nextIdx = formClauses.length + 1;
    setFormClauses((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        category: 'Geral',
        title: `CLÁUSULA ${nextIdx}ª - CONDIÇÃO ESPECÍFICA`,
        text: 'Descreva aqui as condições, escopos técnicos ou regras jurídicas específicas para este cliente...',
        imageUrl: '',
        imagePosition: 'below',
      },
    ]);
  };

  // ─── Handlers de Gestão de Modelos de Cláusulas Padrão (Fora do Contrato) ───

  const handleUpdateLibraryClause = (id: string, field: keyof ContractClause, val: any) => {
    setLibraryClauses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: val } : c))
    );
  };

  const handleAddLibraryClause = (category: ClauseCategory = 'Telefonia') => {
    const nextIdx = libraryClauses.length + 1;
    const newClause: ContractClause = {
      id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      title: `CLÁUSULA ${nextIdx}ª - NOVO MODELO (${category.toUpperCase()})`,
      text: 'Descreva o texto padrão institucional para esta cláusula...',
      enabledByDefault: true,
      imageUrl: '',
      imagePosition: 'below',
    };
    setLibraryClauses((prev) => [...prev, newClause]);
  };

  const handleDeleteLibraryClause = (id: string) => {
    setLibraryClauses((prev) => prev.filter((c) => c.id !== id));
  };

  const handleMoveLibraryClause = (index: number, dir: 'up' | 'down') => {
    setLibraryClauses((prev) => {
      const target = dir === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  const handleResetLibraryToDefault = () => {
    if (!window.confirm('Deseja restaurar as cláusulas e minuta padrão da empresa para o modelo de fábrica?')) return;
    setLibraryClauses(DEFAULT_LIBRARY_CLAUSES);
    saveStoredClauseLibrary(DEFAULT_LIBRARY_CLAUSES);
    setLibraryFullText(DEFAULT_TELEFONIA_FULL_TEXT);
    saveStoredContractFullText(DEFAULT_TELEFONIA_FULL_TEXT);
    setFormContractFullText(DEFAULT_TELEFONIA_FULL_TEXT);
    setLibrarySavedFeedback(true);
    setTimeout(() => setLibrarySavedFeedback(false), 2500);
  };

  const handleSaveLibrary = () => {
    saveStoredClauseLibrary(libraryClauses);
    saveStoredContractFullText(libraryFullText);
    setFormContractFullText(libraryFullText);
    setLibrarySavedFeedback(true);
    setTimeout(() => setLibrarySavedFeedback(false), 2500);
  };

  // ─── Exportar Contrato em Word (.docx) ───────────────────────────────────────

  const handleDownloadWord = async (c: Contract, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) {
      alert('Acesso restrito: Apenas colaboradores autenticados podem exportar contratos em formato Word (.docx).');
      return;
    }
    try {
      setDownloadingDocxId(c.id);
      const items = parseContractItems(c.items_json);
      const clauses = parseContractClauses(c.clauses_json, c.id);
      await downloadContractDocx(c, items, clauses);
    } catch (err) {
      console.error('Erro ao baixar contrato em Word:', err);
      alert('Não foi possível gerar o arquivo Word.');
    } finally {
      setDownloadingDocxId(null);
    }
  };

  // ─── Helpers de Links e WhatsApp ─────────────────────────────────────────────

  const getSignUrl = (c: Contract) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/assinar/${c.id}`;
  };

  const handleCopySignLink = async (c: Contract, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = getSignUrl(c);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedContractId(c.id);
      setCopiedLinkFeedback(true);
      setTimeout(() => {
        setCopiedContractId(null);
        setCopiedLinkFeedback(false);
      }, 2500);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  const handleShareWhatsApp = (c: Contract, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = getSignUrl(c);
    const cleanPhone = (c.client_phone || '').replace(/\D/g, '');
    const cleanDoc = (c.client_document || '').replace(/\D/g, '');
    const isCnpj = cleanDoc.length > 11;
    const ruleHint = isCnpj
      ? 'os 4 primeiros números do seu CNPJ'
      : 'os 4 últimos números do seu CPF';

    const text =
      `Olá, *${c.client_name}*! Tudo bem?\n\n` +
      `Segue o link seguro para assinatura eletrônica do seu contrato *${c.contract_number}*:\n` +
      `🔗 ${url}\n\n` +
      `🔒 *Instrução de Segurança:* Ao acessar o link, digite *${ruleHint}* para desbloquear e assinar o documento de forma 100% digital e com validade jurídica.\n\n` +
      `Qualquer dúvida estamos à disposição!`;

    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    window.open(waUrl, '_blank');
  };

  const handleDeleteContract = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza de que deseja remover este contrato?')) return;
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTION_CONTRACTS, id);
      setContracts((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Erro ao excluir contrato:', err);
      alert('Falha ao excluir contrato.');
    }
  };

  // ─── Renderização de Status ──────────────────────────────────────────────────

  const renderStatusBadge = (status: Contract['status']) => {
    switch (status) {
      case 'signed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Assinado & Válido
          </span>
        );
      case 'pending_signature':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            Aguardando Assinatura
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <X className="w-3.5 h-3.5 text-rose-500" />
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <Clock className="w-3.5 h-3.5" />
            Rascunho
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Top Bar: Título e Botão Novo Contrato ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30">
              Módulo Jurídico & Vendas
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> Válido MP 2.200-2/2001
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <FileSignature className="w-7 h-7 text-violet-600 dark:text-violet-400" />
            Contratos & Assinaturas Digitais
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Gere contratos a partir de propostas aceitas e envie o link para assinatura do cliente com verificação de segurança (4 dígitos CNPJ/CPF).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-white dark:bg-[#121824] hover:bg-slate-50 dark:hover:bg-[#182133] border border-slate-200/80 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 shadow-xs transition-colors"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Botão de Modelos de Cláusulas Padrão (Fora do Contrato) */}
          <button
            onClick={() => setShowLibraryModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#121824] hover:bg-slate-50 dark:hover:bg-[#182133] border border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 font-semibold text-xs shadow-xs transition-colors cursor-pointer"
            title="Gerenciar modelos de cláusulas padrão da empresa (Telefonia, Chip, Equipamentos, SLA, etc.)"
          >
            <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <span className="hidden sm:inline">Modelos de Cláusulas</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 font-bold border border-violet-200 dark:border-violet-800/40">
              Padrão
            </span>
          </button>

          <button
            onClick={() => handleOpenCreateModal()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-700 hover:from-violet-500 hover:to-indigo-600 text-white font-semibold text-sm shadow-md shadow-violet-600/20 transition-all transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Contrato</span>
          </button>
        </div>
      </div>

      {/* ─── Cards de Métricas / KPI Scorecards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs relative overflow-hidden group hover:border-violet-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total de Contratos</span>
            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{stats.total}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">registrados</span>
          </div>
        </div>

        {/* Card 2: Assinados */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Assinados & Válidos</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">{stats.signed}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {stats.total > 0 ? `${Math.round((stats.signed / stats.total) * 100)}% de conversão` : '0%'}
            </span>
          </div>
        </div>

        {/* Card 3: Pendentes */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Aguardando Assinatura</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 tracking-tight">{stats.pending}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">links ativos</span>
          </div>
        </div>

        {/* Card 4: Valor Total */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs relative overflow-hidden group hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Valor Contratado</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {stats.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Barra de Filtros, Busca & Seletores ─── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
        {/* Campo de Busca */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, cliente, CNPJ/CPF ou título..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        {/* Tabs de Filtro de Status */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'pending_signature', label: 'Aguardando' },
              { id: 'signed', label: 'Assinados' },
              { id: 'draft', label: 'Rascunhos' },
              { id: 'cancelled', label: 'Cancelados' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.04]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Alternador de Visualização (Cards vs Tabela) */}
        <div className="hidden md:flex items-center gap-1 border-l border-slate-200 dark:border-white/[0.08] pl-3">
          <button
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'cards'
                ? 'bg-slate-100 dark:bg-white/[0.08] text-violet-600 dark:text-white font-semibold'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
            title="Visualização em Cards"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === 'table'
                ? 'bg-slate-100 dark:bg-white/[0.08] text-violet-600 dark:text-white font-semibold'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
            title="Visualização em Tabela"
          >
            <ListIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── Lista / Cards de Contratos ─── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-violet-500" />
          <p className="text-sm">Carregando contratos e registros de auditoria...</p>
        </div>
      ) : filteredContracts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#121824] border border-dashed border-slate-300 dark:border-white/[0.1] shadow-xs space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400">
            <FileSignature className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Nenhum contrato encontrado</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {search || statusFilter !== 'all'
              ? 'Nenhum resultado corresponde aos filtros aplicados.'
              : 'Você ainda não possui contratos gerados. Selecione uma proposta comercial aceita e gere o primeiro contrato digital!'}
          </p>
          <button
            onClick={() => handleOpenCreateModal()}
            className="inline-flex items-center gap-2 px-4 py-2 mt-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Criar Contrato Agora
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* Visualização em Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredContracts.map((c) => {
            const isSigned = c.status === 'signed';
            const cleanDoc = (c.client_document || '').replace(/\D/g, '');
            const isCnpj = cleanDoc.length > 11;

            return (
              <div
                key={c.id}
                className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] hover:border-violet-500/40 p-5 flex flex-col justify-between space-y-4 shadow-xs hover:shadow-md transition-all group relative overflow-hidden"
              >
                {/* Linha de Destaque Superior */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${
                    isSigned
                      ? 'bg-emerald-500'
                      : c.status === 'pending_signature'
                      ? 'bg-amber-500'
                      : 'bg-slate-400 dark:bg-slate-700'
                  }`}
                />

                {/* Cabeçalho do Card */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-0.5 rounded-md border border-violet-200 dark:border-violet-500/20">
                      {c.contract_number}
                    </span>
                    {renderStatusBadge(c.status)}
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight line-clamp-1 group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors">
                    {c.title}
                  </h3>

                  {/* Dados do Cliente */}
                  <div className="mt-3 p-3 rounded-xl bg-slate-50/80 dark:bg-[#0b0f17] border border-slate-200/60 dark:border-white/[0.05] space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-300 font-semibold truncate">
                      <User className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                      <span className="truncate">{c.client_name}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      <span>{isCnpj ? 'CNPJ' : 'CPF'}: {formatDocumentMask(c.client_document)}</span>
                      <span className="text-violet-600 dark:text-violet-400/80 text-[10px] bg-violet-50 dark:bg-violet-500/10 px-1.5 py-0.5 rounded">
                        PIN: {isCnpj ? '1ºs 4 dígitos' : 'Últimos 4'}
                      </span>
                    </div>

                    {c.client_phone && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Tel: {c.client_phone}
                      </div>
                    )}
                  </div>
                </div>

                {/* Valores & Prazos */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-white/[0.06]">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Valor / Ciclo</span>
                    <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                      {(c.total_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{c.billing_cycle || 'Mensal'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Vigência</span>
                    <div className="text-slate-700 dark:text-slate-300 mt-0.5 font-mono text-[11px]">
                      {c.start_date ? new Date(c.start_date).toLocaleDateString('pt-BR') : '-'}
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      até {c.end_date ? new Date(c.end_date).toLocaleDateString('pt-BR') : 'Indeterminado'}
                    </span>
                  </div>
                </div>

                {/* Se assinado: informações do certificado */}
                {isSigned && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs space-y-1">
                    <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 font-semibold text-[11px]">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Assinatura Eletrônica Válida
                      </span>
                      <span>{c.signed_at ? new Date(c.signed_at).toLocaleDateString('pt-BR') : ''}</span>
                    </div>
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                      Por: <b>{c.signed_by_name || c.client_name}</b> (IP: {c.signed_by_ip || 'Auditado'})
                    </p>
                  </div>
                )}

                {/* Barra de Ações */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                  {/* Botão Copiar Link */}
                  <button
                    onClick={(e) => handleCopySignLink(c, e)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-200 transition"
                    title="Copiar link de assinatura pública"
                  >
                    {copiedContractId === c.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Copiar Link</span>
                      </>
                    )}
                  </button>

                  {/* WhatsApp */}
                  <button
                    onClick={(e) => handleShareWhatsApp(c, e)}
                    className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition"
                    title="Enviar link via WhatsApp com mensagem formatada"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>

                  {/* Visualizar / Assinar */}
                  <a
                    href={getSignUrl(c)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg bg-violet-50 hover:bg-violet-100 dark:bg-violet-500/10 dark:hover:bg-violet-500/20 text-violet-600 dark:text-violet-400 transition"
                    title="Abrir página de assinatura / documento"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  {/* Baixar Word (.docx) */}
                  {user && (
                    <button
                      onClick={(e) => handleDownloadWord(c, e)}
                      disabled={downloadingDocxId === c.id}
                      className="p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 transition cursor-pointer disabled:opacity-50"
                      title="Baixar Contrato em formato Word (.docx)"
                    >
                      <Download className={`w-4 h-4 ${downloadingDocxId === c.id ? 'animate-bounce' : ''}`} />
                    </button>
                  )}

                  {/* Detalhes / Auditoria */}
                  <button
                    onClick={() => {
                      setActiveAuditContract(c);
                      setShowAuditModal(true);
                    }}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] text-slate-600 dark:text-slate-300 transition"
                    title="Ver detalhes e trilha de auditoria"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {/* Excluir */}
                  <button
                    onClick={(e) => handleDeleteContract(c.id, e)}
                    className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
                    title="Excluir contrato"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Visualização em Tabela Executiva */
        <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#0b0f17] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200/80 dark:border-white/[0.08]">
                <tr>
                  <th className="py-3 px-4">Contrato</th>
                  <th className="py-3 px-4">Cliente / Contratante</th>
                  <th className="py-3 px-4">Documento (CPF/CNPJ)</th>
                  <th className="py-3 px-4">Valor Total</th>
                  <th className="py-3 px-4">Vigência</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {filteredContracts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-violet-600 dark:text-violet-400">
                      {c.contract_number}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{c.client_name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">{c.title}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                      {formatDocumentMask(c.client_document)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      {(c.total_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">{c.billing_cycle || 'Mensal'}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {c.start_date ? new Date(c.start_date).toLocaleDateString('pt-BR') : '-'}
                      {c.end_date && ` até ${new Date(c.end_date).toLocaleDateString('pt-BR')}`}
                    </td>
                    <td className="py-3.5 px-4">
                      {renderStatusBadge(c.status)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => handleCopySignLink(c, e)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] text-slate-600 dark:text-slate-300 transition"
                          title="Copiar link de assinatura"
                        >
                          {copiedContractId === c.id ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={(e) => handleShareWhatsApp(c, e)}
                          className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition"
                          title="WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={getSignUrl(c)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 dark:bg-violet-500/10 dark:hover:bg-violet-500/20 text-violet-600 dark:text-violet-400 transition"
                          title="Abrir página de assinatura"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {user && (
                          <button
                            onClick={(e) => handleDownloadWord(c, e)}
                            disabled={downloadingDocxId === c.id}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 transition cursor-pointer"
                            title="Baixar Contrato em Word (.docx)"
                          >
                            <Download className={`w-3.5 h-3.5 ${downloadingDocxId === c.id ? 'animate-bounce' : ''}`} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setActiveAuditContract(c);
                            setShowAuditModal(true);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] text-slate-600 dark:text-slate-300 transition"
                          title="Detalhes e Auditoria"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteContract(c.id, e)}
                          className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Modal 1: "+ Novo Contrato" (Importar da Proposta ou Manual) ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden my-8 text-slate-900 dark:text-slate-100">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between bg-slate-50 dark:bg-[#121824]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600/15 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
                  <FileSignature className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Criar Novo Contrato Digital</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Importe de uma proposta aprovada ou preencha as condições comerciais e jurídicas.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveContract} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {createError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* Seção 1: Importadores Inteligentes: Cliente e Proposta Comercial */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Opção A: Puxar Cliente Cadastrado */}
                <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-[#111928] border border-blue-200/80 dark:border-blue-500/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Puxar Dados da Carteira de Clientes
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Preenche nome, CPF/CNPJ com separadores, e-mail, telefone e endereço.
                  </p>
                  <select
                    value={formClientId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setFormClientId(id);
                      if (id) applyClientToForm(id);
                    }}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-blue-200 dark:border-white/[0.1] text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-xs"
                  >
                    <option value="">-- Selecione um cliente da carteira --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.document ? `(${formatDocumentMask(c.document)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Opção B: Importar Proposta Comercial */}
                <div className="p-4 rounded-xl bg-violet-50/70 dark:bg-[#141b2a] border border-violet-200/80 dark:border-violet-500/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      Importar Proposta Comercial
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Traz: Valor recorrente, taxa de setup, ciclo, vigência e itens de serviços.
                  </p>
                  <select
                    value={selectedProposalId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedProposalId(id);
                      if (id) applyProposalToForm(id);
                    }}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-violet-200 dark:border-white/[0.1] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 shadow-xs"
                  >
                    <option value="">-- Selecione uma proposta comercial --</option>
                    {proposals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.status === 'accepted' ? '✅ [ACEITA] ' : `[${p.status.toUpperCase()}] `}
                        {p.proposal_number || p.id.slice(0, 8)} - {p.to_name || p.subject} ({p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Seção 2: Identificação do Contrato */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Número do Contrato *
                  </label>
                  <input
                    type="text"
                    value={formContractNumber}
                    onChange={(e) => setFormContractNumber(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white font-mono focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Título do Contrato / Objeto Resumido *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                    placeholder="Ex: Contrato de Prestação de Serviços em Nuvem"
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Seção 3: Dados do Contratante (Cliente) */}
              <div className="p-4 rounded-xl bg-slate-50/60 dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-white/[0.06] pb-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    CONTRATANTE (Cliente que irá assinar)
                  </h3>
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    * Documento é usado para a validação dos 4 dígitos
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Razão Social / Nome Completo *
                    </label>
                    <input
                      type="text"
                      value={formClientName}
                      onChange={(e) => setFormClientName(e.target.value)}
                      required
                      placeholder="Nome do cliente ou empresa"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                      <span>CNPJ ou CPF (Obrigatório) *</span>
                      {formClientDocument && (
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 font-bold border border-violet-200 dark:border-violet-800/40">
                          {formClientDocument.replace(/\D/g, '').length > 11 ? 'CNPJ Detectado' : 'CPF Detectado'}
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={formClientDocument}
                      onChange={(e) => setFormClientDocument(formatDocumentMask(e.target.value))}
                      required
                      placeholder="422.252.067-90 ou 12.122.122/0001-00"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white font-mono focus:outline-none focus:border-violet-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Separadores automáticos. O cliente usará os 4 primeiros dígitos do CNPJ ou os 4 últimos do CPF para assinar.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      E-mail do Representante / Financeiro
                    </label>
                    <input
                      type="email"
                      value={formClientEmail}
                      onChange={(e) => setFormClientEmail(e.target.value)}
                      placeholder="email@cliente.com.br"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Telefone / WhatsApp (Para envio do link)
                    </label>
                    <input
                      type="text"
                      value={formClientPhone}
                      onChange={(e) => setFormClientPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Endereço Completo do Contratante
                    </label>
                    <input
                      type="text"
                      value={formClientAddress}
                      onChange={(e) => setFormClientAddress(e.target.value)}
                      placeholder="Rua, número, complemento, bairro, cidade - UF, CEP"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nome do Responsável Legal (Para Assinatura)
                    </label>
                    <input
                      type="text"
                      value={formLegalRepName}
                      onChange={(e) => setFormLegalRepName(e.target.value)}
                      placeholder="Nome do representante legal"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      CPF do Responsável Legal
                    </label>
                    <input
                      type="text"
                      value={formLegalRepCpf}
                      onChange={(e) => setFormLegalRepCpf(formatDocumentMask(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white font-mono focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 4: Condições Financeiras e Vigência */}
              <div className="p-4 rounded-xl bg-slate-50/60 dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] space-y-4">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200/80 dark:border-white/[0.06] pb-2">
                  <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Condições Financeiras & Prazos
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                      <span>Valor Recorrente (R$) *</span>
                      <span className="text-[10px] text-emerald-600 font-bold uppercase">{formBillingCycle}</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formTotalValue}
                      onChange={(e) => setFormTotalValue(parseFloat(e.target.value) || 0)}
                      required
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-emerald-600 dark:text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                      <span>Taxa de Implantação (R$)</span>
                      <span className="text-[10px] text-slate-500 uppercase">Setup único</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formSetupFee}
                      onChange={(e) => setFormSetupFee(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Ciclo de Faturamento
                    </label>
                    <select
                      value={formBillingCycle}
                      onChange={(e) => setFormBillingCycle(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="Mensal">Mensal</option>
                      <option value="Trimestral">Trimestral</option>
                      <option value="Semestral">Semestral</option>
                      <option value="Anual">Anual</option>
                      <option value="Pontual / Único">Pontual / Único</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Início da Vigência
                    </label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormStartDate(val);
                        try {
                          const s = new Date(val + 'T00:00:00');
                          if (!isNaN(s.getTime())) {
                            s.setFullYear(s.getFullYear() + 1);
                            setFormEndDate(s.toISOString().slice(0, 10));
                          }
                        } catch {}
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 5: Itens / Escopo Contratado */}
              <div className="p-4 rounded-xl bg-slate-50/60 dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-white/[0.06] pb-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    Itens e Serviços Discriminados ({formItems.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setFormItems([
                        ...formItems,
                        { name: 'Novo Item / Serviço', description: '', qty: 1, rate: 0, amount: 0, unit: 'un' },
                      ])
                    }
                    className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Item
                  </button>
                </div>

                <div className="space-y-2">
                  {formItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 rounded-lg bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.05]"
                    >
                      <div className="sm:col-span-5">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...formItems];
                            updated[idx].name = e.target.value;
                            setFormItems(updated);
                          }}
                          placeholder="Nome do produto ou serviço"
                          className="w-full px-2.5 py-1.5 text-xs rounded bg-transparent border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => {
                            const updated = [...formItems];
                            const q = parseFloat(e.target.value) || 0;
                            updated[idx].qty = q;
                            updated[idx].amount = q * (updated[idx].rate || 0);
                            setFormItems(updated);
                          }}
                          placeholder="Qtd"
                          className="w-full px-2.5 py-1.5 text-xs rounded bg-transparent border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => {
                            const updated = [...formItems];
                            const r = parseFloat(e.target.value) || 0;
                            updated[idx].rate = r;
                            updated[idx].amount = (updated[idx].qty || 0) * r;
                            setFormItems(updated);
                          }}
                          placeholder="Unitário (R$)"
                          className="w-full px-2.5 py-1.5 text-xs rounded bg-transparent border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <div className="sm:col-span-2 text-right font-mono text-xs font-bold text-slate-900 dark:text-slate-300">
                        {(item.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                      <div className="sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seção 6: Minuta em Texto Completo (Estilo Word) e Cláusulas Modulares */}
              <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#121824] border border-slate-200/90 dark:border-white/[0.08] space-y-4">
                {/* Header & Tabs de Seleção de Modo */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-white/[0.06] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        Termos & Cláusulas do Contrato
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/40">
                        {clauseEditorMode === 'full_text' ? 'Modo Texto Completo' : 'Modo Modular'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {clauseEditorMode === 'full_text'
                        ? 'Edite ou cole a minuta completa em formato contínuo (preâmbulo, 1. DO OBJETO, 2. DOS ANEXOS, etc.), exatamente como no Word.'
                        : 'Selecione cláusulas modulares padronizadas por categoria (Telefonia, Chip, Comodato, SLA, etc.).'}
                    </p>
                  </div>

                  {/* Seletor de Modo */}
                  <div className="inline-flex p-1 rounded-xl bg-slate-200/80 dark:bg-[#0b0f17] border border-slate-300/80 dark:border-white/10 shrink-0">
                    <button
                      type="button"
                      onClick={() => setClauseEditorMode('full_text')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        clauseEditorMode === 'full_text'
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Texto Completo (Estilo Word)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setClauseEditorMode('modular')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        clauseEditorMode === 'modular'
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Cláusulas Modulares</span>
                    </button>
                  </div>
                </div>

                {/* VISÃO 1: TEXTO COMPLETO (ESTILO WORD) */}
                {clauseEditorMode === 'full_text' && (
                  <div className="space-y-3">
                    {/* Barra de Ações Rápidas & Inserção de Modelos */}
                    <div className="p-3 rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.06] space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          Inserir Seções Rápidas no Texto:
                        </span>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              const standard = getStoredContractFullText();
                              setFormContractFullText(standard);
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 rounded-lg border border-violet-200 dark:border-violet-800/40 transition cursor-pointer"
                            title="Recarregar minuta institucional padrão completa"
                          >
                            Restaurar Modelo Padrão
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (formClauses.length > 0) {
                                const generated = clausesToContinuousText(formClauses);
                                setFormContractFullText((prev) => (prev ? `${prev}\n\n${generated}` : generated));
                              }
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-lg border border-indigo-200 dark:border-indigo-800/40 transition cursor-pointer"
                            title="Adiciona as cláusulas que estão marcadas na aba Modular"
                          >
                            + Importar Cláusulas Modulares
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormContractFullText('')}
                            className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition cursor-pointer"
                            title="Limpar campo de texto"
                          >
                            Limpar
                          </button>
                        </div>
                      </div>

                      {/* Botões Rápidos por Categoria */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            const snippet = `\n\n1. DO OBJETO\n1.1. Constitui objeto deste Contrato a prestação, pela TELEFONIA FÁCIL, de serviços de telefonia, disponibilização de números DID, procedimentos, plataforma de gerência e demais funcionalidades desenvolvidas, licenciadas ou contratadas pela TELEFONIA FÁCIL, conforme especificações constantes neste instrumento e em seus anexos.\n1.2. Quando expressamente previsto no Anexo I, poderão ser disponibilizados equipamentos em comodato para viabilizar a prestação dos serviços contratados.`;
                            setFormContractFullText((prev) => prev.trim() + snippet);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 hover:bg-blue-100 transition cursor-pointer"
                        >
                          + 📞 1. Objeto Telefonia
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const snippet = `\n\n2. DOS ANEXOS E DOCUMENTOS APLICÁVEIS\n2.1. Integram o presente Contrato, para todos os fins de direito:\na) Anexo I – Termo de Adesão e Condições Comerciais, no qual constam a qualificação das partes, os serviços, os equipamentos, os preços e a forma de pagamento contratados pela CONTRATANTE;\nb) Anexo II – Acordo de Nível de Serviço (SLA);\nc) Anexo III – Termo de Comodato de Equipamentos.`;
                            setFormContractFullText((prev) => prev.trim() + snippet);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition cursor-pointer"
                        >
                          + 📄 2. Anexos Aplicáveis
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const snippet = `\n\nCLÁUSULA - DOS CHIPS E CONECTIVIDADE MÓVEL\n• O fornecimento de chips móveis (SIM Cards corporativos) contempla o pacote de franquia mensal de dados e minutos estipulado no escopo contratado.\n• Tráfegos excedentes ou consumo fora da cobertura nacional (roaming internacional) serão faturados à parte, consoante tabela tarifária vigente.`;
                            setFormContractFullText((prev) => prev.trim() + snippet);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 transition cursor-pointer"
                        >
                          + 📱 Chips Móveis
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const snippet = `\n\nCLÁUSULA - DOS EQUIPAMENTOS EM REGIME DE COMODATO\n• Os aparelhos telefônicos IP, gateways, switches e roteadores fornecidos para a viabilização dos serviços são cedidos sob regime de Comodato Gratuito durante a vigência do contrato.\n• Os equipamentos permanecem sob propriedade inalienável da CONTRATADA, obrigando-se a CONTRATANTE a zelar por sua guarda e devolvê-los em perfeito estado ao término contratual.`;
                            setFormContractFullText((prev) => prev.trim() + snippet);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40 hover:bg-purple-100 transition cursor-pointer"
                        >
                          + 🖥️ Equipamentos / Comodato
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const snippet = `\n\nCLÁUSULA - DOS NÍVEIS DE SERVIÇO (SLA) E SUPORTE TÉCNICO\n• A CONTRATADA assegura suporte técnico especializado de segunda a sexta-feira, das 08h às 18h, com índice de disponibilidade de plataforma de 99,5% ao mês.\n• Chamados de gravidade crítica terão início de atendimento em até 2 horas úteis.`;
                            setFormContractFullText((prev) => prev.trim() + snippet);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 hover:bg-amber-100 transition cursor-pointer"
                        >
                          + ⏱️ SLA Suporte
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const snippet = `\n\nCLÁUSULA - DA PROTEÇÃO DE DADOS (LGPD)\n• As partes declaram conhecer e cumprir integralmente as normas da Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados - LGPD), comprometendo-se a tratar dados pessoais estritamente no limite necessário à consecução do objeto deste contrato.`;
                            setFormContractFullText((prev) => prev.trim() + snippet);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/40 hover:bg-teal-100 transition cursor-pointer"
                        >
                          + 🔒 LGPD
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const snippet = `\n\nCLÁUSULA - DA ASSINATURA ELETRÔNICA E FORO DE ELEIÇÃO\n• As partes reconhecem a plena validade, higidez jurídica e exequibilidade deste documento formalizado por meio de assinatura eletrônica (MP nº 2.200-2/2001 e Lei nº 14.063/2020).\n• Fica eleito o Foro da Comarca da sede da CONTRATADA para dirimir quaisquer controvérsias oriundas deste instrumento.`;
                            setFormContractFullText((prev) => prev.trim() + snippet);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40 hover:bg-indigo-100 transition cursor-pointer"
                        >
                          + ⚖️ Foro & Assinatura
                        </button>
                      </div>
                    </div>

                    {/* Grande Campo de Texto Contínuo estilo Microsoft Word */}
                    <div className="relative">
                      <textarea
                        value={formContractFullText}
                        onChange={(e) => setFormContractFullText(e.target.value)}
                        rows={16}
                        placeholder="Digite ou cole aqui o texto contínuo do contrato (preâmbulo, 1. DO OBJETO, 1.1, 1.2, 2. DOS ANEXOS, etc.)..."
                        className="w-full p-4 font-mono text-xs leading-relaxed rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-300 dark:border-white/10 text-slate-800 dark:text-slate-200 shadow-inner focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-y"
                      />
                    </div>

                    {/* Barra de Status & Estatísticas do Texto */}
                    <div className="p-3 rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {formContractFullText.length.toLocaleString('pt-BR')} caracteres
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600 dark:text-slate-400">
                          {formContractFullText.split('\n').filter(Boolean).length} linhas
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-violet-600 dark:text-violet-400 font-semibold">
                          {continuousTextToClauses(formContractFullText).length} seções identificadas para o Word/Assinatura
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40">
                          ✓ Salvo em Alta Resolução & Sincronizado
                        </span>
                      </div>
                    </div>

                    {/* Anexo de Diagrama / Imagem da Minuta */}
                    <div className="p-3 rounded-xl bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <ImageIcon className="w-4 h-4 text-violet-500" />
                          Imagem / Diagrama Anexo ao Contrato (Opcional):
                        </span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Anexe topologia de rede, diagrama de ramais ou tabela de comodato para constar no documento.
                        </p>
                      </div>

                      <div>
                        {formContractImage ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={formContractImage}
                              alt="Anexo"
                              className="h-10 w-16 object-cover rounded border border-slate-300 dark:border-white/10"
                            />
                            <button
                              type="button"
                              onClick={() => setFormContractImage('')}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                            >
                              Remover Imagem
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 transition">
                            <Upload className="w-3.5 h-3.5 text-violet-500" />
                            <span>Anexar Diagrama</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  compressImageToBase64(file, (b64) => setFormContractImage(b64));
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* VISÃO 2: CLÁUSULAS MODULARES (MANTÉM O FORMATO DE BLOCOS) */}
                {clauseEditorMode === 'modular' && (
                  <div className="space-y-4">
                    {/* Botão de Transferência para o Texto Completo */}
                    <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/40 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                          Consolidar Cláusulas no Campo de Texto Completo
                        </span>
                        <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                          Deseja juntar as cláusulas marcadas em um único texto contínuo estilo Word?
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const continuous = clausesToContinuousText(formClauses);
                          setFormContractFullText(continuous);
                          setClauseEditorMode('full_text');
                        }}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Abrir no Texto Completo</span>
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFormClauses(libraryClauses)}
                          className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-violet-600 cursor-pointer"
                        >
                          Marcar Todas
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormClauses([])}
                          className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          Desmarcar Todas
                        </button>
                        <button
                          type="button"
                          onClick={addCustomClauseToContract}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 shadow-xs transition flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Cláusula Avulsa
                        </button>
                      </div>
                    </div>

                    {/* Filtro por Categoria */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={() => setContractCategoryFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                          contractCategoryFilter === 'all'
                            ? 'bg-violet-600 text-white shadow-xs'
                            : 'bg-white dark:bg-[#0b0f17] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-100'
                        }`}
                      >
                        <span>Todas ({libraryClauses.length})</span>
                        <span className="text-[10px] opacity-80">[{formClauses.length} ativas]</span>
                      </button>
                      {CLAUSE_CATEGORIES.map((cat) => {
                        const totalInCat = libraryClauses.filter((c) => c.category === cat.id).length;
                        const selectedInCat = formClauses.filter((c) => c.category === cat.id).length;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setContractCategoryFilter(cat.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                              contractCategoryFilter === cat.id
                                ? 'bg-violet-600 text-white shadow-xs'
                                : 'bg-white dark:bg-[#0b0f17] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-100'
                            }`}
                          >
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                selectedInCat > 0
                                  ? contractCategoryFilter === cat.id
                                    ? 'bg-white/20 text-white'
                                    : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
                                  : 'opacity-50'
                              }`}
                            >
                              {selectedInCat}/{totalInCat}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Grade de Cláusulas Selecionáveis */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
                      {libraryClauses
                        .filter((c) => contractCategoryFilter === 'all' || c.category === contractCategoryFilter)
                        .map((libCl) => {
                          const activeClauseIndex = formClauses.findIndex(
                            (fc) => fc.id === libCl.id || fc.title.toLowerCase() === libCl.title.toLowerCase()
                          );
                          const isIncluded = activeClauseIndex !== -1;
                          const activeClause = isIncluded ? formClauses[activeClauseIndex] : libCl;
                          const isExpanded = expandedClauseCustomizer === libCl.id;
                          const catMeta = CLAUSE_CATEGORIES.find((c) => c.id === libCl.category);

                          return (
                            <div
                              key={libCl.id}
                              className={`rounded-xl border transition-all p-3.5 space-y-2.5 ${
                                isIncluded
                                  ? 'bg-violet-50/40 dark:bg-violet-950/20 border-violet-400/80 dark:border-violet-600/60 shadow-xs'
                                  : 'bg-white dark:bg-[#0b0f17] border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20'
                              }`}
                            >
                              {/* Cabeçalho do Card */}
                              <div className="flex items-start justify-between gap-2.5">
                                <label className="flex items-start gap-2.5 cursor-pointer flex-1 min-w-0 select-none">
                                  <input
                                    type="checkbox"
                                    checked={isIncluded}
                                    onChange={() => toggleStandardClauseInContract(libCl)}
                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                          catMeta?.badgeClass || 'bg-slate-100 text-slate-700 border-slate-200'
                                        }`}
                                      >
                                        {catMeta?.icon} {catMeta?.label}
                                      </span>
                                      {isIncluded && (
                                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40">
                                          ✓ Ativa no Contrato
                                        </span>
                                      )}
                                      {libCl.imageUrl && (
                                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded flex items-center gap-1">
                                          <ImageIcon className="w-3 h-3 text-violet-500" /> Diagrama Anexo
                                        </span>
                                      )}
                                    </div>

                                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-1 leading-snug">
                                      {activeClause.title}
                                    </h4>
                                  </div>
                                </label>

                                {isIncluded && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedClauseCustomizer(isExpanded ? null : libCl.id)
                                    }
                                    className={`text-[11px] font-semibold px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 shrink-0 ${
                                      isExpanded
                                        ? 'bg-violet-600 text-white border-violet-600'
                                        : 'bg-white dark:bg-[#121824] text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-800/40 hover:bg-violet-50'
                                    }`}
                                    title="Personalizar texto especificamente para este cliente"
                                  >
                                    <span>{isExpanded ? 'Fechar' : 'Personalizar'}</span>
                                    <ChevronDown
                                      className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    />
                                  </button>
                                )}
                              </div>

                              {!isExpanded && (
                                <p
                                  onClick={() => toggleStandardClauseInContract(libCl)}
                                  className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed pl-6 cursor-pointer"
                                >
                                  {activeClause.text || 'Sem texto padrão cadastrado.'}
                                </p>
                              )}

                              {isIncluded && isExpanded && (
                                <div className="pt-2 pl-6 space-y-2.5 border-t border-slate-200/80 dark:border-white/[0.06] animate-in fade-in">
                                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block">
                                    * As alterações abaixo valem apenas para este contrato/cliente. O modelo padrão permanece inalterado.
                                  </span>

                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                      Título desta cláusula no contrato:
                                    </label>
                                    <input
                                      type="text"
                                      value={activeClause.title}
                                      onChange={(e) =>
                                        updateContractClause(activeClauseIndex, 'title', e.target.value)
                                      }
                                      className="w-full px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121824] text-slate-900 dark:text-white"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                                      Texto customizado para este cliente:
                                    </label>
                                    <textarea
                                      value={activeClause.text}
                                      onChange={(e) =>
                                        updateContractClause(activeClauseIndex, 'text', e.target.value)
                                      }
                                      rows={4}
                                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121824] text-slate-800 dark:text-slate-200 resize-y leading-relaxed"
                                    />
                                  </div>

                                  <div>
                                    {activeClause.imageUrl ? (
                                      <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.05]">
                                        <div className="flex items-center gap-2">
                                          <img
                                            src={activeClause.imageUrl}
                                            alt="Diagrama"
                                            className="h-10 w-16 object-cover rounded border border-slate-200 dark:border-white/10"
                                          />
                                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                            Imagem anexada
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateContractClause(activeClauseIndex, 'imageUrl', '')
                                          }
                                          className="text-xs text-rose-600 font-semibold cursor-pointer"
                                        >
                                          Remover Imagem
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10">
                                          <Upload className="w-3 h-3 text-violet-500" />
                                          <span>Anexar Diagrama / Imagem</span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                compressImageToBase64(file, (b64) =>
                                                  updateContractClause(activeClauseIndex, 'imageUrl', b64)
                                                );
                                              }
                                            }}
                                          />
                                        </label>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {/* Cláusulas avulsas personalizadas criadas do zero */}
                    {formClauses.filter((c) => !libraryClauses.some((lc) => lc.id === c.id || lc.title.toLowerCase() === c.title.toLowerCase())).length > 0 && (
                      <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06] space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                          Cláusulas Avulsas Especiais deste Cliente:
                        </span>
                        {formClauses
                          .map((c, idx) => ({ c, idx }))
                          .filter(({ c }) => !libraryClauses.some((lc) => lc.id === c.id || lc.title.toLowerCase() === c.title.toLowerCase()))
                          .map(({ c, idx }) => (
                            <div
                              key={c.id || idx}
                              className="p-3 rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/30 dark:bg-violet-950/10 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <input
                                  type="text"
                                  value={c.title}
                                  onChange={(e) => updateContractClause(idx, 'title', e.target.value)}
                                  className="font-bold text-xs px-2 py-1 rounded bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/10 flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeContractClause(idx)}
                                  className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <textarea
                                value={c.text}
                                onChange={(e) => updateContractClause(idx, 'text', e.target.value)}
                                rows={3}
                                className="w-full text-xs p-2 rounded-lg bg-white dark:bg-[#0b0f17] border border-slate-200 dark:border-white/10"
                              />
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botões do Rodapé */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingContract}
                  className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-violet-600/30 transition disabled:opacity-50"
                >
                  {savingContract ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Gerando Contrato Digital...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4" />
                      <span>Gerar Contrato & Criar Link de Assinatura</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 2: "Compartilhar Link de Assinatura" ─── */}
      {showShareModal && activeShareContract && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-violet-500/30 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Contrato Gerado com Sucesso!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                O contrato <b>{activeShareContract.contract_number}</b> está pronto para ser assinado pelo cliente.
              </p>
            </div>

            {/* Caixa com o link */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.08] space-y-2">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Link de Assinatura Eletrônica:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getSignUrl(activeShareContract)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.08] text-violet-700 dark:text-violet-300 font-mono focus:outline-none"
                />
                <button
                  onClick={() => handleCopySignLink(activeShareContract)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition flex items-center gap-1 shadow-xs"
                >
                  {copiedLinkFeedback ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLinkFeedback ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Aviso da Regra de Segurança */}
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
              <KeyRound className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="text-[11px] leading-relaxed">
                <b>Regra de validação:</b> Ao abrir o link, o cliente informará{' '}
                <span className="underline font-bold">
                  {(activeShareContract.client_document || '').replace(/\D/g, '').length > 11
                    ? 'os 4 primeiros números do CNPJ'
                    : 'os 4 últimos números do CPF'}
                </span>{' '}
                cadastrado para ter acesso ao documento e assinar digitalmente.
              </div>
            </div>

            {/* Ações Rápidas */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleShareWhatsApp(activeShareContract)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition shadow-md shadow-emerald-600/25"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Enviar para Cliente via WhatsApp</span>
              </button>

              <div className="flex items-center gap-2">
                <a
                  href={getSignUrl(activeShareContract)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] rounded-xl transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Testar Link Agora</span>
                </a>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="px-5 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 3: "Detalhes e Trilha de Auditoria" ─── */}
      {showAuditModal && activeAuditContract && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-white/[0.1] shadow-2xl p-6 space-y-5 max-h-[85vh] overflow-y-auto text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-4">
              <div>
                <span className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400">
                  {activeAuditContract.contract_number}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeAuditContract.title}</h3>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Certificado de Auditoria se assinado */}
            {activeAuditContract.status === 'signed' ? (() => {
              const dossier = parseAuditDossier(activeAuditContract.notes);
              const signerInfo = dossier?.signer;
              const docHash = dossier?.documentHash || (activeAuditContract as any).document_hash;
              const sigHash = activeAuditContract.signature_hash || dossier?.signatureHash;

              return (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      Certificado de Autenticidade & Trilha de Auditoria Digital
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      LEI 14.063/2020
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-slate-700 dark:text-slate-300 font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-sans">Assinado por:</span>
                      <span className="font-bold">{activeAuditContract.signed_by_name || activeAuditContract.client_name}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-sans">Documento:</span>
                      {formatDocumentMask(activeAuditContract.signed_by_document || activeAuditContract.client_document)}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-sans">Data & Hora:</span>
                      {activeAuditContract.signed_at
                        ? `${new Date(activeAuditContract.signed_at).toLocaleString('pt-BR')}`
                        : '-'}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block font-sans">Endereço IP & Porta:</span>
                      {activeAuditContract.signed_by_ip || 'Auditado'}
                      {signerInfo?.port ? `:${signerInfo.port}` : ''}
                    </div>
                    {(signerInfo?.email || activeAuditContract.client_email) && (
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">E-mail:</span>
                        <span className="break-all font-sans">{signerInfo?.email || activeAuditContract.client_email}</span>
                      </div>
                    )}
                    {(signerInfo?.phone || activeAuditContract.client_phone) && (
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Telefone:</span>
                        {signerInfo?.phone || activeAuditContract.client_phone}
                      </div>
                    )}
                  </div>

                  {/* Hash do Documento Original */}
                  {docHash && (
                    <div className="pt-2 border-t border-emerald-200 dark:border-emerald-500/20">
                      <span className="text-[10px] text-slate-500 uppercase block font-sans font-bold">
                        Hash SHA-256 do Documento Original (Imutabilidade):
                      </span>
                      <p className="font-mono text-[10px] text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-black/30 p-1.5 rounded border border-slate-200 dark:border-white/10 break-all select-all mt-0.5">
                        {docHash}
                      </p>
                    </div>
                  )}

                  {/* Hash da Assinatura Digital */}
                  {sigHash && (
                    <div className="pt-2 border-t border-emerald-200 dark:border-emerald-500/20">
                      <span className="text-[10px] text-slate-500 uppercase block font-sans font-bold">
                        Hash SHA-256 da Assinatura (Integridade Criptográfica):
                      </span>
                      <p className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300 bg-white/70 dark:bg-black/30 p-1.5 rounded border border-emerald-200 dark:border-emerald-500/20 break-all select-all font-bold mt-0.5">
                        {sigHash}
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-emerald-200 dark:border-emerald-500/20">
                    Assinatura Eletrônica Avançada nos termos do <strong>Art. 10, § 2º da MP 2.200-2/2001</strong> e <strong>Lei 14.063/2020</strong>.
                  </p>
                </div>
              );
            })() : (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>Este contrato ainda não foi assinado. O link de assinatura está aguardando ação do cliente.</span>
              </div>
            )}

            {/* Informações Gerais */}
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-700 dark:text-slate-300">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200/80 dark:border-white/[0.05] space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Contratante</span>
                <p className="font-bold text-slate-900 dark:text-white">{activeAuditContract.client_name}</p>
                <p className="text-slate-500 dark:text-slate-400 font-mono">{formatDocumentMask(activeAuditContract.client_document)}</p>
                <p className="text-slate-500 dark:text-slate-400">{activeAuditContract.client_email}</p>
                <p className="text-slate-500 dark:text-slate-400">{activeAuditContract.client_phone}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200/80 dark:border-white/[0.05] space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Condições</span>
                <p className="font-bold text-emerald-600 dark:text-emerald-400">
                  {(activeAuditContract.total_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-slate-500 dark:text-slate-400">Ciclo: {activeAuditContract.billing_cycle || 'Mensal'}</p>
                <p className="text-slate-500 dark:text-slate-400">
                  Vigência: {activeAuditContract.start_date || '-'} a {activeAuditContract.end_date || '-'}
                </p>
              </div>
            </div>

            {/* Cláusulas Acordadas neste Contrato */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200/80 dark:border-white/[0.05] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-violet-600" />
                  Cláusulas e Termos Deste Contrato ({parseContractClauses(activeAuditContract.clauses_json).length})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {parseContractItems(activeAuditContract.items_json).length} itens/serviços
                </span>
              </div>

              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {parseContractClauses(activeAuditContract.clauses_json, activeAuditContract.id).map((cl, idx) => {
                  const catMeta = CLAUSE_CATEGORIES.find((c) => c.id === cl.category);
                  return (
                    <div
                      key={cl.id || idx}
                      className="p-2.5 rounded-lg bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/[0.05] space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            catMeta?.badgeClass || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {catMeta?.icon} {catMeta?.label || cl.category}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">{cl.title}</h4>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {cl.text}
                      </p>
                      {cl.imageUrl && (
                        <div className="pt-1">
                          <img
                            src={cl.imageUrl}
                            alt={cl.title}
                            className="h-10 w-16 object-cover rounded border border-slate-200 dark:border-white/10"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <a
                  href={getSignUrl(activeAuditContract)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-xl transition cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Página do Contrato</span>
                </a>

                {user && (
                  <button
                    onClick={(e) => handleDownloadWord(activeAuditContract, e)}
                    disabled={downloadingDocxId === activeAuditContract.id}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/40 rounded-xl transition cursor-pointer disabled:opacity-50"
                    title="Baixar minuta completa do contrato em Word (.docx)"
                  >
                    <Download className={`w-3.5 h-3.5 ${downloadingDocxId === activeAuditContract.id ? 'animate-bounce' : ''}`} />
                    <span>{downloadingDocxId === activeAuditContract.id ? 'Gerando Word...' : 'Baixar Word (.docx)'}</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 4: "Biblioteca de Modelos de Cláusulas Padrão (Fora do Contrato)" ─── */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white dark:bg-[#0e1420] border border-slate-200 dark:border-white/[0.1] shadow-2xl overflow-hidden my-8 text-slate-900 dark:text-slate-100">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between bg-slate-50 dark:bg-[#121824]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600/15 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Modelos de Cláusulas Padrão (Fora do Contrato)
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Colaborador
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gerencie o catálogo institucional de cláusulas (Telefonia, Chip, Equipamentos, SLA, etc.). As alterações aqui definem o padrão inicial de todos os novos contratos.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowLibraryModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-barra: Alternador de Abas da Biblioteca */}
            <div className="px-6 py-3 border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-50 dark:bg-[#0b0f17] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex p-1 rounded-xl bg-slate-200/80 dark:bg-[#121824] border border-slate-300/80 dark:border-white/10 shrink-0">
                <button
                  type="button"
                  onClick={() => setLibraryTab('full_text')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    libraryTab === 'full_text'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Minuta em Texto Completo (Padrão da Empresa)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryTab('modular')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    libraryTab === 'modular'
                      ? 'bg-violet-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Catálogo de Cláusulas Modulares ({libraryClauses.length})</span>
                </button>
              </div>

              {libraryTab === 'full_text' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Restaurar para a minuta padrão oficial da Telefonia Fácil?')) {
                        setLibraryFullText(DEFAULT_TELEFONIA_FULL_TEXT);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-white/10 hover:bg-slate-100 transition cursor-pointer"
                    title="Restaurar minuta oficial Telefonia Fácil"
                  >
                    Restaurar Padrão Telefonia Fácil
                  </button>
                </div>
              )}
            </div>

            {/* ABA 1: MINUTA EM TEXTO COMPLETO (PADRÃO INSTITUCIONAL) */}
            {libraryTab === 'full_text' && (
              <div className="p-6 max-h-[62vh] overflow-y-auto space-y-4">
                <div className="p-3.5 rounded-xl bg-violet-50/70 dark:bg-[#141b2a] border border-violet-200/80 dark:border-violet-500/20">
                  <h4 className="text-xs font-bold text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                    Minuta Padrão Institucional em Texto Contínuo (Estilo Word)
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    Este texto será carregado automaticamente sempre que um novo contrato for criado. Personalize os dados da sua empresa (CNPJ, endereço, sede), preâmbulo e regras padrão.
                  </p>
                </div>

                {/* Toolbar de inserção rápida */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-white/[0.06] space-y-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Inserir Bloco Rápido na Minuta:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `\n\nCLÁUSULA - DOS CHIPS E CONECTIVIDADE MÓVEL\n• O fornecimento de chips móveis (SIM Cards corporativos) contempla o pacote de franquia mensal de dados e minutos estipulado no escopo contratado.\n• Tráfegos excedentes ou consumo fora da cobertura nacional (roaming internacional) serão faturados à parte, consoante tabela tarifária vigente.`;
                        setLibraryFullText((prev) => prev.trim() + snippet);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 transition cursor-pointer"
                    >
                      + 📱 Chips Móveis
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `\n\nCLÁUSULA - DOS EQUIPAMENTOS EM REGIME DE COMODATO\n• Os aparelhos telefônicos IP, gateways, switches e roteadores fornecidos para a viabilização dos serviços são cedidos sob regime de Comodato Gratuito durante a vigência do contrato.\n• Os equipamentos permanecem sob propriedade inalienável da CONTRATADA, obrigando-se a CONTRATANTE a zelar por sua guarda e devolvê-los em perfeito estado ao término contratual.`;
                        setLibraryFullText((prev) => prev.trim() + snippet);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40 hover:bg-purple-100 transition cursor-pointer"
                    >
                      + 🖥️ Equipamentos / Comodato
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `\n\nCLÁUSULA - DOS NÍVEIS DE SERVIÇO (SLA) E SUPORTE TÉCNICO\n• A CONTRATADA assegura suporte técnico especializado de segunda a sexta-feira, das 08h às 18h, com índice de disponibilidade de plataforma de 99,5% ao mês.\n• Chamados de gravidade crítica terão início de atendimento em até 2 horas úteis.`;
                        setLibraryFullText((prev) => prev.trim() + snippet);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 hover:bg-amber-100 transition cursor-pointer"
                    >
                      + ⏱️ SLA & Suporte
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `\n\nCLÁUSULA - DA PROTEÇÃO DE DADOS (LGPD)\n• As partes declaram conhecer e cumprir integralmente as normas da Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados - LGPD), comprometendo-se a tratar dados pessoais estritamente no limite necessário à consecução do objeto deste contrato.`;
                        setLibraryFullText((prev) => prev.trim() + snippet);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/40 hover:bg-teal-100 transition cursor-pointer"
                    >
                      + 🔒 LGPD
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `\n\nCLÁUSULA - DA ASSINATURA ELETRÔNICA E FORO DE ELEIÇÃO\n• As partes reconhecem a plena validade, higidez jurídica e exequibilidade deste documento formalizado por meio de assinatura eletrônica (MP nº 2.200-2/2001 e Lei nº 14.063/2020).\n• Fica eleito o Foro da Comarca da sede da CONTRATADA para dirimir quaisquer controvérsias oriundas deste instrumento.`;
                        setLibraryFullText((prev) => prev.trim() + snippet);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40 hover:bg-indigo-100 transition cursor-pointer"
                    >
                      + ⚖️ Foro & Assinatura
                    </button>
                  </div>
                </div>

                <textarea
                  value={libraryFullText}
                  onChange={(e) => setLibraryFullText(e.target.value)}
                  rows={16}
                  placeholder="Minuta institucional padrão completa..."
                  className="w-full p-4 font-mono text-xs leading-relaxed rounded-xl bg-slate-50/50 dark:bg-[#0b0f17] border border-slate-300 dark:border-white/10 text-slate-800 dark:text-slate-200 shadow-inner focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-y"
                />

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{libraryFullText.length.toLocaleString('pt-BR')} caracteres • {libraryFullText.split('\n').filter(Boolean).length} linhas</span>
                  <span className="text-violet-600 dark:text-violet-400 font-semibold">
                    {continuousTextToClauses(libraryFullText).length} seções identificadas
                  </span>
                </div>
              </div>
            )}

            {/* ABA 2: CATÁLOGO DE CLÁUSULAS MODULARES */}
            {libraryTab === 'modular' && (
              <>
                <div className="px-6 py-3 border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-50/50 dark:bg-[#0b0f17] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Filtro de Categoria */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    <button
                      type="button"
                      onClick={() => setLibraryCategoryFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        libraryCategoryFilter === 'all'
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'bg-white dark:bg-[#161b22] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-100'
                      }`}
                    >
                      Todas ({libraryClauses.length})
                    </button>
                    {CLAUSE_CATEGORIES.map((cat) => {
                      const count = libraryClauses.filter((c) => c.category === cat.id).length;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setLibraryCategoryFilter(cat.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                            libraryCategoryFilter === cat.id
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'bg-white dark:bg-[#161b22] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-100'
                          }`}
                        >
                          <span>{cat.icon}</span>
                          <span>{cat.label}</span>
                          <span className="text-[10px] opacity-75">({count})</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleResetLibraryToDefault}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-white/10 hover:bg-slate-100 transition cursor-pointer"
                      title="Restaurar cláusulas de fábrica da empresa"
                    >
                      Restaurar Padrão
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleAddLibraryClause(
                          libraryCategoryFilter === 'all' ? 'Telefonia' : (libraryCategoryFilter as ClauseCategory)
                        )
                      }
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 shadow-xs transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nova Cláusula Padrão
                    </button>
                  </div>
                </div>

                {/* Lista de Modelos Padrão */}
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                  {libraryClauses
                    .filter((c) => libraryCategoryFilter === 'all' || c.category === libraryCategoryFilter)
                    .map((cl, index) => {
                      const catMeta = CLAUSE_CATEGORIES.find((cat) => cat.id === cl.category);
                      return (
                        <div
                          key={cl.id}
                          className="p-4 rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#121824] shadow-xs space-y-3"
                        >
                          {/* Top Bar da Cláusula */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="w-6 h-6 rounded-lg bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 text-xs font-bold flex items-center justify-center border border-violet-200 dark:border-violet-800/40 flex-shrink-0">
                                {index + 1}
                              </span>

                              <select
                                value={cl.category}
                                onChange={(e) => handleUpdateLibraryClause(cl.id, 'category', e.target.value as ClauseCategory)}
                                className="text-xs font-semibold rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0b0f17] px-2.5 py-1 text-slate-800 dark:text-slate-200"
                              >
                                {CLAUSE_CATEGORIES.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.icon} {c.label}
                                  </option>
                                ))}
                              </select>

                              <input
                                type="text"
                                value={cl.title}
                                onChange={(e) => handleUpdateLibraryClause(cl.id, 'title', e.target.value)}
                                placeholder="Título do Modelo (Ex: CLÁUSULA - TELEFONIA IP)"
                                className="flex-1 px-3 py-1 text-xs font-bold rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-[#0b0f17] text-slate-900 dark:text-white outline-none focus:border-violet-500"
                              />
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={cl.enabledByDefault ?? true}
                                  onChange={(e) => handleUpdateLibraryClause(cl.id, 'enabledByDefault', e.target.checked)}
                                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                />
                                <span>Ativa por Padrão</span>
                              </label>

                              <div className="flex items-center gap-1 border-l border-slate-200 dark:border-white/10 pl-2">
                                <button
                                  type="button"
                                  onClick={() => handleMoveLibraryClause(index, 'up')}
                                  disabled={index === 0}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 cursor-pointer"
                                  title="Mover para cima"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveLibraryClause(index, 'down')}
                                  disabled={index === libraryClauses.length - 1}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 cursor-pointer"
                                  title="Mover para baixo"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLibraryClause(cl.id)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                  title="Excluir cláusula do catálogo padrão"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Texto Padrão */}
                          <textarea
                            value={cl.text}
                            onChange={(e) => handleUpdateLibraryClause(cl.id, 'text', e.target.value)}
                            rows={3}
                            placeholder="Texto institucional padrão para esta cláusula..."
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0b0f17] text-slate-800 dark:text-slate-200 outline-none focus:border-violet-500 transition leading-relaxed resize-y"
                          />

                          {/* Imagem de Referência / Modelo */}
                          <div className="pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                            {cl.imageUrl ? (
                              <div className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/[0.05]">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={cl.imageUrl}
                                    alt="Anexo Padrão"
                                    className="h-12 w-20 object-cover rounded-md border border-slate-200 dark:border-white/10"
                                  />
                                  <div>
                                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                                      Imagem / Diagrama padrão anexado
                                    </span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <label className="text-[10px] text-slate-400">Posição:</label>
                                      <select
                                        value={cl.imagePosition || 'below'}
                                        onChange={(e) => handleUpdateLibraryClause(cl.id, 'imagePosition', e.target.value)}
                                        className="text-[10px] rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] px-1.5 py-0.5 text-slate-700 dark:text-slate-300"
                                      >
                                        <option value="below">Abaixo do texto</option>
                                        <option value="above">Acima do texto</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateLibraryClause(cl.id, 'imageUrl', '')}
                                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2.5 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                >
                                  Remover Imagem
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition border border-slate-200/60 dark:border-white/[0.05]">
                                  <Upload className="w-3.5 h-3.5 text-violet-500" />
                                  <span>Anexar Imagem Padrão</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        compressImageToBase64(file, (b64) => handleUpdateLibraryClause(cl.id, 'imageUrl', b64));
                                      }
                                    }}
                                  />
                                </label>
                                <span className="text-[11px] text-slate-400">ou colar URL:</span>
                                <input
                                  type="text"
                                  placeholder="https://exemplo.com/diagrama.png"
                                  onBlur={(e) => {
                                    if (e.target.value.trim()) {
                                      handleUpdateLibraryClause(cl.id, 'imageUrl', e.target.value.trim());
                                      e.target.value = '';
                                    }
                                  }}
                                  className="flex-1 min-w-[160px] text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0b0f17] px-2.5 py-1 outline-none focus:border-violet-500"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {libraryClauses.length === 0 && (
                    <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-white/10 text-slate-400 space-y-3">
                      <p className="text-sm">Nenhum modelo de cláusula cadastrado nesta categoria.</p>
                      <button
                        type="button"
                        onClick={handleResetLibraryToDefault}
                        className="text-xs font-bold text-violet-600 dark:text-violet-400 underline cursor-pointer"
                      >
                        Restaurar catálogo inicial completo
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Footer do Modal de Biblioteca */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#121824] flex items-center justify-between">
              <div>
                {librarySavedFeedback && (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4" /> Modelos padrão salvos com sucesso!
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowLibraryModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.05] rounded-xl transition cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSaveLibrary}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl shadow-md shadow-violet-600/25 transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Modelos Padrão</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
