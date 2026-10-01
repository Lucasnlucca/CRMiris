import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import Contatos from './pages/Contatos';
import Phonebook from './pages/Phonebook';
import Configuracoes from './pages/Configuracoes';
import Automacoes from './pages/Automacoes';
import PlaceholderPage from './pages/PlaceholderPage';
import Login from './pages/Login';
import Register from './pages/Register';
import CrmItems from './pages/CrmItems';
import Propostas from './pages/Propostas';
import Usuarios from './pages/Usuarios';
import Suporte from './pages/Suporte';
import ProposalPreview from './pages/ProposalPreview';
import Contratos from './pages/Contratos';
import ContractSignPreview from './pages/ContractSignPreview';

function AuthenticatedApp() {
  const [currentPage, setCurrentPage] = useState(() => {
    try { return sessionStorage.getItem('currentPage') || 'visao-geral'; } catch { return 'visao-geral'; }
  });
  const [pendingDealId, setPendingDealId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const currentPageRef = useRef(currentPage);

  useLayoutEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handlePageChange = (page: string, referenceId?: string | null) => {
    try { sessionStorage.setItem('currentPage', page); } catch {}
    setCurrentPage(page);

    if (referenceId) {
      setPendingDealId(referenceId);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'visao-geral':
        return <Dashboard onPageChange={handlePageChange} />;

      case 'crm-contatos':
        return <Contatos onPageChange={handlePageChange} />;

      case 'crm-negocios':
        return <PlaceholderPage title="Negócios" />;

      case 'crm-contratos':
        return <Contratos />;

      case 'crm-documentos':
        return <PlaceholderPage title="Documentos" />;

      case 'crm-items':
        return <CrmItems />;

      case 'crm-propostas':
        return <Propostas onPageChange={handlePageChange} />;

      case 'crm-pipeline':
        return (
          <Pipeline
            initialDealId={pendingDealId}
            onDealOpened={() => setPendingDealId(null)}
          />
        );

      case 'dstrack':
        return <Suporte />;

      case 'recursos-catalogo':
        return <Phonebook />;

      case 'recursos-produtos':
        return <PlaceholderPage title="Produtos" />;

      case 'recursos-estoque':
        return <PlaceholderPage title="Estoque" />;

      case 'automacoes':
        return <Automacoes />;

      case 'usuarios':
        return <Usuarios />;

      case 'administracao':
        return <Configuracoes />;

      case 'parceiros-afiliados':
        return <PlaceholderPage title="Afiliados" />;

      case 'parceiros-revendas':
        return <PlaceholderPage title="Revendas" />;

      case 'parceiros-api':
        return <PlaceholderPage title="API Pública" />;

      default:
        return <Dashboard onPageChange={handlePageChange} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-[#edf0f5] dark:bg-[#090d15] text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar currentPage={currentPage} onPageChange={handlePageChange} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <Header
        currentPage={currentPage}
        onPageChange={handlePageChange}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main
        className={`flex-1 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-[270px]'} mt-16 p-4 sm:p-6 lg:p-8 transition-[margin] duration-300 min-w-0`}
      >
        {renderPage()}
      </main>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isRegisterPage = pathname === '/register';
  const proposalPreviewMatch = pathname.match(/^\/proposta\/(.+)$/);
  const contractSignMatch = pathname.match(/^\/(?:contrato|assinar)\/(.+)$/);

  if (contractSignMatch) {
    return <ContractSignPreview />;
  }

  if (proposalPreviewMatch) {
    return <ProposalPreview />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return isRegisterPage ? <Register /> : <Login />;
  }

  return <AuthenticatedApp />;
}

interface ErrorBoundaryState { hasError: boolean; message: string; }

class PageErrorBoundary extends React.Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Erro desconhecido' };
  }
  componentDidCatch(error: Error) {
    console.error('PageErrorBoundary:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f6f7fb] p-8">
          <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm text-center max-w-md">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Algo deu errado</h2>
            <p className="text-sm text-gray-500 mb-5">{this.state.message}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                try { sessionStorage.removeItem('currentPage'); } catch {}
                window.location.reload();
              }}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PageErrorBoundary>
          <AppContent />
        </PageErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;