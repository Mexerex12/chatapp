import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-bg-secondary text-text-muted">Carregando…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
