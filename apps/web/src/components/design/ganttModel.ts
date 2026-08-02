// Modèle + données mock + helpers purs, traduits du prototype Claude Design
// "Gantt Sprint Collaboratif". Aucune dépendance React : tout est pur.

import { workingDays } from "../../utils/dates";

export type Theme = "light" | "dark";
export type Level = "epic" | "feature" | "story" | "task";
type Board = "me" | "sprint" | "daily" | "release";

export interface Person {
  id: string;
  name: string;
  /** Poste / métier (ex. "Backend Lead") — sert aussi à la couleur et au regroupement de charge. */
  role: string;
  /** Rôle dans l'équipe/sprint (ex. "Tech Lead", "Développeur"). Optionnel. */
  teamRole?: string;
  initials: string;
  color: string;
  /** Capacité par itération (jours). Absente = 0 (à saisir explicitement). */
  cap: number[];
  /** Ligne "Non assigné" (pas un membre réel) : exclue des totaux de capacité. */
  unassigned?: boolean;
}

/** Capacité par défaut quand elle n'est pas fixée : 0 (à saisir explicitement). */
export const capOf = (p: Person, iter: number) => p.cap[iter] ?? 0;

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
  /** HTML ADO (System.Description) — affiché dans la vue @me. */
  description?: string;
  /** HTML ADO (Microsoft.VSTS.Common.AcceptanceCriteria) — affiché dans la vue @me. */
  acceptanceCriteria?: string;
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

