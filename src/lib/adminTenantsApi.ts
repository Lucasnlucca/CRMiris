/**
 * Cliente de API Frontend para Gestão e Provisionamento de Empresas (SuperAdmin)
 *
 * Comunica-se exclusivamente com os endpoints autoritativos do servidor:
 * - GET /api/admin/tenants
 * - POST /api/admin/tenants
 * - PUT /api/admin/tenants/:id
 */

import { getAuthoritativeAuthHeaders } from './appwrite';
import type { Tenant } from '../context/TenantContext';

export interface CreateTenantPayload {
  name: string;
  slug: string;
  trade_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  status?: 'active' | 'suspended' | 'trial' | 'cancelled';
  plan?: 'free' | 'starter' | 'pro' | 'enterprise';
  logo_url?: string;
  primary_color?: string;
  address?: string;
  settings_json?: string;
  databaseId?: string;
}

export interface UpdateTenantPayload {
  name?: string;
  slug?: string;
  trade_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  status?: 'active' | 'suspended' | 'trial' | 'cancelled';
  plan?: 'free' | 'starter' | 'pro' | 'enterprise';
  logo_url?: string;
  primary_color?: string;
  address?: string;
  settings_json?: string;
  databaseId?: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  return await getAuthoritativeAuthHeaders();
}

export async function fetchAdminTenants(databaseId?: string): Promise<{
  success: boolean;
  tenants: Tenant[];
  total: number;
  databaseId: string;
}> {
  const headers = await getAuthHeaders();
  const query = databaseId ? `?databaseId=${encodeURIComponent(databaseId)}` : '';
  const res = await fetch(`/api/admin/tenants${query}`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao carregar empresas.`);
  }

  return json;
}

export async function createAdminTenant(payload: CreateTenantPayload): Promise<{
  success: boolean;
  tenant: Tenant;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/tenants', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao provisionar empresa.`);
  }

  return json;
}

export async function updateAdminTenant(tenantId: string, payload: UpdateTenantPayload): Promise<{
  success: boolean;
  tenant: Tenant;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/admin/tenants/${encodeURIComponent(tenantId)}`, {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao atualizar empresa.`);
  }

  return json;
}

export async function deleteAdminTenant(tenantId: string, databaseId?: string): Promise<{
  success: boolean;
  tenantId: string;
  message: string;
}> {
  const headers = await getAuthHeaders();
  const query = databaseId ? `?databaseId=${encodeURIComponent(databaseId)}` : '';
  const res = await fetch(`/api/admin/tenants/${encodeURIComponent(tenantId)}${query}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro HTTP ${res.status} ao excluir servidor/empresa.`);
  }

  return json;
}

