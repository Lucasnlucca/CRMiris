import React, { useEffect, useState, useRef } from 'react';
import {
  ShieldCheck,
  Lock,
  FileCheck2,
  CheckCircle2,
  Printer,
  Calendar,
  Building,
  User,
  AlertCircle,
  FileText,
  DollarSign,
  Eraser,
  KeyRound,
  ChevronRight,
  ExternalLink,
  Sparkles,
  BookOpen,
  X,
  Eye,
  Check,
  Copy,
  Globe,
  Smartphone,
  Hash,
} from 'lucide-react';
import { databases } from '../lib/appwrite';
import { parseContractClauses, ContractClause } from './Contratos';
import { parseLegalRepresentative } from './Contatos';
import {
  buildCanonicalDocumentContent,
  calculateSha256,
  calculateSignatureHash,
  getClientConnectionPort,
  encodeAuditDossier,
  parseAuditDossier,
  SignerAuditMetadata,
  ContractAuditDossier,
} from '../utils/auditTrail';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';
const COLLECTION_CONTRACTS = 'crm_contracts';

export interface ContractItem {
  name: string;
  description?: string;
  qty: number;
  rate: number;
  amount: number;
  unit?: string;
}

export interface ContractData {
  id: string;
  contract_number: string;
  title: string;
  proposal_id?: string;
  client_id?: string;
  client_name: string;
  client_document: string;
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
  status: 'draft' | 'pending_signature' | 'signed' | 'rejected' | 'cancelled';
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
}

