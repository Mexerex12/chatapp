import { FormEvent, useState } from "react";
import { Hash, Volume2 } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "../api/client";
import { Channel } from "../types";

export function CreateChannelModal({
  serverId,
  defaultType,
  onClose,
  onCreated,
}: {
  serverId: string;
  defaultType: "TEXT" | "VOICE";
  onClose: () => void;
  onCreated: (c: Channel) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"TEXT" | "VOICE">(defaultType);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post(`/servers/${serverId}/channels`, { name: name.toLowerCase().replace(/\s+/g, "-"), type });
      onCreated(data.channel);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao criar canal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Criar canal" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase">Tipo de canal</label>
          <div className="flex gap-2 mt-1">
            <TypeOption icon={<Hash size={16} />} label="Texto" active={type === "TEXT"} onClick={() => setType("TEXT")} />
            <TypeOption icon={<Volume2 size={16} />} label="Voz" active={type === "VOICE"} onClick={() => setType("VOICE")} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase">Nome do canal</label>
          <div className="mt-1 flex items-center bg-bg-tertiary rounded-md px-3">
            {type === "TEXT" ? <Hash size={16} className="text-text-muted" /> : <Volume2 size={16} className="text-text-muted" />}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-transparent px-2 py-2 text-text-primary outline-none"
              placeholder="novo-canal"
              required
              maxLength={32}
            />
          </div>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand-hover disabled:opacity-60 transition-colors text-white rounded-md py-2 font-medium"
        >
          {loading ? "Criando..." : "Criar canal"}
        </button>
      </form>
    </Modal>
  );
}

function TypeOption({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center gap-2 justify-center py-2 rounded-md border text-sm transition-colors ${
        active ? "border-brand bg-brand/10 text-text-primary" : "border-white/10 text-text-muted hover:bg-bg-tertiary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
