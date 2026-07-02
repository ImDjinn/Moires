import type { Operation } from "./operation";
import type { PresenceState } from "./presence";
export declare const ROOM: (sessionId: string) => string;
export interface ClientToServer {
    "operation:submit": (op: Operation) => void;
    "presence:update": (p: PresenceState) => void;
}
export interface ServerToClient {
    "operation:applied": (op: Operation & {
        serverTimestamp: number;
    }) => void;
    "operation:rejected": (payload: {
        op: Operation;
        reason: string;
    }) => void;
    "presence:broadcast": (p: PresenceState) => void;
    "presence:user-joined": (p: Pick<PresenceState, "userId" | "displayName" | "color">) => void;
    "presence:user-left": (payload: {
        userId: string;
    }) => void;
    "ticket:sync-status": (payload: {
        ticketId: string;
        syncStatus: "synced" | "error";
        adoRev?: number;
    }) => void;
    "ticket:updated": (ticket: import("./ticket").Ticket) => void;
}
//# sourceMappingURL=socket-events.d.ts.map