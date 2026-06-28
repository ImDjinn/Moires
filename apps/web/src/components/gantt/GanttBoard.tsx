import { useMemo } from "react";
import type { Ticket, TeamMember, Operation } from "@moires/shared";
import { usePresenceStore } from "../../stores/presence.store";
import { generateDays, isWeekend } from "../../utils/dates";
import { TimelineHeader } from "./TimelineHeader";
import { TicketBar } from "./TicketBar";

interface Props {
  tickets: Ticket[];
  teamMembers: TeamMember[];
  rangeStart: string;
  rangeEnd: string;
  dayWidthPx: number;
  onOperation: (op: Operation) => void;
  userId: string;
}

export function GanttBoard({
  tickets,
  teamMembers,
  rangeStart,
  rangeEnd,
  dayWidthPx,
  onOperation,
  userId,
}: Props) {
  const peers = usePresenceStore((s) => s.peers);
  const days = generateDays(rangeStart, rangeEnd);
  const totalWidth = days.length * dayWidthPx;

  const rows = useMemo(() => {
    const unassigned = { id: "__unassigned__", displayName: "Non assigné", capacityHoursPerDay: 0 };
    return [unassigned, ...teamMembers];
  }, [teamMembers]);

  const ticketsByRow = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const row of rows) {
      map.set(row.id, []);
    }
    for (const t of tickets) {
      const key = t.assigneeId || "__unassigned__";
      if (!map.has(key)) map.set("__unassigned__", []);
      map.get(key)?.push(t) ?? map.get("__unassigned__")!.push(t);
    }
    return map;
  }, [tickets, rows]);

  const peerEditing = useMemo(() => {
    const map = new Map<string, { color: string; displayName: string }>();
    for (const p of peers) {
      if (p.targetTicketId && p.action !== "idle") {
        map.set(p.targetTicketId, { color: p.color, displayName: p.displayName });
      }
    }
    return map;
  }, [peers]);

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Left column — member names */}
      <div style={{
        width: 160,
        minWidth: 160,
        borderRight: "1px solid var(--border)",
        position: "sticky",
        left: 0,
        zIndex: 5,
        background: "var(--bg)",
      }}>
        <div style={{ height: 40, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 12, color: "var(--text-muted)" }}>
          Membres
        </div>
        {rows.map((row, i) => (
          <div
            key={row.id}
            style={{
              height: 44,
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              fontSize: 13,
              background: i % 2 === 0 ? "var(--surface)" : "var(--surface-alt)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.displayName}
            </span>
            {row.capacityHoursPerDay > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
                {row.capacityHoursPerDay}h/j
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Gantt area */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <TimelineHeader rangeStart={rangeStart} rangeEnd={rangeEnd} dayWidthPx={dayWidthPx} />
        <div style={{ position: "relative", width: totalWidth, minHeight: rows.length * 44 }}>
          {/* Grid background */}
          {days.map((day, di) => (
            <div
              key={day}
              style={{
                position: "absolute",
                left: di * dayWidthPx,
                top: 0,
                width: dayWidthPx,
                height: "100%",
                background: isWeekend(day) ? "var(--grid-weekend)" : "transparent",
                borderRight: "1px solid var(--grid-line)",
              }}
            />
          ))}

          {/* Row zebra */}
          {rows.map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                top: i * 44,
                width: "100%",
                height: 44,
                background: i % 2 === 0 ? "var(--surface)" : "var(--surface-alt)",
                opacity: 0.5,
                borderBottom: "1px solid var(--border)",
              }}
            />
          ))}

          {/* Ticket bars */}
          {rows.map((row, rowIdx) =>
            (ticketsByRow.get(row.id) || []).map((ticket) => (
              <TicketBar
                key={ticket.id}
                ticket={ticket}
                rowIndex={rowIdx}
                dayWidthPx={dayWidthPx}
                rangeStart={rangeStart}
                onOperation={onOperation}
                userId={userId}
                peerEditing={peerEditing.get(ticket.id) || null}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}
