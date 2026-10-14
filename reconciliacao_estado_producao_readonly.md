# Reconciliação do Estado Real de Produção — Iris Horizon CRM (Read-Only)

> **Documento:** `reconciliacao_estado_producao_readonly.md`  
> **Classificação:** Relatório de Auditoria Forense e Investigação de Runtime  
> **Modo Operacional:** Estritamente **READ-ONLY** (Zero Mutações, Zero Escritas, Zero Alterações de Permissão ou Ambiente)

---

## 1. Data e Hora da Verificação

- **Timestamp da Auditoria (ISO-8601):** `2026-10-13T21:05:00.000Z`
- **Data e Hora Local:** 13 de Outubro de 2026, 18:05 (Horário de Brasília, UTC-3)
- **Ambiente Auditado:**
  - **EasyPanel Production Host:** `https://sites-lvplataform.grtbdz.easypanel.host`
  - **Appwrite BaaS Oficial:** `https://bancosupa-appwrite.grtbdz.easypanel.host/v1`
  - **Database Produção:** `crm_db` (`PROJECT_ID: 6a6cac620021f4c64b3f`)

---

## 2. Commit Ativo no Runtime e Evidência Utilizada

### 2.1 Diagnóstico do Runtime Implantado no EasyPanel
Após investigação por análise de headers HTTP, timestamps de compilação dos assets estáticos e testes de sondagem de comportamento de rotas, confirma-se:

> [!WARNING]
> **O contêiner do EasyPanel NÃO está executando os commits recentes da Fase 5H (`7fca02b`, `752ce13` ou `6758e89`).**  
> O EasyPanel encontra-se implantado e congelado no commit **`d226e40`** (12 de Outubro de 2026, 16:52 UTC-3 / 19:52 GMT).

### 2.2 Evidências Técnicas Irrefutáveis

1. **Timestamps e ETags dos Assets Estáticos Servidos pelo Nginx:**
   Uma inspeção via método HTTP `HEAD` em todos os assets de produção retornou:
   - `/index.html`: `Last-Modified: Mon, 12 Oct 2026 19:57:54 GMT`, `ETag: "6acd3bc2-2f1"`
   - `/assets/index-BgJAn68v.js`: `Last-Modified: Mon, 12 Oct 2026 19:57:54 GMT`, `ETag: "6acd3bc2-14fe50"`
   - `/assets/index-BQDP0rXS.css`: `Last-Modified: Mon, 12 Oct 2026 19:57:54 GMT`, `ETag: "6acd3bc2-1d8fd"`
   - `/favicon.png`: `Last-Modified: Mon, 12 Oct 2026 19:57:54 GMT`, `ETag: "6acd3bc2-7b16"`

2. **Correlação Cronológica com o Histórico Git:**
   - Commit `d226e40` (`fix(security): enforce exact superadmin team identity and remove prefix heuristics`): comitado em `2026-10-12 19:52:26 GMT` (16:52:26 UTC-3). O build do EasyPanel ocorreu às `19:57:54 GMT` (exatamente 5 minutos e 28 segundos após o commit `d226e40`).
   - O commit subsequente `7fca02b` (`feat(security): integrate write policy engine in deny-all mode for production`) foi comitado apenas em `2026-10-12 22:12:48 GMT` (19:12:48 UTC-3), mais de duas horas após o último build do EasyPanel.
   - Os commits `752ce13`, `138d82d` e `6758e89` encontram-se **locais** (a branch local está 3 commits à frente de `origin/main`), nunca tendo sido enviados ao GitHub e, portanto, impossibilitados de serem construídos pelo EasyPanel.

3. **Inexistência de Módulos e Rotas Recentes no Contêiner:**
   - Requisição a `/api/admin/policy/status` (introduzida no commit `6758e89`): retorna `HTTP 404 {"error":"Endpoint não localizado"}`.
   - Resposta do `/api/crm/write`: quando chamado com dados inválidos para `crm_db`, retorna a mensagem textual legada da Fase 5F:  
     `{"success":false,"error":"[FAIL-CLOSED GUARD] Escritas de negócio em crm_db estão desabilitadas na Fase 5F. Mecanismo canário inativo e sem autorização expressa.","code":403}`  
     Essa string pertencia ao arquivo `server/server.cjs` antes da sua substituição pelo `writePolicyEngine.cjs` no commit `752ce13`.

