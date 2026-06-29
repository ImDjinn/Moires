import { io, Socket } from "socket.io-client";
import type { Operation, ClientToServer, ServerToClient } from "@moires/shared";
import { useTicketsStore } from "../stores/tickets.store";

let socket: Socket<ServerToClient, ClientToServer> | null = null;

export function connectSocket(sessionId: string, userId: string, displayName: string) {
  if (socket?.connected) return socket;

  socket = io("/", {
    query: { sessionId, userId, displayName },
    withCredentials: true,
  });

  socket.on("operation:applied", (op) => {
    useTicketsStore.getState().applyOperation(op);
  });

  socket.on("operation:rejected", ({ op, reason }) => {
    console.warn("Operation rejected:", reason, op);
  });

  socket.on("ticket:sync-status", ({ ticketId, syncStatus, adoRev }) => {
    useTicketsStore.getState().updateSyncStatus(ticketId, syncStatus, adoRev);
  });

  socket.on("ticket:updated", (ticket) => {
    useTicketsStore.getState().updateTicket(ticket);
  });

  return socket;
}

export function submitOperation(op: Operation) {
  useTicketsStore.getState().applyOperation(op);
  socket?.emit("operation:submit", op);
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket() {
  return socket;
}
