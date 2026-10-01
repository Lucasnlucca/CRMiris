import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Pencil, Trash2, X, MapPin, Phone, Mail, BadgeInfo, Smartphone, FileSignature, UserCheck } from 'lucide-react';
import type { Client, PersonType } from '../types';
import { databases, client } from '../lib/appwrite';
import { Query, ID } from 'appwrite';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';

export function parseLegalRepresentative(notes?: string): { name: string; cpf: string; cleanNotes: string } {
  if (!notes) return { name: '', cpf: '', cleanNotes: '' };
  const match = notes.match(/\[REP_LEGAL:\s*(\{.*?\})\]/s);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const cleanNotes = notes.replace(/\[REP_LEGAL:\s*\{.*?\}\]\s*/s, '').trim();
      return {
        name: parsed.name || '',
        cpf: parsed.cpf || '',
        cleanNotes,
      };
    } catch {}
  }
  return { name: '', cpf: '', cleanNotes: notes };
}

export function encodeNotesWithLegalRep(notes: string, repName?: string, repCpf?: string): string {
  const clean = (notes || '').replace(/\[REP_LEGAL:\s*\{.*?\}\]\s*/s, '').trim();
  if (!repName?.trim() && !repCpf?.trim()) {
    return clean;
  }
  const repMeta = `[REP_LEGAL: ${JSON.stringify({ name: repName?.trim() || '', cpf: repCpf?.trim() || '' })}]`;
  return clean ? `${clean}\n\n${repMeta}` : repMeta;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type ClientFormData = Omit<Client, 'id' | 'created_at'>;

const initialForm: ClientFormData = {
  person_type: 'PJ',
  document: '',
  name: '',
  fantasy_name: '',
  email: '',
  phone: '',
  phone_landline: '',
  whatsapp: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  notes: '',
  legal_representative_name: '',
  legal_representative_cpf: '',
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatDocument(value: string, person_type?: PersonType) {
  const digits = onlyDigits(value);

  if (person_type === 'PF' || (!person_type && digits.length <= 11)) {
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

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/g, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/g, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

interface ContatosProps {
  onPageChange?: (page: string, referenceId?: string | null) => void;
}

export default function Contatos({ onPageChange }: ContatosProps = {}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormData>(initialForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function handleCreateContractForClient(c: Client) {
    const fullAddress = [
      c.street ? `${c.street}${c.number ? `, ${c.number}` : ''}${c.complement ? ` - ${c.complement}` : ''}` : '',
      c.neighborhood,
      c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : '',
      c.cep ? `CEP: ${c.cep}` : '',
    ]
      .filter(Boolean)
      .join(' - ');

    const clientPayload = {
      id: c.id,
      name: c.name || c.fantasy_name || '',
      fantasy_name: c.fantasy_name || '',
      document: formatDocument(c.document || '', c.person_type),
      email: c.email || '',
      phone: c.phone || c.whatsapp || c.phone_landline || '',
      address: fullAddress,
      legal_representative_name: c.legal_representative_name || '',
      legal_representative_cpf: c.legal_representative_cpf || '',
    };

    sessionStorage.setItem('create_contract_from_client', JSON.stringify(clientPayload));
    if (onPageChange) {
      onPageChange('crm-contratos', c.id);
    } else {
      try {
        sessionStorage.setItem('currentPage', 'crm-contratos');
      } catch {}
      window.location.reload();
    }
  }

useEffect(() => {
  loadClients();

  const clientsChannel = `databases.${DATABASE_ID}.collections.clients.documents`;
  const unsubscribe = client.subscribe(clientsChannel, (response: any) => {
    const events: string[] = response.events || [];
    const payload = response.payload;
    if (!payload) return;

    if (events.some((e: string) => e.includes('.create'))) {
      const newC: Client = { ...payload, id: payload.$id };
      setClients((prev) => {
        if (prev.some((c) => c.id === newC.id)) return prev;
        return [newC, ...prev];
      });
    } else if (events.some((e: string) => e.includes('.update'))) {
      const updatedC: Client = { ...payload, id: payload.$id };
      setClients((prev) =>
        prev.map((c) => (c.id === updatedC.id ? { ...c, ...updatedC } : c))
      );
    } else if (events.some((e: string) => e.includes('.delete'))) {
      const deletedId = payload.$id;
      setClients((prev) => prev.filter((c) => c.id !== deletedId));
    }
  });

  return () => {
    try {
      unsubscribe();
    } catch (e) {}
  };
}, []);

async function loadClients() {
  setLoading(true);

  try {
    const { documents } = await databases.listDocuments(DATABASE_ID, 'clients', [
       Query.orderDesc('created_at'),
       Query.limit(500)
    ]);
    setClients(documents.map(d => {
      const rep = parseLegalRepresentative(d.notes);
      return {
        ...d,
        id: d.$id,
        legal_representative_name: d.legal_representative_name || rep.name || '',
        legal_representative_cpf: d.legal_representative_cpf || rep.cpf || '',
        notes: rep.cleanNotes || d.notes || '',
      } as unknown as Client;
    }));
  } catch (error) {
    console.error(error);
    alert('Erro ao carregar clientes.');
  } finally {
    setLoading(false);
  }
}

  const filteredClients = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    if (!term) return clients;

    return clients.filter((client) =>
      [
        client.document,
        client.name,
        client.fantasy_name,
        client.email,
        client.phone,
        client.phone_landline,
        client.whatsapp,
        client.cep,
        client.street,
        client.number,
        client.neighborhood,
        client.city,
        client.state,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [clients, searchTerm]);

  function openNewModal() {
    setEditingClient(null);
    setForm(initialForm);
    setShowModal(true);
  }

  function openEditModal(client: Client) {
    setEditingClient(client);
    const rep = parseLegalRepresentative(client.notes);
    setForm({
      person_type: client.person_type,
      document: client.document,
      name: client.name,
      fantasy_name: client.fantasy_name,
      email: client.email,
      phone: client.phone,
      phone_landline: client.phone_landline || '',
      whatsapp: client.whatsapp,
      cep: client.cep,
      street: client.street,
      number: client.number,
      complement: client.complement,
      neighborhood: client.neighborhood,
      city: client.city,
      state: client.state,
      notes: rep.cleanNotes || client.notes || '',
      legal_representative_name: client.legal_representative_name || rep.name || '',
      legal_representative_cpf: client.legal_representative_cpf || rep.cpf || '',
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingClient(null);
    setForm(initialForm);
  }

  async function saveClient(e: React.FormEvent) {
  e.preventDefault();

  if (!form.document.trim()) {
    alert(`Informe o ${form.person_type === 'PF' ? 'CPF' : 'CNPJ'}.`);
    return;
  }

  if (!form.name.trim()) {
    alert(`Informe o ${form.person_type === 'PF' ? 'nome completo' : 'nome / razão social'}.`);
    return;
  }

  setSaving(true);

  const encodedNotes = encodeNotesWithLegalRep(
    form.notes.trim(),
    form.legal_representative_name,
    form.legal_representative_cpf
  );

  const payload = {
    person_type: form.person_type,
    document: form.document.trim(),
    name: form.name.trim(),
    fantasy_name: form.fantasy_name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    phone_landline: form.phone_landline.trim(),
    whatsapp: form.whatsapp.trim(),
    cep: form.cep.trim(),
    street: form.street.trim(),
    number: form.number.trim(),
    complement: form.complement.trim(),
    neighborhood: form.neighborhood.trim(),
    city: form.city.trim(),
    state: form.state.trim().toUpperCase(),
    notes: encodedNotes,
  };

  if (editingClient) {
    try {
      await databases.updateDocument(DATABASE_ID, 'clients', editingClient.id, payload);
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Erro ao atualizar cliente.');
      setSaving(false);
      return;
    }
  } else {
    try {
      await databases.createDocument(DATABASE_ID, 'clients', ID.unique(), { ...payload, is_active: true });
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Erro ao cadastrar cliente.');
      setSaving(false);
      return;
    }
  }

  await loadClients();
  setSaving(false);
  closeModal();
}
async function deleteClient(clientId: string) {
  const confirmed = window.confirm('Deseja excluir este cliente?');
  if (!confirmed) return;

  try {
    await databases.deleteDocument(DATABASE_ID, 'clients', clientId);
    await loadClients();
  } catch (error: any) {
    console.error(error);
    alert(error.message || 'Erro ao excluir cliente.');
  }
}

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Cadastro de Clientes</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gestão unificada de contatos, clientes e empresas da sua carteira.
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      <div className="bg-white dark:bg-[#121824] rounded-2xl shadow-xs border border-slate-200/80 dark:border-white/[0.08] p-5">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF/CNPJ, cidade, telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50/70 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0c1017] focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {filteredClients.length} cliente(s) encontrado(s)
          </div>
        </div>

        {filteredClients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 p-10 text-center">
            <p className="text-slate-700 dark:text-slate-300 font-semibold text-sm">
              Nenhum cliente cadastrado ainda.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Clique em <strong>Novo Cliente</strong> para começar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/[0.08]">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50/80 dark:bg-white/[0.02] text-[11px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-400 border-b border-slate-200/80 dark:border-white/[0.08]">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Nome / Razão Social</th>
                  <th scope="col" className="px-5 py-3.5">Documento</th>
                  <th scope="col" className="px-5 py-3.5">Contato</th>
                  <th scope="col" className="px-5 py-3.5">Localidade</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.04] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]" title={client.name}>
                            {client.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            {client.person_type}
                          </span>
                        </div>
                        {client.fantasy_name && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 max-w-[200px]" title={client.fantasy_name}>
                            {client.fantasy_name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                        {formatDocument(client.document || '', client.person_type)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1 text-xs">
                        {client.email && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[150px]">{client.email}</span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate max-w-[150px]">
                          {[client.city, client.state].filter(Boolean).join(' - ') || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleCreateContractForClient(client)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                          title="Gerar Contrato para este cliente"
                        >
                          <FileSignature className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(client)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteClient(client.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
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
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-3xl bg-white dark:bg-[#121824] border border-slate-200/80 dark:border-white/[0.08] shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06] px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveClient} className="space-y-6 p-6">
              <div>
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
                  Dados principais
                </h4>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Tipo de cliente
                    </label>
                    <select
                      value={form.person_type}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          person_type: e.target.value as PersonType,
                          document: '',
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="PJ">Pessoa Jurídica</option>
                      <option value="PF">Pessoa Física</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {form.person_type === 'PF' ? 'CPF' : 'CNPJ'}
                    </label>
                    <input
                      type="text"
                      value={form.document}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          document: formatDocument(e.target.value, form.person_type),
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder={form.person_type === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {form.person_type === 'PF' ? 'Nome completo' : 'Razão social / Nome'}
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder={form.person_type === 'PF' ? 'Nome do cliente' : 'Razão social'}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nome fantasia
                    </label>
                    <input
                      type="text"
                      value={form.fantasy_name}
                      onChange={(e) => setForm({ ...form, fantasy_name: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
                  Contato
                </h4>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="cliente@empresa.com.br"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Celular</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: formatPhone(e.target.value) })
                      }
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="(19) 99999-9999"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Telefone Fixo</label>
                    <input
                      type="text"
                      value={form.phone_landline}
                      onChange={(e) =>
                        setForm({ ...form, phone_landline: formatPhone(e.target.value) })
                      }
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="(19) 3333-4444"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">WhatsApp</label>
                    <input
                      type="text"
                      value={form.whatsapp}
                      onChange={(e) =>
                        setForm({ ...form, whatsapp: formatPhone(e.target.value) })
                      }
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="(19) 99999-9999"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
                  Endereço
                </h4>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">CEP</label>
                    <input
                      type="text"
                      value={form.cep}
                      onChange={(e) => setForm({ ...form, cep: formatCep(e.target.value) })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="00000-000"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Logradouro
                    </label>
                    <input
                      type="text"
                      value={form.street}
                      onChange={(e) => setForm({ ...form, street: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Rua, avenida, etc."
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Número</label>
                    <input
                      type="text"
                      value={form.number}
                      onChange={(e) => setForm({ ...form, number: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="123"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Complemento
                    </label>
                    <input
                      type="text"
                      value={form.complement}
                      onChange={(e) => setForm({ ...form, complement: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Sala, bloco, etc."
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Bairro</label>
                    <input
                      type="text"
                      value={form.neighborhood}
                      onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Bairro"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Cidade</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Cidade"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">UF</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={form.state}
                      onChange={(e) =>
                        setForm({ ...form, state: e.target.value.toUpperCase() })
                      }
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="SP"
                    />
                  </div>
                </div>
              </div>

              {/* Responsável Legal / Representante para Assinatura */}
              <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Responsável Legal (Para Assinatura de Contratos)
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Preencha o representante legal que responderá pela assinatura dos contratos deste cliente.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nome Completo do Responsável Legal
                    </label>
                    <input
                      type="text"
                      value={form.legal_representative_name || ''}
                      onChange={(e) => setForm({ ...form, legal_representative_name: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Ex: Carlos Eduardo de Souza"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      CPF do Responsável Legal
                    </label>
                    <input
                      type="text"
                      value={form.legal_representative_cpf || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          legal_representative_cpf: formatDocument(e.target.value, 'PF'),
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono"
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Observações</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.04] px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                  placeholder="Informações adicionais sobre o cliente..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  Cancelar
                </button>

                {editingClient && (
                  <button
                    type="button"
                    onClick={() => {
                      closeModal();
                      handleCreateContractForClient(editingClient);
                    }}
                    className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs"
                    title="Abrir criação de contrato com os dados deste cliente"
                  >
                    <FileSignature className="w-3.5 h-3.5" />
                    Gerar Contrato
                  </button>
                )}

                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-indigo-500/25 transition"
                >
                  {editingClient ? 'Salvar alterações' : 'Cadastrar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}