### 2.3 Matriz de Componentes no Runtime

| Componente | Estado no EasyPanel (Produção) | Estado no Repositório Local |
| :--- | :---: | :---: |
| `server/writePolicyEngine.cjs` | ❌ **Ausente** | ✅ Presente |
| Correção exata do Team `superadmins` | ✅ **Presente** (desde commit `d226e40`) | ✅ Presente |
| Política `PROD_CLIENTS_RULES` | ❌ **Ausente** | ✅ Presente |
| Condicionamento por `ENABLE_PROD_CLIENTS_MODULE` | ❌ **Ausente** | ✅ Presente |
| Guard Legado da Fase 5F | 🔒 **Ativo e Bloqueante** | 🔄 Desacoplado / Delegado ao Engine |
| Rotas de Controle SuperAdmin (`/api/admin/policy/*`) | ❌ **Ausente** (HTTP 404) | ✅ Presente |

---

## 3. Flags Efetivas no Runtime

| Variável / Flag | Valor Efetivo no EasyPanel | Valor Local (`.env.local`) | Comportamento Observado |
| :--- | :---: | :---: | :--- |
| `ENABLE_PROD_CLIENTS_MODULE` | **Não Implementada / Desconhecida** | `false` | Não existe no código do runtime implantado (`d226e40`). Não tem efeito no contêiner atual. |
| `ALLOW_PROD_BUSINESS_WRITES` | `false` | `false` | O guard legado da Fase 5F avalia como inativo e bloqueia qualquer escrita em `crm_db`. |
| `CANARY_PROD_WRITE_ENABLED` | `false` | `false` | O guard legado da Fase 5F avalia como inativo e bloqueia qualquer escrita em `crm_db`. |

---

## 4. Conferência do Banco de Produção (`crm_db`)

- **BaaS Endpoint:** `https://bancosupa-appwrite.grtbdz.easypanel.host/v1`
- **Database ID:** `crm_db`
- **Total de Coleções Existentes:** **27 coleções**
- **Total Geral de Documentos:** **Exatamente 859 documentos**

### 4.1 Inventário Completo por Coleção

| # | Collection ID | Nome da Coleção | Quantidade de Documentos | Natureza dos Registros |
| :---: | :--- | :--- | :---: | :--- |
| 1 | `whatsapp_messages` | `whatsapp_messages` | **563** | Negócio (legítimo) |
| 2 | `pipeline_history` | `pipeline_history` | **208** | Negócio (legítimo) |
| 3 | `user_menu_permissions` | `user_menu_permissions` | **33** | Negócio / Permissões de UI |
| 4 | `messages` | `messages` | **24** | Negócio (legítimo) |
| 5 | `crm_proposal_items` | `crm_proposal_items` | **9** | Negócio (legítimo) |
| 6 | `whatsapp_contacts` | `whatsapp_contacts` | **4** | Negócio (legítimo) |
| 7 | `pipeline_columns` | `pipeline_columns` | **3** | Negócio (legítimo) |
| 8 | `pipeline_activities` | `pipeline_activities` | **3** | Negócio (legítimo) |
| 9 | `users_hydra` | `users_hydra` | **3** | Negócio (legítimo) |
| 10 | `clients` | `clients` | **2** | 1 legítimo preexistente + 1 sintético piloto |
| 11 | `notifications` | `notifications` | **2** | 2 sintéticos canários (Fase 5G) |
| 12 | `support_tickets` | `support_tickets` | **2** | Negócio (legítimo) |
| 13 | `pipeline_deals` | `pipeline_deals` | **1** | Negócio (legítimo) |
| 14 | `whatsapp_config` | `whatsapp_config` | **1** | Negócio (legítimo) |
| 15 | `tenants` | `Tenants / Empresas` | **1** | Negócio (`tenant_default`) |
| 16 | `pipeline_comments` | `pipeline_comments` | **0** | Vazia |
| 17 | `pipeline_checklist` | `pipeline_checklist` | **0** | Vazia |
| 18 | `pipeline_attachments` | `pipeline_attachments` | **0** | Vazia |
| 19 | `crm_proposals` | `crm_proposals` | **0** | Vazia |
| 20 | `crm_items` | `crm_items` | **0** | Vazia |
| 21 | `message_templates` | `message_templates` | **0** | Vazia |
| 22 | `call_history` | `call_history` | **0** | Vazia |
| 23 | `sip_config` | `sip_config` | **0** | Vazia |
| 24 | `automation_config` | `automation_config` | **0** | Vazia |
| 25 | `integration_configs` | `integration_configs` | **0** | Vazia |
| 26 | `phonebook` | `Phonebook` | **0** | Vazia |
| 27 | `crm_contracts` | `Contratos Comerciais` | **0** | Vazia |
| **TOTAL** | — | — | **859** | — |

