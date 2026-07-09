// Modèle + données mock + helpers purs, traduits du prototype Claude Design
// "Gantt Sprint Collaboratif". Aucune dépendance React : tout est pur.

import { workingDays } from "../../utils/dates";

export type Theme = "light" | "dark";
export type Level = "epic" | "feature" | "story" | "task";
export type Board = "sprint" | "daily" | "release";

export interface Person {
  id: string;
  name: string;
  /** Poste / métier (ex. "Backend Lead") — sert aussi à la couleur et au regroupement de charge. */
  role: string;
  /** Rôle dans l'équipe/sprint (ex. "Tech Lead", "Développeur"). Optionnel. */
  teamRole?: string;
  initials: string;
  color: string;
  /** Capacité par itération (jours). Absente = jours ouvrés du sprint. */
  cap: number[];
  /** Ligne "Non assigné" (pas un membre réel) : exclue des totaux de capacité. */
  unassigned?: boolean;
}

/** Repli ultime si la période du sprint est inconnue (backlog…). */
export const DEFAULT_CAP = 10;
/** Capacité par défaut d'un sprint = ses jours ouvrés (lun–ven). */
export const iterCap = (iter: number): number => {
  const it = iters[iter];
  return (it && workingDays(it.iso[0], it.iso[1])) || DEFAULT_CAP;
};
export const capOf = (p: Person, iter: number) => p.cap[iter] ?? iterCap(iter);

export interface Item {
  id: string;
  ado: string;
  level: Level;
  type: string;
  title: string;
  points: number;
  effortDays: number;
  person: string;
  iter: number;
  span: number;
  state: string;
  progress: number;
  parent: string | null;
  tags: string[];
  startISO: string;
  endISO: string;
  area: string;
  /** Renseigné pour les données réelles (id d'epic ADO) ; dérivé pour le mock. */
  epicId?: string | null;
  /** Feature/Epic dont l'intervalle vient de Start Date → Target Date (ADO). */
  hasDateRange?: boolean;
  /** Microsoft.VSTS.Common.Priority (1 = plus prioritaire). */
  priority?: number;
  /** Champs ADO custom (non mappés) — affichage lecture seule dans le panneau. */
  custom?: Record<string, string | number | boolean>;
  /** Type de work item ADO réel ("User Story", "Bug"…) — clé des prefs du panneau. */
  wit?: string;
  relS?: number;
  relE?: number;
}

export interface Iter {
  label: string;
  short: string;
  dates: string;
  sub: string;
  iso: [string, string];
  /** Chemin ADO (System.IterationPath) — présent pour les données réelles. */
  path?: string;
}

export interface Milestone {
  id: string;
  title: string;
  iter: number;
  color: string;
}

export interface RowPin {
  id: string;
  rowKey: string;
  iter: number;
  title: string;
  color: string;
}

export type Drag =
  | { mode: "move" | "resize"; id: string; sx: number; sy: number; dx: number; dy: number; oi: number; op: number; os: number }
  | { mode: "epic"; id: string; side: "L" | "R" | "M"; sx: number; dx: number; os: number; oe: number };

export interface Presence {
  initials: string;
  name: string;
  color: string;
}

export interface State {
  board: Board;
  level: Level;
  colorMode: "type" | "state" | "epic";
  hideClosed: boolean;
  /** Release : filtre sur les Epics. */
  epicFilter: "all" | "hideDone" | "activeOnly";
  /** Release : tri des Epics à l'intérieur des groupes de statut. */
  epicSort: "priority" | "name" | "effort";
  containerW: number;
  containerH: number;
  rangeFrom: number;
  rangeTo: number;
  backlog: boolean;
  rangeOpen: boolean;
  prefsOpen: boolean;
  items: Item[];
  hidden: Record<string, boolean>;
  peopleOpen: boolean;
  sort: string;
  expanded: Record<string, boolean>;
  /** Release : lignes (epic/feature) masquées — grisées et exclues de la charge. */
  hiddenRows: Record<string, boolean>;
  loadBy: "person" | "role" | "none";
  releaseStart: number;
  rowPins: RowPin[];
  rowPinSel: string | null;
  scrollLeft: number;
  milestones: Milestone[];
  milestoneSel: string | null;
  drag: Drag | null;
  selectedId: string | null;
  editing: { id: string; by: Presence } | null;
  sync: "saved" | "syncing";
  toast: string | null;
}

// ---- Constantes de layout ----
export const LEFT = 320;
export const HEADER = 92;
export const BARH = 76;
export const LANEGAP = 10;
export const TOPPAD = 14;
export const BANNER = 24;
export const GAPBELOW = 8;
export const BOTPAD = 12;
export const MINCOL = 252;
export let CURRENT = 1;
export const RELCOL = 184;
export const RELBAND = 40;
export const RELPARENT = 58;
export const CUS = 58;
export const CTASK = 44;
export const CGAP = 7;
export const BPAD = 9;
export const RELSPAN = 9;

export let NITER = 12;
export let BACKLOG = 12;

export let people: Person[] = [
  { id: "alice", name: "Alice Beaumont", role: "Backend Lead", teamRole: "Tech Lead", initials: "AB", color: "#6366f1", cap: [10, 8, 10] },
  { id: "romain", name: "Romain Duval", role: "Frontend", teamRole: "Développeur", initials: "RD", color: "#14b8a6", cap: [10, 10, 8] },
  { id: "yuki", name: "Yuki Tanaka", role: "Backend", teamRole: "Développeur", initials: "YT", color: "#f97316", cap: [7, 10, 10] },
  { id: "sofia", name: "Sofia Mendes", role: "QA / Tests", teamRole: "Testeur", initials: "SM", color: "#ec4899", cap: [10, 10, 10] },
  { id: "marcus", name: "Marcus Wei", role: "DevOps", teamRole: "Développeur", initials: "MW", color: "#0ea5e9", cap: [6, 10, 10] },
];

