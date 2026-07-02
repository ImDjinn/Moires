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
/** Capacité d'un membre pour une itération, en Story Points. */
export interface Capacity {
    memberId: string;
    iterationPath: string;
    storyPoints: number;
}
export interface Iteration {
    id: string;
    name: string;
    /** Chemin ADO (System.IterationPath) — clé de jointure avec les tickets. */
    path: string;
    startDate: string;
    finishDate: string;
}
/** État ADO d'un type de work item (colonne possible du board), avec son ordre. */
export interface AdoState {
    name: string;
    category: string;
    color: string;
    /** Type de work item ADO d'où vient l'état ("Epic", "Feature", "User Story"…). */
    type?: string;
}
export interface SessionSnapshot {
    sessionId: string;
    tickets: Ticket[];
    participants: PresenceState[];
    teamMembers: TeamMember[];
    iterations: Iteration[];
    capacities: Capacity[];
    /** États réels ordonnés du projet (pour la vue Daily). */
    states?: AdoState[];
}
/** Jalon de release (entité propre, absente d'ADO). */
export interface Milestone {
    id: string;
    title: string;
    iter: number;
    color: string;
}
/** Pré-requis posé sur une ligne (area/feature) du Release planning. */
export interface RowPin {
    id: string;
    rowKey: string;
    iter: number;
    title: string;
    color: string;
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