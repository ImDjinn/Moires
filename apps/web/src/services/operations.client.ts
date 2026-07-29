import { io, Socket } from "socket.io-client";
import type { Operation, ClientToServer, ServerToClient } from "@moires/shared";
import { useTicketsStore } from "../stores/tickets.store";

let socket: Socket<ServerToClient, ClientToServer> | null = null;

// Notifie l'UI (toast GanttBoard) quand une écriture est refusée par le serveur ou par ADO.
let onRejected: ((message: string) => void) | null = null;
export function setRejectionHandler(cb: ((message: string) => void) | null) {
  onRejected = cb;
}

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
    // ponytail: rollback paresseux — on remet le ticket en "synced" pour que le
    // poll de 5s le réhydrate avec la valeur réelle d'ADO (le store ne garde
    // pas l'ancienne valeur).
    useTicketsStore.getState().updateSyncStatus(op.ticketId, "synced");
    onRejected?.(`Modification refusée (#${op.ticketId}) : ${reason}`);
  });

  socket.on("ticket:sync-status", ({ ticketId, syncStatus, adoRev }) => {
    useTicketsStore.getState().updateSyncStatus(ticketId, syncStatus, adoRev);
  });

  socket.on("ticket:updated", (ticket) => {
    useTicketsStore.getState().updateTicket(ticket);
    // Échec définitif du writeback ADO : le serveur renvoie le ticket avec la
    // valeur réelle — on prévient l'utilisateur du retour en arrière.
    if (ticket.syncStatus === "error")
      onRejected?.(`Écriture ADO échouée (#${ticket.id}) — valeur d'ADO restaurée`);
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
