import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const { login, loading: authLoading } = useAuth();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(formData.email, formData.password);
    } catch (err: any) {
      setError(err?.message || "Erro ao processar requisicao");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0d1117]">
      {/* Left Panel - Dark illustration area */}
      <div className="hidden lg:flex lg:w-[58%] relative bg-[#090d14] overflow-hidden border-r border-white/[0.08]">
        {/* Background subtle effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl" />
        </div>

        {/* Illustration Image */}
        <div className="relative z-10 flex items-center justify-center w-full p-12">
          <img
            src="/login/painelloginfoto copy.png"
            alt="Dashboard CRM Preview"
            className="w-full max-w-[1280px] object-contain drop-shadow-2xl opacity-90"
          />
        </div>

        {/* Bottom tagline */}
        <div className="absolute bottom-8 left-8 right-8 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/logoicon copy copy.png" alt="Logo" className="w-8 h-8 object-contain" />
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
          <p className="text-gray-400 text-sm">
            Atendimento completo <span className="text-white font-medium">em um so lugar.</span>
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center bg-[#0d1117] p-8 lg:p-16">
        <div className="w-full max-w-[380px]">
          {/* Logo */}
          <div className="mb-10">
            <img
              src="/1.png"
              alt="Iris Horizon"
              className="h-14 w-auto object-contain"
            />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Entre na sua conta</h1>
            <p className="text-gray-400 text-sm">Insira suas credenciais para acessar o painel</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider">E-mail</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="seu@email.com"
                className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.04] text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, password: e.target.value }))
                  }
                  placeholder="••••••••"
                  className="w-full h-11 px-4 pr-12 rounded-xl border border-white/10 bg-white/[0.04] text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-800/40 text-red-300 text-xs text-center py-2.5 px-4 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || authLoading}
              className="w-full h-11 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-sm active:scale-[0.99] mt-2"
            >
              {submitting || authLoading ? "Processando..." : "Entrar no CRM"}
            </button>
          </form>

          {/* Links */}
          <div className="flex items-center justify-between mt-6">
            <button type="button" onClick={() => alert("A recuperação de senha estará disponível em breve. Entre em contato com o administrador.")} className="text-xs text-gray-400 hover:text-indigo-400 transition-colors">
              Esqueceu a senha?
            </button>
          </div>

          <div className="mt-4 text-center text-xs text-gray-400">
            Ainda nao tem uma conta?{" "}
            <a href="/register" className="text-indigo-400 font-semibold hover:text-indigo-300 transition-colors">
              Cadastre-se
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