export const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export let iters: Iter[] = (() => {
  const M = MONTHS_FR;
  const pad = (n: number) => String(n).padStart(2, "0");
  const arr: Iter[] = [];
  const start = new Date(Date.UTC(2026, 5, 15));
  for (let i = 0; i < 12; i++) {
    const s = new Date(start);
    s.setUTCDate(start.getUTCDate() + i * 14);
    const e = new Date(s);
    e.setUTCDate(s.getUTCDate() + 11);
    const isoS = `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
    const isoE = `${e.getUTCFullYear()}-${pad(e.getUTCMonth() + 1)}-${pad(e.getUTCDate())}`;
    arr.push({
      label: "Itération " + (i + 1),
      short: "It." + (i + 1),
      dates: `${s.getUTCDate()} ${M[s.getUTCMonth()]} – ${e.getUTCDate()} ${M[e.getUTCMonth()]}`,
      sub: `${workingDays(isoS, isoE)}j ouvrés / pers.`,
      iso: [isoS, isoE],
    });
  }
  arr.push({ label: "Backlog", short: "Backlog", dates: "Non planifié", sub: "à prioriser", iso: ["", ""] });
  return arr;
})();

// [id, level, wit, title, points, effortDays, person, iter, span, state, progress, parent, tags]
type Def = [string, Level, string, string, number, number, string, number, number, string, number, string | null, string[]];
const defs: Def[] = [
  ["ADO-1200", "feature", "feature", "Authentification & SSO", 21, 0, "alice", 1, 2, "Active", 0.45, null, ["auth"]],
  ["ADO-1201", "feature", "feature", "Gantt collaboratif temps réel", 26, 0, "romain", 1, 2, "Active", 0.5, null, ["ui", "realtime"]],
  ["ADO-1202", "feature", "feature", "Données & messaging", 24, 0, "yuki", 1, 2, "Active", 0.35, null, ["backend"]],
  ["ADO-1203", "feature", "feature", "Qualité & release v2.4", 18, 0, "sofia", 2, 1, "New", 0, null, ["qa"]],
  ["ADO-1209", "feature", "feature", "Infrastructure & résilience", 16, 0, "marcus", 1, 2, "Active", 0.4, null, ["infra"]],
  ["ADO-1204", "story", "story", "Migration JWT v2", 5, 0, "alice", 0, 1, "Closed", 1, "ADO-1200", ["auth", "jwt"]],
  ["ADO-1211", "story", "bug", "Race condition logout", 3, 0, "alice", 0, 1, "Closed", 1, "ADO-1200", ["auth"]],
  ["ADO-1231", "story", "story", "Intégration OAuth SSO", 8, 0, "alice", 2, 1, "New", 0, "ADO-1200", ["auth", "sso"]],
  ["ADO-1240", "story", "story", "Notifications Slack", 3, 0, "alice", 12, 1, "New", 0, "ADO-1200", []],
  ["ADO-1218", "story", "story", "Politique cache Redis", 5, 0, "alice", 1, 1, "Active", 0.4, "ADO-1202", ["perf"]],
  ["ADO-1225", "story", "spike", "Rate limiting – spike", 2, 0, "alice", 1, 1, "Active", 0.3, "ADO-1202", []],
  ["ADO-1205", "story", "story", "Drag & drop Gantt", 8, 0, "romain", 0, 1, "Closed", 1, "ADO-1201", ["gantt", "ui"]],
  ["ADO-1212", "story", "story", "Curseurs présence WebSocket", 5, 0, "romain", 0, 1, "Resolved", 1, "ADO-1201", ["realtime"]],
  ["ADO-1219", "story", "story", "Navigation clavier a11y", 3, 0, "romain", 1, 1, "Active", 0.5, "ADO-1201", ["a11y"]],
  ["ADO-1226", "story", "story", "Responsive mobile", 5, 0, "romain", 1, 1, "New", 0, "ADO-1201", ["ui"]],
  ["ADO-1233", "story", "spike", "Audit performance front", 5, 0, "romain", 2, 1, "New", 0, "ADO-1201", ["perf"]],
  ["ADO-1241", "story", "story", "Export PDF rapport sprint", 5, 0, "romain", 12, 1, "New", 0, "ADO-1201", []],
  ["ADO-1206", "story", "story", "Optimiseur requêtes PostgreSQL", 5, 0, "yuki", 0, 1, "Closed", 1, "ADO-1202", ["perf", "db"]],
  ["ADO-1213", "story", "story", "Event sourcing – logs d'audit", 8, 0, "yuki", 1, 1, "Active", 0.55, "ADO-1202", ["backend"]],
  ["ADO-1220", "story", "bug", "Retry logic jobs asynchrones", 3, 0, "yuki", 1, 1, "New", 0, "ADO-1202", []],
  ["ADO-1227", "story", "story", "File de messages distribuée", 8, 0, "yuki", 1, 1, "New", 0, "ADO-1202", ["backend"]],
  ["ADO-1234", "story", "story", "API métriques Prometheus", 5, 0, "yuki", 2, 1, "New", 0, "ADO-1202", ["obs"]],
  ["ADO-1207", "story", "story", "Suite E2E – flux d'auth", 5, 0, "sofia", 0, 1, "Closed", 1, "ADO-1203", ["qa", "auth"]],
  ["ADO-1214", "story", "spike", "Load test 1 000 utilisateurs", 3, 0, "sofia", 1, 1, "Active", 0.3, "ADO-1203", ["perf"]],
  ["ADO-1221", "story", "story", "Régression Gantt board", 5, 0, "sofia", 1, 1, "New", 0, "ADO-1203", ["qa"]],
  ["ADO-1228", "story", "story", "Scan sécurité OWASP", 3, 0, "sofia", 1, 1, "New", 0, "ADO-1203", ["sécu"]],
  ["ADO-1235", "story", "story", "Plan UAT release v2.4", 5, 0, "sofia", 2, 1, "New", 0, "ADO-1203", ["qa"]],
  ["ADO-1242", "story", "bug", "Fix régression API paginée", 2, 0, "sofia", 12, 1, "New", 0, "ADO-1203", []],
  ["ADO-1208", "story", "story", "Autoscaling pods Kubernetes", 3, 0, "marcus", 0, 1, "Closed", 1, "ADO-1209", ["infra"]],
  ["ADO-1215", "story", "story", "Optimisation pipeline CI/CD", 5, 0, "marcus", 1, 1, "Active", 0.4, "ADO-1209", ["ci"]],
  ["ADO-1229", "story", "story", "Observabilité tracing OTel", 3, 0, "marcus", 1, 1, "New", 0, "ADO-1209", ["obs"]],
  ["ADO-1236", "story", "story", "Runbook reprise après sinistre", 5, 0, "marcus", 2, 1, "New", 0, "ADO-1209", ["infra"]],
  ["ADO-1331", "task", "task", "Config IdP Azure AD", 0, 1.5, "alice", 2, 1, "New", 0, "ADO-1231", []],
  ["ADO-1332", "task", "task", "Flow PKCE front", 0, 2, "romain", 2, 1, "New", 0, "ADO-1231", []],
  ["ADO-1318", "task", "task", "Bench Redis vs in-mem", 0, 1, "alice", 1, 1, "Active", 0.5, "ADO-1218", []],
  ["ADO-1313", "task", "task", "Schéma table events", 0, 1, "yuki", 1, 1, "Closed", 1, "ADO-1213", []],
  ["ADO-1314", "task", "task", "Projection read-model", 0, 2, "yuki", 1, 1, "Active", 0.4, "ADO-1213", []],
  ["ADO-1319", "task", "task", "Focus traps modales", 0, 1, "romain", 1, 1, "Active", 0.6, "ADO-1219", []],
  ["ADO-1327", "task", "task", "POC Kafka vs RabbitMQ", 0, 2, "yuki", 1, 1, "New", 0, "ADO-1227", []],
  ["ADO-1328", "task", "task", "Dead-letter queue", 0, 1.5, "marcus", 1, 1, "New", 0, "ADO-1227", []],
  ["ADO-1321", "task", "task", "Scénarios Playwright", 0, 2, "sofia", 1, 1, "New", 0, "ADO-1221", []],
  ["ADO-1322", "task", "task", "CI intégration tests", 0, 1, "marcus", 1, 1, "New", 0, "ADO-1221", []],
  ["ADO-1315", "task", "task", "Cache deps pipeline", 0, 1, "marcus", 1, 1, "Active", 0.3, "ADO-1215", []],
  ["ADO-1334", "task", "task", "Exporters custom", 0, 1.5, "yuki", 2, 1, "New", 0, "ADO-1234", []],
  ["ADO-1335", "task", "task", "Checklist UAT", 0, 1, "sofia", 2, 1, "New", 0, "ADO-1235", []],
  ["ADO-1250", "story", "story", "SSO – fédération SAML", 8, 0, "alice", 3, 1, "New", 0, "ADO-1200", ["sso", "auth"]],
  ["ADO-1251", "story", "story", "MFA / TOTP", 5, 0, "alice", 4, 1, "New", 0, "ADO-1200", ["auth"]],
  ["ADO-1252", "story", "story", "Sessions multi-appareils", 5, 0, "alice", 6, 1, "New", 0, "ADO-1200", ["auth"]],
  ["ADO-1253", "story", "story", "Rotation des secrets", 3, 0, "alice", 8, 1, "New", 0, "ADO-1200", ["sécu"]],
  ["ADO-1260", "story", "story", "Mode hors-ligne Gantt", 8, 0, "romain", 3, 1, "New", 0, "ADO-1201", ["ui"]],
  ["ADO-1261", "story", "story", "Historique & annulation", 5, 0, "romain", 5, 1, "New", 0, "ADO-1201", ["ui"]],
  ["ADO-1262", "story", "story", "Thèmes & personnalisation", 3, 0, "romain", 7, 1, "New", 0, "ADO-1201", ["ui"]],
  ["ADO-1270", "story", "story", "Sharding base de données", 8, 0, "yuki", 4, 1, "New", 0, "ADO-1202", ["db", "perf"]],
  ["ADO-1271", "story", "story", "Archivage froid S3", 5, 0, "yuki", 6, 1, "New", 0, "ADO-1202", ["backend"]],
  ["ADO-1272", "story", "story", "Réplication multi-AZ", 5, 0, "yuki", 9, 1, "New", 0, "ADO-1202", ["db"]],
  ["ADO-1280", "story", "story", "Suite perf release v2.5", 5, 0, "sofia", 4, 1, "New", 0, "ADO-1203", ["qa", "perf"]],
  ["ADO-1281", "story", "story", "Tests chaos / résilience", 5, 0, "sofia", 8, 1, "New", 0, "ADO-1203", ["qa"]],
  ["ADO-1290", "story", "story", "Multi-région failover", 8, 0, "marcus", 3, 1, "New", 0, "ADO-1209", ["infra"]],
  ["ADO-1291", "story", "story", "Budget & FinOps cloud", 5, 0, "marcus", 5, 1, "New", 0, "ADO-1209", ["infra"]],
  ["ADO-1292", "story", "story", "Zero-downtime deploys", 5, 0, "marcus", 7, 1, "New", 0, "ADO-1209", ["infra", "ci"]],
];

export const typeLabels: Record<string, string> = { epic: "Epic", feature: "Feature", story: "User Story", bug: "Bug", spike: "Spike", task: "Tâche" };
export let stateColors: Record<string, string> = { New: "#8a8f98", Active: "#0072B2", Resolved: "#CC79A7", Closed: "#009E73" };
/** Catégorie ADO par état (Proposed/InProgress/Resolved/Completed/Removed) — pour la progression. */
export let stateCat: Record<string, string> = {};
export const levelDefs: { key: Level; label: string }[] = [
  { key: "feature", label: "Feature" },
  { key: "story", label: "User Story" },
  { key: "task", label: "Tâche" },
];
export let epics: Record<string, { label: string; short: string; color: string }> = {
  "EP-100": { label: "Collaboration temps réel", short: "Collab. RT", color: "#0072B2" },
  "EP-200": { label: "Sécurité & accès", short: "Sécurité", color: "#D55E00" },
  "EP-300": { label: "Données & performance", short: "Données", color: "#009E73" },
  "EP-400": { label: "Qualité & release", short: "Qualité", color: "#CC79A7" },
  "EP-500": { label: "Infrastructure & résilience", short: "Infra", color: "#E69F00" },
};
export const featureEpic: Record<string, string> = { "ADO-1200": "EP-200", "ADO-1201": "EP-100", "ADO-1202": "EP-300", "ADO-1203": "EP-400", "ADO-1209": "EP-500" };
export const featureArea: Record<string, string> = {
  "ADO-1200": "Platform\\Authentification",
  "ADO-1201": "Platform\\Frontend",
  "ADO-1202": "Platform\\Backend",
  "ADO-1203": "Platform\\QA",
  "ADO-1209": "Platform\\Infra",
};
export let areaOptions = ["Platform\\Authentification", "Platform\\Frontend", "Platform\\Backend", "Platform\\QA", "Platform\\Infra", "Platform\\Shared"];
export let DAILY_STATES = ["New", "Active", "Resolved", "Closed"];
// Colonnes Daily par niveau (Epic/Feature/US/Tâche) — vide en mock (repli sur DAILY_STATES).
let dailyStatesByLevel: Record<string, string[]> = {};
/** Colonnes Daily pour un niveau donné, dans l'ordre du board ADO. */
export function dailyStates(level: string): string[] {
  const a = dailyStatesByLevel[level];
  return a && a.length ? a : DAILY_STATES;
}
// Colonne de board → état ADO à écrire (vide en mock : colonne = état).
let stateWrite: Record<string, Record<string, string>> = {};
export const stateToWrite = (level: string, column: string) => stateWrite[level]?.[column] ?? column;
/** Niveau adossé à un board ADO (colonnes Kanban) — le drop Daily écrit alors la colonne, pas l'état. */
export const hasBoardColumns = (level: string) => !!Object.keys(stateWrite[level] ?? {}).length;
// État ADO → colonne de board (inverse). Placement Daily piloté par l'état
// (toujours à jour) plutôt que par System.BoardColumn (recalculé par ADO, en retard).
let stateColumn: Record<string, Record<string, string>> = {};
export const columnForState = (level: string, state: string): string | undefined => stateColumn[level]?.[state];
/** Ticket "fermé" : catégorie ADO Completed (colonne "Done", "Closed"…). */
export const isDone = (s: string) => (stateCat[s] ? stateCat[s] === "Completed" : s === "Closed");
export const roleColors: Record<string, string> = { "Backend Lead": "#0072B2", Frontend: "#009E73", Backend: "#56B4E9", "QA / Tests": "#CC79A7", DevOps: "#E69F00" };
export const typeColors: Record<string, string> = { epic: "#7c3aed", feature: "#0072B2", story: "#009E73", bug: "#D55E00", spike: "#CC79A7", task: "#6b7280" };

export const presenceList: Presence[] = [
  { initials: "TM", name: "Toi (Théo Marchand)", color: "#5b5bd6" },
  { initials: "EL", name: "Elena Lévy", color: "#f59e0b" },
  { initials: "IV", name: "Ivan Petrov", color: "#06b6d4" },
];
export const cursorList: { name: string; color: string; wps: [number, number][] }[] = [
  { name: "Elena", color: "#f59e0b", wps: [[560, 170], [480, 560], [820, 470], [1010, 260], [640, 360]] },
  { name: "Ivan", color: "#06b6d4", wps: [[1080, 520], [820, 690], [560, 900], [300, 640], [900, 420]] },
];

// ---- maps dérivées ----
export let storyToFeature: Record<string, string> = {};
defs.forEach((r) => {
  if (r[1] === "story") storyToFeature[r[0]] = r[11]!;
});
export let titleOf: Record<string, string> = {};
defs.forEach((r) => {
  titleOf[r[0]] = r[3];
});

export function featureOf(it: Item): string {
  return it.level === "feature" ? it.id : it.level === "story" ? (it.parent as string) : storyToFeature[it.parent as string];
}
export function epicOf(it: Item): string {
  // Données réelles : epicId porté par le ticket ; mock : dérivé via featureEpic.
  return (it.epicId ?? featureEpic[featureOf(it)]) as string;
}
export function areaInit(it: Item): string {
  return featureArea[featureOf(it)] || "Platform\\Shared";
}

export function buildInitialItems(): Item[] {
  const items = defs.map((r) => {
    const it: Item = {
      id: r[0], ado: r[0], level: r[1], type: r[2], title: r[3], points: r[4], effortDays: r[5],
      person: r[6], iter: r[7], span: r[8], state: r[9], progress: r[10], parent: r[11], tags: r[12].slice(),
      startISO: iters[r[7]].iso[0], endISO: iters[r[7]].iso[1], area: "",
    };
    it.area = areaInit(it);
    it.epicId = featureEpic[featureOf(it)]; // rattache chaque item à son Epic
    return it;
  });
  // Epics synthétiques (le mock n'a pas de work items Epic) pour le Release tree.
  const epicItems: Item[] = Object.keys(epics).map((id, i) => ({
    id, ado: id, level: "epic", type: "epic", title: epics[id].label, points: 0, effortDays: 0,
    person: people[0].id, iter: CURRENT, span: 1, state: "Active", progress: 0.5, parent: null, tags: [],
    startISO: "", endISO: "", area: "", epicId: null, hasDateRange: false, priority: i + 1,
  }));
  return [...epicItems, ...items];
}

export function createInitialState(items: Item[] = buildInitialItems()): State {
  return {
    board: "sprint", level: "story", colorMode: "epic", hideClosed: false, epicFilter: "all", epicSort: "priority", containerW: 1100, containerH: 800,
    rangeFrom: CURRENT, rangeTo: Math.min(CURRENT + 1, NITER - 1), backlog: true, rangeOpen: false, prefsOpen: false,
    items, hidden: {}, peopleOpen: false, sort: "az",
    expanded: {}, hiddenRows: {}, loadBy: "person", releaseStart: CURRENT, rowPins: [], rowPinSel: null, scrollLeft: 0,
    milestones: [
      { id: "M1", title: "Livraison des API", iter: 3, color: "#D55E00" },
      { id: "M2", title: "Gel de code v2.4", iter: 5, color: "#0072B2" },
    ],
    milestoneSel: null,
    drag: null, selectedId: null, editing: null, sync: "saved", toast: null,
  };
}

// ---- dataset injectable (données réelles vs mock) ----
export interface Dataset {
  people: Person[];
  iters: Iter[];
  epics: Record<string, { label: string; short: string; color: string }>;
  areaOptions: string[];
  current: number;
  niter: number;
  items: Item[];
  storyToFeature: Record<string, string>;
  titleOf: Record<string, string>;
  dailyStates: string[];
  dailyStatesByLevel: Record<string, string[]>;
  stateColors: Record<string, string>;
  stateCat: Record<string, string>;
  /** Par niveau : colonne de board → état ADO réel à écrire au drop. */
  stateWrite: Record<string, Record<string, string>>;
  /** Par niveau : état ADO → colonne de board (inverse de stateWrite). */
  stateToColumn: Record<string, Record<string, string>>;
}

// ponytail: état module mutable — OK car un seul GanttBoard est monté à la fois.
// Remplace les données mock par les vraies (ADO) une fois la session chargée.
export function applyDataset(ds: Dataset) {
  people = ds.people;
  iters = ds.iters;
  epics = ds.epics;
  areaOptions = ds.areaOptions;
  CURRENT = ds.current;
  NITER = ds.niter;
  BACKLOG = ds.niter;
  storyToFeature = ds.storyToFeature;
  titleOf = ds.titleOf;
  DAILY_STATES = ds.dailyStates;
  dailyStatesByLevel = ds.dailyStatesByLevel;
  stateColors = { New: "#8a8f98", Active: "#0072B2", Resolved: "#CC79A7", Closed: "#009E73", ...ds.stateColors };
  stateCat = ds.stateCat;
  stateWrite = ds.stateWrite;
  stateColumn = ds.stateToColumn;
}

// ---- helpers purs ----
export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
// Champ utilisé pour le calcul de charge (et le tri par charge) — configurable
// via les préférences d'affichage. Toujours mappé sur un champ ADO réel :
// Story Points, estimation en jours, ou le referenceName d'un champ custom
// numérique (Item.custom).
export type LoadField = "points" | "effortDays" | (string & {});
export let loadField: LoadField = "points";
export const setLoadField = (f: LoadField) => { loadField = f; };
// Effort = valeur brute du champ choisi (pas de conversion SP ↔ j/homme —
// chaque équipe définit ce que vaut 1 point).
export const effortOf = (it: Item) =>
  loadField === "points" ? it.points
  : loadField === "effortDays" ? it.effortDays
  : Number(it.custom?.[loadField]) || 0;
export const stateProgress = (s: string) => {
  // Données réelles : progression dérivée de la catégorie ADO de l'état.
  const cat = stateCat[s];
  if (cat) return cat === "Proposed" || cat === "Removed" ? 0 : cat === "InProgress" ? 0.5 : 1;
  // Mock / états inconnus : heuristique historique.
  return s === "New" ? 0 : s === "Active" ? 0.5 : 1;
};
export const fmtDate = (iso: string) => {
  if (!iso) return "";
  const [, m, dd] = iso.split("-").map(Number);
  return dd + " " + MONTHS_FR[m - 1];
};
export const formatRange = (a: string, b: string) => {
  if (!a && !b) return "—";
  const A = fmtDate(a), B = fmtDate(b);
  return A && B ? `${A} → ${B}` : A || B;
};
export const capColor = (pct: number) =>
  pct > 1 ? "var(--color-error,#ef4444)" : pct >= 0.85 ? "var(--color-pending,#f5a623)" : "var(--color-synced,#2bbf73)";

function hexToRgb(h: string): [number, number, number] {
  h = h.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v * (1 - t) + B[i] * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export function hashColor(s: string, theme: Theme): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 58% ${theme === "dark" ? 60 : 48}%)`;
}
export interface Toned {
  bg: string;
  border: string;
  text: string;
  accent: string;
}
export function toned(base: string, theme: Theme): Toned {
  return theme === "dark"
    ? { bg: mix(base, "#161619", 0.76), border: mix(base, "#161619", 0.5), text: mix(base, "#ffffff", 0.4), accent: mix(base, "#ffffff", 0.12) }
    : { bg: mix(base, "#ffffff", 0.9), border: mix(base, "#ffffff", 0.72), text: mix(base, "#000000", 0.28), accent: base };
}
export const colorMap = (type: string, theme: Theme): Toned => toned(typeColors[type] || "#6b7280", theme);
export function colorForBar(it: Item, colorMode: State["colorMode"], theme: Theme): Toned {
  if (colorMode === "state") return toned(stateColors[it.state], theme);
  if (colorMode === "epic") return toned((epics[epicOf(it)] || {}).color || "#888", theme);
  return colorMap(it.type, theme);
}
export function loadColor(by: string, key: string, theme: Theme): string {
  if (by === "none") return "#5b5bd6"; // Global : barre unique, couleur accent
  if (by === "person") {
    const p = people.find((x) => x.id === key);
    return p ? p.color : "#888";
  }
  // Poste : couleur fixe pour les postes mock connus, sinon dérivée du libellé
  // (postes saisis librement dans le panneau utilisateur).
  return roleColors[key] || hashColor(key, theme);
}
export function loadKeyLabel(by: string, key: string): string {
  if (by === "none") return "Charge totale";
  if (by === "person") {
    const p = people.find((x) => x.id === key);
    return p ? p.name : key;
  }
  return key;
}

export const visibleCols = (s: State): number[] => {
  const a: number[] = [];
  for (let i = s.rangeFrom; i <= s.rangeTo; i++) a.push(i);
  if (s.backlog) a.push(BACKLOG);
  return a;
};
export const relCols = (): number[] => {
  const a: number[] = [];
  for (let i = 0; i < NITER; i++) a.push(i);
  return a;
};

// Release planning : tout replié par défaut, l'utilisateur déplie à la demande.
export function isOpen(s: State, key: string): boolean {
  const e = s.expanded;
  if (key in e) return e[key];
  return false;
}

export const storiesOfFeature = (s: State, fid: string) => s.items.filter((x) => x.level === "story" && x.parent === fid);
export const storiesOfArea = (s: State, area: string) => {
  const fids = s.items.filter((f) => f.level === "feature" && f.area === area).map((f) => f.id);
  return s.items.filter((x) => x.level === "story" && fids.includes(x.parent as string));
};
export function derivedRange(us: Item[]): [number, number] | null {
  let mn = 99, mx = -1;
  us.forEach((sx) => {
    if (sx.iter < NITER) {
      if (sx.iter < mn) mn = sx.iter;
      if (sx.iter > mx) mx = sx.iter;
    }
  });
  if (mx < 0) return null;
  return [mn, mx];
}
/**
 * Index du sprint couvrant une date. Une date en milieu de sprint ⇒ ce sprint.
 * `which='start'` : premier sprint finissant à/après la date.
 * `which='end'` : dernier sprint commençant à/avant la date.
 */
export function sprintIndexForDate(iso: string, which: "start" | "end"): number | null {
  const d = iso.slice(0, 10);
  if (!d) return null;
  if (which === "start") {
    for (let i = 0; i < NITER; i++) if (iters[i].iso[1] && d <= iters[i].iso[1]) return i;
    return NITER - 1;
  }
  let last = -1;
  for (let i = 0; i < NITER; i++) if (iters[i].iso[0] && iters[i].iso[0] <= d) last = i;
  return last >= 0 ? last : 0;
}

export function featRange(s: State, f: Item): [number, number] {
  // 1) Redimensionnement manuel (drag) prioritaire.
  if (f.relS != null && f.relE != null) return [f.relS, f.relE];
  // 2) Intervalle réel Start Date → Target Date (Feature/Epic ADO).
  if (f.hasDateRange && f.startISO && f.endISO) {
    const a = sprintIndexForDate(f.startISO, "start");
    const b = sprintIndexForDate(f.endISO, "end");
    if (a != null && b != null) return [Math.min(a, b), Math.max(a, b)];
  }
  // 3) Sinon, dérivé des itérations des US enfants.
  const d = derivedRange(storiesOfFeature(s, f.id));
  return d || [f.iter, f.iter];
}

export interface FeatureNode {
  item: Item;
  stories: { item: Item; tasks: { item: Item }[] }[];
}
export interface TreeNode {
  epicId: string | null;
  epic: Item | null;
  features: FeatureNode[];
  range: [number, number] | null;
  /** 0 = en cours, 1 = à venir, 2 = terminé, 3 = sans date. */
  bucket: number;
}

const nodeName = (n: TreeNode) => (n.epic ? n.epic.title : "(Sans epic)");
const nodeEffort = (n: TreeNode) => n.features.reduce((s, f) => s + f.stories.reduce((ss, st) => ss + effortOf(st.item), 0), 0);

function statusBucket(range: [number, number] | null): number {
  if (!range) return 3;
  const [s0, e0] = range;
  if (s0 <= CURRENT && e0 >= CURRENT) return 0;
  if (s0 > CURRENT) return 1;
  return 2;
}

/** Intervalle d'un Epic : ses dates Start/Target sinon dérivé des US descendantes. */
export function epicRange(epic: Item | null, features: FeatureNode[]): [number, number] | null {
  if (epic && epic.hasDateRange && epic.startISO && epic.endISO) {
    const a = sprintIndexForDate(epic.startISO, "start");
    const b = sprintIndexForDate(epic.endISO, "end");
    if (a != null && b != null) return [Math.min(a, b), Math.max(a, b)];
  }
  const us: Item[] = [];
  features.forEach((f) => f.stories.forEach((st) => us.push(st.item)));
  return derivedRange(us);
}

export function buildTree(s: State): TreeNode[] {
  const epicItems = s.items.filter((i) => i.level === "epic");
  const feats = s.items.filter((i) => i.level === "feature");
  const featNode = (f: Item): FeatureNode => ({
    item: f,
    stories: s.items
      .filter((st) => st.level === "story" && st.parent === f.id)
      .map((st) => ({ item: st, tasks: s.items.filter((t) => t.level === "task" && t.parent === st.id).map((t) => ({ item: t })) })),
  });
  const mk = (epic: Item | null, features: FeatureNode[]): TreeNode => {
    const range = epicRange(epic, features);
    return { epicId: epic ? epic.id : null, epic, features, range, bucket: statusBucket(range) };
  };
  const nodes: TreeNode[] = epicItems.map((epic) => mk(epic, feats.filter((f) => f.epicId === epic.id).map(featNode)));
  const orphan = feats.filter((f) => !f.epicId || !epicItems.some((e) => e.id === f.epicId));
  if (orphan.length) nodes.push(mk(null, orphan.map(featNode)));

  const filtered = nodes.filter((n) => {
    if (s.epicFilter === "hideDone") return n.bucket !== 2;
    if (s.epicFilter === "activeOnly") return n.bucket === 0; // masque terminés ET pas démarrés
    return true;
  });
  // Ordre : statut (en cours > à venir > terminé), puis priorité (ou nom).
  filtered.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    if (s.epicSort === "name") return nodeName(a).localeCompare(nodeName(b), "fr");
    if (s.epicSort === "effort") return nodeEffort(b) - nodeEffort(a) || nodeName(a).localeCompare(nodeName(b), "fr");
    const pa = a.epic?.priority ?? 999, pb = b.epic?.priority ?? 999;
    if (pa !== pb) return pa - pb;
    return (a.range?.[0] ?? 99) - (b.range?.[0] ?? 99) || nodeName(a).localeCompare(nodeName(b), "fr");
  });
  return filtered;
}

