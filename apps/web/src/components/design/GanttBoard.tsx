import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "./css";
import { useThemeStore } from "../../stores/theme.store";
import { useSessionStore } from "../../stores/session.store";
import { useAuthStore } from "../../stores/auth.store";
import { useTicketsStore } from "../../stores/tickets.store";
import { useCapacitiesStore } from "../../stores/capacities.store";
import { useMemberMetaStore } from "../../stores/memberMeta.store";
import { usePresenceStore } from "../../stores/presence.store";
import { connectSocket, submitOperation, setRejectionHandler, disconnectSocket } from "../../services/operations.client";
import { initPresenceListeners, trackAway } from "../../services/presence.client";
import { api } from "../../services/rest.client";
import { buildDataset, UNASSIGNED_ID, initials } from "./adapter";
import { Brand } from "../Brand";
import { IconEye, IconEyeOff, IconGear, IconCopy, IconSwap, IconLogout, IconUsers, IconCalendar, IconGrid, IconMilestone, IconFlag, IconClose, IconAlert, IconNear } from "./icons";
import { MyBoard, resolveMyPersonId, isMyReview } from "./MyBoard";
import * as M from "./ganttModel";
import type { Drag, Item, Presence, State, Theme } from "./ganttModel";
import type { OperationField, TicketComment } from "@moires/shared";
import { t, useLang, LangToggle } from "../../i18n";

const C = css;
/** Repère de charge : alerte au-delà de 100 %, avertissement dans la zone
 * 85-100 %. Ce palier n'était signalé que par la couleur ambre, donc invisible
 * en deutéranopie : une couleur de statut doit toujours porter une icône. */
function LoadMark({ mark }: { mark: 0 | 1 | 2 }) {
  if (!mark) return null;
  const label = mark === 2 ? t("Surcharge") : t("Proche de la capacité");
  return (
    <span role="img" aria-label={label} title={label} style={C("display:inline-flex;vertical-align:-1px;margin-right:3px")}>
      {mark === 2 ? <IconAlert size={11} /> : <IconNear size={11} />}
    </span>
  );
}
const mono = "'IBM Plex Mono',monospace";
const sans = "'IBM Plex Sans',system-ui,sans-serif";
// Libellé de la touche modificateur selon la plateforme (⌘ sur macOS, Ctrl ailleurs).
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || "");
const modLabel = isMac ? "⌘" : "Ctrl";
// Les curseurs simulés (mock) bougent en continu : coupés si l'utilisateur
// demande moins d'animations (et pour les captures d'écran).
const reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Préférences d'affichage (champs du panneau ticket par type, champ de charge) — localStorage.
const PREFS_KEY = "moires.uiPrefs";
/** Prefs d'un type de work item : visibilité des champs standard + champs ADO ajoutés.
 * `def` : valeur par défaut du process, affichée tant que le ticket n'a pas de valeur stockée.
 * `required`/`allowed` : contraintes du process ADO (champ requis, picklist). */
interface TypePrefs {
  fields: Record<string, boolean>;
  extra: { ref: string; label: string; def?: string | number | boolean | null; required?: boolean; allowed?: string[] }[];
}
interface UiPrefs {
  v?: 2;
  types: Record<string, TypePrefs>;
  loadField: M.LoadField;
  /** Champ ADO portant le relecteur (vue @me). "" = détection automatique. */
  reviewField: string;
}
// Champs de base par type ADO (process Agile), comme le formulaire ADO :
// Story Points sur les US/Bugs, Estimation (Original Estimate) sur les Tasks,
// Effort sur Epic/Feature (champ ADO réel, servi via le mécanisme des champs supplémentaires).
const witKind = (wit: string): "parent" | "task" | "story" =>
  /epic|feature/i.test(wit) ? "parent" : /task|tâche/i.test(wit) ? "task" : "story";
function defaultTypePrefs(wit: string): TypePrefs {
  const k = witKind(wit);
  return {
    fields: { state: true, assignee: true, iter: true, area: true, points: k === "story", effort: k === "task", priority: true, dates: k === "parent" },
    extra: k === "parent" ? [{ ref: "Microsoft.VSTS.Scheduling.Effort", label: "Effort" }] : [],
  };
}
function typePrefsOf(prefs: UiPrefs, wit: string): TypePrefs {
  const d = defaultTypePrefs(wit);
  const t = prefs.types[wit];
  return { fields: { ...d.fields, ...(t?.fields || {}) }, extra: t?.extra ?? d.extra };
}
function loadPrefs(): UiPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    // Migration : l'ancien mode "auto" n'existe plus (champ ADO réel exigé).
    const lf = saved.loadField && saved.loadField !== "auto" ? saved.loadField : "points";
    // v2 : défauts par type ADO (Effort sur Epic/Feature) — prefs v1 réinitialisées.
    return {
      v: 2, types: saved.v === 2 ? saved.types || {} : {}, loadField: lf,
      reviewField: typeof saved.reviewField === "string" ? saved.reviewField : "",
    };
  } catch {
    return { v: 2, types: {}, loadField: "points", reviewField: "" };
  }
}
// Personnes masquées du board (sélection des utilisateurs) — persistée entre sessions.
// ponytail: clé globale unique ; les ids personne étant uniques par membre, pas de collision inter-projets.
const HIDDEN_KEY = "moires.hiddenPeople";
function loadHidden(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function saveHidden(hidden: Record<string, boolean>) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)); } catch { /* stockage indisponible */ }
}

// Board affiché — restauré au rafraîchissement de la page.
const BOARD_KEY = "moires.board";
const BOARDS: State["board"][] = ["me", "daily", "sprint", "release"];
function loadBoard(): Pick<State, "board"> | undefined {
  try {
    const b = localStorage.getItem(BOARD_KEY) as State["board"] | null;
    return b && BOARDS.includes(b) ? { board: b } : undefined;
  } catch {
    return undefined;
  }
}

/** Clé des prefs du panneau : type ADO réel, sinon libellé du type mock. */
const witOf = (it: Item) => it.wit || M.typeLabels[it.type] || it.type;
const inspFieldDefs: { key: string; label: string; kinds?: string[] }[] = [
  { key: "state", label: "État" },
  { key: "assignee", label: "Assigné à" },
  { key: "iter", label: "Itération" },
  { key: "area", label: "Area Path" },
  { key: "points", label: "Story Points", kinds: ["story"] },
  { key: "effort", label: "Estimation", kinds: ["task"] },
  { key: "priority", label: "Priorité" },
  { key: "dates", label: "Dates (début → fin)" },
];

// Tag de statut d'une ligne epic/feature — indexé par M.statusBucket
// ([libellé, couleur de base]). Base null = tag neutre (tokens de thème).
// Bucket 4 (sans date) : pas de tag. Les couleurs étaient figées en dur et
// identiques dans les deux thèmes : l'ambre tombait à 2,11:1 en clair et le
// bleu à 3,48:1 en sombre. On passe par M.tone, qui décline par thème.
// Pastilles de couleur des jalons/flags : un nom par teinte, sinon le bouton
// n'annonce rien d'autre que « bouton » au lecteur d'écran.
const ANNOT_COLORS: Record<string, string> = {
  "#E69F00": "Ambre", "#D55E00": "Orange", "#0072B2": "Bleu", "#009E73": "Vert", "#CC79A7": "Rose",
};

const STATUS_TAGS: [string, string | null][] = [
  ["en cours", "#0072B2"],
  ["semi-actif", "#E69F00"],
  ["à venir", null],
  ["terminé", "#009E73"],
];

// Tri des personnes : axe (select) + sens (bouton), comme le tri des epics en
// Release. state.sort reste une valeur unique côté modèle (az/za/loadAsc/…).
const SORT_AXES = [
  { value: "name", label: "Nom", asc: "az", desc: "za" },
  { value: "load", label: "Charge", asc: "loadAsc", desc: "loadDesc" },
  { value: "gap", label: "Écart charge/capa", asc: "gapAsc", desc: "gapDesc" },
  { value: "random", label: "Aléatoire", asc: "random", desc: "random" },
];

// Axe et sens du tri (personnes et epics) — persistés entre les sessions.
export const SORT_KEY = "moires.sort";
export function loadSort(): Partial<State> | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_KEY) || "null");
    if (!v || typeof v !== "object") return undefined;
    const out: Partial<State> = {};
    if (SORT_AXES.some((a) => a.asc === v.sort || a.desc === v.sort)) out.sort = v.sort;
    if (typeof v.epicSort === "string") out.epicSort = v.epicSort;
    if (v.epicSortDir === "asc" || v.epicSortDir === "desc") out.epicSortDir = v.epicSortDir;
    return out;
  } catch {
    return undefined;
  }
}

interface ScriptAction {
  id: string;
  by: Presence;
  apply: (it: Item) => void;
  msg: string;
}

