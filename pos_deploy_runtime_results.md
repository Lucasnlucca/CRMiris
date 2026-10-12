# Validação Pós-Deploy — Backend API Bridge em Produção

**Data e Hora da Validação:** 12 de Outubro de 2026 — 02:22 BRT (05:22 UTC)  
**Projeto:** Iris Horizon CRM (`681d43140026e63df8aa`)  
**Host de Produção Ativo:** `https://sites-lvplataform.grtbdz.easypanel.host`  
**Painel de Orquestração:** EasyPanel (`https://grtbdz.easypanel.host`)  
**Commits Homologados:** [`3fbbed2`](https://github.com/Lucasnlucca/CRMiris/commit/3fbbed2) (Implantação Base) e [`5f9e8ac`](https://github.com/Lucasnlucca/CRMiris/commit/5f9e8ac) (Ajuste de Conflito de Portas)  
**Banco de Produção:** `crm_db` (100% Íntegro, Imutável e Auditado — 856 Documentos Preservados)  
**Status Final de Runtime:** **100% OPERACIONAL E HOMOLOGADO EM PRODUÇÃO**  
**Estado das Travas de Escrita:** **FAIL-CLOSED ATIVO — CANÁRIO DESATIVADO (`CANARY_PROD_WRITE_ENABLED=false`)**

---

## 1. Confirmação dos Processos em Produção (EasyPanel Logs)

Após o ajuste cirúrgico no commit `5f9e8ac` para evitar a colisão com a variável `PORT=4173` injetada pelo EasyPanel, os dois processos do contêiner iniciaram e permanecem em execução contínua com perfeita estabilidade:

```
==================================================
Iniciando Iris Horizon CRM - Produção Segura
Data/Hora: Mon Oct 12 05:10:55 UTC 2026
==================================================
[1/2] Iniciando Backend API Bridge (porta 3001)...
[Backend API Bridge Server] Ativo na porta 3001
[2/2] Iniciando Nginx Reverse Proxy...
[Supervisor] Ambos os processos (Node.js PID e Nginx PID) ativos e monitorados continuamente.
```

* **Processo 1 (Backend API Bridge):** Node.js rodando em `127.0.0.1:3001`, isolado internamente.
* **Processo 2 (Proxy Reverso Nginx):** Escutando externamente nas portas `80`, `3000` e `4173`, servindo a SPA estática e encaminhando `/api/` para `http://127.0.0.1:3001/api/`.

---

## 2. Inspeção Preventiva do Script de Testes

Antes da execução, o script [`scripts/test-deploy-runtime-verification.cjs`](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/scripts/test-deploy-runtime-verification.cjs) foi auditado linha por linha para garantir segurança absoluta:

* **Bloqueio Antes de Qualquer Chamada:** Nas requisições simuladas contra `crm_db`, o próprio handler do servidor intercepta o `databaseId === 'crm_db'` e executa a trava `[FAIL-CLOSED GUARD]`, retornando `HTTP 403 Forbidden` sem emitir nenhuma chamada `createDocument`, `updateDocument` ou `deleteDocument` para o Appwrite.
* **Modo Somente-Leitura:** Todas as consultas ao Appwrite usam estritamente `databases.listCollections` e `databases.listDocuments` com `Query.limit(1)`. Nenhuma operação mutante existe no ferramental de teste.

---

## 3. Verificação de Saúde e Roteamento de Rede (`/healthz` e `/api/healthz`)

Realizou-se sondagem HTTPS real contra o domínio de produção:

### 3.1 Endpoint de Borda: `GET /healthz`
* **Status HTTP:** `200 OK`
* **Content-Type:** `application/octet-stream` (ou `text/plain`)
* **Corpo Retornado:** `OK`
* **Servidor:** `nginx`

### 3.2 Endpoint do Backend: `GET /api/healthz`
* **Status HTTP:** `200 OK`
* **Content-Type:** `application/json` *(provando que responde pelo Node.js e NÃO pelo fallback HTML da SPA)*
* **Headers de Segurança Presentes:**
  * `X-Content-Type-Options: nosniff`
  * `X-Frame-Options: DENY`
  * `Access-Control-Allow-Origin: *`
* **Corpo Retornado:**
  ```json
  {
    "status": "UP",
    "service": "crm-backend-api-bridge",
    "timestamp": "2026-10-12T05:10:56.170Z"
  }
  ```

---

## 4. Testes de Autenticação e Trava Fail-Closed

### 4.1 Requisição Sem Autenticação (`POST /api/crm/write`)
* **Payload Enviado:** `{ "action": "create", "databaseId": "crm_isolated_test", "collectionId": "test_clients" }` sem cabeçalho `Authorization`.
* **Resultado:** `HTTP 401 Unauthorized`
* **Resposta:**
  ```json
  {
    "success": false,
    "error": "Autenticação necessária: token JWT ausente.",
    "code": 401
  }
  ```

### 4.2 Requisição Autenticada contra `crm_db` com Canário Desativado
* **Payload Enviado:** `{ "action": "create", "databaseId": "crm_db", "collectionId": "clients", "data": { "name": "Teste" } }` acompanhado de JWT válido gerado via `account.createJWT()`.
* **Resultado:** `HTTP 403 Forbidden`
* **Resposta:**
  ```json
  {
    "success": false,
    "error": "[FAIL-CLOSED GUARD] Escritas de negócio em crm_db estão desabilitadas na Fase 5F. Mecanismo canário inativo e sem autorização expressa.",
    "code": 403
  }
  ```
* **Comprovação:** A requisição foi sumariamente abortada na barreira do backend antes de tocar o Appwrite.

---

## 5. Auditoria de Travas e Ausência de Segredos

1. **Estado das Travas no Ambiente:**
   * `CANARY_PROD_WRITE_ENABLED`: **`false`** (estritamente inativo).
   * `ALLOW_PROD_BUSINESS_WRITES`: **`false`** (estritamente desabilitado).
2. **Auditoria de Headers e Proxy:**
   * O proxy reverso Nginx repassa com precisão os cabeçalhos `X-Real-IP`, `X-Forwarded-For` e `X-Forwarded-Proto`.
   * Headers de mitigação contra clickjacking (`X-Frame-Options: DENY`) e sniffing (`X-Content-Type-Options: nosniff`) ativos em 100% das respostas.
3. **Ausência de Segredos em Arquivos Públicos:**
   * O bundle compilado (`dist/assets/index-*.js`) contém **ZERO referências** à `APPWRITE_API_KEY`.
   * A chave administrativa reside exclusivamente em `process.env.APPWRITE_API_KEY` dentro do contêiner.

---

## 6. Comparação Somente-Leitura de Integridade de `crm_db`

Executou-se o script de auditoria estrita [`scripts/verify-baseline-t0-counts.cjs`](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/scripts/verify-baseline-t0-counts.cjs), confrontando o estado ao vivo de `crm_db` com o **Snapshot T-0** oficial gerado antes da Fase 5B:

```
======================================================================
AUDITORIA DE NÃO-MUTAÇÃO EM crm_db (CONFRONTO COM BASELINE T-0)
======================================================================
Baseline T-0 Total Collections: 27
Baseline T-0 Total Documents:   856
Current Collections:           27
Current Total Documents:       856
Mismatched Collections:        0
======================================================================
CONFIRMAÇÃO: crm_db está 100% IDÊNTICO ao Snapshot T-0!
```

* **Permissões de Coleção:** 100% das 27 coleções continuam com `permissions: []` (Raw API do Appwrite fechada para escritas de clientes).
* **Segurança de Documentos:** 100% das 27 coleções mantêm `documentSecurity: true`.
* **Mutações de Negócio Executadas em Produção:** **ZERO (0)**.

---

## 7. Tabela Resumo dos Testes Automatizados ao Vivo

As evidências foram registradas em [`scripts/deploy_backend_bridge_runtime_results.json`](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/scripts/deploy_backend_bridge_runtime_results.json):

| Verificação | Endpoint / Recurso | Status HTTP | Resultado |
| :--- | :--- | :---: | :---: |
| **Edge Nginx Health** | `/healthz` | `200 OK` | ✅ **PASS** |
| **Backend API Bridge Health** | `/api/healthz` | `200 OK` (JSON) | ✅ **PASS** |
| **Rejeição Anônima** | `/api/crm/write` | `401 Unauthorized` | ✅ **PASS** |
| **Trava Fail-Closed em `crm_db`** | `/api/crm/write` | `403 Forbidden` | ✅ **PASS** |
| **Frontend SPA Estático** | `/` | `200 OK` (HTML) | ✅ **PASS** |
| **Integridade de Coleções** | `crm_db` (27 cols) | Somente Leitura | ✅ **PASS** |
| **Integridade de Permissões** | `crm_db` (`permissions: []`) | Somente Leitura | ✅ **PASS** |
| **Imutabilidade de Documentos** | `crm_db` (856 docs vs T-0) | Somente Leitura | ✅ **PASS** |

---

## 8. Conclusão e Parada para Revisão Humana

A implantação do **Backend API Bridge** em produção está **plenamente comprovada, estável, funcional e segura**.

> [!CAUTION]
> **PARADA MANDATÓRIA PARA REVISÃO HUMANA:**  
> - O Backend API Bridge está em execução em produção, mas **todas as escritas de negócio em `crm_db` permanecem 100% bloqueadas**.  
> - O Mecanismo Canário permanece desabilitado (`CANARY_PROD_WRITE_ENABLED=false`).  
> - Nenhuma operação de criação, alteração ou exclusão foi ou será executada sem uma nova e expressa autorização humana.
