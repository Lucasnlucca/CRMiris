# Iris Horizon CRM Multi-tenant 🚀

Sistema moderno de CRM, Gestão Comercial, Propostas, Contratos Digitais e Suporte com arquitetura Multi-tenant.

Construído com base na estética visual contemporânea (*Attio / Linear / HubSpot Modern*), focado em alta densidade de informação, fluidez e produtividade para times de vendas e atendimento.

---

## ⚡ Tecnologias Utilizadas

- **Frontend:** React 18, TypeScript, Vite
- **Estilização:** Tailwind CSS, Lucide Icons, Canvas Confetti
- **BaaS / Backend:** Appwrite (Database, Auth, Storage, Realtime)
- **Documentos & Contratos:** Geração de Docx (`docx`), Assinatura Eletrônica com hash SHA-256 e Dossiê de Auditoria (Lei nº 14.063/2020)
- **Drag and Drop:** `@hello-pangea/dnd` para pipelines Kanban

---

## 📋 Funcionalidades Principais para Teste

1. **Dashboard Executivo:**
   - Métricas de pipeline ativo, conversão, faturamento e negócios recentes.
2. **Propostas Comerciais (`/propostas`):**
   - Visualização dupla: Tabela Executiva ou Pipeline Kanban interativo.
   - Editor guiado em 3 etapas com cálculo automático de impostos e descontos.
   - Compartilhamento via WhatsApp, geração de resumo formal e impressão A4 oficial.
3. **Contratos & Assinatura Digital (`/contratos`):**
   - Criação e gestão de minutas contratuais vinculadas a clientes e propostas.
   - Visualizador público de assinatura com aceite formal, validação de documento e trilha de auditoria probatória (IP, User-Agent, Timestamp UTC e Hashes SHA-256).
   - Exportação para `.docx` e PDF.
4. **Catálogo de Itens & Serviços (`/itens`):**
   - Gestão de produtos físicos e serviços recorrentes com alíquotas fiscais.
   - Visualização em cards ou tabela de alta densidade.
5. **Clientes & Contatos (`/clientes`):**
   - Base de clientes e contatos vinculados.
6. **Central de Suporte & Atendimento (`/dstrack`):**
   - Gestão de chamados e ocorrências com status em tempo real.

---

## 🚀 Como Rodar o Projeto Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior
- Gerenciador de pacotes `npm`

### 1. Clonar o repositório
```bash
git clone <URL_DO_REPOSITORIO>
cd ProjetoCRMMultitenet
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Configurar as variáveis de ambiente
Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```
*(As variáveis padrão já apontam para a instância do Appwrite de homologação/testes)*.

### 4. Iniciar o servidor de desenvolvimento
```bash
npm run dev
```

Acesse a aplicação no navegador em:  
👉 **`http://localhost:5173/`**

---

## 🧪 Validar Build de Produção
Para verificar a integridade da compilação e TypeScript:
```bash
npm run build
```
