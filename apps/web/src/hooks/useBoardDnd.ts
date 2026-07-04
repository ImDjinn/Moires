import { useMemo } from "react";
import type { Ticket, Iteration, Operation } from "@moirai/shared";
import { usePresenceStore } from "../stores/presence.store";

function clamp(min: number, max: number, v: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Mécanique de déplacement partagée par les deux canvas (clavier + drag&drop).
 * Le rendu de chaque canvas reste isolé ; seule la logique d'opération est commune.
 */
export function useBoardDnd(
  tickets: Ticket[],
  iterations: Iteration[],
  onOperation: (op: Operation) => void,
  userId: string,
) {
  const peers = usePresenceStore((s) => s.peers);

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

  const handleDrop = (
    iterationPath: string,
    e: React.DragEvent,
    targetAssigneeId?: string | null,
  ) => {
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

  return { peerEditing, moveTicket, handleDrop };
}
