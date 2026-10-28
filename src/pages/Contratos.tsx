import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Building2,
  User,
  ShieldCheck,
  Shield,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
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
  Bookmark,
  CreditCard,
  Paperclip,
  Info,
  Sliders,
  FileEdit,
  Package,
  Wrench,
  Tag,
} from 'lucide-react';
import { downloadContractDocx } from '../utils/contractDocx';
import { databases, client, getAuthoritativeAuthHeaders } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { parseLegalRepresentative, encodeNotesWithLegalRep } from './Contatos';
import { parseAuditDossier } from '../utils/auditTrail';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
const COLLECTION_CONTRACTS = 'crm_contracts';

// ─── Interfaces & Tipagens de Cláusulas ────────────────────────────────────────

export interface Contract {
  id: string;
  $id?: string;
  contract_number?: string;
  title?: string;
  proposal_id?: string;
  client_id?: string;
  client_name?: string;
  client_document?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  provider_name?: string;
  provider_document?: string;
  provider_address?: string;
  start_date?: string;
  end_date?: string;
  billing_cycle?: string;
  total_value?: number;
  setup_fee?: number;
  items_json?: string;
  clauses_json?: string;
  notes?: string;
  status?: string;
  signature_token?: string;
  signed_at?: string;
  signed_by_name?: string;
  signed_by_document?: string;
  signed_by_email?: string;
  signed_by_phone?: string;
  signed_by_ip?: string;
  signed_by_port?: string;
  signed_by_user_agent?: string;
  signature_hash?: string;
  document_hash?: string;
  signature_method?: string;
  created_at?: string;
  $createdAt?: string;
  [key: string]: any;
}

export interface ProposalOption {
  id: string;
  subject?: string;
  to_name?: string;
  total?: number;
  [key: string]: any;
}

export interface ClientOption {
  id: string;
  name?: string;
  fantasy_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  [key: string]: any;
}


export interface CatalogItemOption {
  id: string;
  name: string;
  short_description?: string;
  long_description?: string;
  category?: string;
  group_name?: string;
  price: number;
  type: 'service' | 'product';
  unit?: string;
  tax_rate?: string | number;
  [key: string]: any;
}

export type ContractItemBillingType = 'recurring' | 'setup' | 'one_time' | 'monthly_additional';

