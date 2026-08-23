import { useState } from "react";
import { Hash, Volume2, ChevronDown, Plus, Settings, Mic, MicOff, LogOut, Users2 } from "lucide-react";
import { Channel, ServerSummary } from "../types";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "./Avatar";

interface Props {
  server: ServerSummary;
  activeChannelId: string | null;
  onSelectChannel: (channel: Channel) => void;
  voiceChannelId: string | null;
  voiceParticipantCount: (channelId: string) => number;
  onOpenSettings: () => void;
  onOpenCreateChannel: (type: "TEXT" | "VOICE") => void;
  onLeaveServer: () => void;
  micMuted: boolean;
  onToggleMic: () => void;
  inCall: boolean;
}

export function ChannelSidebar({
  server,
  activeChannelId,
  onSelectChannel,
  voiceChannelId,
  voiceParticipantCount,
  onOpenSettings,
  onOpenCreateChannel,
  onLeaveServer,
  micMuted,
  onToggleMic,
  inCall,
}: Props) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const canManage = server.myRole === "OWNER" || server.myRole === "ADMIN";

  const textChannels = server.channels.filter((c) => c.type === "TEXT").sort((a, b) => a.position - b.position);
  const voiceChannels = server.channels.filter((c) => c.type === "VOICE").sort((a, b) => a.position - b.position);

  return (
    <div className="w-60 bg-bg-primary flex flex-col shrink-0 h-full">
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 h-12 border-b border-black/20 shadow-sm hover:bg-bg-tertiary/50 transition-colors"
        >
          <span className="font-semibold text-text-primary truncate">{server.name}</span>
          <ChevronDown size={16} className="text-text-muted" />
        </button>
        {menuOpen && (
          <div className="absolute z-30 top-12 left-2 right-2 bg-bg-elevated rounded-md shadow-xl p-1.5 text-sm">
            {canManage && (
              <MenuItem icon={<Settings size={15} />} label="Configurações do servidor" onClick={() => { setMenuOpen(false); onOpenSettings(); }} />
            )}
            {canManage && (
              <MenuItem icon={<Plus size={15} />} label="Criar canal de texto" onClick={() => { setMenuOpen(false); onOpenCreateChannel("TEXT"); }} />
            )}
            {canManage && (
              <MenuItem icon={<Plus size={15} />} label="Criar canal de voz" onClick={() => { setMenuOpen(false); onOpenCreateChannel("VOICE"); }} />
            )}
            <MenuItem
              icon={<LogOut size={15} />}
              label="Sair do servidor"
              danger
              onClick={() => { setMenuOpen(false); onLeaveServer(); }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <ChannelGroup title="TEXTO" onAdd={canManage ? () => onOpenCreateChannel("TEXT") : undefined}>
          {textChannels.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectChannel(c)}
              className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors group ${
                activeChannelId === c.id ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:bg-bg-tertiary/60 hover:text-text-primary"
              }`}
            >
              <Hash size={17} className="shrink-0 opacity-70" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </ChannelGroup>

        <ChannelGroup title="VOZ" onAdd={canManage ? () => onOpenCreateChannel("VOICE") : undefined}>
          {voiceChannels.map((c) => {
            const count = voiceParticipantCount(c.id);
            const isActive = voiceChannelId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelectChannel(c)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                  isActive ? "bg-bg-tertiary text-online" : "text-text-muted hover:bg-bg-tertiary/60 hover:text-text-primary"
                }`}
              >
                <Volume2 size={17} className="shrink-0 opacity-70" />
                <span className="truncate flex-1 text-left">{c.name}</span>
                {count > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-text-muted">
                    <Users2 size={12} /> {count}
                  </span>
                )}
              </button>
            );
          })}
        </ChannelGroup>
      </div>

      <div className="h-14 bg-bg-secondary flex items-center px-2 gap-2">
        <Avatar username={user?.username || "?"} color={user?.avatarColor} avatarUrl={user?.avatarUrl} size={32} status="online" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">{user?.username}</p>
          <p className="text-xs text-text-muted">{inCall ? (micMuted ? "Microfone mudo" : "Em chamada") : "Online"}</p>
        </div>
        {inCall && (
          <button
            onClick={onToggleMic}
            className={`w-8 h-8 flex items-center justify-center rounded-md hover:bg-bg-tertiary ${micMuted ? "text-danger" : "text-text-muted"}`}
            title={micMuted ? "Ativar microfone" : "Mutar microfone"}
          >
            {micMuted ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
        )}
        <button onClick={logout} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-bg-tertiary text-text-muted" title="Sair da conta">
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

function ChannelGroup({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between px-1.5 mb-1">
        <span className="text-xs font-semibold text-text-muted tracking-wide">{title}</span>
        {onAdd && (
          <button onClick={onAdd} className="text-text-muted hover:text-text-primary">
            <Plus size={15} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-left ${danger ? "text-danger hover:bg-danger/10" : "text-text-primary hover:bg-brand hover:text-white"}`}
    >
      {icon}
      {label}
    </button>
  );
}
