/** Commentaire de la discussion ADO d'un work item (lecture seule). */
export interface TicketComment {
  id: number;
  author: string;
  /** ISO 8601 (createdDate ADO). */
  date: string;
  /** HTML ADO. */
  text: string;
}

export interface Ticket {
  id: string;
  title: string;
  /** Type ADO du work item : "Feature", "User Story", "Task", "Bug"… */
  workItemType: string;
  /** Id ADO du parent direct (Feature pour une US, US pour une Tâche). */
  parentId: string | null;
  /** État ADO : "New", "Active", "Resolved", "Closed"… */
  state: string;
  /** Colonne du board d'équipe ADO (System.BoardColumn) — placement Daily. */
  boardColumn?: string | null;
  tags: string[];
  assigneeId: string | null;
  areaPath: string;
  iterationId: string;
  epicId: string | null;
  epicTitle: string | null;
  startDate: string;
  endDate: string;
  /** Target Date ADO — utilisé pour l'intervalle des Epics/Features. */
  targetDate: string | null;
  /** Microsoft.VSTS.Common.Priority (1 = plus prioritaire). Optionnel. */
  priority?: number;
  /** System.Description — HTML ADO. */
  description?: string;
  /** Microsoft.VSTS.Common.AcceptanceCriteria — HTML ADO. */
  acceptanceCriteria?: string;
  estimateHours: number;
  storyPoints: number;
  adoRev: number;
  syncStatus: "synced" | "pending" | "error";
  /** Champs ADO non mappés (process hérités / champs custom) — affichage lecture seule. */
  customFields?: Record<string, string | number | boolean>;
}
