import { Plus, Compass, MessageCircle } from "lucide-react";
import { ServerSummary } from "../types";

interface Props {
  servers: ServerSummary[];
  activeServerId: string | null;
  onSelectServer: (id: string | null) => void;
  onCreateClick: () => void;
  onJoinClick: () => void;
}

export function ServerSidebar({ servers, activeServerId, onSelectServer, onCreateClick, onJoinClick }: Props) {
  return (
    <div className="w-[72px] bg-bg-secondary flex flex-col items-center py-3 gap-2 shrink-0">
      <SidebarIcon
        active={activeServerId === null}
        onClick={() => onSelectServer(null)}
        label="Mensagens diretas / Amigos"
      >
        <MessageCircle size={22} />
      </SidebarIcon>

      <div className="w-8 h-[2px] bg-white/10 rounded-full my-1" />

      <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-220px)] w-full items-center">
        {servers.map((s) => (
          <SidebarIcon key={s.id} active={activeServerId === s.id} onClick={() => onSelectServer(s.id)} label={s.name} pill>
            {s.iconUrl ? (
              <img src={s.iconUrl} className="w-full h-full object-cover rounded-[inherit]" />
            ) : (
              <span className="font-semibold text-sm">
                {s.name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            )}
          </SidebarIcon>
        ))}
      </div>

      <SidebarIcon onClick={onCreateClick} label="Criar servidor" accent>
        <Plus size={22} />
      </SidebarIcon>
      <SidebarIcon onClick={onJoinClick} label="Entrar em um servidor" accent>
        <Compass size={20} />
      </SidebarIcon>
    </div>
  );
}

function SidebarIcon({
  children,
  active,
  onClick,
  label,
  accent,
  pill,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
  accent?: boolean;
  pill?: boolean;
}) {
  return (
    <div className="relative group w-full flex justify-center">
      <span className="absolute left-0 -translate-x-1 top-1/2 -translate-y-1/2 bg-white rounded-r-full transition-all" style={{ width: 4, height: active ? 28 : 0 }} />
      <button
        onClick={onClick}
        title={label}
        className={`w-12 h-12 flex items-center justify-center transition-all duration-150 text-text-primary
          ${active ? "rounded-2xl" : "rounded-full group-hover:rounded-2xl"}
          ${accent ? "bg-bg-tertiary text-brand hover:bg-brand hover:text-white" : active ? "bg-brand" : "bg-bg-tertiary hover:bg-brand"}
        `}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute left-16 top-1/2 -translate-y-1/2 whitespace-nowrap bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-50">
        {label}
      </span>
    </div>
  );
}
