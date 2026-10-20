import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Pencil, Trash2, X, Phone, Smartphone, MessageSquare } from 'lucide-react';
import { databases } from '../lib/appwrite';
import { Query, ID } from 'appwrite';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
const COLLECTION_ID = 'phonebook';

interface PhonebookEntry {
  id: string;
  name: string;
  phone: string;
  phone_landline: string;
  whatsapp: string;
  notes: string;
  created_at: string;
}

type FormData = {
  name: string;
  phone: string;
  phone_landline: string;
  whatsapp: string;
  notes: string;
};

const initialForm: FormData = {
  name: '',
  phone: '',
  phone_landline: '',
  whatsapp: '',
  notes: '',
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function Phonebook() {
  const [entries, setEntries] = useState<PhonebookEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PhonebookEntry | null>(null);
  const [form, setForm] = useState<FormData>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const { documents } = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [Query.orderAsc('name'), Query.limit(500)]
      );

      const mapped = documents.map(d => ({
        ...d,
        id: d.$id,
        created_at: d.$createdAt,
      })) as unknown as PhonebookEntry[];

      setEntries(mapped);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return entries;
    return entries.filter((e) =>
      [e.name, e.phone, e.phone_landline, e.whatsapp, e.notes]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [entries, searchTerm]);

  function openNew() {
    setEditing(null);
    setForm(initialForm);
    setShowModal(true);
  }

  function openEdit(entry: PhonebookEntry) {
    setEditing(entry);
    setForm({
      name: entry.name,
      phone: entry.phone,
      phone_landline: entry.phone_landline,
      whatsapp: entry.whatsapp,
      notes: entry.notes,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setForm(initialForm);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Informe o nome do contato.');
      return;
    }
    if (!form.phone.trim() && !form.phone_landline.trim()) {
      alert('Informe pelo menos um telefone (celular ou fixo).');
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      phone_landline: form.phone_landline.trim(),
      whatsapp: form.whatsapp.trim(),
      notes: form.notes.trim(),
    };

    try {
      if (editing) {
        await databases.updateDocument(DATABASE_ID, COLLECTION_ID, editing.id, payload);
      } else {
        await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), payload);
      }
      await loadEntries();
      closeModal();
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: PhonebookEntry) {
    if (!confirm(`Excluir o contato "${entry.name}"?`)) return;
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, entry.id);
      await loadEntries();
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir.');
    }
  }

  if (showModal) {
    return (
      <div className="space-y-5">
        <div>
          <button
            type="button"
            onClick={closeModal}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition shadow-2xs"
          >
            ← Voltar ao catálogo de contatos
          </button>
        </div>

        <div className="w-full rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="border-b border-gray-100 dark:border-gray-700 px-6 py-5">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Catálogo de Contatos
            </span>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
              {editing ? 'Editar Contato' : 'Novo Contato'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Preencha os dados telefônicos e observações do contato corporativo.
            </p>
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nome *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm"
                placeholder="Nome do contato"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Celular
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm"
                  placeholder="(19) 99999-9999"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Telefone Fixo
                </label>
                <input
                  type="text"
                  value={form.phone_landline}
                  onChange={(e) => setForm({ ...form, phone_landline: formatPhone(e.target.value) })}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm"
                  placeholder="(19) 3333-4444"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  WhatsApp
                </label>
                <input
                  type="text"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: formatPhone(e.target.value) })}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm"
                  placeholder="(19) 99999-9999"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Observação
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm"
                  placeholder="Ex: Fornecedor, Parceiro..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-gray-200 dark:border-gray-600 px-5 py-2.5 font-medium text-gray-700 dark:text-gray-300 text-sm transition hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-blue-600 px-5 py-2.5 font-medium text-white text-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Adicionar contato'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Catálogo de Contatos</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Agenda e catálogo corporativo de contatos e parceiros.
          </p>
        </div>

        <button
          onClick={openNew}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Novo Contato
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar contato..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} contato(s)
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
            <Phone className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-600 dark:text-gray-300 font-medium">
              Nenhum contato salvo.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Clique em <strong>Novo Contato</strong> para adicionar um numero.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-4 py-3.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {entry.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                    {entry.name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {entry.phone && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Smartphone className="w-3 h-3" /> {entry.phone}
                      </span>
                    )}
                    {entry.phone_landline && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Phone className="w-3 h-3" /> {entry.phone_landline}
                      </span>
                    )}
                    {entry.whatsapp && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <MessageSquare className="w-3 h-3" /> {entry.whatsapp}
                      </span>
                    )}
                    {entry.notes && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 italic truncate max-w-[150px]">
                        {entry.notes}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(entry)}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