export function parentCharge(s: State, usList: Item[]) {
  const per: Record<number, number> = {};
  let max = 0, minIter = 99, maxIter = -1, total = 0;
  usList.forEach((sx) => {
    if (s.hideClosed && isDone(sx.state)) return;
    if (s.hidden[sx.person]) return;
    per[sx.iter] = (per[sx.iter] || 0) + effortOf(sx);
    total += effortOf(sx);
    if (sx.iter < NITER) {
      if (sx.iter < minIter) minIter = sx.iter;
      if (sx.iter > maxIter) maxIter = sx.iter;
    }
  });
  Object.values(per).forEach((v) => {
    if (v > max) max = v;
  });
  const startISO = minIter <= maxIter ? iters[minIter].iso[0] : "";
  const endISO = minIter <= maxIter ? iters[maxIter].iso[1] : "";
  return { per, max, total, minIter, maxIter, startISO, endISO };
}

export function personLoad(s: State): Record<string, number> {
  const daily = s.board === "daily";
  const cols = daily ? [CURRENT] : visibleCols(s).filter((c) => c < NITER);
  const L: Record<string, number> = {};
  people.forEach((p) => (L[p.id] = 0));
  s.items.forEach((it) => {
    if (it.level !== s.level) return;
    if (s.hideClosed && isDone(it.state)) return;
    if (!cols.includes(it.iter)) return;
    L[it.person] += effortOf(it);
  });
  return L;
}

