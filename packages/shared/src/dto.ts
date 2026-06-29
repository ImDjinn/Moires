import type { Ticket } from "./ticket";
import type { PresenceState } from "./presence";
import type { OperationField } from "./operation";

export interface CreateSessionDto {
  adoProjectId: string;
  adoIterationIds?: string[];
  areaPaths?: string[];
}

export interface TeamMember {
  id: string;
  displayName: string;
  capacityHoursPerDay: number;
}

export interface Iteration {
  id: string;
  name: string;
  /** Chemin ADO (System.IterationPath) — clé de jointure avec les tickets. */
  path: string;
  startDate: string;
  finishDate: string;
}

export interface SessionSnapshot {
  sessionId: string;
  tickets: Ticket[];
  participants: PresenceState[];
  teamMembers: TeamMember[];
  iterations: Iteration[];
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
