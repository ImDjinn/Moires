import { useAuth } from "../../hooks/useAuth";
import { LoginButton } from "./LoginButton";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <span style={{ color: "var(--text-muted)" }}>Chargement...</span>
      </div>
    );
  }

  if (!user) return <LoginButton />;

  return <>{children}</>;
}
