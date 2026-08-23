import { useState } from "react";
import { X, UserPlus, Check } from "lucide-react";
import { Avatar } from "./Avatar";
import { api } from "../api/client";
import { User } from "../types";

export function UserProfilePopover({ member, onClose }: { member: User; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addFriend() {
    try {
      await api.post("/friends/requests", { username: member.username });
      setSent(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Erro ao enviar solicitação");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-72 bg-bg-elevated rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-16 bg-brand relative">
          <button onClick={onClose} className="absolute top-2 right-2 text-white/80 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pb-4">
          <div className="-mt-8 mb-2">
            <Avatar username={member.username} color={member.avatarColor} avatarUrl={member.avatarUrl} size={64} />
          </div>
          <p className="font-bold text-lg text-text-primary">{member.username}</p>
          <p className="text-xs text-text-muted mb-3">{member.status === "online" ? "Online" : "Offline"}</p>

          {error && <p className="text-danger text-xs mb-2">{error}</p>}

          <button
            onClick={addFriend}
            disabled={sent}
            className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-60 text-white text-sm py-2 rounded-md transition-colors"
          >
            {sent ? (
              <>
                <Check size={15} /> Solicitação enviada
              </>
            ) : (
              <>
                <UserPlus size={15} /> Adicionar amigo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