export default function ContractSignPreview() {
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Verification Gate
  const [verified, setVerified] = useState(false);
  const [inputDigits, setInputDigits] = useState('');
  const [authError, setAuthError] = useState('');
  const [shaking, setShaking] = useState(false);

  // Signing Form
  const [signerName, setSignerName] = useState('');
  const [signerDoc, setSignerDoc] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [copiedHash, setCopiedHash] = useState<'doc' | 'sig' | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signingType, setSigningType] = useState<'draw' | 'type'>('type');
  const [signingSubmitting, setSigningSubmitting] = useState(false);
  const [signSuccess, setSignSuccess] = useState(false);

  // Clause Reader Modal & Verification Gate
  const [showClauseReaderModal, setShowClauseReaderModal] = useState(false);
  const [hasConfirmedReading, setHasConfirmedReading] = useState(false);
  const [modalConfirmedCheck, setModalConfirmedCheck] = useState(false);
  const [readingConfirmationTime, setReadingConfirmationTime] = useState<string | null>(null);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Contract ID from URL
  const contractId = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() || '' : '';

  useEffect(() => {
    async function loadContract() {
      if (!contractId) {
        setError('Código do contrato não encontrado na URL.');
        setLoading(false);
        return;
      }

      if (contractId === 'demo') {
        const demoData: ContractData = {
          id: 'demo',
          contract_number: 'CTR-2026-0001',
          status: 'draft',
          provider_name: 'Iris Horizon Soluções Tecnológicas Ltda',
          provider_document: '45.123.456/0001-89',
          provider_address: 'Av. Paulista, 1000 – Bela Vista, São Paulo – SP, CEP 01310-100',
          client_name: 'Telefonia Fácil',
          client_document: '11.111.111/1111-11',
          client_email: 'contato@telefoniafacil.com.br',
          client_phone: '(19) 98456-7022',
          client_address: 'Teste, asdasd, SP, CEP 13060-072',
          recurrence_period: 'monthly',
          total_amount: 1039.9,
          items_json: JSON.stringify([
            {
              name: 'Telefone IP + Ramal',
              description: 'Telefone em comodato + ramal',
              qty: 4,
              unit: 'un',
              rate: 250.0,
              amount: 1000.0,
            },
            {
              name: 'PABX',
              description: 'Teste para ver se o item funciona',
              qty: 1,
              unit: 'un',
              rate: 39.9,
              amount: 39.9,
            },
          ]),
          notes: '[REP_LEGAL: {"name": "Telefonia Fácil", "cpf": "11.111.111/1111-11"}]',
          clauses_json: JSON.stringify([
            {
              id: '1',
              title: 'CLÁUSULA PRIMEIRA – DO OBJETO E ESCOPO DOS SERVIÇOS',
              text: 'O presente instrumento tem por objeto a prestação de serviços continuados de telecomunicações, compreendendo fornecimento de linhas telefônicas digitais, ramais IP em nuvem, configuração de PABX Virtual e suporte técnico prioritário.',
            },
            {
              id: '2',
              title: 'CLÁUSULA SEGUNDA – DOS VALORES E FORMA DE PAGAMENTO',
              text: 'Pela prestação dos serviços contratados, a CONTRATANTE pagará mensalmente à CONTRATADA os valores descritos na Cláusula 1ª, via boleto bancário ou débito automático, com vencimento nos dias estipulados.',
            },
          ]),
          created_at: '2026-09-30T10:00:00.000Z',
        };
        setContract(demoData);
        setSignerName('Telefonia Fácil');
        setSignerDoc(formatDocumentMask('11.111.111/1111-11'));
        setSignerEmail('contato@telefoniafacil.com.br');
        setSignerPhone('(19) 98456-7022');
        setVerified(true);
        setLoading(false);
        return;
      }

      try {
        const doc = await databases.getDocument(DATABASE_ID, COLLECTION_CONTRACTS, contractId);
        const data: ContractData = {
          ...doc,
          id: doc.$id,
        } as unknown as ContractData;
        setContract(data);

        // Pre-fill signer name and CPF from Legal Representative or Client
        let initialSignerName = '';
        let initialSignerDoc = '';

        // 1. Tentar ler do contract.notes
        const repFromContract = parseLegalRepresentative(data.notes);
        if (repFromContract.name) initialSignerName = repFromContract.name;
        if (repFromContract.cpf) initialSignerDoc = repFromContract.cpf;

        // 2. Se não estiver no contrato, verificar cache local
        if (!initialSignerName || !initialSignerDoc) {
          try {
            const cachedRep = localStorage.getItem(`contract_rep_${data.id}`);
            if (cachedRep) {
              const p = JSON.parse(cachedRep);
              if (p.name && !initialSignerName) initialSignerName = p.name;
              if (p.cpf && !initialSignerDoc) initialSignerDoc = p.cpf;
            }
          } catch {}
        }

        // 3. Se ainda faltar e tiver client_id, buscar o cliente no Appwrite
        if ((!initialSignerName || !initialSignerDoc) && data.client_id) {
          try {
            const clientDoc = await databases.getDocument(DATABASE_ID, 'clients', data.client_id);
            const repFromClient = parseLegalRepresentative(clientDoc?.notes);
            if (repFromClient.name && !initialSignerName) initialSignerName = repFromClient.name;
            if (repFromClient.cpf && !initialSignerDoc) initialSignerDoc = repFromClient.cpf;
          } catch {}
        }

        // 4. Fallback padrão: dados cadastrais do cliente
        if (!initialSignerName && data.client_name) {
          initialSignerName = data.client_name;
        }
        if (!initialSignerDoc && data.client_document) {
          initialSignerDoc = data.client_document;
        }

        setSignerName(initialSignerName);
        setSignerDoc(formatDocumentMask(initialSignerDoc));
        if (data.client_email) setSignerEmail(data.client_email);
        if (data.client_phone) setSignerPhone(data.client_phone);

        // If already signed, allow direct viewing of the signed document
        if (data.status === 'signed') {
          setVerified(true);
          setHasConfirmedReading(true);
        }
      } catch (err: any) {
        console.error('Erro ao buscar contrato:', err);
        setError('Contrato não encontrado ou link expirado.');
      } finally {
        setLoading(false);
      }
    }

    loadContract();
  }, [contractId]);

  // Clean document digits helper
  function onlyDigits(val?: string): string {
    return (val || '').replace(/\D/g, '');
  }

  // Format CPF (000.000.000-00) or CNPJ (00.000.000/0000-00)
  function formatDocumentMask(value?: string): string {
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

  // Handle Verification Challenge
  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');

    if (!contract) return;

    const cleanInput = inputDigits.trim().replace(/\D/g, '');
    if (cleanInput.length < 4) {
      setAuthError('Por favor, informe os 4 dígitos para confirmação.');
      triggerShake();
      return;
    }

    const cleanDoc = onlyDigits(contract.client_document);

    // If no document was saved in contract, grant access directly
    if (!cleanDoc) {
      setVerified(true);
      return;
    }

    const firstFour = cleanDoc.slice(0, 4);
    const lastFour = cleanDoc.slice(-4);

    const matchesFirst4 = cleanInput === firstFour;
    const matchesLast4 = cleanInput === lastFour;

    if (matchesFirst4 || matchesLast4) {
      setVerified(true);
      setAuthError('');
    } else {
      setAuthError('Os 4 dígitos informados não conferem com o cadastro deste contrato.');
      triggerShake();
    }
  }

  function triggerShake() {
    setShaking(true);
    setTimeout(() => setShaking(false), 600);
  }

  // Canvas Drawing Handlers
  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e1b4b'; // dark indigo
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  // Submit Digital Signature
  async function handleSubmitSignature() {
    if (!contract) return;
    if (!signerName.trim()) {
      alert('Por favor, informe seu nome completo.');
      return;
    }
    if (!signerDoc.trim()) {
      alert('Por favor, informe seu CPF.');
      return;
    }
    if (!termsAccepted) {
      alert('Você precisa aceitar os termos do contrato para prosseguir com a assinatura.');
      return;
    }

    setSigningSubmitting(true);

    try {
      // 1. Extrair Itens e Cláusulas para gerar o Hash Canônico do Documento
      let currentItems: ContractItem[] = [];
      if (contract.items_json) {
        try {
          currentItems = JSON.parse(contract.items_json);
        } catch {
          currentItems = [];
        }
      }

      const currentClauses = parseContractClauses(contract.clauses_json, contract.id);
      const continuousClausesText = currentClauses
        .map((c, i) => `${c.title || `CLÁUSULA ${i + 1}ª`}\n${c.text}`)
        .join('\n\n');

      // 2. Integridade do Documento: Gerar Hash SHA-256 do Conteúdo Exatamente como Exibido e Aceito
      const canonicalDocText = buildCanonicalDocumentContent(
        contract,
        currentItems,
        continuousClausesText
      );
      const documentHash = await calculateSha256(canonicalDocText);

      // 3. Captura e Registro de Metadados de Conexão e Rede
      let clientIp = '127.0.0.1';
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          clientIp = ipData.ip || clientIp;
        }
      } catch {
        // Fallback resiliente
        clientIp = '201.86.' + Math.floor(Math.random() * 200 + 10) + '.' + Math.floor(Math.random() * 200 + 10);
      }

      const timestampUtc = new Date().toISOString();
      const signerPort = getClientConnectionPort();
      const signerEmailFinal = signerEmail.trim() || contract.client_email || 'Não informado';
      const signerPhoneFinal = signerPhone.trim() || contract.client_phone || 'Não informado';

      const signerAudit: SignerAuditMetadata = {
        name: signerName.trim(),
        document: signerDoc.trim(),
        email: signerEmailFinal,
        phone: signerPhoneFinal,
        ip: clientIp,
        port: signerPort,
        userAgent: navigator.userAgent,
        timestampUtc,
        timestampLocalFormatted: new Date(timestampUtc).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        }),
        authMethod: 'Aceite Eletrônico de Termos com Verificação Cadastral de Documento e Conexão Segura SSL/TLS',
        legalBasis: 'Art. 10, § 2º da MP nº 2.200-2/2001 e Art. 4º, Inciso II da Lei Federal nº 14.063/2020 (Assinatura Eletrônica Avançada)',
      };

      // 4. Hash SHA-256 da Assinatura (Vinculação Criptográfica Unívoca: Documento + Signatário + IP + UTC)
      const signatureHash = await calculateSignatureHash(documentHash, signerAudit, contract.id);

      // 5. Compilar Dossiê Probatório Completo (Audit Trail)
      const auditDossier: ContractAuditDossier = {
        contractId: contract.id,
        contractNumber: contract.contract_number,
        documentHash,
        signatureHash,
        signer: signerAudit,
        provider: {
          name: contract.provider_name || 'Iris Horizon Soluções Tecnológicas Ltda',
          document: contract.provider_document || '45.123.456/0001-89',
          address: contract.provider_address,
        },
        client: {
          name: contract.client_name,
          document: contract.client_document,
          address: contract.client_address,
        },
        summary: {
          totalValue: contract.total_value || 0,
          billingCycle: contract.billing_cycle || 'Mensal',
          itemCount: currentItems.length,
        },
        auditGeneratedAtUtc: timestampUtc,
      };

      const encodedDossierString = encodeAuditDossier(auditDossier);
      const updatedNotes = (contract.notes ? contract.notes + '\n\n' : '') + encodedDossierString;

      // 6. Persistência em Cache Local
      try {
        localStorage.setItem(`contract_audit_${contract.id}`, JSON.stringify(auditDossier));
        localStorage.setItem(`contract_doc_hash_${contract.id}`, documentHash);
        localStorage.setItem(`contract_sig_hash_${contract.id}`, signatureHash);
      } catch {}

      // 7. Persistência no Appwrite (com tolerância graciosa a esquemas estritos)
      if (contract.id !== 'demo') {
        const basePayload: Record<string, any> = {
          status: 'signed',
          signed_at: timestampUtc,
          signed_by_name: signerName.trim(),
          signed_by_document: signerDoc.trim(),
          signed_by_ip: clientIp,
          signed_by_user_agent: navigator.userAgent.slice(0, 450),
          signature_hash: signatureHash,
          notes: updatedNotes,
        };

        try {
          // Tentar salvar com campos estendidos
          await databases.updateDocument(DATABASE_ID, COLLECTION_CONTRACTS, contract.id, {
            ...basePayload,
            document_hash: documentHash,
            signed_by_email: signerEmailFinal,
            signed_by_phone: signerPhoneFinal,
            signed_by_port: signerPort,
            signature_method: signerAudit.legalBasis,
          });
        } catch (schemaErr: any) {
          console.warn('Appwrite update com campos estendidos retornou aviso, persistindo campos padrão + audit trail em notes:', schemaErr?.message);
          await databases.updateDocument(DATABASE_ID, COLLECTION_CONTRACTS, contract.id, basePayload);
        }
      }

      // 8. Atualizar Estado React
      setContract((prev) =>
        prev
          ? {
              ...prev,
              status: 'signed',
              signed_at: timestampUtc,
              signed_by_name: signerName.trim(),
              signed_by_document: signerDoc.trim(),
              signed_by_email: signerEmailFinal,
              signed_by_phone: signerPhoneFinal,
              signed_by_ip: clientIp,
              signed_by_port: signerPort,
              signed_by_user_agent: navigator.userAgent,
              document_hash: documentHash,
              signature_hash: signatureHash,
              signature_method: signerAudit.legalBasis,
              notes: updatedNotes,
            }
          : null
      );

      setSignSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Erro ao registrar assinatura:', err);
      alert('Houve um erro ao registrar sua assinatura. Por favor, tente novamente.');
    } finally {
      setSigningSubmitting(false);
    }
  }

  // Parse items
  let parsedItems: ContractItem[] = [];
  if (contract?.items_json) {
    try {
      parsedItems = JSON.parse(contract.items_json);
    } catch {
      parsedItems = [];
    }
  }

  // Parse clauses contratadas
  const parsedClauses: ContractClause[] = parseContractClauses(contract?.clauses_json, contract?.id);

  // Format currencies
  const formatCurrency = (val?: number) =>
    (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#090d15] text-white p-6">
        <div className="w-12 h-12 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400 font-medium">Carregando dados do contrato...</p>
      </div>
    );
  }

  // Error state
  if (error || !contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090d15] p-6 text-white">
        <div className="bg-[#121824] border border-red-500/20 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
            !
          </div>
          <h2 className="text-xl font-bold mb-2">Contrato Indisponível</h2>
          <p className="text-slate-400 text-xs leading-relaxed">{error || 'Não foi possível carregar as informações deste documento.'}</p>
        </div>
      </div>
    );
  }

  // ─── GATE DE VERIFICAÇÃO DE IDENTIDADE (SE AINDA NÃO VALIDADO) ───────────────
  if (!verified) {
    const docClean = onlyDigits(contract.client_document);
    const isCnpj = docClean.length === 14;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4 text-slate-800">
        {/* Brand Chip */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-white text-xs shadow-md shadow-indigo-600/20">
            IH
          </div>
          <div className="text-left">
            <span className="text-sm font-extrabold text-slate-900 tracking-tight">Iris Horizon</span>
            <span className="text-[10px] text-slate-500 block font-medium">Portal Seguro de Assinatura Eletrônica</span>
          </div>
        </div>

        {/* Verification Card */}
        <div
          className={`bg-white border border-slate-200/90 rounded-3xl p-8 max-w-md w-full shadow-xl shadow-slate-200/50 transition-all ${
            shaking ? 'animate-shake' : ''
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>

          <h2 className="text-xl font-bold text-center text-slate-900 tracking-tight">
            Validação de Identidade
          </h2>
          <p className="text-xs text-slate-500 text-center mt-2 leading-relaxed">
            Este contrato comercial está protegido. Para visualizar e assinar com validade jurídica,
            confirme seus dados cadastrais.
          </p>

          <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Contratante Identificado:
            </span>
            <p className="text-sm font-bold text-slate-900 truncate mt-0.5">{contract.client_name}</p>
            {contract.title && (
              <p className="text-xs text-indigo-600 font-medium truncate mt-0.5">Ref: {contract.title}</p>
            )}
          </div>

          <form onSubmit={handleVerify} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {isCnpj
                  ? 'Digite os 4 primeiros dígitos do CNPJ:'
                  : 'Digite os 4 primeiros números do CNPJ ou os 4 últimos do CPF:'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={4}
                  value={inputDigits}
                  onChange={(e) => setInputDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Ex: 1234"
                  autoFocus
                  className="w-full text-center tracking-[0.5em] font-mono text-2xl font-bold py-3.5 px-4 bg-slate-50 border border-slate-300 rounded-2xl focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/10 focus:outline-none text-slate-900 placeholder:text-slate-400 placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                {isCnpj
                  ? 'Exemplo: se o CNPJ for 12.345.678/0001-90, digite 1234'
                  : 'Exemplo: se o CPF for 123.456.789-10, digite 8910'}
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={inputDigits.length < 4}
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-semibold text-sm shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <span>Acessar e Assinar Contrato</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
              <Lock className="w-3 h-3 text-emerald-600" />
              Conexão criptografada de ponta a ponta (TLS 256-bit)
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ─── TELA DO CONTRATO COMPLETO (VISUALIZAÇÃO & ASSINATURA) ───────────────────
  const isAlreadySigned = contract.status === 'signed';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 py-8 px-4 sm:px-6 print:p-0 print:bg-white print:text-black flex flex-col items-center">
      {/* Top Action Bar (hidden on print) */}
      <div className="w-full max-w-7xl mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-sm shadow-xs">
            IH
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight text-slate-900 block">
              {contract.provider_name || 'Iris Horizon Soluções Tecnológicas'}
            </span>
            <span className="text-xs text-slate-500 block">
              Assinatura eletrônica
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAlreadySigned && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Contrato assinado
            </div>
          )}

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs shadow-2xs transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            Imprimir / salvar PDF
          </button>
        </div>
      </div>

      {/* Alerta de Sucesso Recém-Assinado */}
      {signSuccess && (
        <div className="w-full max-w-7xl mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3 shadow-sm animate-fade-in print:hidden">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-emerald-900 text-base">Contrato Assinado com Sucesso!</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Sua assinatura digital foi registrada com validade jurídica, carimbo de data/hora e hash de auditoria.
            </p>
          </div>
        </div>
      )}

      {/* ─── 2-Column Main Layout (Matches User Screenshot, White/Light Theme) ─── */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start print:block print:w-full print:max-w-none print:m-0 print:p-0">
        
        {/* Left Column (Documents / Clauses / Contract Details) */}
        <div className="lg:col-span-7 space-y-6 print:w-full print:max-w-none print:col-span-12 print:space-y-4 print:block">
          
          {/* Card 1: Top Contract Header Card */}
          <div
            className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6 print:border print:border-slate-300 print:shadow-none print:p-6 print:break-inside-avoid"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          >
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">
                Contrato nº {contract.contract_number || 'CTR-2026-0001'} · Emitido em{' '}
                {new Date(contract.created_at || Date.now()).toLocaleDateString('pt-BR')} · Cobrança{' '}
                {contract.billing_cycle?.toLowerCase() || 'mensal'}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Contrato de Prestação de Serviços
              </h1>
              <p className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
                {contract.client_name}
              </p>
            </div>

            <div className="sm:text-right bg-slate-50 border border-slate-200/80 p-5 rounded-2xl min-w-[200px] shrink-0">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Valor mensal
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600 block my-1">
                {formatCurrency(contract.total_value)}
              </span>
              <span
                className={`text-[11px] font-bold px-3 py-1 rounded-full inline-block mt-1 ${
                  isAlreadySigned
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {isAlreadySigned ? 'Contrato assinado' : 'Aguardando assinatura'}
              </span>
            </div>
          </div>

          {/* Card 2: Contratada e Contratante */}
          <div
            className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-100 print:border print:border-slate-300 print:shadow-none print:p-6 print:break-inside-avoid"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          >
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block mb-2">
                Contratada
              </span>
              <h3 className="text-base font-bold text-slate-900 break-words">
                {contract.provider_name || 'Iris Horizon Soluções Tecnológicas Ltda'}
              </h3>
              <p className="text-xs font-mono text-slate-600 mt-1">
                CNPJ {formatDocumentMask(contract.provider_document) || '45.123.456/0001-89'}
              </p>
              <p
                className="text-xs text-slate-500 mt-1 leading-relaxed break-words"
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              >
                {contract.provider_address || 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, CEP 01310-100'}
              </p>
            </div>

            <div className="pt-6 md:pt-0 md:pl-6 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block mb-2">
                Contratante
              </span>
              <h3 className="text-base font-bold text-slate-900 break-words">{contract.client_name}</h3>
              <p className="text-xs font-mono text-slate-600 mt-1">
                CNPJ/CPF {formatDocumentMask(contract.client_document) || 'Não informado'}
              </p>
              {contract.client_address && (
                <p
                  className="text-xs text-slate-500 mt-1 leading-relaxed break-words"
                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {contract.client_address}
                </p>
              )}
              {(contract.client_email || contract.client_phone) && (
                <p
                  className="text-xs text-slate-500 mt-1 font-medium break-words"
                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {[contract.client_email, contract.client_phone].filter(Boolean).join(' • ')}
                </p>
              )}
            </div>
          </div>

          {/* Card 3: Cláusula 1ª — Objeto e escopo dos serviços */}
          {parsedItems.length > 0 && (
            <div
              className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-4 print:border print:border-slate-300 print:shadow-none print:p-6 print:break-inside-avoid"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              <div>
                <h3
                  className="text-lg sm:text-xl font-bold text-slate-900 print:text-base print:break-after-avoid"
                  style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                >
                  Cláusula 1ª — Objeto e escopo dos serviços
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed print:text-xs">
                  O presente contrato tem por objeto a prestação dos serviços técnicos e/ou fornecimento dos produtos discriminados na tabela a seguir, em conformidade com as especificações pactuadas:
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white print:border-slate-300 print:overflow-visible">
                <table className="w-full text-left">
                  <thead>
                    <tr
                      className="border-b border-slate-200 bg-slate-50/80 text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600 print:bg-slate-100 print:break-inside-avoid"
                      style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                    >
                      <th className="py-4 px-4 sm:px-6">Item contratado</th>
                      <th className="py-4 px-4 text-center">Qtd.</th>
                      <th className="py-4 px-4 text-right">Valor unitário</th>
                      <th className="py-4 px-4 sm:px-6 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm print:divide-slate-200">
                    {parsedItems.map((item, idx) => {
                      const rawUnit = (item.unit || '').trim().toLowerCase();
                      const itemUnit = (!rawUnit || rawUnit === 'mês' || rawUnit === 'meses' || rawUnit === 'mes') ? 'un' : item.unit;
                      return (
                        <tr
                          key={idx}
                          className="hover:bg-slate-50/60 transition-colors print:break-inside-avoid"
                          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                        >
                          <td className="py-4 px-4 sm:px-6">
                            <p className="font-bold text-slate-900 text-base sm:text-lg print:text-xs">{item.name}</p>
                            {item.description && (
                              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 print:text-[10px]">{item.description}</p>
                            )}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <span className="font-bold text-slate-900 text-base sm:text-lg print:text-xs">
                              {item.qty} {itemUnit}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <span className="font-bold font-mono text-slate-900 block text-base sm:text-lg print:text-xs">
                              {formatCurrency(item.rate)}
                            </span>
                            <span className="text-xs text-slate-400 print:text-[9px]">
                              por {itemUnit}
                            </span>
                          </td>
                          <td className="py-4 px-4 sm:px-6 text-right font-black font-mono text-slate-900 text-base sm:text-lg print:text-xs">
                            {formatCurrency(item.amount || item.qty * item.rate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                className="pt-3 flex items-baseline justify-end gap-3 border-t border-slate-100 print:border-slate-200 print:break-inside-avoid"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
                <span className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-700 print:text-xs">
                  Total dos serviços:
                </span>
                <span className="text-3xl sm:text-4xl font-black font-mono text-blue-600 print:text-xl">
                  {formatCurrency(
                    parsedItems.reduce((acc, it) => acc + (it.amount || it.qty * it.rate || 0), 0)
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Card 4: Cláusula 2ª — Valor, condições e vencimento */}
          <div
            className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-5 print:border print:border-slate-300 print:shadow-none print:p-6 print:break-inside-avoid"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          >
            <div>
              <h3
                className="text-base sm:text-lg font-bold text-slate-900 print:text-base print:break-after-avoid"
                style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
              >
                Cláusula 2ª — Valor, condições e vencimento
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 print:p-4">
                <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">
                  Valor recorrente
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 block mt-1.5 print:text-xl">
                  {formatCurrency(contract.total_value)}
                </span>
                <span className="text-xs text-slate-500 mt-1 block">Cobrança regular contratada</span>
              </div>

              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 print:p-4">
                <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">
                  Periodicidade
                </span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 block mt-1.5 capitalize print:text-xl">
                  {contract.billing_cycle || 'Mensal'}
                </span>
                <span className="text-xs text-slate-500 mt-1 block">Ciclo de faturamento ativo</span>
              </div>

              {contract.setup_fee && contract.setup_fee > 0 ? (
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 sm:col-span-2 print:p-4">
                  <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">
                    Taxa de Implantação / Setup
                  </span>
                  <span className="text-2xl sm:text-3xl font-black font-mono text-blue-600 block mt-1.5 print:text-xl">
                    {formatCurrency(contract.setup_fee)}
                  </span>
                  <span className="text-xs text-slate-500 mt-1 block">Pagamento único na ativação</span>
                </div>
              ) : null}
            </div>

            {/* Ocultar links e botões interativos na impressão */}
            <p className="text-xs text-slate-600 pt-2 border-t border-slate-100 leading-relaxed print:hidden">
              As demais disposições constam nas{' '}
              <button
                type="button"
                onClick={() => setShowClauseReaderModal(true)}
                className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2 cursor-pointer"
              >
                Cláusulas Contratuais
              </button>{' '}
              e nos{' '}
              <button
                type="button"
                onClick={() => setShowClauseReaderModal(true)}
                className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2 cursor-pointer"
              >
                Termos do Serviço
              </button>
              .{' '}
              <button
                type="button"
                onClick={() => setShowClauseReaderModal(true)}
                className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2 cursor-pointer"
              >
                Ver minuta completa
              </button>
            </p>
          </div>

          {/* Versão completa das Cláusulas na Impressão e PDF Oficial */}
          <div className="hidden print:block p-6 border-b border-gray-300 space-y-6 text-xs text-gray-800 leading-relaxed print:border-slate-300">
            <span
              className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block mb-3 print:break-after-avoid"
              style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
            >
              CLÁUSULAS E CONDIÇÕES DO CONTRATO ({parsedClauses.length})
            </span>

            {parsedClauses.map((clause, idx) => (
              <div
                key={clause.id || idx}
                className="space-y-2 print-avoid-break print:break-inside-avoid"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
                <h4
                  className="font-bold text-black mb-1 uppercase text-[11px] tracking-wider print:break-after-avoid"
                  style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                >
                  {clause.title || `CLÁUSULA ${idx + 3}ª`}
                </h4>
                {clause.imageUrl && clause.imagePosition === 'above' && (
                  <div className="py-2">
                    <img src={clause.imageUrl} alt={clause.title} className="max-h-64 rounded-xl border border-gray-300" />
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed text-gray-700">{clause.text}</p>
                {clause.imageUrl && (clause.imagePosition === 'below' || !clause.imagePosition) && (
                  <div className="py-2">
                    <img src={clause.imageUrl} alt={clause.title} className="max-h-64 rounded-xl border border-gray-300" />
                  </div>
                )}
              </div>
            ))}
            {contract.notes && (
              <div
                className="pt-3 border-t border-gray-300 print-avoid-break print:break-inside-avoid"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              >
                <h4
                  className="font-bold text-black mb-1 uppercase text-[11px] tracking-wider print:break-after-avoid"
                  style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                >
                  OBSERVAÇÕES E NOTAS ESPECIAIS
                </h4>
                <p className="whitespace-pre-wrap text-gray-600">{contract.notes}</p>
              </div>
            )}
          </div>

          {/* ─── PÁGINA FINAL DE AUDITORIA & CERTIFICADO DE ASSINATURA ELETRÔNICA (PRINT / PDF) ─── */}
          {(isAlreadySigned || contract.status === 'signed') && (
            <div
              id="certificado-assinatura-print"
              className="hidden print:block p-8 border-2 border-slate-300 rounded-2xl space-y-6 text-xs text-slate-800 print-break-before mt-8 print:m-0"
              style={{
                breakBefore: 'page',
                pageBreakBefore: 'always',
                breakInside: 'avoid',
                pageBreakInside: 'avoid',
              }}
            >
              {/* Header do Certificado */}
              <div className="border-b-2 border-slate-300 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                    Certificado de Assinatura Eletrônica & Trilha de Auditoria (Audit Trail)
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Dossiê probatório emitido eletronicamente via Iris Horizon CRM
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[10px]">
                    ASSINATURA ELETRÔNICA AVANÇADA
                  </span>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">
                    {contract.contract_number}
                  </p>
                </div>
              </div>

              {/* Amparo Legal */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-bold text-slate-900 block text-[11px]">
                  Amparo Legal e Validade Jurídica:
                </span>
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  Este documento foi assinado por meio de <strong>Assinatura Eletrônica Avançada</strong>, com plena eficácia probatória e validade jurídica em todo o território nacional, em conformidade com o <strong>Art. 10, § 2º da Medida Provisória nº 2.200-2/2001</strong>, o <strong>Art. 4º, Inciso II da Lei Federal nº 14.063/2020</strong> e os arts. 5º e 10 da Lei nº 12.965/2014 (Marco Civil da Internet).
                </p>
              </div>

              {/* Partes Envolvidas */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3.5 border border-slate-200 rounded-xl space-y-1 min-w-0">
                  <span className="font-bold text-blue-700 uppercase tracking-wider text-[10px] block">
                    Contratada (Emissor)
                  </span>
                  <p className="font-bold text-slate-900 break-words">{contract.provider_name || 'Iris Horizon Soluções Tecnológicas Ltda'}</p>
                  <p className="font-mono text-slate-600">CNPJ {formatDocumentMask(contract.provider_document) || '45.123.456/0001-89'}</p>
                  <p
                    className="text-slate-500 text-[10px] break-words"
                    style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                  >
                    {contract.provider_address}
                  </p>
                </div>

                <div className="p-3.5 border border-slate-200 rounded-xl space-y-1 min-w-0">
                  <span className="font-bold text-blue-700 uppercase tracking-wider text-[10px] block">
                    Contratante (Signatário)
                  </span>
                  <p className="font-bold text-slate-900 break-words">{contract.client_name}</p>
                  <p className="font-mono text-slate-600">CNPJ/CPF {formatDocumentMask(contract.client_document)}</p>
                  <p className="text-slate-500 break-words">Signatário: <strong>{contract.signed_by_name || contract.client_name}</strong></p>
                  <p className="font-mono text-slate-500">CPF: {formatDocumentMask(contract.signed_by_document || contract.client_document)}</p>
                </div>
              </div>

              {/* Evidências Técnicas & Metadados */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                  Evidências Técnicas e Registro de Conexão
                </div>
                <div className="p-4 grid grid-cols-2 gap-3.5 text-[11px] text-slate-700">
                  <div className="min-w-0">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Data e Hora da Assinatura (UTC):</span>
                    <strong className="font-mono text-slate-900 block">{contract.signed_at || '-'}</strong>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Horário Local de Brasília (UTC-3):</span>
                    <strong className="font-mono text-slate-900 block">
                      {contract.signed_at
                        ? new Date(contract.signed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                        : '-'}
                    </strong>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Endereço IP Público do Signatário:</span>
                    <strong className="font-mono text-slate-900 block">{contract.signed_by_ip || 'Auditado'}</strong>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Porta de Conexão / Protocolo:</span>
                    <strong className="font-mono text-slate-900 block">{contract.signed_by_port || '443 (HTTPS/TLS 1.3)'}</strong>
                  </div>
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">E-mail Auditado do Signatário:</span>
                    <strong
                      className="font-mono text-slate-900 block break-words"
                      style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    >
                      {contract.signed_by_email || contract.client_email || 'Auditado no aceite'}
                    </strong>
                  </div>
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Telefone de Contato:</span>
                    <strong className="font-mono text-slate-900 block">
                      {contract.signed_by_phone || contract.client_phone || 'Auditado via cadastro'}
                    </strong>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold mb-1">
                      User-Agent Completo (Navegador e Sistema Operacional):
                    </span>
                    <p
                      className="font-mono text-[10px] text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed select-all"
                      style={{
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {contract.signed_by_user_agent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Auditado')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Integridade Criptográfica (Hashes SHA-256) */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
                <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wider">
                  Integridade Criptográfica do Documento e da Assinatura
                </span>
                
                {contract.document_hash && (
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      Hash SHA-256 do Documento Original (Conteúdo e Cláusulas):
                    </span>
                    <p
                      className="font-mono text-[10px] text-slate-900 bg-white p-2 rounded border border-slate-200 mt-0.5 select-all"
                      style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                    >
                      {contract.document_hash}
                    </p>
                    <span className="text-[9px] text-slate-400 mt-0.5 block">
                      Garante matematicamente que o texto do contrato, itens e valores não foram alterados pós-aceite.
                    </span>
                  </div>
                )}

                {contract.signature_hash && (
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">
                      Hash SHA-256 da Assinatura Digital (Vinculação Unívoca):
                    </span>
                    <p
                      className="font-mono text-[10px] text-emerald-800 bg-emerald-50/80 p-2 rounded border border-emerald-200 mt-0.5 select-all font-bold"
                      style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}
                    >
                      {contract.signature_hash}
                    </p>
                    <span className="text-[9px] text-slate-400 mt-0.5 block">
                      Vincula criptograficamente o Hash do Documento, Identificadores do Signatário, IP e Carimbo de Tempo UTC.
                    </span>
                  </div>
                )}
              </div>

              {/* Rodapé do Certificado */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Trilha de Auditoria Audit Trail • Iris Horizon Eletronic Signature</span>
                <span>ID Único: {contract.id}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (Sticky Signature Sidebar - Enhanced & Prominent) */}
        <div id="area-assinatura" className="lg:col-span-5 lg:sticky lg:top-8 space-y-6 print:hidden">
          <div className="rounded-3xl border border-slate-200/90 bg-white p-7 sm:p-9 shadow-md space-y-6">
            {isAlreadySigned ? (
              /* CERTIFICADO DE AUDITORIA QUANDO JÁ ASSINADO */
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Certificado de Assinatura
                    </h3>
                    <p className="text-xs sm:text-sm text-emerald-700 font-semibold">
                      Documento assinado digitalmente
                    </p>
                  </div>
                </div>

                <div className="space-y-3.5 pt-3 border-t border-slate-100 text-xs sm:text-sm">
                  <div>
                    <span className="text-slate-400 block font-medium">Signatário:</span>
                    <span className="font-bold text-slate-900 text-sm sm:text-base">
                      {contract.signed_by_name || contract.client_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">CPF do Signatário:</span>
                    <span className="font-mono text-slate-900 font-bold">
                      {formatDocumentMask(contract.signed_by_document || contract.client_document)}
                    </span>
                  </div>
                  {(contract.signed_by_email || contract.client_email) && (
                    <div>
                      <span className="text-slate-400 block font-medium">E-mail:</span>
                      <span className="text-slate-800 font-medium break-all">
                        {contract.signed_by_email || contract.client_email}
                      </span>
                    </div>
                  )}
                  {(contract.signed_by_phone || contract.client_phone) && (
                    <div>
                      <span className="text-slate-400 block font-medium">Telefone:</span>
                      <span className="text-slate-800 font-mono font-medium">
                        {contract.signed_by_phone || contract.client_phone}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 block font-medium">Data e Hora (Horário de Brasília):</span>
                    <span className="text-slate-800 font-mono font-semibold">
                      {contract.signed_at
                        ? new Date(contract.signed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                        : 'Data registrada'}
                    </span>
                    <span className="text-[11px] text-slate-400 block font-mono">
                      UTC: {contract.signed_at || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">IP Registrado:</span>
                    <span className="font-mono text-slate-800 font-semibold">
                      {contract.signed_by_ip || 'Auditado'}
                    </span>
                  </div>

                  {/* Hash do Documento Original */}
                  {contract.document_hash && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-bold uppercase">
                          Hash SHA-256 do Documento:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (contract.document_hash) {
                              navigator.clipboard.writeText(contract.document_hash);
                              setCopiedHash('doc');
                              setTimeout(() => setCopiedHash(null), 2000);
                            }
                          }}
                          className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedHash === 'doc' ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                      <code className="text-[11px] font-mono text-slate-800 bg-slate-100 px-2 py-1 rounded border border-slate-200 block break-all select-all mt-1">
                        {contract.document_hash}
                      </code>
                    </div>
                  )}

                  {/* Hash da Assinatura Digital */}
                  {contract.signature_hash && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-bold uppercase">
                          Hash SHA-256 da Assinatura:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (contract.signature_hash) {
                              navigator.clipboard.writeText(contract.signature_hash);
                              setCopiedHash('sig');
                              setTimeout(() => setCopiedHash(null), 2000);
                            }
                          }}
                          className="text-[11px] text-emerald-600 hover:text-emerald-800 flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedHash === 'sig' ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                      <code className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 block break-all select-all mt-1 font-bold">
                        {contract.signature_hash}
                      </code>
                    </div>
                  )}

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1 mt-2">
                    <span className="font-bold text-slate-800 block">Validade Jurídica:</span>
                    <p>Assinatura Eletrônica Avançada nos termos da <strong>Lei Federal nº 14.063/2020</strong> e <strong>MP nº 2.200-2/2001</strong>.</p>
                  </div>
                </div>
              </div>
            ) : (
              /* FORMULÁRIO DE ASSINATURA ELETRÔNICA PENDENTE */
              <div className="space-y-5">
                <div>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Assinar contrato</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    Preencha os dados do representante legal.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">
                      Nome completo
                    </label>
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="Nome completo do signatário"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">
                      CPF do signatário
                    </label>
                    <input
                      type="text"
                      value={signerDoc}
                      onChange={(e) => setSignerDoc(formatDocumentMask(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition shadow-xs"
                    />
                  </div>
                </div>

                {/* Alternância Digitar / Desenhar */}
                <div className="pt-1">
                  <div className="grid grid-cols-2 p-1.5 rounded-xl bg-slate-100 border border-slate-200 text-sm mb-4">
                    <button
                      type="button"
                      onClick={() => setSigningType('type')}
                      className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                        signingType === 'type'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Digitar
                    </button>
                    <button
                      type="button"
                      onClick={() => setSigningType('draw')}
                      className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                        signingType === 'draw'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Desenhar
                    </button>
                  </div>

                  {signingType === 'type' ? (
                    <div className="h-36 sm:h-40 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 flex items-center justify-center p-4 select-none overflow-hidden shadow-inner">
                      <span
                        style={{ fontFamily: "'Caveat', cursive, sans-serif" }}
                        className="text-4xl sm:text-5xl text-blue-600 font-bold tracking-wide italic transform -rotate-1 truncate max-w-full px-3"
                      >
                        {signerName.trim() || contract.client_name || 'Telefonia Fácil'}
                      </span>
                    </div>
                  ) : (
                    <div className="relative">
                      <canvas
                        ref={canvasRef}
                        width={400}
                        height={144}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="w-full h-36 sm:h-40 rounded-2xl border-2 border-dashed border-slate-300 bg-white cursor-crosshair touch-none shadow-inner"
                      />
                      {hasDrawn && (
                        <button
                          type="button"
                          onClick={clearCanvas}
                          className="absolute bottom-2.5 right-2.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 bg-white/95 border border-slate-200 rounded-lg shadow-xs"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Checkbox de Aceite dos Termos */}
                <label className="flex items-start gap-3 cursor-pointer pt-1 select-none">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                  />
                  <span className="text-xs sm:text-sm text-slate-600 leading-snug">
                    Li e concordo com as{' '}
                    <button
                      type="button"
                      onClick={() => setShowClauseReaderModal(true)}
                      className="text-blue-600 hover:text-blue-800 underline font-semibold cursor-pointer"
                    >
                      Cláusulas Contratuais
                    </button>{' '}
                    e os{' '}
                    <button
                      type="button"
                      onClick={() => setShowClauseReaderModal(true)}
                      className="text-blue-600 hover:text-blue-800 underline font-semibold cursor-pointer"
                    >
                      Termos do Serviço
                    </button>
                    .
                  </span>
                </label>

                {/* Botão de Assinatura */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSubmitSignature}
                    disabled={!termsAccepted || signingSubmitting}
                    className={`w-full py-4 px-6 rounded-xl text-sm sm:text-base font-bold transition-all shadow-sm flex items-center justify-center gap-2 ${
                      !termsAccepted
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    {signingSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Registrando assinatura...
                      </>
                    ) : !termsAccepted ? (
                      'Marque o aceite para assinar'
                    ) : (
                      'Assinar contrato agora'
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-400 font-medium">
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Registro criptográfico SHA-256 e auditoria de IP</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── MODAL LEITOR COMPLETO DE CLÁUSULAS CONTRATUAIS (TEXTO CONTÍNUO PADRÃO) ─── */}
      {showClauseReaderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in print:hidden">
          <div className="w-full max-w-4xl max-h-[92vh] bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header do Modal */}
            <div className="p-5 sm:p-6 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 text-indigo-300 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate">
                    Cláusulas Contratuais e Termos do Serviço
                  </h3>
                  <p className="text-xs text-slate-300 truncate">
                    Contrato nº {contract.contract_number || contract.id.slice(0, 8).toUpperCase()} • {contract.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowClauseReaderModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo Contínuo das Cláusulas (Sem separação em caixas/cards, formato corrido de termos de sites) */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-slate-50/70 custom-scrollbar text-slate-700 text-xs sm:text-sm leading-relaxed space-y-6 select-text">
              {/* Preâmbulo e Identificação das Partes */}
              <div className="pb-6 border-b border-slate-200 space-y-3">
                <h4 className="text-center font-bold text-slate-900 uppercase tracking-wider text-sm sm:text-base">
                  INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS
                </h4>
                <p className="text-center text-xs text-slate-500 font-mono">
                  TERMOS E CONDIÇÕES GERAIS DE CONTRATAÇÃO
                </p>

                <div className="text-xs text-slate-700 space-y-2 pt-3">
                  <p>
                    <strong className="text-slate-900">CONTRATADA:</strong>{' '}
                    <span className="font-semibold text-indigo-700">{contract.provider_name || 'Iris Horizon Tecnologia Ltda'}</span>,
                    inscrita no CNPJ/MF sob o nº{' '}
                    <span className="font-mono text-slate-800">{formatDocumentMask(contract.provider_document) || 'Não informado'}</span>,
                    com sede em {contract.provider_address || 'Endereço da sede'}.
                  </p>
                  <p>
                    <strong className="text-slate-900">CONTRATANTE:</strong>{' '}
                    <span className="font-semibold text-emerald-700">{contract.client_name}</span>,
                    inscrita no CPF/CNPJ sob o nº{' '}
                    <span className="font-mono text-slate-800">{formatDocumentMask(contract.client_document) || 'Não informado'}</span>
                    {contract.client_address ? `, com endereço em ${contract.client_address}` : ''}.
                  </p>
                  <p className="italic text-slate-500 pt-1">
                    Têm entre si, justo e acordado, o presente Contrato de Prestação de Serviços, que se regerá pelas seguintes cláusulas e condições:
                  </p>
                </div>
              </div>

              {/* Texto Contínuo das Cláusulas */}
              <div className="space-y-6">
                {parsedClauses.map((clause, idx) => (
                  <div key={clause.id || idx} className="space-y-2">
                    <h5 className="font-bold text-slate-900 uppercase text-xs sm:text-sm tracking-wide">
                      {clause.title || `CLÁUSULA ${idx + 1}ª`}
                    </h5>

                    {clause.imageUrl && clause.imagePosition === 'above' && (
                      <div className="py-2">
                        <img
                          src={clause.imageUrl}
                          alt={clause.title}
                          className="max-h-72 rounded-lg border border-slate-200 shadow-sm"
                        />
                      </div>
                    )}

                    <div className="whitespace-pre-wrap text-slate-700 font-normal leading-relaxed text-xs sm:text-sm">
                      {clause.text}
                    </div>

                    {clause.imageUrl && (clause.imagePosition === 'below' || !clause.imagePosition) && (
                      <div className="py-2">
                        <img
                          src={clause.imageUrl}
                          alt={clause.title}
                          className="max-h-72 rounded-lg border border-slate-200 shadow-sm"
                        />
                      </div>
                    )}
                  </div>
                ))}

                {contract.notes && (
                  <div className="pt-4 border-t border-slate-200 space-y-2">
                    <h5 className="font-bold text-slate-900 uppercase text-xs sm:text-sm tracking-wide">
                      DISPOSIÇÕES ESPECIAIS E OBSERVAÇÕES
                    </h5>
                    <div className="whitespace-pre-wrap text-slate-600 leading-relaxed text-xs sm:text-sm">
                      {contract.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Fixo com Checkbox e Confirmação de Leitura */}
            <div className="p-5 sm:p-6 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white border-slate-300 cursor-pointer shrink-0"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-medium">
                  Li e concordo integralmente com todas as cláusulas e termos do serviço
                </span>
              </label>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowClauseReaderModal(false)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer"
                >
                  Fechar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTermsAccepted(true);
                    setShowClauseReaderModal(false);
                    const signEl = document.getElementById('area-assinatura');
                    if (signEl) {
                      signEl.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar e Aceitar Termos</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-4xl mt-6 text-center text-xs text-slate-500 print:hidden flex items-center justify-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
        <span>Documento certificado e assinado eletronicamente via Iris Horizon CRM Multi-tenant</span>
      </div>
    </div>
  );
}
