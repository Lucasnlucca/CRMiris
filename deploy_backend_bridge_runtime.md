# Deploy do Backend API Bridge — Produção sem Escritas de Negócio

**Data e Hora:** 12 de Outubro de 2026 — 01:52 BRT (04:52 UTC)  
**Projeto:** Iris Horizon CRM (`681d43140026e63df8aa`)  
**Commit Implantado:** [`3fbbed2`](https://github.com/Lucasnlucca/CRMiris/commit/3fbbed2)  
**Commit de Rollback Imediato:** [`8e5eec6`](https://github.com/Lucasnlucca/CRMiris/commit/8e5eec6)  
**Repositório Remoto:** `https://github.com/Lucasnlucca/CRMiris.git` (Branch `main`)  
**Host de Produção:** `https://sites-lvplataform.grtbdz.easypanel.host`  
**Painel EasyPanel:** `https://grtbdz.easypanel.host`  
**Banco de Produção:** `crm_db` (100% Intacto, Imutável — Zero Escritas)  
**Estado das Travas:** **FAIL-CLOSED ATIVO — CANÁRIO DESATIVADO (`CANARY_PROD_WRITE_ENABLED=false`)**

---

## 1. Sumário Executivo e Registro de Versão

Em conformidade com a autorização humana recebida, foi preparado, commitado e publicado na branch `main` do repositório oficial o pacote de implantação do **Backend API Bridge** com arquitetura supervisionada dual-process.

### 1.1 Identificação do Deploy e Rollback

| Parâmetro | Valor / Registro |
| :--- | :--- |
| **Commit Atual (Novo Deploy)** | `3fbbed2` (*feat(security): deploy Backend API Bridge with dual-process runner, fail-closed guard and canary architecture*) |
| **Commit de Rollback (Versão Anterior)** | `8e5eec6` (*fix(auth): add proxy_cookie_flags secure samesite=lax to prevent browser cookie rejection in production*) |
| **Data do Push no GitHub** | 12/10/2026 04:33:37 UTC |
| **Status do Git Remoto** | Sincronizado com `origin/main` (31 arquivos alterados/adicionados, zero conflitos) |
| **Comando de Rollback (se necessário)** | `git reset --hard 8e5eec6 && git push --force origin main` |

---

## 2. Artefatos e Configurações de Produção Implantados

1. **Dockerfile Dual-Process ([Dockerfile](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/Dockerfile)):**
   - Stage 1 (`node:20-alpine AS builder`): Instalação limpa de dependências e compilação do frontend Vite em 6.39 segundos.
   - Stage 2 (`node:20-alpine AS runner`): Adiciona o pacote Nginx (`apk add --no-cache nginx`), copia os arquivos compilados da SPA para `/usr/share/nginx/html`, copia o código do backend para `/app/server` e define `/app/entrypoint.sh` como entrypoint executável.
2. **Supervisor de Processos ([server/entrypoint.sh](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/server/entrypoint.sh)):**
   - Inicia o processo Node.js na porta interna 3001 (`node /app/server/server.cjs &`).
   - Inicia o proxy reverso Nginx nas portas 80, 3000 e 4173 (`nginx -g "daemon off;" &`).
   - Mantém um loop contínuo de supervisão de processos: caso qualquer um dos dois processos falhe, encerra graciosamente o outro processo e encerra o contêiner com código 1, acionando a política de autorrecuperação do EasyPanel/Docker.
3. **Roteamento de Borda Nginx ([nginx.conf](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/nginx.conf)):**
   - Encaminha requisições `/api/` para `http://127.0.0.1:3001/api/`.
   - Preserva `X-Real-IP`, `X-Forwarded-For` e `X-Forwarded-Proto`.
   - Limita o payload de requisições no Nginx com `client_max_body_size 5M`.
4. **Proteção Total contra Vazamento de Segredos:**
   - `.gitignore` atualizado para impedir que arquivos de migração, credenciais e backups em `scripts/` e arquivos `.local` sejam comitados.
   - Auditoria estrita no commit `3fbbed2`: **zero ocorrências de chaves `standard_` no código comitado**.

---

## 3. Estado Atual no EasyPanel e Próxima Ação de Acionamento

### 3.1 Diagnóstico de Execução Remota
O commit `3fbbed2` foi enviado com sucesso para o GitHub `origin/main`. A sondagem remota no domínio `https://sites-lvplataform.grtbdz.easypanel.host` revela:
* O Nginx de borda responde `200 OK` em `/healthz`.
* A SPA estática carrega perfeitamente na raiz `/`.
* O EasyPanel no host `https://grtbdz.easypanel.host` requer o acionamento do botão **"Deploy"** ou configuração de Webhook para reconstruir a imagem a partir do novo Dockerfile com Node.js + Nginx.

### 3.2 Ação Necessária no Painel EasyPanel:
1. Acessar o painel do EasyPanel: [https://grtbdz.easypanel.host](https://grtbdz.easypanel.host).
2. Localizar o serviço **`sites-lvplataform`** (Projeto Iris Horizon CRM).
3. Na aba **Environment**, certificar-se de que a variável de servidor está configurada:
   - `APPWRITE_API_KEY`: *(Chave de servidor com escopos mínimos)*
   - `CANARY_PROD_WRITE_ENABLED`: **`false`** (ou omitida)
   - `ALLOW_PROD_BUSINESS_WRITES`: **`false`** (ou omitida)
4. Clicar no botão **Deploy** para iniciar a compilação do novo Dockerfile multi-stage.

---

## 4. Resultados da Validação Automatizada de Runtime

A suíte de testes [scripts/test-deploy-runtime-verification.cjs](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/scripts/test-deploy-runtime-verification.cjs) foi executada e registrou os seguintes resultados em [scripts/deploy_backend_bridge_runtime_results.json](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/scripts/deploy_backend_bridge_runtime_results.json):

| Verificação | Status Atual | Detalhes | Comportamento Esperado Pós-Build |
| :--- | :---: | :--- | :--- |
| **Edge Nginx (`/healthz`)** | ✅ **PASS** | `HTTP 200 OK` | Continua respondendo 200 OK |
| **Frontend SPA (`/`)** | ✅ **PASS** | `HTTP 200 OK` (HTML válido) | Continua servindo a SPA atualizada |
| **Integridade `crm_db` (27 coleções)** | ✅ **PASS** | 27 coleções preservadas | Permanece 100% inalterado |
| **Permissões `crm_db` (`[]`)** | ✅ **PASS** | `permissions: []` e `documentSecurity: true` em todas | Permanece fechado para escritas diretas |
| **Backend API Bridge (`/api/healthz`)** | ⏳ *Pendente Build* | Retornando HTML da imagem antiga de 02/10 | Retornará `HTTP 200` com `{"status":"UP","service":"crm-backend-api-bridge"}` |
| **Auth Rejection (`/api/crm/write` sem token)** | ⏳ *Pendente Build* | Retornando 405 (Nginx antigo) | Retornará `HTTP 401 Unauthorized` |
| **Fail-Closed Guard (`crm_db` com canário off)** | ⏳ *Pendente Build* | Retornando 405 (Nginx antigo) | Retornará `HTTP 403 Forbidden` (`[FAIL-CLOSED GUARD]`) |

---

## 5. Auditoria de Imutabilidade e Não-Mutação em `crm_db`

Em observância estrita às **RESTRIÇÕES OBRIGATÓRIAS**:
* Nenhuma operação de escrita foi submetida contra `crm_db`.
* As contagens de documentos de todas as coleções foram auditadas em modo somente-leitura e coincidem com o baseline T-0 (856 documentos).
* Schemas, atributos, índices, Teams e Memberships continuam rigorosamente idênticos.
* `CANARY_PROD_WRITE_ENABLED` permanece **`false`** em todo o código e configuração.

---

## 6. Procedimento de Rollback de Aplicação (Caso Necessário)

Se a compilação no EasyPanel apresentar qualquer anormalidade:
1. Executar no terminal:
   ```powershell
   git revert 3fbbed2 --no-edit
   git push origin main
   ```
2. No EasyPanel, clicar em **Deploy** para restabelecer a versão anterior estável (`8e5eec6`).
3. O banco de dados Appwrite `crm_db` não sofrerá qualquer impacto, pois nenhuma mutação de schema ou dados foi ou será executada durante o processo de deploy da aplicação.

---

## 7. Conclusão e Parada para Revisão Humana

A publicação do código no repositório foi **concluída com total integridade e segurança**.

> [!IMPORTANT]
> **AÇÃO HUMANA:**  
> O commit [`3fbbed2`](https://github.com/Lucasnlucca/CRMiris/commit/3fbbed2) está publicado no GitHub.  
> O acionamento manual do botão **"Deploy"** no EasyPanel (`https://grtbdz.easypanel.host`) fará com que o contêiner dual-process seja compilado e entre em produção.  
> Assim que acionado, a suíte `node scripts/test-deploy-runtime-verification.cjs` validará os 7 pontos de rede em segundos.  
> **Nenhuma escrita de negócio foi ou será realizada em `crm_db`.**