/** Écart absolu |charge − capacité| par personne, sur les itérations visibles (Daily : la courante). */
export function personGap(s: State): Record<string, number> {
  const L = personLoad(s);
  const cols = s.board === "daily" ? [CURRENT] : visibleCols(s).filter((c) => c < NITER);
  const G: Record<string, number> = {};
  people.forEach((p) => {
    const cap = cols.reduce((sum, c) => sum + capOf(p, c), 0);
    G[p.id] = Math.abs(L[p.id] - cap);
  });
  return G;
}

let _randOrder: string[] | null = null;
export function resetRandOrder() {
  _randOrder = null;
}
export function sortedPeople(s: State, list: Person[]): Person[] {
  const sort = s.sort;
  const a = list.slice();
  if (sort === "az" || sort === "za") {
    a.sort((x, y) => x.name.localeCompare(y.name, "fr"));
    if (sort === "za") a.reverse();
  } else if (sort === "loadAsc" || sort === "loadDesc") {
    const L = personLoad(s);
    a.sort((x, y) => L[x.id] - L[y.id]);
    if (sort === "loadDesc") a.reverse();
  } else if (sort === "gapAsc" || sort === "gapDesc") {
    const G = personGap(s);
    a.sort((x, y) => G[x.id] - G[y.id]);
    if (sort === "gapDesc") a.reverse();
  } else if (sort === "random") {
    if (!_randOrder) _randOrder = people.map((p) => p.id).sort(() => Math.random() - 0.5);
    a.sort((x, y) => _randOrder!.indexOf(x.id) - _randOrder!.indexOf(y.id));
  }
  return a;
}

