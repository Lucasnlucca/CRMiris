# Checkpoint de Contexto - Iris Horizon CRM Multi-tenant

> **Data do Checkpoint:** 02 de Outubro de 2026  
> **Status da Aplicação:** Estável, compilando com 0 erros (`npm run build` validado)  
> **Repositório Oficial:** [https://github.com/Lucasnlucca/CRMiris.git](https://github.com/Lucasnlucca/CRMiris.git) (Branch: `main`)  
> **Ambiente Local:** Ativo em `http://localhost:5173/` (Vite dev server)  
> **Ambiente de Produção (Easypanel):** [https://sites-lvplataform.grtbdz.easypanel.host/](https://sites-lvplataform.grtbdz.easypanel.host/)  

---

## 1. Arquitetura & Infraestrutura

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons.
- **Backend / BaaS:** Appwrite 1.8.1 (Database, Auth, Storage, Realtime).
  - **Endpoint Oficial:** `https://bancosupa-appwrite.grtbdz.easypanel.host/v1`
  - **Project ID:** `6a6cac620021f4c64b3f`
  - **Database ID:** `crm_db`
- **Deploy de Produção:** Easypanel rodando container Docker multi-stage (Node 20 builder + Nginx Alpine).
- **Segurança de Sessão & Cookies:** Nginx configurado com proxy reverso interno para `/v1/` e `/v1/realtime`, garantindo cookies de sessão *first-party* (mesma origem), eliminando o bloqueio de cookies de terceiros e problemas de `SameSite=None` sem `Secure` nos navegadores modernos.
- **Plataformas Autorizadas no Appwrite:** `localhost` e `sites-lvplataform.grtbdz.easypanel.host` registradas como Web Platforms no Appwrite Console.

---

## 2. Padrão Visual (Design System)

Linguagem visual inspirada em **Attio / Linear / HubSpot Modern**:
- **Background Principal:** `#0b0f17` (Obsidian escuro profundo)
- **Cards & Superfícies:** `#121824` com bordas sutis `border-slate-800`
- **Cores de Destaque:** Índigo / Violeta (`from-indigo-600 to-indigo-700`) para CTAs e ações primárias
- **Tipografia Numérica & Moedas:** Fonte mono com verde esmeralda (`font-mono text-emerald-400`)
- **Status & Badges:** Cores semânticas com fundo translúcido e bordas em 20% de opacidade

---

## 3. Resumo das Alterações Recentes

### A. Publicação & Versionamento no GitHub
- Inicializado repositório Git local com branch `main` e MinGit configurado no ambiente.
- Auditoria de segurança e blindagem de dados sensíveis:
  - Criação do [.env.example](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/.env.example) com o template do Appwrite.
  - Atualização do [.gitignore](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/.gitignore) para ignorar scripts administrativos de banco (`setup-*.js`, `update-db.js`, `test-*.js`, `add_*.js`, etc.) que continham chaves mestras de servidor, além de arquivos `.docx` e credenciais locais.
  - Código fonte commitado e sincronizado com o repositório remoto **`Lucasnlucca/CRMiris`**.

### B. Módulo de Gestão de Usuários (Fix "Failed to fetch")
- Identificadas chamadas legadas a `http://localhost:3008/api/users` em [Usuarios.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/Usuarios.tsx) e [Configuracoes.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/Configuracoes.tsx).
- Criado o módulo [userManagement.ts](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/lib/userManagement.ts) integrando diretamente com o Appwrite:
  - **Criação de Usuário:** Cria conta no Appwrite Auth via cliente desacoplado (sem encerrar a sessão do admin logado) e salva o perfil na coleção `users_hydra`.
  - **Permissões de Menu:** Inicializa as permissões padrão em `user_menu_permissions`.
  - **Exclusão & Alternância de Status:** Executados diretamente nas coleções do Appwrite (`databases.deleteDocument` e `databases.updateDocument`).

### C. Dockerfile & Nginx para Deploy no Easypanel
- Criado [Dockerfile](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/Dockerfile) multi-stage leve e de alta performance:
  - Stage 1: Build com `node:20-alpine` (`npm install && npm run build`).
  - Stage 2: Servidor `nginx:alpine` com exposição das portas `80`, `3000` e `4173` para compatibilidade total com os *health checks* do Easypanel.
- Criado [nginx.conf](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/nginx.conf):
  - Suporte a SPA (`try_files $uri $uri/ /index.html`), evitando erros 404 em refresh de rotas.
  - Endpoint de saúde `/healthz`.
  - Proxy reverso `/v1/` e `/v1/realtime` redirecionando para o Appwrite com reescrita de domínio de cookies.
- Criado [nixpacks.toml](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/nixpacks.toml) e atualizado `package.json` com `packageManager` e `engines` para eliminar o bug do `npm-9_x` do builder automático.

### D. Resolução do Loop de Login em Produção
- **Causa:** O Appwrite no Easypanel enviava o cookie de sessão cross-domain com `SameSite=None` sem a flag `Secure`, levando os navegadores modernos a descartarem o cookie imediatamente.
- **Correção:** 
  1. O Nginx agora faz proxy de `/v1/` para o Appwrite no mesmo domínio do frontend (`sites-lvplataform.grtbdz.easypanel.host/v1`).
  2. [appwrite.ts](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/lib/appwrite.ts) atualizado para detectar ambiente de produção e usar a rota relativa `/v1`.
  3. Cookies de sessão tornam-se de primeira parte (*First-Party*), 100% aceitos por qualquer navegador sem bloqueios de privacidade.
  4. Plataforma Web `sites-lvplataform.grtbdz.easypanel.host` cadastrada no Appwrite Console.

### E. Módulo de Contratos & Assinatura Digital Jurídica
- Trilha de auditoria probatória em [auditTrail.ts](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/utils/auditTrail.ts) e hash SHA-256 (Lei Federal nº 14.063/2020 e MP nº 2.200-2/2001).
- Visualizador de assinatura externa em [ContractSignPreview.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/ContractSignPreview.tsx).
- Gerador e exportador de minutas contratuais para `.docx` ([contractDocx.ts](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/utils/contractDocx.ts)).
- Handler de servidor em [signContractHandler.ts](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/server/signContractHandler.ts) para captura autoritativa de rede (IP real, porta, timestamp UTC).

---

## 4. Status de Compilação & Integridade

- `npm run build`: **Sucesso (0 erros, 1.531 módulos processados, bundle otimizado)**.
- Dev Server local ativo na porta `5173`.
- Produção sincronizada no GitHub (`commit 6e8c92d`) e conectada ao Easypanel.

---

## 5. Próximos Passos Sugeridos

1. **Validação do Login & Testes com Usuários Reais:** Testar criação de propostas, itens e contratos no ambiente de produção.
2. **Módulo de Faturas / Cobranças:** Padronizar faturas no mesmo layout executivo de propostas e contratos.
3. **Módulo de Clientes:** Enriquecer a ficha cadastral do cliente com histórico completo de propostas e contratos assinados.
