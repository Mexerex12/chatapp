import { useState } from "react";
import { Copy, Check, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "../api/client";
import { ServerSummary } from "../types";

export function ServerSettingsModal({
  server,
  onClose,
  onUpdated,
  onDeleted,
}: {
  server: ServerSummary;
  onClose: () => void;
  onUpdated: (s: Partial<ServerSummary>) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(server.name);
  const [iconUrl, setIconUrl] = useState(server.iconUrl ?? "");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOwner = server.myRole === "OWNER";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch(`/servers/${server.id}`, { name, iconUrl });
      onUpdated(data.server);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function generateInvite() {
    const { data } = await api.post(`/servers/${server.id}/invites`);
    setInviteCode(data.invite.code);
    setCopied(false);
  }

  function copyInvite() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function deleteServer() {
    await api.delete(`/servers/${server.id}`);
    onDeleted();
  }

  return (
    <Modal title="Configurações do servidor" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase">Nome do servidor</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full bg-bg-tertiary rounded-md px-3 py-2 text-text-primary outline-none focus:ring-2 focus:ring-brand"
            maxLength={50}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase">URL do ícone (opcional)</label>
          <input
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            className="mt-1 w-full bg-bg-tertiary rounded-md px-3 py-2 text-text-primary outline-none focus:ring-2 focus:ring-brand"
            placeholder="https://..."
          />
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <button onClick={save} disabled={saving} className="bg-brand hover:bg-brand-hover disabled:opacity-60 text-white rounded-md py-2 font-medium text-sm">
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>

        <div className="border-t border-white/10 pt-4">
          <label className="text-xs font-semibold text-text-muted uppercase">Convite</label>
          {inviteCode ? (
            <div className="mt-1 flex items-center gap-2 bg-bg-tertiary rounded-md px-3 py-2">
              <span className="text-sm text-text-primary flex-1 truncate">{inviteCode}</span>
              <button onClick={copyInvite} className="text-text-muted hover:text-text-primary">
                {copied ? <Check size={16} className="text-online" /> : <Copy size={16} />}
              </button>
            </div>
          ) : (
            <button onClick={generateInvite} className="mt-1 w-full bg-bg-tertiary hover:bg-bg-elevated text-text-primary rounded-md py-2 text-sm">
              Gerar convite
            </button>
          )}
        </div>

        {isOwner && (
          <div className="border-t border-white/10 pt-4">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="w-full flex items-center justify-center gap-2 text-danger hover:bg-danger/10 rounded-md py-2 text-sm">
                <Trash2 size={15} /> Excluir servidor
              </button>
            ) : (
              <div className="text-sm">
                <p className="text-text-primary mb-2">Tem certeza? Essa ação não pode ser desfeita.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 bg-bg-tertiary rounded-md py-2 text-text-primary">
                    Cancelar
                  </button>
                  <button onClick={deleteServer} className="flex-1 bg-danger hover:bg-red-600 rounded-md py-2 text-white">
                    Excluir
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
