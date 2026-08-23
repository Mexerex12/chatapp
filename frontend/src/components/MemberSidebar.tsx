import { useState } from "react";
import { ServerMemberInfo } from "../types";
import { Avatar } from "./Avatar";
import { UserProfilePopover } from "./UserProfilePopover";

interface Props {
  members: ServerMemberInfo[];
}

const ROLE_LABEL: Record<string, string> = { OWNER: "DONO", ADMIN: "ADMIN", MEMBER: "MEMBROS" };

export function MemberSidebar({ members }: Props) {
  const [selected, setSelected] = useState<ServerMemberInfo | null>(null);
  const online = members.filter((m) => m.status === "online");
  const offline = members.filter((m) => m.status !== "online");

  const groups: Record<string, ServerMemberInfo[]> = { OWNER: [], ADMIN: [], MEMBER: [] };
  for (const m of online) groups[m.role]?.push(m);

  return (
    <div className="w-60 bg-bg-primary border-l border-black/20 overflow-y-auto px-2 py-3 shrink-0 hidden lg:block">
      {(["OWNER", "ADMIN", "MEMBER"] as const).map(
        (role) =>
          groups[role].length > 0 && (
            <div key={role} className="mb-4">
              <p className="text-xs font-semibold text-text-muted px-2 mb-1">
                {ROLE_LABEL[role]} — {groups[role].length}
              </p>
              {groups[role].map((m) => (
                <MemberRow key={m.id} member={m} onClick={() => setSelected(m)} />
              ))}
            </div>
          )
      )}
      {offline.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted px-2 mb-1">OFFLINE — {offline.length}</p>
          {offline.map((m) => (
            <MemberRow key={m.id} member={m} dimmed onClick={() => setSelected(m)} />
          ))}
        </div>
      )}

      {selected && <UserProfilePopover member={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MemberRow({ member, dimmed, onClick }: { member: ServerMemberInfo; dimmed?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-tertiary/60 transition-colors ${dimmed ? "opacity-50" : ""}`}>
      <Avatar username={member.username} color={member.avatarColor} avatarUrl={member.avatarUrl} size={30} status={member.status ?? "offline"} />
      <span className="text-sm text-text-primary truncate">{member.username}</span>
      {member.role !== "MEMBER" && <span className="text-[10px] text-text-muted ml-auto shrink-0">{member.role}</span>}
    </button>
  );
}
