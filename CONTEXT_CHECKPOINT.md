# Checkpoint de Contexto — LV Platform CRM & Central de Operações Multi-Tenant

**Atualizado em:** 19/10/2026  
**Diretório do Projeto:** `C:\Users\Usuario\Documents\projetos\ProjetoCRMMultitenet`  
**Banco de Dados Ativo (Produção):** `crm_db` (`https://bancosupa-appwrite.grtbdz.easypanel.host/v1` | Project ID: `6a6cac620021f4c64b3f`)

---

## 1. Resumo das Implementações e Arquitetura Unificada

### 1.1. Integração Completa do Novo Frontend (`src/central/`) com o Appwrite (`crm_db`)
- **Arquivos Principais:**
  - Repositório Multi-Tenant Appwrite: `src/central/services/mockApi.ts` (`appwriteRepository`)
  - Contexto de Aplicação & Sessão: `src/central/context/AppContext.tsx`
  - Layout & Navegação Unificada: `src/central/layouts/AppLayout.tsx`, `src/central/App.tsx`, `src/App.tsx`
- **O que foi feito:**
  - Substituída toda a camada `localStorage`/seed estático por persistência real no Appwrite (`crm_db`) com isolamento por empresa (`tenant_id`) e sincronização via **Appwrite Realtime**.
  - Provisionadas **7 novas coleções operacionais** no Appwrite (`crm_db`) com `documentSecurity: true` e índices `idx_tenant_id`:
    - `servers` (Servidores & Ambientes de Telefonia / PABX)
    - `services` (Serviços Contratados por Cliente)
    - `documents` (Documentos & Arquivos Operacionais)
    - `charges` (Cobranças & Lançamentos Financeiros)
    - `invoices` (Notas Fiscais)
    - `events` (Agenda Operacional & Visitas Técnicas)
    - `activities` (Trilha de Auditoria e Atividades da Central)
  - Estendida a coleção `support_tickets` no `crm_db` com `client_id`, `server_id`, `due_at`, `messages_json`, `history_json` e `attachments_json`.
  - Mapeamento bidirecional completo entre `clients` (com contatos codificados de forma transparente em `[CONTACTS_JSON: ...]` e representante legal em `[REP_LEGAL: ...]`), `users_hydra` (Equipe Operacional) e `tenants` (`settings_json` para categorias de tickets, tipos de serviços e dados da empresa).

### 1.2. Organização de Menus, Nomes e Categorias (`AppLayout.tsx` & `tenantUsersApi.ts`)
- A navegação lateral e os títulos de módulos foram padronizados e organizados em **6 categorias claras**:
  1. **VISÃO GERAL & ATENDIMENTO**
     - `Visão Geral` (`/`)
     - `Clientes & Contatos` (`/clientes`)
     - `Tickets & Chamados` (`/tickets`)
     - `Agenda Operacional` (`/agenda`)
     - `Agenda Telefônica` (`/catalogo`)
  2. **COMERCIAL & VENDAS**
     - `Funil de Vendas (CRM)` (`/pipeline`)
     - `Propostas Comerciais` (`/propostas`)
     - `Contratos & Assinaturas` (`/contratos-crm`)
     - `Catálogo de Produtos` (`/itens`)
  3. **OPERAÇÕES & INFRAESTRUTURA**
     - `Servidores & PABX` (`/servidores`)
     - `Serviços Contratados` (`/servicos`)
     - `Monitoramento` (`/monitoramento`)
     - `Documentos & Arquivos` (`/documentos`)
  4. **FINANCEIRO**
     - `Cobranças & Notas` (`/financeiro`)
  5. **ADMINISTRAÇÃO & SISTEMA**
     - `Equipe & Acessos` (`/usuarios`)
     - `Automações & Webhooks` (`/automacoes`)
     - `Integrações` (`/integracoes`)
     - `Configurações` (`/configuracoes`)
  6. **GOVERNANÇA SUPERADMIN** *(exclusivo SuperAdmin)*
     - `Empresas (Tenants)` (`/empresas`)
     - `Políticas de Escrita` (`/politicas`)

### 1.3. Motor de Políticas (`WritePolicyEngine`) e Isolamento Multi-Tenant
- **Arquivos:** `src/lib/tenantDatabases.ts`, `server/backendApiBridge.ts`, `server/server.cjs`, `server/writePolicyEngine.ts`, `server/writePolicyEngine.cjs`
- **O que foi feito:**
  - Todas as **34 coleções** do `crm_db` estão mapeadas e protegidas pelo `TENANT_AWARE_COLLECTIONS` e pelo `WritePolicyEngine` (`KNOWN_MODULES` e `COLLECTION_MODULE_MAP`).
  - Atualização da própria empresa (`tenants`) liberada com segurança na API Bridge para administradores da própria organização (`admin`, `owner`) e `superadmin`.

---

## 2. Empresas Provisionadas no Appwrite (`crm_db`)

| ID do Tenant / Team | Slug | Domínio / Acesso Local | Status |
| :--- | :--- | :--- | :--- |
| `tenant_default` | `matriz` | `matriz.lvplataform.com.br` / `?tenant=matriz` | `active` |
| `tenant_empresaa` | `empresaa` | `empresaa.lvplataform.com.br` / `?tenant=empresaa` | `active` |
| `tenant_empresab` | `empresab` | `empresab.lvplataform.com.br` / `?tenant=empresab` | `active` |

- **SuperAdmin Oficial (Team `superadmins`):** `lucasg.nunes19@gmail.com` (ID: `6a6ce2e8003b32ef7609`)

---

## 3. Comandos Úteis para Execução

- **Iniciar em Desenvolvimento (Frontend + API Bridge acoplado):**
  ```bash
  npm run dev
  ```
  Acesse em: `http://localhost:5173/`

- **Validar Tipagem TypeScript e Build de Produção:**
  ```bash
  npm run typecheck
  npm run build
  ```
