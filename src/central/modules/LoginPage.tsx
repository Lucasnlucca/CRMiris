import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCheck,
  Headphones,
  Layers3,
  Network,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Brand, roleNames } from '../layouts/AppLayout';
import { Button, Field } from '../components/ui';
import type { Role } from '../types';
const roles: { id: Role; subtitle: string; icon: typeof ShieldCheck }[] = [
  { id: 'admin', subtitle: 'Toda a operação', icon: ShieldCheck },
  { id: 'support', subtitle: 'Atendimento e infraestrutura', icon: Headphones },
  { id: 'finance', subtitle: 'Cobranças e documentos', icon: Wallet },
  { id: 'client', subtitle: 'Uma visão do seu cliente', icon: UserRound },
];
export function LoginPage() {
  const { data, login, session } = useApp();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>(session?.role ?? 'admin');
  const [clientId, setClientId] = useState(session?.clientId || data.clients[0]?.id || '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-story-main">
          <div className="login-kicker">
            <span className="live-dot" />
            Mais conexão. Mais controle.
          </div>
          <h1>
            Sua operação inteira,
            <br />
            <span>no mesmo lugar.</span>
          </h1>
          <p>
            Uma central para cuidar dos seus clientes, acompanhar a infraestrutura e manter cada
            detalhe sob controle.
          </p>
          <div className="login-feature">
            <span>
              <Building2 size={16} />
            </span>
            Clientes e relacionamentos organizados
          </div>
          <div className="login-feature">
            <span>
              <Headphones size={16} />
            </span>
            Atendimento com contexto completo
          </div>
          <div className="login-feature">
            <span>
              <Network size={16} />
            </span>
            Visibilidade de toda a operação
          </div>
        </div>
        <div className="login-story-footer">
          <ShieldCheck size={13} />
          Central de Operações — Telefonia Fácil
        </div>
      </section>
      <section className="login-content">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await login(role, role === 'client' ? clientId : undefined);
              navigate(role === 'client' ? '/portal' : '/');
            } catch {
              /* reported by context */
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="login-overline">
            <Sparkles size={11} />
            SELETOR DE VISÃO OPERACIONAL
          </span>
          <h2>Alternar visão da Central</h2>
          <p className="login-description">
            Escolha a visão operacional ou acesse o Portal do Cliente.
          </p>
          <div className="role-options" role="group" aria-label="Selecione o perfil operacional">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`role-option ${role === r.id ? 'selected' : ''}`}
                aria-pressed={role === r.id}
                onClick={() => setRole(r.id)}
              >
                <span className="role-check">{role === r.id && <Check size={9} />}</span>
                <r.icon size={21} strokeWidth={1.5} />
                <strong>{roleNames[r.id]}</strong>
                <small>{r.subtitle}</small>
              </button>
            ))}
          </div>
          {role === 'client' && (
            <Field label="Cliente para visualização do Portal">
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Button
            className="login-submit"
            type="submit"
            loading={busy}
            disabled={role === 'client' && !clientId}
          >
            Acessar como {roleNames[role].toLowerCase()}
            <ArrowRight size={15} />
          </Button>
          <p className="login-note">
            Alterações são sincronizadas em tempo real na organização ativa.
          </p>
          <div className="login-back-link">TELEFONIA FÁCIL · CONECTANDO SUA OPERAÇÃO</div>
        </form>
      </section>
    </div>
  );
}