---

## 5. Resultado da Verificação dos Três IDs Sintéticos

Os três registros sintéticos foram inspecionados em modo estritamente read-only:

| Document ID | Coleção Alvo | Status de Existência | Data de Criação (UTC) | Data de Atualização (UTC) | Tenant ID | Permissões Físicas Atribuídas |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| `canary_prod_test_20261012_001` | `notifications` | ✅ **EXISTE** | `2026-10-12T21:04:34Z` | `2026-10-12T21:04:34Z` | `tenant_default` | `read("team:tenant_default")`, `read("team:superadmins")` |
| `canary_probe_post_lockdown` | `notifications` | ✅ **EXISTE** | `2026-10-12T21:06:22Z` | `2026-10-12T21:06:22Z` | `tenant_default` | `read("team:tenant_default")`, `read("team:superadmins")` |
| `client_pilot_p5h4_20261013_001` | `clients` | ✅ **EXISTE** | `2026-10-13T13:12:46Z` | `2026-10-13T13:12:47Z` | `tenant_default` | `read("team:tenant_default")`, `read("team:superadmins")` |

> [!NOTE]
> **Detalhes do Cliente Sintético:**
> - `$id`: `client_pilot_p5h4_20261013_001`
> - Nome técnico: *"Cliente Sintético Piloto Fase 5H.4 (Não Contém Dados Reais)"*
> - O registro **permanece gravado no banco de produção**. Ele foi devidamente atualizado durante o teste do piloto (conforme `$updatedAt` 1 segundo após `$createdAt`) e **não foi deletado nem revertido**.

---

## 6. Política Efetivamente Carregada e Estado dos Guards

### 6.1 No Runtime de Produção (EasyPanel)
- O contêiner implantado executa o `server.cjs` do commit `d226e40`.
- **Modo Ativo:** **Deny-All Absoluto via Guard Legado da Fase 5F**.
- Qualquer solicitação direcionada a `crm_db` com `ALLOW_PROD_BUSINESS_WRITES=false` e `CANARY_PROD_WRITE_ENABLED=false` é bloqueada imediatamente no passo 2 da requisição com `HTTP 403`:
  `[FAIL-CLOSED GUARD] Escritas de negócio em crm_db estão desabilitadas na Fase 5F. Mecanismo canário inativo e sem autorização expressa.`
- O `WritePolicyEngine` **não está presente** no contêiner em produção.
- `create`, `update` e `delete` estão todos bloqueados sumariamente pelo guard legado.

### 6.2 No Repositório de Código-Fonte Local
- No commit `752ce13` e `6758e89`, o guard legado foi removido e a governança transferida para o `WritePolicyEngine`.
- A especificação `PROD_CLIENTS_RULES` foi criada com as seguintes salvaguardas:
  - `create`: permitido apenas para roles `admin`, `superadmin` e `agent` no tenant `tenant_default`.
  - `update`: permitido apenas para roles `admin`, `superadmin` e `agent` no tenant `tenant_default`.
  - `delete`: **estritamente bloqueado** (ausente das tuplas permitidas).
  - Outros módulos (`pipeline_deals`, `support_tickets`, etc.): **estritamente bloqueados** (ausentes das tuplas).
  - Determinação de tenant e permissões físicas: forçada autoritativamente no backend (`tenant_default`, `superadmins`).
  - Flag de ativação: `ENABLE_PROD_CLIENTS_MODULE`. Quando `false` (valor atual em `.env.local`), o motor rejeita qualquer escrita em `crm_db` com `HTTP 403 [FAIL-CLOSED GUARD] Escritas de negócio em crm_db estão desabilitadas (modo Deny-All ativo).`.

---

## 7. Reconciliação das Divergências Encontradas

### 7.1 Divergência na Contagem de Documentos (858 vs 859)
A investigação revelou com exatidão a causa matemática e operacional da discrepância:

