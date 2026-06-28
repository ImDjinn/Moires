import type { Ticket } from "./ticket";
import type { PresenceState } from "./presence";
import type { OperationField } from "./operation";
export interface CreateSessionDto {
    adoProjectId: string;
    adoIterationIds: string[];
    areaPaths?: string[];
}
export interface TeamMember {
    id: string;
    displayName: string;
    capacityHoursPerDay: number;
}
export interface SessionSnapshot {
    sessionId: string;
    tickets: Ticket[];
    participants: PresenceState[];
    teamMembers: TeamMember[];
}
export interface AuditEntry {
    id: string;
    ticketId: string;
    field: OperationField;
    oldValue: unknown;
    newValue: unknown;
    performedBy: string;
    performedAt: string;
    adoSyncStatus: "pending" | "synced" | "failed";
}
//# sourceMappingURL=dto.d.ts.map