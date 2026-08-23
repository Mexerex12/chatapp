import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MessageSquare } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(username, email, password);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao cadastrar");
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
          <h1 className="text-xl font-bold text-text-primary">Criar conta</h1>
          <p className="text-text-muted text-sm mt-1">Junte-se aos seus amigos</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase">Username</label>
            <input
              className="mt-1 w-full bg-bg-tertiary rounded-md px-3 py-2 text-text-primary outline-none focus:ring-2 focus:ring-brand"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              minLength={3}
              maxLength={24}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-muted uppercase">Email</label>
            <input
              type="email"
              className="mt-1 w-full bg-bg-tertiary rounded-md px-3 py-2 text-text-primary outline-none focus:ring-2 focus:ring-brand"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
              minLength={8}
            />
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-brand hover:bg-brand-hover disabled:opacity-60 transition-colors text-white rounded-md py-2 font-medium mt-2"
          >
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </form>

        <p className="text-text-muted text-sm mt-4">
          Já tem conta?{" "}
          <Link to="/login" className="text-brand hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
