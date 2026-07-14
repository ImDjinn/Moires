import type { Capacity, MemberMeta, SessionSnapshot } from "@moirai/shared";
import type { Dataset, Item, Iter, Level, Person } from "./ganttModel";
import { MONTHS_FR, stateProgress } from "./ganttModel";

const PEOPLE_PALETTE = ["#6366f1", "#14b8a6", "#f97316", "#ec4899", "#0ea5e9", "#8b5cf6", "#22c55e", "#ef4444", "#eab308", "#06b6d4"];
const EPIC_PALETTE = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#8b5cf6"];
export const UNASSIGNED_ID = "__unassigned__";

/** Initiales (2 max) d'un nom, pour les avatars. "?" si vide. */
export const initials = (name: string): string =>
  name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

function shortIter(name: string): string {
  const m = name.match(/(\d+)\s*$/);
  return m ? "It." + m[1] : name.length > 10 ? name.slice(0, 9) + "…" : name;
}

function fmtDay(iso: string): string {
  const [, m, dd] = iso.slice(0, 10).split("-").map(Number);
  return `${dd} ${MONTHS_FR[m - 1]}`;
}
function fmtRange(a: string, b: string): string {
  return a && b ? `${fmtDay(a)} – ${fmtDay(b)}` : "";
}

/** Type de work item ADO → niveau de granularité du board. */
function levelFor(wit: string): Level {
  if (wit === "Epic") return "epic";
  if (wit === "Feature") return "feature";
  if (wit === "Task") return "task";
  return "story"; // User Story, Bug, Product Backlog Item, Issue…
}
/** Type de work item ADO → jeton de type (couleur/badge). */
function typeFor(wit: string): string {
  if (wit === "Epic") return "epic";
  if (wit === "Feature") return "feature";
  if (wit === "Task") return "task";
  if (wit === "Bug") return "bug";
  return "story";
}

/**
 * Transforme un SessionSnapshot ADO réel en Dataset consommable par GanttBoard
 * (mêmes structures que les données mock du prototype). Pur et testable.
 */
