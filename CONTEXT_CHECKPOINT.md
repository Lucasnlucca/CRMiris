# Checkpoint de Contexto - Iris Horizon CRM Multi-tenant

> **Data do Checkpoint:** 29 de Setembro de 2026  
> **Status da Aplicação:** Estável, compilando com 0 erros (`npm run build` validado)  
> **Servidor Local:** Ativo em `http://localhost:5173/` (Vite dev server)

---

## 1. Visão Geral da Arquitetura & Tecnologias
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS.
- **Backend / BaaS:** Appwrite (Database, Auth, Storage, Realtime).
- **Diretório do Projeto:** `c:\Users\Usuario\Documents\projetos\ProjetoCRMMultitenet`
- **Variáveis de Ambiente:** Configuradas em [.env](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/.env) (`VITE_APPWRITE_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID`, `VITE_APPWRITE_DATABASE_ID`).
- **Node.js:** Instalado em `C:\Program Files\nodejs`. Para rodar comandos no PowerShell, usar:
  ```powershell
  $env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run dev
  ```

---

## 2. Padrão Visual Adotado (Design System)
O sistema foi completamente desvinculado do antigo estilo Perfex CRM (PHP 2012) e padronizado na linguagem visual **Attio / Linear / HubSpot Modern**:
- **Background Principal:** `#0b0f17` (Obsidian escuro profundo)
- **Cards & Superfícies:** `#121824` com bordas sutis `border-slate-800`
- **Cores de Destaque:** Índigo / Violeta (`from-indigo-600 to-indigo-700`) para CTAs e ações primárias
- **Tipografia Numérica & Moedas:** Fonte mono com verde esmeralda (`font-mono text-emerald-400`)
- **Status & Badges:** Cores semânticas com fundo translúcido e bordas em 20% de opacidade

---

## 3. Resumo das Últimas Modificações Realizadas

### A. Módulo de Itens & Serviços ([CrmItems.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/CrmItems.tsx))
- **Scorecard de Catálogo:** Métricas no topo com Total de Itens, Serviços Ativos, Produtos Físicos e Ticket Médio Unitário.
- **Visual Switcher Duplo:**
  - *Grid de Cards Visuais:* Catálogo com badges de tipo, tags de unidade (*un, mês, ano, hora, ramal, licença*), alíquotas fiscais e valores em destaque.
  - *Tabela Executiva de Alta Densidade:* Listagem compacta para gestão ágil.
- **Filtro de Categorias:** Pílulas interativas com contadores (*Todos, Telecom, Cloud, Suporte, Hardware, Software, Consultoria, Outros*).
- **ItemModal:** Modal de criação e edição com validação, inputs limpos e prévia de impostos.
- **Persistência:** Coleção `crm_items` no Appwrite.

### B. Módulo de Propostas Comerciais ([Propostas.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/Propostas.tsx))
- **Executive Metrics Scorecard:** Pipeline Ativo, Receita Aprovada, Win Rate (%) dinâmico, Propostas Pendentes e Ticket Médio.
- **Visual Switcher Duplo:**
  - *Tabela Executiva:* Exibição limpa com avatares de clientes, status e alertas de vencimento.
  - *Pipeline Kanban:* Visualização em colunas por estágio de negociação com somatórios financeiros.
- **ProposalEditorModal:** Editor em 3 abas organizadas:
  1. *Cliente & Informações:* Vínculo com base de clientes e prazos.
  2. *Itens & Precificação:* Inserção direta via catálogo de itens, cálculo ao vivo de descontos (% e R$), impostos e ajustes.
  3. *Termos & Condições:* Apresentação e notas contratuais.
- **ProposalDocumentModal:** Documento executivo formatado com ações de 1 clique:
  - Compartilhar via WhatsApp com mensagem formatada.
  - Copiar resumo comercial formal.
  - Imprimir / Exportar PDF oficial.
  - Aprovação / Recusa instantânea com atualização de status no banco.
- **Persistência:** Coleções `crm_proposals` e `crm_proposal_items` no Appwrite.

### C. Visualizador Externo de Propostas ([ProposalPreview.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/ProposalPreview.tsx))
- Página que o cliente final acessa via link público, atualizada com identidade Iris Horizon, responsividade e layout preparado para impressão em folha A4.

### D. Painel Geral ([Dashboard.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/Dashboard.tsx))
- KPIs executivos com gráfico interativo de volume, funil de conversão comercial, negócios recentes e atalhos de discagem VOIP.

### F. Remoção de Módulos Legados: WhatsApp & Canais e Telefonia / Discador
- **Remoção de Canais & Discador:** Telas e rotas de `canais` e `dsvoice` (SIP WebRTC/VoIP) foram removidas da navegação e do roteador.
- **Sidebar ([Sidebar.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/components/Sidebar.tsx)):** A seção "COMUNICAÇÃO & VOZ" foi reorganizada para "SUPORTE & ATENDIMENTO", mantendo a Central de Chamados (`dstrack`) e o Catálogo de Contatos (`recursos-catalogo`).
- **Dashboard ([Dashboard.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/Dashboard.tsx)):**
  - Card 4 migrado de "Interações WhatsApp" para métrica executiva "Propostas Geradas".
  - Gráfico migrado para "Evolução do Pipeline & Negócios" (baseado em oportunidades do CRM).
  - Widget lateral atualizado para "Clientes Recentes" (consumindo base de clientes real).
  - Barra de conectividade limpa de instâncias do WhatsApp API e PBX SIP.
- **Configurações ([Configuracoes.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/Configuracoes.tsx)):** Abas e formulários de WhatsApp API (Evolution/Meta) e Telefonia SIP removidos.
- **Contatos & Catálogo ([Contatos.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/Contatos.tsx) & [Phonebook.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/pages/Phonebook.tsx)):** Removidos botões de discador SIP e ações diretas de chamada telefônica.
- **App ([App.tsx](file:///c:/Users/Usuario/Documents/projetos/ProjetoCRMMultitenet/src/App.tsx)):** `CallModal`, cliente SIP e ouvintes de WebRTC removidos do ciclo de vida global.

---

## 4. Status de Compilação & Integridade
- `npm run build`: **Sucesso (0 erros, 1.524 módulos processados, bundle otimizado)**.
- Dev Server ativo em `http://localhost:5173/` com Hot Module Replacement em tempo real.

---

## 5. Sugestões de Próximos Passos
1. **Módulo de Clientes & Contatos:** Modernizar a listagem e ficha cadastral para padrão executivo.
2. **Módulo de Faturas / Cobranças:** Padronizar faturas com o mesmo design das propostas.
3. **Relatórios Comerciais:** Painel dedicado com gráficos avançados de performance da equipe de vendas.
