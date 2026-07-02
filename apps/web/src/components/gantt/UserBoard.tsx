import { useMemo } from "react";
import type { Ticket, TeamMember, Iteration, Operation, Capacity } from "@moires/shared";
import { buildRows, cellTickets, UNASSIGNED_ROW } from "../../utils/grouping";
import { loadOf, capacityOf } from "../../utils/load";
import { useBoardDnd } from "../../hooks/useBoardDnd";
import { SprintTimelineHeader } from "./SprintTimelineHeader";
import { TicketCard } from "./TicketCard";
import { LoadHistogram } from "../load/LoadHistogram";

const ROW_HEADER_W = 200;
const COL_W = 160;

interface Props {
  tickets: Ticket[];
  teamMembers: TeamMember[];
  iterations: Iteration[];
  capacities: Capacity[];
  onOperation: (op: Operation) => void;
  onSetCapacity: (memberId: string, iterationPath: string, storyPoints: number) => void;
  userId: string;
}

function CapacityBar({ load, capacity }: { load: number; capacity: number }) {
  const ratio = capacity > 0 ? load / capacity : 0;
  const isOver = ratio > 1;
  const isWarn = ratio >= 0.85 && !isOver;
  const color = isOver
    ? "var(--color-error)"
    : isWarn
      ? "var(--color-pending)"
      : "var(--color-synced)";
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)" }}>
        <span>charge</span>
        <span style={{ color: isOver ? "var(--color-error)" : "var(--text-muted)" }}>
          {load}/{capacity} pts
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(ratio * 100, 100)}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export function UserBoard({
  tickets,
  teamMembers,
  iterations,
  capacities,
  onOperation,
  onSetCapacity,
  userId,
}: Props) {
  const { peerEditing, moveTicket, handleDrop } = useBoardDnd(tickets, iterations, onOperation, userId);

  const validIds = useMemo(() => new Set(teamMembers.map((m) => m.id)), [teamMembers]);
  const rows = useMemo(() => buildRows(tickets, teamMembers, "user"), [tickets, teamMembers]);

  const labelCellStyle: React.CSSProperties = {
    width: ROW_HEADER_W,
    minWidth: ROW_HEADER_W,
    position: "sticky",
    left: 0,
    zIndex: 2,
    background: "var(--bg)",
    borderRight: "1px solid var(--border)",
    padding: "8px 12px",
    fontSize: 13,
  };

  const cardStack = (cellTks: Ticket[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {cellTks.map((t) => (
        <TicketCard
          key={t.id}
          ticket={t}
          onMove={(dir) => moveTicket(t, dir)}
          peerEditing={peerEditing.get(t.id) || null}
        />
      ))}
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{ minWidth: ROW_HEADER_W + iterations.length * COL_W }}>
        <SprintTimelineHeader
          iterations={iterations}
          colWidthPx={COL_W}
          rowHeaderWidth={ROW_HEADER_W}
        />

        {iterations.length === 0 && (
          <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>
            Aucune itération datée dans ce projet.
          </div>
        )}

        {rows.map((row) => {
          const isUnassigned = row.id === UNASSIGNED_ROW;
          return (
            <div key={row.id} style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
              <div style={labelCellStyle}>{row.label}</div>
              {iterations.map((it) => {
                const cellTks = cellTickets(tickets, row.id, it.path, "user", validIds);
                const load = cellTks.reduce((s, t) => s + t.storyPoints, 0);
                const capacity = isUnassigned ? 0 : capacityOf(capacities, row.id, it.path);
                return (
                  <div
                    key={it.path}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(it.path, e, isUnassigned ? null : row.id)}
                    style={{
                      width: COL_W,
                      minWidth: COL_W,
                      padding: 6,
                      borderRight: "1px solid var(--grid-line)",
                    }}
                  >
                    {!isUnassigned && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4, fontSize: 9, color: "var(--text-muted)" }}>
                        <span>capacité</span>
                        <input
                          type="number"
                          min={0}
                          aria-label={`Capacité ${row.label} ${it.name}`}
                          value={capacity || ""}
                          onChange={(e) => onSetCapacity(row.id, it.path, Number(e.target.value) || 0)}
                          style={{
                            width: 36,
                            fontSize: 10,
                            padding: "1px 3px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 3,
                            color: "var(--text)",
                          }}
                        />
                        <span>pts</span>
                      </div>
                    )}
                    {cardStack(cellTks)}
                    {!isUnassigned && capacity > 0 && load > 0 && (
                      <CapacityBar load={load} capacity={capacity} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <LoadHistogram
        tickets={tickets}
        teamMembers={teamMembers}
        iterations={iterations}
        capacities={capacities}
      />
    </div>
  );
}
