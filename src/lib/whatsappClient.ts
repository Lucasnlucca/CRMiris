import { api } from './api';
import { databases } from './appwrite';
import { Query, ID } from 'appwrite';

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';

export interface WhatsappContact {
  id: string;
  phone_number: string;
  name: string;
  profile_picture: string | null;
  is_group: boolean;
  last_message_at: string;
  last_message?: WhatsappMessage | null;
  unread_count?: number;
}

export interface WhatsappMessage {
  id: string;
  message_id: string;
  contact_id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  message_type: string;
  media_url: string | null;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  contact?: WhatsappContact;
}

export interface WhatsappConfig {
  id: string;
  instance_name: string;
  apikey: string;
  base_url: string;
  is_active: boolean;
}

export const whatsappClient = {
  async getContacts(): Promise<WhatsappContact[]> {
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, 'whatsapp_contacts', [
        Query.orderDesc('last_message_at'),
        Query.limit(100),
      ]);
      return documents.map((d: any) => ({
        id: d.$id,
        phone_number: d.phone_number || d.phone || '',
        name: d.name || d.phone_number || d.phone || 'Contato',
        profile_picture: d.profile_pic || d.profile_picture || null,
        is_group: false,
        last_message_at: d.last_message_at || d.$updatedAt,
        unread_count: d.unread_count || 0,
      }));
    } catch (err) {
      console.error('Error fetching contacts:', err);
      return [];
    }
  },

  async getMessages(contactId: string): Promise<WhatsappMessage[]> {
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, 'whatsapp_messages', [
        Query.equal('contact_id', contactId),
        Query.orderDesc('timestamp'),
        Query.limit(200),
      ]);
      const sorted = [...documents].reverse();
      return sorted.map((d: any) => ({
        id: d.$id,
        message_id: d.message_id || d.$id,
        contact_id: d.contact_id,
        direction: d.direction || 'outbound',
        content: d.content || d.text || '',
        message_type: d.message_type || 'text',
        media_url: d.media_url || null,
        status: d.status || 'sent',
        timestamp: d.timestamp || d.$createdAt,
      }));
    } catch (err) {
      console.error('Error fetching messages:', err);
      return [];
    }
  },

  async sendMessage(
    phoneNumber: string,
    content: string,
    messageType: string = 'text',
    mediaUrl?: string
  ): Promise<unknown> {
    const { documents: configs } = await databases.listDocuments(DATABASE_ID, 'whatsapp_config', [
      Query.equal('is_active', true),
      Query.limit(1),
    ]);
    if (configs.length === 0) throw new Error('WhatsApp não configurado.');
    const config = configs[0];
    const baseUrl = (config.base_url || '').replace(/\/$/, '');
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = `55${cleanPhone}`;
    }

    const checkRes = await fetch(`${baseUrl}/chat/whatsappNumbers/${config.instance_name}`, {
      method: 'POST',
      headers: { 'apikey': config.apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers: [cleanPhone] })
    });
    const checkData = await checkRes.json().catch(() => []);
    if (!checkData || !checkData.length || !checkData[0].exists) {
      throw new Error('Este número não possui WhatsApp ativo ou está incorreto.');
    }
    const finalNumber = checkData[0].jid.split('@')[0];

    const res = await fetch(`${baseUrl}/message/sendText/${config.instance_name}`, {
      method: 'POST',
      headers: {
        'apikey': config.apikey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: finalNumber,
        text: content,
        options: {
          delay: 1200,
          presence: 'composing',
          linkPreview: false
        }
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.response?.message || err.message || `Erro Evolution: ${res.status}`);
    }
    return res.json();
  },

  async getConfig(): Promise<WhatsappConfig | null> {
    try {
      const { documents } = await databases.listDocuments(DATABASE_ID, 'whatsapp_config', [
        Query.equal('is_active', true), Query.limit(1)
      ]);
      return documents.length > 0 ? (documents[0] as unknown as WhatsappConfig) : null;
    } catch (error) {
      console.error('Error fetching config:', error);
      return null;
    }
  },

  async saveConfig(config: {
    instance_name: string;
    apikey: string;
    base_url: string;
  }): Promise<WhatsappConfig> {
    const { documents } = await databases.listDocuments(DATABASE_ID, 'whatsapp_config', [
      Query.equal('instance_name', config.instance_name), Query.limit(1)
    ]);
    const existing = documents.length > 0 ? documents[0] : null;

    if (existing) {
      const updated = await databases.updateDocument(DATABASE_ID, 'whatsapp_config', existing.$id, {
        apikey: config.apikey, base_url: config.base_url, is_active: true
      });
      return updated as unknown as WhatsappConfig;
    } else {
      const created = await databases.createDocument(DATABASE_ID, 'whatsapp_config', ID.unique(), {
        instance_name: config.instance_name,
        apikey: config.apikey,
        base_url: config.base_url,
        is_active: true,
      });
      return created as unknown as WhatsappConfig;
    }
  },

  subscribeToMessages(contactId: string, callback: (message: WhatsappMessage) => void): () => void {
    let lastId: string | null = null;
    const interval = setInterval(async () => {
      try {
        const queries = [Query.equal('contact_id', contactId)];
        if (lastId) queries.push(Query.orderAsc('timestamp'));
        else queries.push(Query.orderDesc('timestamp'), Query.limit(1));
        const { documents } = await databases.listDocuments(DATABASE_ID, 'whatsapp_messages', queries);
        const messages = documents.map(d => ({ ...d, id: d.$id } as unknown as WhatsappMessage));
        if (messages && messages.length > 0) {
          const latest = messages[messages.length - 1];
          if (lastId === null) {
            lastId = latest.id;
          } else if (latest.id !== lastId) {
            lastId = latest.id;
            callback(latest);
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  },

  subscribeToContacts(callback: (contact: WhatsappContact) => void): () => void {
    let known: Set<string> | null = null;
    const interval = setInterval(async () => {
      try {
        const { documents } = await databases.listDocuments(DATABASE_ID, 'whatsapp_contacts', [
          Query.orderDesc('last_message_at'), Query.limit(50)
        ]);
        const contacts = documents.map(d => ({ ...d, id: d.$id } as unknown as WhatsappContact));
        if (!contacts) return;
        if (known === null) {
          known = new Set(contacts.map(c => c.id));
          return;
        }
        contacts.forEach(c => {
          if (!known!.has(c.id)) {
            known!.add(c.id);
            callback(c);
          }
        });
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  },
};
