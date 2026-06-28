import { useAuthStore } from "./stores/auth.store";
import { useSessionStore } from "./stores/session.store";
import { AuthGuard } from "./components/auth/AuthGuard";
import { SessionLobby } from "./components/session/SessionLobby";
import { Board } from "./components/Board";

export function App() {
  const user = useAuthStore((s) => s.user);
  const session = useSessionStore((s) => s.snapshot);

  return (
    <AuthGuard>
      {session ? <Board /> : <SessionLobby />}
    </AuthGuard>
  );
}
