import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { extractTenantSlugFromLocation, Tenant } from "../context/TenantContext";
import { Eye, EyeOff, Sparkles, X, Mail, Lock, ArrowRight } from "lucide-react";

interface LoginProps {
  isPortal?: boolean;
}

export default function Login({ isPortal }: LoginProps = {}) {
  const { login, loading: authLoading } = useAuth();

  const isClientPortal = isPortal ?? (
    typeof window !== "undefined" && (
      window.location.pathname.startsWith('/portal-login') ||
      window.location.pathname.startsWith('/portal/login')
    )
  );

  const [formData, setFormData] = useState(() => ({
    email: (typeof window !== "undefined" ? localStorage.getItem("crm_last_login_email") : "") || "",
    password: "",
  }));

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"email" | "password" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resolvedTenant, setResolvedTenant] = useState<Tenant | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const formatLoginError = (err: any): string => {
    const rawMsg = err?.message || String(err || "");
    const lower = rawMsg.toLowerCase();

    if (
      lower.includes("rate limit") ||
      lower.includes("tentativas") ||
      err?.type === "general_rate_limit_exceeded" ||
      err?.code === 429
    ) {
      return "Muitas tentativas consecutivas de acesso. Por motivos de segurança, aguarde alguns instantes antes de tentar novamente.";
    }

    return "E-mail ou senha incorretos. Tente novamente.";
  };

  useEffect(() => {
    const slug = extractTenantSlugFromLocation();
    if (!slug) return;
    fetch(`/api/admin/tenants/resolve/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.success && json.tenant) {
          setResolvedTenant(json.tenant);
          if (typeof document !== "undefined") {
            document.documentElement.setAttribute("data-tenant-slug", json.tenant.slug);
            document.documentElement.setAttribute("data-tenant-id", json.tenant.id);
            document.title = `${json.tenant.trade_name || json.tenant.name} — ${isClientPortal ? 'Portal do Assinante' : 'Login CRM'}`;
          }
        }
      })
      .catch(() => { });
  }, [isClientPortal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setErrorField(null);
    setSubmitting(true);

    const emailTyped = formData.email;

    try {
      if (typeof window !== "undefined" && emailTyped) {
        localStorage.setItem("crm_last_login_email", emailTyped);
      }

      if (isClientPortal) {
        const currentTenant =
          resolvedTenant?.id ||
          (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("active_tenant_id") : null) ||
          (typeof localStorage !== "undefined" ? localStorage.getItem("active_tenant_id") : null) ||
          undefined;
        const searchParams =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const activateToken =
          searchParams?.get("activateToken") || searchParams?.get("activation_token");

        if (activateToken) {
          const actRes = await fetch("/api/portal/auth/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailTyped.trim().toLowerCase(),
              password: formData.password,
              token: activateToken,
              tenantId: currentTenant,
            }),
          });
          const actJson = await actRes.json().catch(() => ({}));
          if (!actRes.ok || !actJson?.success) {
            throw new Error(actJson?.error || "Não foi possível ativar o acesso ao portal.");
          }
          const issuedToken = actJson.portalToken || actJson.token;
          if (issuedToken && typeof sessionStorage !== "undefined") {
            sessionStorage.setItem("crm_portal_token", issuedToken);
          }
        }

        await login(emailTyped, formData.password);

        if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem("crm_portal_token")) {
          try {
            const pRes = await fetch("/api/portal/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: emailTyped.trim().toLowerCase(),
                password: formData.password,
                tenantId: currentTenant,
              }),
            });
            const pJson = await pRes.json().catch(() => ({}));
            const issuedToken = pJson?.portalToken || pJson?.token || pJson?.session?.secret;
            if (pRes.ok && issuedToken) {
              sessionStorage.setItem("crm_portal_token", issuedToken);
            }
          } catch {}
        }

        window.location.href = '/portal';
      } else {
        await login(emailTyped, formData.password);
        window.location.href = '/';
      }
    } catch (err: any) {
      const msg = formatLoginError(err);
      setError(msg);

      // MANTÉM o e-mail no campo email e APAGA SOMENTE a senha
      setFormData({
        email: emailTyped,
        password: "",
      });

      setErrorField('password');
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#ffffff] relative overflow-hidden select-none">
      {/* Background Subtle Floating Geometric Accents in Emerald */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Subtle Top Left Zigzag Wave */}
        <svg
          className="absolute -top-6 left-12 w-32 h-32 text-emerald-300/35"
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 20 L25 35 L40 20 L55 35 L70 20 L85 35" />
          <path d="M10 40 L25 55 L40 40 L55 55 L70 40 L85 55" />
        </svg>

        {/* Subtle Bottom Left Zigzag Wave */}
        <svg
          className="absolute bottom-8 left-16 w-36 h-36 text-emerald-300/30"
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 30 L25 45 L40 30 L55 45 L70 30 L85 45" />
          <path d="M10 50 L25 65 L40 50 L55 65 L70 50 L85 65" />
        </svg>

        {/* Subtle Floating Dots */}
        <div className="absolute top-20 left-1/3 w-2 h-2 rounded-full bg-emerald-400/30" />
        <div className="absolute top-1/2 left-12 w-2.5 h-2.5 rounded-full bg-emerald-500/25" />
        <div className="absolute bottom-32 left-1/4 w-2 h-2 rounded-full bg-emerald-400/30" />
        <div className="absolute top-16 right-1/4 w-2 h-2 rounded-full bg-emerald-400/25" />
        <div className="absolute bottom-16 right-16 w-2.5 h-2.5 rounded-full bg-emerald-500/20" />

        {/* Subtle Bottom Right Accent */}
        <svg
          className="absolute -bottom-10 right-8 w-44 h-44 text-emerald-200/30"
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 40 L25 55 L40 40 L55 55 L70 40 L85 55" />
          <path d="M10 60 L25 75 L40 60 L55 75 L70 60 L85 75" />
        </svg>
      </div>

      {/* Left Panel: 3D Dashboard Mockup Seamless Presentation */}
      <div className="hidden lg:flex lg:w-[56%] xl:w-[58%] relative items-center justify-center p-8 xl:p-14 overflow-hidden z-10">
        <div className="relative z-10 w-full flex items-center justify-center max-w-[760px] xl:max-w-[840px] 2xl:max-w-[900px]">
          <img
            src="/login/dashboard-3d.png"
            alt="CRM Platform Preview"
            className="w-full h-auto object-contain hover:scale-[1.01] transition-transform duration-500 ease-out select-none pointer-events-none"
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>
      </div>

      {/* Right Panel: High-End Polished Authentication Card */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14 xl:p-20 z-10">
        <div className="w-full max-w-[440px] -translate-y-8 sm:-translate-y-12 lg:-translate-y-14 transition-transform duration-300">
          {/* Header & Logo */}
          <div className="mb-6">
            <div className="mb-2 flex items-center">
              <img
                src={resolvedTenant?.logo_url || "/login/lvp-logo.png"}
                alt={resolvedTenant?.name || "LVPlatform"}
                className="h-[160px] sm:h-[176px] w-auto object-contain select-none transition-all duration-300 -ml-1"
                style={{ mixBlendMode: 'multiply' }}
              />
            </div>

            <h1 className="text-3xl sm:text-[38px] font-black text-slate-900 tracking-tight leading-none mb-2">
              {isClientPortal ? 'Portal do Assinante' : 'Welcome Back'}
            </h1>
            <p className="text-slate-400 text-base font-normal leading-relaxed">
              {isClientPortal
                ? 'Acesse suas faturas, contratos e solicitações'
                : 'Please login your account'}
            </p>
          </div>

          {isClientPortal && (
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 text-xs text-emerald-900 mb-6 flex items-start gap-3 shadow-xs">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-emerald-950 text-sm mb-0.5">Área exclusiva do cliente</span>
                Utilize o e-mail cadastrado e sua senha de acesso.
              </div>
            </div>
          )}

          {/* Form with Robust, High-End Styling */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2.5">
                Email
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#00c988] transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  ref={emailInputRef}
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => {
                    if (error) setError("");
                    if (errorField) setErrorField(null);
                    setFormData((prev) => ({ ...prev, email: e.target.value }));
                  }}
                  placeholder="admin@gmail.com"
                  className={`w-full h-[54px] pl-12 pr-4 rounded-2xl border-[1.5px] bg-white text-slate-900 placeholder:text-slate-400 text-base font-medium transition-all duration-200 focus:outline-none shadow-xs ${errorField === 'email'
                      ? 'border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:shadow-[0_0_0_4px_rgba(244,63,94,0.15)]'
                      : 'border-slate-200 hover:border-slate-300 focus:border-[#00c988] focus:shadow-[0_0_0_4px_rgba(0,201,136,0.14)]'
                    }`}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2.5">
                Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-[#00c988] transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  required
                  value={formData.password}
                  onChange={(e) => {
                    if (error) setError("");
                    if (errorField) setErrorField(null);
                    setFormData((prev) => ({ ...prev, password: e.target.value }));
                  }}
                  placeholder="enter your password"
                  className={`w-full h-[54px] pl-12 pr-12 rounded-2xl border-[1.5px] bg-white text-slate-900 placeholder:text-slate-400 text-base font-medium transition-all duration-200 focus:outline-none shadow-xs ${errorField === 'password'
                      ? 'border-rose-400 bg-rose-50/20 focus:border-rose-500 focus:shadow-[0_0_0_4px_rgba(244,63,94,0.15)]'
                      : 'border-slate-200 hover:border-slate-300 focus:border-[#00c988] focus:shadow-[0_0_0_4px_rgba(0,201,136,0.14)]'
                    }`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-700 transition-colors p-1"
                  aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Forgot Password Link in Emerald Green */}
              <div className="flex justify-end mt-2.5">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-sm font-semibold text-[#00c988] hover:text-[#059669] transition-colors cursor-pointer"
                >
                  Forgot Password
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm py-3 px-4 rounded-2xl flex items-center gap-2.5 shadow-xs animate-in fade-in duration-200">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Sign in Button in Substantial, Bold Emerald Theme */}
            <button
              type="submit"
              disabled={submitting || authLoading}
              className="w-full h-[54px] bg-gradient-to-r from-[#00c988] via-[#00bd7e] to-[#059669] hover:from-[#00b57a] hover:to-[#047857] text-white text-[17px] font-bold rounded-2xl transition-all duration-200 shadow-[0_10px_24px_-4px_rgba(0,201,136,0.42)] hover:shadow-[0_14px_30px_-4px_rgba(0,201,136,0.52)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer tracking-wide mt-2"
            >
              <span>{submitting || authLoading ? "Signing in..." : "Sign in"}</span>
              {!submitting && !authLoading && <ArrowRight className="w-5 h-5 opacity-90 transition-transform group-hover:translate-x-1" />}
            </button>
          </form>
        </div>
      </div>

      {/* Modal de Esqueceu a Senha */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-7 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
              <h3 className="text-xl font-bold text-slate-900">Recuperação de Senha</h3>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[15px] text-slate-600 mb-6 leading-relaxed">
              {isClientPortal
                ? "Para redefinir sua senha de acesso ao portal, entre em contato direto com a empresa fornecedora dos serviços contratados."
                : "Para redefinir sua senha do CRM, solicite o reset através do administrador da sua organização ou pelo suporte técnico."}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="px-6 py-3 text-sm font-bold text-white bg-gradient-to-r from-[#00c988] to-[#059669] hover:from-[#00b57a] hover:to-[#047857] rounded-2xl transition-colors shadow-md shadow-emerald-500/25"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
