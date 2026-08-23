interface AvatarProps {
  username: string;
  color?: string;
  avatarUrl?: string | null;
  size?: number;
  status?: "online" | "offline" | "idle" | null;
  ring?: boolean;
}

export function Avatar({ username, color = "#5865F2", avatarUrl, size = 36, status, ring }: AvatarProps) {
  const initial = username?.[0]?.toUpperCase() || "?";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`w-full h-full rounded-full flex items-center justify-center font-semibold text-white overflow-hidden select-none ${ring ? "speaking-ring" : ""}`}
        style={{ backgroundColor: color, fontSize: size * 0.42 }}
        title={username}
      >
        {avatarUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img src={avatarUrl} className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </div>
      {status && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-bg-secondary"
          style={{
            width: size * 0.32,
            height: size * 0.32,
            backgroundColor: status === "online" ? "#3ba55d" : status === "idle" ? "#faa61a" : "#747f8d",
          }}
        />
      )}
    </div>
  );
}
