import { useEffect, useState, FormEvent } from "react";
import { UserPlus, Check, X, Trash2, Users } from "lucide-react";
import { Socket } from "socket.io-client";
import { api } from "../api/client";
import { Avatar } from "./Avatar";
import { User, FriendRequestItem } from "../types";

interface FriendItem extends User {
  status: "online" | "offline";
}

export function FriendsView({ socket }: { socket: Socket | null }) {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [tab, setTab] = useState<"online" | "all" | "pending">("online");
  const [addUsername, setAddUsername] = useState("");
  const [addStatus, setAddStatus] = useState<{ error?: string; success?: string } | null>(null);

  async function refresh() {
    const { data } = await api.get("/friends");
    setFriends(data.friends);
    setIncoming(data.incoming);
    setOutgoing(data.outgoing);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!socket) return;
    function onRequestReceived(req: FriendRequestItem) {
      setIncoming((prev) => [...prev, req]);
    }
    function onRequestAccepted() {
      refresh();
    }
    function onPresence(data: { userId: string; status: string }) {
      setFriends((prev) => prev.map((f) => (f.id === data.userId ? { ...f, status: data.status as "online" | "offline" } : f)));
    }
    socket.on("friend:request-received", onRequestReceived);
    socket.on("friend:request-accepted", onRequestAccepted);
    socket.on("presence:update", onPresence);
    return () => {
      socket.off("friend:request-received", onRequestReceived);
      socket.off("friend:request-accepted", onRequestAccepted);
      socket.off("presence:update", onPresence);
    };
  }, [socket]);

  async function sendRequest(e: FormEvent) {
    e.preventDefault();
    setAddStatus(null);
    try {
      await api.post("/friends/requests", { username: addUsername.trim() });
      setAddStatus({ success: "Solicitação enviada!" });
      setAddUsername("");
      refresh();
    } catch (err: any) {
      setAddStatus({ error: err?.response?.data?.error || "Erro ao enviar solicitação" });
    }
  }

  async function accept(id: string) {
    await api.post(`/friends/requests/${id}/accept`);
    refresh();
  }
  async function decline(id: string) {
    await api.post(`/friends/requests/${id}/decline`);
    refresh();
  }
  async function remove(userId: string) {
    await api.delete(`/friends/${userId}`);
    refresh();
  }

  const visibleFriends = tab === "online" ? friends.filter((f) => f.status === "online") : friends;

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
      <div className="h-12 flex items-center gap-4 px-4 border-b border-black/20 shrink-0">
        <div className="flex items-center gap-1.5 text-text-primary font-semibold">
          <Users size={18} /> Amigos
        </div>
        <div className="flex gap-1">
          {(["online", "all", "pending"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded text-sm ${tab === t ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:bg-bg-tertiary/50"}`}
            >
              {t === "online" ? "Online" : t === "all" ? "Todos" : `Pendentes ${incoming.length ? `(${incoming.length})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 border-b border-black/20">
        <form onSubmit={sendRequest} className="flex gap-2">
          <input
            value={addUsername}
            onChange={(e) => setAddUsername(e.target.value)}
            placeholder="Adicionar amigo pelo username"
            className="flex-1 bg-bg-tertiary rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-brand"
          />
          <button type="submit" className="bg-brand hover:bg-brand-hover text-white text-sm px-4 rounded-md flex items-center gap-1.5">
            <UserPlus size={15} /> Enviar
          </button>
        </form>
        {addStatus?.error && <p className="text-danger text-xs mt-1">{addStatus.error}</p>}
        {addStatus?.success && <p className="text-online text-xs mt-1">{addStatus.success}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tab === "pending" ? (
          <>
            {incoming.length === 0 && outgoing.length === 0 && <EmptyState text="Nenhuma solicitação pendente" />}
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-2 py-2 hover:bg-bg-tertiary/50 rounded-md">
                <Avatar username={r.sender?.username ?? "?"} color={r.sender?.avatarColor} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{r.sender?.username}</p>
                  <p className="text-xs text-text-muted">Enviou uma solicitação de amizade</p>
                </div>
                <button onClick={() => accept(r.id)} className="w-8 h-8 rounded-full bg-bg-tertiary hover:bg-online flex items-center justify-center text-text-primary hover:text-white">
                  <Check size={15} />
                </button>
                <button onClick={() => decline(r.id)} className="w-8 h-8 rounded-full bg-bg-tertiary hover:bg-danger flex items-center justify-center text-text-primary hover:text-white">
                  <X size={15} />
                </button>
              </div>
            ))}
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-2 py-2 hover:bg-bg-tertiary/50 rounded-md opacity-70">
                <Avatar username={r.receiver?.username ?? "?"} color={r.receiver?.avatarColor} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{r.receiver?.username}</p>
                  <p className="text-xs text-text-muted">Solicitação enviada — aguardando</p>
                </div>
              </div>
            ))}
          </>
        ) : visibleFriends.length === 0 ? (
          <EmptyState text={tab === "online" ? "Nenhum amigo online agora" : "Você ainda não tem amigos adicionados"} />
        ) : (
          visibleFriends.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-2 py-2 hover:bg-bg-tertiary/50 rounded-md group">
              <Avatar username={f.username} color={f.avatarColor} avatarUrl={f.avatarUrl} size={36} status={f.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{f.username}</p>
                <p className="text-xs text-text-muted capitalize">{f.status === "online" ? "Online" : "Offline"}</p>
              </div>
              <button onClick={() => remove(f.id)} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger p-1.5" title="Remover amigo">
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-2">
      <Users size={40} className="opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
