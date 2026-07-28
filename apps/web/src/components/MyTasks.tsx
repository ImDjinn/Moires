import { useMemo } from "react";
import type { AdoState, SessionSnapshot, Ticket } from "@moirai/shared";
import { useAuthStore } from "../stores/auth.store";
import { useSessionStore } from "../stores/session.store";
import { useTicketsStore } from "../stores/tickets.store";
import { Brand } from "./Brand";

/**
 * Id de l'utilisateur connecté tel qu'il apparaît dans Ticket.assigneeId
 * (= System.AssignedTo.uniqueName, cf. AdoMapper). Le nom affiché sert de repli
 * pour les sessions dont le cookie est antérieur à l'ajout de uniqueName.
 */
export function resolveMyMemberId(
  user: { id: string; displayName: string; uniqueName?: string },
  teamMembers: SessionSnapshot["teamMembers"],
): string | null {
  const member = teamMembers.find(
    (m) => (user.uniqueName && m.id === user.uniqueName) || m.id === user.id || m.displayName === user.displayName,
  );
  return member?.id ?? user.uniqueName ?? null;
}

/** Index de l'itération contenant aujourd'hui (0 par défaut, comme le board). */
export function currentIterIndex(iterations: SessionSnapshot["iterations"], today = new Date().toISOString().slice(0, 10)): number {
  const i = iterations.findIndex((it) => it.startDate.slice(0, 10) <= today && today <= it.finishDate.slice(0, 10));
  return i >= 0 ? i : 0;
}

// HTML ADO → texte. On n'injecte jamais le HTML (une description peut contenir
// n'importe quel markup saisi dans ADO) : les sauts de ligne des blocs sont
// préservés, le reste est aplati.
// ponytail: texte brut ; passer à DOMPurify + dangerouslySetInnerHTML si le
// formatage riche (tableaux, images) devient nécessaire.
export function htmlToText(html?: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<li[^>]*>/gi, "\n• ")
    // `</li>` exclu : l'ouverture pose déjà le saut de ligne de la puce.
    .replace(/<\/(p|div|ul|ol|tr|h[1-6])>|<br\s*\/?>/gi, "\n");
  const text = new DOMParser().parseFromString(withBreaks, "text/html").body.textContent ?? "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

const card: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  padding: 16,
};

function StateBadge({ state, states }: { state: string; states: AdoState[] }) {
  const color = states.find((s) => s.name === state)?.color ?? states.find((s) => s.state === state)?.color ?? "#8a8f98";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flex: "0 0 auto" }} />
      {state}
    </span>
  );
}

function TicketHeader({ t, states, adoUrl }: { t: Ticket; states: AdoState[]; adoUrl?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
      {adoUrl ? (
        <a href={`${adoUrl}/_workitems/edit/${t.id}`} target="_blank" rel="noreferrer" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>#{t.id}</a>
      ) : (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--muted)" }}>#{t.id}</span>
      )}
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 200 }}>{t.title}</span>
      <StateBadge state={t.state} states={states} />
      {t.storyPoints > 0 && (
        <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{t.storyPoints} p</span>
      )}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--faint, #abacb6)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );
}

export function MyTasks({ onBack }: { onBack: () => void }) {
  const user = useAuthStore((s) => s.user);
  const snapshot = useSessionStore((s) => s.snapshot);
  const tickets = useTicketsStore((s) => s.tickets);

  const view = useMemo(() => {
    if (!user || !snapshot) return null;
    const myId = resolveMyMemberId(user, snapshot.teamMembers);
    const cur = currentIterIndex(snapshot.iterations);
    const mine = tickets.filter((t) => t.assigneeId && t.assigneeId === myId);
    const inIter = (i: number) => {
      const it = snapshot.iterations[i];
      return it ? mine.filter((t) => t.iterationId === it.path) : [];
    };
    return {
      current: snapshot.iterations[cur],
      next: snapshot.iterations[cur + 1],
      currentTickets: inIter(cur),
      nextTickets: inIter(cur + 1),
      states: snapshot.states ?? [],
      adoUrl: snapshot.adoUrl,
    };
  }, [user, snapshot, tickets]);

  if (!view) return null;

  const points = view.currentTickets.reduce((s, t) => s + t.storyPoints, 0);

  return (
    // Superposé au board (qui reste monté) : pas de reconnexion socket ni de
    // rechargement du planning au retour.
    <div style={{ position: "fixed", inset: 0, zIndex: 200, overflowY: "auto", background: "var(--canvas)", color: "var(--ink)" }}>
      <div style={{ height: 52, display: "flex", alignItems: "center", gap: 14, padding: "0 18px", borderBottom: "1px solid var(--line)", background: "var(--panel)", position: "sticky", top: 0, zIndex: 10 }}>
        <Brand size={22} />
        <div style={{ width: 1, height: 22, background: "var(--line)" }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Mes tâches</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{user!.displayName}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onBack} style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--panel2, #fbfbfd)", color: "var(--ink)", fontSize: 13, cursor: "pointer" }}>
          ← Retour au planning
        </button>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 18px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            Sprint en cours {view.current ? `· ${view.current.name}` : ""}
          </h2>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {view.currentTickets.length} ticket{view.currentTickets.length > 1 ? "s" : ""}
            {points > 0 ? ` · ${points} points` : ""}
          </div>
        </div>

        {view.currentTickets.length === 0 && (
          <div style={{ ...card, fontSize: 13, color: "var(--muted)" }}>Aucun ticket ne vous est assigné sur ce sprint.</div>
        )}

        {view.currentTickets.map((t) => (
          <div key={t.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
            <TicketHeader t={t} states={view.states} adoUrl={view.adoUrl} />
            <Section title="Description" text={htmlToText(t.description)} />
            <Section title="Critères d'acceptation" text={htmlToText(t.acceptanceCriteria)} />
          </div>
        ))}

        <div style={{ height: 1, background: "var(--line)" }} />

        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            Sprint suivant {view.next ? `· ${view.next.name}` : ""}
          </h2>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {view.next ? `${view.nextTickets.length} ticket${view.nextTickets.length > 1 ? "s" : ""}` : "Aucun sprint planifié après celui-ci."}
          </div>
        </div>

        {view.next && view.nextTickets.length > 0 && (
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
            {view.nextTickets.map((t) => (
              <TicketHeader key={t.id} t={t} states={view.states} adoUrl={view.adoUrl} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