export interface ContractItem {
  name: string;
  description?: string;
  qty: number;
  rate: number;
  amount: number;
  unit?: string;
  billingType?: ContractItemBillingType;
  itemType?: ContractItemBillingType;
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

export function getStoredContractFullText(tenantId?: string): string {
  try {
    if (tenantId) {
      const tenantSaved = localStorage.getItem(`${CONTRACT_FULL_TEXT_KEY}_${tenantId}`);
      if (tenantSaved && tenantSaved.trim()) return tenantSaved;
    }
    const saved = localStorage.getItem(CONTRACT_FULL_TEXT_KEY);
    if (saved && saved.trim()) return saved;
  } catch {}
  return DEFAULT_TELEFONIA_FULL_TEXT;
}

export function saveStoredContractFullText(text: string, tenantId?: string): void {
  try {
    if (tenantId) {
      localStorage.setItem(`${CONTRACT_FULL_TEXT_KEY}_${tenantId}`, text);
    }
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

export function getStoredClauseLibrary(tenantId?: string): ContractClause[] {
  try {
    if (tenantId) {
      const tenantSaved = localStorage.getItem(`${CLAUSES_STORAGE_KEY}_${tenantId}`);
      if (tenantSaved) {
        const parsed = JSON.parse(tenantSaved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
    const saved = localStorage.getItem(CLAUSES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_LIBRARY_CLAUSES;
}

export function saveStoredClauseLibrary(clauses: ContractClause[], tenantId?: string): void {
  try {
    if (tenantId) {
      localStorage.setItem(`${CLAUSES_STORAGE_KEY}_${tenantId}`, JSON.stringify(clauses));
    }
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
  // F01: Nunca fazer .slice() em string JSON serializada, garantindo integridade sintática e jurídica
  if (fullText && fullText.trim()) {
    return JSON.stringify({
      mode: 'full_text',
      text: fullText,
    });
  }

  // Sanitizar URLs base64 gigantes mantendo o texto integral de cada cláusula
  const compact = clauses.map((c) => ({
    id: c.id,
    cat: c.category,
    t: c.title,
    txt: c.text,
    img: c.imageUrl && !c.imageUrl.startsWith('data:') && c.imageUrl.length < 250 ? c.imageUrl : undefined,
    pos: c.imagePosition || 'below',
  }));

  return JSON.stringify(compact);
}

export function parseContractClauses(
  clausesJson?: string,
  contractId?: string,
  contractContent?: string
): ContractClause[] {
  // F03: 1. Fonte autoritativa primária é sempre o registro persistido no banco (clauses_json / content)
  let localCachedClauses: ContractClause[] = [];
  if (contractId) {
    try {
      const local = localStorage.getItem(`contract_clauses_${contractId}`);
      if (local) {
        const parsedLocal = JSON.parse(local);
        if (Array.isArray(parsedLocal)) localCachedClauses = parsedLocal;
      }
    } catch {}
  }

  if (clausesJson && clausesJson.trim()) {
    try {
      const parsed = JSON.parse(clausesJson);
      // Se gravado como modo texto contínuo
      if (parsed && typeof parsed === 'object' && parsed.mode === 'full_text' && typeof parsed.text === 'string' && parsed.text.trim()) {
        return continuousTextToClauses(parsed.text);
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        const lib = getStoredClauseLibrary();
        return parsed.map((item, idx) => {
          const id = item.id || `cl-${idx}`;
          const category = (item.category || item.cat || 'Geral') as ClauseCategory;
          const title = item.title || item.t || `CLÁUSULA ${idx + 1}ª`;
          const rawPersistedText = item.text ?? item.txt ?? '';
          let text = typeof rawPersistedText === 'string' ? rawPersistedText : '';
          let imageUrl = item.imageUrl || item.img || '';
          const imagePosition = (item.imagePosition || item.pos || 'below') as 'above' | 'below';

          // F03: Nunca sobrescrever cláusula customizada mais curta com o texto padrão da biblioteca!
          // Somente usar fallback da biblioteca se o texto persistido estiver realmente vazio ou truncado com '...'
          const matchLocal = localCachedClauses.find((lc) => lc.id === id || lc.title === title);
          const matchLib = lib.find((l) => l.id === id || l.title.toLowerCase() === title.toLowerCase());
          if (!text.trim() && matchLib) {
            text = matchLib.text;
          }
          if (!imageUrl) {
            if (matchLocal?.imageUrl) {
              imageUrl = matchLocal.imageUrl;
            } else if (matchLib?.imageUrl) {
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
    } catch {
      // Se clausesJson for texto puro legado não-JSON
      return continuousTextToClauses(clausesJson);
    }
  }

  if (contractContent && contractContent.trim()) {
    return continuousTextToClauses(contractContent);
  }

  // 2. Fallback para cache local apenas se o contrato ainda não possuir clauses_json persistido
  if (contractId) {
    try {
      if (localCachedClauses.length > 0) return localCachedClauses;
      const localText = localStorage.getItem(`contract_text_${contractId}`);
      if (localText && localText.trim()) {
        return continuousTextToClauses(localText);
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
  if (contract?.clauses_json) {
    try {
      const parsed = JSON.parse(contract.clauses_json);
      if (parsed && typeof parsed === 'object' && parsed.mode === 'full_text' && parsed.text) {
        return parsed.text;
      }
    } catch {}
  }
  if (contract?.content && typeof contract.content === 'string' && contract.content.trim()) {
    return contract.content;
  }
  const clauses = parseContractClauses(contract?.clauses_json, contract?.id, contract?.content);
  return clausesToContinuousText(clauses);
}

// F32: Formatação civil de datas YYYY-MM-DD sem deslocamento de fuso horário
export function formatCivilDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const trimmed = String(dateStr).trim();
  const civilMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (civilMatch) {
    const [, year, month, day] = civilMatch;
    return `${day}/${month}/${year}`;
  }
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return trimmed;
  }
  try {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}

export function getLocalTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addCivilMonthsToIsoDate(baseIsoDate: string, monthsToAdd: number): string {
  const match = String(baseIsoDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const baseDate = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0)
    : new Date();
  baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
  const y = baseDate.getFullYear();
  const m = String(baseDate.getMonth() + 1).padStart(2, '0');
  const d = String(baseDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function inferContractItemBillingType(item: Partial<ContractItem>): ContractItemBillingType {
  if (item.billingType) return item.billingType;
  if (item.itemType) return item.itemType;
  return 'recurring';
}

export function calculateContractBillingCycles(
  months: number,
  billingCycle: string,
  isIndefinite = false
): {
  cyclesCount: number;
  cycleMonths: number;
  remainderMonths: number;
  hasPartialCycle: boolean;
} {
  const safeMonths = Math.max(1, Number(months) || 12);
  if (isIndefinite || billingCycle === 'Pagamento único') {
    return { cyclesCount: 1, cycleMonths: 0, remainderMonths: 0, hasPartialCycle: false };
  }
  if (billingCycle === 'Semanal') {
    return {
      cyclesCount: Math.max(1, Math.ceil((safeMonths * 52) / 12)),
      cycleMonths: 0,
      remainderMonths: 0,
      hasPartialCycle: false,
    };
  }
  if (billingCycle === 'Trimestral') {
    const cyclesCount = Math.max(1, Math.ceil(safeMonths / 3));
    const remainderMonths = safeMonths % 3;
    return {
      cyclesCount,
      cycleMonths: 3,
      remainderMonths,
      hasPartialCycle: remainderMonths !== 0,
    };
  }
  if (billingCycle === 'Semestral') {
    const cyclesCount = Math.max(1, Math.ceil(safeMonths / 6));
    const remainderMonths = safeMonths % 6;
    return {
      cyclesCount,
      cycleMonths: 6,
      remainderMonths,
      hasPartialCycle: remainderMonths !== 0,
    };
  }
  if (billingCycle === 'Anual') {
    const cyclesCount = Math.max(1, Math.ceil(safeMonths / 12));
    const remainderMonths = safeMonths % 12;
    return {
      cyclesCount,
      cycleMonths: 12,
      remainderMonths,
      hasPartialCycle: remainderMonths !== 0,
    };
  }
  return {
    cyclesCount: safeMonths,
    cycleMonths: 1,
    remainderMonths: 0,
    hasPartialCycle: false,
  };
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
  const { tenant } = useTenant();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [proposals, setProposals] = useState<ProposalOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Provedor padrão derivado autoritativamente do tenant logado (F04)
  const tenantProviderName = tenant?.trade_name || tenant?.name || DEFAULT_PROVIDER.name;
  const tenantProviderDocument = tenant?.document || DEFAULT_PROVIDER.document;
  const tenantProviderAddress = tenant?.address || DEFAULT_PROVIDER.address;

  // Filtros e Visualização
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_signature' | 'signed' | 'draft' | 'cancelled'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');

  // Modo de visualização da página: 'list' (listagem de contratos) ou 'create' (criação em tela cheia sem popup)
  const [pageView, setPageView] = useState<'list' | 'create'>('list');
  const [createModalStep, setCreateModalStep] = useState<1 | 2 | 3 | 4>(1);
  const [showImportDropdown, setShowImportDropdown] = useState(false);
  const [showLegalRepFields, setShowLegalRepFields] = useState(false);
  const [reviewedMinutaCheckbox, setReviewedMinutaCheckbox] = useState(false);
  const [draftSavedFeedback, setDraftSavedFeedback] = useState(false);
  const [showFullDocPreview, setShowFullDocPreview] = useState(false);

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
  const [formProviderName, setFormProviderName] = useState(tenantProviderName);
  const [formProviderDocument, setFormProviderDocument] = useState(tenantProviderDocument);
  const [formProviderAddress, setFormProviderAddress] = useState(tenantProviderAddress);
  const [formStartDate, setFormStartDate] = useState(() => getLocalTodayIsoDate());
  const [formEndDate, setFormEndDate] = useState(() => addCivilMonthsToIsoDate(getLocalTodayIsoDate(), 12));
  const [formBillingCycle, setFormBillingCycle] = useState('Mensal');
  const [formTotalValue, setFormTotalValue] = useState<number>(0);
  const [formSetupFee, setFormSetupFee] = useState<number>(0);
  // Cobrança adicional no contrato (Sim / Não)
  const [formHasAdditionalFee, setFormHasAdditionalFee] = useState<boolean>(false);
  const [formAdditionalFee, setFormAdditionalFee] = useState<number>(0);
  const [formAdditionalFeeDescription, setFormAdditionalFeeDescription] = useState<string>('');
  const [formAdditionalFeeType, setFormAdditionalFeeType] = useState<'monthly' | 'per_cycle' | 'one_time'>('monthly');

  // Vigência indeterminada (Sem prazo)
  const [formIsIndefiniteTerm, setFormIsIndefiniteTerm] = useState<boolean>(false);
  const [formItems, setFormItems] = useState<ContractItem[]>([]);
  const [availableDraft, setAvailableDraft] = useState<Record<string, any> | null>(null);

  // Catálogo de Itens Pré-Criados no Sistema (crm_items)
  const [catalogItems, setCatalogItems] = useState<CatalogItemOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('Todos');
  const [catalogTypeFilter, setCatalogTypeFilter] = useState<'all' | 'service' | 'product'>('all');
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showCatalogSection, setShowCatalogSection] = useState(true);
  const [addedItemFeedbackId, setAddedItemFeedbackId] = useState<string | null>(null);
  const [showCrmItemDropdown, setShowCrmItemDropdown] = useState(false);
  const [crmItemSearch, setCrmItemSearch] = useState('');
  const [showProposalDropdown, setShowProposalDropdown] = useState(false);
  const [proposalSearch, setProposalSearch] = useState('');
  const [loadingProposalItems, setLoadingProposalItems] = useState(false);
  const [quickAddCatalogSelect, setQuickAddCatalogSelect] = useState('');

  const crmDropdownRef = useRef<HTMLDivElement>(null);
  const proposalDropdownRef = useRef<HTMLDivElement>(null);

  // Fechar dropdowns ao clicar fora ou teclar ESC
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (
        showCrmItemDropdown &&
        crmDropdownRef.current &&
        !crmDropdownRef.current.contains(target)
      ) {
        setShowCrmItemDropdown(false);
      }
      if (
        showProposalDropdown &&
        proposalDropdownRef.current &&
        !proposalDropdownRef.current.contains(target)
      ) {
        setShowProposalDropdown(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowCrmItemDropdown(false);
        setShowProposalDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCrmItemDropdown, showProposalDropdown]);

  // Gestão de Biblioteca de Cláusulas Padrão (Fora do Contrato)
  const [libraryClauses, setLibraryClauses] = useState<ContractClause[]>(() => getStoredClauseLibrary(tenant?.id));
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState<string>('all');
  const [librarySavedFeedback, setLibrarySavedFeedback] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'full_text' | 'modular'>('full_text');
  const [libraryFullText, setLibraryFullText] = useState<string>(() => getStoredContractFullText(tenant?.id));

  // Modo de Edição de Termos Contratuais: 'full_text' (Minuta Contínua estilo Word) ou 'modular' (Cláusulas Modulares)
  const [clauseEditorMode, setClauseEditorMode] = useState<'full_text' | 'modular'>('full_text');
  const [formContractFullText, setFormContractFullText] = useState<string>(() => getStoredContractFullText(tenant?.id));
  const [formContractImage, setFormContractImage] = useState<string>('');

  // Cláusulas Selecionadas & Customizadas para o Contrato em Edição (No Contrato)
  const [formClauses, setFormClauses] = useState<ContractClause[]>(() =>
    getStoredClauseLibrary(tenant?.id).filter((c) => c.enabledByDefault)
  );
  const [contractCategoryFilter, setContractCategoryFilter] = useState<string>('all');
  const [expandedClauseCustomizer, setExpandedClauseCustomizer] = useState<string | null>(null);

  // Sincronizar biblioteca e minuta padrão quando o tenant carregar (F25)
  useEffect(() => {
    if (tenant?.id) {
      setLibraryClauses(getStoredClauseLibrary(tenant.id));
      setLibraryFullText(getStoredContractFullText(tenant.id));
    }
  }, [tenant?.id]);

  // Download Word (.docx)
  const [downloadingDocxId, setDownloadingDocxId] = useState<string | null>(null);

  const [formNotes, setFormNotes] = useState('');
  const [savingContract, setSavingContract] = useState(false);
  const [createError, setCreateError] = useState('');

  // ─── Carregamento Inicial & Realtime ─────────────────────────────────────────

  const loadData = async () => {
    try {
      const tenantQuery = tenant?.id ? [Query.equal('tenant_id', tenant.id)] : [];
      const [cRes, pRes, clRes, itRes]: any[] = await Promise.all([
        databases.listDocuments(DATABASE_ID, COLLECTION_CONTRACTS, [
          ...tenantQuery,
          Query.orderDesc('$createdAt'),
          Query.limit(100),
        ]),
        databases.listDocuments(DATABASE_ID, 'crm_proposals', [
          ...tenantQuery,
          Query.orderDesc('created_at'),
          Query.limit(100),
        ]),
        databases.listDocuments(DATABASE_ID, 'clients', [
          ...tenantQuery,
          Query.orderAsc('name'),
          Query.limit(300),
        ]),
        databases.listDocuments(DATABASE_ID, 'crm_items', [
          ...tenantQuery,
          Query.limit(500),
          Query.orderAsc('name'),
        ]).catch((err) => {
          console.warn('Catálogo de itens (crm_items) indisponível ou vazio:', err);
          return { documents: [] };
        }),
      ]);

      setContracts(cRes.documents.map((d: any) => ({ ...d, id: d.$id })));
      setProposals(pRes.documents.map((d: any) => ({ ...d, id: d.$id })));
      setClients(clRes.documents.map((d: any) => ({ ...d, id: d.$id })));
      if (itRes?.documents) {
        setCatalogItems(
          itRes.documents.map((d: any) => ({
            ...d,
            id: d.$id,
            price: Number(d.price) || 0,
            unit: d.unit || 'un',
            type: d.type === 'product' ? 'product' : 'service',
          }))
        );
      }
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

    // Inscrição em tempo real para itens do catálogo (crm_items)
    const itemsChannel = `databases.${DATABASE_ID}.collections.crm_items.documents`;
    const unsubscribeItems = client.subscribe(itemsChannel, (response: any) => {
      const p = response.payload;
      const mappedItem: CatalogItemOption = {
        ...p,
        id: p.$id,
        price: Number(p.price) || 0,
        unit: p.unit || 'un',
        type: p.type === 'product' ? 'product' : 'service',
      };
      if (response.events.some((e: string) => e.includes('.create'))) {
        setCatalogItems((prev) => {
          if (prev.some((i) => i.id === mappedItem.id)) return prev;
          return [mappedItem, ...prev];
        });
      } else if (response.events.some((e: string) => e.includes('.update'))) {
        setCatalogItems((prev) =>
          prev.map((i) => (i.id === mappedItem.id ? { ...i, ...mappedItem } : i))
        );
      } else if (response.events.some((e: string) => e.includes('.delete'))) {
        setCatalogItems((prev) => prev.filter((i) => i.id !== p.$id));
      }
    });

    return () => {
      try {
        unsubscribe();
        unsubscribeItems();
      } catch {}
    };
  }, [tenant?.id]);

  const currentUserId = (user as any)?.id || (user as any)?.$id || 'anon';
  const getDraftStorageKey = (tId?: string, uId?: string) =>
    `contract_creation_draft_${tId || tenant?.id || 'default'}_${uId || currentUserId}`;

  const checkAvailableDraft = () => {
    try {
      const scopedKey = getDraftStorageKey(tenant?.id, currentUserId);
      const rawScoped = localStorage.getItem(scopedKey);
      if (rawScoped) {
        const parsed = JSON.parse(rawScoped);
        if (parsed && (!parsed.tenantId || !tenant?.id || parsed.tenantId === tenant.id)) {
          setAvailableDraft(parsed);
          return;
        }
      }
      const rawLegacy = localStorage.getItem('contract_creation_draft');
      if (rawLegacy) {
        const parsed = JSON.parse(rawLegacy);
        if (parsed && (!parsed.tenantId || !tenant?.id || parsed.tenantId === tenant.id)) {
          setAvailableDraft(parsed);
          return;
        }
      }
      setAvailableDraft(null);
    } catch {
      setAvailableDraft(null);
    }
  };

  useEffect(() => {
    checkAvailableDraft();
  }, [tenant?.id, currentUserId]);

  // F30: Reset completo de todos os campos transitórios e estados do formulário de criação
  const resetContractFormState = (nextContractNumber?: string) => {
    const num =
      nextContractNumber ||
      `CTR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const todayIso = getLocalTodayIsoDate();
    setFormContractNumber(num);
    setFormTitle('Contrato de Prestação de Serviços e Soluções Tecnológicas');
    setSelectedProposalId('');
    setFormClientId('');
    setFormClientName('');
    setFormClientDocument('');
    setFormClientEmail('');
    setFormClientPhone('');
    setFormClientAddress('');
    setFormLegalRepName('');
    setFormLegalRepCpf('');
    setFormProviderName(tenantProviderName);
    setFormProviderDocument(tenantProviderDocument);
    setFormProviderAddress(tenantProviderAddress);
    setFormBillingCycle('Mensal');
    setFormStartDate(todayIso);
    setFormEndDate(addCivilMonthsToIsoDate(todayIso, 12));
    setFormIsIndefiniteTerm(false);
    setFormTotalValue(0);
    setFormSetupFee(0);
    setFormHasAdditionalFee(false);
    setFormAdditionalFee(0);
    setFormAdditionalFeeDescription('');
    setFormAdditionalFeeType('monthly');
    setFormItems([]);
    setFormClauses(getStoredClauseLibrary(tenant?.id).filter((c) => c.enabledByDefault));
    setClauseEditorMode('full_text');
    // F25: Inicializar sempre com a minuta institucional configurada para o tenant
    setFormContractFullText(getStoredContractFullText(tenant?.id));
    setFormContractImage('');
    setContractCategoryFilter('all');
    setExpandedClauseCustomizer(null);
    setFormNotes('');
    setCreateError('');
    setReviewedMinutaCheckbox(false);
    setShowFullDocPreview(false);
    setShowLegalRepFields(false);
    setShowImportDropdown(false);
    setCreateModalStep(1);
  };

  // F07: Verificar handoff de proposta (URL ?fromProposal=, localStorage ou sessionStorage) sem condição de corrida
  useEffect(() => {
    if (loading) return;

    let cancelled = false;
    async function processPendingHandoff() {
      try {
        const searchParams =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search)
            : new URLSearchParams();
        const urlFromProposal = (searchParams.get('fromProposal') || '').trim();

        const rawLocalProp = localStorage.getItem('create_contract_from_proposal');
        const rawSessionProp = sessionStorage.getItem('create_contract_from_proposal');
        const rawProp = rawLocalProp || rawSessionProp;

        if (urlFromProposal || rawProp) {
          let parsedHandoff: any = null;
          if (rawProp) {
            try {
              parsedHandoff = JSON.parse(rawProp);
            } catch {}
          }

          // Validar isolamento de tenant se o handoff informar tenantId
          if (
            parsedHandoff?.tenantId &&
            tenant?.id &&
            parsedHandoff.tenantId !== tenant.id
          ) {
            localStorage.removeItem('create_contract_from_proposal');
            sessionStorage.removeItem('create_contract_from_proposal');
            return;
          }

          const targetPropId =
            urlFromProposal || parsedHandoff?.proposalId || parsedHandoff?.id;
          if (targetPropId && !cancelled) {
            await handleOpenCreateModal(targetPropId, parsedHandoff);
            localStorage.removeItem('create_contract_from_proposal');
            sessionStorage.removeItem('create_contract_from_proposal');
            return;
          }
        }

        const rawClient = sessionStorage.getItem('create_contract_from_client');
        if (rawClient) {
          sessionStorage.removeItem('create_contract_from_client');
          const c = JSON.parse(rawClient);
          if ((c?.name || c?.id) && !cancelled) {
            await handleOpenCreateModalWithClient(c);
          }
        }
      } catch (err) {
        console.warn('Erro ao processar handoff para criação de contrato:', err);
      }
    }

    processPendingHandoff();
    return () => {
      cancelled = true;
    };
  }, [loading, proposals.length, clients.length, tenant?.id]);

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

  // ─── Abrir Criação de Contrato (Sem Popup / Modo Página Completa) ────────────

  const loadDemoData = () => {
    const nextNumber =
      formContractNumber ||
      `CTR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    resetContractFormState(nextNumber);
    setFormTitle('Contrato de Prestação de Serviços e Soluções Tecnológicas');
    setFormClientName('Empresa Exemplo Ltda.');
    setFormClientDocument('00.000.000/0001-00');
    setFormClientPhone('(11) 90000-0000');
    setFormClientEmail('financeiro@example.com');
    setFormClientAddress('Rua Exemplo, 100, Centro, São Paulo — SP');
    setFormContractFullText(getStoredContractFullText(tenant?.id));
    setClauseEditorMode('full_text');
    setShowImportDropdown(false);
  };

  // F28: Persistência e restauração completa de rascunho escopado por tenant + usuário
  const handleSaveDraft = () => {
    try {
      const draftData = {
        tenantId: tenant?.id || 'default',
        userId: currentUserId,
        selectedProposalId,
        formContractNumber,
        formTitle,
        formClientId,
        formClientName,
        formClientDocument,
        formClientEmail,
        formClientPhone,
        formClientAddress,
        formLegalRepName,
        formLegalRepCpf,
        formProviderName,
        formProviderDocument,
        formProviderAddress,
        formStartDate,
        formEndDate,
        formBillingCycle,
        formTotalValue,
        formSetupFee,
        formHasAdditionalFee,
        formAdditionalFee,
        formAdditionalFeeDescription,
        formAdditionalFeeType,
        formIsIndefiniteTerm,
        formItems,
        formContractFullText,
        formContractImage,
        formClauses,
        clauseEditorMode,
        formNotes,
        updatedAt: new Date().toISOString(),
      };
      const scopedKey = getDraftStorageKey(tenant?.id, currentUserId);
      localStorage.setItem(scopedKey, JSON.stringify(draftData));
      localStorage.setItem('contract_creation_draft', JSON.stringify(draftData));
      setAvailableDraft(draftData);
      setDraftSavedFeedback(true);
      setTimeout(() => setDraftSavedFeedback(false), 2500);
    } catch (err) {
      console.error('Erro ao salvar rascunho:', err);
    }
  };

  const handleRestoreDraft = () => {
    if (!availableDraft) return;
    const d = availableDraft;
    if (d.selectedProposalId !== undefined) setSelectedProposalId(d.selectedProposalId || '');
    if (d.formContractNumber) setFormContractNumber(d.formContractNumber);
    if (d.formTitle !== undefined) setFormTitle(d.formTitle);
    if (d.formClientId !== undefined) setFormClientId(d.formClientId || '');
    if (d.formClientName !== undefined) setFormClientName(d.formClientName || '');
    if (d.formClientDocument !== undefined) setFormClientDocument(d.formClientDocument || '');
    if (d.formClientEmail !== undefined) setFormClientEmail(d.formClientEmail || '');
    if (d.formClientPhone !== undefined) setFormClientPhone(d.formClientPhone || '');
    if (d.formClientAddress !== undefined) setFormClientAddress(d.formClientAddress || '');
    if (d.formLegalRepName !== undefined) setFormLegalRepName(d.formLegalRepName || '');
    if (d.formLegalRepCpf !== undefined) setFormLegalRepCpf(d.formLegalRepCpf || '');
    if (d.formProviderName) setFormProviderName(d.formProviderName);
    if (d.formProviderDocument) setFormProviderDocument(d.formProviderDocument);
    if (d.formProviderAddress) setFormProviderAddress(d.formProviderAddress);
    if (d.formStartDate) setFormStartDate(d.formStartDate);
    if (d.formEndDate !== undefined) setFormEndDate(d.formEndDate);
    if (d.formBillingCycle) setFormBillingCycle(d.formBillingCycle);
    if (d.formTotalValue !== undefined) setFormTotalValue(Number(d.formTotalValue) || 0);
    if (d.formSetupFee !== undefined) setFormSetupFee(Number(d.formSetupFee) || 0);
    if (d.formHasAdditionalFee !== undefined) setFormHasAdditionalFee(Boolean(d.formHasAdditionalFee));
    if (d.formAdditionalFee !== undefined) setFormAdditionalFee(Number(d.formAdditionalFee) || 0);
    if (d.formAdditionalFeeDescription !== undefined) setFormAdditionalFeeDescription(d.formAdditionalFeeDescription || '');
    if (d.formAdditionalFeeType) setFormAdditionalFeeType(d.formAdditionalFeeType);
    if (d.formIsIndefiniteTerm !== undefined) setFormIsIndefiniteTerm(Boolean(d.formIsIndefiniteTerm));
    if (Array.isArray(d.formItems)) setFormItems(d.formItems);
    if (d.formContractFullText) setFormContractFullText(d.formContractFullText);
    if (d.formContractImage !== undefined) setFormContractImage(d.formContractImage || '');
    if (Array.isArray(d.formClauses) && d.formClauses.length > 0) setFormClauses(d.formClauses);
    if (d.clauseEditorMode) setClauseEditorMode(d.clauseEditorMode);
    if (d.formNotes !== undefined) setFormNotes(d.formNotes || '');
    setAvailableDraft(null);
  };

  const handleDiscardDraft = () => {
    try {
      const scopedKey = getDraftStorageKey(tenant?.id, currentUserId);
      localStorage.removeItem(scopedKey);
      localStorage.removeItem('contract_creation_draft');
    } catch {}
    setAvailableDraft(null);
  };

  const handleOpenCreateModal = async (initialProposalId?: string, handoffSnapshot?: any) => {
    // F30: Limpar todos os estados anteriores antes de iniciar um novo contrato
    resetContractFormState();
    checkAvailableDraft();

    if (initialProposalId) {
      setSelectedProposalId(initialProposalId);
      await applyProposalToForm(initialProposalId, handoffSnapshot);
    }

    setCreateModalStep(1);
    setShowCreateModal(false);
    setPageView('create');
  };

  // Abrir Formulário de Criação já com cliente selecionado da página de clientes
  const handleOpenCreateModalWithClient = async (clientData: any) => {
    resetContractFormState();
    setFormTitle(`Contrato de Prestação de Serviços - ${clientData.name || 'Cliente'}`);
    setFormClientId(clientData.id || '');
    setFormClientName(clientData.name || '');
    setFormClientDocument(formatDocumentMask(clientData.document || ''));
    setFormClientEmail(clientData.email || '');
    setFormClientPhone(clientData.phone || '');
    setFormClientAddress(clientData.address || '');

    const rep = parseLegalRepresentative(clientData.notes);
    setFormLegalRepName(clientData.legal_representative_name || rep.name || '');
    setFormLegalRepCpf(clientData.legal_representative_cpf || rep.cpf || '');
    if (clientData.legal_representative_name || rep.name || clientData.legal_representative_cpf || rep.cpf) {
      setShowLegalRepFields(true);
    }

    // Verifica se esse cliente possui proposta comercial cadastrada
    const matchedProp = proposals.find(
      (p) =>
        (clientData.id && p.related_id === clientData.id) ||
        (clientData.name && p.to_name && p.to_name.toLowerCase() === clientData.name.toLowerCase())
    );

    if (matchedProp) {
      setSelectedProposalId(matchedProp.id);
      await applyProposalToForm(matchedProp.id);
    }

    setCreateModalStep(1);
    setShowCreateModal(false);
    setPageView('create');
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
        (p.to_name && cl.name && p.to_name.toLowerCase() === cl.name.toLowerCase())
    );

    if (clientProposal) {
      setSelectedProposalId(clientProposal.id);
      await applyProposalToForm(clientProposal.id);
    }
  };

  // Preenche dados completos ao selecionar ou importar uma proposta comercial (F05, F07, F32)
  const applyProposalToForm = async (propId: string, fallbackProposal?: any): Promise<boolean> => {
    let p: any = proposals.find((item) => item.id === propId);

    // F07: Se a lista de propostas ainda não contiver a proposta, busca diretamente no Appwrite por ID
    if (!p && propId) {
      try {
        const fetchedDoc: any = await databases.getDocument(DATABASE_ID, 'crm_proposals', propId);
        if (fetchedDoc) {
          if (tenant?.id && fetchedDoc.tenant_id && fetchedDoc.tenant_id !== tenant.id) {
            console.warn('Tentativa de importar proposta de outro tenant bloqueada.');
            return false;
          }
          p = { ...fetchedDoc, id: fetchedDoc.$id };
        }
      } catch {
        if (fallbackProposal && (fallbackProposal.id === propId || fallbackProposal.proposalId === propId)) {
          p = fallbackProposal;
        }
      }
    }

    if (!p && fallbackProposal) {
      p = fallbackProposal;
    }
    if (!p) return false;

    setFormTitle(`Contrato de Prestação de Serviços - ${p.to_name || p.subject || 'Cliente'}`);
    setFormClientName(p.to_name || '');
    setFormClientEmail(p.email || '');
    setFormClientPhone(p.phone || '');

    const addr =
      p.address && !p.city
        ? p.address
        : [p.address, p.city, p.state, p.zip_code ? `CEP: ${p.zip_code}` : ''].filter(Boolean).join(', ');
    setFormClientAddress(addr);

    // Início de vigência civil (F32)
    const rawStart = String(p.start_date || p.date || getLocalTodayIsoDate()).slice(0, 10);
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : getLocalTodayIsoDate();
    setFormStartDate(startDate);
    setFormEndDate(addCivilMonthsToIsoDate(startDate, 12));

    // Tentar localizar documento do cliente na lista de clientes ou buscando pelo related_id
    let clientDoc = '';
    if (p.related_id) {
      setFormClientId(p.related_id);
      let cl: any = clients.find((c) => c.id === p.related_id);
      if (!cl) {
        try {
          cl = await databases.getDocument(DATABASE_ID, 'clients', p.related_id);
        } catch {}
      }
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
      const cl = clients.find((c) => c.name && c.name.toLowerCase() === (p.to_name || '').toLowerCase());
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

    // Carregar itens da proposta comercial e discriminar taxas de setup vs recorrência sem dupla contagem (F05)
    try {
      const { documents: itemsData } = await databases.listDocuments(DATABASE_ID, 'crm_proposal_items', [
        Query.equal('proposal_id', propId),
        Query.limit(100),
      ]);

      let detectedSetupItemsSum = 0;
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
          const billingType: ContractItemBillingType = isSetup ? 'setup' : 'recurring';
          if (isSetup) {
            detectedSetupItemsSum += amount;
          } else {
            detectedRecurringValue += amount;
          }

          // Detecta ciclo de faturamento se mencionado no item recorrente
          if (!isSetup) {
            if (/(anual|ano|12 meses)/i.test(`${name} ${desc}`)) {
              detectedBillingCycle = 'Anual';
            } else if (/(semestral|6 meses)/i.test(`${name} ${desc}`)) {
              detectedBillingCycle = 'Semestral';
            } else if (/(trimestral|3 meses)/i.test(`${name} ${desc}`)) {
              detectedBillingCycle = 'Trimestral';
            }
          }

          return {
            name,
            description: desc,
            qty,
            rate,
            amount,
            unit: d.unit || 'un',
            billingType,
          };
        });

        setFormItems(mappedItems);

        // F05: Se os itens de setup já estão discriminados em mappedItems (billingType: 'setup'),
        // não duplicar o valor em formSetupFee a menos que o cabeçalho da proposta tenha uma taxa extra separada
        const headerSetupFee = Number(p.setup_fee) || 0;
        const standaloneSetupFee =
          detectedSetupItemsSum > 0
            ? Math.max(0, headerSetupFee - detectedSetupItemsSum)
            : headerSetupFee;

        setFormSetupFee(standaloneSetupFee);
        setFormTotalValue(detectedRecurringValue);
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
            billingType: 'recurring',
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
          billingType: 'recurring',
        },
      ]);
    }
    return true;
  };

  // F02: Emitir token público assinado e escopado pelo servidor para o link de assinatura
  const issueServerContractToken = async (contractId: string): Promise<string | null> => {
    try {
      const headers = await getAuthoritativeAuthHeaders();
      const res = await fetch('/api/contracts/issue-token', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contractId,
          tenantId: tenant?.id || '',
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        const issued = data?.token || data?.signature_token || data?.publicToken;
        if (typeof issued === 'string' && issued.trim()) {
          return issued.trim();
        }
      }
    } catch (err) {
      console.warn('Aviso ao solicitar emissão de token no servidor (/api/contracts/issue-token):', err);
    }
    return null;
  };

  // ─── Salvar Novo Contrato ───────────────────────────────────────────────────

  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (!formClientName.trim()) {
      setCreateError('O nome do cliente / contratante é obrigatório.');
      setCreateModalStep(1);
      return;
    }

    if (!formClientDocument.trim()) {
      setCreateError('O documento (CPF ou CNPJ) do cliente é obrigatório para validação jurídica da assinatura.');
      setCreateModalStep(1);
      return;
    }

    setSavingContract(true);
    try {
      let signatureToken = `${ID.unique()}_${Math.random().toString(36).slice(2, 10)}`;
      const contractId = ID.unique();

      // Compilar cláusulas ativas com base no modo selecionado (F27)
      let activeClauses = formClauses;
      let canonicalFullText = formContractFullText;
      if (clauseEditorMode === 'full_text') {
        activeClauses = continuousTextToClauses(formContractFullText);
        if (formContractImage && activeClauses.length > 0) {
          activeClauses[0].imageUrl = formContractImage;
          activeClauses[0].imagePosition = 'below';
        }
      } else {
        canonicalFullText = clausesToContinuousText(activeClauses);
      }

      // 1. Salvar cópia local integral tanto do texto contínuo quanto das cláusulas estruturadas
      try {
        localStorage.setItem(`contract_text_${contractId}`, canonicalFullText);
        localStorage.setItem(`contract_clauses_${contractId}`, JSON.stringify(activeClauses));
      } catch (err) {
        console.warn('Erro ao salvar cláusulas em cache local:', err);
      }

      // 2. Codificar JSON para o Appwrite (incluindo cobrança adicional se houver, com classificação explícita)
      const itemsToSave: ContractItem[] = formItems.map((it) => ({
        ...it,
        billingType: inferContractItemBillingType(it),
      }));
      if (formHasAdditionalFee && Number(formAdditionalFee) > 0) {
        itemsToSave.push({
          name: formAdditionalFeeDescription.trim() || 'Cobrança Adicional',
          description:
            formAdditionalFeeType === 'monthly'
              ? 'Cobrança adicional mensal recorrente'
              : formAdditionalFeeType === 'per_cycle'
              ? `Cobrança adicional por ciclo (${formBillingCycle.toLowerCase()})`
              : 'Cobrança adicional em pagamento único',
          qty: 1,
          rate: Number(formAdditionalFee) || 0,
          amount: Number(formAdditionalFee) || 0,
          unit:
            formAdditionalFeeType === 'monthly'
              ? 'mês'
              : formAdditionalFeeType === 'per_cycle'
              ? 'ciclo'
              : 'único',
          billingType:
            formAdditionalFeeType === 'monthly'
              ? 'monthly_additional'
              : formAdditionalFeeType === 'per_cycle'
              ? 'recurring'
              : 'one_time',
        });
      }
      const safeItemsJson = JSON.stringify(itemsToSave);
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
        end_date: formIsIndefiniteTerm ? '' : formEndDate,
        billing_cycle: formBillingCycle,
        total_value:
          Number(
            formBillingCycle === 'Pagamento único'
              ? calculatedTotalVigencia
              : effectiveRecurringValue > 0
              ? effectiveRecurringValue
              : additionalMonthlyFee > 0
              ? additionalMonthlyFee
              : calculatedTotalVigencia
          ) || 0,
        setup_fee: Number(effectiveSetupFee + additionalOneTime) || 0,
        items_json: safeItemsJson,
        clauses_json: safeClausesJson,
        notes: encodedNotes,
        status: 'pending_signature',
        signature_token: signatureToken,
        created_at: new Date().toISOString(),
      };

      const doc = await databases.createDocument(DATABASE_ID, COLLECTION_CONTRACTS, contractId, payload);

      // F02: Solicitar token de assinatura emitido e assinado pelo servidor
      const serverIssuedToken = await issueServerContractToken(doc.$id);
      if (serverIssuedToken) {
        signatureToken = serverIssuedToken;
      }

      try {
        localStorage.setItem(`contract_text_${doc.$id}`, canonicalFullText);
        localStorage.setItem(`contract_clauses_${doc.$id}`, JSON.stringify(activeClauses));
        localStorage.setItem(`contract_rep_${doc.$id}`, JSON.stringify({ name: formLegalRepName, cpf: formLegalRepCpf }));
      } catch {}

      // Limpar rascunho salvo após conclusão com sucesso (F28)
      handleDiscardDraft();

      const newContract: Contract = {
        ...doc,
        id: doc.$id,
        signature_token: signatureToken,
      } as unknown as Contract;

      setContracts((prev) => [newContract, ...prev]);
      setPageView('list');
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

  // F29: Cláusulas visíveis após filtro de categoria e reordenação relativa à lista filtrada
  const filteredLibraryClauses = useMemo(() => {
    return libraryClauses.filter(
      (c) => libraryCategoryFilter === 'all' || c.category === libraryCategoryFilter
    );
  }, [libraryClauses, libraryCategoryFilter]);

  const handleMoveLibraryClause = (clauseId: string, dir: 'up' | 'down') => {
    setLibraryClauses((prev) => {
      const visible = prev.filter(
        (c) => libraryCategoryFilter === 'all' || c.category === libraryCategoryFilter
      );
      const visibleIdx = visible.findIndex((c) => c.id === clauseId);
      if (visibleIdx === -1) return prev;
      const neighborIdx = dir === 'up' ? visibleIdx - 1 : visibleIdx + 1;
      if (neighborIdx < 0 || neighborIdx >= visible.length) return prev;

      const targetNeighborId = visible[neighborIdx].id;
      const realIdxA = prev.findIndex((c) => c.id === clauseId);
      const realIdxB = prev.findIndex((c) => c.id === targetNeighborId);
      if (realIdxA === -1 || realIdxB === -1) return prev;

      const copy = [...prev];
      const temp = copy[realIdxA];
      copy[realIdxA] = copy[realIdxB];
      copy[realIdxB] = temp;
      return copy;
    });
  };

  const handleResetLibraryToDefault = () => {
    if (!window.confirm('Deseja restaurar as cláusulas e minuta padrão da empresa para o modelo de fábrica?')) return;
    setLibraryClauses(DEFAULT_LIBRARY_CLAUSES);
    saveStoredClauseLibrary(DEFAULT_LIBRARY_CLAUSES, tenant?.id);
    setLibraryFullText(DEFAULT_TELEFONIA_FULL_TEXT);
    saveStoredContractFullText(DEFAULT_TELEFONIA_FULL_TEXT, tenant?.id);
    setFormContractFullText(DEFAULT_TELEFONIA_FULL_TEXT);
    setLibrarySavedFeedback(true);
    setTimeout(() => setLibrarySavedFeedback(false), 2500);
  };

  const handleSaveLibrary = () => {
    saveStoredClauseLibrary(libraryClauses, tenant?.id);
    saveStoredContractFullText(libraryFullText, tenant?.id);
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
      const clauses = parseContractClauses(c.clauses_json, c.id, (c as any).content);
      await downloadContractDocx(c, items, clauses);
    } catch (err) {
      console.error('Erro ao baixar contrato em Word:', err);
      alert('Não foi possível gerar o arquivo Word.');
    } finally {
      setDownloadingDocxId(null);
    }
  };

  // ─── Helpers de Links e WhatsApp (F02) ───────────────────────────────────────

  const getSignUrl = (c: Contract, overrideToken?: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const tok = overrideToken || c.signature_token || '';
    const tokenParam = tok ? `?token=${encodeURIComponent(tok)}` : '';
    return `${origin}/assinar/${c.id}${tokenParam}`;
  };

  const handleCopySignLink = async (c: Contract, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let tokenToUse = c.signature_token;
    if (!tokenToUse) {
      const issued = await issueServerContractToken(c.id);
      if (issued) {
        tokenToUse = issued;
        setContracts((prev) =>
          prev.map((item) => (item.id === c.id ? { ...item, signature_token: issued } : item))
        );
      }
    }
    const url = getSignUrl(c, tokenToUse);
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

  const handleShareWhatsApp = async (c: Contract, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let tokenToUse = c.signature_token;
    if (!tokenToUse) {
      const issued = await issueServerContractToken(c.id);
      if (issued) {
        tokenToUse = issued;
        setContracts((prev) =>
          prev.map((item) => (item.id === c.id ? { ...item, signature_token: issued } : item))
        );
      }
    }
    const url = getSignUrl(c, tokenToUse);
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

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // F05: Separação explícita entre itens recorrentes e itens de setup/pagamento único
  const totalItemsAmount = useMemo(() => {
    return formItems.reduce(
      (acc, it) => acc + (Number(it.amount) || (Number(it.qty) || 0) * (Number(it.rate) || 0)),
      0
    );
  }, [formItems]);

  const recurringItemsAmount = useMemo(() => {
    return formItems.reduce((acc, it) => {
      const bType = inferContractItemBillingType(it);
      if (bType === 'setup' || bType === 'one_time') return acc;
      return acc + (Number(it.amount) || (Number(it.qty) || 0) * (Number(it.rate) || 0));
    }, 0);
  }, [formItems]);

  const setupItemsAmount = useMemo(() => {
    return formItems.reduce((acc, it) => {
      const bType = inferContractItemBillingType(it);
      if (bType === 'setup' || bType === 'one_time') {
        return acc + (Number(it.amount) || (Number(it.qty) || 0) * (Number(it.rate) || 0));
      }
      return acc;
    }, 0);
  }, [formItems]);

  // F05: Sincronizar formTotalValue apenas com os itens recorrentes (sem somar setup na recorrência)
  useEffect(() => {
    setFormTotalValue(recurringItemsAmount);
  }, [recurringItemsAmount]);

  const itemsRecurringBase = recurringItemsAmount;
  const additionalMonthlyFee =
    formHasAdditionalFee && formAdditionalFeeType === 'monthly' ? Number(formAdditionalFee) || 0 : 0;
  const additionalPerCycleFee =
    formHasAdditionalFee && formAdditionalFeeType === 'per_cycle' ? Number(formAdditionalFee) || 0 : 0;
  const additionalOneTime =
    formHasAdditionalFee && formAdditionalFeeType === 'one_time' ? Number(formAdditionalFee) || 0 : 0;

  // F26: Quando o ciclo principal é Mensal, a taxa mensal adicional integra a parcela mensal.
  // Quando o ciclo principal é Anual/Semestral/Trimestral, a parcela do ciclo principal contém itemsRecurringBase + additionalPerCycleFee,
  // e a taxa mensal adicional é contabilizada mês a mês (additionalMonthlyFee * months).
  const effectiveRecurringValue =
    formBillingCycle === 'Pagamento único'
      ? 0
      : formBillingCycle === 'Mensal'
      ? itemsRecurringBase + additionalMonthlyFee + additionalPerCycleFee
      : itemsRecurringBase + additionalPerCycleFee;

  // F05: Taxa de implantação total combina itens classificados como setup/único + campo de implantação sem duplicação
  const effectiveSetupFee = setupItemsAmount + (Number(formSetupFee) || 0);

  const calculatedMonthsDuration = useMemo(() => {
    if (formIsIndefiniteTerm) return 0;
    const sMatch = String(formStartDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    const eMatch = String(formEndDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (sMatch && eMatch) {
      const sYear = Number(sMatch[1]);
      const sMonth = Number(sMatch[2]);
      const sDay = Number(sMatch[3]);
      const eYear = Number(eMatch[1]);
      const eMonth = Number(eMatch[2]);
      const eDay = Number(eMatch[3]);
      let diffMonths = (eYear - sYear) * 12 + (eMonth - sMonth);
      if (eDay > sDay) {
        diffMonths += 1;
      }
      return Math.max(1, diffMonths);
    }
    return 12;
  }, [formStartDate, formEndDate, formIsIndefiniteTerm]);

  // F31: Cálculo preciso de ciclos iniciados (Math.ceil) e indicação de período parcial
  const billingCycleDetails = useMemo(() => {
    const months = calculatedMonthsDuration || 12;
    return calculateContractBillingCycles(months, formBillingCycle, formIsIndefiniteTerm);
  }, [calculatedMonthsDuration, formBillingCycle, formIsIndefiniteTerm]);

  const calculatedTotalVigencia = useMemo(() => {
    const months = formIsIndefiniteTerm ? 1 : calculatedMonthsDuration || 12;

    if (formBillingCycle === 'Pagamento único') {
      return (
        itemsRecurringBase +
        additionalMonthlyFee * months +
        additionalPerCycleFee +
        effectiveSetupFee +
        additionalOneTime
      );
    }

    if (formIsIndefiniteTerm) {
      return (
        itemsRecurringBase +
        additionalPerCycleFee +
        additionalMonthlyFee +
        effectiveSetupFee +
        additionalOneTime
      );
    }

    const { cyclesCount } = billingCycleDetails;
    const mainCyclesTotal = (itemsRecurringBase + additionalPerCycleFee) * cyclesCount;
    const monthlyAdditionalTotal = additionalMonthlyFee * months;

    return mainCyclesTotal + monthlyAdditionalTotal + effectiveSetupFee + additionalOneTime;
  }, [
    formBillingCycle,
    formIsIndefiniteTerm,
    calculatedMonthsDuration,
    billingCycleDetails,
    itemsRecurringBase,
    additionalMonthlyFee,
    additionalPerCycleFee,
    effectiveSetupFee,
    additionalOneTime,
  ]);

  const effectivePreviewMinutaText = useMemo(() => {
    if (clauseEditorMode === 'modular') {
      return clausesToContinuousText(formClauses);
    }
    return formContractFullText;
  }, [clauseEditorMode, formClauses, formContractFullText]);

  const isStep1Complete = Boolean(formClientName.trim() && formClientDocument.trim());
  const isStep2Complete = Boolean(formItems.length > 0 && formItems.every((i) => i.name.trim()));
  const isStep3Complete = Boolean(formStartDate && (formIsIndefiniteTerm || formEndDate));
  const isStep4Complete = Boolean(
    reviewedMinutaCheckbox || (effectivePreviewMinutaText && effectivePreviewMinutaText.trim().length > 20)
  );

  const setVigenciaMonths = (months: number) => {
    const baseIso = formStartDate || getLocalTodayIsoDate();
    setFormEndDate(addCivilMonthsToIsoDate(baseIso, months));
  };

  // Grupos únicos de categorias de itens pré-cadastrados
  const catalogGroups = useMemo(() => {
    const set = new Set<string>();
    catalogItems.forEach((it) => {
      if (it.group_name && it.group_name.trim()) set.add(it.group_name.trim());
      else if (it.category && it.category.trim()) set.add(it.category.trim());
    });
    return ['Todos', ...Array.from(set)];
  }, [catalogItems]);

  // Itens filtrados do catálogo pré-cadastrado no sistema
  const filteredCatalogItems = useMemo(() => {
    return catalogItems.filter((it) => {
      const matchesGroup =
        catalogCategoryFilter === 'Todos' ||
        it.group_name === catalogCategoryFilter ||
        it.category === catalogCategoryFilter;
      if (!matchesGroup) return false;

      const matchesType =
        catalogTypeFilter === 'all' || it.type === catalogTypeFilter;
      if (!matchesType) return false;

      if (!catalogSearch.trim()) return true;
      const q = catalogSearch.toLowerCase();
      const nameMatch = (it.name || '').toLowerCase().includes(q);
      const descMatch = (it.short_description || it.long_description || '')
        .toLowerCase()
        .includes(q);
      const groupMatch = (it.group_name || it.category || '').toLowerCase().includes(q);
      return nameMatch || descMatch || groupMatch;
    });
  }, [catalogItems, catalogCategoryFilter, catalogTypeFilter, catalogSearch]);

  // Adicionar item do catálogo diretamente à lista de itens do contrato
  const handleAddCatalogItem = (catItem: CatalogItemOption) => {
    const newItem: ContractItem = {
      name: catItem.name || '',
      description: catItem.short_description || catItem.long_description || '',
      qty: 1,
      rate: Number(catItem.price) || 0,
      amount: Number(catItem.price) || 0,
      unit: catItem.unit || 'un',
      billingType: 'recurring',
    };

    setFormItems((prev) => {
      // Se houver apenas 1 item e ele estiver completamente em branco, substitui para conveniência
      if (
        prev.length === 1 &&
        !prev[0].name.trim() &&
        (!prev[0].rate || prev[0].rate === 0) &&
        !prev[0].description?.trim()
      ) {
        return [newItem];
      }
      return [...prev, newItem];
    });

    setAddedItemFeedbackId(catItem.id);
    setTimeout(() => {
      setAddedItemFeedbackId((curr) => (curr === catItem.id ? null : curr));
    }, 1800);
  };

  // Preencher uma linha específica de item com os dados de um item do catálogo
  const handleApplyCatalogItemToRow = (rowIndex: number, catItemId: string) => {
    if (!catItemId) return;
    const catItem = catalogItems.find((it) => it.id === catItemId);
    if (!catItem) return;

    setFormItems((prev) => {
      const copy = [...prev];
      const curr = copy[rowIndex];
      const qty = curr?.qty || 1;
      const rate = Number(catItem.price) || 0;
      copy[rowIndex] = {
        ...curr,
        name: catItem.name || '',
        description: catItem.short_description || catItem.long_description || curr?.description || '',
        rate: rate,
        qty: qty,
        amount: qty * rate,
        unit: catItem.unit || curr?.unit || 'un',
        billingType: curr?.billingType || 'recurring',
      };
      return copy;
    });
  };

  // Itens do CRM filtrados por texto digitado
  const filteredDropdownCrmItems = useMemo(() => {
    if (!crmItemSearch.trim()) return catalogItems;
    const q = crmItemSearch.toLowerCase();
    return catalogItems.filter(
      (item) =>
        (item.name || '').toLowerCase().includes(q) ||
        (item.group_name || item.category || '').toLowerCase().includes(q) ||
        (item.short_description || item.long_description || '').toLowerCase().includes(q)
    );
  }, [catalogItems, crmItemSearch]);

  // Propostas filtradas por texto digitado
  const filteredDropdownProposals = useMemo(() => {
    if (!proposalSearch.trim()) return proposals;
    const q = proposalSearch.toLowerCase();
    return proposals.filter(
      (p) =>
        (p.subject || '').toLowerCase().includes(q) ||
        (p.to_name || '').toLowerCase().includes(q) ||
        (p.proposal_number || '').toLowerCase().includes(q)
    );
  }, [proposals, proposalSearch]);

  // Selecionar item do catálogo do CRM e adicionar ao contrato
  const handleSelectCrmItem = (catItem: CatalogItemOption) => {
    const newItem: ContractItem = {
      name: catItem.name || '',
      description: catItem.short_description || catItem.long_description || '',
      qty: 1,
      rate: Number(catItem.price) || 0,
      amount: Number(catItem.price) || 0,
      unit: catItem.unit || 'un',
      billingType: 'recurring',
    };
    setFormItems((prev) => [...prev, newItem]);
    setShowCrmItemDropdown(false);
    setCrmItemSearch('');
  };

  // Importar todos os itens de uma proposta comercial e adicionar ao contrato
  const handleImportItemsFromProposal = async (proposalId: string) => {
    const p = proposals.find((item) => item.id === proposalId);
    if (!p) return;

    setLoadingProposalItems(true);
    try {
      const { documents: itemsData } = await databases.listDocuments(DATABASE_ID, 'crm_proposal_items', [
        Query.equal('proposal_id', proposalId),
        Query.limit(100),
      ]);

      if (itemsData && itemsData.length > 0) {
        const mappedItems: ContractItem[] = itemsData.map((d: any) => {
          const itemName = String(d.name || '');
          const itemDesc = String(d.description || d.long_description || '');
          const isSetupLine =
            d.billing_type === 'setup' ||
            /implant|setup|instala|configura|ades[aã]o|ativac/i.test(`${itemName} ${itemDesc}`);
          const isOneTimeLine =
            d.billing_type === 'one_time' ||
            (!isSetupLine && /avuls|pontual|pagamento\s*[uú]nico/i.test(`${itemName} ${itemDesc}`));
          const billingType: ContractItemBillingType = isSetupLine
            ? 'setup'
            : isOneTimeLine
            ? 'one_time'
            : 'recurring';
          return {
            name: itemName,
            description: itemDesc,
            qty: Number(d.qty) || 1,
            rate: Number(d.rate) || 0,
            amount: Number(d.amount) || (Number(d.qty) || 1) * (Number(d.rate) || 0),
            unit: d.unit || (isSetupLine ? 'setup' : 'un'),
            billingType,
          };
        });

        setFormItems((prev) => [...prev, ...mappedItems]);
      } else {
        const totalProp = Number(p.total) || 0;
        setFormItems((prev) => [
          ...prev,
          {
            name: p.subject || 'Item da Proposta Comercial',
            description: `Importado da proposta ${p.proposal_number || ''}`.trim(),
            qty: 1,
            rate: totalProp,
            amount: totalProp,
            unit: 'un',
            billingType: 'recurring',
          },
        ]);
      }

      setShowProposalDropdown(false);
      setProposalSearch('');
    } catch (err) {
      console.error('Erro ao importar itens da proposta:', err);
      const totalProp = Number(p.total) || 0;
      setFormItems((prev) => [
        ...prev,
        {
          name: p.subject || 'Item da Proposta Comercial',
          description: `Importado da proposta ${p.proposal_number || ''}`.trim(),
          qty: 1,
          rate: totalProp,
          amount: totalProp,
          unit: 'un',
          billingType: 'recurring',
        },
      ]);
      setShowProposalDropdown(false);
      setProposalSearch('');
    } finally {
      setLoadingProposalItems(false);
    }
  };

  const handleAddItem = () => {
    setFormItems((prev) => [
      ...prev,
      {
        name: '',
        description: '',
        qty: 1,
        rate: 0,
        amount: 0,
        unit: 'un',
        billingType: 'recurring',
      },
    ]);
  };

  const handleUpdateItem = (index: number, field: keyof ContractItem, val: any) => {
    setFormItems((prev) => {
      const copy = [...prev];
      const it = { ...copy[index], [field]: val };
      if (field === 'qty' || field === 'rate') {
        const q = field === 'qty' ? Number(val) || 0 : it.qty;
        const r = field === 'rate' ? Number(val) || 0 : it.rate;
        it.amount = q * r;
      }
      copy[index] = it;
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApplyItemsTotalToRecurring = () => {
    setFormTotalValue(recurringItemsAmount);
    if (setupItemsAmount > 0) {
      setFormSetupFee(setupItemsAmount);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setFormContractImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      {pageView === 'create' ? (
        /* ─── TELA CHEIA: NOVO CONTRATO (SEM POPUP) ─── */
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* 1. Breadcrumb e Ações Topo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => {
                  resetContractFormState();
                  setPageView('list');
                }}
                className="hover:text-violet-600 dark:hover:text-violet-400 font-medium transition cursor-pointer flex items-center gap-1"
              >
                Contratos & Assinaturas
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900 dark:text-white font-semibold">Novo contrato</span>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setCreateModalStep(4)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Prévia interativa</span>
              </button>
            </div>
          </div>

          {/* 2. Header da Página */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider block mb-1">
                COMERCIAL & VENDAS
              </span>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Novo contrato
                </h1>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  Rascunho
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Do primeiro detalhe à assinatura. Tudo em um só lugar.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSaveDraft}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121824] hover:bg-slate-50 dark:hover:bg-[#182133] text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
            >
              {draftSavedFeedback ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Rascunho salvo!</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4 text-slate-500" />
                  <span>Salvar rascunho</span>
                </>
              )}
            </button>
          </div>

          {/* Banner de Rascunho Salvo Disponível para Restauração (F28) */}
          {availableDraft && (
            <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <Bookmark className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-900 dark:text-amber-200 block">
                    Rascunho salvo encontrado
                    {availableDraft.clientName ? ` — ${availableDraft.clientName}` : ''}
                  </span>
                  <span className="text-amber-700 dark:text-amber-300/80 text-[11px]">
                    {availableDraft.savedAt
                      ? `Salvo em ${new Date(availableDraft.savedAt).toLocaleString('pt-BR')}. `
                      : ''}
                    Deseja restaurar os dados preenchidos anteriormente ou descartar?
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleRestoreDraft}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition cursor-pointer"
                >
                  Restaurar rascunho
                </button>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 font-semibold transition cursor-pointer"
                >
                  Descartar
                </button>
              </div>
            </div>
          )}

          {/* 3. Stepper Horizontal com 4 Etapas */}
          <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Etapa 1 */}
              <button
                type="button"
                onClick={() => setCreateModalStep(1)}
                className={`p-3 rounded-xl transition-all text-left flex items-center gap-3 cursor-pointer ${
                  createModalStep === 1
                    ? 'bg-violet-50/80 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/40 shadow-xs'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] border border-transparent'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    createModalStep === 1
                      ? 'bg-violet-600 text-white'
                      : isStep1Complete
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400'
                  }`}
                >
                  {isStep1Complete && createModalStep !== 1 ? '✓' : '1'}
                </div>
                <div className="min-w-0">
                  <span
                    className={`text-xs font-bold block truncate ${
                      createModalStep === 1
                        ? 'text-violet-700 dark:text-violet-300'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    Cliente e objeto
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                    Quem está contratando
                  </span>
                </div>
              </button>

              {/* Etapa 2 */}
              <button
                type="button"
                onClick={() => setCreateModalStep(2)}
                className={`p-3 rounded-xl transition-all text-left flex items-center gap-3 cursor-pointer ${
                  createModalStep === 2
                    ? 'bg-violet-50/80 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/40 shadow-xs'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] border border-transparent'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    createModalStep === 2
                      ? 'bg-violet-600 text-white'
                      : isStep2Complete
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400'
                  }`}
                >
                  {isStep2Complete && createModalStep !== 2 ? '✓' : '2'}
                </div>
                <div className="min-w-0">
                  <span
                    className={`text-xs font-bold block truncate ${
                      createModalStep === 2
                        ? 'text-violet-700 dark:text-violet-300'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    Itens e serviços
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                    O que está incluído
                  </span>
                </div>
              </button>

              {/* Etapa 3 */}
              <button
                type="button"
                onClick={() => setCreateModalStep(3)}
                className={`p-3 rounded-xl transition-all text-left flex items-center gap-3 cursor-pointer ${
                  createModalStep === 3
                    ? 'bg-violet-50/80 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/40 shadow-xs'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] border border-transparent'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    createModalStep === 3
                      ? 'bg-violet-600 text-white'
                      : isStep3Complete
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400'
                  }`}
                >
                  {isStep3Complete && createModalStep !== 3 ? '✓' : '3'}
                </div>
                <div className="min-w-0">
                  <span
                    className={`text-xs font-bold block truncate ${
                      createModalStep === 3
                        ? 'text-violet-700 dark:text-violet-300'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    Comercial e prazos
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                    Valores e vigência
                  </span>
                </div>
              </button>

              {/* Etapa 4 */}
              <button
                type="button"
                onClick={() => setCreateModalStep(4)}
                className={`p-3 rounded-xl transition-all text-left flex items-center gap-3 cursor-pointer ${
                  createModalStep === 4
                    ? 'bg-violet-50/80 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/40 shadow-xs'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] border border-transparent'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    createModalStep === 4
                      ? 'bg-violet-600 text-white'
                      : isStep4Complete
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400'
                  }`}
                >
                  {isStep4Complete && createModalStep !== 4 ? '✓' : '4'}
                </div>
                <div className="min-w-0">
                  <span
                    className={`text-xs font-bold block truncate ${
                      createModalStep === 4
                        ? 'text-violet-700 dark:text-violet-300'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    Minuta e revisão
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                    Pronto para assinar
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* 4. Grid de 2 Colunas */}
          <form onSubmit={handleSaveContract} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Coluna Esquerda: Conteúdo dos Passos */}
            <div className="lg:col-span-8 space-y-6">
              {createError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* PASSO 1: Cliente e objeto */}
              {createModalStep === 1 && (
                <div className="space-y-6">
                  {/* Card 1: Comece com os dados que você já tem */}
                  <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Comece com os dados que você já tem
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Importe um cliente ou uma proposta aprovada.
                        </p>
                      </div>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowImportDropdown(!showImportDropdown)}
                        className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Importar dados</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showImportDropdown ? 'rotate-180' : ''}`} />
                      </button>

                      {showImportDropdown && (
                        <div className="mt-3 p-4 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200/80 dark:border-white/[0.08] space-y-3 animate-in fade-in">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                De uma Proposta Comercial:
                              </label>
                              <select
                                value={selectedProposalId}
                                onChange={(e) => {
                                  setSelectedProposalId(e.target.value);
                                  if (e.target.value) applyProposalToForm(e.target.value);
                                }}
                                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121824] text-slate-900 dark:text-white"
                              >
                                <option value="">Selecione uma proposta...</option>
                                {proposals.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.to_name || 'Sem cliente'} - {p.subject} (R$ {p.total || 0})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                Da Carteira de Clientes:
                              </label>
                              <select
                                value={formClientId}
                                onChange={(e) => {
                                  if (e.target.value) applyClientToForm(e.target.value);
                                }}
                                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121824] text-slate-900 dark:text-white"
                              >
                                <option value="">Selecione um cliente...</option>
                                {clients.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} {c.document ? `(${c.document})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-white/[0.06]">
                            <span className="text-[11px] text-slate-500">Ou use o preenchimento automático para testes:</span>
                            <button
                              type="button"
                              onClick={loadDemoData}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition cursor-pointer"
                            >
                              Carregar dados de exemplo (Demonstração)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card 2: Identificação do contrato */}
                  <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Identificação do contrato
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Dê um nome claro ao que está sendo contratado.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Número do contrato
                          </label>
                          <span className="text-[11px] text-slate-400">Gerado automaticamente</span>
                        </div>
                        <input
                          type="text"
                          disabled
                          value={formContractNumber}
                          className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-700 dark:text-slate-300"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Título / objeto resumido <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="Ex: Contrato de Prestação de Serviços e Soluções Tecnológicas"
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Quem está contratando? */}
                  <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Quem está contratando?
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Dados da empresa ou da pessoa responsável pelo contrato.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Razão social / nome completo <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formClientName}
                          onChange={(e) => setFormClientName(e.target.value)}
                          placeholder="Empresa Exemplo Ltda."
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            CNPJ ou CPF <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={formClientDocument}
                            onChange={(e) => setFormClientDocument(formatDocumentMask(e.target.value))}
                            placeholder="00.000.000/0001-00"
                            className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            WhatsApp / telefone
                          </label>
                          <input
                            type="text"
                            value={formClientPhone}
                            onChange={(e) => setFormClientPhone(e.target.value)}
                            placeholder="(11) 90000-0000"
                            className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          E-mail do representante / financeiro
                        </label>
                        <input
                          type="email"
                          value={formClientEmail}
                          onChange={(e) => setFormClientEmail(e.target.value)}
                          placeholder="financeiro@example.com"
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Endereço completo
                        </label>
                        <input
                          type="text"
                          value={formClientAddress}
                          onChange={(e) => setFormClientAddress(e.target.value)}
                          placeholder="Rua Exemplo, 100, Centro, São Paulo — SP"
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        />
                      </div>

                      {/* Aviso do CNPJ ou CPF na assinatura */}
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>O CNPJ ou CPF será usado na verificação da assinatura.</span>
                      </div>

                      {/* Linha Representante Legal Opcional */}
                      <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400">Representante legal</span>
                        <button
                          type="button"
                          onClick={() => setShowLegalRepFields(!showLegalRepFields)}
                          className="text-violet-600 dark:text-violet-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Opcional</span>
                          <span className="text-sm font-bold">{showLegalRepFields ? '−' : '+'}</span>
                        </button>
                      </div>

                      {showLegalRepFields && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-in fade-in">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                              Nome do Representante Legal
                            </label>
                            <input
                              type="text"
                              value={formLegalRepName}
                              onChange={(e) => setFormLegalRepName(e.target.value)}
                              placeholder="Ex: João da Silva"
                              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                              CPF do Representante Legal
                            </label>
                            <input
                              type="text"
                              value={formLegalRepCpf}
                              onChange={(e) => setFormLegalRepCpf(formatDocumentMask(e.target.value))}
                              placeholder="000.000.000-00"
                              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PASSO 2: Itens e serviços */}
              {createModalStep === 2 && (
                <div className="space-y-6">
                  <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-5 space-y-5">
                    {/* Header com os 3 botões solicitados */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              Itens e serviços
                            </h3>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300">
                              {formItems.length} {formItems.length === 1 ? 'item' : 'itens'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Defina os produtos, planos e serviços deste contrato.
                          </p>
                        </div>
                      </div>

                      {/* Botões de Ação: Item do CRM, Buscar por Proposta, Novo Item Avulso */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 1. Botão com lista pesquisável dos itens que existem no CRM */}
                        <div className="relative" ref={crmDropdownRef}>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCrmItemDropdown((prev) => !prev);
                              setShowProposalDropdown(false);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/80 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-semibold transition cursor-pointer shadow-2xs"
                          >
                            <Package className="w-3.5 h-3.5" />
                            <span>Itens do CRM ({catalogItems.length})</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-violet-500 transition-transform ${showCrmItemDropdown ? 'rotate-180' : ''}`} />
                          </button>

                          {showCrmItemDropdown && (
                            <div className="absolute right-0 sm:left-0 sm:right-auto mt-1.5 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/10 shadow-2xl z-30 overflow-hidden animate-in fade-in">
                                <div className="p-3 border-b border-slate-100 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
                                  <div className="relative">
                                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                      type="text"
                                      autoFocus
                                      value={crmItemSearch}
                                      onChange={(e) => setCrmItemSearch(e.target.value)}
                                      placeholder="Escreva para buscar item do CRM..."
                                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                    />
                                  </div>
                                </div>

                                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04]">
                                  {filteredDropdownCrmItems.length > 0 ? (
                                    filteredDropdownCrmItems.map((cat) => (
                                      <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => handleSelectCrmItem(cat)}
                                        className="w-full text-left px-3.5 py-2.5 hover:bg-violet-50/70 dark:hover:bg-violet-950/30 transition flex items-start justify-between gap-2 cursor-pointer group"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-violet-600 dark:group-hover:text-violet-400 truncate">
                                            {cat.name}
                                          </p>
                                          <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 dark:bg-white/10 text-slate-500">
                                              {cat.group_name || cat.category || 'Geral'}
                                            </span>
                                            <span className="text-[10px] text-slate-400">
                                              {cat.type === 'service' ? 'Serviço' : 'Produto'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                                            {formatCurrency(cat.price)}
                                          </span>
                                          <span className="text-[10px] text-slate-400 block">
                                            / {cat.unit || 'un'}
                                          </span>
                                        </div>
                                      </button>
                                    ))
                                  ) : (
                                    <div className="p-4 text-center text-xs text-slate-500">
                                      Nenhum item encontrado no CRM.
                                    </div>
                                  )}
                                </div>
                              </div>
                          )}
                        </div>

                        {/* 2. Botão com opção ao lado de procurar por proposta com busca por escrita */}
                        <div className="relative" ref={proposalDropdownRef}>
                          <button
                            type="button"
                            onClick={() => {
                              setShowProposalDropdown((prev) => !prev);
                              setShowCrmItemDropdown(false);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/80 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition cursor-pointer shadow-2xs"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Procurar por proposta</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-indigo-500 transition-transform ${showProposalDropdown ? 'rotate-180' : ''}`} />
                          </button>

                          {showProposalDropdown && (
                            <div className="absolute right-0 sm:left-0 sm:right-auto mt-1.5 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#121824] border border-slate-200 dark:border-white/10 shadow-2xl z-30 overflow-hidden animate-in fade-in">
                                <div className="p-3 border-b border-slate-100 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
                                  <div className="relative">
                                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                      type="text"
                                      autoFocus
                                      value={proposalSearch}
                                      onChange={(e) => setProposalSearch(e.target.value)}
                                      placeholder="Escreva para buscar proposta..."
                                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                    />
                                  </div>
                                </div>

                                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.04]">
                                  {loadingProposalItems ? (
                                    <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      <span>Carregando itens da proposta...</span>
                                    </div>
                                  ) : filteredDropdownProposals.length > 0 ? (
                                    filteredDropdownProposals.map((prop) => (
                                      <button
                                        key={prop.id}
                                        type="button"
                                        onClick={() => handleImportItemsFromProposal(prop.id)}
                                        className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/30 transition flex items-start justify-between gap-2 cursor-pointer group"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                                            {prop.subject || prop.to_name || 'Proposta Comercial'}
                                          </p>
                                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                            {prop.to_name ? `Cliente: ${prop.to_name}` : ''}
                                          </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
                                            {formatCurrency(prop.total || 0)}
                                          </span>
                                          <span className="text-[10px] text-slate-400">
                                            Importar itens
                                          </span>
                                        </div>
                                      </button>
                                    ))
                                  ) : (
                                    <div className="p-4 text-center text-xs text-slate-500">
                                      Nenhuma proposta encontrada.
                                    </div>
                                  )}
                                </div>
                              </div>
                          )}
                        </div>

                        {/* 3. Botão Novo Item Avulso */}
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Novo Item Avulso</span>
                        </button>
                      </div>
                    </div>

                    {/* Exibição dos Itens: Empty State ou Lista de Itens */}
                    {formItems.length === 0 ? (
                      <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center mx-auto">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div className="max-w-md mx-auto">
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Nenhum item adicionado ao contrato
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            Adicione itens cadastrados no CRM, importe os itens de uma proposta comercial ou crie um novo item avulso.
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCrmItemDropdown(true);
                              setShowProposalDropdown(false);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition cursor-pointer shadow-2xs"
                          >
                            <Package className="w-3.5 h-3.5" />
                            <span>Itens do CRM</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setShowProposalDropdown(true);
                              setShowCrmItemDropdown(false);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer shadow-2xs"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Procurar por proposta</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleAddItem}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Novo Item Avulso</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {formItems.map((item, idx) => {
                          const subtotal = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                          return (
                            <div
                              key={idx}
                              className="p-4 rounded-xl border border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-3.5 transition hover:border-slate-300 dark:hover:border-white/20"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                                    ITEM {String(idx + 1).padStart(2, '0')}
                                  </span>
                                  {item.unit && (
                                    <span className="text-[10px] font-medium text-slate-400">
                                      ({item.unit})
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="text-slate-400 hover:text-rose-500 p-1 rounded transition cursor-pointer"
                                  title="Remover item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                  Nome do item / serviço <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={item.name}
                                  onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                                  placeholder="Ex: Licença Corporativa Mensal"
                                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                  Descrição
                                </label>
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => handleUpdateItem(idx, 'description', e.target.value)}
                                  placeholder="Ex: Acesso à plataforma e suporte técnico especializado"
                                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Quantidade <span className="text-rose-500">*</span>
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.qty}
                                    onChange={(e) => handleUpdateItem(idx, 'qty', Number(e.target.value) || 1)}
                                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Unidade de medida
                                  </label>
                                  <input
                                    type="text"
                                    value={item.unit || 'un'}
                                    onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value)}
                                    placeholder="un, mês, licença, hora"
                                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Valor unitário (R$)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.rate}
                                    onChange={(e) => handleUpdateItem(idx, 'rate', Number(e.target.value) || 0)}
                                    placeholder="0,00"
                                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                  Classificação de cobrança
                                </label>
                                <select
                                  value={item.billingType || 'recurring'}
                                  onChange={(e) =>
                                    handleUpdateItem(idx, 'billingType', e.target.value as ContractItemBillingType)
                                  }
                                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                                >
                                  <option value="recurring">Recorrente (Cobrado no ciclo principal)</option>
                                  <option value="setup">Implantação / Setup (Cobrado uma única vez na ativação)</option>
                                  <option value="one_time">Pagamento Único / Avulso (Sem recorrência)</option>
                                </select>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-white/[0.06] text-xs">
                                <span className="text-slate-500">Subtotal do item</span>
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {formatCurrency(subtotal)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Totalizador dos Itens e Ação Rápida */}
                    <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Itens recorrentes no ciclo</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatCurrency(recurringItemsAmount)}
                        </span>
                      </div>
                      {setupItemsAmount > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Itens de implantação / pagamento único</span>
                          <span className="font-bold text-amber-600 dark:text-amber-400">
                            {formatCurrency(setupItemsAmount)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-white/[0.04]">
                        <span className="text-slate-600 dark:text-slate-400 font-semibold">Total geral dos itens</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {formatCurrency(totalItemsAmount)}
                        </span>
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={handleApplyItemsTotalToRecurring}
                          className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <span>Usar total recorrente na cobrança ({formatCurrency(recurringItemsAmount)})</span>
                          <span>↗</span>
                        </button>
                      </div>
                    </div>

                    {/* Aviso Informativo */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                      <Info className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                      <span>
                        Itens classificados como Implantação/Setup ou Pagamento Único não são multiplicados pela recorrência e compõem a cobrança inicial única.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* PASSO 3: Comercial e prazos */}
              {createModalStep === 3 && (
                <div className="space-y-6">
                  {/* Card 1: Condições comerciais */}
                  <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-5 space-y-5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Condições comerciais
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Configure a periodicidade, valores dos itens contratados e cobranças adicionais.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Box Resumo do Valor Base dos Itens */}
                      <div className="p-4 rounded-xl bg-violet-50/50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white block">
                            Valor base recorrente dos itens contratados
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Soma dos itens recorrentes na Etapa 2
                            {setupItemsAmount > 0 ? ` (+ ${formatCurrency(setupItemsAmount)} em itens únicos/setup)` : ''}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black text-violet-700 dark:text-violet-300 block">
                            {formatCurrency(itemsRecurringBase)}
                          </span>
                          <span className="text-[10px] text-violet-500 font-medium">
                            {formBillingCycle === 'Pagamento único' ? 'Valor único dos itens' : `/ ${formBillingCycle.toLowerCase()}`}
                          </span>
                        </div>
                      </div>

                      {/* Periodicidade da proposta / Ciclo de faturamento */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Periodicidade da proposta / Ciclo de cobrança <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={formBillingCycle}
                          onChange={(e) => setFormBillingCycle(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition cursor-pointer"
                        >
                          <option value="Mensal">Mensal (Faturamento recorrente todo mês)</option>
                          <option value="Anual">Anual (Faturamento cobrado anualmente)</option>
                          <option value="Trimestral">Trimestral (Faturamento a cada 3 meses)</option>
                          <option value="Semestral">Semestral (Faturamento a cada 6 meses)</option>
                          <option value="Semanal">Semanal (Faturamento semanal)</option>
                          <option value="Pagamento único">Pagamento único (Cobrança avulsa / pontual, sem recorrência)</option>
                        </select>
                        <p className="text-[11px] text-slate-400">
                          {formBillingCycle === 'Pagamento único'
                            ? 'O valor total será faturado de forma única, sem renovação automática periódica.'
                            : `Cobrança recorrente faturada com periodicidade ${formBillingCycle.toLowerCase()}.`}
                        </p>
                      </div>

                      {/* Implantação / Setup */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Implantação / setup adicional (R$)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formSetupFee}
                          onChange={(e) => setFormSetupFee(Number(e.target.value) || 0)}
                          placeholder="0,00"
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        />
                        <p className="text-[11px] text-slate-400">
                          {setupItemsAmount > 0
                            ? `Os itens de setup da Etapa 2 já somam ${formatCurrency(setupItemsAmount)}. Informe aqui apenas se houver taxa extra de implantação não listada nos itens.`
                            : 'Custo de instalação, programação inicial, configuração de rede ou deslocamento técnico ao local.'}
                        </p>
                      </div>

                      {/* Seção Cobrança Adicional? (Sim / Não) */}
                      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                              Possui cobrança adicional no contrato?
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Adicione taxas extras, franquias de consumo ou suporte diferenciado
                            </span>
                          </div>

                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.05] p-1 rounded-xl self-start sm:self-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setFormHasAdditionalFee(false);
                                setFormAdditionalFee(0);
                                setFormAdditionalFeeDescription('');
                              }}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                !formHasAdditionalFee
                                  ? 'bg-white dark:bg-[#121824] text-slate-900 dark:text-white shadow-2xs'
                                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                              }`}
                            >
                              Não
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormHasAdditionalFee(true)}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                formHasAdditionalFee
                                  ? 'bg-violet-600 text-white shadow-2xs'
                                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                              }`}
                            >
                              Sim
                            </button>
                          </div>
                        </div>

                        {formHasAdditionalFee && (
                          <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.08] space-y-3.5 animate-in fade-in">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                  Valor adicional (R$) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={formAdditionalFee}
                                  onChange={(e) => setFormAdditionalFee(Number(e.target.value) || 0)}
                                  placeholder="0,00"
                                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                  Tipo de pagamento do adicional <span className="text-rose-500">*</span>
                                </label>
                                <div className="grid grid-cols-3 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setFormAdditionalFeeType('monthly')}
                                    className={`py-2 px-2 rounded-xl border text-[11px] font-semibold transition cursor-pointer text-center ${
                                      formAdditionalFeeType === 'monthly'
                                        ? 'bg-violet-600 text-white border-violet-600 shadow-2xs'
                                        : 'bg-white dark:bg-[#0b0f17] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    Mensal
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFormAdditionalFeeType('per_cycle')}
                                    className={`py-2 px-2 rounded-xl border text-[11px] font-semibold transition cursor-pointer text-center ${
                                      formAdditionalFeeType === 'per_cycle'
                                        ? 'bg-violet-600 text-white border-violet-600 shadow-2xs'
                                        : 'bg-white dark:bg-[#0b0f17] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    Por Ciclo
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFormAdditionalFeeType('one_time')}
                                    className={`py-2 px-2 rounded-xl border text-[11px] font-semibold transition cursor-pointer text-center ${
                                      formAdditionalFeeType === 'one_time'
                                        ? 'bg-violet-600 text-white border-violet-600 shadow-2xs'
                                        : 'bg-white dark:bg-[#0b0f17] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    Único
                                  </button>
                                </div>
                              </div>
                            </div>

                            {formAdditionalFeeType === 'monthly' &&
                              formBillingCycle !== 'Mensal' &&
                              formBillingCycle !== 'Pagamento único' && (
                                <div className="p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300">
                                  Este adicional é cobrado <b>mensalmente</b> (+{formatCurrency(additionalMonthlyFee)}/mês × {calculatedMonthsDuration || 12} meses na vigência), separado do ciclo principal ({formBillingCycle.toLowerCase()}).
                                </div>
                              )}

                            <div>
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Descrição da cobrança adicional <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={formAdditionalFeeDescription}
                                onChange={(e) => setFormAdditionalFeeDescription(e.target.value)}
                                placeholder="Ex: Taxa extra de suporte VIP 24x7 ou franquia excedente de dados"
                                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Prazo de vigência */}
                  <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Prazo de vigência
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Escolha as datas de vigência ou defina como prazo indeterminado.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Checkbox Opção Sem Prazo */}
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between">
                        <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={formIsIndefiniteTerm}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setFormIsIndefiniteTerm(val);
                              if (val) {
                                setFormEndDate('');
                              } else {
                                setVigenciaMonths(12);
                              }
                            }}
                            className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 border-slate-300"
                          />
                          <span>Contrato por prazo indeterminado (Sem data final)</span>
                        </label>
                        {formIsIndefiniteTerm && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200">
                            Sem prazo
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Início da vigência <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="date"
                            required
                            value={formStartDate}
                            onChange={(e) => setFormStartDate(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Fim da vigência {!formIsIndefiniteTerm && <span className="text-rose-500">*</span>}
                          </label>
                          {formIsIndefiniteTerm ? (
                            <div className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-dashed border-violet-200 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-300 font-semibold flex items-center justify-between">
                              <span>Sem prazo determinado</span>
                              <span className="text-[10px] bg-white dark:bg-white/10 px-2 py-0.5 rounded">Indeterminado</span>
                            </div>
                          ) : (
                            <input
                              type="date"
                              required={!formIsIndefiniteTerm}
                              value={formEndDate}
                              onChange={(e) => setFormEndDate(e.target.value)}
                              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-white"
                            />
                          )}
                        </div>
                      </div>

                      {/* Atalhos de vigência: 12 meses, 24 meses, 36 meses, Sem prazo */}
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        {[12, 24, 36].map((m) => {
                          const isSelected = !formIsIndefiniteTerm && calculatedMonthsDuration === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setFormIsIndefiniteTerm(false);
                                setVigenciaMonths(m);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                isSelected
                                  ? 'bg-violet-600 text-white shadow-xs'
                                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {m} meses
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            setFormIsIndefiniteTerm(true);
                            setFormEndDate('');
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            formIsIndefiniteTerm
                              ? 'bg-violet-600 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          Sem prazo (Indeterminado)
                        </button>
                      </div>

                      {/* Box de Total Estimado na Vigência (F31) */}
                      <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                              Total estimado na vigência
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {formIsIndefiniteTerm
                                ? 'Cobrança contínua (sem prazo final estipulado)'
                                : formBillingCycle === 'Pagamento único'
                                ? 'Pagamento único total à vista'
                                : `${billingCycleDetails.cyclesCount} ${
                                    billingCycleDetails.cyclesCount === 1 ? 'ciclo iniciado' : 'ciclos iniciados'
                                  } (${calculatedMonthsDuration || 12} meses) + implantação e adicionais`}
                            </span>
                          </div>
                          <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(calculatedTotalVigencia)}
                          </div>
                        </div>
                        {!formIsIndefiniteTerm &&
                          formBillingCycle !== 'Pagamento único' &&
                          billingCycleDetails.hasPartialCycle && (
                            <div className="pt-1.5 border-t border-emerald-200/70 dark:border-emerald-800/40 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                A vigência de {calculatedMonthsDuration} meses não é múltipla exata do ciclo {formBillingCycle.toLowerCase()}: inclui período parcial de {billingCycleDetails.remainderMonths} {billingCycleDetails.remainderMonths === 1 ? 'mês' : 'meses'} contabilizado como ciclo iniciado ({billingCycleDetails.cyclesCount} ciclos no total).
                              </span>
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PASSO 4: Minuta e revisão */}
              {createModalStep === 4 && (
                <div className="space-y-6">
                  {/* Card 1: Minuta do contrato */}
                  <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <FileEdit className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Minuta do contrato
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Ajuste o texto e confira o documento antes de concluir.
                        </p>
                      </div>
                    </div>

                    {/* Segmented Control */}
                    <div className="p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/[0.08] grid grid-cols-2 gap-1 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setClauseEditorMode('full_text')}
                        className={`py-2 rounded-lg transition cursor-pointer text-center ${
                          clauseEditorMode === 'full_text'
                            ? 'bg-white dark:bg-[#121824] text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Texto contínuo
                      </button>
                      <button
                        type="button"
                        onClick={() => setClauseEditorMode('modular')}
                        className={`py-2 rounded-lg transition cursor-pointer text-center ${
                          clauseEditorMode === 'modular'
                            ? 'bg-white dark:bg-[#121824] text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Cláusulas modulares
                      </button>
                    </div>

                    {clauseEditorMode === 'full_text' ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Texto da minuta
                          </label>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500">
                            Conteúdo ilustrativo
                          </span>
                        </div>

                        <textarea
                          value={formContractFullText}
                          onChange={(e) => setFormContractFullText(e.target.value)}
                          rows={10}
                          className="w-full px-3.5 py-3 text-xs font-mono rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-800 dark:text-slate-200 resize-y leading-relaxed"
                        />

                        {/* Upload de Imagem ou Diagrama */}
                        <div className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-slate-200 dark:border-white/10 text-xs flex-wrap">
                          <Paperclip className="w-4 h-4 text-slate-400" />
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Anexar imagem ou diagrama
                          </span>
                          <span className="text-[10px] text-slate-400">Opcional</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 dark:file:bg-violet-950 dark:file:text-violet-300 cursor-pointer"
                          />
                          <span className="text-[10px] text-slate-400 ml-auto hidden sm:inline">
                            Apenas seleção local nesta prévia.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setContractCategoryFilter('all')}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                                contractCategoryFilter === 'all'
                                  ? 'bg-violet-600 text-white'
                                  : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              Todas
                            </button>
                            {CLAUSE_CATEGORIES.map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setContractCategoryFilter(cat.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                                  contractCategoryFilter === cat.id
                                    ? 'bg-violet-600 text-white'
                                    : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {cat.icon} {cat.label}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => addCustomClauseToContract()}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Cláusula Customizada</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[240px] overflow-y-auto pr-1">
                          {libraryClauses
                            .filter((c) => contractCategoryFilter === 'all' || c.category === contractCategoryFilter)
                            .map((cl) => {
                              const isIncluded = formClauses.some((fc) => fc.id === cl.id || fc.title === cl.title);
                              return (
                                <label
                                  key={cl.id}
                                  className={`p-3 rounded-xl border text-xs cursor-pointer block transition ${
                                    isIncluded
                                      ? 'bg-violet-50/60 dark:bg-violet-950/20 border-violet-400 dark:border-violet-600'
                                      : 'bg-white dark:bg-[#0b0f17] border-slate-200 dark:border-white/10'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={isIncluded}
                                      onChange={() => toggleStandardClauseInContract(cl)}
                                      className="mt-0.5 rounded text-violet-600"
                                    />
                                    <div>
                                      <span className="font-bold block text-slate-900 dark:text-white">
                                        {cl.title}
                                      </span>
                                      <span className="text-slate-500 line-clamp-2 mt-0.5">
                                        {cl.text}
                                      </span>
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                        </div>

                        {/* Lista Ordenável e Editável das Cláusulas Ativas no Contrato (F27) */}
                        <div className="pt-3 border-t border-slate-200/80 dark:border-white/[0.08] space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              Cláusulas ativas neste contrato ({formClauses.length})
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Edite ou reordene livremente
                            </span>
                          </div>

                          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                            {formClauses.map((fc, idx) => (
                              <div
                                key={fc.id || idx}
                                className="p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-[#0b0f17] space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300">
                                      #{idx + 1}
                                    </span>
                                    <input
                                      type="text"
                                      value={fc.title}
                                      onChange={(e) => updateContractClause(idx, 'title', e.target.value)}
                                      className="flex-1 px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121824] text-slate-900 dark:text-white"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => moveContractClause(idx, 'up')}
                                      disabled={idx === 0}
                                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-25 cursor-pointer"
                                      title="Mover cláusula para cima"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveContractClause(idx, 'down')}
                                      disabled={idx === formClauses.length - 1}
                                      className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-25 cursor-pointer"
                                      title="Mover cláusula para baixo"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeContractClause(idx)}
                                      className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                                      title="Remover cláusula do contrato"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <textarea
                                  rows={3}
                                  value={fc.text}
                                  onChange={(e) => updateContractClause(idx, 'text', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121824] text-slate-800 dark:text-slate-200 resize-y"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Última conferência */}
                  <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Última conferência
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Confirme os dados que compõem o seu contrato.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs divide-y divide-slate-100 dark:divide-white/[0.06]">
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-500">Contratante</span>
                        <span className="font-bold text-slate-900 dark:text-white">{formClientName || 'Empresa Exemplo Ltda.'}</span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-500">Recorrência</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formBillingCycle === 'Pagamento único'
                            ? 'Pagamento único'
                            : `${formatCurrency(effectiveRecurringValue)} / ${formBillingCycle.toLowerCase()}${
                                additionalMonthlyFee > 0 && formBillingCycle !== 'Mensal'
                                  ? ` (+ ${formatCurrency(additionalMonthlyFee)} / mês)`
                                  : ''
                              }`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-500">Vigência</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formIsIndefiniteTerm
                            ? `${formatCivilDate(formStartDate)} (Sem prazo determinado)`
                            : `${formatCivilDate(formStartDate)} a ${formatCivilDate(formEndDate)}`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-500">Itens</span>
                        <span className="font-bold text-slate-900 dark:text-white">{formItems.length}</span>
                      </div>
                    </div>

                    {/* Pré-visualizar Documento (F27: sincronizado com modo ativo) */}
                    <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setShowFullDocPreview(!showFullDocPreview)}
                        className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Pré-visualizar documento ({clauseEditorMode === 'modular' ? 'Cláusulas Modulares' : 'Texto Contínuo'})</span>
                        <span>{showFullDocPreview ? '−' : '+'}</span>
                      </button>

                      {showFullDocPreview && (
                        <div className="mt-2 p-4 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line font-mono max-h-60 overflow-y-auto">
                          {effectivePreviewMinutaText}
                        </div>
                      )}
                    </div>

                    {/* Checkbox de Revisão */}
                    <label className="flex items-start gap-2.5 pt-2 border-t border-slate-100 dark:border-white/[0.06] cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={reviewedMinutaCheckbox}
                        onChange={(e) => setReviewedMinutaCheckbox(e.target.checked)}
                        className="mt-0.5 rounded text-violet-600 focus:ring-violet-500"
                      />
                      <span>Revisei os dados, os valores e o conteúdo da minuta.</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Rodapé de Navegação */}
              <div className="pt-4 border-t border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  {createModalStep === 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        resetContractFormState();
                        setPageView('list');
                      }}
                      className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] rounded-xl transition cursor-pointer"
                    >
                      ← Cancelar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreateModalStep((prev) => (Math.max(1, prev - 1) as any))}
                      className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] rounded-xl transition cursor-pointer"
                    >
                      ← Voltar
                    </button>
                  )}
                </div>

                <span className="text-xs text-slate-400 font-medium">
                  Etapa {createModalStep} de 4
                </span>

                <div>
                  {createModalStep === 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!formClientName.trim() || !formClientDocument.trim()) {
                          setCreateError('Preencha a Razão Social/Nome e o CNPJ/CPF do contratante para avançar.');
                          return;
                        }
                        setCreateError('');
                        setCreateModalStep(2);
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-xl shadow-md shadow-violet-600/25 transition cursor-pointer"
                    >
                      <span>Continuar</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {createModalStep === 2 && (
                    <button
                      type="button"
                      onClick={() => setCreateModalStep(3)}
                      className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-xl shadow-md shadow-violet-600/25 transition cursor-pointer"
                    >
                      <span>Continuar</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {createModalStep === 3 && (
                    <button
                      type="button"
                      onClick={() => setCreateModalStep(4)}
                      className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-xl shadow-md shadow-violet-600/25 transition cursor-pointer"
                    >
                      <span>Continuar</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {createModalStep === 4 && (
                    <button
                      type="submit"
                      disabled={savingContract}
                      className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-xl shadow-md shadow-violet-600/25 transition disabled:opacity-50 cursor-pointer"
                    >
                      {savingContract ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Gerando Contrato...</span>
                        </>
                      ) : (
                        <>
                          <span>Gerar contrato</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>


            </div>

            {/* Coluna Direita: Card Sticky de Resumo ("Seu contrato") */}
            <div className="lg:col-span-4 sticky top-6 space-y-4">
              <div className="rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-xs p-5 space-y-4">
                {/* Header: Ícone + Seu contrato + Número + Status dot */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block">
                        Seu contrato
                      </span>
                      <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        {formContractNumber || 'CTR-2026-607126'}
                      </span>
                    </div>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Em elaboração" />
                </div>

                {/* CONTRATANTE */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    CONTRATANTE
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug truncate">
                    {formClientName || 'Empresa Exemplo Ltda.'}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono">
                    {formClientDocument || '00.000.000/0001-00'}
                  </p>
                </div>

                {/* Valores e Vigência */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{formBillingCycle === 'Pagamento único' ? 'Valor do contrato' : 'Valor recorrente'}</span>
                      <span>
                        {formBillingCycle === 'Pagamento único'
                          ? 'pagamento único'
                          : `/ ${formBillingCycle.toLowerCase() === 'mensal' ? 'mês' : formBillingCycle.toLowerCase()}`}
                      </span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
                      {formatCurrency(formBillingCycle === 'Pagamento único' ? (itemsRecurringBase + additionalOneTime) : effectiveRecurringValue)}
                    </div>
                    {additionalMonthlyFee > 0 &&
                      formBillingCycle !== 'Mensal' &&
                      formBillingCycle !== 'Pagamento único' && (
                        <div className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 mt-0.5">
                          + {formatCurrency(additionalMonthlyFee)} / mês (adicional mensal)
                        </div>
                      )}
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Implantação / setup</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(effectiveSetupFee)}
                      </span>
                    </div>
                    {formHasAdditionalFee && (
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span className="truncate max-w-[150px]" title={formAdditionalFeeDescription || 'Adicional'}>
                          Adicional ({formAdditionalFeeType === 'monthly' ? 'mensal' : formAdditionalFeeType === 'per_cycle' ? 'por ciclo' : 'único'})
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          +{formatCurrency(Number(formAdditionalFee) || 0)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Vigência</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formIsIndefiniteTerm ? 'Sem prazo (Indeterminado)' : `${calculatedMonthsDuration} meses`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Itens incluídos</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formItems.length} {formItems.length === 1 ? 'item' : 'itens'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bloco Total estimado na vigência */}
                <div className="p-3.5 rounded-xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 space-y-1">
                  <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 block">
                    Total estimado na vigência
                  </span>
                  <div className="text-xl font-black text-violet-700 dark:text-violet-300">
                    {formatCurrency(calculatedTotalVigencia)}
                  </div>
                  <span className="text-[10px] text-violet-500/80 dark:text-violet-400/80 block">
                    {formIsIndefiniteTerm
                      ? 'Recorrência do ciclo + implantação inicial'
                      : formBillingCycle === 'Pagamento único'
                      ? 'Valor total único (Itens + Implantação)'
                      : `${billingCycleDetails.cyclesCount} ${
                          billingCycleDetails.cyclesCount === 1 ? 'ciclo iniciado' : 'ciclos iniciados'
                        } + Implantação`}
                  </span>
                </div>

                {/* Checklist de Progresso */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    {isStep1Complete ? (
                      <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    )}
                    <span className={isStep1Complete ? 'font-medium text-slate-900 dark:text-white' : ''}>
                      Dados do cliente
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    {isStep2Complete ? (
                      <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    )}
                    <span className={isStep2Complete ? 'font-medium text-slate-900 dark:text-white' : ''}>
                      Itens do contrato
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    {isStep3Complete ? (
                      <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    )}
                    <span className={isStep3Complete ? 'font-medium text-slate-900 dark:text-white' : ''}>
                      Condições comerciais
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    {isStep4Complete ? (
                      <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    )}
                    <span className={isStep4Complete ? 'font-medium text-slate-900 dark:text-white' : ''}>
                      Revisão da minuta
                    </span>
                  </div>
                </div>

                {/* Card Seguro de Assinatura */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] flex items-start gap-2.5 text-xs text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="leading-tight">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                      Assinatura digital
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Revise os dados antes de gerar o link.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <>
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
                      {c.start_date ? formatCivilDate(c.start_date) : '-'}
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      até {c.end_date ? formatCivilDate(c.end_date) : 'Indeterminado'}
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
                      {c.start_date ? formatCivilDate(c.start_date) : '-'}
                      {c.end_date && ` até ${formatCivilDate(c.end_date)}`}
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
        </>
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
              const dossier = parseAuditDossier(
                activeAuditContract.notes,
                (activeAuditContract as any).legal_audit_trail
              );
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
                  Vigência: {activeAuditContract.start_date ? formatCivilDate(activeAuditContract.start_date) : '-'} a{' '}
                  {activeAuditContract.end_date ? formatCivilDate(activeAuditContract.end_date) : 'Indeterminado'}
                </p>
              </div>
            </div>

            {/* Cláusulas Acordadas neste Contrato */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-slate-200/80 dark:border-white/[0.05] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-violet-600" />
                  Cláusulas e Termos Deste Contrato (
                  {
                    parseContractClauses(
                      activeAuditContract.clauses_json,
                      activeAuditContract.id,
                      activeAuditContract.content
                    ).length
                  }
                  )
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {parseContractItems(activeAuditContract.items_json).length} itens/serviços
                </span>
              </div>

              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {parseContractClauses(
                  activeAuditContract.clauses_json,
                  activeAuditContract.id,
                  activeAuditContract.content
                ).map((cl, idx) => {
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
                  {filteredLibraryClauses.map((cl, index) => {
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
                                  onClick={() => handleMoveLibraryClause(cl.id, 'up')}
                                  disabled={index === 0}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 cursor-pointer"
                                  title="Mover para cima"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveLibraryClause(cl.id, 'down')}
                                  disabled={index === filteredLibraryClauses.length - 1}
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

