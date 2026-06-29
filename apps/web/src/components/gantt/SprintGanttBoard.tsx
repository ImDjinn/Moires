import { useMemo } from "react";
import type { Ticket, TeamMember, Iteration, Operation } from "@moires/shared";
import { usePresenceStore } from "../../stores/presence.store";
import { workingDays } from "../../utils/dates";
import {
  buildRows,
  cellTickets,
  epicSpan,
  UNASSIGNED_ROW,
  type GroupBy,
} from "../../utils/grouping";
import { SprintTimelineHeader } from "./SprintTimelineHeader";
import { TicketCard } from "./TicketCard";

const ROW_HEADER_W = 200;
const COL_W = 160;

interface Props {
  tickets: Ticket[];
  teamMembers: TeamMember[];
  iterations: Iteration[];
  groupBy: GroupBy;
  onOperation: (op: Operation) => void;
  userId: string;
}

function clamp(min: number, max: number, v: number) {
  return Math.max(min, Math.min(max, v));
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
          {load}/{capacity}h
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(ratio * 100, 100)}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export function SprintGanttBoard({
  tickets,
  teamMembers,
  iterations,
  groupBy,
  onOperation,
  userId,
}: Props) {
  const peers = usePresenceStore((s) => s.peers);

  const memberById = useMemo(
    () => new Map(teamMembers.map((m) => [m.id, m])),
    [teamMembers],
  );
  const validIds = useMemo(
    () => (groupBy === "user" ? new Set(teamMembers.map((m) => m.id)) : new Set<string>()),
    [groupBy, teamMembers],
  );
  const rows = useMemo(
    () => buildRows(tickets, teamMembers, groupBy),
    [tickets, teamMembers, groupBy],
  );

  const peerEditing = useMemo(() => {
    const map = new Map<string, { color: string; displayName: string }>();
    for (const p of peers) {
      if (p.targetTicketId && p.action !== "idle") {
        map.set(p.targetTicketId, { color: p.color, displayName: p.displayName });
      }
    }
    return map;
  }, [peers]);

  const moveTicket = (ticket: Ticket, dir: -1 | 1) => {
    const idx = iterations.findIndex((it) => it.path === ticket.iterationId);
    if (idx === -1) return;
    const target = clamp(0, iterations.length - 1, idx + dir);
    if (target === idx) return;
    onOperation({
      ticketId: ticket.id,
      field: "iterationId",
      value: iterations[target].path,
      userId,
      clientTimestamp: Date.now(),
    });
  };

  const handleDrop = (iterationPath: string, e: React.DragEvent, targetAssigneeId?: string | null) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData("text/ticket-id");
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    if (ticket.iterationId !== iterationPath) {
      onOperation({ ticketId, field: "iterationId", value: iterationPath, userId, clientTimestamp: Date.now() });
    }
    if (targetAssigneeId !== undefined && ticket.assigneeId !== targetAssigneeId) {
      onOperation({ ticketId, field: "assigneeId", value: targetAssigneeId, userId, clientTimestamp: Date.now() });
    }
  };

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

        {groupBy === "user"
          ? rows.map((row) => {
              const member = memberById.get(row.id);
              return (
                <div key={row.id} style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
                  <div style={labelCellStyle}>{row.label}</div>
                  {iterations.map((it) => {
                    const cellTks = cellTickets(tickets, row.id, it.path, "user", validIds);
                    const load = cellTks.reduce((s, t) => s + t.estimateHours, 0);
                    const capacity = member
                      ? member.capacityHoursPerDay * workingDays(it.startDate, it.finishDate)
                      : 0;
                    return (
                      <div
                        key={it.path}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(it.path, e, row.id === UNASSIGNED_ROW ? null : row.id)}
                        style={{
                          width: COL_W,
                          minWidth: COL_W,
                          padding: 6,
                          borderRight: "1px solid var(--grid-line)",
                        }}
                      >
                        {cardStack(cellTks)}
                        {row.id !== UNASSIGNED_ROW && capacity > 0 && load > 0 && (
                          <CapacityBar load={load} capacity={capacity} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          : rows.map((row) => {
              const span = epicSpan(tickets, row.id, iterations);
              return (
                <div key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  {/* Barre récap de l'Epic */}
                  <div style={{ display: "flex" }}>
                    <div style={{ ...labelCellStyle, fontWeight: 600, padding: "6px 12px" }}>
                      {row.label}
                    </div>
                    <div style={{ position: "relative", width: iterations.length * COL_W, height: 26 }}>
                      {span && (
                        <div
                          style={{
                            position: "absolute",
                            top: 4,
                            left: span.start * COL_W + 4,
                            width: (span.end - span.start + 1) * COL_W - 8,
                            height: 18,
                            background: "var(--accent)",
                            opacity: 0.8,
                            borderRadius: "var(--radius-bar)",
                          }}
                        />
                      )}
                    </div>
                  </div>
                  {/* Cartes par colonne de sprint */}
                  <div style={{ display: "flex" }}>
                    <div style={{ ...labelCellStyle, padding: 0 }} />
                    {iterations.map((it) => (
                      <div
                        key={it.path}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(it.path, e)}
                        style={{
                          width: COL_W,
                          minWidth: COL_W,
                          padding: 6,
                          borderRight: "1px solid var(--grid-line)",
                        }}
                      >
                        {cardStack(cellTickets(tickets, row.id, it.path, "epic", validIds))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
