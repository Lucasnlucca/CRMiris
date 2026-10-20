import { Component, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { AppLayout } from './layouts/AppLayout';
import { Button, EmptyState } from './components/ui';
import { LoginPage } from './modules/LoginPage';
import { DashboardPage } from './modules/DashboardPage';
import { ClientsPage, ClientDetailPage } from './modules/clients/ClientsPage';
import { TicketsPage, TicketDetailPage } from './modules/tickets/TicketsPage';
import { ServersPage } from './modules/operations/ServersPage';
import { ServerDetailPage } from './modules/operations/ServerDetailPage';
import { ServicesPage } from './modules/operations/ServicesPage';
import { DocumentsPage } from './modules/operations/DocumentsPage';
import { FinancePage } from './modules/operations/FinancePage';
import { AgendaPage } from './modules/operations/AgendaPage';
import { IntegrationsPage } from './modules/IntegrationsPage';
import { SettingsPage } from './modules/SettingsPage';
import { PortalPage } from './modules/PortalPage';
import { MonitoringPage } from './modules/MonitoringPage';
import type { Role } from './types';
import Pipeline from '../pages/Pipeline';
import Propostas from '../pages/Propostas';
import Contratos from '../pages/Contratos';
import CrmItems from '../pages/CrmItems';
import Automacoes from '../pages/Automacoes';
import Usuarios from '../pages/Usuarios';
import SuperAdminTenants from '../pages/SuperAdminTenants';
import SuperAdminPolicyPanel from '../pages/SuperAdminPolicyPanel';
import Phonebook from '../pages/Phonebook';
import { useAuth } from '../context/AuthContext';

function RequireSession() {
  const { session } = useApp();
  const { isAuthenticated } = useAuth();
  return session || isAuthenticated ? <Outlet /> : <Navigate to="/acesso" replace />;
}
function Permission({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { session } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const effectiveRole: Role = session?.role ?? (user?.role === 'admin' || user?.role === 'owner' ? 'admin' : 'support');
  return roles.includes(effectiveRole) ? (
    <>{children}</>
  ) : (
    <EmptyState
      title="Este módulo não está disponível neste perfil"
      description="Você pode continuar no seu portal ou alternar a visão operacional."
      action={<Button onClick={() => navigate('/acesso')}>Alternar visão</Button>}
    />
  );
}
function Home() {
  const { session } = useApp();
  return session?.role === 'client' ? <Navigate to="/portal" replace /> : <DashboardPage />;
}
function NotFound() {
  const { session } = useApp();
  const navigate = useNavigate();
  return (
    <div className="not-found">
      <div>
        <strong>404</strong>
        <h1>Não encontramos esta página</h1>
        <p>O endereço pode ter mudado. Volte para a visão geral da sua central.</p>
        <Button onClick={() => navigate(session?.role === 'client' ? '/portal' : '/')}>
          Voltar para o início
        </Button>
      </div>
    </div>
  );
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="not-found">
        <div>
          <h1>Não foi possível exibir esta tela</h1>
          <p>Recarregue a aplicação para continuar operando na central.</p>
          <Button onClick={() => window.location.reload()}>Recarregar aplicação</Button>
        </div>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/acesso" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route
            path="clientes"
            element={
              <Permission roles={['admin', 'support', 'finance']}>
                <ClientsPage />
              </Permission>
            }
          />
          <Route
            path="clientes/:id"
            element={
              <Permission roles={['admin', 'support', 'finance']}>
                <ClientDetailPage />
              </Permission>
            }
          />
          <Route
            path="tickets"
            element={
              <Permission roles={['admin', 'support']}>
                <TicketsPage />
              </Permission>
            }
          />
          <Route
            path="tickets/:id"
            element={
              <Permission roles={['admin', 'support']}>
                <TicketDetailPage />
              </Permission>
            }
          />
          <Route
            path="servidores"
            element={
              <Permission roles={['admin', 'support']}>
                <ServersPage />
              </Permission>
            }
          />
          <Route
            path="servidores/:id"
            element={
              <Permission roles={['admin', 'support']}>
                <ServerDetailPage />
              </Permission>
            }
          />
          <Route
            path="servicos"
            element={
              <Permission roles={['admin', 'support']}>
                <ServicesPage />
              </Permission>
            }
          />
          <Route
            path="monitoramento"
            element={
              <Permission roles={['admin', 'support']}>
                <MonitoringPage />
              </Permission>
            }
          />
          <Route
            path="documentos"
            element={
              <Permission roles={['admin', 'support', 'finance']}>
                <DocumentsPage />
              </Permission>
            }
          />
          <Route
            path="financeiro"
            element={
              <Permission roles={['admin', 'finance']}>
                <FinancePage />
              </Permission>
            }
          />
          <Route
            path="agenda"
            element={
              <Permission roles={['admin', 'support', 'finance']}>
                <AgendaPage />
              </Permission>
            }
          />
          <Route
            path="integracoes"
            element={
              <Permission roles={['admin']}>
                <IntegrationsPage />
              </Permission>
            }
          />
          <Route
            path="configuracoes"
            element={
              <Permission roles={['admin']}>
                <SettingsPage />
              </Permission>
            }
          />
          <Route
            path="portal"
            element={
              <Permission roles={['client']}>
                <PortalPage />
              </Permission>
            }
          />
          <Route
            path="portal/tickets"
            element={
              <Permission roles={['client']}>
                <TicketsPage />
              </Permission>
            }
          />
          <Route
            path="portal/tickets/:id"
            element={
              <Permission roles={['client']}>
                <TicketDetailPage />
              </Permission>
            }
          />
          <Route
            path="portal/documentos"
            element={
              <Permission roles={['client']}>
                <DocumentsPage />
              </Permission>
            }
          />
          <Route
            path="portal/financeiro"
            element={
              <Permission roles={['client']}>
                <FinancePage />
              </Permission>
            }
          />
          {/* CRM & Vendas */}
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="negocios" element={<Navigate to="/pipeline" replace />} />
          <Route path="propostas" element={<Propostas />} />
          <Route path="contratos-crm" element={<Contratos />} />
          <Route path="itens" element={<CrmItems />} />
          <Route path="automacoes" element={<Automacoes />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="empresas" element={<SuperAdminTenants />} />
          <Route path="politicas" element={<SuperAdminPolicyPanel />} />
          <Route path="catalogo" element={<Phonebook />} />
          <Route path="chamados" element={<Navigate to="/tickets" replace />} />
          <Route path="suporte" element={<Navigate to="/tickets" replace />} />
          <Route path="contatos" element={<Navigate to="/clientes" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