interface RowPin {
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
  /** Release : tri des Epics à l'intérieur des groupes de statut —
   * "priority" | "name" | "effort", ou le referenceName d'un champ ADO custom. */
  epicSort: string;
  /** Release : sens du tri des Epics — n'inverse que le critère, pas le groupement par statut. */
  epicSortDir: "asc" | "desc";
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
  /** Release : intervalle d'itérations des métriques macro (Σ capa/effort, ligne de flottaison). */
  metricsFrom: number;
  metricsTo: number;
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
const TITLELH = 17; // hauteur d'une ligne de titre (13px × 1.25)
// Tout ce que la carte sprint/daily contient hors titre : bordures (4) +
// paddings 7/9 (16) + entête ado/type/points (20) + pied epic/area (19).
// BARH le sous-estimait : le pied débordait dès que le titre passait à 2 lignes.
const CARDCHROME = 61;
const TITLELINES = 1; // lignes de titre incluses dans BARH
const BARH = CARDCHROME + TITLELINES * TITLELH;
const CARDTEXTPAD = 46; // marges de colonne (20) + padding horizontal de la carte (26)
const LANEGAP = 10;
export const TOPPAD = 14;
export const BANNER = 24;
const GAPBELOW = 8;
const BOTPAD = 12;
export const MINCOL = 252;
export const RELCOL = 200; // largeur mini d'une colonne release (bande de charge : ~4 chiffres par nombre)
export const RELBAND = 40;
const RELPARENT = 58;
const CARDLH = 15; // hauteur d'une ligne de titre de carte Release (12px × 1.25)
// Hors titre : bordures (3) + paddings (12/10) + gap (2) + entête (15).
const CUS = 32 + 2 * CARDLH; // carte US Release : 2 lignes de titre
const CTASK = 30 + CARDLH; // carte tâche Release : 1 ligne de titre
const CGAP = 7;
const BPAD = 9;
const RELSPAN = 9;

export let NITER = 12;
export let BACKLOG = 12;

export let people: Person[] = [
  { id: "alice", name: "Alice Beaumont", role: "Backend Lead", teamRole: "Tech Lead", initials: "AB", color: "#0072B2", cap: [10, 8, 10] },
  { id: "romain", name: "Romain Duval", role: "Frontend", teamRole: "Développeur", initials: "RD", color: "#d85f00", cap: [10, 10, 8] },
  { id: "yuki", name: "Yuki Tanaka", role: "Backend", teamRole: "Développeur", initials: "YT", color: "#009E73", cap: [7, 10, 10] },
  { id: "sofia", name: "Sofia Mendes", role: "QA / Tests", teamRole: "Testeur", initials: "SM", color: "#CC79A7", cap: [10, 10, 10] },
  { id: "marcus", name: "Marcus Wei", role: "DevOps", teamRole: "Développeur", initials: "MW", color: "#E69F00", cap: [6, 10, 10] },
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

/**
 * Index de l'itération contenant `today`. À défaut (jour hors sprint, sprints
 * terminés) la dernière déjà commencée, sinon la première. Les itérations sans
 * dates (Backlog) sont ignorées.
 */
export function currentIter(list: Iter[], today = new Date().toISOString().slice(0, 10)): number {
  let started = 0;
  for (let i = 0; i < list.length; i++) {
    const [s, e] = list[i].iso;
    if (!s) continue;
    if (s <= today && today <= e) return i;
    if (s <= today) started = i;
  }
  return started;
}

export let CURRENT = currentIter(iters);

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
const featureEpic: Record<string, string> = { "ADO-1200": "EP-200", "ADO-1201": "EP-100", "ADO-1202": "EP-300", "ADO-1203": "EP-400", "ADO-1209": "EP-500" };
const featureArea: Record<string, string> = {
  "ADO-1200": "Platform\\Authentification",
  "ADO-1201": "Platform\\Frontend",
  "ADO-1202": "Platform\\Backend",
  "ADO-1203": "Platform\\QA",
  "ADO-1209": "Platform\\Infra",
};
export let areaOptions = ["Platform\\Authentification", "Platform\\Frontend", "Platform\\Backend", "Platform\\QA", "Platform\\Infra", "Platform\\Shared"];
let DAILY_STATES = ["New", "Active", "Resolved", "Closed"];
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
const roleColors: Record<string, string> = { "Backend Lead": "#0072B2", Frontend: "#009E73", Backend: "#56B4E9", "QA / Tests": "#CC79A7", DevOps: "#E69F00" };
const typeColors: Record<string, string> = { epic: "#7c3aed", feature: "#0072B2", story: "#009E73", bug: "#D55E00", spike: "#CC79A7", task: "#6b7280" };

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

function featureOf(it: Item): string {
  return it.level === "feature" ? it.id : it.level === "story" ? (it.parent as string) : storyToFeature[it.parent as string];
}
export function epicOf(it: Item): string {
  // Données réelles : epicId porté par le ticket ; mock : dérivé via featureEpic.
  return (it.epicId ?? featureEpic[featureOf(it)]) as string;
}
function areaInit(it: Item): string {
  return featureArea[featureOf(it)] || "Platform\\Shared";
}

function buildInitialItems(): Item[] {
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
  // Un projet ADO sans aucune itération donne NITER = 0 : sans ce plancher, les
  // index de fin valent -1 et `iters[-1].short` casse le rendu de l'entête.
  const last = Math.max(0, NITER - 1);
  return {
    board: "sprint", level: "story", colorMode: "epic", hideClosed: false, epicFilter: "all", epicSort: "priority", epicSortDir: "asc", containerW: 1100, containerH: 800,
    rangeFrom: CURRENT, rangeTo: Math.min(CURRENT + 1, last), backlog: true, rangeOpen: false, prefsOpen: false,
    items, hidden: {}, peopleOpen: false, sort: "az",
    expanded: {}, hiddenRows: {}, loadBy: "person", releaseStart: CURRENT,
    // ~1 trimestre par défaut : 6 sprints de 2 semaines à partir du courant.
    metricsFrom: CURRENT, metricsTo: Math.min(CURRENT + 5, last),
    rowPins: [], rowPinSel: null, scrollLeft: 0,
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
const fmtDate = (iso: string) => {
  if (!iso) return "";
  const [, m, dd] = iso.split("-").map(Number);
  return dd + " " + MONTHS_FR[m - 1];
};
export const formatRange = (a: string, b: string) => {
  if (!a && !b) return "—";
  const A = fmtDate(a), B = fmtDate(b);
  return A && B ? `${A} → ${B}` : A || B;
};
/** Palier de charge : 0 = sous la capacité, 1 = zone d'alerte (85-100 %),
 * 2 = surcharge. Mêmes seuils que capColor — la couleur seule ne suffit pas
 * à distinguer le palier 1 du palier 0 en deutéranopie. */
export const loadMark = (pct: number): 0 | 1 | 2 => (pct > 1 ? 2 : pct >= 0.85 ? 1 : 0);
/** Couleur de jauge (aplat) : pastilles, remplissages. */
export const capColor = (pct: number) =>
  pct > 1 ? "var(--color-error,#ef4444)" : pct >= 0.85 ? "var(--color-pending,#f5a623)" : "var(--color-synced,#2bbf73)";
/** Même sémantique en couleur de texte : les aplats ci-dessus sont trop clairs
 * pour du 10-12px sur --panel (WCAG AA petit texte). */
export const capTextColor = (pct: number) =>
  pct > 1 ? "var(--color-error-text,#c62828)" : pct >= 0.85 ? "var(--color-pending-text,#8a5a00)" : "var(--color-synced-text,#1f8a54)";

/** RGB d'une couleur écrite en #rgb, #rrggbb, hsl(h s% l%) ou rgb(r,g,b). */
function toRgb(c: string): [number, number, number] {
  const hsl = /hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(c);
  if (hsl) {
    const h = +hsl[1], s = +hsl[2] / 100, l = +hsl[3] / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
  const h0 = c.replace("#", "");
  const h = h0.length === 3 ? h0.replace(/(.)/g, "$1$1") : h0;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// mix() passait par un parseur hex-only : toute entrée hsl() (hashColor) ou
// rgb() sortait en rgb(NaN,NaN,NaN). Il partage désormais toRgb.
function mix(a: string, b: string, t: number): string {
  const A = toRgb(a), B = toRgb(b);
  const c = A.map((v, i) => Math.round(v * (1 - t) + B[i] * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
/** Luminance relative WCAG (0 = noir, 1 = blanc). */
function relLum(c: string): number {
  const v = toRgb(c).map((x) => {
    const u = x / 255;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
/** Contraste WCAG entre deux couleurs (1 = identiques, 21 = noir sur blanc). */
function contrast(a: string, b: string): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Couleur de texte lisible sur un aplat de données (avatar, jalon, flag).
 * Le blanc systématique échouait l'AA sur toute la bande jaune-vert-cyan.
 * On compare les deux ratios plutôt que de tester un seuil de luminance :
 * le point de bascule dépend de --ink et un seuil approché choisit la
 * mauvaise option juste autour. */
export const onColor = (bg: string): string =>
  contrast("#1a1a20", bg) >= contrast("#ffffff", bg) ? "#1a1a20" : "#ffffff";
// La lightness HSL n'est pas la luminance perçue : à L fixe, hsl(60…) (jaune)
// est bien plus clair que hsl(240…) (bleu). À 48 %/60 %, du texte blanc posé
// dessus échouait sur 196/360 puis 328/360 teintes. 30 % (clair, texte blanc)
// et 70 % (sombre, texte --ink) tiennent l'AA sur tout le cercle.
export function hashColor(s: string, theme: Theme): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 58% ${theme === "dark" ? 70 : 30}%)`;
}
interface Toned {
  bg: string;
  border: string;
  text: string;
  accent: string;
}
// `text` est poussé à 55 % vers le noir (clair) / le blanc (sombre) : c'est le
// minimum qui garantit ≥ 4,5:1 sur `bg` ET sur --panel pour n'importe quelle
// teinte, y compris les couleurs d'état renvoyées par ADO (arbitraires).
// À 28/40 % (valeurs précédentes) les teintes jaune-vert tombaient à ~2,2:1.
function toned(base: string, theme: Theme): Toned {
  return theme === "dark"
    ? { bg: mix(base, "#161619", 0.76), border: mix(base, "#161619", 0.5), text: mix(base, "#ffffff", 0.55), accent: mix(base, "#ffffff", 0.12) }
    : { bg: mix(base, "#ffffff", 0.9), border: mix(base, "#ffffff", 0.72), text: mix(base, "#000000", 0.55), accent: base };
}
export const colorMap = (type: string, theme: Theme): Toned => toned(typeColors[type] || "#6b7280", theme);
/** Déclinaison contrastée d'une couleur de données (fond/bordure/texte/accent). */
export const tone = (base: string, theme: Theme): Toned => toned(base, theme);
export function colorForBar(it: Item, colorMode: State["colorMode"], theme: Theme): Toned {
  if (colorMode === "state") return toned(stateColors[it.state], theme);
  if (colorMode === "epic") return toned((epics[epicOf(it)] || {}).color || "#888", theme);
  return colorMap(it.type, theme);
}
function loadColor(by: string, key: string, theme: Theme): string {
  if (by === "none") return "#5b5bd6"; // Global : barre unique, couleur accent
  if (by === "person") {
    const p = people.find((x) => x.id === key);
    return p ? p.color : "#888";
  }
  // Poste : couleur fixe pour les postes mock connus, sinon dérivée du libellé
  // (postes saisis librement dans le panneau utilisateur).
  return roleColors[key] || hashColor(key, theme);
}
function loadKeyLabel(by: string, key: string): string {
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

const storiesOfFeature = (s: State, fid: string) => s.items.filter((x) => x.level === "story" && x.parent === fid);
const storiesOfArea = (s: State, area: string) => {
  const fids = s.items.filter((f) => f.level === "feature" && f.area === area).map((f) => f.id);
  return s.items.filter((x) => x.level === "story" && fids.includes(x.parent as string));
};
function derivedRange(us: Item[]): [number, number] | null {
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
function sprintIndexForDate(iso: string, which: "start" | "end"): number | null {
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

interface StoryNode {
  item: Item;
  tasks: { item: Item }[];
}
interface FeatureNode {
  item: Item;
  stories: StoryNode[];
}
interface TreeNode {
  epicId: string | null;
  epic: Item | null;
  features: FeatureNode[];
  /** US rattachées directement à l'Epic (pas de Feature parente dans le lot). */
  stories: StoryNode[];
  range: [number, number] | null;
  /** Voir `statusBucket`. */
  bucket: number;
}

/** Toutes les US d'un nœud : celles des features + celles rattachées à l'epic. */
const nodeStories = (n: TreeNode): Item[] => [...n.stories.map((st) => st.item), ...n.features.flatMap((f) => f.stories.map((st) => st.item))];

const nodeName = (n: TreeNode) => (n.epic ? n.epic.title : "(Sans epic)");
const nodeEffort = (n: TreeNode) => nodeStories(n).reduce((s, it) => s + effortOf(it), 0);

/**
 * Tri sur un champ ADO custom de l'Epic : nombres décroissants (comme l'effort),
 * textes alphabétiques, valeurs absentes en dernier.
 */
function cmpCustom(a: TreeNode, b: TreeNode, ref: string): number {
  const va = a.epic?.custom?.[ref], vb = b.epic?.custom?.[ref];
  const ea = va == null || va === "", eb = vb == null || vb === "";
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;
  if (typeof va === "number" && typeof vb === "number") return vb - va;
  return String(va).localeCompare(String(vb), "fr");
}

/**
 * Statut d'un parent (epic/feature) — sert au tri, au filtre et au tag.
 * 0 = en cours, 1 = semi-actif, 2 = à venir, 3 = terminé, 4 = sans date.
 *
 * « Semi-actif » : l'intervalle du parent ne couvre pas le sprint courant, mais
 * des US lui restent planifiées sur le sprint courant ou un sprint à venir. Le
 * travail est donc réel, l'intervalle est simplement décalé — trié juste après
 * les epics en cours, plutôt que noyé dans les « terminés ».
 */
export function statusBucket(range: [number, number] | null, us: Item[] = []): number {
  if (!range) return 4;
  const [s0, e0] = range;
  if (s0 <= CURRENT && e0 >= CURRENT) return 0;
  // Le backlog (iter >= NITER) n'est pas un sprint : il ne rend pas actif.
  if (us.some((it) => it.iter >= CURRENT && it.iter < NITER && (it.iter < s0 || it.iter > e0))) return 1;
  return s0 > CURRENT ? 2 : 3;
}

/** Intervalle d'un Epic : ses dates Start/Target sinon dérivé des US descendantes. */
function epicRange(epic: Item | null, us: Item[]): [number, number] | null {
  if (epic && epic.hasDateRange && epic.startISO && epic.endISO) {
    const a = sprintIndexForDate(epic.startISO, "start");
    const b = sprintIndexForDate(epic.endISO, "end");
    if (a != null && b != null) return [Math.min(a, b), Math.max(a, b)];
  }
  return derivedRange(us);
}

export function buildTree(s: State): TreeNode[] {
  const epicItems = s.items.filter((i) => i.level === "epic");
  const feats = s.items.filter((i) => i.level === "feature");
  const featIds = new Set(feats.map((f) => f.id));
  const epicIds = new Set(epicItems.map((e) => e.id));
  const storyNode = (st: Item): StoryNode => ({ item: st, tasks: s.items.filter((t) => t.level === "task" && t.parent === st.id).map((t) => ({ item: t })) });
  const featNode = (f: Item): FeatureNode => ({
    item: f,
    stories: s.items.filter((st) => st.level === "story" && st.parent === f.id).map(storyNode),
  });
  // US sans Feature parente dans le lot (rattachée directement à l'Epic, ou
  // Feature hors périmètre du sync) : rattachée au nœud de son Epic. Sinon elle
  // serait invisible dans l'arbre tout en comptant dans la charge des colonnes.
  const loose = new Map<string, StoryNode[]>();
  s.items.forEach((it) => {
    if (it.level !== "story" || (it.parent && featIds.has(it.parent))) return;
    const key = epicIds.has(epicOf(it)) ? epicOf(it) : "__none__";
    if (!loose.has(key)) loose.set(key, []);
    loose.get(key)!.push(storyNode(it));
  });
  const mk = (epic: Item | null, features: FeatureNode[], stories: StoryNode[]): TreeNode => {
    const node: TreeNode = { epicId: epic ? epic.id : null, epic, features, stories, range: null, bucket: 4 };
    const us = nodeStories(node);
    node.range = epicRange(epic, us);
    node.bucket = statusBucket(node.range, us);
    return node;
  };
  const nodes: TreeNode[] = epicItems.map((epic) => mk(epic, feats.filter((f) => f.epicId === epic.id).map(featNode), loose.get(epic.id) ?? []));
  const orphan = feats.filter((f) => !f.epicId || !epicItems.some((e) => e.id === f.epicId));
  const looseNone = loose.get("__none__") ?? [];
  if (orphan.length || looseNone.length) nodes.push(mk(null, orphan.map(featNode), looseNone));

  const filtered = nodes.filter((n) => {
    if (s.epicFilter === "hideDone") return n.bucket !== 3;
    // Masque terminés ET pas démarrés ; garde les semi-actifs (US sur le sprint
    // courant ou à venir, donc du travail réel malgré l'intervalle décalé).
    if (s.epicFilter === "activeOnly") return n.bucket <= 1;
    return true;
  });
  // Ordre : statut (en cours > à venir > terminé), puis priorité (ou nom).
  const cmp = (a: TreeNode, b: TreeNode) => {
    if (s.epicSort === "name") return nodeName(a).localeCompare(nodeName(b), "fr");
    if (s.epicSort === "effort") return nodeEffort(b) - nodeEffort(a) || nodeName(a).localeCompare(nodeName(b), "fr");
    if (s.epicSort !== "priority") return cmpCustom(a, b, s.epicSort) || nodeName(a).localeCompare(nodeName(b), "fr");
    const pa = a.epic?.priority ?? 999, pb = b.epic?.priority ?? 999;
    if (pa !== pb) return pa - pb;
    return (a.range?.[0] ?? 99) - (b.range?.[0] ?? 99) || nodeName(a).localeCompare(nodeName(b), "fr");
  };
  const dir = s.epicSortDir === "desc" ? -1 : 1;
  filtered.sort((a, b) => (a.bucket !== b.bucket ? a.bucket - b.bucket : dir * cmp(a, b)));
  return filtered;
}

export function parentCharge(s: State, usList: Item[]) {
  const per: Record<number, number> = {};
  let max = 0, minIter = 99, maxIter = -1, total = 0, unplanned = 0;
  usList.forEach((sx) => {
    if (s.hideClosed && isDone(sx.state)) return;
    if (s.hidden[sx.person]) return;
    per[sx.iter] = (per[sx.iter] || 0) + effortOf(sx);
    total += effortOf(sx);
    if (sx.iter < NITER) {
      if (sx.iter < minIter) minIter = sx.iter;
      if (sx.iter > maxIter) maxIter = sx.iter;
    } else unplanned++; // sans itération : hors grille Release, à signaler
  });
  Object.values(per).forEach((v) => {
    if (v > max) max = v;
  });
  const startISO = minIter <= maxIter ? iters[minIter].iso[0] : "";
  const endISO = minIter <= maxIter ? iters[maxIter].iso[1] : "";
  return { per, max, total, minIter, maxIter, startISO, endISO, unplanned };
}

function personLoad(s: State): Record<string, number> {
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
function personGap(s: State): Record<string, number> {
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
function sortedPeople(s: State, list: Person[]): Person[] {
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
  // « Non assigné » toujours en dernier, quel que soit le tri.
  return [...a.filter((p) => !p.unassigned), ...a.filter((p) => p.unassigned)];
}

// ---- layout ----
interface LayoutRow {
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
interface LayoutBar {
  item: Item;
  left: number;
  top: number;
  width: number;
  height: number;
}
interface LayoutCard {
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
interface Layout {
  rows: LayoutRow[];
  bars: LayoutBar[];
  cards?: LayoutCard[];
  totalHeight: number;
  cols?: number[];
}

function releaseLayout(s: State, COLW: number): Layout {
  const cols = relCols(), rows: LayoutRow[] = [], cards: LayoutCard[] = [];
  let y = HEADER;
  const tree = buildTree(s);
  // Colonne réelle de l'itération d'un item. Pas de clamp à l'intervalle du
  // parent : une US hors dates de son Epic doit rester visible à sa vraie
  // itération, pas être repoussée sur la borne de l'Epic. -1 = hors grille
  // (US sans itération → comptée dans « sans itération » sur la ligne parente).
  const colOf = (iter: number) => cols.indexOf(iter);
  // Bande de cartes d'un parent déplié : une colonne par sprint, US puis tâches.
  const pushBand = (key: string, stories: StoryNode[], indentUS: number) => {
    const bandTop = y, colY = cols.map(() => bandTop + BPAD);
    stories.forEach((st) => {
      const ci = colOf(st.item.iter);
      if (ci < 0) return;
      const sopen = isOpen(s, st.item.id);
      const sw = COLW - 2 * indentUS, sh = cardHeight(st.item.title, sw - 31, CUS, 2);
      cards.push({ item: st.item, level: "story", ci, left: LEFT + ci * COLW + indentUS, top: colY[ci], width: sw, height: sh, hasChildren: st.tasks.length > 0, open: sopen });
      colY[ci] += sh + CGAP;
      if (sopen)
        st.tasks.forEach((t) => {
          const tci = colOf(t.item.iter);
          if (tci < 0) return;
          const tw = sw - 14, th = cardHeight(t.item.title, tw - 29, CTASK, 1);
          cards.push({ item: t.item, level: "task", ci: tci, left: LEFT + tci * COLW + indentUS + 14, top: colY[tci], width: tw, height: th });
          colY[tci] += th + CGAP;
        });
    });
    const bandH = Math.max(...colY) - bandTop + BPAD;
    rows.push({ kind: "band", depth: 0, key, top: bandTop, height: bandH });
    y += bandH;
  };
  tree.forEach((node) => {
    const ekey = "epic:" + (node.epicId ?? "__none__"), eopen = isOpen(s, ekey);
    const epicUS = nodeStories(node);
    const eColor = (node.epic ? epics[node.epic.id]?.color : null) || "#64748b";
    const hasChildren = node.features.length > 0 || node.stories.length > 0;
    // Le nom occupe la colonne de gauche : la ligne s'agrandit s'il dépasse
    // 2 lignes (67/83 = indentation + chevron + pastille + paddings).
    const eh = cardHeight(nodeName(node), LEFT - 67, RELPARENT, 2);
    rows.push({ kind: "epic", depth: 0, key: ekey, item: node.epic ?? undefined, epicName: nodeName(node), hasChildren, open: eopen, count: node.features.length, us: epicUS, accent: eColor, range: node.range, top: y, height: eh });
    y += eh;
    if (!eopen) return;
    // US rattachées directement à l'Epic : bande de cartes sous la ligne epic.
    if (node.stories.length) pushBand(ekey + ":band", node.stories, 8);
    node.features.forEach((f) => {
      const fopen = isOpen(s, f.item.id);
      const fUS = f.stories.map((st) => st.item);
      const ep = epics[epicOf(f.item)] || ({} as { color?: string; short?: string });
      // Intervalle propre de la feature. Le borner à celui de l'epic donnait un
      // intervalle vide (donc aucune barre) dès que la feature sortait des dates
      // de l'epic : l'écart est justement l'information à voir.
      const fr = featRange(s, f.item);
      const fh = cardHeight(f.item.ado + "  " + f.item.title, LEFT - 83, RELPARENT, 2);
      rows.push({ kind: "feature", depth: 1, key: f.item.id, item: f.item, hasChildren: f.stories.length > 0, open: fopen, us: fUS, accent: ep.color || "#0072B2", epicShort: ep.short || "", range: fr, top: y, height: fh });
      y += fh;
      if (!fopen) return;
      pushBand(f.item.id + ":band", f.stories, 8);
    });
  });
  return { rows, bars: [], cards, totalHeight: Math.max(y + 20, 520) };
}

// Retour à la ligne glouton (mot par mot) : compter title.length / perLine
// sous-estime, le navigateur casse aux espaces et laisse des fins de ligne
// vides — d'où des cartes trop courtes dont le pied (epic/area) débordait.
// Un mot plus long que la ligne est coupé par overflow-wrap:anywhere.
export function wrappedLines(title: string, perLine: number): number {
  let lines = 1, used = 0;
  for (const w of title.split(/\s+/).filter(Boolean)) {
    if (used && used + 1 + w.length <= perLine) { used += 1 + w.length; continue; }
    if (used) lines++;
    const extra = Math.ceil(w.length / perLine) - 1;
    lines += extra;
    used = w.length - extra * perLine;
  }
  return lines;
}

/** Hauteur d'une carte Release : le titre s'affiche en entier, `baseLines`
 * lignes tiennent déjà dans `base`, chaque ligne en plus rallonge la carte.
 * `textW` = largeur utile du titre (carte moins paddings et pastille d'état).
 * ponytail: largeur de caractère estimée (~6.1px à 12px), pas de mesure DOM. */
function cardHeight(title: string, textW: number, base: number, baseLines: number): number {
  const lines = wrappedLines(title, Math.max(8, Math.floor(textW / 6.1)));
  return base + Math.max(0, lines - baseLines) * CARDLH;
}

/**
 * Colonnes visibles portant de la charge hors de l'intervalle d'un parent
 * (epic/feature) : ces US sont planifiées ailleurs que sur sa barre, donc
 * invisibles sur sa ligne. Le board les marque en pointillé.
 */
export function outsideCharge(per: Record<number, number>, cols: number[], range: [number, number]) {
  return cols
    .map((real, vi) => ({ real, vi, val: per[real] || 0 }))
    .filter((c) => c.val > 0 && (c.real < range[0] || c.real > range[1]));
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
    const spanOf = (it: Item, ci: number) => (daily ? 1 : Math.max(1, Math.min(it.span || 1, cols.length - ci)));
    // Titre affiché en entier : la hauteur des cartes de la ligne suit le titre
    // le plus long. ponytail: largeur de caractère estimée (~6.6px à 13px),
    // pas de mesure DOM — à remplacer si des titres débordent visiblement.
    let titleLines = TITLELINES;
    perCol.forEach((arr, ci) =>
      arr.forEach((it) => {
        const perLine = Math.max(8, Math.floor((spanOf(it, ci) * COLW - CARDTEXTPAD) / 6.6));
        titleLines = Math.max(titleLines, wrappedLines(it.title, perLine));
      }),
    );
    const barH = BARH + (titleLines - TITLELINES) * TITLELH;
    const rowH = TOPPAD + TOPB + GAPB + lanes * barH + (lanes - 1) * LANEGAP + BOTPAD;
    rows.push({ personId: p.id, top: y, height: rowH, lanes });
    perCol.forEach((arr, ci) =>
      arr.forEach((it, idx) => {
        bars.push({ item: it, left: LEFT + ci * COLW + 10, top: y + TOPPAD + TOPB + GAPB + idx * (barH + LANEGAP), width: spanOf(it, ci) * COLW - 20, height: barH });
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
  const featHidden = new Set<string>(), featIds = new Set<string>();
  s.items.forEach((f) => {
    if (f.level !== "feature") return;
    featIds.add(f.id);
    const epicKey = "epic:" + (f.epicId && epicIds.has(f.epicId) ? f.epicId : "__none__");
    if (s.hiddenRows[f.id] || s.hiddenRows[epicKey]) featHidden.add(f.id);
  });
  s.items.forEach((it) => {
    if (it.level !== "story") return;
    // Même rattachement que buildTree : sous sa Feature, sinon sous son Epic.
    if (it.parent && featIds.has(it.parent)) {
      if (featHidden.has(it.parent)) out.add(it.id);
    } else if (s.hiddenRows["epic:" + (epicIds.has(epicOf(it)) ? epicOf(it) : "__none__")]) out.add(it.id);
  });
  return out;
}

/**
 * US couvertes par les lignes affichées du Release planning (arbre filtré par
 * « Filtre epics »). Base commune de la bande de charge et des métriques : la
 * somme d'une colonne égale ainsi la somme des barres d'epic de cette colonne.
 */
export const releaseStories = (s: State): Item[] => buildTree(s).flatMap(nodeStories);

/**
 * Personnes ayant un ticket sur un sprint daté récent (≥ CURRENT−3) ou à venir.
 * Les autres sont "inactives" (section repliée du filtre Personnes).
 * ponytail: le backlog (iter ≥ NITER) ne compte pas comme activité — pas de sprint daté.
 */
export const activePersonIds = (items: Item[]) =>
  new Set(items.filter((i) => i.iter >= CURRENT - 3 && i.iter < NITER).map((i) => i.person));

/** Capacité totale d'un sprint (personnes visibles, hors "Non assigné"). */
const sprintCap = (s: State, real: number) =>
  people.filter((p) => !s.hidden[p.id] && !p.unassigned).reduce((sum, p) => sum + capOf(p, real), 0);

/**
 * Effort des US comptées dans la charge (mêmes exclusions que la bande de
 * charge Release : terminés si masqués, personnes masquées, lignes masquées),
 * restreint aux itérations [from, to].
 */
export function countedEffort(s: State, us: Item[], from: number, to: number, hiddenSt: Set<string>): number {
  let t = 0;
  us.forEach((it) => {
    if (it.level !== "story") return;
    if (s.hideClosed && isDone(it.state)) return;
    if (it.iter < from || it.iter > to) return;
    if (s.hidden[it.person] || hiddenSt.has(it.id)) return;
    t += effortOf(it);
  });
  return t;
}

/** Métriques macro Release : Σ capacité vs Σ effort sur [metricsFrom, metricsTo]. */
export function releaseMetrics(s: State) {
  const from = Math.min(s.metricsFrom, s.metricsTo), to = Math.max(s.metricsFrom, s.metricsTo);
  let cap = 0;
  for (let i = from; i <= to; i++) cap += sprintCap(s, i);
  const effort = countedEffort(s, releaseStories(s), from, to, hiddenStoryIds(s));
  return { from, to, cap, effort, delta: cap - effort };
}

export function relLoadBand(s: State, cols: number[], theme: Theme) {
  const by = s.loadBy;
  const hiddenSt = hiddenStoryIds(s);
  const stories = releaseStories(s);
  return cols.map((real) => {
    const cap = sprintCap(s, real);
    const groups: Record<string, number> = {};
    let total = 0;
    stories.forEach((it) => {
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

/** Clés présentes dans la bande de charge, triées par effort décroissant.
 * La bande est un empilement : sans légende, chaque segment n'est identifié
 * que par sa couleur (et un title, invisible au clavier et au tactile).
 * Une seule légende pour toutes les colonnes. */
export function loadBandLegend(s: State, cols: number[], theme: Theme) {
  if (s.loadBy === "none") return [];
  const tot = new Map<string, { key: string; label: string; color: string; val: number }>();
  relLoadBand(s, cols, theme).forEach((b) =>
    b.segs.forEach((sg) => {
      const cur = tot.get(sg.key);
      if (cur) cur.val += sg.val;
      else tot.set(sg.key, { key: sg.key, label: sg.label, color: sg.color, val: sg.val });
    }),
  );
  return [...tot.values()].sort((a, b) => b.val - a.val);
}
