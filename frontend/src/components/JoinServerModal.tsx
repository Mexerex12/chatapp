import { FormEvent, useState } from "react";
import { Modal } from "./Modal";
import { api } from "../api/client";
import { ServerSummary } from "../types";

function extractCode(input: string): string {
  const trimmed = input.trim();
  const parts = trimmed.split("/");
  return parts[parts.length - 1];
}

export function JoinServerModal({ onClose, onJoined }: { onClose: () => void; onJoined: (s: ServerSummary) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post(`/servers/join/${extractCode(code)}`);
      onJoined(data.server);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Convite inválido ou expirado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Entrar em um servidor" onClose={onClose}>
      <p className="text-sm text-text-muted mb-4">Cole um convite abaixo para entrar em um servidor existente.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase">Link ou código do convite</label>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full bg-bg-tertiary rounded-md px-3 py-2 text-text-primary outline-none focus:ring-2 focus:ring-brand"
            placeholder="Ex: aZ9kLmQ2Xy"
            required
          />
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand-hover disabled:opacity-60 transition-colors text-white rounded-md py-2 font-medium"
        >
          {loading ? "Entrando..." : "Entrar no servidor"}
        </button>
      </form>
    </Modal>
  );
}
