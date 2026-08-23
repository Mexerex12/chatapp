import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MessageSquare } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(emailOrUsername, password);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-secondary px-4">
      <div className="w-full max-w-sm bg-bg-primary rounded-xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand flex items-center justify-center mb-3">
            <MessageSquare size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-text-primary">Bem-vindo de volta</h1>
          <p className="text-text-muted text-sm mt-1">Entre para continuar</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase">Email ou username</label>
            <input
              className="mt-1 w-full bg-bg-tertiary rounded-md px-3 py-2 text-text-primary outline-none focus:ring-2 focus:ring-brand"
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase">Senha</label>
            <input
              type="password"
              className="mt-1 w-full bg-bg-tertiary rounded-md px-3 py-2 text-text-primary outline-none focus:ring-2 focus:ring-brand"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-brand hover:bg-brand-hover disabled:opacity-60 transition-colors text-white rounded-md py-2 font-medium mt-2"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-text-muted text-sm mt-4">
          Não tem conta?{" "}
          <Link to="/register" className="text-brand hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
