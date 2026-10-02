import { Client, Account, ID, Query } from 'appwrite';
import { databases } from './appwrite';

const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const appwriteUrl = isLocalhost
    ? (import.meta.env.VITE_APPWRITE_URL || 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1')
    : (typeof window !== 'undefined' ? `${window.location.origin}/v1` : 'https://bancosupa-appwrite.grtbdz.easypanel.host/v1');
const appwriteProjectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '6a6cac620021f4c64b3f';

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: string;
}

export interface UserHydra {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_online?: boolean;
  created_at: string;
}

/**
 * Cria um usuário no Appwrite Auth e na coleção users_hydra
 */
export async function createNewUser(data: CreateUserData): Promise<UserHydra> {
  const { name, email, password, role } = data;
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();

  // 1. Criar conta no Appwrite Auth usando cliente limpo (sem sobrepor a sessão do admin)
  const guestClient = new Client().setEndpoint(appwriteUrl).setProject(appwriteProjectId);
  const guestAccount = new Account(guestClient);
  
  let authUser: any;
  try {
    authUser = await guestAccount.create(ID.unique(), cleanEmail, password, cleanName);
  } catch (err: any) {
    if (err?.code === 409 || err?.message?.includes('already exists')) {
      throw new Error('Já existe um usuário cadastrado com este e-mail.');
    }
    throw new Error(err?.message || 'Erro ao registrar usuário no sistema de autenticação.');
  }

  const userId = authUser.$id;
  const now = new Date().toISOString();

  // 2. Criar registro do usuário na coleção users_hydra
  const userDoc = await databases.createDocument(
    DATABASE_ID,
    'users_hydra',
    userId,
    {
      name: cleanName,
      email: cleanEmail,
      role: role || 'colaborador',
      is_active: true,
      is_online: false,
      created_at: now,
      last_seen: now,
    }
  );

  return {
    id: userDoc.$id,
    name: userDoc.name,
    email: userDoc.email,
    role: userDoc.role,
    is_active: userDoc.is_active,
    is_online: userDoc.is_online,
    created_at: userDoc.created_at,
  };
}

/**
 * Atualiza o status ativo/inativo de um usuário
 */
export async function toggleUserStatus(userId: string, currentStatus: boolean): Promise<boolean> {
  const newStatus = !currentStatus;
  await databases.updateDocument(DATABASE_ID, 'users_hydra', userId, {
    is_active: newStatus,
  });
  return newStatus;
}

/**
 * Exclui um usuário da coleção users_hydra e limpa suas permissões
 */
export async function deleteUser(userId: string): Promise<void> {
  // Excluir permissões de menu associadas
  try {
    const { documents } = await databases.listDocuments(DATABASE_ID, 'user_menu_permissions', [
      Query.equal('user_id', userId),
      Query.limit(100),
    ]);
    await Promise.all(
      documents.map((d) => databases.deleteDocument(DATABASE_ID, 'user_menu_permissions', d.$id))
    );
  } catch (err) {
    console.warn('[UserManagement] Erro ao remover permissões do usuário:', err);
  }

  // Excluir documento do usuário
  await databases.deleteDocument(DATABASE_ID, 'users_hydra', userId);
}
