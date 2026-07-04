import type { Ticket, TeamMember, Iteration, Capacity } from "@moirai/shared";
import { loadOf, capacityOf } from "../../utils/load";

const BAR_MAX_H = 80;
const BAR_W = 18;

interface Props {
  tickets: Ticket[];
  teamMembers: TeamMember[];
  iterations: Iteration[];
  capacities: Capacity[];
}

/**
 * Histogramme de charge : une colonne par itération, une barre par membre
 * (Story Points). Le trait pointillé marque la capacité, la couleur signale
 * la surcharge.
 */
export function LoadHistogram({ tickets, teamMembers, iterations, capacities }: Props) {
  let max = 1;
  for (const it of iterations) {
    for (const m of teamMembers) {
      max = Math.max(max, loadOf(tickets, m.id, it.path), capacityOf(capacities, m.id, it.path));
    }
  }

  return (
    <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
        Charge par personne et par itération (Story Points)
      </h2>
      <div style={{ display: "flex", gap: 24, overflowX: "auto" }}>
        {iterations.map((it) => (
          <div key={it.path} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: BAR_MAX_H }}>
              {teamMembers.map((m) => {
                const load = loadOf(tickets, m.id, it.path);
                const cap = capacityOf(capacities, m.id, it.path);
                const ratio = cap > 0 ? load / cap : 0;
                const isOver = cap > 0 && load > cap;
                const isWarn = cap > 0 && ratio >= 0.85 && !isOver;
                const color = isOver
                  ? "var(--color-error)"
                  : isWarn
                    ? "var(--color-pending)"
                    : "var(--color-synced)";
                const barH = Math.round((load / max) * BAR_MAX_H);
                const capH = cap > 0 ? Math.round((cap / max) * BAR_MAX_H) : 0;
                return (
                  <div
                    key={m.id}
                    title={`${m.displayName} — ${load}/${cap || "?"} pts`}
                    style={{ position: "relative", width: BAR_W, height: BAR_MAX_H, display: "flex", alignItems: "flex-end" }}
                  >
                    {capH > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: capH,
                          left: 0,
                          right: 0,
                          borderTop: "1px dashed var(--text-muted)",
                        }}
                      />
                    )}
                    <div
                      style={{
                        width: "100%",
                        height: load > 0 ? Math.max(barH, 2) : 0,
                        background: color,
                        borderRadius: "2px 2px 0 0",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {teamMembers.map((m) => (
                <div key={m.id} style={{ width: BAR_W, textAlign: "center", fontSize: 9, color: "var(--text-muted)" }}>
                  {m.displayName[0]}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, textAlign: "center", color: "var(--text)" }}>{it.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
