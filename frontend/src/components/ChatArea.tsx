import { useEffect, useRef, useState, FormEvent } from "react";
import { Hash, Send } from "lucide-react";
import { Socket } from "socket.io-client";
import { api } from "../api/client";
import { Channel, Message } from "../types";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";

interface Props {
  channel: Channel;
  socket: Socket | null;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return "Hoje";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function ChatArea({ channel, socket }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    api.get(`/channels/${channel.id}/messages`).then(({ data }) => {
      if (!cancelled) {
        setMessages(data.messages);
        setLoading(false);
      }
    });
    socket?.emit("channel:join", channel.id);
    return () => {
      cancelled = true;
      socket?.emit("channel:leave", channel.id);
    };
  }, [channel.id, socket]);

  useEffect(() => {
    if (!socket) return;
    function onNew(msg: Message) {
      if (msg.channelId !== channel.id) return;
      setMessages((prev) => [...prev, msg]);
    }
    function onTyping(data: { userId: string; username: string; typing: boolean }) {
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (data.typing) next[data.userId] = data.username;
        else delete next[data.userId];
        return next;
      });
    }
    socket.on("message:new", onNew);
    socket.on("typing:update", onTyping);
    return () => {
      socket.off("message:new", onNew);
      socket.off("typing:update", onTyping);
    };
  }, [socket, channel.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleTyping() {
    if (!socket) return;
    socket.emit("typing:start", channel.id);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => socket.emit("typing:stop", channel.id), 1500);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || !socket) return;
    socket.emit("message:send", { channelId: channel.id, content }, (res: { error?: string }) => {
      if (res?.error) console.error(res.error);
    });
    setText("");
    socket.emit("typing:stop", channel.id);
  }

  const typingNames = Object.values(typingUsers).filter((n) => n !== user?.username);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg-primary h-full">
      <div className="h-12 flex items-center gap-2 px-4 border-b border-black/20 shadow-sm shrink-0">
        <Hash size={20} className="text-text-muted" />
        <span className="font-semibold text-text-primary">{channel.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Carregando mensagens…</div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-2">
            <Hash size={48} className="opacity-30" />
            <p className="font-medium text-text-primary">Este é o começo do canal #{channel.name}</p>
            <p className="text-sm">Envie a primeira mensagem!</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const grouped = prev && prev.authorId === m.authorId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
            const newDay = !prev || formatDay(prev.createdAt) !== formatDay(m.createdAt);
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs text-text-muted font-medium">{formatDay(m.createdAt)}</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                )}
                <div className={`flex gap-3 py-0.5 hover:bg-white/[0.02] px-2 -mx-2 rounded ${grouped ? "" : "mt-3"}`}>
                  {grouped ? (
                    <div className="w-9 shrink-0" />
                  ) : (
                    <Avatar username={m.author.username} color={m.author.avatarColor} avatarUrl={m.author.avatarUrl} size={36} />
                  )}
                  <div className="min-w-0">
                    {!grouped && (
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-text-primary text-sm">{m.author.username}</span>
                        <span className="text-xs text-text-muted">{formatTime(m.createdAt)}</span>
                      </div>
                    )}
                    <p className="text-[15px] text-text-primary/90 whitespace-pre-wrap break-words leading-snug">{m.content}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4 pt-1 shrink-0">
        {typingNames.length > 0 && (
          <p className="text-xs text-text-muted mb-1 h-4">
            {typingNames.join(", ")} {typingNames.length > 1 ? "estão digitando…" : "está digitando…"}
          </p>
        )}
        <form onSubmit={onSubmit} className="flex items-center gap-2 bg-bg-tertiary rounded-lg px-3">
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleTyping();
            }}
            placeholder={`Conversar em #${channel.name}`}
            className="flex-1 bg-transparent py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
            maxLength={4000}
          />
          <button type="submit" disabled={!text.trim()} className="text-text-muted hover:text-brand disabled:opacity-40 p-1">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