// ---- layout ----
export interface LayoutRow {
  personId?: string;
  top: number;
  height: number;
  lanes?: number;
  kind?: "epic" | "feature" | "band";
  depth?: number;
  key?: string;
  epicName?: string;
  hasChildren?: boolean;
  open?: boolean;
  count?: number;
  us?: Item[];
  accent?: string;
  epicShort?: string;
  item?: Item;
  /** Intervalle [sprintDébut, sprintFin] de l'Epic (pour la barre + statut). */
  range?: [number, number] | null;
}
export interface LayoutBar {
  item: Item;
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface LayoutCard {
  item: Item;
  level: Level;
  ci: number;
  left: number;
  top: number;
  width: number;
  height: number;
  hasChildren?: boolean;
  open?: boolean;
}
export interface Layout {
  rows: LayoutRow[];
  bars: LayoutBar[];
  cards?: LayoutCard[];
  totalHeight: number;
  cols?: number[];
}

export function releaseLayout(s: State, COLW: number): Layout {
  const cols = relCols(), rows: LayoutRow[] = [], cards: LayoutCard[] = [];
  let y = HEADER;
  const tree = buildTree(s);
  // Colonne d'un item, clampée dans [lo, hi] (containment US ⊆ Feature ⊆ Epic).
  const clampCol = (iter: number, lo: number, hi: number) => cols.indexOf(Math.max(lo, Math.min(hi, iter)));
  tree.forEach((node) => {
    const ekey = "epic:" + (node.epicId ?? "__none__"), eopen = isOpen(s, ekey);
    const epicUS: Item[] = [];
    node.features.forEach((f) => f.stories.forEach((st) => epicUS.push(st.item)));
    const eColor = (node.epic ? epics[node.epic.id]?.color : null) || "#64748b";
    rows.push({ kind: "epic", depth: 0, key: ekey, item: node.epic ?? undefined, epicName: nodeName(node), hasChildren: node.features.length > 0, open: eopen, count: node.features.length, us: epicUS, accent: eColor, range: node.range, top: y, height: RELPARENT });
    y += RELPARENT;
    if (!eopen) return;
    node.features.forEach((f) => {
      const fopen = isOpen(s, f.item.id);
      const fUS = f.stories.map((st) => st.item);
      const ep = epics[epicOf(f.item)] || ({} as { color?: string; short?: string });
      // Feature ⊆ Epic : intervalle de la feature borné par celui de l'epic.
      const fr = featRange(s, f.item);
      const efr: [number, number] = node.range ? [Math.max(fr[0], node.range[0]), Math.min(fr[1], node.range[1])] : fr;
      const lo = Math.min(efr[0], efr[1]), hi = Math.max(efr[0], efr[1]);
      rows.push({ kind: "feature", depth: 1, key: f.item.id, item: f.item, hasChildren: f.stories.length > 0, open: fopen, us: fUS, accent: ep.color || "#0072B2", epicShort: ep.short || "", range: efr, top: y, height: RELPARENT });
      y += RELPARENT;
      if (!fopen) return;
      const bandTop = y, colY = cols.map(() => bandTop + BPAD);
      f.stories.forEach((st) => {
        const ci = clampCol(st.item.iter, lo, hi); // US ⊆ Feature
        if (ci < 0) return;
        const sopen = isOpen(s, st.item.id);
        cards.push({ item: st.item, level: "story", ci, left: LEFT + ci * COLW + 8, top: colY[ci], width: COLW - 16, height: CUS, hasChildren: st.tasks.length > 0, open: sopen });
        colY[ci] += CUS + CGAP;
        if (sopen)
          st.tasks.forEach((t) => {
            const tci = clampCol(t.item.iter, lo, hi);
            if (tci < 0) return;
            cards.push({ item: t.item, level: "task", ci: tci, left: LEFT + tci * COLW + 22, top: colY[tci], width: COLW - 30, height: CTASK });
            colY[tci] += CTASK + CGAP;
          });
      });
      const bandH = Math.max(...colY) - bandTop + BPAD;
      rows.push({ kind: "band", depth: 0, key: f.item.id + ":band", top: bandTop, height: bandH });
      y += bandH;
    });
  });
  return { rows, bars: [], cards, totalHeight: Math.max(y + 20, 520) };
}

export function computeLayout(s: State, COLW: number): Layout {
  if (s.board === "release") return releaseLayout(s, COLW);
  const lvl = s.level, daily = s.board === "daily";
  const dStates = dailyStates(lvl);
  const cols = daily ? dStates.map((_, i) => i) : visibleCols(s);
  const include = (it: Item) => {
    if (it.level !== lvl) return false;
    if (s.hideClosed && isDone(it.state)) return false;
    if (daily) return it.iter === CURRENT;
    return true;
  };
  const bucketOf = (it: Item) => (daily ? dStates.indexOf(it.state) : cols.indexOf(it.iter));
  const TOPB = daily ? 0 : BANNER, GAPB = daily ? 0 : GAPBELOW;
  const rows: LayoutRow[] = [], bars: LayoutBar[] = [];
  let y = HEADER;
  const ppl = sortedPeople(s, people.filter((p) => !s.hidden[p.id]));
  for (const p of ppl) {
    const perCol: Item[][] = cols.map(() => []);
    s.items.forEach((it) => {
      if (it.person !== p.id || !include(it)) return;
      const ci = bucketOf(it);
      if (ci >= 0 && ci < cols.length) perCol[ci].push(it);
    });
    const lanes = Math.max(1, ...perCol.map((a) => a.length));
    const rowH = TOPPAD + TOPB + GAPB + lanes * BARH + (lanes - 1) * LANEGAP + BOTPAD;
    rows.push({ personId: p.id, top: y, height: rowH, lanes });
    perCol.forEach((arr, ci) =>
      arr.forEach((it, idx) => {
        const span = daily ? 1 : Math.max(1, Math.min(it.span || 1, cols.length - ci));
        bars.push({ item: it, left: LEFT + ci * COLW + 10, top: y + TOPPAD + TOPB + GAPB + idx * (BARH + LANEGAP), width: span * COLW - 20, height: BARH });
      }),
    );
    y += rowH;
  }
  return { rows, bars, totalHeight: Math.max(y + 20, 520), cols };
}

/** Ids des US appartenant à une ligne (epic/feature) masquée en Release. */
export function hiddenStoryIds(s: State): Set<string> {
  const out = new Set<string>();
  if (!Object.keys(s.hiddenRows).some((k) => s.hiddenRows[k])) return out;
  const epicIds = new Set(s.items.filter((i) => i.level === "epic").map((e) => e.id));
  const featHidden = new Set<string>();
  s.items.forEach((f) => {
    if (f.level !== "feature") return;
    const epicKey = "epic:" + (f.epicId && epicIds.has(f.epicId) ? f.epicId : "__none__");
    if (s.hiddenRows[f.id] || s.hiddenRows[epicKey]) featHidden.add(f.id);
  });
  s.items.forEach((it) => {
    if (it.level === "story" && it.parent && featHidden.has(it.parent)) out.add(it.id);
  });
  return out;
}

export function relLoadBand(s: State, cols: number[], theme: Theme) {
  const by = s.loadBy;
  const hiddenSt = hiddenStoryIds(s);
  return cols.map((real) => {
    const cap = people.filter((p) => !s.hidden[p.id] && !p.unassigned).reduce((sum, p) => sum + capOf(p, real), 0);
    const groups: Record<string, number> = {};
    let total = 0;
    s.items.forEach((it) => {
      if (it.level !== "story") return;
      if (s.hideClosed && isDone(it.state)) return;
      if (it.iter !== real || s.hidden[it.person] || hiddenSt.has(it.id)) return;
      const eff = effortOf(it);
      total += eff;
      let key: string;
      if (by === "person") key = it.person;
      else if (by === "role") {
        const p = people.find((x) => x.id === it.person);
        key = p && p.role ? p.role : "(sans poste)";
      } else key = "__all__"; // Global : une seule barre agrégée
      groups[key] = (groups[key] || 0) + eff;
    });
    const segs = Object.keys(groups)
      .map((k) => ({ key: k, val: groups[k], color: loadColor(by, k, theme), label: loadKeyLabel(by, k) }))
      .sort((a, b) => b.val - a.val);
    return { real, cap, total, segs };
  });
}
