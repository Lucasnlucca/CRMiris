import { useState, useRef, useEffect } from "react";
import { User, Mail, Lock, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import "../styles/loginButton.css";
import "../styles/inputslogin.css";

export default function Register() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onCanPlay = () => setVideoLoaded(true);
    video.addEventListener("canplaythrough", onCanPlay);
    if (video.readyState >= 4) setVideoLoaded(true);

    return () => video.removeEventListener("canplaythrough", onCanPlay);
  }, []);

  const { register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError("As senhas não coincidem");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres");
      setLoading(false);
      return;
    }

    try {
      await register(formData.name, formData.email, formData.password);
      setSuccess("Conta criada com sucesso! Redirecionando...");
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page relative min-h-screen overflow-hidden flex items-center justify-center p-4">
      <div className="fixed inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            videoLoaded ? "opacity-100" : "opacity-0"
          }`}
        >
          <source src="/login/fundologin.mp4" type="video/mp4" />
        </video>

        <div
          className={`absolute inset-0 bg-gradient-to-br from-[#0a1628]/90 via-[#0a1628]/70 to-[#043b5c]/80 transition-opacity duration-700 ${
            videoLoaded ? "opacity-100" : "opacity-0"
          }`}
        />

        <div
          className={`absolute inset-0 bg-[#0a1628] transition-opacity duration-1000 ${
            videoLoaded ? "opacity-0" : "opacity-100"
          }`}
        />
      </div>

      <div className="relative z-20 flex items-center justify-center w-full animate-fade-in">
        <div className="w-[440px] bg-[#121824]/95 backdrop-blur-xl rounded-2xl border border-white/10 px-10 pt-9 pb-8 shadow-2xl">
          <div className="w-full max-w-[345px] mx-auto">
            <div className="text-center mb-8">
              <div className="flex items-center justify-center mb-4">
                <img
                  src="/1.png"
                  alt="Iris Horizon"
                  className="h-14 w-auto object-contain drop-shadow-sm"
                />
              </div>

              <h2 className="text-xl font-bold text-white tracking-tight mb-1">Crie sua conta</h2>
              <p className="text-gray-400 text-xs leading-relaxed">
                Cadastre-se para acessar o CRM e centralizar seu atendimento
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 z-10" />
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Nome completo"
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 z-10" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="seu@email.com"
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 z-10" />
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  placeholder="Senha (mínimo 6 caracteres)"
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 z-10" />
                <input
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmPassword: e.target.value })
                  }
                  placeholder="Confirme sua senha"
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.04] text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all"
                />
              </div>

              {error && (
                <div className="bg-red-950/40 border border-red-800/40 text-red-300 text-xs text-center py-2 px-3 rounded-xl">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs text-center py-2 px-3 rounded-xl">
                  {success}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-sm active:scale-[0.99]"
                >
                  {loading ? "Processando..." : "Criar Conta"}
                </button>
              </div>
            </form>

            <div className="flex items-center justify-center text-xs text-gray-400 mt-6">
              <a
                href="/"
                className="flex items-center gap-1.5 hover:text-indigo-400 transition-colors duration-200"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar para o login
              </a>
            </div>

            <div className="text-center text-[10px] text-gray-500 mt-4 tracking-wider uppercase">
              Iris Horizon CRM
            </div>
          </div>
        </div>
      </div>

      <a
        href="https://wa.me/551931994699"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-30 bg-green-500 hover:bg-green-600 hover:scale-110 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(34,197,94,0.4)] transition-all duration-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="26"
          height="26"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M20.52 3.48A11.78 11.78 0 0012.01 0C5.38 0 .01 5.37 0 12c0 2.12.55 4.18 1.6 6L0 24l6.17-1.62A11.94 11.94 0 0012 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.2-3.48-8.52zM12 21.8c-1.87 0-3.7-.5-5.3-1.45l-.38-.23-3.66.96.98-3.57-.25-.37A9.77 9.77 0 012.2 12c0-5.41 4.39-9.8 9.8-9.8 2.62 0 5.08 1.02 6.93 2.87A9.75 9.75 0 0121.8 12c0 5.41-4.39 9.8-9.8 9.8zm5.39-7.33c-.29-.14-1.72-.85-1.98-.94-.27-.1-.46-.14-.66.14-.19.29-.76.94-.93 1.13-.17.2-.35.22-.64.08-.29-.14-1.23-.45-2.34-1.44-.86-.77-1.44-1.72-1.61-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.35.43-.52.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.5-.07-.14-.66-1.6-.9-2.19-.23-.56-.47-.48-.66-.49-.17-.01-.36-.01-.55-.01-.19 0-.5.07-.76.36-.26.29-1 1-1 2.44 0 1.44 1.03 2.83 1.18 3.03.14.19 2.02 3.09 4.9 4.33.69.3 1.23.48 1.65.61.69.22 1.32.19 1.82.12.56-.08 1.72-.7 1.96-1.38.24-.68.24-1.26.17-1.38-.07-.12-.26-.19-.55-.33z" />
        </svg>
      </a>
    </div>
  );
}