1. **A Paginação Padrão da API do Appwrite:**
   - O método `Databases.listCollections('crm_db')` do Appwrite possui um limite de página padrão de **25 coleções** se nenhum parâmetro `Query.limit()` for informado.
   - O banco `crm_db` possui **27 coleções**. As duas últimas coleções na listagem são:
     - `crm_contracts` (índice 26): 0 documentos.
     - `tenants` (índice 27): **1 documento** (`tenant_default`).
2. **Impacto nos Relatórios Históricos:**
   - Scripts que iteraram pelas coleções utilizando a listagem padrão sem paginação somaram apenas as primeiras 25 coleções, totalizando **858 documentos**.
   - Scripts que iteraram especificando `Query.limit(100)` ou iterando por página contabilizaram as 27 coleções completas, totalizando **859 documentos**.
3. **Equação Matemática Final:**
   $$\text{Total Real} = \text{Total (25 primeiras coleções)} + \text{Documentos em } tenants = 858 + 1 = 859$$
   - 856 documentos de negócio legítimos preexistentes desde o snapshot baseline T-0.
   - 2 documentos sintéticos canários em `notifications`.
   - 1 documento sintético de piloto em `clients`.
   - **Total = 859**.

### 7.2 Execução do Piloto da Fase 5H.4 vs Estado do EasyPanel
- **O piloto aconteceu?** **SIM.** O documento `client_pilot_p5h4_20261013_001` foi criado e editado em `crm_db.clients` em 13/10/2026 às 13:12 UTC.
- **O piloto foi revertido no banco?** **NÃO.** O registro continua íntegro em `crm_db.clients`.
- **Como o piloto foi executado se o EasyPanel não tinha o código?**
  O script de teste [`scripts/test-phase5h4-pilot-production.cjs`](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/scripts/test-phase5h4-pilot-production.cjs) instanciou o servidor `server.cjs` localmente (porta 3114) com a biblioteca do `writePolicyEngine.cjs` local e comunicou-se diretamente com o endpoint do Appwrite BaaS (`https://bancosupa-appwrite.grtbdz.easypanel.host/v1`) via chave mestra `APPWRITE_API_KEY`. O teste do piloto **não transitou pelo contêiner EasyPanel**.
- **O código do piloto foi implantado em produção?** **NÃO.** Os commits `752ce13` e `6758e89` estão apenas no repositório local e nunca foram enviados ao branch remoto `origin/main` nem compilados no EasyPanel.

---

## 8. Limitações de Acesso e Verificações Inconclusivas

1. **Acesso ao Contêiner Remoto:** Não há acesso SSH ou terminal direto ao contêiner EasyPanel; a identificação do commit ativo foi realizada por engenharia reversa via HTTP (ETags, `Last-Modified` de assets, rotas existentes e strings de erro retornadas). Essa evidência é conclusiva.
2. **Ambiente Estritamente Read-Only:** Nenhuma operação de escrita foi submetida em produção nesta verificação. O comportamento dos guards foi comprovado enviando payloads vazios ou inválidos para `/api/crm/write` sem gerar mutações.
3. **Preservação de Registros:** Nenhum dos três documentos sintéticos foi alterado ou excluído.

---

## 9. Conclusão Objetiva

> [!IMPORTANT]
> **ESTADO REAL CONFIRMADO: DENY-ALL ABSOLUTO LEGADO EM PRODUÇÃO.**
>
> 1. **No Banco de Dados (`crm_db`):** Existem exatamente **859 documentos** distribuídos em 27 coleções. Os três registros sintéticos (`canary_prod_test_20261012_001`, `canary_probe_post_lockdown` e `client_pilot_p5h4_20261013_001`) existem e permanecem preservados.
> 2. **No Runtime do EasyPanel:** O contêiner de produção está operando no commit `d226e40` sob a trava legada da Fase 5F. **Nenhuma escrita em `crm_db` é aceita pelo servidor de produção.**
> 3. **No Write Policy Engine:** O novo motor de políticas e a liberação controlada de Clientes **não estão implantados em produção**. Encontram-se apenas no código local do repositório.
> 4. **Próximos Passos:** Antes de qualquer liberação do módulo Clientes, será necessário decidir sobre o deploy do código recente no EasyPanel e sobre a higienização ou manutenção dos registros sintéticos existentes.
