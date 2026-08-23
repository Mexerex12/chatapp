import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { Bell, MessageCircle, UserPlus, PhoneIncoming } from "lucide-react";

interface Toast {
  id: number;
  title: string;
  body?: string;
  icon: "message" | "friend" | "call" | "bell";
}

interface NotificationContextValue {
  notify: (title: string, body?: string, icon?: Toast["icon"]) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const ICONS: Record<Toast["icon"], typeof Bell> = {
  message: MessageCircle,
  friend: UserPlus,
  call: PhoneIncoming,
  bell: Bell,
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((title: string, body?: string, icon: Toast["icon"] = "bell") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, body, icon }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80">
        {toasts.map((t) => {
          const Icon = ICONS[t.icon];
          return (
            <div key={t.id} className="animate-fade-in bg-bg-elevated border border-white/5 rounded-lg shadow-xl p-3 flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                <Icon size={16} className="text-brand" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{t.title}</p>
                {t.body && <p className="text-xs text-text-muted truncate">{t.body}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotify deve ser usado dentro de NotificationProvider");
  return ctx.notify;
}
