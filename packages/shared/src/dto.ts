import type { Ticket } from "./ticket";
import type { PresenceState } from "./presence";

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

/** Capacité d'un membre pour une itération. Valeur initialisée en jours
 * ouvrés depuis ADO (jours off déduits), puis librement modifiable dans l'app. */
export interface Capacity {
  memberId: string;
  iterationPath: string;
  /** Valeur de capacité (nom historique — l'unité est celle de l'équipe). */
  storyPoints: number;
}

/** Métadonnées d'un membre propres à l'app (hors ADO), persistées par projet. */
export interface MemberMeta {
  memberId: string;
  /** Poste / métier (ex. "Backend Lead"). */
  poste: string;
  /** Rôle dans l'équipe/sprint (ex. "Tech Lead"). */
  role: string;
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
  /** Entrées issues des colonnes de board : état ADO réel à écrire quand une carte est déposée dans cette colonne. */
  state?: string;
  /** Champ ADO de la colonne Kanban (WEF_xxx_Kanban.Column) — écrit au drop pour déplacer la carte. */
  columnField?: string;
}

export interface SessionSnapshot {
  sessionId: string;
  tickets: Ticket[];
  participants: PresenceState[];
  teamMembers: TeamMember[];
  iterations: Iteration[];
  capacities: Capacity[];
  /** Poste/rôle par membre (app, hors ADO). */
  memberMeta?: MemberMeta[];
  /** États réels ordonnés du projet (pour la vue Daily). */
  states?: AdoState[];
  /** Base URL ADO du projet (https://dev.azure.com/{org}/{project}) — liens vers les work items. */
  adoUrl?: string;
}

/** Jalon de release (entité propre, absente d'ADO). */
export interface Milestone {
  id: string;
  title: string;
  iter: number;
  color: string;
}

/** Flag posé sur une ligne (epic/feature) du Release planning. Plusieurs par ligne. */
export interface RowPin {
  id: string;
  rowKey: string;
  iter: number;
  title: string;
  color: string;
}
