import { useAuth } from "../../hooks/useAuth";
import { LoginButton } from "./LoginButton";
import { LoadingScreen } from "../LoadingScreen";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen label="Chargement…" />;

  if (!user) return <LoginButton />;

  return <>{children}</>;
}
