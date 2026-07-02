import { useSessionStore } from "./stores/session.store";
import { AuthGuard } from "./components/auth/AuthGuard";
import { SessionLobby } from "./components/session/SessionLobby";
import { GanttBoard } from "./components/design/GanttBoard";

export function App() {
  const session = useSessionStore((s) => s.snapshot);

  return (
    <AuthGuard>
      {session ? <GanttBoard key={session.sessionId} /> : <SessionLobby />}
    </AuthGuard>
  );
}