export function buildDataset(
  snapshot: SessionSnapshot,
  capacities: Capacity[] = snapshot.capacities,
  memberMeta: MemberMeta[] = snapshot.memberMeta ?? [],
): Dataset {
  const src = snapshot.iterations;
  const niter = src.length;

  const iters: Iter[] = src.map((it) => ({
    label: it.name,
    short: shortIter(it.name),
    dates: fmtRange(it.startDate, it.finishDate),
    sub: "",
    iso: [it.startDate.slice(0, 10), it.finishDate.slice(0, 10)] as [string, string],
    path: it.path,
  }));
  iters.push({ label: "Backlog", short: "Backlog", dates: "Non planifié", sub: "à prioriser", iso: ["", ""] });

  const pathToIndex = new Map(src.map((it, i) => [it.path, i]));

  const today = new Date().toISOString().slice(0, 10);
  const foundCurrent = src.findIndex((it) => it.startDate.slice(0, 10) <= today && today <= it.finishDate.slice(0, 10));
  const current = foundCurrent >= 0 ? foundCurrent : 0;

  const memberIds = new Set(snapshot.teamMembers.map((m) => m.id));
  // Capacité par membre × itération (défaut 10 si non renseignée).
  const capFor = (memberId: string): number[] =>
    src.map((it) => capacities.find((c) => c.memberId === memberId && c.iterationPath === it.path)?.storyPoints ?? 10);
  const metaById = new Map(memberMeta.map((m) => [m.memberId, m]));
  const people: Person[] = snapshot.teamMembers.map((m, i) => ({
    id: m.id,
    name: m.displayName,
    role: metaById.get(m.id)?.poste ?? "", // "poste" = champ de couleur/regroupement
    teamRole: metaById.get(m.id)?.role ?? "",
    initials: initials(m.displayName),
    color: PEOPLE_PALETTE[i % PEOPLE_PALETTE.length],
    cap: capFor(m.id),
  }));

  // Epics : couleur/libellé. Titre autoritatif depuis le work item Epic lui-même,
  // sinon depuis epicTitle porté par les enfants.
  const epics: Record<string, { label: string; short: string; color: string }> = {};
  let epicIdx = 0;
  const registerEpic = (id: string, label: string) => {
    if (!epics[id]) epics[id] = { label, short: label.length > 16 ? label.slice(0, 15) + "…" : label, color: EPIC_PALETTE[epicIdx++ % EPIC_PALETTE.length] };
    else if (label && epics[id].label !== label) epics[id].label = label; // titre autoritatif
  };
  for (const t of snapshot.tickets) if (t.workItemType === "Epic") registerEpic(t.id, t.title);
  for (const t of snapshot.tickets) if (t.epicId) registerEpic(t.epicId, t.epicTitle || t.epicId);

  const areaSet = new Set<string>();
  let hasUnassigned = false;

  const items: Item[] = snapshot.tickets.map((t) => {
    if (t.areaPath) areaSet.add(t.areaPath);
    let person = t.assigneeId && memberIds.has(t.assigneeId) ? t.assigneeId : UNASSIGNED_ID;
    if (person === UNASSIGNED_ID) hasUnassigned = true;
    const iter = pathToIndex.has(t.iterationId) ? pathToIndex.get(t.iterationId)! : niter;
    const iso = iters[iter].iso;
    // Placement Daily : colonne de board ADO si dispo (les colonnes ≠ états),
    // sinon l'état brut (Task, ou board sans System.BoardColumn).
    const state = t.boardColumn || t.state || "New";
    const level = levelFor(t.workItemType);
    // Epic/Feature : intervalle réel Start Date → Target Date.
    const hasDateRange = (level === "epic" || level === "feature") && !!t.startDate && !!t.targetDate;
    return {
      id: t.id,
      ado: `#${t.id}`,
      level,
      type: typeFor(t.workItemType),
      title: t.title,
      points: t.storyPoints,
      effortDays: t.estimateHours,
      person,
      iter,
      span: 1,
      state,
      progress: stateProgress(state),
      parent: t.parentId,
      tags: t.tags,
      startISO: hasDateRange ? t.startDate.slice(0, 10) : iso[0],
      endISO: hasDateRange ? t.targetDate!.slice(0, 10) : iso[1],
      area: t.areaPath,
      epicId: t.epicId,
      hasDateRange,
      priority: t.priority,
      custom: t.customFields,
      wit: t.workItemType,
    };
  });

  if (hasUnassigned) {
    people.push({ id: UNASSIGNED_ID, name: "Non assigné", role: "", initials: "?", color: "#94a3b8", cap: new Array(niter).fill(10), unassigned: true });
  }

  const storyToFeature: Record<string, string> = {};
  const titleOf: Record<string, string> = {};
  for (const t of snapshot.tickets) titleOf[t.id] = t.title;
  for (const it of items) if (it.level === "story" && it.parent) storyToFeature[it.id] = it.parent;

  // États Daily : réels (ordonnés) si fournis par ADO, sinon défaut.
  const dailyStates = snapshot.states?.length ? [...new Set(snapshot.states.map((s) => s.name))] : ["New", "Active", "Resolved", "Closed"];
  // États par niveau : chaque type de work item (Epic/Feature/US/Tâche) a ses
  // propres colonnes, ordonnées comme dans le board ADO.
  const dailyStatesByLevel: Record<Level, string[]> = { epic: [], feature: [], story: [], task: [] };
  (snapshot.states || []).forEach((s) => {
    const lvl = s.type ? levelFor(s.type) : "story";
    if (!dailyStatesByLevel[lvl].includes(s.name)) dailyStatesByLevel[lvl].push(s.name);
  });
  const stateColors: Record<string, string> = {};
  const stateCat: Record<string, string> = {};
  (snapshot.states || []).forEach((s) => {
    stateColors[s.name] = s.color;
    stateCat[s.name] = s.category;
  });
  // Colonne de board → état ADO réel à écrire au drop (stateMappings du board).
  // ponytail: premier type gagne si US et Bug mappent la colonne différemment.
  const stateWrite: Record<Level, Record<string, string>> = { epic: {}, feature: {}, story: {}, task: {} };
  // Inverse : état ADO → colonne de board. Le placement Daily suit l'état (qu'on
  // met à jour partout, y compris en optimiste) plutôt que System.BoardColumn,
  // recalculé par ADO et donc en retard après un déplacement.
  const stateToColumn: Record<Level, Record<string, string>> = { epic: {}, feature: {}, story: {}, task: {} };
  (snapshot.states || []).forEach((s) => {
    if (!s.state) return;
    const lvl = s.type ? levelFor(s.type) : "story";
    if (!stateWrite[lvl][s.name]) stateWrite[lvl][s.name] = s.state;
    if (!stateToColumn[lvl][s.state]) stateToColumn[lvl][s.state] = s.name;
  });

  return {
    people,
    iters,
    epics,
    areaOptions: areaSet.size ? [...areaSet].sort() : ["(aucun area path)"],
    current,
    niter,
    items,
    storyToFeature,
    titleOf,
    dailyStates,
    dailyStatesByLevel,
    stateColors,
    stateCat,
    stateWrite,
    stateToColumn,
  };
}
