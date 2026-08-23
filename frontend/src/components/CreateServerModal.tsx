import { FormEvent, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../api/client";
import { ServerSummary } from "../types";

export function CreateServerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: ServerSummary) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/servers", { name });
      onCreated(data.server);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao criar servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Criar um servidor" onClose={onClose}>
      <p className="text-sm text-text-muted mb-4">Seu servidor é onde você e seus amigos vão se reunir. Crie o seu e comece a conversar.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase">Nome do servidor</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full bg-bg-tertiary rounded-md px-3 py-2 text-text-primary outline-none focus:ring-2 focus:ring-brand"
            placeholder="Ex: Galera do jogo"
            required
            minLength={2}
            maxLength={50}
          />
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand-hover disabled:opacity-60 transition-colors text-white rounded-md py-2 font-medium"
        >
          {loading ? "Criando..." : "Criar"}
        </button>
      </form>
    </Modal>
  );
}