export function GanttBoard() {
  const lang = useLang();
  const theme = useThemeStore((s) => s.theme) as Theme;
  const toggleTheme = useThemeStore((s) => s.toggle);

  // Données réelles (ADO) si une session est chargée avec des tickets, sinon mock.
  const snapshot = useSessionStore((s) => s.snapshot);
  const capacities = useCapacitiesStore((s) => s.capacities);
  const memberMeta = useMemberMetaStore((s) => s.memberMeta);
  // `lang` en dépendance : le dataset porte des libellés traduits (« Non
  // assigné », « Non planifié ») qui doivent suivre le changement de langue.
  const dataset = useMemo(
    () => (snapshot && snapshot.tickets.length ? buildDataset(snapshot, capacities, memberMeta) : null),
    [snapshot, capacities, memberMeta, lang],
  );
  if (dataset) M.applyDataset(dataset);

  const user = useAuthStore((s) => s.user);
  // Écritures ADO encore en vol. Le bandeau « ADO sync. » suivait un minuteur
  // cosmétique d'une seconde : un ticket pouvait afficher « Synchronisé » alors
  // que son write-back échouerait ensuite. On suit le statut réel des tickets.
  const pendingWrites = useTicketsStore((s) => s.tickets.some((t) => t.syncStatus === "pending"));
  const realSession = !!dataset && !!snapshot && !!user;
  const realSessionRef = useRef(realSession);
  realSessionRef.current = realSession;
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = snapshot?.sessionId ?? null;
  // Présence temps réel (pairs), hors soi-même.
  const allPeers = usePresenceStore((s) => s.peers);
  const peers = realSession ? allPeers.filter((p) => p.userId !== user!.id) : [];
  const myColor = useMemo(() => M.hashColor(user?.id || "me", "light"), [user]);
  // Personne du board correspondant au compte connecté (vue @me).
  const myPersonId = user ? resolveMyPersonId(user, M.people) : null;

  const [state, setSt] = useState<State>(() => ({ ...M.createInitialState(dataset ? dataset.items : undefined), hidden: loadHidden(), ...loadBoard(), ...loadSort() }));
  const stateRef = useRef(state);
  stateRef.current = state;
  // Persiste la sélection des utilisateurs (personnes masquées) entre les sessions.
  useEffect(() => { saveHidden(state.hidden); }, [state.hidden]);
  // Persiste le board affiché : le rafraîchissement revient sur le même onglet.
  useEffect(() => {
    try { localStorage.setItem(BOARD_KEY, state.board); } catch { /* stockage indisponible */ }
  }, [state.board]);
  // Persiste l'axe et le sens du tri (personnes et epics).
  useEffect(() => {
    const v = { sort: state.sort, epicSort: state.epicSort, epicSortDir: state.epicSortDir };
    try { localStorage.setItem(SORT_KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ }
  }, [state.sort, state.epicSort, state.epicSortDir]);
  // Inactifs masqués par défaut, une seule fois : un id déjà présent dans `hidden`
  // (true ou false) est un choix explicite de l'utilisateur, jamais réécrit.
  useEffect(() => {
    const active = M.activePersonIds(stateRef.current.items);
    setState((s) => {
      const h = { ...s.hidden };
      let changed = false;
      M.people.forEach((p) => {
        if (!(p.id in h) && !active.has(p.id)) { h[p.id] = true; changed = true; }
      });
      return changed ? { hidden: h } : {};
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Édition inline de la capacité (bandeau personne × sprint).
  const [capEdit, setCapEdit] = useState<{ personId: string; real: number } | null>(null);
  // Position (viewport) du dernier jalon/flag cliqué : ancre l'éditeur près de sa cible.
  const [annotAnchor, setAnnotAnchor] = useState<{ x: number; y: number } | null>(null);
  // Panneau personne (capacités par itération) — exclusif du panneau ticket.
  const [personSel, setPersonSel] = useState<string | null>(null);
  // Matrice de capacité : tous les membres × itérations, en overlay (saisie rapide).
  const [capMatrixOpen, setCapMatrixOpen] = useState(false);
  useEffect(() => {
    if (state.selectedId) setPersonSel(null);
  }, [state.selectedId]);

  // Menu utilisateur (déconnexion / changement de projet).
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // Quitter la session : ferme le socket et revient au lobby (choix du projet).
  const exitSession = useCallback(() => {
    setUserMenuOpen(false);
    disconnectSocket();
    useSessionStore.getState().clear();
  }, []);
  // Déconnexion : efface les cookies serveur puis recharge sur l'écran de login.
  const logout = useCallback(async () => {
    setUserMenuOpen(false);
    useSessionStore.getState().clear();
    try { await api.logout(); } catch { /* on redirige quand même */ }
    window.location.href = "/";
  }, []);

  const [prefs, setPrefs] = useState<UiPrefs>(loadPrefs);
  M.setLoadField(prefs.loadField);
  const savePrefs = (next: UiPrefs): UiPrefs => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
    return next;
  };
  const updatePrefs = useCallback((patch: Partial<UiPrefs>) => {
    setPrefs((p) => savePrefs({ ...p, ...patch }));
  }, []);
  const updateTypePrefs = useCallback((wit: string, patch: Partial<TypePrefs>) => {
    setPrefs((p) => {
      // Première personnalisation d'un type : on part des défauts (sinon un simple
      // toggle effacerait l'extra par défaut, ex. Effort des Epic/Feature).
      const cur = p.types[wit] || { fields: {}, extra: defaultTypePrefs(wit).extra };
      const next: TypePrefs = { fields: { ...cur.fields, ...(patch.fields || {}) }, extra: patch.extra ?? cur.extra };
      return savePrefs({ ...p, types: { ...p.types, [wit]: next } });
    });
  }, []);

  // Discussions ADO des cartes de la vue @me (tickets du sprint courant qui me
  // sont assignés ou que je relis) :
  // hors snapshot, une requête par ticket, mémorisées le temps de la session.
  const [comments, setComments] = useState<Record<string, TicketComment[]>>({});
  // Ids déjà demandés : borne à une requête par ticket, même si le board
  // re-rend pendant le chargement.
  const askedComments = useRef(new Set<string>());
  useEffect(() => {
    const sid = snapshot?.sessionId;
    if (state.board !== "me" || !sid || !myPersonId) return;
    const me = M.people.find((p) => p.id === myPersonId);
    const todo = state.items
      .filter((it) => it.iter === M.CURRENT && (it.person === myPersonId || isMyReview(it, me, prefs.reviewField)) && !askedComments.current.has(it.id))
      .map((it) => it.id);
    if (!todo.length) return;
    todo.forEach((id) => askedComments.current.add(id));
    (async () => {
      // Séquentiel : pas de rafale d'appels ADO à l'ouverture du board.
      for (const id of todo) {
        const list = await api.getComments(sid, id).catch(() => [] as TicketComment[]);
        if (list.length) setComments((c) => ({ ...c, [id]: list }));
      }
    })();
  }, [state.board, state.items, snapshot?.sessionId, myPersonId, prefs.reviewField]);

  // Champs identité (referenceName → nom ADO) des types du board : les seuls
  // candidats au rôle de relecteur, affichés sous leur vrai nom (« Relecteur »
  // et non « Custom.RelecteurPrincipal »). Une requête par type, refaite
  // seulement si la liste des types change.
  const [identityFields, setIdentityFields] = useState<Record<string, string>>({});
  const askedIdentityFields = useRef("");
  useEffect(() => {
    const sid = snapshot?.sessionId;
    if (state.board !== "me" || !realSessionRef.current || !sid) return;
    const wits = [...new Set(state.items.map(witOf))].sort();
    const key = wits.join("|");
    if (!wits.length || key === askedIdentityFields.current) return;
    askedIdentityFields.current = key;
    Promise.all(wits.map((w) => api.getTypeFields(sid, w).catch(() => [])))
      .then((all) => setIdentityFields(Object.fromEntries(
        all.flat().filter((f) => f.type === "identity").map((f) => [f.referenceName, f.name]),
      )));
  }, [state.board, state.items, snapshot?.sessionId]);

  // Sélecteur de champ ADO supplémentaire (popover ⚙ du panneau ticket).
  // list === null : chargement en cours.
  type PickerField = { ref: string; label: string; def?: string | number | boolean | null; required?: boolean; allowed?: string[] };
  const [fieldPicker, setFieldPicker] = useState<{ q: string; list: PickerField[] | null } | null>(null);
  // Saisie custom refusée (champ requis vidé) : incrémenté pour remonter les
  // inputs (clé) et réafficher la valeur conservée.
  const [extraNonce, setExtraNonce] = useState(0);
  const openFieldPicker = useCallback((wit: string) => {
    setFieldPicker({ q: "", list: null });
    const done = (list: PickerField[]) =>
      setFieldPicker((p) => (p ? { ...p, list } : p));
    // Hors session réelle : union des champs custom présents sur les items du même type.
    const fallback = () => {
      const seen = new Map<string, string>();
      stateRef.current.items.forEach((x) => {
        if (witOf(x) === wit) Object.keys(x.custom || {}).forEach((k) => seen.set(k, k.split(".").pop() || k));
      });
      done([...seen].map(([ref, label]) => ({ ref, label })));
    };
    const sid = sessionIdRef.current;
    if (realSessionRef.current && sid) {
      api.getTypeFields(sid, wit)
        .then((fields) => done(fields.map((f) => ({
          ref: f.referenceName, label: f.name, def: f.defaultValue,
          required: f.alwaysRequired || undefined,
          allowed: f.allowedValues?.length ? f.allowedValues : undefined,
        }))))
        .catch(fallback);
    } else fallback();
  }, []);

  const setState = useCallback((patch: Partial<State> | ((s: State) => Partial<State>)) => {
    setSt((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  }, []);

  // Amène le focus dans un popover à son ouverture (Tab/Échap y opèrent
  // directement) sans le voler aux contrôles internes lors des re-renders.
  const focusPopover = useCallback((el: HTMLDivElement | null) => {
    if (el && !el.contains(document.activeElement)) el.focus();
  }, []);

  // ---- refs (instance vars) ----
  const colwRef = useRef(M.MINCOL);
  const colsRef = useRef<number[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const curEls = useRef<(HTMLDivElement | null)[]>([]);
  const curState = useRef(M.cursorList.map(() => ({ i: 0, t: Math.random() })));
  const rafRef = useRef(0);
  const remoteRef = useRef<ReturnType<typeof setInterval>>();
  const syncT = useRef<ReturnType<typeof setTimeout>>();
  const toastT = useRef<ReturnType<typeof setTimeout>>();
  const editT = useRef<ReturnType<typeof setTimeout>>();
  const scrollRaf = useRef(0);
  const idc = useRef(1900);
  const clip = useRef<Item | null>(null);
  const ai = useRef(0);
  const scriptActions = useRef<ScriptAction[]>([]);

  // ---- toast / sync ----
  const toast = useCallback(
    (msg: string) => {
      setState({ toast: msg });
      clearTimeout(toastT.current);
      toastT.current = setTimeout(() => setState({ toast: null }), 2900);
    },
    [setState],
  );
  // Lien d'invitation : l'id de session (UUID) donne accès à la session aux
  // utilisateurs connectés de la même organisation ADO.
  const copyInvite = useCallback(() => {
    const sid = useSessionStore.getState().snapshot?.sessionId;
    if (!sid) return;
    setUserMenuOpen(false);
    navigator.clipboard
      .writeText(`${window.location.origin}/?session=${sid}`)
      .then(() => toast(t("Lien d'invitation copié — valable pour votre organisation ADO")))
      .catch(() => toast(t("Impossible de copier le lien")));
  }, [toast]);
  const sync = useCallback(
    (msg?: string) => {
      setState({ sync: "syncing" });
      clearTimeout(syncT.current);
      syncT.current = setTimeout(() => {
        setState({ sync: "saved" });
        if (msg) toast(msg);
      }, 1000);
    },
    [setState, toast],
  );

  // ---- écriture réelle (writeback ADO via submitOperation) ----
  // Traduit un champ du modèle board en Operation ADO et l'émet. No-op en mock.
  const emitOp = useCallback(
    (itemId: string, boardField: string, value: unknown) => {
      if (!realSessionRef.current || !user) return;
      // Champ ADO custom : le referenceName voyage tel quel ("custom:<ref>").
      if (boardField.startsWith("custom:")) {
        submitOperation({ ticketId: itemId, field: boardField as `custom:${string}`, value: value as string | number | null, userId: user.id, clientTimestamp: Date.now() });
        return;
      }
      let field: OperationField;
      let opValue: string | number | string[] | null;
      switch (boardField) {
        case "title": field = "title"; opValue = value as string; break;
        case "state": {
          // La valeur board est une colonne (ex: "Doing"). Niveau avec board
          // ADO : déplacement de colonne (le serveur écrit le champ Kanban WEF
          // + l'état mappé). Sinon (Task : taskboard) : écriture d'état directe.
          const lvl = stateRef.current.items.find((x) => x.id === itemId)?.level ?? "story";
          if (M.hasBoardColumns(lvl)) {
            field = "boardColumn";
            opValue = value as string;
          } else {
            field = "state";
            opValue = M.stateToWrite(lvl, value as string);
          }
          break;
        }
        case "person": field = "assigneeId"; opValue = value === UNASSIGNED_ID ? null : (value as string); break;
        case "points": field = "storyPoints"; opValue = value as number; break;
        case "priority": field = "priority"; opValue = value as number; break;
        case "effortDays": field = "estimateHours"; opValue = value as number; break;
        case "tags": field = "tags"; opValue = value as string[]; break;
        case "area": field = "areaPath"; opValue = value as string; break;
        case "startDate": field = "startDate"; opValue = value as string; break;
        case "targetDate": field = "targetDate"; opValue = value as string; break;
        case "iter": {
          const p = M.iters[value as number]?.path;
          if (!p) return; // backlog / itération sans path ADO → local seulement
          field = "iterationId";
          opValue = p;
          break;
        }
        default:
          return;
      }
      submitOperation({ ticketId: itemId, field, value: opValue, userId: user.id, clientTimestamp: Date.now() });
    },
    [user],
  );

  // Capacité d'un membre pour un sprint : persistée côté serveur en session
  // réelle (partagée entre participants), locale en mock.
  const commitCapacity = useCallback(
    (personId: string, real: number, value: number) => {
      setCapEdit(null);
      if (!Number.isFinite(value) || value < 0) return;
      const path = M.iters[real]?.path;
      const sid = sessionIdRef.current;
      if (realSessionRef.current && sid && path) {
        useCapacitiesStore.getState().setCapacity(sid, personId, path, value);
      } else {
        const p = M.people.find((x) => x.id === personId);
        if (!p) return;
        p.cap[real] = value;
        setState({});
      }
      sync(t("Capacité mise à jour"));
    },
    [setState, sync],
  );

  // Poste/rôle d'un membre : persisté côté serveur en session réelle (partagé,
  // hors ADO), local en mock. `patch` ne porte que le champ modifié.
  const commitMemberMeta = useCallback(
    (personId: string, patch: { poste?: string; teamRole?: string }) => {
      const p = M.people.find((x) => x.id === personId);
      if (!p) return;
      const poste = (patch.poste ?? p.role).trim();
      const teamRole = (patch.teamRole ?? p.teamRole ?? "").trim();
      if (poste === (p.role || "") && teamRole === (p.teamRole || "")) return;
      const sid = sessionIdRef.current;
      if (realSessionRef.current && sid) {
        useMemberMetaStore.getState().setMemberMeta(sid, { memberId: personId, poste, role: teamRole });
      } else {
        p.role = poste;
        p.teamRole = teamRole;
        setState({});
      }
      sync(t("Profil mis à jour"));
    },
    [setState, sync],
  );

  // ---- mutations ----
  const setField = useCallback(
    (id: string, field: keyof Item, value: unknown) => {
      const st = stateRef.current;
      const items = st.items.map((x) => (x.id === id ? { ...x, [field]: value } : x));
      if (field === "iter") {
        const it = items.find((x) => x.id === id)!;
        it.span = 1;
        it.startISO = M.iters[value as number].iso[0];
        it.endISO = M.iters[value as number].iso[1];
      }
      setState({ items });
      emitOp(id, field as string, value);
      const labels: Record<string, string> = {
        title: t("Titre"), state: t("État"), person: t("Assignation"), iter: t("Itération"),
        points: t("Story points"), effortDays: t("Estimation"), tags: t("Tags"), area: t("Area Path"), priority: t("Priorité"),
      };
      sync(t("{field} enregistré dans Azure DevOps", { field: labels[field as string] || t("Champ") }));
    },
    [setState, sync, emitOp],
  );

  // Champ ADO custom : maj locale (Item.custom) + write-back "custom:<ref>".
  // Saisie numérique ("." ou ",") → nombre ; sinon chaîne brute ; vide = effacer.
  const setCustomField = useCallback(
    (id: string, ref: string, raw: string) => {
      const st = stateRef.current;
      const cur = st.items.find((x) => x.id === id)?.custom?.[ref];
      const trimmed = raw.trim();
      const n = Number(trimmed.replace(",", "."));
      const value = trimmed === "" ? null : Number.isFinite(n) ? n : trimmed;
      if (value === (cur ?? null)) return;
      const items = st.items.map((x) => {
        if (x.id !== id) return x;
        const custom = { ...x.custom };
        if (value === null) delete custom[ref];
        else custom[ref] = value;
        return { ...x, custom };
      });
      setState({ items });
      emitOp(id, `custom:${ref}`, value);
      sync(t("{field} enregistré dans Azure DevOps", { field: ref.split(".").pop() || ref }));
    },
    [setState, sync, emitOp],
  );

  const pasteCopy = useCallback(
    (src: Item) => {
      const sid = sessionIdRef.current;
      if (realSessionRef.current && sid) {
        // Session réelle : le serveur crée le work item copié dans ADO et renvoie le ticket.
        api.duplicateTicket(sid, src.id)
          // `ticket` (et non `t`) : `t` est la fonction de traduction.
          .then((ticket) => {
            const st = ticket.boardColumn || M.columnForState(src.level, ticket.state) || ticket.state || "New";
            const copy: Item = { ...src, id: ticket.id, ado: `#${ticket.id}`, title: ticket.title, state: st, progress: M.stateProgress(st), tags: ticket.tags.slice() };
            setState((s) => ({ items: [...s.items, copy], selectedId: ticket.id, level: src.level }));
            const store = useTicketsStore.getState();
            store.setTickets([...store.tickets, ticket]);
            sync(t("Copie créée dans Azure DevOps : #{id}", { id: ticket.id }));
          })
          .catch(() => toast(t("Impossible de créer la copie dans Azure DevOps")));
        return;
      }
      const id = "ADO-" + idc.current++;
      const copy: Item = { ...src, id, ado: id, title: src.title + " - Copy", state: "New", progress: 0, tags: src.tags.slice() };
      setState((s) => ({ items: [...s.items, copy], selectedId: id, level: src.level }));
      sync(t("Copie créée : {id}", { id }));
    },
    [setState, sync, toast],
  );

  const toggleNode = useCallback(
    (key: string) => {
      const st = stateRef.current;
      const open = M.isOpen(st, key);
      setState({ expanded: { ...st.expanded, [key]: !open } });
    },
    [setState],
  );

  const toggleRowHidden = useCallback(
    (key: string) => {
      const st = stateRef.current;
      setState({ hiddenRows: { ...st.hiddenRows, [key]: !st.hiddenRows[key] } });
    },
    [setState],
  );

  // Écriture d'annotation refusée : l'état local a déjà été appliqué en
  // optimiste et n'est rechargé qu'à l'ouverture de session — on le dit, plutôt
  // que d'afficher « enregistré » sur une modification perdue.
  const annotFailed = useCallback(
    (what: string) => toast(t("{what} non enregistré côté serveur — rechargez la page", { what })),
    [toast],
  );

  const addMilestone = useCallback(() => {
    const st = stateRef.current;
    const sid = sessionIdRef.current;
    const draft = { title: t("Nouveau jalon"), iter: st.releaseStart, color: "#0072B2" };
    if (realSessionRef.current && sid) {
      // Persistance : le serveur attribue l'id.
      api.createMilestone(sid, draft)
        .then((m) => setState((s) => ({ milestones: [...s.milestones, m], milestoneSel: m.id })))
        .catch(() => toast(t("Impossible d'ajouter le jalon (erreur serveur)")));
    } else {
      const id = "M" + Date.now().toString(36);
      setState({ milestones: [...st.milestones, { id, ...draft }], milestoneSel: id });
    }
    sync(t("Jalon ajouté"));
  }, [setState, sync, toast]);
  const setMilestone = useCallback(
    (id: string, field: string, value: unknown) => {
      setState((s) => ({ milestones: s.milestones.map((m) => (m.id === id ? { ...m, [field]: value } : m)) }));
      const sid = sessionIdRef.current;
      if (realSessionRef.current && sid) api.updateMilestone(sid, id, { [field]: value }).catch(() => annotFailed(t("Jalon")));
      sync(t("Jalon mis à jour"));
    },
    [setState, sync, annotFailed],
  );
  const removeMilestone = useCallback(
    (id: string) => {
      setState((s) => ({ milestones: s.milestones.filter((m) => m.id !== id), milestoneSel: null }));
      const sid = sessionIdRef.current;
      if (realSessionRef.current && sid) api.deleteMilestone(sid, id).catch(() => annotFailed(t("Suppression du jalon")));
      sync(t("Jalon supprimé"));
    },
    [setState, sync, annotFailed],
  );

  // Pose un nouveau flag sur une ligne (plusieurs flags par ligne autorisés).
  const addFlag = useCallback(
    (rowKey: string, iter: number) => {
      const draft = { rowKey, iter, title: t("Flag"), color: "#E69F00" };
      const sid = sessionIdRef.current;
      if (realSessionRef.current && sid) {
        api.createRowPin(sid, draft)
          .then((p) => setState((s) => ({ rowPins: [...s.rowPins, p], rowPinSel: p.id, milestoneSel: null })))
          .catch(() => toast(t("Impossible d'ajouter le flag (erreur serveur)")));
      } else {
        const id = "F" + Date.now().toString(36);
        setState((s) => ({ rowPins: [...s.rowPins, { id, ...draft }], rowPinSel: id, milestoneSel: null }));
      }
      sync(t("Flag ajouté"));
    },
    [setState, sync],
  );
  const setFlag = useCallback(
    (id: string, field: string, value: unknown) => {
      setState((s) => ({ rowPins: s.rowPins.map((p) => (p.id === id ? { ...p, [field]: value } : p)) }));
      const sid = sessionIdRef.current;
      if (realSessionRef.current && sid) api.updateRowPin(sid, id, { [field]: value }).catch(() => annotFailed(t("Flag")));
      sync(t("Flag mis à jour"));
    },
    [setState, sync, annotFailed],
  );
  const removeFlag = useCallback(
    (id: string) => {
      setState((s) => ({ rowPins: s.rowPins.filter((p) => p.id !== id), rowPinSel: null }));
      const sid = sessionIdRef.current;
      if (realSessionRef.current && sid) api.deleteRowPin(sid, id).catch(() => annotFailed(t("Suppression du flag")));
      sync(t("Flag supprimé"));
    },
    [setState, sync, annotFailed],
  );

  // Redimensionne/déplace une Feature en Release : son intervalle vient de ses
  // dates Start/Target, qu'on réécrit dans ADO. Les US enfants sont indépendantes.
  const setFeatRange = useCallback(
    (fid: string, s0: number, e0: number) => {
      const st = stateRef.current;
      const startISO = M.iters[s0].iso[0];
      const endISO = M.iters[e0].iso[1];
      const target = st.items.find((x) => x.id === fid)!;
      // US descendantes : enfants directs d'une Feature, ou via les Features d'une Epic.
      const featIds = target.level === "epic"
        ? st.items.filter((x) => x.level === "feature" && x.epicId === fid).map((x) => x.id)
        : [fid];
      const moved: { id: string; iter: number }[] = [];
      const items = st.items.map((x) => {
        if (x.id === fid) return { ...x, relS: s0, relE: e0, hasDateRange: true, startISO, endISO };
        // Réduction : rapatrie les US hors du nouvel intervalle vers le sprint le plus proche dans le scope.
        if (x.level === "story" && x.parent && featIds.includes(x.parent) && x.iter < M.NITER && (x.iter < s0 || x.iter > e0)) {
          const ni = x.iter < s0 ? s0 : e0;
          moved.push({ id: x.id, iter: ni });
          return { ...x, iter: ni, startISO: M.iters[ni].iso[0], endISO: M.iters[ni].iso[1] };
        }
        return x;
      });
      setState({ items });
      // writeback ADO : Start/Target de l'élément + itération des US rapatriées.
      emitOp(fid, "startDate", startISO);
      emitOp(fid, "targetDate", endISO);
      moved.forEach((m) => emitOp(m.id, "iter", m.iter));
      const suffix = moved.length
        ? t(moved.length > 1 ? " · {n} US rapatriées" : " · {n} US rapatriée", { n: moved.length })
        : "";
      sync(t("{ado} replanifié : {from} → {to}{suffix}", { ado: target.ado, from: M.iters[s0].short, to: M.iters[e0].short, suffix }));
    },
    [setState, sync, emitOp],
  );

  // ---- drag ----
  // pointermove peut arriver à >100 Hz : on coalesce en un seul setState par frame
  // (même throttle rAF que le scroll) pour ne pas relancer computeView à chaque event.
  const moveRaf = useRef(0);
  const lastMove = useRef<PointerEvent | null>(null);
  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!stateRef.current.drag) return;
      lastMove.current = e;
      if (moveRaf.current) return;
      moveRaf.current = requestAnimationFrame(() => {
        moveRaf.current = 0;
        const d = stateRef.current.drag, ev = lastMove.current;
        if (!d || !ev) return;
        const next: Drag = { ...d, dx: ev.clientX - d.sx, ...("sy" in d ? { dy: ev.clientY - d.sy } : {}) } as Drag;
        setState({ drag: next });
      });
    },
    [setState],
  );
  const hitPerson = useCallback((clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const y = clientY - rect.top;
    const layout = M.computeLayout(stateRef.current, colwRef.current);
    for (const r of layout.rows) if (r.personId && y >= r.top && y < r.top + r.height) return r.personId;
    return null;
  }, []);
  const hitColIdx = useCallback((clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const idx = Math.floor((clientX - rect.left - M.LEFT) / colwRef.current);
    return Math.max(0, Math.min((colsRef.current.length || 1) - 1, idx));
  }, []);

  const onUp = useCallback(
    (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (moveRaf.current) { cancelAnimationFrame(moveRaf.current); moveRaf.current = 0; }
      const st = stateRef.current;
      const d = st.drag;
      if (!d) return;
      if (d.mode === "epic") {
        const cols = colsRef.current, last = cols[cols.length - 1], first = cols[0];
        const delta = Math.round(d.dx / colwRef.current);
        let s0 = d.os, en = d.oe;
        if (d.side === "R") en = Math.max(s0, Math.min(last, d.oe + delta));
        else if (d.side === "L") s0 = Math.min(en, Math.max(first, d.os + delta));
        else {
          // Déplacement de toute la Feature : décale début+fin en gardant la durée.
          const span = d.oe - d.os;
          s0 = Math.max(first, Math.min(last - span, d.os + delta));
          en = s0 + span;
        }
        // Simple clic (sans déplacement) → pas de writeback inutile, on ouvre
        // le panneau de l'epic/feature (comme un clic sur une carte).
        const moved = s0 !== d.os || en !== d.oe;
        setState(moved ? { drag: null } : { drag: null, selectedId: d.id });
        if (moved) setFeatRange(d.id, s0, en);
        return;
      }
      // Simple clic (pas de déplacement) → sélectionne le ticket. La sélection
      // n'est plus faite au pointerdown pour ne pas ouvrir le panneau en dragguant.
      if (Math.abs(d.dx) < 4 && Math.abs(d.dy) < 4) {
        setState({ drag: null, selectedId: d.id });
        return;
      }
      const items = st.items.map((x) => ({ ...x }));
      const it = items.find((x) => x.id === d.id)!;
      const daily = st.board === "daily";
      let changed = false, msg = "";
      if (d.mode === "resize" && !daily) {
        const cols = colsRef.current, vi = cols.indexOf(it.iter);
        const span = Math.max(1, Math.min(cols.length - vi, Math.round((d.os * colwRef.current + d.dx) / colwRef.current)));
        if (span !== it.span) { it.span = span; changed = true; msg = t(span > 1 ? "{ado} étendu sur {n} itérations" : "{ado} étendu sur {n} itération", { ado: it.ado, n: span }); }
      } else if (d.mode === "move") {
        const idx = hitColIdx(e.clientX);
        const np = hitPerson(e.clientY) || M.people[d.op].id;
        const movedPerson = np !== it.person;
        let movedBucket = false;
        if (daily) {
          const ns = M.dailyStates(st.level)[idx as number];
          if (ns && ns !== it.state) { it.state = ns; it.progress = M.stateProgress(ns); movedBucket = true; }
        } else {
          const ni = idx != null ? colsRef.current[idx] : it.iter;
          if (ni !== it.iter) { it.iter = ni; it.span = 1; it.startISO = M.iters[ni].iso[0]; it.endISO = M.iters[ni].iso[1]; movedBucket = true; }
        }
        if (movedPerson) it.person = np;
        if (movedBucket || movedPerson) {
          changed = true;
          const who = M.people.find((p) => p.id === it.person)!.name.split(" ")[0];
          const what = daily ? it.state : M.iters[it.iter].label;
          msg = movedPerson && movedBucket
            ? t("{ado} → {who} · {what}", { ado: it.ado, who, what })
            : movedPerson
              ? t("{ado} réassigné à {who}", { ado: it.ado, who })
              : t("{ado} → {what}", { ado: it.ado, what });
          // writeback ADO : itération (ou état en Daily) + assignation
          if (movedBucket) emitOp(it.id, daily ? "state" : "iter", daily ? it.state : it.iter);
          if (movedPerson) emitOp(it.id, "person", it.person);
        }
      }
      setState({ drag: null, items });
      if (changed) sync(msg);
    },
    [onMove, setState, setFeatRange, hitColIdx, hitPerson, sync, emitOp],
  );

  const startDrag = useCallback(
    (id: string, mode: "move" | "resize", e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const it = stateRef.current.items.find((x) => x.id === id)!;
      const pIdx = M.people.findIndex((p) => p.id === it.person);
      setState({ rangeOpen: false, drag: { id, mode, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, oi: it.iter, op: pIdx, os: it.span || 1 } });
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setState, onMove, onUp],
  );
  const startEpicResize = useCallback(
    (fid: string, side: "L" | "R" | "M", e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const st = stateRef.current;
      const f = st.items.find((x) => x.id === fid)!;
      const [s0, en] = M.featRange(st, f);
      setState({ drag: { mode: "epic", id: fid, side, sx: e.clientX, dx: 0, os: s0, oe: en } });
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setState, onMove, onUp],
  );

  // ---- refs callbacks ----
  const onScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      const tagged = el as (HTMLDivElement & { _scrollBound?: boolean }) | null;
      if (tagged && !tagged._scrollBound) {
        tagged._scrollBound = true;
        tagged.addEventListener("scroll", () => {
          // scrollLeft n'est lu que par le Release planning (clamp des poignées
          // de redimensionnement au viewport). Le publier dans le state sur les
          // autres boards relançait computeView — layout, barres, centaines de
          // chaînes de style — à chaque frame de défilement, pour une valeur que
          // personne ne lit. Le collage du header/panneau gauche est fait par le
          // compositeur (position:sticky), pas par React : rien d'autre à
          // recalculer au scroll.
          if (stateRef.current.board !== "release") return;
          if (scrollRaf.current) return;
          scrollRaf.current = requestAnimationFrame(() => {
            scrollRaf.current = 0;
            setState({ scrollLeft: tagged.scrollLeft });
          });
        });
      }
    },
    [setState],
  );
  const onCanvasRef = useCallback((el: HTMLDivElement | null) => {
    canvasRef.current = el;
  }, []);

  // ---- drag-to-pan ----
  // Complément du scroll natif (molette/trackpad) : on peut aussi agripper le
  // fond du board pour défiler dans les deux axes. Header et panneau gauche
  // restent fixes via position:sticky (géré par le compositeur, aucun lag).
  const pan = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  const onPanDown = useCallback((e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (e.button !== 0 || !el) return;
    // Pas de pan depuis un champ/bouton (sélection de texte, clics rapides).
    if ((e.target as HTMLElement).closest("input,select,textarea,button")) return;
    pan.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
  }, []);
  const onPanMove = useCallback((e: React.PointerEvent) => {
    const p = pan.current, el = scrollRef.current;
    if (!p || !el) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved) {
      // Seuil : en dessous, c'est un clic (sélection, toggle…), pas un pan.
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      p.moved = true;
      // Peut lever si le pointeur n'est plus actif (relâché entre deux frames).
      try { el.setPointerCapture(e.pointerId); } catch { /* pan sans capture */ }
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
      window.getSelection()?.removeAllRanges();
    }
    el.scrollLeft = p.sl - dx;
    el.scrollTop = p.st - dy;
  }, []);
  const onPanEnd = useCallback(() => {
    const el = scrollRef.current;
    // "grab" (pas "") : React ne réappliquerait pas le cursor du style inline.
    if (el) { el.style.cursor = "grab"; el.style.userSelect = ""; }
    // Après un pan, pan.current reste posé pour que le clic qui suit soit avalé
    // (onPanClickCapture) au lieu de sélectionner/toggler ce qui est sous le curseur.
    if (pan.current && !pan.current.moved) pan.current = null;
  }, []);
  const onPanClickCapture = useCallback((e: React.MouseEvent) => {
    if (pan.current?.moved) { e.stopPropagation(); e.preventDefault(); }
    pan.current = null;
  }, []);

  // ---- lifecycle ----
  const measure = useCallback(() => {
    if (scrollRef.current) setState({ containerW: scrollRef.current.clientWidth, containerH: scrollRef.current.clientHeight });
  }, [setState]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      // Échap : ferme tout panneau/popover/sélection ouvert (même depuis un champ).
      if (e.key === "Escape") {
        setPersonSel(null);
        setCapMatrixOpen(false);
        setUserMenuOpen(false);
        setAnnotAnchor(null);
        setCapEdit(null);
        setFieldPicker(null);
        setState({ selectedId: null, rangeOpen: false, peopleOpen: false, prefsOpen: false, milestoneSel: null, rowPinSel: null });
        return;
      }
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const st = stateRef.current;
      const k = e.key.toLowerCase();
      if (k === "c" && st.selectedId) {
        const it = st.items.find((x) => x.id === st.selectedId);
        if (it) { clip.current = { ...it, tags: it.tags.slice() }; toast(t("Ticket copié — {mod}V pour coller", { mod: modLabel })); e.preventDefault(); }
      } else if (k === "v" && clip.current) {
        pasteCopy(clip.current);
        e.preventDefault();
      } else if (k === "d" && st.selectedId) {
        const it = st.items.find((x) => x.id === st.selectedId);
        if (it) pasteCopy(it);
        e.preventDefault();
      }
    },
    [toast, pasteCopy, setState],
  );

  const remoteTick = useCallback(() => {
    // En session réelle, la collaboration passe par les vrais sockets (pas de simulation).
    if (realSessionRef.current) return;
    if (stateRef.current.drag) return;
    const list = scriptActions.current;
    const a = list[ai.current % list.length];
    ai.current++;
    setState({ editing: { id: a.id, by: a.by }, sync: "syncing" });
    clearTimeout(editT.current);
    editT.current = setTimeout(() => {
      const items = stateRef.current.items.map((x) => {
        if (x.id === a.id) { const c = { ...x }; a.apply(c); return c; }
        return x;
      });
      setState({ items, editing: null, sync: "saved" });
      toast(a.msg);
    }, 1700);
  }, [setState, toast]);

  const tickCursors = useCallback(() => {
    // Session réelle : les curseurs mock ne sont pas rendus — on arrête la boucle
    // rAF au lieu de la relancer indéfiniment (laisse le thread idle).
    if (realSessionRef.current || reduceMotion) { rafRef.current = 0; return; }
    curState.current.forEach((cs, k) => {
      const el = curEls.current[k];
      if (!el) return;
      const wps = M.cursorList[k].wps;
      const a = wps[cs.i], b = wps[(cs.i + 1) % wps.length];
      cs.t += 0.006;
      if (cs.t >= 1) { cs.t = 0; cs.i = (cs.i + 1) % wps.length; }
      const e = cs.t < 0.5 ? 2 * cs.t * cs.t : 1 - Math.pow(-2 * cs.t + 2, 2) / 2;
      el.style.transform = `translate(${a[0] + (b[0] - a[0]) * e}px,${a[1] + (b[1] - a[1]) * e}px)`;
    });
    rafRef.current = requestAnimationFrame(tickCursors);
  }, []);

  useEffect(() => {
    measure();
    requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("keydown", onKey);
    scriptActions.current = [
      { id: "ADO-1234", by: M.presenceList[1], apply: (it) => { it.iter = 1; it.span = 1; it.startISO = M.iters[1].iso[0]; it.endISO = M.iters[1].iso[1]; }, msg: "Elena a déplacé ADO-1234 vers Itération 2" },
      { id: "ADO-1227", by: M.presenceList[2], apply: (it) => { it.state = "Active"; it.progress = 0.25; }, msg: "Ivan a passé ADO-1227 à Active" },
      { id: "ADO-1241", by: M.presenceList[1], apply: (it) => { it.iter = 2; it.span = 1; it.startISO = M.iters[2].iso[0]; it.endISO = M.iters[2].iso[1]; }, msg: "Elena a planifié ADO-1241 en Itération 3" },
      { id: "ADO-1220", by: M.presenceList[2], apply: (it) => { it.state = "Resolved"; it.progress = 1; }, msg: "Ivan a résolu ADO-1220" },
    ];
    ai.current = 0;
    remoteRef.current = setInterval(remoteTick, 9000);
    rafRef.current = requestAnimationFrame(tickCursors);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(remoteRef.current);
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
      clearTimeout(editT.current);
      clearTimeout(syncT.current);
      clearTimeout(toastT.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.board === "release" && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = M.CURRENT * (colwRef.current || M.RELCOL);
      });
    }
  }, [state.board]);

  // Session réelle : alimente le store tickets + ouvre le socket collaboratif +
  // charge les jalons/pins persistés (remplace les valeurs mock par défaut).
  useEffect(() => {
    if (!realSession || !snapshot || !user) return;
    useTicketsStore.getState().setTickets(snapshot.tickets);
    connectSocket(snapshot.sessionId, user.id, user.displayName);
    initPresenceListeners();
    api
      .getAnnotations(snapshot.sessionId)
      .then(({ milestones, rowPins }) => {
        setState({ milestones, rowPins });
      })
      .catch(() => {});
  }, [realSession, snapshot, user, setState]);

  // Onglet masqué depuis un moment => grisé chez les autres, retour => actif.
  useEffect(() => {
    if (!realSession || !user) return;
    return trackAway({
      userId: user.id,
      displayName: user.displayName,
      color: myColor,
      action: "idle",
      targetTicketId: null,
    });
  }, [realSession, user, myColor]);

  // Écritures refusées (serveur ou ADO) : toast au lieu d'un échec silencieux.
  useEffect(() => {
    if (!realSession) return;
    setRejectionHandler(toast);
    return () => setRejectionHandler(null);
  }, [realSession, toast]);

  // Réconciliation : toute maj du store tickets (socket distant, sync ADO,
  // écho de nos propres ops) repatche les champs ADO des items du board.
  useEffect(() => {
    if (!realSession) return;
    const pathIndex = new Map<string, number>();
    M.iters.forEach((it, i) => { if (it.path) pathIndex.set(it.path, i); });
    const memberIds = new Set(M.people.map((p) => p.id));
    const apply = () => {
      const tickets = useTicketsStore.getState().tickets;
      const byId = new Map(tickets.map((t) => [t.id, t]));
      setState((s) => ({
        items: s.items.map((it) => {
          const t = byId.get(it.id);
          if (!t) return it;
          const iter = t.iterationId && pathIndex.has(t.iterationId) ? pathIndex.get(t.iterationId)! : M.BACKLOG;
          const person = t.assigneeId && memberIds.has(t.assigneeId) ? t.assigneeId : UNASSIGNED_ID;
          // Colonne Daily : boardColumn d'abord (écrit au drop via le champ WEF,
          // mis à jour en optimiste et sur les échos — fiable même quand deux
          // colonnes partagent le même état), sinon dérivée de l'état, sinon
          // l'état brut.
          const st = t.boardColumn || M.columnForState(it.level, t.state) || t.state || it.state;
          return { ...it, title: t.title, state: st, progress: M.stateProgress(st), points: t.storyPoints, effortDays: t.estimateHours, tags: t.tags, area: t.areaPath, epicId: t.epicId, priority: t.priority, custom: t.customFields, person, iter };
        }),
      }));
    };
    apply();
    return useTicketsStore.subscribe(apply);
  }, [realSession, snapshot, setState]);

  // Poll ADO (5s) — récupère les changements faits hors de la session.
  useEffect(() => {
    if (!realSession || !snapshot) return;
    const id = setInterval(() => {
      api
        .syncSession(snapshot.sessionId)
        .then((fresh: { tickets: import("@moires/shared").Ticket[]; capacities?: import("@moires/shared").Capacity[] }) => {
          const store = useTicketsStore.getState();
          const pending = new Set(store.tickets.filter((t) => t.syncStatus !== "synced").map((t) => t.id));
          store.updateTickets(fresh.tickets.filter((t) => !pending.has(t.id)));
          // Capacités modifiées par les autres participants.
          // ponytail: le serveur gagne — une saisie locale non encore persistée
          // (fenêtre < 5s) peut être écrasée, le PUT part en ~100ms.
          if (fresh.capacities) useCapacitiesStore.getState().setCapacities(fresh.capacities);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [realSession, snapshot]);

  // ===================== view-model =====================
  const v = computeView();
  function computeView() {
    const lvl = state.level, daily = state.board === "daily", release = state.board === "release", isMe = state.board === "me";
    const dailyCols = M.dailyStates(lvl);
    const cols = daily ? dailyCols.map((_, i) => i) : release ? M.relCols() : M.visibleCols(state);
    const avail = state.containerW - M.LEFT - 2;
    const minCol = release ? M.RELCOL : M.MINCOL;
    const COLW = Math.max(minCol, Math.floor(avail / cols.length));
    colwRef.current = COLW;
    colsRef.current = cols;
    const layout = M.computeLayout(state, COLW);
    // TH clampé à la hauteur du viewport : colonnes et panneau gauche vont jusqu'en bas même avec peu de lignes.
    const TW = M.LEFT + cols.length * COLW, TH = Math.max(layout.totalHeight, state.containerH);
    const d = state.drag, sel = state.selectedId, edit = state.editing;

    const capUsed: Record<string, number[]> = {};
    M.people.forEach((p) => (capUsed[p.id] = new Array(M.NITER + 1).fill(0)));
    state.items.forEach((it) => {
      if (it.level === lvl && !(state.hideClosed && M.isDone(it.state))) capUsed[it.person][it.iter] += M.effortOf(it);
    });

    // Libellé/notice du champ de charge : les jauges comparent ce champ à une
    // capacité en jours ouvrés (convention 1 pt ≈ 1 jour pour les Story Points).
    const loadLabel = prefs.loadField === "points" ? "Story Points" : prefs.loadField === "effortDays" ? t("estimation en jours") : prefs.loadField.split(".").pop() || prefs.loadField;
    const loadNote = prefs.loadField === "points" ? t(" · convention 1 pt ≈ 1 jour") : "";
    // Champ de charge sans valeur sur tous les tickets du niveau affiché (ex.
    // Story Points en granularité Tâche) : les jauges liraient 0 à tort — signalé.
    const lvlItems = release ? [] : state.items.filter((it) => it.level === lvl && !(state.hideClosed && M.isDone(it.state)));
    const loadFieldDead = lvlItems.length > 0 && lvlItems.every((it) => M.effortOf(it) === 0);
    // Zone sous la dernière ligne (colonnes étirées jusqu'en bas du viewport) :
    // estompée pour ne pas ressembler à des lignes de personnes manquantes.
    const lastRow = layout.rows[layout.rows.length - 1];
    const contentBottom = lastRow ? lastRow.top + lastRow.height : M.HEADER;
    const emptyAreaStyle = TH > contentBottom + 1 ? `position:absolute;left:0;top:${contentBottom}px;width:${TW}px;height:${TH - contentBottom}px;background:var(--canvas,#f4f4f7);opacity:.5;z-index:6;pointer-events:none` : null;

    const columns = daily
      ? dailyCols.map((st, ci) => {
          const left = M.LEFT + ci * COLW, col = M.stateColors[st];
          const count = state.items.filter((it) => it.level === lvl && it.iter === M.CURRENT && it.state === st && !(state.hideClosed && M.isDone(st))).length;
          return {
            label: st, dates: "", sub: t(count > 1 ? "{n} tickets" : "{n} ticket", { n: count }), tag: "", tagStyle: "display:none",
            showDot: true, dotColor: col, titleColor: col,
            bgStyle: `position:absolute;top:0;left:${left}px;width:${COLW}px;height:${TH}px;background:${ci % 2 ? "var(--colalt,#fafafc)" : "transparent"};border-right:1px solid var(--gridline,#ececf1)`,
            headStyle: `position:absolute;top:0;left:${left}px;width:${COLW}px;height:${M.HEADER}px;padding:12px 14px;border-bottom:1px solid var(--line,#e8e8ee);background:var(--panel,#fff);z-index:47;box-sizing:border-box;box-shadow:inset 0 -2px 0 ${col}`,
          };
        })
      : cols.map((real, vi) => {
          const it = M.iters[real], left = M.LEFT + vi * COLW;
          const current = real === M.CURRENT, past = real < M.CURRENT;
          let tag = "", tagStyle = "display:none";
          if (current) { tag = t("courante"); tagStyle = "font-size:10px;font-weight:600;padding:1px 6px;border-radius:var(--r-sm,5px);background:var(--accentsoft,#ececfb);color:var(--accent,#5b5bd6)"; }
          else if (past) { tag = t("passée"); tagStyle = "font-size:10px;font-weight:600;padding:1px 6px;border-radius:var(--r-sm,5px);background:var(--line2,#f1f1f5);color:var(--faint,#71717c)"; }
          return {
            // Release : le sous-titre laisse la place à la bande de charge dans le header.
            label: it.label, dates: it.dates, sub: release ? "" : it.sub, tag, tagStyle, showDot: current, dotColor: "var(--accent,#5b5bd6)",
            titleColor: current ? "var(--accent,#5b5bd6)" : past ? "var(--muted,#6b6b75)" : "var(--ink,#1a1a20)",
            bgStyle: `position:absolute;top:0;left:${left}px;width:${COLW}px;height:${TH}px;background:${vi % 2 ? "var(--colalt,#fafafc)" : "transparent"};border-right:1px solid var(--gridline,#ececf1)${real === M.BACKLOG ? ";border-left:1px dashed var(--line,#e8e8ee)" : ""}`,
            headStyle: `position:absolute;top:0;left:${left}px;width:${COLW}px;height:${M.HEADER}px;padding:12px 14px;border-bottom:1px solid var(--line,#e8e8ee);background:var(--panel,#fff);z-index:47;box-sizing:border-box${current ? ";box-shadow:inset 0 -2px 0 var(--accent,#5b5bd6)" : ""}`,
          };
        });

    const personRows = release
      ? []
      : layout.rows.map((r) => {
          const p = M.people.find((x) => x.id === r.personId)!;
          const used = capUsed[p.id][M.CURRENT], cap = M.capOf(p, M.CURRENT), lp = cap ? used / cap : used, lc = M.capColor(lp);
          const openable = p.id !== UNASSIGNED_ID;
          return {
            id: p.id, name: p.name, role: p.role, initials: p.initials, loadShow: daily && !p.unassigned,
            loadText: `${M.fmt(used)}/${M.fmt(cap)}j · ${Math.round(lp * 100)}%`, loadMark: M.loadMark(lp),
            loadTitle: t("Charge {used} ({field}) / capacité {cap} jours ouvrés — {iter}{note}", { used: M.fmt(used), field: loadLabel, cap: M.fmt(cap), iter: M.iters[M.CURRENT].label, note: loadNote }),
            loadTextStyle: `font-size:10px;font-family:${mono};color:${lp > 1 ? "var(--color-error-text,#c62828)" : "var(--muted,#6b6b75)"}`,
            loadFillStyle: `position:absolute;left:0;top:0;height:100%;width:${Math.min(lp, 1) * 100}%;background:${lc};border-radius:3px`,
            avatarStyle: `width:30px;height:30px;border-radius:50%;background:${p.color};color:${M.onColor(p.color)};font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:0 0 auto`,
            // Ouvre le panneau personne (et ferme le panneau ticket).
            onOpen: openable
              ? (e: React.MouseEvent) => { e.stopPropagation(); setFieldPicker(null); setState({ selectedId: null, prefsOpen: false }); setPersonSel(p.id); }
              : undefined,
            // Épinglé au défilement horizontal (comme en Release) : au-dessus des barres (z drag = 40).
            leftStyle: `position:absolute;left:0;top:${r.top}px;width:${M.LEFT}px;height:${r.height}px;background:var(--panel,#fff);border-right:1px solid var(--line,#e8e8ee);padding:0 14px;z-index:45;box-sizing:border-box;display:flex;align-items:center;gap:10px${openable ? ";cursor:pointer" : ""}`,
            sepStyle: `position:absolute;left:0;top:${r.top + r.height}px;width:${TW}px;height:1px;background:var(--gridline,#ececf1);z-index:5`,
          };
        });

    const banners: { style: string; fillStyle: string; text: string; textStyle: string; title: string; pct: string; pctMark: 0 | 1 | 2; pctStyle: string; editing: boolean; capVal: number; onClick: (e: React.MouseEvent) => void; onCommit: (value: number) => void }[] = [];
    if (!daily && !release)
      layout.rows.forEach((r) => {
        const p = M.people.find((x) => x.id === r.personId)!;
        if (p.unassigned) return; // pas de capacité affichée/éditable pour "Non assigné"
        const by = r.top + M.TOPPAD;
        cols.forEach((real, vi) => {
          if (real >= M.NITER) return;
          const used = capUsed[p.id][real], cap = M.capOf(p, real), pct = cap ? used / cap : used, c = M.capColor(pct);
          const editable = p.id !== UNASSIGNED_ID;
          banners.push({
            style: `position:absolute;left:${M.LEFT + vi * COLW + 10}px;top:${by}px;width:${COLW - 20}px;height:${M.BANNER}px;display:flex;align-items:center;gap:8px;padding:0 9px;background:var(--panel2,#fafafc);border:1px solid var(--line2,#f1f1f5);border-radius:var(--r-md,7px);box-sizing:border-box;z-index:4${editable ? ";cursor:pointer" : ""}`,
            fillStyle: `position:absolute;left:0;top:0;height:100%;width:${Math.min(pct, 1) * 100}%;background:${c};border-radius:3px`,
            text: `${M.fmt(used)}/${M.fmt(cap)}j`,
            textStyle: `font-size:10px;font-family:${mono};color:var(--muted,#6b6b75);white-space:nowrap;flex:0 0 auto`,
            title: t("Charge {used} ({field}) / capacité {cap} jours ouvrés{note} — cliquer pour modifier la capacité", { used: M.fmt(used), field: loadLabel, cap: M.fmt(cap), note: loadNote }),
            pct: Math.round(pct * 100) + "%", pctMark: M.loadMark(pct),
            pctStyle: `font-size:10px;font-weight:600;font-family:${mono};color:${pct > 1 ? "var(--color-error-text,#c62828)" : c};flex:0 0 auto`,
            editing: !!capEdit && capEdit.personId === p.id && capEdit.real === real,
            capVal: cap,
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              if (editable) setCapEdit({ personId: p.id, real });
            },
            onCommit: (value: number) => commitCapacity(p.id, real, value),
          });
        });
      });

    const bars = layout.bars.map((b) => {
      const it = b.item, cm = M.colorForBar(it, state.colorMode, theme);
      const isSel = sel === it.id, dragging = !!d && d.id === it.id;
      let width = b.width, transform = "none";
      if (dragging && d) { if (d.mode === "resize") width = Math.max(COLW - 20, b.width + d.dx); else transform = `translate(${d.dx}px,${"dy" in d ? d.dy : 0}px)`; }
      const isEdit = !!edit && edit.id === it.id, editColor = isEdit ? edit!.by.color : null;
      const outline = isEdit ? `2px solid ${editColor}` : isSel ? `1.5px solid ${cm.accent}` : "1px solid " + cm.border;
      const showPoints = it.level !== "task";
      const est = it.level === "task" ? `${M.fmt(it.effortDays)}j` : `${M.fmt(it.points)}p`;
      const epMeta = M.epics[M.epicOf(it)] || ({} as { color?: string; label?: string }), epColor = epMeta.color || "#888";
      const prog = M.stateProgress(it.state), sc = M.stateColors[it.state];
      return {
        ado: it.ado, typeLabel: M.typeLabels[it.type], title: it.title, showPoints, points: M.fmt(it.points) + "p", est, showFooter: !release,
        accent: cm.text, epicName: epMeta.label || "",
        epicDotStyle: `width:8px;height:8px;border-radius:2px;background:${epColor};flex:0 0 auto`,
        // Nom complet, tronqué par le flex seulement quand la carte est trop étroite.
        epicLabelStyle: "font-size:10px;font-weight:500;color:var(--muted,#6b6b75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0",
        area: it.area, areaLeaf: (it.area || "").split("\\").pop() || "",
        editing: isEdit, editInitials: isEdit ? edit!.by.initials : "",
        editPillStyle: `position:absolute;top:-9px;right:-7px;background:${editColor};color:${M.onColor(editColor || "#5b5bd6")};font-size:10px;font-weight:700;width:19px;height:19px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid var(--panel,#fff);animation:ggpulse 1.1s ease-in-out infinite`,
        badgeStyle: `font-size:10px;font-weight:600;padding:1px 5px;border-radius:var(--r-sm,5px);background:${cm.bg};border:1px solid ${cm.border};color:${cm.text}`,
        accentStyle: `position:absolute;left:0;top:0;bottom:0;width:4px;background:${epColor};border-radius:var(--r-lg,9px) 0 0 var(--r-lg,9px)`,
        progressStyle: `height:100%;width:${Math.round(prog * 100)}%;background:${sc};border-radius:0 0 0 var(--r-lg,9px);transition:width .2s`,
        // Opacité par défaut/survol via .gg-grip (index.css) ; inline seulement
        // pour les états sélectionné/drag (le style inline prime sur la classe).
        handleStyle: `width:3px;height:22px;border-radius:2px;background:${isSel ? cm.accent : "var(--faint,#71717c)"}${isSel || dragging ? ";opacity:.9" : ""}`,
        resizable: !daily,
        style: `position:absolute;left:${b.left}px;top:${b.top}px;width:${width}px;height:${b.height}px;background:${cm.bg};border:${outline};border-radius:var(--r-lg,9px);padding:7px 12px 9px 14px;cursor:${dragging ? "grabbing" : "grab"};box-shadow:${isSel || dragging ? "0 8px 24px rgba(20,20,40,.16)" : "var(--shadow)"};overflow:visible;user-select:none;display:flex;flex-direction:column;transform:${transform};transition:${dragging ? "none" : "box-shadow .14s,border-color .14s"};z-index:${dragging ? 40 : isSel ? 30 : isEdit ? 28 : 12};box-sizing:border-box;outline-offset:1px`,
        onDown: (e: React.PointerEvent) => startDrag(it.id, "move", e),
        onResize: (e: React.PointerEvent) => startDrag(it.id, "resize", e),
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        // Accès clavier : Entrée/Espace ouvre le panneau ticket (qui permet de
        // tout modifier — l'équivalent clavier du drag & drop).
        onKey: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setState({ selectedId: it.id }); }
        },
      };
    });

    // Cellule cible pendant un drag de carte (colonne × personne sous le
    // curseur) : fantôme de drop pour montrer où la carte atterrira.
    let dropGhost: { style: string } | null = null;
    if (d && d.mode === "move" && !release) {
      const vi = hitColIdx(d.sx + d.dx);
      const pid = hitPerson(d.sy + d.dy);
      const row = layout.rows.find((r) => r.personId === pid);
      if (vi != null && row)
        dropGhost = {
          style: `position:absolute;left:${M.LEFT + vi * COLW + 4}px;top:${row.top + 4}px;width:${COLW - 8}px;height:${row.height - 8}px;border:2px dashed var(--accent,#5b5bd6);border-radius:var(--r-lg,9px);background:var(--accentsoft,#ececfb);opacity:.45;z-index:11;pointer-events:none`,
        };
    }

    const cursors = M.cursorList.map((c, k) => ({
      name: c.name, color: c.color,
      labelStyle: `margin:-3px 0 0 13px;background:${c.color};color:${M.onColor(c.color)};font-size:11px;font-weight:600;padding:2px 7px;border-radius:var(--r-lg,9px);white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25)`,
      setRef: (el: HTMLDivElement | null) => { if (el) curEls.current[k] = el; },
    }));
    const presenceSrc = realSession
      ? [
          { initials: initials(user!.displayName), name: t("{name} (vous)", { name: user!.displayName }), color: myColor, away: false },
          ...peers.map((p) => {
            const away = p.action === "away";
            return {
              initials: initials(p.displayName),
              name: away ? t("{name} (inactif)", { name: p.displayName }) : p.displayName,
              color: p.color,
              away,
            };
          }),
        ]
      : M.presenceList.map((p) => ({ ...p, away: false }));
    const presence = presenceSrc.map((p, i) => ({
      initials: p.initials, name: p.name,
      style: `width:26px;height:26px;border-radius:50%;background:${p.color};color:${M.onColor(p.color)};font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;border:2px solid var(--panel,#fff);margin-left:${i ? -7 : 0}px` +
        (p.away ? ";opacity:.4;filter:grayscale(1)" : ""),
    }));
    const onlineLabel = t("{n} en ligne", { n: realSession ? peers.length + 1 : 3 });

    // Le minuteur couvre les enregistrements hors tickets (capacité, profil,
    // annotations) ; `pendingWrites` maintient l'indicateur tant qu'une écriture
    // ADO n'est pas confirmée par le serveur.
    const syncing = state.sync === "syncing" || (realSession && pendingWrites);
    // Le libellé se rétrécit sur les petites largeurs (le titre au survol donne
    // le texte complet) ; la pastille d'état, elle, reste toujours visible.
    const syncStyle = `display:flex;align-items:center;gap:7px;font-size:12px;font-weight:500;min-width:0;white-space:nowrap;color:${syncing ? "var(--accent,#5b5bd6)" : "var(--color-synced-text,#1f8a54)"}`;
    const syncDotStyle = (syncing
      ? "width:11px;height:11px;border-radius:50%;border:2px solid var(--accent,#5b5bd6);border-top-color:transparent;animation:ggspin .7s linear infinite"
      : "width:8px;height:8px;border-radius:50%;background:var(--color-synced,#2bbf73)") + ";flex:0 0 auto";

    const levels = M.levelDefs.map((l) => {
      const active = state.level === l.key;
      return {
        label: t(l.label), onClick: () => setState({ level: l.key, selectedId: null }),
        style: `padding:5px 13px;border-radius:var(--r-md,7px);border:none;font-size:12px;white-space:nowrap;font-weight:${active ? 600 : 500};cursor:pointer;background:${active ? "var(--panel,#fff)" : "transparent"};color:${active ? "var(--ink,#1a1a20)" : "var(--muted,#6b6b75)"};box-shadow:${active ? "0 1px 2px rgba(20,20,40,.12)" : "none"}`,
      };
    });

    const rl = state.rangeFrom === state.rangeTo ? M.iters[state.rangeFrom].short : `${M.iters[state.rangeFrom].short} → ${M.iters[state.rangeTo].short}`;
    const rangeLabel = release ? t("Toutes les itérations") : daily ? M.iters[M.CURRENT].short : rl + (state.backlog ? " + Backlog" : "");
    const iterLabel = (i: number) =>
      i === M.CURRENT ? t("{label} (courante)", { label: M.iters[i].label })
      : i < M.CURRENT ? t("{label} (passée)", { label: M.iters[i].label })
      : M.iters[i].label;
    const iterOptions = Array.from({ length: M.NITER }, (_, i) => ({ value: String(i), label: iterLabel(i) }));
    const range = {
      showRange: !daily && !release, isRelease: release,
      from: String(state.rangeFrom), to: String(state.rangeTo), backlog: state.backlog, iterOptions,
      onFrom: (e: React.ChangeEvent<HTMLSelectElement>) => { const val = Number(e.target.value); setState((s) => ({ rangeFrom: val, rangeTo: Math.max(val, s.rangeTo) })); },
      onTo: (e: React.ChangeEvent<HTMLSelectElement>) => { const val = Number(e.target.value); setState((s) => ({ rangeTo: val, rangeFrom: Math.min(val, s.rangeFrom) })); },
      onBacklog: (e: React.ChangeEvent<HTMLInputElement>) => setState({ backlog: e.target.checked }),
      onGoCurrent: () => { if (scrollRef.current) scrollRef.current.scrollLeft = M.CURRENT * (colwRef.current || M.RELCOL); setState({ rangeOpen: false }); },
      hasPast: release ? state.releaseStart < M.CURRENT : !daily && state.rangeFrom < M.CURRENT,
      onReset: release ? () => setState({ releaseStart: M.CURRENT }) : () => setState((s) => ({ rangeFrom: M.CURRENT, rangeTo: Math.max(M.CURRENT, s.rangeTo) })),
      hideClosed: state.hideClosed, onHideClosed: (e: React.ChangeEvent<HTMLInputElement>) => setState({ hideClosed: e.target.checked }),
    };

    // inspector
    let insp: ReturnType<typeof buildInsp> | null = null;
    const item = state.items.find((x) => x.id === sel);
    function buildInsp(item: Item) {
      const cm = M.colorMap(item.type, theme);
      // Chaîne des parents, du plus haut au plus proche (Epic › Feature › US) :
      // remontée par `parent`, complétée par `epicId` quand la Feature parente
      // est hors du périmètre synchronisé.
      const byId = new Map(state.items.map((x) => [x.id, x]));
      const ancestors: Item[] = [];
      const seen = new Set<string>([item.id]);
      let cur: Item | undefined = item;
      while (cur) {
        const up: Item | undefined = (cur.parent ? byId.get(cur.parent) : undefined) || (cur.level !== "epic" && cur.epicId ? byId.get(cur.epicId) : undefined);
        if (!up || seen.has(up.id)) break;
        seen.add(up.id);
        ancestors.unshift(up);
        cur = up;
      }
      const isTask = item.level === "task";
      const wit = witOf(item);
      const tp = typePrefsOf(prefs, wit);
      const fmtVal = (val: string | number | boolean | null | undefined) => {
        if (val == null) return "—";
        const s = String(val);
        return s.length > 300 ? s.slice(0, 300) + "…" : s;
      };
      return {
        ado: item.ado, typeLabel: M.typeLabels[item.type], accent: cm.text,
        badgeStyle: `font-size:10px;font-weight:600;padding:2px 7px;border-radius:var(--r-md,7px);background:${cm.bg};border:1px solid ${cm.border};color:${cm.text}`,
        // Commit au blur (pas à chaque frappe) : évite un write-back ADO par caractère.
        title: item.title, onTitle: (e: React.FocusEvent<HTMLTextAreaElement>) => { const val = e.target.value.trim(); if (!val) { e.target.value = item.title; return; } if (val !== item.title) setField(item.id, "title", val); },
        parents: ancestors.map((p, i) => ({
          id: p.id, label: `${p.ado} · ${p.title}`, typeLabel: M.typeLabels[p.type] || p.type, indent: i * 11,
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); setState({ selectedId: p.id }); },
        })),
        states: M.dailyStates(item.level).map((k) => {
          const active = item.state === k, col = M.stateColors[k];
          return { label: k, onClick: () => setField(item.id, "state", k), style: `padding:7px 9px;border-radius:var(--r-md,7px);border:1px solid ${active ? col : "var(--line,#e8e8ee)"};background:${active ? col : "var(--panel2,#fafafc)"};color:${active ? "#fff" : "var(--muted,#6b6b75)"};font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis` };
        }),
        assignee: item.person, onAssignee: (e: React.ChangeEvent<HTMLSelectElement>) => setField(item.id, "person", e.target.value),
        people: M.people.map((p) => ({ value: p.id, label: p.name })),
        iter: String(item.iter), onIter: (e: React.ChangeEvent<HTMLSelectElement>) => setField(item.id, "iter", Number(e.target.value)),
        iterOptions: M.iters.map((it, i) => ({ value: String(i), label: it.label })),
        area: item.area, onArea: (e: React.ChangeEvent<HTMLSelectElement>) => setField(item.id, "area", e.target.value),
        areaOptions: M.areaOptions.map((a) => ({ value: a, label: a })),
        onDup: () => pasteCopy(item),
        adoHref: snapshot?.adoUrl ? `${snapshot.adoUrl}/_workitems/edit/${item.id}` : null,
        notTask: !isTask, isTask,
        show: tp.fields,
        // --- Personnalisation des champs du panneau (par type de work item) ---
        wit,
        prefsOpen: state.prefsOpen,
        onPrefsToggle: (e: React.MouseEvent) => { e.stopPropagation(); setFieldPicker(null); setState((s) => ({ prefsOpen: !s.prefsOpen })); },
        // Clic dans le panneau hors du popover réglages : ferme les réglages (le popover stoppe la propagation).
        onPanelClick: (e: React.MouseEvent) => { e.stopPropagation(); if (stateRef.current.prefsOpen) { setFieldPicker(null); setState({ prefsOpen: false }); } },
        prefFields: inspFieldDefs
          .filter((f) => !f.kinds || f.kinds.includes(witKind(wit)))
          .map((f) => ({
            label: t(f.label), checked: tp.fields[f.key] !== false,
            onToggle: (e: React.ChangeEvent<HTMLInputElement>) => updateTypePrefs(wit, { fields: { [f.key]: e.target.checked } }),
          })),
        onAddField: (e: React.MouseEvent) => { e.stopPropagation(); openFieldPicker(wit); },
        picker: fieldPicker && {
          q: fieldPicker.q,
          onQ: (e: React.ChangeEvent<HTMLInputElement>) => setFieldPicker((p) => (p ? { ...p, q: e.target.value } : p)),
          loading: fieldPicker.list === null,
          onClose: () => setFieldPicker(null),
          options: (fieldPicker.list || [])
            .filter((f) => !tp.extra.some((x) => x.ref === f.ref))
            .filter((f) => f.label.toLowerCase().includes(fieldPicker.q.toLowerCase()))
            .map((f) => ({ ...f, onPick: () => updateTypePrefs(wit, { extra: [...tp.extra, f] }) })),
        },
        points: item.points,
        // Saisie décimale : "." et "," acceptés, commit au blur (pas à la frappe).
        onPoints: (e: React.FocusEvent<HTMLInputElement>) => { const n = parseFloat(e.target.value.replace(",", ".")); const val = Number.isFinite(n) ? Math.max(0, n) : item.points; e.target.value = String(val); if (val !== item.points) setField(item.id, "points", val); },
        incPoints: () => setField(item.id, "points", item.points + 0.5), decPoints: () => setField(item.id, "points", Math.max(0, item.points - 0.5)),
        effort: item.effortDays || 0,
        onEffort: (e: React.FocusEvent<HTMLInputElement>) => { const n = parseFloat(e.target.value.replace(",", ".")); const val = Number.isFinite(n) ? Math.max(0, n) : item.effortDays || 0; e.target.value = String(val); if (val !== (item.effortDays || 0)) setField(item.id, "effortDays", val); },
        incEffort: () => setField(item.id, "effortDays", (item.effortDays || 0) + 0.5),
        decEffort: () => setField(item.id, "effortDays", Math.max(0, (item.effortDays || 0) - 0.5)),
        priority: item.priority ?? "",
        // Commit au blur : taper « 10 » n'écrit plus « 1 » puis « 10 » dans ADO.
        onPriority: (e: React.FocusEvent<HTMLInputElement>) => { const n = parseInt(e.target.value, 10); const val = n >= 1 ? n : (item.priority ?? ""); e.target.value = String(val); if (n >= 1 && n !== item.priority) setField(item.id, "priority", n); },
        dates: M.formatRange(item.startISO, item.endISO),
        extraFields: tp.extra.map((f) => {
          const raw = item.custom?.[f.ref] != null ? String(item.custom![f.ref]) : "";
          return {
            // Valeur stockée sur le ticket, sinon défaut du process (comme ADO), sinon "—".
            ref: f.ref, label: f.label, value: fmtVal(item.custom?.[f.ref] ?? f.def),
            raw, required: !!f.required, allowed: f.allowed,
            onCommit: (e: { target: { value: string } }) => {
              // Champ requis dans ADO : saisie vide refusée localement.
              if (f.required && !e.target.value.trim()) {
                setExtraNonce((n) => n + 1); // remonte l'input → réaffiche la valeur conservée
                toast(t("« {label} » est requis dans Azure DevOps — valeur conservée", { label: f.label }));
                return;
              }
              setCustomField(item.id, f.ref, e.target.value);
            },
            onRemove: () => updateTypePrefs(wit, { extra: tp.extra.filter((x) => x.ref !== f.ref) }),
          };
        }),
        onClose: () => { setFieldPicker(null); setState({ selectedId: null, prefsOpen: false }); },
        footDotStyle: syncing ? `width:9px;height:9px;border-radius:50%;border:2px solid var(--accent,#5b5bd6);border-top-color:transparent;animation:ggspin .7s linear infinite` : "width:7px;height:7px;border-radius:50%;background:var(--color-synced,#2bbf73)",
        footLabel: syncing ? t("Écriture dans Azure DevOps…") : t("Synchronisé · write-back par champ"),
      };
    }
    if (item) insp = buildInsp(item);

    // Panneau personne : capacité éditable pour chaque itération.
    const selPerson = personSel ? M.people.find((p) => p.id === personSel) : null;
    const personPanel = selPerson
      ? {
          name: selPerson.name, poste: selPerson.role, teamRole: selPerson.teamRole, initials: selPerson.initials,
          onCommitPoste: (e: React.FocusEvent<HTMLInputElement>) => commitMemberMeta(selPerson.id, { poste: e.target.value }),
          onCommitRole: (e: React.FocusEvent<HTMLInputElement>) => commitMemberMeta(selPerson.id, { teamRole: e.target.value }),
          avatarStyle: `width:34px;height:34px;border-radius:50%;background:${selPerson.color};color:${M.onColor(selPerson.color)};font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:0 0 auto`,
          // Itération courante et suivantes : la capacité des sprints passés ne s'édite plus.
          rows: M.iters.slice(M.CURRENT, M.NITER).map((it, k) => {
            const i = M.CURRENT + k;
            const used = capUsed[selPerson.id]?.[i] || 0, cap = M.capOf(selPerson, i);
            const pct = cap ? used / cap : used;
            return {
              key: i, label: it.label, dates: it.dates, current: i === M.CURRENT,
              usedText: `${M.fmt(used)} /`,
              cap,
              pctText: Math.round(pct * 100) + "%", pctMark: M.loadMark(pct),
              pctStyle: `font-size:11px;font-weight:600;font-family:${mono};color:${pct > 1 ? "var(--color-error-text,#c62828)" : M.capTextColor(pct)};width:${pct > 1 ? 52 : 40}px;text-align:right;flex:0 0 auto`,
              // Même convention que les champs du panneau ticket : commit au blur.
              onCommit: (e: React.FocusEvent<HTMLInputElement>) => {
                const n = parseFloat(e.target.value.replace(",", "."));
                const val = Number.isFinite(n) ? Math.max(0, n) : cap;
                e.target.value = String(val);
                if (val !== cap) commitCapacity(selPerson.id, i, val);
              },
            };
          }),
          onClose: () => setPersonSel(null),
        }
      : null;

    // Matrice de capacité : membres × itérations (courante et suivantes, comme le
    // panneau personne — les sprints passés ne s'éditent plus).
    const capMatrix = capMatrixOpen
      ? (() => {
          const idx = M.iters.slice(M.CURRENT, M.NITER).map((_, k) => M.CURRENT + k);
          // Suit le filtre « Personnes » de la barre d'outils.
          const members = M.people.filter((p) => !p.unassigned && !state.hidden[p.id]);
          return {
            cols: idx.map((i) => ({ key: i, label: M.iters[i].label, dates: M.iters[i].dates, current: i === M.CURRENT })),
            rows: members.map((p, ri) => ({
              key: p.id, name: p.name, poste: p.role, initials: p.initials,
              avatarStyle: `width:26px;height:26px;border-radius:50%;background:${p.color};color:${M.onColor(p.color)};font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:0 0 auto`,
              cells: idx.map((i, ci) => {
                const used = capUsed[p.id]?.[i] || 0, cap = M.capOf(p, i), pct = cap ? used / cap : used;
                return {
                  key: i, cap,
                  subText: `${M.fmt(used)}j · ${Math.round(pct * 100)}%`, subMark: M.loadMark(pct),
                  subStyle: `font-size:10px;font-family:${mono};color:${pct > 1 ? "var(--color-error-text,#c62828)" : "var(--faint,#71717c)"}`,
                  title: t("{name} — {iter} : charge {used} ({field}) / capacité {cap} jours ouvrés{note}", { name: p.name, iter: M.iters[i].label, used: M.fmt(used), field: loadLabel, cap: M.fmt(cap), note: loadNote }),
                  // Même convention que le panneau personne : commit au blur.
                  onCommit: (e: React.FocusEvent<HTMLInputElement>) => {
                    const n = parseFloat(e.target.value.replace(",", "."));
                    const val = Number.isFinite(n) ? Math.max(0, n) : cap;
                    e.target.value = String(val);
                    if (val !== cap) commitCapacity(p.id, i, val);
                  },
                  // Collage d'une plage Excel/TSV (tab = colonnes, retour ligne =
                  // lignes) : remplit la grille à partir de la cellule ciblée.
                  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => {
                    const text = e.clipboardData.getData("text/plain");
                    if (!/[\t\r\n]/.test(text)) return; // valeur simple : collage natif
                    e.preventDefault();
                    text.replace(/\r/g, "").split("\n").forEach((line, dr) => {
                      const target = members[ri + dr];
                      if (!target || line === "") return;
                      line.split("\t").forEach((txt, dc) => {
                        const iter = idx[ci + dc];
                        if (iter == null) return;
                        const n = parseFloat(txt.replace(",", "."));
                        if (Number.isFinite(n)) commitCapacity(target.id, iter, Math.max(0, n));
                      });
                    });
                  },
                };
              }),
            })),
            totals: idx.map((i) => {
              const cap = members.reduce((s, p) => s + M.capOf(p, i), 0);
              const used = members.reduce((s, p) => s + (capUsed[p.id]?.[i] || 0), 0);
              const pct = cap ? used / cap : used;
              return {
                key: i, text: `${M.fmt(used)} / ${M.fmt(cap)}j`,
                pctText: Math.round(pct * 100) + "%", pctMark: M.loadMark(pct),
                pctStyle: `font-size:10px;font-weight:600;font-family:${mono};color:${pct > 1 ? "var(--color-error-text,#c62828)" : M.capTextColor(pct)}`,
              };
            }),
            onClose: () => setCapMatrixOpen(false),
          };
        })()
      : null;

    // release-only
    type TreeRow = Record<string, unknown>;
    let treeRows: TreeRow[] = [], loadBand: Record<string, unknown>[] = [], milestones: Record<string, unknown>[] = [],
      relCards: Record<string, unknown>[] = [], relBands: { style: string }[] = [], relEpics: Record<string, unknown>[] = [], relRowPins: Record<string, unknown>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let relMetrics: Record<string, any> | null = null, relWaterline: Record<string, string> | null = null;
    if (release) {
      const SL = state.scrollLeft;
      // Métriques macro sur l'intervalle choisi : Σ capa vs Σ effort, et ligne de
      // flottaison = point où le cumul des epics (ordre d'affichage) épuise la capa.
      const met = M.releaseMetrics(state);
      const metShorts = `${M.iters[met.from].short} → ${M.iters[met.to].short}`;
      const hiddenSt = M.hiddenStoryIds(state);
      let cumEff = 0;
      treeRows = layout.rows.map((r) => {
        const indent = 12 + (r.depth || 0) * 16;
        if (r.kind === "band") {
          return {
            isArea: false, key: r.key, hasChildren: false, name: "", sub: "", ado: "", badge: "", title: "", chevron: "",
            chevStyle: "display:none", adoStyle: "display:none", badgeStyle: "display:none", dotColor: "transparent",
            statusStyle: "display:none", pinStyle: "display:none",
            leftStyle: `position:absolute;left:0;top:${r.top}px;width:${M.LEFT}px;height:${r.height}px;background:var(--colalt,#fafafc);border-right:1px solid var(--line,#e8e8ee);z-index:32;box-sizing:border-box`,
            sepStyle: `position:absolute;left:0;top:${r.top + r.height}px;width:${TW}px;height:1px;background:var(--gridline,#ececf1);z-index:5`,
          };
        }
        const ch = M.parentCharge(state, r.us || []);
        const isFeat = r.kind === "feature";
        const hidden = !!state.hiddenRows[r.key!];
        const rg = r.range || null;
        // L'intervalle est déjà lisible sur la barre du board → pas répété ici.
        // Les US sans itération n'ont pas de colonne : signalées ici pour ne pas
        // les perdre (elles comptent bien dans Σ).
        const unp = ch.unplanned ? t(" · {n} sans itération", { n: ch.unplanned }) : "";
        const sub = (ch.total > 0 ? `Σ ${M.fmt(ch.total)}` : t("aucune US planifiée")) + unp;
        const subTitle = ch.total > 0 ? t("charge totale des US : {total} ({field})", { total: M.fmt(ch.total), field: loadLabel }) : undefined;
        // Double-clic sur une epic/feature → pose un flag au début de son sprint.
        const flagIter = rg ? rg[0] : M.CURRENT;
        // Même statut que le tri de l'arbre (M.statusBucket) : le tag explique
        // l'ordre des lignes au lieu de le contredire.
        const bucket = M.statusBucket(rg, r.us || []);
        const tag = STATUS_TAGS[bucket];
        const statusTag = tag ? t(tag[0]) : "";
        const statusTone = tag && tag[1] ? M.tone(tag[1], theme) : null;
        const statusStyle = tag
          ? `font-size:10px;font-weight:600;padding:1px 6px;border-radius:var(--r-sm,5px);background:${statusTone ? statusTone.bg : "var(--line2,#f1f1f5)"};color:${statusTone ? statusTone.text : "var(--muted,#6b6b75)"};flex:0 0 auto`
          : "display:none";
        const statusTitle = bucket === 1 && rg
          ? t("Des US sont planifiées sur le sprint courant ou à venir, hors de l'intervalle {from} → {to}", { from: M.iters[rg[0]].short, to: M.iters[rg[1]].short })
          : undefined;
        const prio = !isFeat && r.item?.priority != null ? `P${r.item.priority}` : "";
        // Epic : effort compté sur l'intervalle de métriques + cumul (ligne de flottaison).
        let stat = "", statTitle = "";
        if (!isFeat) {
          const intEff = M.countedEffort(state, r.us || [], met.from, met.to, hiddenSt);
          const before = cumEff;
          cumEff += intEff;
          if (intEff > 0) {
            const pct = met.cap ? Math.round((intEff / met.cap) * 100) : 0;
            stat = `${pct}%`;
            statTitle = t("Effort sur {range} : {effort} ({pct} % de la capacité {cap}j) · cumul dans l'ordre d'affichage : {cum}", { range: metShorts, effort: M.fmt(intEff), pct, cap: M.fmt(met.cap), cum: M.fmt(cumEff) });
            if (before < met.cap && cumEff > met.cap) {
              relWaterline = {
                lineStyle: `position:absolute;left:0;top:${r.top}px;width:${TW}px;height:0;border-top:2px dashed var(--color-error,#ef4444);z-index:44;pointer-events:none`,
                flagStyle: `position:absolute;left:10px;top:${r.top - 9}px;z-index:44;background:var(--color-error,#ef4444);color:#fff;padding:2px 8px;border-radius:var(--r-sm,5px);font-size:10px;font-weight:600;white-space:nowrap;pointer-events:auto`,
                label: t("Capacité épuisée · {cap}j ({range})", { cap: M.fmt(met.cap), range: metShorts }),
                title: t("Cumul de l'effort des epics dans l'ordre d'affichage : tout ce qui est sous cette ligne ne tient pas dans la capacité de l'intervalle {range}.", { range: metShorts }),
              };
            }
          }
        }
        return {
          isArea: true, isFeat, key: r.key, hasChildren: r.hasChildren, open: r.open, statusTag, statusStyle, statusTitle, prio, stat, statTitle,
          hidden, hideTitle: hidden ? t("Réafficher (compter dans la charge)") : t("Masquer (exclure de la charge)"),
          onToggleHidden: (e: React.MouseEvent) => { e.stopPropagation(); toggleRowHidden(r.key!); },
          chevron: r.open ? "▾" : r.hasChildren ? "▸" : "", onToggle: (e: React.MouseEvent) => { e.stopPropagation(); if (r.hasChildren) toggleNode(r.key!); },
          name: isFeat ? r.item!.ado + "  " + r.item!.title : r.epicName || t("(Sans epic)"),
          sub, subTitle, dotColor: r.accent,
          onDoubleClick: () => addFlag(r.key!, flagIter),
          ado: "", badge: "", title: "", adoStyle: "display:none", badgeStyle: "display:none",
          chevStyle: `font-size:17px;color:var(--ink,#1a1a20);width:18px;flex:0 0 auto;cursor:${r.hasChildren ? "pointer" : "default"};text-align:center`,
          leftStyle: `position:absolute;left:0;top:${r.top}px;width:${M.LEFT}px;height:${r.height}px;background:${sel && r.item && sel === r.item.id ? "var(--accentsoft,#ececfb)" : isFeat ? "var(--panel,#fff)" : "var(--panel2,#fafafc)"};border-right:1px solid var(--line,#e8e8ee);border-bottom:1px solid var(--line2,#f1f1f5);padding:0 12px 0 ${indent}px;z-index:32;box-sizing:border-box;display:flex;align-items:center;gap:8px${hidden ? ";opacity:.45;filter:grayscale(1)" : ""}`,
          sepStyle: `position:absolute;left:0;top:${r.top + r.height}px;width:${TW}px;height:1px;background:var(--gridline,#ececf1);z-index:5`,
          // Ligne adossée à un work item ADO → ouvre son panneau (le chevron reste
          // dédié au pli/dépli). Nœud « (Sans epic) » : pas d'item, on plie.
          // stopPropagation : sinon le clic remonte au canvas (onBgClick) qui referme aussitôt le panneau.
          onClick: (e?: React.MouseEvent) => { e?.stopPropagation(); if (r.item) setState({ selectedId: r.item.id }); else if (r.hasChildren) toggleNode(r.key!); },
        };
      });

      relCards = (layout.cards || []).map((c) => {
        const it = c.item, cm = M.colorForBar(it, state.colorMode, theme), isTask = c.level === "task";
        const isSel = sel === it.id, dragging = !!d && d.id === it.id;
        const ep = M.epics[M.epicOf(it)] || ({} as { color?: string });
        let transform = "none";
        if (dragging && d && d.mode === "move") transform = `translate(${d.dx}px,${"dy" in d ? d.dy : 0}px)`;
        const sc = M.stateColors[it.state];
        return {
          isTask, hasChildren: c.hasChildren, chevron: c.open ? "▾" : "▸",
          ado: it.ado, title: it.title, points: M.fmt(it.points) + "p", badge: M.typeLabels[it.type], showPoints: !isTask,
          adoStyle: `font-size:10px;font-weight:600;font-family:${mono};color:${cm.text}`,
          badgeStyle: `font-size:10px;font-weight:600;padding:1px 5px;border-radius:var(--r-sm,5px);background:${cm.bg};border:1px solid ${cm.border};color:${cm.text}`,
          chevStyle: `font-size:8px;color:var(--muted,#6b6b75);cursor:pointer;flex:0 0 auto;width:12px;text-align:center`,
          onToggle: (e: React.MouseEvent) => { e.stopPropagation(); if (c.hasChildren) toggleNode(it.id); },
          onDown: (e: React.PointerEvent) => startDrag(it.id, "move", e),
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); setState({ selectedId: it.id }); },
          onKey: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setState({ selectedId: it.id }); }
          },
          dotStyle: `width:6px;height:6px;border-radius:50%;background:${sc};flex:0 0 auto;margin-top:4px`,
          style: `position:absolute;left:${c.left}px;top:${c.top}px;width:${c.width}px;height:${c.height}px;background:${cm.bg};border:${isSel ? "1.5px solid " + cm.accent : "1px solid " + cm.border};border-left:3px solid ${ep.color || cm.accent};border-radius:var(--r-md,7px);padding:${isTask ? "5px 9px" : "6px 10px"};cursor:${dragging ? "grabbing" : "grab"};box-shadow:${isSel || dragging ? "0 8px 24px rgba(20,20,40,.16)" : "var(--shadow)"};user-select:none;display:flex;flex-direction:column;gap:2px;transform:${transform};transition:${dragging ? "none" : "box-shadow .12s"};z-index:${dragging ? 40 : isSel ? 30 : 13};box-sizing:border-box;overflow:hidden`,
        };
      });

      layout.rows.forEach((r) => {
        if (r.kind === "band") relBands.push({ style: `position:absolute;left:${M.LEFT}px;top:${r.top}px;width:${cols.length * COLW}px;height:${r.height}px;background:var(--colalt,#fafafc);opacity:.45;z-index:3` });
      });

      const first = cols[0], last = cols[cols.length - 1];
      layout.rows.forEach((r) => {
        if (r.kind !== "epic" && r.kind !== "feature") return;
        const isFeat = r.kind === "feature";
        // Epic ou Feature avec un vrai work item ADO → intervalle éditable (Start/Target).
        const editable = !!r.item;
        const ch = M.parentCharge(state, r.us || []);
        const rg = r.range;
        if (!rg) return;
        let sReal = rg[0], eReal = rg[1];
        // Aperçu du drag (L/R = redimensionner, M = déplacer).
        if (editable && d && d.mode === "epic" && d.id === r.item!.id) {
          const delta = Math.round(d.dx / COLW);
          if (d.side === "R") eReal = Math.max(sReal, Math.min(last, d.oe + delta));
          else if (d.side === "L") sReal = Math.min(eReal, Math.max(first, d.os + delta));
          else { const span = d.oe - d.os; sReal = Math.max(first, Math.min(last - span, d.os + delta)); eReal = sReal + span; }
        }
        const visS = Math.max(sReal, first), visE = Math.min(eReal, last);
        if (visS > visE) return;
        const leftCol = cols.indexOf(visS), n = visE - visS + 1;
        const barLeft = M.LEFT + leftCol * COLW + 6, barW = n * COLW - 12, barH = 26, barTop = r.top + Math.round((r.height - barH) / 2);
        const segs = [];
        for (let real = visS; real <= visE; real++) {
          const val = ch.per[real] || 0;
          segs.push({
            segStyle: `flex:1;position:relative;border-right:1px solid ${theme === "dark" ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.45)"};display:flex;align-items:center;justify-content:center;background:${r.accent};opacity:${val > 0 ? 1 : 0.32}`,
            fillStyle: "display:none", label: val > 0 ? M.fmt(val) : "",
            // Ombre portée : blanc peu contrasté sur les segments clairs (orange…).
            labelStyle: `position:relative;z-index:1;font-size:10px;font-weight:600;font-family:${mono};color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5)`,
          });
        }
        relEpics.push({
          containerStyle: `position:absolute;left:${barLeft}px;top:${barTop}px;width:${barW}px;height:${barH}px;border:1px solid ${r.accent};border-radius:var(--r-md,7px);overflow:hidden;display:flex;z-index:6${editable ? ";cursor:grab" : ""}${state.hiddenRows[r.key!] ? ";opacity:.4;filter:grayscale(1)" : ""}`,
          segs,
          // Epic/Feature : la barre entière est déplaçable pour décaler l'intervalle.
          onDown: editable ? (e: React.PointerEvent) => startEpicResize(r.item!.id, "M", e) : undefined,
          // Double-clic → pose un flag sur le sprint survolé (colonne sous le curseur).
          onDoubleClick: (e: React.MouseEvent) => { const vi = hitColIdx(e.clientX); addFlag(r.key!, vi != null ? colsRef.current[vi] : rg[0]); },
        });
        // US planifiées hors de l'intervalle du parent : absentes de sa barre.
        // Marqueur pointillé sur leur sprint pour voir la charge qui déborde.
        M.outsideCharge(ch.per, cols, [sReal, eReal]).forEach((o) => {
          relEpics.push({
            containerStyle: `position:absolute;left:${M.LEFT + o.vi * COLW + 6}px;top:${barTop}px;width:${COLW - 12}px;height:${barH}px;border:1.5px dashed ${r.accent};border-radius:var(--r-md,7px);display:flex;z-index:6${state.hiddenRows[r.key!] ? ";opacity:.4;filter:grayscale(1)" : ""}`,
            segs: [{
              segStyle: "flex:1;display:flex;align-items:center;justify-content:center",
              fillStyle: "display:none", label: M.fmt(o.val),
              labelStyle: `font-size:10px;font-weight:600;font-family:${mono};color:${M.tone(r.accent || "#0072B2", theme).text};opacity:.85`,
            }],
            title: t("{val} ({field}) sur {iter}, hors de l'intervalle {from} → {to}", { val: M.fmt(o.val), field: loadLabel, iter: M.iters[o.real].short, from: M.iters[sReal].short, to: M.iters[eReal].short }),
          });
        });
        if (editable) {
          const HW = 15, VW = state.containerW || 1100;
          const barRight = barLeft + barW, vpL = SL + M.LEFT + 6, vpR = SL + VW - 6;
          let rx = Math.min(barRight - HW, vpR - HW); rx = Math.max(rx, barLeft + 30); rx = Math.min(rx, barRight - HW);
          const showR = barLeft < vpR && barRight > vpL;
          const showL = sReal >= first && barLeft + barW > vpL;
          let lx = Math.max(barLeft - 2, vpL); lx = Math.min(lx, barRight - 30 - HW);
          relEpics.push({
            containerStyle: "display:none", segs: [], showL, showR,
            lHandleStyle: `position:absolute;left:${lx}px;top:${barTop}px;width:11px;height:${barH}px;cursor:ew-resize;z-index:18;display:flex;align-items:center;justify-content:center;background:transparent`,
            rHandleStyle: `position:absolute;left:${rx}px;top:${barTop}px;width:11px;height:${barH}px;cursor:ew-resize;z-index:18;display:flex;align-items:center;justify-content:center;background:transparent`,
            gripStyle: "display:none",
            gripChar: "",
            onLeftDown: (e: React.PointerEvent) => startEpicResize(r.item!.id, "L", e),
            onRightDown: (e: React.PointerEvent) => startEpicResize(r.item!.id, "R", e),
          });
        }
      });

      // Plusieurs flags par ligne : on les place chacun sur son sprint (empilés si même sprint).
      const rowByKey = new Map(layout.rows.filter((r) => r.kind === "epic" || r.kind === "feature").map((r) => [r.key, r]));
      const flagStack = new Map<string, number>();
      state.rowPins.forEach((pin) => {
        const r = rowByKey.get(pin.rowKey);
        if (!r) return;
        const vi = cols.indexOf(pin.iter);
        if (vi < 0) return;
        const stackKey = pin.rowKey + ":" + pin.iter;
        const off = flagStack.get(stackKey) || 0;
        flagStack.set(stackKey, off + 1);
        const x = M.LEFT + vi * COLW;
        relRowPins.push({
          title: pin.title,
          lineStyle: `position:absolute;left:${x}px;top:${r.top}px;width:0;height:${r.height}px;border-left:2px solid ${pin.color};z-index:15;pointer-events:none`,
          flagStyle: `position:absolute;left:${x + 3}px;top:${r.top + 6 + off * 20}px;z-index:31;display:flex;align-items:center;gap:4px;background:${pin.color};color:${M.onColor(pin.color)};padding:2px 7px 2px 6px;border-radius:var(--r-sm,5px);font-size:10px;font-weight:600;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2);max-width:${COLW - 10}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`,
          label: t("Flag {title} — {iter}", { title: pin.title, iter: M.iters[pin.iter]?.short ?? "" }),
          onClick: (e?: React.MouseEvent) => { e?.stopPropagation(); setAnnotAnchor(e ? { x: e.clientX, y: e.clientY } : null); setState({ rowPinSel: pin.id, milestoneSel: null }); },
        });
      });

      loadBand = M.relLoadBand(state, cols, theme).map((b, vi) => {
        const left = M.LEFT + vi * COLW, over = b.total > b.cap;
        const denom = Math.max(b.cap, b.total, 1);
        const segs = b.segs.map((s) => ({ style: `width:${(s.val / denom) * 100}%;height:100%;background:${s.color}`, title: `${s.label} · ${M.fmt(s.val)}j` }));
        // Delta capa − effort du sprint (le chiffre de décision) ; colonnes de
        // l'intervalle de métriques soulignées à l'accent.
        const delta = b.cap - b.total;
        const inMet = b.real >= met.from && b.real <= met.to;
        // Bande de charge intégrée au bas du header de colonnes (release garde
        // ainsi la même hauteur de header que les autres pages).
        return {
          // overflow:hidden — les gros nombres sont rognés dans leur colonne au
          // lieu de déborder sur la voisine (tooltip = valeurs complètes).
          wrapStyle: `position:absolute;left:${left}px;top:${M.HEADER - M.RELBAND}px;width:${COLW}px;height:${M.RELBAND}px;padding:4px 12px 8px;border-right:1px solid var(--gridline,#ececf1);box-sizing:border-box;overflow:hidden;z-index:47;background:var(--panel,#fff)${inMet ? ";box-shadow:inset 0 -2px 0 var(--accent,#5b5bd6)" : ""}`,
          wrapTitle: t("Charge {total}j / capacité {cap}j · {sign}{delta}j · {pct}%", { total: M.fmt(b.total), cap: M.fmt(b.cap), sign: delta >= 0 ? "+" : "−", delta: M.fmt(Math.abs(delta)), pct: Math.round((b.total / (b.cap || 1)) * 100) }),
          total: `${M.fmt(b.total)}j`, cap: `/ ${M.fmt(b.cap)}j`,
          totalStyle: `font-size:12px;font-weight:600;font-family:${mono};color:${over ? "var(--color-error-text,#c62828)" : "var(--ink,#1a1a20)"};flex:0 0 auto`,
          // La capacité s'efface en premier quand la place manque.
          capStyle: `font-size:10px;font-family:${mono};color:var(--faint,#71717c);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`,
          delta: (delta >= 0 ? "+" : "−") + M.fmt(Math.abs(delta)),
          deltaStyle: `font-size:10px;font-weight:600;font-family:${mono};color:${delta < 0 ? "var(--color-error-text,#c62828)" : "var(--color-synced-text,#1f8a54)"};flex:0 0 auto`,
          deltaTitle: t("Capacité − effort : {sign}{delta}j", { sign: delta >= 0 ? "+" : "−", delta: M.fmt(Math.abs(delta)) }),
          pct: Math.round((b.total / (b.cap || 1)) * 100) + "%", pctMark: M.loadMark(b.total / (b.cap || 1)),
          pctStyle: `font-size:10px;font-weight:600;font-family:${mono};color:${over ? "var(--color-error-text,#c62828)" : "var(--muted,#6b6b75)"};flex:0 0 auto`,
          trackStyle: `margin-top:3px;height:6px;border-radius:var(--r-sm,5px);background:var(--line2,#f1f1f5);overflow:hidden;display:flex;gap:2px;${over ? "box-shadow:0 0 0 1px var(--color-error,#ef4444)" : ""}`,
          segs,
        };
      });

      // Bandeau de synthèse (header) : Σ capa / Σ effort / delta sur l'intervalle.
      relMetrics = {
        from: String(met.from), to: String(met.to),
        rangeText: metShorts,
        options: M.iters.slice(0, M.NITER).map((it, i) => ({ value: String(i), label: it.short })),
        onFrom: (e: React.ChangeEvent<HTMLSelectElement>) => { const val = Number(e.target.value); setState((s) => ({ metricsFrom: val, metricsTo: Math.max(val, s.metricsTo) })); },
        onTo: (e: React.ChangeEvent<HTMLSelectElement>) => { const val = Number(e.target.value); setState((s) => ({ metricsTo: val, metricsFrom: Math.min(val, s.metricsFrom) })); },
        capText: M.fmt(met.cap) + "j",
        effortText: M.fmt(met.effort) + "j",
        deltaText: (met.delta >= 0 ? "+" : "−") + M.fmt(Math.abs(met.delta)) + "j",
        deltaStyle: `font-size:12px;font-weight:700;font-family:${mono};color:${met.delta < 0 ? "var(--color-error-text,#c62828)" : "var(--color-synced-text,#1f8a54)"}`,
        pctText: Math.round((met.effort / (met.cap || 1)) * 100) + "%",
        title: t("{range} · capacité {cap}j − effort {effort}j (charge en {field}{note} · personnes visibles, lignes masquées exclues)", { range: metShorts, cap: M.fmt(met.cap), effort: M.fmt(met.effort), field: loadLabel, note: loadNote }),
      };

      state.milestones.forEach((m) => {
        const vi = cols.indexOf(m.iter);
        if (vi < 0) return;
        const x = M.LEFT + vi * COLW;
        const selM = state.milestoneSel === m.id;
        milestones.push({
          title: m.title,
          lineStyle: `position:absolute;left:${x}px;top:${M.HEADER}px;width:0;height:${TH - M.HEADER}px;border-left:2px dashed ${m.color};z-index:14;pointer-events:none`,
          flagStyle: `position:absolute;left:${x + 4}px;top:${M.HEADER + 6}px;z-index:30;display:flex;align-items:center;gap:5px;background:${m.color};color:${M.onColor(m.color)};padding:3px 8px 3px 7px;border-radius:var(--r-md,7px);font-size:11px;font-weight:600;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.18);${selM ? "outline:2px solid var(--panel,#fff);outline-offset:1px" : ""}`,
          label: t("Jalon {title} — {iter}", { title: m.title, iter: M.iters[m.iter]?.short ?? "" }),
          onClick: (e?: React.MouseEvent) => { e?.stopPropagation(); setAnnotAnchor(selM || !e ? null : { x: e.clientX, y: e.clientY }); setState({ milestoneSel: selM ? null : m.id, rangeOpen: false, peopleOpen: false }); },
        });
      });
    }

    const milestoneSelObj = release ? state.milestones.find((m) => m.id === state.milestoneSel) : null;
    const milestoneEditor = milestoneSelObj
      ? {
          title: milestoneSelObj.title, onTitle: (e: React.ChangeEvent<HTMLInputElement>) => setMilestone(milestoneSelObj.id, "title", e.target.value),
          iter: String(milestoneSelObj.iter), onIter: (e: React.ChangeEvent<HTMLSelectElement>) => setMilestone(milestoneSelObj.id, "iter", Number(e.target.value)),
          iterOptions: M.iters.slice(0, M.NITER).map((it, i) => ({ value: String(i), label: it.label })),
          colors: ["#D55E00", "#0072B2", "#009E73", "#CC79A7", "#E69F00"].map((c) => ({
            onClick: () => setMilestone(milestoneSelObj.id, "color", c),
            label: ANNOT_COLORS[c] ? t(ANNOT_COLORS[c]) : c,
            selected: c === milestoneSelObj.color,
            style: `width:24px;height:24px;border-radius:var(--r-md,7px);padding:0;background:${c};cursor:pointer;border:2px solid ${c === milestoneSelObj.color ? "var(--ink,#1a1a20)" : "transparent"}`,
          })),
          onRemove: () => removeMilestone(milestoneSelObj.id),
          onClose: () => setState({ milestoneSel: null }),
        }
      : null;
    const rowPinSrc = release && state.rowPinSel ? state.rowPins.find((p) => p.id === state.rowPinSel) : null;
    const rowPinEditor = rowPinSrc
      ? {
          title: rowPinSrc.title, onTitle: (e: React.ChangeEvent<HTMLInputElement>) => setFlag(rowPinSrc.id, "title", e.target.value),
          iter: String(rowPinSrc.iter), onIter: (e: React.ChangeEvent<HTMLSelectElement>) => setFlag(rowPinSrc.id, "iter", Number(e.target.value)),
          iterOptions: M.iters.slice(0, M.NITER).map((it, i) => ({ value: String(i), label: it.label })),
          colors: ["#E69F00", "#D55E00", "#0072B2", "#009E73", "#CC79A7"].map((c) => ({
            onClick: () => setFlag(rowPinSrc.id, "color", c),
            label: ANNOT_COLORS[c] ? t(ANNOT_COLORS[c]) : c,
            selected: c === rowPinSrc.color,
            style: `width:24px;height:24px;border-radius:var(--r-md,7px);padding:0;background:${c};cursor:pointer;border:2px solid ${c === rowPinSrc.color ? "var(--ink,#1a1a20)" : "transparent"}`,
          })),
          onRemove: () => removeFlag(rowPinSrc.id),
          onClose: () => setState({ rowPinSel: null }),
        }
      : null;

    // Champs ADO custom numériques présents sur les tickets — proposés comme
    // champ de charge en plus des champs mappés (Story Points / jours).
    const customLoadFields = (() => {
      const seen = new Map<string, string>();
      state.items.forEach((it) => {
        Object.entries(it.custom || {}).forEach(([k, val]) => {
          if (typeof val === "number" && !seen.has(k)) seen.set(k, k.split(".").pop() || k);
        });
      });
      return [...seen].map(([value, label]) => ({ value, label }));
    })();

    // Champs ADO custom portés par les Epics — proposés comme axes de tri Release.
    const epicCustomSorts = (() => {
      const seen = new Map<string, string>();
      state.items.forEach((it) => {
        if (it.level !== "epic") return;
        Object.entries(it.custom || {}).forEach(([k, val]) => {
          if (val !== null && val !== "" && !seen.has(k)) seen.set(k, k.split(".").pop() || k);
        });
      });
      return [...seen].map(([value, label]) => ({ value, label }));
    })();

    const sortAxis = SORT_AXES.find((a) => a.asc === state.sort || a.desc === state.sort) || SORT_AXES[0];
    const sortAsc = state.sort !== sortAxis.desc;

    // « Non assigné » est une ligne du board, pas un membre : exclu des compteurs.
    const members = M.people.filter((p) => !p.unassigned);
    const visiblePeople = members.filter((p) => !state.hidden[p.id]).length;

    // Inactifs : aucun ticket depuis 3 sprints, ni sur un sprint à venir.
    const activeIds = M.activePersonIds(state.items);
    const personRow = (p: M.Person) => ({
      name: p.name, role: p.role, checked: !state.hidden[p.id],
      dotStyle: `width:24px;height:24px;border-radius:50%;background:${p.color};color:${M.onColor(p.color)};font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:0 0 auto`,
      initials: p.initials,
      // `false` explicite (et non suppression) : marque le choix de l'utilisateur.
      onToggle: (e: React.ChangeEvent<HTMLInputElement>) => setState({ hidden: { ...state.hidden, [p.id]: !e.target.checked } }),
    });
    return {
      rootStyle: { position: "relative" as const, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" as const, fontFamily: "'IBM Plex Sans',system-ui,sans-serif", background: "var(--canvas)", color: "var(--ink)", overflow: "hidden" },
      totalWidth: TW, totalHeight: TH, columns, personRows, banners, bars, dropGhost, cursors, presence, onlineLabel, emptyAreaStyle,
      loadWarning: loadFieldDead ? t("charge à 0") : null,
      loadWarningTitle: t("Aucun ticket affiché n'a de valeur « {field} » : les jauges de charge affichent 0. Choisissez un autre champ dans le menu Charge ou renseignez les valeurs dans Azure DevOps.", { field: loadLabel }),
      // Fond opaque pleine hauteur sous les cellules du panneau gauche : masque les
      // barres qui défilent dessous (les lignes masquées sont en opacity:.45).
      leftPanelStyle: `position:absolute;left:0;top:0;width:${M.LEFT}px;height:${TH}px;background:var(--panel,#fff);border-right:1px solid var(--line,#e8e8ee);box-sizing:border-box`,
      leftHeaderStyle: `position:absolute;top:0;left:0;width:${M.LEFT}px;height:${M.HEADER}px;padding:11px 14px;border-bottom:1px solid var(--line,#e8e8ee);border-right:1px solid var(--line,#e8e8ee);background:var(--panel,#fff);z-index:48;box-sizing:border-box`,
      currentLabel: M.iters[M.CURRENT].label, currentDates: M.iters[M.CURRENT].dates,
      levels,
      isDaily: daily,
      sortValue: sortAxis.value,
      sortOptions: SORT_AXES.map(({ value, label }) => ({ value, label: t(label) })),
      onSort: (e: React.ChangeEvent<HTMLSelectElement>) => {
        const ax = SORT_AXES.find((a) => a.value === e.target.value)!;
        if (ax.value === "random") M.resetRandOrder();
        setState({ sort: sortAsc ? ax.asc : ax.desc });
      },
      sortAsc,
      showSortDir: sortAxis.value !== "random",
      onSortDir: () => setState({ sort: sortAsc ? sortAxis.desc : sortAxis.asc }),
      onShuffle: () => { M.resetRandOrder(); setState({ sort: "random" }); },
      shuffleStyle: `width:28px;height:28px;flex:0 0 auto;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center`,
      peopleOpen: state.peopleOpen,
      onPeopleToggle: (e: React.MouseEvent) => { e.stopPropagation(); setState((s) => ({ peopleOpen: !s.peopleOpen, rangeOpen: false, prefsOpen: false })); },
      loadFieldValue: prefs.loadField,
      loadFieldOptions: (() => {
        const opts = [
          { value: "points", label: "Story Points" },
          { value: "effortDays", label: t("Estimation (jours)") },
          ...customLoadFields,
        ];
        // Préférence sauvegardée sur un champ absent des tickets chargés : on la
        // garde visible dans le select plutôt que d'afficher une valeur vide.
        if (!opts.some((o) => o.value === prefs.loadField))
          opts.push({ value: prefs.loadField, label: prefs.loadField.split(".").pop() || prefs.loadField });
        return opts;
      })(),
      onLoadField: (e: React.ChangeEvent<HTMLSelectElement>) => updatePrefs({ loadField: e.target.value as M.LoadField }),
      peopleLabel: `${visiblePeople}/${members.length}`,
      peopleList: M.people.filter((p) => activeIds.has(p.id)).map(personRow),
      peopleInactive: M.people.filter((p) => !activeIds.has(p.id)).map(personRow),
      onShowAllPeople: () => setState({ hidden: Object.fromEntries(M.people.map((p) => [p.id, false])) }),
      onHideAllPeople: () => setState({ hidden: Object.fromEntries(M.people.map((p) => [p.id, true])) }),
      onPeopleClose: () => setState({ peopleOpen: false }),
      boardTabs: [{ key: "me", label: "@me" }, { key: "daily", label: "Daily" }, { key: "sprint", label: "Sprint Planning" }, { key: "release", label: "Release Planning" }].map((t) => {
        const active = state.board === t.key;
        return { label: t.label, onClick: () => setState({ board: t.key as State["board"], selectedId: null, rangeOpen: false, peopleOpen: false }), style: `padding:6px 14px;border-radius:var(--r-md,7px);border:none;font-size:13px;font-weight:${active ? 600 : 500};cursor:pointer;white-space:nowrap;background:${active ? "var(--panel,#fff)" : "transparent"};color:${active ? "var(--ink,#1a1a20)" : "var(--muted,#6b6b75)"};box-shadow:${active ? "0 1px 2px rgba(20,20,40,.12)" : "none"}` };
      }),
      isRelease: release, showSort: !release, showGranularity: !release, isMe,
      leftKicker: release ? t("Projet") : t("Équipe"),
      leftTitle: release ? t("Arborescence") : t(visiblePeople > 1 ? "{n} personnes" : "{n} personne", { n: visiblePeople }),
      loadByValue: state.loadBy,
      loadByOptions: [{ value: "person", label: t("Personne") }, { value: "role", label: t("Poste") }, { value: "none", label: t("Global") }],
      onLoadBy: (e: React.ChangeEvent<HTMLSelectElement>) => setState({ loadBy: e.target.value as State["loadBy"] }),
      treeRows, loadBand, milestones, milestoneEditor,
      relCards, relBands, relEpics, relRowPins, rowPinEditor, relMetrics,
      // Assigné dans le .map des lignes (invisible pour le narrowing TS).
      relWaterline: relWaterline as Record<string, string> | null,
      onAddMilestone: () => addMilestone(),
      epicSort: state.epicSort,
      epicSortOptions: [{ value: "priority", label: t("Priorité") }, { value: "name", label: t("Nom") }, { value: "effort", label: t("Somme de l'effort") }, ...epicCustomSorts],
      onEpicSort: (e: React.ChangeEvent<HTMLSelectElement>) => setState({ epicSort: e.target.value }),
      epicSortDir: state.epicSortDir,
      onEpicSortDir: () => setState((s) => ({ epicSortDir: s.epicSortDir === "asc" ? "desc" : "asc" })),
      epicFilter: state.epicFilter,
      epicFilterOptions: [{ value: "all", label: t("Tous les epics") }, { value: "hideDone", label: t("Masquer terminés") }, { value: "activeOnly", label: t("Actifs seulement") }],
      onEpicFilter: (e: React.ChangeEvent<HTMLSelectElement>) => setState({ epicFilter: e.target.value as State["epicFilter"] }),
      rangeLabel, range, rangeOpen: state.rangeOpen,
      rangeBtnStyle: `height:30px;padding:0 12px;border-radius:var(--r-md,7px);border:1px solid ${state.rangeOpen ? "var(--accent,#5b5bd6)" : "var(--line,#e8e8ee)"};background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:7px;white-space:nowrap;flex:0 0 auto`,
      onRangeToggle: (e: React.MouseEvent) => { e.stopPropagation(); setState((s) => ({ rangeOpen: !s.rangeOpen, peopleOpen: false, prefsOpen: false })); },
      syncLabel: syncing ? t("Sync…") : t("ADO sync."), syncStyle, syncDotStyle,
      syncTitle: syncing ? t("Synchronisation Azure DevOps en cours…") : t("Azure DevOps synchronisé"),
      themeTitle: theme === "dark" ? t("Passer en thème clair") : t("Passer en thème sombre"), themeIcon: theme === "dark" ? "☀" : "☾",
      onToggleTheme: () => toggleTheme(),
      onScrollRef, onCanvasRef,
      onBgClick: () => { setPersonSel(null); setUserMenuOpen(false); setState({ selectedId: null, rangeOpen: false, peopleOpen: false, prefsOpen: false }); },
      stop: (e: React.MouseEvent) => e.stopPropagation(),
      selected: !!item, insp, personPanel, capMatrix, toast: state.toast,
      onCapMatrixToggle: (e: React.MouseEvent) => { e.stopPropagation(); setCapMatrixOpen((o) => !o); setState({ peopleOpen: false, rangeOpen: false, prefsOpen: false }); },
      labelCss: "font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint,#71717c);margin-bottom:7px",
      selectCss: "width:100%;height:36px;padding:0 10px;border-radius:var(--r-lg,9px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:13px;cursor:pointer;outline:none",
      inputCss: `width:100%;height:36px;padding:0 10px;border-radius:var(--r-lg,9px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:13px;font-family:${mono};outline:none;box-sizing:border-box`,
      stepperCss: "display:flex;align-items:center;height:36px;border:1px solid var(--line,#e8e8ee);border-radius:var(--r-lg,9px);background:var(--panel2,#fafafc);overflow:hidden",
      stepInputCss: `flex:1;min-width:0;width:100%;text-align:center;border:none;background:transparent;font-size:14px;font-weight:600;font-family:${mono};color:var(--ink,#1a1a20);outline:none`,
      stepBtnCss: "width:34px;height:100%;border:none;background:transparent;color:var(--muted,#6b6b75);font-size:17px;cursor:pointer;flex:0 0 auto",
    };
  }

  // ===================== render =====================
  // Éditeur jalon/flag ancré près de sa cible (position du clic), clampé au viewport.
  // Fallback en haut à droite si aucune ancre (ex. ouverture au clavier).
  const annotEditorStyle = annotAnchor
    ? `position:fixed;left:${Math.min(annotAnchor.x + 10, window.innerWidth - 306)}px;top:${Math.min(annotAnchor.y + 6, window.innerHeight - 300)}px;width:288px;background:var(--panel,#fff);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-xl,11px);box-shadow:0 12px 34px rgba(20,20,40,.16);z-index:92;padding:15px 16px;animation:ggdrop .14s ease`
    : "position:absolute;top:104px;right:18px;width:288px;background:var(--panel,#fff);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-xl,11px);box-shadow:0 12px 34px rgba(20,20,40,.16);z-index:92;padding:15px 16px;animation:ggdrop .14s ease";
  // Ligne du popover Personnes (partagée actifs / inactifs).
  const personLine = (p: (typeof v.peopleList)[number], key: number) => (
    <label key={key} style={C("display:flex;align-items:center;gap:10px;padding:5px 0;cursor:pointer")}>
      <input type="checkbox" checked={p.checked} onChange={p.onToggle} style={C("width:15px;height:15px;accent-color:var(--accent,#5b5bd6);cursor:pointer;flex:0 0 auto")} />
      <div style={C(p.dotStyle)}>{p.initials}</div>
      <div style={C("line-height:1.2;min-width:0")}>
        <div style={C("font-size:13px;font-weight:500;color:var(--ink,#1a1a20)")}>{p.name}</div>
        <div style={C("font-size:11px;color:var(--muted,#6b6b75)")}>{p.role}</div>
      </div>
    </label>
  );
  // Popover « Personnes », rendu sous son bouton (ligne 1 du header).
  const peoplePopover = (
    <>
      <div onClick={v.onPeopleClose} style={C("position:fixed;inset:0;z-index:89")} />
      {/* role="dialog" sans aria-modal : le fond reste atteignable au clavier
          (pas de piège de focus), l'annoncer comme modal serait faux. */}
      <div onClick={v.stop} ref={focusPopover} tabIndex={-1} role="dialog" aria-label={t("Personnes affichées")} style={C("position:absolute;top:38px;right:0;width:266px;background:var(--panel,#fff);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-xl,11px);box-shadow:0 12px 34px rgba(20,20,40,.16);z-index:90;padding:14px 15px;animation:ggdrop .14s ease;outline:none")}>
        <div style={C("display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px")}>
          <span style={C("font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint,#71717c)")}>{t("Personnes affichées")}</span>
          <div style={C("display:flex;gap:10px;flex:0 0 auto")}>
            <button onClick={v.onShowAllPeople} style={C("border:none;background:none;color:var(--accent,#5b5bd6);font-size:11px;font-weight:500;cursor:pointer;padding:0")}>{t("Tout afficher")}</button>
            <button onClick={v.onHideAllPeople} style={C("border:none;background:none;color:var(--muted,#6b6b75);font-size:11px;font-weight:500;cursor:pointer;padding:0")}>{t("Tout désélectionner")}</button>
          </div>
        </div>
        <div style={C("max-height:52vh;overflow-y:auto;margin:0 -15px;padding:0 15px")}>
        {v.peopleList.map(personLine)}
        {v.peopleInactive.length > 0 && (
          <details style={C("margin-top:6px;border-top:1px solid var(--line,#e8e8ee);padding-top:6px")}>
            <summary style={C("font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint,#71717c);cursor:pointer;padding:3px 0;list-style:none")}>
              {t("Inactifs ({n})", { n: v.peopleInactive.length })} <span style={C("opacity:.6;font-size:9px")}>▾</span>
            </summary>
            {v.peopleInactive.map(personLine)}
          </details>
        )}
        </div>
      </div>
    </>
  );

  return (
    <div style={v.rootStyle}>
      {/* Header row 1 */}
      <div style={C("height:54px;flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:0 18px;border-bottom:1px solid var(--line,#e8e8ee);background:var(--panel,#fff);position:relative;z-index:70")}>
        <Brand size={24} />
        <div style={C("display:flex;flex:0 0 auto;background:var(--panel2,#fafafc);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-lg,9px);padding:2px;gap:2px")}>
          {v.boardTabs.map((t) => (
            <button key={t.label} onClick={t.onClick} style={C(t.style)}>{t.label}</button>
          ))}
        </div>
        <div style={C("width:1px;height:22px;flex:0 0 auto;background:var(--line,#e8e8ee)")} />
        {/* Bloc rétrécissable (ellipse) : le header tient sur une ligne aux petites largeurs. */}
        <div style={C("display:flex;align-items:center;gap:8px;min-width:0;flex:0 1 auto")}>
          <div style={C("width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:var(--accent,#5b5bd6);box-shadow:0 0 0 3px var(--accentsoft,#ececfb)")} />
          <div style={C("line-height:1.2;min-width:0")}>
            <div style={C("font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint,#71717c);white-space:nowrap")}>{t("Itération courante")}</div>
            <div style={C("font-size:13px;font-weight:600;color:var(--ink,#1a1a20);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{v.currentLabel} <span style={C("font-weight:400;color:var(--muted,#6b6b75);font-family:'IBM Plex Mono',monospace;font-size:11px")}>· {v.currentDates}</span></div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Filtres communs à tous les boards (sauf @me, liste personnelle) :
            en ligne 1 pour désencombrer la barre d'outils. */}
        {!v.isMe && (
          <>
            {/* Popover rendu dans le wrapper du bouton : il s'ouvre sous lui. */}
            <div style={C("position:relative;flex:0 0 auto")}>
              <button onClick={v.onPeopleToggle} style={C("height:30px;padding:0 11px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap")}>
                <span style={C("opacity:.7;display:flex")}><IconUsers size={13} /></span> {t("Personnes")} {v.peopleLabel} <span style={C("opacity:.5;font-size:9px")}>▾</span>
              </button>
              {v.peopleOpen && peoplePopover}
            </div>
            <button onClick={v.onCapMatrixToggle} title={t("Matrice de capacité — tous les membres × itérations")} style={C("height:30px;padding:0 11px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;flex:0 0 auto")}><IconGrid size={13} /> {t("Capacités")}</button>
            <div style={C("width:1px;height:22px;flex:0 0 auto;background:var(--line,#e8e8ee)")} />
          </>
        )}
        <div title={v.syncTitle} style={C(v.syncStyle)}>
          <div style={C(v.syncDotStyle)} />
          <span style={C("overflow:hidden;text-overflow:ellipsis")}>{v.syncLabel}</span>
        </div>
        <div style={C("width:1px;height:22px;flex:0 0 auto;background:var(--line,#e8e8ee)")} />
        <div style={C("display:flex;align-items:center;gap:9px;flex:0 0 auto")}>
          <div style={{ display: "flex" }}>
            {v.presence.map((p, i) => (
              <div key={i} style={C(p.style)} title={p.name}>{p.initials}</div>
            ))}
          </div>
          <span style={C("font-size:12px;color:var(--muted,#6b6b75);white-space:nowrap")}>{v.onlineLabel}</span>
        </div>
        <div style={C("width:1px;height:22px;flex:0 0 auto;background:var(--line,#e8e8ee)")} />
        <button onClick={v.onToggleTheme} title={v.themeTitle} aria-label={v.themeTitle} style={C("width:30px;height:30px;flex:0 0 auto;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center")}>{v.themeIcon}</button>
        <LangToggle />
        {user && (
          <div style={C("width:1px;height:22px;background:var(--line,#e8e8ee)")} />
        )}
        {user && (
          <div style={{ position: "relative" }}>
            <button
              onClick={(e) => { e.stopPropagation(); setUserMenuOpen((o) => !o); }}
              style={C("height:30px;padding:0 10px 0 4px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:7px")}
            >
              <span style={C(`width:22px;height:22px;border-radius:50%;background:${myColor};color:${M.onColor(myColor)};font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:0 0 auto`)}>{initials(user.displayName)}</span>
              <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName}</span>
              <span style={C("opacity:.5;font-size:9px")}>▾</span>
            </button>
            {userMenuOpen && (
              <>
              <div onClick={() => setUserMenuOpen(false)} style={C("position:fixed;inset:0;z-index:89")} />
              <div onClick={(e) => e.stopPropagation()} ref={focusPopover} tabIndex={-1} role="dialog" aria-label={t("Menu du compte")} style={C("position:absolute;top:38px;right:0;width:250px;background:var(--panel,#fff);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-xl,11px);box-shadow:0 12px 34px rgba(20,20,40,.16);z-index:90;padding:6px;animation:ggdrop .14s ease;outline:none")}>
                <div style={C("padding:8px 10px 10px")}>
                  <div style={C("font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint,#71717c)")}>{t("Connecté en tant que")}</div>
                  <div style={C("font-size:13px;font-weight:600;color:var(--ink,#1a1a20);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{user.displayName}</div>
                </div>
                <div style={C("height:1px;background:var(--line,#e8e8ee);margin:2px 0")} />
                {realSession && (
                  <button onClick={copyInvite} style={C("width:100%;text-align:left;padding:9px 10px;border:none;border-radius:var(--r-md,7px);background:transparent;color:var(--ink,#1a1a20);font-size:13px;cursor:pointer;display:flex;align-items:center;gap:9px")}>
                    <span style={C("opacity:.7;display:flex")}><IconUsers size={13} /></span> {t("Copier le lien d'invitation")}
                  </button>
                )}
                <button onClick={exitSession} style={C("width:100%;text-align:left;padding:9px 10px;border:none;border-radius:var(--r-md,7px);background:transparent;color:var(--ink,#1a1a20);font-size:13px;cursor:pointer;display:flex;align-items:center;gap:9px")}>
                  <span style={C("opacity:.7;display:flex")}><IconSwap size={13} /></span> {t("Changer de projet")}
                </button>
                <button onClick={logout} style={C("width:100%;text-align:left;padding:9px 10px;border:none;border-radius:var(--r-md,7px);background:transparent;color:var(--color-error,#ef4444);font-size:13px;cursor:pointer;display:flex;align-items:center;gap:9px")}>
                  <span style={C("opacity:.7;display:flex")}><IconLogout size={13} /></span> {t("Se déconnecter")}
                </button>
              </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Header row 2 — défile horizontalement aux petites largeurs (ses popovers
          sont rendus au niveau racine, donc jamais rognés par l'overflow).
          Masquée sur @me : aucun de ces réglages (granularité, tri, intervalle)
          ne s'applique à une liste de tickets personnelle. */}
      <div style={C(`height:46px;flex:0 0 auto;display:${v.isMe ? "none" : "flex"};align-items:center;gap:14px;padding:0 18px;border-bottom:1px solid var(--line,#e8e8ee);background:var(--panel,#fff);position:relative;z-index:60;overflow-x:auto;overflow-y:hidden`)}>
        {v.showGranularity && (
          <>
            <span style={C("font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint,#71717c)")}>{t("Granularité")}</span>
            <div style={C("display:flex;background:var(--panel2,#fafafc);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-lg,9px);padding:2px;gap:2px")}>
              {v.levels.map((l) => (
                <button key={l.label} onClick={l.onClick} style={C(l.style)}>{l.label}</button>
              ))}
            </div>
          </>
        )}
        {/* Bandeau Σ rétrécissable : de gros totaux ne poussent plus le reste de
            la barre hors écran — l'intervalle s'ellipse d'abord, tooltip complet. */}
        {v.isRelease && v.relMetrics && (
          <div title={v.relMetrics.title} style={C("height:30px;display:flex;align-items:center;gap:8px;padding:0 11px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);flex:0 1 auto;min-width:0;overflow:hidden")}>
            <span style={C("font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--muted,#6b6b75);white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis")}>{v.relMetrics.rangeText}</span>
            <span style={C("font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--faint,#71717c)")}>{t("Capa")}</span>
            <span style={C(`font-size:12px;font-weight:600;font-family:${"'IBM Plex Mono',monospace"};color:var(--ink,#1a1a20)`)}>{v.relMetrics.capText}</span>
            <span style={C("font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--faint,#71717c)")}>{t("Effort")}</span>
            <span style={C(`font-size:12px;font-weight:600;font-family:${"'IBM Plex Mono',monospace"};color:var(--ink,#1a1a20)`)}>{v.relMetrics.effortText}</span>
            <span style={C(v.relMetrics.deltaStyle)}>{v.relMetrics.deltaText}</span>
            <span style={C("font-size:10px;font-weight:600;font-family:'IBM Plex Mono',monospace;color:var(--muted,#6b6b75)")}>{v.relMetrics.pctText}</span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <span style={C("font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint,#71717c)")}>{t("Charge")}</span>
        <select value={v.loadFieldValue} onChange={v.onLoadField} aria-label={t("Champ de charge")} title={t("Champ utilisé pour les jauges de charge et le tri « Charge »")} style={C("height:30px;padding:0 8px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:12px;cursor:pointer;outline:none")}>
          {v.loadFieldOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {v.loadWarning && <span role="img" aria-label={`${v.loadWarning} — ${v.loadWarningTitle}`} title={v.loadWarningTitle} style={C("display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--color-pending-text,#8a5a00);white-space:nowrap;cursor:help")}><IconAlert size={12} />{v.loadWarning}</span>}
        {v.isRelease && (
          <>
            <div style={C("width:1px;height:20px;background:var(--line,#e8e8ee)")} />
            <button onClick={v.onAddMilestone} style={C("height:30px;padding:0 12px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px")}><IconMilestone size={12} /> {t("Jalon")}</button>
          </>
        )}
        {/* Bouton du popover d'affichage, à droite comme le popover qu'il ouvre. */}
        {(v.isRelease || !v.isDaily) && (
          <>
            <div style={C("width:1px;height:20px;background:var(--line,#e8e8ee)")} />
            <button onClick={v.onRangeToggle} style={C(v.rangeBtnStyle)}>
              <span style={C("opacity:.7;display:flex")}>{v.isRelease ? <IconGear size={13} /> : <IconCalendar size={13} />}</span> {v.isRelease ? t("Vue") : v.rangeLabel} <span style={C("opacity:.5;font-size:9px")}>▾</span>
            </button>
          </>
        )}
      </div>

      {/* Range popover */}
      {v.rangeOpen && (
        <>
        <div onClick={() => setState({ rangeOpen: false })} style={C("position:fixed;inset:0;z-index:89")} />
        <div onClick={v.stop} ref={focusPopover} tabIndex={-1} role="dialog" aria-label={v.range.isRelease ? t("Réglages d'affichage") : t("Intervalle d'itérations affiché")} style={C("position:absolute;top:104px;right:18px;width:340px;background:var(--panel,#fff);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-xl,11px);box-shadow:0 12px 34px rgba(20,20,40,.16);z-index:90;padding:15px 16px;animation:ggdrop .14s ease;outline:none")}>
          {v.range.showRange && (
            <>
              <div style={C("font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint,#71717c);margin-bottom:11px")}>{t("Intervalle d'itérations affiché")}</div>
              <div style={C("display:flex;flex-direction:column;gap:10px")}>
                <div>
                  <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin-bottom:5px")}>{t("De")}</div>
                  <select value={v.range.from} onChange={v.range.onFrom} aria-label={t("Première itération affichée")} style={C(v.selectCss)}>
                    {v.range.iterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin-bottom:5px")}>{t("À")}</div>
                  <select value={v.range.to} onChange={v.range.onTo} aria-label={t("Dernière itération affichée")} style={C(v.selectCss)}>
                    {v.range.iterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <label style={C("display:flex;align-items:center;gap:8px;margin-top:13px;cursor:pointer;font-size:13px;color:var(--ink,#1a1a20)")}>
                <input type="checkbox" checked={v.range.backlog} onChange={v.range.onBacklog} style={C("width:15px;height:15px;accent-color:var(--accent,#5b5bd6);cursor:pointer")} />
                {t("Inclure le backlog")}
              </label>
            </>
          )}
          {v.range.isRelease && (
            <>
              <div style={C("font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint,#71717c);margin-bottom:11px")}>{t("Affichage")}</div>
              <div style={C("display:flex;flex-direction:column;gap:10px;margin-bottom:13px")}>
                <div>
                  <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin-bottom:5px")}>{t("Charge par")}</div>
                  <select value={v.loadByValue} onChange={v.onLoadBy} aria-label={t("Regroupement de la charge")} style={C(v.selectCss)}>
                    {v.loadByOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin-bottom:5px")}>{t("Filtre epics")}</div>
                  <select value={v.epicFilter} onChange={v.onEpicFilter} aria-label={t("Filtre des epics")} style={C(v.selectCss)}>
                    {v.epicFilterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {v.relMetrics && (
                  <div>
                    <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin-bottom:5px")}>{t("Intervalle des métriques")}</div>
                    <div style={C("display:flex;align-items:center;gap:8px")}>
                      <select value={v.relMetrics.from} onChange={v.relMetrics.onFrom} aria-label={t("Début de l'intervalle des métriques")} style={C(v.selectCss)}>
                        {v.relMetrics.options.map((o: { value: string; label: string }) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <span style={C("font-size:11px;color:var(--faint,#71717c);flex:0 0 auto")}>→</span>
                      <select value={v.relMetrics.to} onChange={v.relMetrics.onTo} aria-label={t("Fin de l'intervalle des métriques")} style={C(v.selectCss)}>
                        {v.relMetrics.options.map((o: { value: string; label: string }) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
              <div style={C("font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint,#71717c);margin-bottom:9px")}>{t("Vue long terme")}</div>
              <div style={C("font-size:12px;line-height:1.45;color:var(--muted,#6b6b75);margin-bottom:11px")}>{t("Toutes les itérations sont affichées. Défilez horizontalement pour naviguer ; la vue démarre sur l'itération courante. Double-cliquez sur une ligne ou une barre pour poser un flag.")}</div>
              <button onClick={v.range.onGoCurrent} style={C("width:100%;height:32px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:12px;font-weight:500;cursor:pointer")}>{t("Aller à l'itération courante")}</button>
            </>
          )}
          <label style={C("display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;font-size:13px;color:var(--ink,#1a1a20)")}>
            <input type="checkbox" checked={v.range.hideClosed} onChange={v.range.onHideClosed} style={C("width:15px;height:15px;accent-color:var(--accent,#5b5bd6);cursor:pointer")} />
            {t("Masquer les tickets fermés")}
          </label>
          {v.range.hasPast && (
            <button onClick={v.range.onReset} style={C("margin-top:10px;width:100%;height:32px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--muted,#6b6b75);font-size:12px;font-weight:500;cursor:pointer")}>{t("Revenir à l'itération courante")}</button>
          )}
        </div>
        </>
      )}


      {/* Flag editor */}
      {v.rowPinEditor && (
        <>
        <div onClick={() => { setAnnotAnchor(null); v.rowPinEditor!.onClose(); }} style={C("position:fixed;inset:0;z-index:91")} />
        <div onClick={v.stop} ref={focusPopover} tabIndex={-1} role="dialog" aria-label={t("Éditer le flag")} style={C(annotEditorStyle + ";outline:none")}>
          <div style={C("display:flex;align-items:center;justify-content:space-between;margin-bottom:11px")}>
            <span style={C("font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint,#71717c)")}><IconFlag size={11} /> {t("Flag")}</span>
            <button onClick={v.rowPinEditor.onClose} aria-label={t("Fermer")} style={C("width:24px;height:24px;border-radius:var(--r-md,7px);border:none;background:var(--line2,#f1f1f5);color:var(--muted,#6b6b75);cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center")}><IconClose size={13} /></button>
          </div>
          <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin-bottom:5px")}>{t("Libellé")}</div>
          <input value={v.rowPinEditor.title} onChange={v.rowPinEditor.onTitle} style={C(v.inputCss)} />
          <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin:11px 0 5px")}>{t("Sprint")}</div>
          <select value={v.rowPinEditor.iter} onChange={v.rowPinEditor.onIter} style={C(v.selectCss)}>
            {v.rowPinEditor.iterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin:11px 0 6px")}>{t("Couleur")}</div>
          <div style={C("display:flex;gap:8px")}>
            {v.rowPinEditor.colors.map((c, i) => <button key={i} type="button" onClick={c.onClick} aria-label={c.label} aria-pressed={c.selected} style={C(c.style)} />)}
          </div>
          <button onClick={v.rowPinEditor.onRemove} style={C("margin-top:14px;width:100%;height:32px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--color-error,#ef4444);font-size:12px;font-weight:500;cursor:pointer")}>{t("Supprimer le flag")}</button>
        </div>
        </>
      )}

      {/* Milestone editor */}
      {v.milestoneEditor && (
        <>
        <div onClick={() => { setAnnotAnchor(null); v.milestoneEditor!.onClose(); }} style={C("position:fixed;inset:0;z-index:91")} />
        <div onClick={v.stop} ref={focusPopover} tabIndex={-1} role="dialog" aria-label={t("Éditer le jalon")} style={C(annotEditorStyle + ";outline:none")}>
          <div style={C("display:flex;align-items:center;justify-content:space-between;margin-bottom:11px")}>
            <span style={C("font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint,#71717c)")}><IconMilestone size={11} /> {t("Jalon")}</span>
            <button onClick={v.milestoneEditor.onClose} aria-label={t("Fermer")} style={C("width:24px;height:24px;border-radius:var(--r-md,7px);border:none;background:var(--line2,#f1f1f5);color:var(--muted,#6b6b75);cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center")}><IconClose size={13} /></button>
          </div>
          <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin-bottom:5px")}>{t("Titre")}</div>
          <input value={v.milestoneEditor.title} onChange={v.milestoneEditor.onTitle} style={C(v.inputCss)} />
          <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin:11px 0 5px")}>{t("À partir de l'itération")}</div>
          <select value={v.milestoneEditor.iter} onChange={v.milestoneEditor.onIter} style={C(v.selectCss)}>
            {v.milestoneEditor.iterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div style={C("font-size:11px;color:var(--muted,#6b6b75);margin:11px 0 6px")}>{t("Couleur")}</div>
          <div style={C("display:flex;gap:8px")}>
            {v.milestoneEditor.colors.map((c, i) => <button key={i} type="button" onClick={c.onClick} aria-label={c.label} aria-pressed={c.selected} style={C(c.style)} />)}
          </div>
          <button onClick={v.milestoneEditor.onRemove} style={C("margin-top:14px;width:100%;height:32px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--color-error,#ef4444);font-size:12px;font-weight:500;cursor:pointer")}>{t("Supprimer le jalon")}</button>
        </div>
        </>
      )}

      {/* @me — mes tickets du sprint (pas de canvas : liste, pas de Gantt) */}
      {v.isMe && (
        <MyBoard
          items={state.items} people={M.people} iters={M.iters} current={M.CURRENT} theme={theme}
          userName={user?.displayName ?? ""} myId={myPersonId} selectedId={state.selectedId}
          onSelect={(id) => setState({ selectedId: id })} adoUrl={snapshot?.adoUrl}
          comments={comments}
          reviewField={prefs.reviewField} onReviewField={(ref) => updatePrefs({ reviewField: ref })}
          identityFields={identityFields}
        />
      )}

      {/* Canvas */}
      {!v.isMe && (
      <div ref={v.onScrollRef} onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={onPanEnd} onPointerCancel={onPanEnd} onClickCapture={onPanClickCapture} style={C("flex:1;position:relative;overflow:auto;background:var(--canvas,#f4f4f7);cursor:grab")}>
        <div ref={v.onCanvasRef} onClick={v.onBgClick} style={C(`position:relative;width:${v.totalWidth}px;height:${v.totalHeight}px;min-height:100%`)}>
          {v.columns.map((col, i) => <div key={"bg" + i} style={C(col.bgStyle)} />)}
          {v.emptyAreaStyle && <div style={C(v.emptyAreaStyle)} />}

          {/* Séparateurs de lignes (pleine largeur, défilent avec le contenu) */}
          {(v.treeRows as Record<string, any>[]).map((row, i) => <div key={"trs" + i} style={C(row.sepStyle)} />)}
          {v.personRows.map((row, i) => <div key={"prs" + i} style={C(row.sepStyle)} />)}

          {/* Panneau gauche, header et coin : bandes sticky de taille nulle (les
              cellules absolues débordent). Le collage est fait par le compositeur
              du navigateur → parfaitement fixe même pendant le scroll natif. */}
          <div style={C("position:sticky;left:0;width:0;height:0;z-index:45")}>
            <div style={C(v.leftPanelStyle)} />
            {(v.treeRows as Record<string, any>[]).map((row, i) => (
              <div key={"tr" + i} onClick={row.onClick} onDoubleClick={row.onDoubleClick}
                role={row.onClick ? "button" : undefined} tabIndex={row.onClick ? 0 : undefined}
                aria-expanded={row.hasChildren ? row.open : undefined}
                onKeyDown={row.onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.onClick(); } } : undefined}
                title={row.onDoubleClick ? t("Cliquer pour ouvrir le panneau · double-clic pour poser un flag") : undefined} style={C(row.leftStyle)}>
                <span onClick={row.onToggle} style={C(row.chevStyle)}>{row.chevron}</span>
                {row.isArea && (
                  <>
                    <div style={C(`width:9px;height:9px;border-radius:3px;background:${row.dotColor};flex:0 0 auto`)} />
                    {/* Titre sur toute la largeur ; badges relégués sur la ligne meta. */}
                    <div style={C("flex:1;min-width:0")}>
                      <div title={row.name} style={C("font-size:12px;font-weight:600;line-height:1.25;color:var(--ink,#1a1a20);overflow-wrap:anywhere")}>{row.name}</div>
                      <div style={C("display:flex;align-items:center;gap:5px;min-width:0")}>
                        <span title={row.subTitle} style={C("font-size:10px;color:var(--muted,#6b6b75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'IBM Plex Mono',monospace;min-width:0")}>{row.sub}</span>
                        {row.prio && <span style={C("font-size:10px;font-weight:600;padding:1px 5px;border-radius:var(--r-sm,5px);background:var(--line2,#f1f1f5);color:var(--muted,#6b6b75);flex:0 0 auto;font-family:'IBM Plex Mono',monospace")}>{row.prio}</span>}
                        <span title={row.statusTitle} style={C(row.statusStyle)}>{row.statusTag}</span>
                        {row.stat && <span title={row.statTitle} style={C("font-size:10px;font-weight:600;font-family:'IBM Plex Mono',monospace;color:var(--muted,#6b6b75);flex:0 0 auto")}>{row.stat}</span>}
                      </div>
                    </div>
                    <button onClick={row.onToggleHidden} title={row.hideTitle} aria-label={row.hideTitle} style={C("margin-left:auto;flex:0 0 auto;border:none;background:transparent;color:var(--muted,#6b6b75);cursor:pointer;line-height:1;padding:2px;opacity:.7")}>{row.hidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}</button>
                  </>
                )}
                <span style={C(row.adoStyle)}>{row.ado}</span>
                <span style={C(row.badgeStyle)}>{row.badge}</span>
                <span style={C("font-size:12px;color:var(--ink,#1a1a20);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0")}>{row.title}</span>
              </div>
            ))}
            {v.relWaterline && (
              <>
                <div style={C(v.relWaterline.lineStyle)} />
                <div title={v.relWaterline.title} style={C(v.relWaterline.flagStyle)}>{v.relWaterline.label}</div>
              </>
            )}
            {v.personRows.map((row, i) => (
              <div key={"pr" + i} style={C(row.leftStyle)} onClick={row.onOpen}
                role={row.onOpen ? "button" : undefined} tabIndex={row.onOpen ? 0 : undefined}
                aria-label={row.onOpen ? t("{name} — capacités par itération", { name: row.name }) : undefined}
                onKeyDown={row.onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.onOpen!(e as unknown as React.MouseEvent); } } : undefined}
                title={row.onOpen ? t("Capacités par itération") : undefined}>
                <div style={C(row.avatarStyle)}>{row.initials}</div>
                <div style={C("line-height:1.25;min-width:0")}>
                  <div style={C("font-size:13px;font-weight:600;color:var(--ink,#1a1a20);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{row.name}</div>
                  <div style={C("font-size:11px;color:var(--muted,#6b6b75)")}>{row.role}</div>
                  {row.loadShow && (
                    <div title={row.loadTitle} style={C("display:flex;align-items:center;gap:6px;margin-top:5px")}>
                      <div style={C("width:46px;height:5px;border-radius:3px;background:var(--line2,#f1f1f5);position:relative;overflow:hidden;flex:0 0 auto")}><div style={C(row.loadFillStyle)} /></div>
                      <span style={C(row.loadTextStyle)}><LoadMark mark={row.loadMark} />{row.loadText}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={C("position:sticky;top:0;width:0;height:0;z-index:47")}>
            {v.columns.map((col, i) => (
              <div key={"head" + i} style={C(col.headStyle)}>
                <div style={C("display:flex;align-items:center;gap:7px")}>
                  {col.showDot && <div style={C(`width:7px;height:7px;border-radius:50%;background:${col.dotColor}`)} />}
                  <span style={C(`font-size:13px;font-weight:600;color:${col.titleColor};letter-spacing:-.01em`)}>{col.label}</span>
                  <span style={C(col.tagStyle)}>{col.tag}</span>
                </div>
                <div style={C("font-size:11px;color:var(--muted,#6b6b75);font-family:'IBM Plex Mono',monospace;margin-top:5px")}>{col.dates}</div>
                <div style={C("font-size:11px;color:var(--faint,#71717c);margin-top:2px")}>{col.sub}</div>
              </div>
            ))}
            {(v.loadBand as Record<string, any>[]).map((b, i) => (
              <div key={"lb" + i} role="img" aria-label={b.wrapTitle} title={b.wrapTitle} style={C(b.wrapStyle)}>
                <div style={C("display:flex;align-items:baseline;gap:5px;min-width:0")}>
                  <span style={C(b.totalStyle)}>{b.total}</span>
                  <span style={C(b.capStyle)}>{b.cap}</span>
                  <div style={{ flex: 1 }} />
                  <span aria-label={b.deltaTitle} title={b.deltaTitle} style={C(b.deltaStyle)}>{b.delta}</span>
                  <span style={C(b.pctStyle)}><LoadMark mark={b.pctMark} />{b.pct}</span>
                </div>
                <div style={C(b.trackStyle)}>
                  {b.segs.map((s: any, j: number) => <div key={j} title={s.title} style={C(s.style)} />)}
                </div>
              </div>
            ))}
          </div>

          <div style={C("position:sticky;top:0;left:0;width:0;height:0;z-index:48")}>
            <div style={C(v.leftHeaderStyle)}>
              <div style={C("font-size:10px;font-weight:600;letter-spacing:.08em;color:var(--faint,#71717c);text-transform:uppercase")}>{v.leftKicker}</div>
              <div style={C("font-size:13px;font-weight:600;color:var(--ink,#1a1a20);margin-top:3px")}>{v.leftTitle}</div>
              {v.showSort && (
                <div style={C("display:flex;align-items:center;gap:6px;margin-top:8px")}>
                  <select value={v.sortValue} onChange={v.onSort} aria-label={t("Tri des personnes")} style={C("flex:1;min-width:0;height:28px;padding:0 6px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:12px;cursor:pointer;outline:none")}>
                    {v.sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {v.showSortDir && (
                    <button onClick={v.onSortDir} aria-label={t("Sens du tri : {dir}", { dir: v.sortAsc ? t("croissant") : t("décroissant") })} title={t("Inverser le sens du tri")} style={C(v.shuffleStyle)}>{v.sortAsc ? "↑" : "↓"}</button>
                  )}
                  <button onClick={v.onShuffle} aria-label={t("Tri aléatoire")} title={t("Tri aléatoire (relance à chaque clic)")} style={C(v.shuffleStyle)}>↻</button>
                </div>
              )}
              {v.isRelease && (
                <div style={C("display:flex;align-items:center;gap:6px;margin-top:9px")}>
                  <span style={C("font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--faint,#71717c);flex:0 0 auto")}>{t("Trier")}</span>
                  <select value={v.epicSort} onChange={v.onEpicSort} aria-label={t("Tri des epics")} style={C("flex:1;min-width:0;height:28px;padding:0 6px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:12px;cursor:pointer;outline:none")}>
                    {v.epicSortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button onClick={v.onEpicSortDir} aria-label={t("Sens du tri : {dir}", { dir: v.epicSortDir === "asc" ? t("croissant") : t("décroissant") })} title={t("Inverser le sens du tri")} style={C(v.shuffleStyle)}>{v.epicSortDir === "asc" ? "↑" : "↓"}</button>
                </div>
              )}
            </div>
          </div>

          {v.banners.map((b, i) => (
            <div key={"bn" + i} style={C(b.style)} onClick={b.onClick} role="button" tabIndex={0}
              aria-label={t("Modifier la capacité")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); b.onClick(e as unknown as React.MouseEvent); } }}
              title={b.title}>
              <span style={C("font-size:10px;color:var(--faint,#71717c);font-weight:500;flex:0 0 auto")}>{t("charge")}</span>
              <div style={C("flex:1;height:5px;border-radius:3px;background:var(--line2,#f1f1f5);overflow:hidden;position:relative")}>
                <div style={C(b.fillStyle)} />
              </div>
              {b.editing ? (
                <input
                  autoFocus
                  type="number"
                  min={0}
                  step={0.5}
                  defaultValue={b.capVal}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => b.onCommit(parseFloat(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    else if (e.key === "Escape") setCapEdit(null);
                  }}
                  style={C(`width:52px;height:18px;font-size:10px;font-family:${mono};border:1px solid var(--accent,#5b5bd6);border-radius:var(--r-sm,5px);padding:0 4px;background:var(--panel,#fff);color:var(--ink,#1a1a20);flex:0 0 auto;outline:none;box-sizing:border-box`)}
                />
              ) : (
                <>
                  <span style={C(b.textStyle)}>{b.text}</span>
                  <span style={C(b.pctStyle)}><LoadMark mark={b.pctMark} />{b.pct}</span>
                </>
              )}
            </div>
          ))}

          {v.dropGhost && <div style={C(v.dropGhost.style)} />}

          {v.bars.map((bar) => (
            <div key={bar.ado} className="gg-bar" role="button" tabIndex={0} aria-label={`${bar.ado} — ${bar.title}`}
              onPointerDown={bar.onDown} onClick={bar.onClick} onKeyDown={bar.onKey} title={bar.title} style={C(bar.style)}>
              <div style={C(bar.accentStyle)} />
              <div style={C("display:flex;align-items:center;gap:6px;margin-bottom:3px")}>
                <span style={C(`font-size:11px;font-weight:600;font-family:'IBM Plex Mono',monospace;color:${bar.accent}`)}>{bar.ado}</span>
                <span style={C(bar.badgeStyle)}>{bar.typeLabel}</span>
                <div style={{ flex: 1 }} />
                {bar.showPoints && <span style={C("font-size:11px;font-weight:600;font-family:'IBM Plex Mono',monospace;color:var(--muted,#6b6b75);background:var(--line2,#f1f1f5);padding:1px 6px;border-radius:var(--r-sm,5px)")}>{bar.points}</span>}
              </div>
              <div style={C("font-size:13px;font-weight:500;line-height:1.25;color:var(--ink,#1a1a20);overflow-wrap:anywhere")}>{bar.title}</div>
              {bar.showFooter && (
                <div style={C("display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:6px")}>
                  <div style={C(bar.epicDotStyle)} />
                  <span title={bar.epicName} style={C(bar.epicLabelStyle)}>{bar.epicName}</span>
                  <div style={C("flex:1;min-width:6px")} />
                  <span title={bar.area} style={C("font-size:10px;color:var(--muted,#6b6b75);font-family:'IBM Plex Mono',monospace;flex:0 1 auto;min-width:0;display:flex;align-items:center;gap:3px")}><span style={C("opacity:.7;flex:0 0 auto")}>▤</span><span style={C("white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0")}>{bar.areaLeaf}</span></span>
                </div>
              )}
              <div style={C("position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--line2,#f1f1f5)")}>
                <div style={C(bar.progressStyle)} />
              </div>
              {bar.editing && <div style={C(bar.editPillStyle)}>{bar.editInitials}</div>}
              {bar.resizable && (
                <div onPointerDown={bar.onResize} style={C("position:absolute;top:0;right:0;width:12px;height:100%;cursor:ew-resize;display:flex;align-items:center;justify-content:center")}>
                  <div className="gg-grip" style={C(bar.handleStyle)} />
                </div>
              )}
            </div>
          ))}

          {(v.relBands as { style: string }[]).map((b, i) => <div key={"rb" + i} style={C(b.style)} />)}

          {(v.relEpics as Record<string, any>[]).map((e, i) => (
            <div key={"re" + i}>
              <div onPointerDown={e.onDown} onDoubleClick={e.onDoubleClick} title={e.title || (e.onDown ? t("Glisser pour déplacer · double-clic pour un flag") : undefined)} style={C(e.containerStyle)}>
                {(e.segs || []).map((s: any, j: number) => (
                  <div key={j} style={C(s.segStyle)}><div style={C(s.fillStyle)} /><span style={C(s.labelStyle)}>{s.label}</span></div>
                ))}
              </div>
              {e.showL && <div onPointerDown={e.onLeftDown} title={t("Étirer/réduire le début")} style={C(e.lHandleStyle)}><span style={C(e.gripStyle)}>{e.gripChar}</span></div>}
              {e.showR && <div onPointerDown={e.onRightDown} title={t("Étirer/réduire la fin")} style={C(e.rHandleStyle)}><span style={C(e.gripStyle)}>{e.gripChar}</span></div>}
            </div>
          ))}

          {(v.relRowPins as Record<string, any>[]).map((p, i) => (
            <div key={"rp" + i}>
              <div style={C(p.lineStyle)} />
              <div onClick={p.onClick} role="button" tabIndex={0} aria-label={p.label}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); p.onClick(); } }}
                style={C(p.flagStyle)}><IconFlag size={10} /> {p.title}</div>
            </div>
          ))}

          {(v.milestones as Record<string, any>[]).map((m, i) => (
            <div key={"ms" + i}>
              <div style={C(m.lineStyle)} />
              <div onClick={m.onClick} role="button" tabIndex={0} aria-label={m.label}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); m.onClick(); } }}
                style={C(m.flagStyle)}><IconMilestone size={10} /> {m.title}</div>
            </div>
          ))}

          {(v.relCards as Record<string, any>[]).map((c, i) => (
            <div key={"rc" + i} role="button" tabIndex={0} aria-label={`${c.ado} — ${c.title}`}
              onPointerDown={c.onDown} onClick={c.onClick} onKeyDown={c.onKey} title={c.title} style={C(c.style)}>
              <div style={C("display:flex;align-items:center;gap:5px")}>
                {c.hasChildren && <span onClick={c.onToggle} style={C(c.chevStyle)}>{c.chevron}</span>}
                <span style={C(c.adoStyle)}>{c.ado}</span>
                <span style={C(c.badgeStyle)}>{c.badge}</span>
                <div style={C("flex:1;min-width:4px")} />
                {c.showPoints && <span style={C("font-size:10px;font-weight:600;font-family:'IBM Plex Mono',monospace;color:var(--muted,#6b6b75)")}>{c.points}</span>}
              </div>
              <div style={C("display:flex;align-items:flex-start;gap:5px;min-width:0")}>
                <div style={C(c.dotStyle)} />
                <span style={C("font-size:12px;font-weight:500;line-height:1.25;color:var(--ink,#1a1a20);overflow-wrap:anywhere")}>{c.title}</span>
              </div>
            </div>
          ))}

          {/* Curseurs simulés (mock uniquement) */}
          {!realSession && !reduceMotion && v.cursors.map((cur, i) => (
            <div key={"cur" + i} ref={cur.setRef} style={C("position:absolute;top:0;left:0;pointer-events:none;z-index:55;will-change:transform")}>
              <svg width="20" height="22" viewBox="0 0 20 22" fill="none" style={{ display: "block", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.25))" }}>
                <path d="M2 2 L2 16 L6 12.5 L9 19 L12 17.7 L9 11.3 L14.5 11 Z" fill={cur.color} stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              <div style={C(cur.labelStyle)}>{cur.name}</div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Inspector */}
      {v.selected && v.insp && (
        <div onClick={v.insp.onPanelClick} style={C(`position:absolute;right:0;top:${v.isMe ? 54 : 100}px;bottom:0;width:330px;background:var(--panel,#fff);border-left:1px solid var(--line,#e8e8ee);z-index:65;box-shadow:-8px 0 26px rgba(20,20,40,.07);display:flex;flex-direction:column;animation:ggpop .16s ease`)}>
          <div style={C("padding:16px 18px 13px;border-bottom:1px solid var(--line2,#f1f1f5)")}>
            <div style={C("display:flex;align-items:center;gap:8px")}>
              <span style={C(`font-size:12px;font-weight:600;font-family:'IBM Plex Mono',monospace;color:${v.insp.accent}`)}>{v.insp.ado}</span>
              <span style={C(v.insp.badgeStyle)}>{v.insp.typeLabel}</span>
              <div style={{ flex: 1 }} />
              <button onClick={v.insp.onPrefsToggle} title={t("Personnaliser les champs affichés")} aria-label={t("Personnaliser les champs affichés")} style={C(`width:26px;height:26px;border-radius:var(--r-md,7px);border:none;background:${v.insp.prefsOpen ? "var(--accentsoft,#ececfb)" : "var(--line2,#f1f1f5)"};color:${v.insp.prefsOpen ? "var(--accent,#5b5bd6)" : "var(--muted,#6b6b75)"};cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center`)}><IconGear size={13} /></button>
              {v.insp.adoHref && (
                <a href={v.insp.adoHref} target="_blank" rel="noreferrer" title={t("Ouvrir dans Azure DevOps")} aria-label={t("Ouvrir dans Azure DevOps")} style={C("width:26px;height:26px;border-radius:var(--r-md,7px);background:var(--line2,#f1f1f5);color:var(--muted,#6b6b75);cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center;text-decoration:none")}>↗</a>
              )}
              <button onClick={v.insp.onDup} title={t("Dupliquer ({mod}D)", { mod: modLabel })} aria-label={t("Dupliquer")} style={C("width:26px;height:26px;border-radius:var(--r-md,7px);border:none;background:var(--line2,#f1f1f5);color:var(--muted,#6b6b75);cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center")}><IconCopy size={13} /></button>
              <button onClick={v.insp.onClose} aria-label={t("Fermer")} style={C("width:26px;height:26px;border-radius:var(--r-md,7px);border:none;background:var(--line2,#f1f1f5);color:var(--muted,#6b6b75);cursor:pointer;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center")}><IconClose size={13} /></button>
            </div>
            <textarea key={"title" + v.insp.ado + ":" + v.insp.title} aria-label={t("Titre du ticket")} defaultValue={v.insp.title} onBlur={v.insp.onTitle}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
              rows={2} style={C("margin-top:11px;width:100%;border:none;background:transparent;resize:none;font-size:16px;font-weight:600;line-height:1.3;color:var(--ink,#1a1a20);outline:none;padding:0")} />
            {v.insp.parents.length > 0 && (
              <div style={C("margin-top:6px;display:flex;flex-direction:column;gap:2px")}>
                {v.insp.parents.map((p) => (
                  <button key={p.id} onClick={p.onClick} title={t("{type} — ouvrir son panneau", { type: p.typeLabel })}
                    style={C(`margin-left:${p.indent}px;border:none;background:transparent;padding:0;text-align:left;font-size:11px;color:var(--muted,#6b6b75);cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>
                    <span style={C("flex:0 0 auto")}>↳</span>
                    <span style={C("overflow:hidden;text-overflow:ellipsis")}>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Popover personnalisation des champs — réglage par type de work item */}
          {v.insp.prefsOpen && (
            <div onClick={v.stop} ref={focusPopover} tabIndex={-1} style={C("position:absolute;top:46px;left:12px;right:12px;background:var(--panel,#fff);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-xl,11px);box-shadow:0 12px 34px rgba(20,20,40,.16);z-index:20;padding:14px 16px;animation:ggdrop .14s ease;max-height:72%;overflow:auto;outline:none")}>
              <div style={C("font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint,#71717c)")}>{t("Champs affichés — {wit}", { wit: v.insp.wit })}</div>
              <div style={C("font-size:11px;line-height:1.4;color:var(--muted,#6b6b75);margin:4px 0 9px")}>{t("S'applique à tous les tickets « {wit} ».", { wit: v.insp.wit })}</div>
              {v.insp.prefFields.map((f) => (
                <label key={f.label} style={C(`display:flex;align-items:center;gap:9px;padding:4px 0;cursor:pointer;font-size:13px;font-family:${sans};color:var(--ink,#1a1a20)`)}>
                  <input type="checkbox" checked={f.checked} onChange={f.onToggle} style={C("width:15px;height:15px;accent-color:var(--accent,#5b5bd6);cursor:pointer")} />
                  {f.label}
                </label>
              ))}
              {v.insp.extraFields.length > 0 && (
                <>
                  <div style={C("font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--faint,#71717c);margin:13px 0 5px")}>{t("Champs supplémentaires")}</div>
                  {v.insp.extraFields.map((f) => (
                    <div key={f.ref} title={f.ref} style={C(`display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;font-size:13px;font-family:${sans};color:var(--ink,#1a1a20)`)}>
                      <span style={C("white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{f.label}</span>
                      <button onClick={f.onRemove} title={t("Retirer ce champ")} aria-label={t("Retirer le champ {label}", { label: f.label })} style={C("border:none;background:none;color:var(--faint,#71717c);cursor:pointer;font-size:14px;line-height:1;padding:0")}>×</button>
                    </div>
                  ))}
                </>
              )}
              {v.insp.picker ? (
                <div style={C("margin-top:12px")}>
                  <input autoFocus value={v.insp.picker.q} onChange={v.insp.picker.onQ} placeholder={t("Rechercher un champ ADO…")} style={C(v.inputCss)} />
                  {v.insp.picker.loading ? (
                    <div style={C("font-size:12px;color:var(--muted,#6b6b75);padding:9px 2px")}>{t("Chargement des champs ADO…")}</div>
                  ) : v.insp.picker.options.length === 0 ? (
                    <div style={C("font-size:12px;color:var(--muted,#6b6b75);padding:9px 2px")}>{t("Aucun champ disponible")}</div>
                  ) : (
                    <div style={C("max-height:170px;overflow:auto;margin-top:6px")}>
                      {v.insp.picker.options.map((o) => (
                        <button key={o.ref} onClick={o.onPick} title={o.ref} style={C("display:block;width:100%;text-align:left;border:none;background:none;padding:6px 4px;border-radius:var(--r-md,7px);cursor:pointer;font-size:13px;color:var(--ink,#1a1a20)")}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={v.insp.picker.onClose} style={C("margin-top:8px;width:100%;height:28px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--muted,#6b6b75);font-size:11px;font-weight:500;cursor:pointer")}>{t("Annuler")}</button>
                </div>
              ) : (
                <button onClick={v.insp.onAddField} style={C("margin-top:12px;width:100%;height:32px;border-radius:var(--r-md,7px);border:1px dashed var(--line,#e8e8ee);background:transparent;color:var(--accent,#5b5bd6);font-size:12px;font-weight:500;cursor:pointer")}>{t("+ Ajouter un champ supplémentaire")}</button>
              )}
            </div>
          )}
          <div style={C("flex:1;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:17px")}>
            {v.insp.show.state && (
              <div>
                <div style={C(v.labelCss)}>{t("État")}</div>
                {/* Grille (2 colonnes au-delà de 3 états) : évite un dernier bouton
                    orphelin pleine largeur qui ressemble à une action à part. */}
                <div style={C(`display:grid;grid-template-columns:repeat(${v.insp.states.length <= 3 ? Math.max(v.insp.states.length, 1) : 2},1fr);gap:5px`)}>
                  {v.insp.states.map((s) => <button key={s.label} onClick={s.onClick} style={C(s.style)}>{s.label}</button>)}
                </div>
              </div>
            )}
            {v.insp.show.assignee && (
              <div>
                <div style={C(v.labelCss)}>{t("Assigné à")}</div>
                <select value={v.insp.assignee} onChange={v.insp.onAssignee} style={C(v.selectCss)}>
                  {v.insp.people.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            {v.insp.show.iter && (
              <div>
                <div style={C(v.labelCss)}>{t("Itération")}</div>
                <select value={v.insp.iter} onChange={v.insp.onIter} style={C(v.selectCss)}>
                  {v.insp.iterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            {v.insp.show.area && (
              <div>
                <div style={C(v.labelCss)}>{t("Area Path")}</div>
                <select value={v.insp.area} onChange={v.insp.onArea} style={C(v.selectCss)}>
                  {v.insp.areaOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            {v.insp.notTask && v.insp.show.points && (
              <div>
                <div style={C(v.labelCss)}>Story Points</div>
                <div style={C(v.stepperCss)}>
                  <button onClick={v.insp.decPoints} aria-label={t("Diminuer les story points")} style={C(v.stepBtnCss)}>−</button>
                  <input type="text" inputMode="decimal" aria-label={t("Story points")} key={"pts" + v.insp.ado + ":" + v.insp.points} defaultValue={String(v.insp.points)}
                    onBlur={v.insp.onPoints} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={C(v.stepInputCss)} />
                  <button onClick={v.insp.incPoints} aria-label={t("Augmenter les story points")} style={C(v.stepBtnCss)}>+</button>
                </div>
              </div>
            )}
            {v.insp.isTask && v.insp.show.effort && (
              <div>
                <div style={C(v.labelCss)}>{t("Estimation (jours)")}</div>
                <div style={C(v.stepperCss)}>
                  <button onClick={v.insp.decEffort} aria-label={t("Diminuer l'estimation")} style={C(v.stepBtnCss)}>−</button>
                  <input type="text" inputMode="decimal" aria-label={t("Estimation en jours")} key={"eff" + v.insp.ado + ":" + v.insp.effort} defaultValue={String(v.insp.effort)}
                    onBlur={v.insp.onEffort} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={C(v.stepInputCss)} />
                  <button onClick={v.insp.incEffort} aria-label={t("Augmenter l'estimation")} style={C(v.stepBtnCss)}>+</button>
                </div>
              </div>
            )}
            {v.insp.show.priority && (
              <div>
                <div style={C(v.labelCss)}>{t("Priorité")}</div>
                <input type="number" min={1} step={1} key={"prio" + v.insp.ado + ":" + v.insp.priority} defaultValue={String(v.insp.priority)}
                  onBlur={v.insp.onPriority} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} placeholder="—" style={C(v.inputCss)} />
              </div>
            )}
            {v.insp.show.dates && (
              <div>
                <div style={C(v.labelCss)}>{t("Dates (début → fin)")}</div>
                <div style={C(`font-size:13px;font-family:${mono};color:var(--ink,#1a1a20)`)}>{v.insp.dates}</div>
              </div>
            )}
            {v.insp.extraFields.map((f) => (
              <div key={f.ref} title={f.ref}>
                <div style={C(v.labelCss)}>{f.label}{f.required ? " *" : ""}</div>
                {f.allowed ? (
                  <select value={f.raw} onChange={f.onCommit} style={C(v.selectCss)}>
                    {(!f.required || f.raw === "") && <option value="" disabled={f.required}>—</option>}
                    {f.raw !== "" && !f.allowed.includes(f.raw) && <option value={f.raw}>{f.raw}</option>}
                    {f.allowed.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type="text" key={f.ref + ":" + f.raw + ":" + extraNonce} defaultValue={f.raw} placeholder={f.value}
                    onBlur={f.onCommit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} style={C(v.inputCss)} />
                )}
              </div>
            ))}
          </div>
          <div style={C("padding:12px 18px;border-top:1px solid var(--line2,#f1f1f5);display:flex;align-items:center;gap:8px")}>
            <div style={C(v.insp.footDotStyle)} />
            <span style={C("font-size:11px;color:var(--muted,#6b6b75)")}>{v.insp.footLabel}</span>
          </div>
        </div>
      )}

      {/* Panneau personne — capacités par itération */}
      {v.personPanel && (
        <div style={C("position:absolute;right:0;top:100px;bottom:0;width:330px;background:var(--panel,#fff);border-left:1px solid var(--line,#e8e8ee);z-index:65;box-shadow:-8px 0 26px rgba(20,20,40,.07);display:flex;flex-direction:column;animation:ggpop .16s ease")}>
          <div style={C("padding:16px 18px 12px;border-bottom:1px solid var(--line2,#f1f1f5);display:flex;align-items:center;gap:11px")}>
            <div style={C(v.personPanel.avatarStyle)}>{v.personPanel.initials}</div>
            <div style={C("min-width:0;flex:1")}>
              <div style={C("font-size:14px;font-weight:600;color:var(--ink,#1a1a20);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{v.personPanel.name}</div>
              {v.personPanel.poste && <div style={C("font-size:11px;color:var(--muted,#6b6b75)")}>{v.personPanel.poste}</div>}
            </div>
            <button onClick={v.personPanel.onClose} aria-label={t("Fermer")} style={C("width:26px;height:26px;border-radius:var(--r-md,7px);border:none;background:var(--line2,#f1f1f5);color:var(--muted,#6b6b75);cursor:pointer;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;flex:0 0 auto")}><IconClose size={13} /></button>
          </div>
          <div style={C("padding:14px 18px;border-bottom:1px solid var(--line2,#f1f1f5);display:flex;flex-direction:column;gap:11px")}>
            <div>
              <div style={C(v.labelCss)}>{t("Poste")}</div>
              <input type="text" key={"poste:" + v.personPanel.name + ":" + (v.personPanel.poste || "")}
                defaultValue={v.personPanel.poste || ""} placeholder="—" onBlur={v.personPanel.onCommitPoste}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={C("width:100%;height:34px;padding:0 10px;border-radius:var(--r-lg,9px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:13px;outline:none;box-sizing:border-box")} />
            </div>
            <div>
              <div style={C(v.labelCss)}>{t("Rôle")}</div>
              <input type="text" key={"role:" + v.personPanel.name + ":" + (v.personPanel.teamRole || "")}
                defaultValue={v.personPanel.teamRole || ""} placeholder="—" onBlur={v.personPanel.onCommitRole}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={C("width:100%;height:34px;padding:0 10px;border-radius:var(--r-lg,9px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--ink,#1a1a20);font-size:13px;outline:none;box-sizing:border-box")} />
            </div>
          </div>
          <div style={C("flex:1;overflow-y:auto;padding:14px 18px")}>
            <div style={C(v.labelCss)}>{t("Capacité par itération")}</div>
            {v.personPanel.rows.map((r) => (
              <div key={r.key} style={C("display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--line2,#f1f1f5)")}>
                <div style={C("flex:1;min-width:0")}>
                  <div style={C(`font-size:13px;font-weight:${r.current ? 600 : 500};color:${r.current ? "var(--accent,#5b5bd6)" : "var(--ink,#1a1a20)"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{r.label}</div>
                  <div style={C(`font-size:10px;color:var(--faint,#71717c);font-family:${mono}`)}>{r.dates}</div>
                </div>
                <span title={t("Charge planifiée")} style={C(`font-size:11px;color:var(--muted,#6b6b75);font-family:${mono};flex:0 0 auto`)}>{r.usedText}</span>
                <input type="text" inputMode="decimal" key={"cap" + r.key + ":" + r.cap} defaultValue={String(r.cap)}
                  onBlur={r.onCommit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={C(`width:52px;height:30px;text-align:center;border:1px solid var(--line,#e8e8ee);border-radius:var(--r-md,7px);background:var(--panel2,#fafafc);font-size:13px;font-weight:600;font-family:${mono};color:var(--ink,#1a1a20);outline:none;flex:0 0 auto;box-sizing:border-box`)} />
                <span style={C(r.pctStyle)}><LoadMark mark={r.pctMark} />{r.pctText}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matrice de capacité — collaborateurs × itérations */}
      {v.capMatrix && (
        <>
          <div onClick={v.capMatrix.onClose} style={C("position:absolute;inset:0;z-index:84;background:rgba(20,20,40,.25)")} />
          <div onClick={v.stop} ref={focusPopover} tabIndex={-1} style={C("position:absolute;left:50%;top:76px;transform:translateX(-50%);max-width:calc(100% - 56px);max-height:calc(100% - 132px);background:var(--panel,#fff);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-xl,11px);box-shadow:0 18px 50px rgba(20,20,40,.22);z-index:85;display:flex;flex-direction:column;animation:ggtoast .16s ease;outline:none")}>
            <div style={C("padding:14px 18px 12px;border-bottom:1px solid var(--line2,#f1f1f5);display:flex;align-items:center;gap:12px;flex:0 0 auto")}>
              <div style={C("font-size:14px;font-weight:600;color:var(--ink,#1a1a20);white-space:nowrap")}>{t("Matrice de capacité")}</div>
              <div style={C("font-size:11px;color:var(--muted,#6b6b75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{t("capacité en jours ouvrés par membre et par itération · Tab pour passer à la cellule suivante · collage d'une plage Excel pris en charge")}</div>
              <div style={{ flex: 1 }} />
              <button onClick={v.capMatrix.onClose} aria-label={t("Fermer")} style={C("width:26px;height:26px;border-radius:var(--r-md,7px);border:none;background:var(--line2,#f1f1f5);color:var(--muted,#6b6b75);cursor:pointer;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;flex:0 0 auto")}><IconClose size={13} /></button>
            </div>
            <div style={C("overflow:auto;flex:1 1 auto")}>
              <table style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={C("position:sticky;left:0;top:0;z-index:3;background:var(--panel,#fff);border-bottom:1px solid var(--line,#e8e8ee);border-right:1px solid var(--line2,#f1f1f5);padding:10px 14px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint,#71717c)")}>{t("Membre")}</th>
                    {v.capMatrix.cols.map((c) => (
                      <th key={c.key} style={C(`position:sticky;top:0;z-index:2;background:var(--panel,#fff);border-bottom:1px solid var(--line,#e8e8ee);padding:10px 12px;text-align:center;min-width:96px${c.current ? ";box-shadow:inset 0 -2px 0 var(--accent,#5b5bd6)" : ""}`)}>
                        <div style={C(`font-size:12px;font-weight:600;color:${c.current ? "var(--accent,#5b5bd6)" : "var(--ink,#1a1a20)"};white-space:nowrap`)}>{c.label}</div>
                        <div style={C(`font-size:10px;font-weight:400;color:var(--faint,#71717c);font-family:${mono};white-space:nowrap`)}>{c.dates}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.capMatrix.rows.map((r) => (
                    <tr key={r.key}>
                      <td style={C("position:sticky;left:0;z-index:1;background:var(--panel,#fff);border-bottom:1px solid var(--line2,#f1f1f5);border-right:1px solid var(--line2,#f1f1f5);padding:7px 14px")}>
                        <div style={C("display:flex;align-items:center;gap:9px")}>
                          <div style={C(r.avatarStyle)}>{r.initials}</div>
                          <div style={C("min-width:0")}>
                            <div style={C("font-size:13px;font-weight:500;color:var(--ink,#1a1a20);white-space:nowrap")}>{r.name}</div>
                            {r.poste && <div style={C("font-size:10px;color:var(--muted,#6b6b75);white-space:nowrap")}>{r.poste}</div>}
                          </div>
                        </div>
                      </td>
                      {r.cells.map((cell) => (
                        <td key={cell.key} title={cell.title} style={C("border-bottom:1px solid var(--line2,#f1f1f5);padding:7px 12px;text-align:center;vertical-align:middle")}>
                          <input type="text" inputMode="decimal" key={"mcap" + r.key + ":" + cell.key + ":" + cell.cap} defaultValue={String(cell.cap)}
                            aria-label={t("Capacité de {name} — {iter}", { name: r.name, iter: v.capMatrix!.cols.find((c) => c.key === cell.key)?.label ?? "" })}
                            onBlur={cell.onCommit} onPaste={cell.onPaste} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} onFocus={(e) => e.target.select()}
                            style={C(`width:52px;height:30px;text-align:center;border:1px solid var(--line,#e8e8ee);border-radius:var(--r-md,7px);background:var(--panel2,#fafafc);font-size:13px;font-weight:600;font-family:${mono};color:var(--ink,#1a1a20);outline:none;box-sizing:border-box`)} />
                          <div style={C(cell.subStyle)}><LoadMark mark={cell.subMark} />{cell.subText}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td style={C("position:sticky;left:0;bottom:0;z-index:1;background:var(--panel,#fff);border-top:1px solid var(--line,#e8e8ee);border-right:1px solid var(--line2,#f1f1f5);padding:9px 14px;font-size:11px;font-weight:600;color:var(--muted,#6b6b75);white-space:nowrap")}>{t("Σ équipe · charge / capa")}</td>
                    {v.capMatrix.totals.map((t) => (
                      <td key={t.key} style={C("position:sticky;bottom:0;background:var(--panel,#fff);border-top:1px solid var(--line,#e8e8ee);padding:9px 12px;text-align:center")}>
                        <div style={C(`font-size:11px;font-family:${mono};color:var(--ink,#1a1a20);white-space:nowrap`)}>{t.text}</div>
                        <div style={C(t.pctStyle)}><LoadMark mark={t.pctMark} />{t.pctText}</div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {v.toast && (
        <div role="status" aria-live="polite" style={C("position:absolute;bottom:22px;left:50%;z-index:80;background:var(--ink,#1a1a20);color:var(--panel,#fff);padding:9px 16px;border-radius:var(--r-lg,9px);font-size:13px;font-weight:500;box-shadow:0 8px 28px rgba(0,0,0,.28);animation:ggtoast .22s ease;display:flex;align-items:center;gap:9px;transform:translateX(-50%)")}>
          <div style={C("width:7px;height:7px;border-radius:50%;background:var(--color-synced,#2bbf73)")} />{v.toast}
        </div>
      )}
    </div>
  );
}
