import React from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import Login from './pages/Login';
import Register from './pages/Register';
import ProposalPreview from './pages/ProposalPreview';
import ContractSignPreview from './pages/ContractSignPreview';
import { AppProvider } from './central/context/AppContext';
import { AppRoutes } from './central/App';
import Preloader from './components/Preloader';

function AuthenticatedApp() {
  const {
    isAuthorized,
    loading: tenantLoading,
    error: tenantError,
    tenantNotFound,
    tenantSuspended,
  } = useTenant();
  const { logout, user } = useAuth();
  const isClientUser =
    user?.role === 'client' ||
    (typeof window !== 'undefined' && (
      !!localStorage.getItem('portal_client_id') ||
      window.location.pathname.startsWith('/portal')
    ));

  if (tenantLoading) {
    return <Preloader message="Carregando ambiente da empresa..." />;
  }

  if (tenantNotFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#edf0f5] dark:bg-[#090d15] p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#121722] rounded-2xl border border-slate-200 dark:border-white/[0.1] p-6 text-center shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Empresa Não Encontrada</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            O endereço informado não corresponde a nenhuma organização cadastrada ou ativa nesta plataforma.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Ir para Início
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (tenantSuspended) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#edf0f5] dark:bg-[#090d15] p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#121722] rounded-2xl border border-slate-200 dark:border-white/[0.1] p-6 text-center shadow-xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Empresa Suspensa</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            O acesso a esta empresa está temporariamente suspenso pela administração. Entre em contato com o suporte comercial.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              Trocar de Empresa
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthorized && tenantError && !isClientUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#edf0f5] dark:bg-[#090d15] p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#121722] rounded-2xl border border-slate-200 dark:border-white/[0.1] p-6 text-center shadow-xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Acesso Restrito</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{tenantError}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              Início
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Sair da Conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isRegisterPage = pathname === '/register';
  const isAcessoPage = pathname === '/acesso';
  const isPortalLogin = pathname === '/portal-login' || pathname === '/portal/login';
  const isPortalArea = pathname.startsWith('/portal');
  const proposalPreviewMatch = pathname.match(/^\/proposta\/(.+)$/);
  const contractSignMatch = pathname.match(/^\/(?:contrato|assinar)\/(.+)$/);

  // Se já está autenticado e tenta acessar o portal-login, redireciona diretamente para o portal
  if (isAuthenticated && isPortalLogin) {
    if (typeof window !== 'undefined') {
      window.location.replace('/portal');
      return null;
    }
  }

  if (contractSignMatch) {
    return <ContractSignPreview />;
  }

  if (proposalPreviewMatch) {
    return <ProposalPreview />;
  }

  if (loading) {
    return <Preloader message="Carregando LVPlatform..." />;
  }

  if (!isAuthenticated && !isAcessoPage) {
    if (isRegisterPage) {
      return <Register />;
    }

    // Se o usuário não autenticado está acessando a área do portal ou rota de login do portal
    if (isPortalLogin || isPortalArea) {
      if (pathname !== '/portal-login' && typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/portal-login');
      }
      return <Login isPortal={true} />;
    }

    // Se o usuário não autenticado está em qualquer rota interna específica (ex: /contratos-crm, /pipeline, etc.)
    // normaliza o URL para o endereço principal (/) sem ficar preso na subpágina
    if (pathname !== '/' && pathname !== '/login' && typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
    }

    return <Login isPortal={false} />;
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
        <TenantProvider>
          <PageErrorBoundary>
            <AppContent />
          </PageErrorBoundary>
        </TenantProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;