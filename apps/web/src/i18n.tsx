import { create } from "zustand";

// i18n minimal : la chaîne française EST la clé, le dictionnaire ne porte que
// l'anglais. Une clé absente retombe sur le français — c'est le comportement
// voulu (rien ne casse si une chaîne évolue), pas un oubli silencieux.
// ponytail: pas de lib i18n — 2 langues, pas de pluriels complexes, pas de RTL.

export type Lang = "fr" | "en";

const KEY = "moires-lang";

const initial: Lang =
  typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "en" ? "en" : "fr";

if (typeof document !== "undefined") document.documentElement.lang = initial;

interface LangState {
  lang: Lang;
  toggle: () => void;
}

export const useLangStore = create<LangState>((set, get) => ({
  lang: initial,
  toggle: () => {
    const next: Lang = get().lang === "fr" ? "en" : "fr";
    try { localStorage.setItem(KEY, next); } catch { /* stockage indisponible */ }
    document.documentElement.lang = next;
    set({ lang: next });
  },
}));

/** Abonnement : à appeler dans chaque composant qui affiche du texte traduit. */
export const useLang = () => useLangStore((s) => s.lang);
export const lang = () => useLangStore.getState().lang;
/** Locale BCP-47 pour Intl / toLocaleString / localeCompare. */
export const locale = () => (lang() === "en" ? "en-US" : "fr-FR");

/**
 * Traduit une chaîne source française. `vars` remplace les jetons `{nom}`.
 * `t("{n} tickets", { n: 3 })` → « 3 tickets » / "3 tickets".
 */
export function t(fr: string, vars?: Record<string, string | number>): string {
  const s = (lang() === "en" && EN[fr]) || fr;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s;
}

/** Abréviations de mois, indexées 0-11 (utilisées par les formats de dates courts). */
const MONTHS: Record<Lang, string[]> = {
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
export const months = () => MONTHS[lang()];

// ponytail: drapeaux en SVG inline — les emojis 🇫🇷/🇬🇧 ne s'affichent pas sous
// Windows (rendus « FR »/« GB »). Union Jack sans contre-échange des diagonales :
// invisible à 20px.
const FLAG = { width: 20, height: 14, display: "block" } as const;
const Flags = {
  fr: (
    <svg viewBox="0 0 3 2" {...FLAG} aria-hidden="true">
      <rect width="3" height="2" fill="#ED2939" />
      <rect width="2" height="2" fill="#fff" />
      <rect width="1" height="2" fill="#002395" />
    </svg>
  ),
  en: (
    <svg viewBox="0 0 60 30" preserveAspectRatio="none" {...FLAG} aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  ),
};

/** Bouton FR/EN — affiche le drapeau de la langue vers laquelle on bascule. */
export function LangToggle() {
  const cur = useLang();
  const toggle = useLangStore((s) => s.toggle);
  const title = cur === "fr" ? "Switch to English" : "Passer en français";
  return (
    <button
      onClick={toggle}
      title={title}
      aria-label={title}
      style={{
        height: 30, padding: "0 7px", flex: "0 0 auto",
        borderRadius: "var(--r-md,7px)", border: "1px solid var(--line,#e8e8ee)",
        background: "var(--panel2,#fafafc)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {cur === "fr" ? Flags.en : Flags.fr}
    </button>
  );
}

const EN: Record<string, string> = {
  // ---- Auth / login ----
  "PAT ou organisation invalide. Vérifiez le nom de l'organisation, le jeton et ses autorisations.":
    "Invalid PAT or organization. Check the organization name, the token and its scopes.",
  "Trop de tentatives échouées. Attendez 15 minutes avant de réessayer.":
    "Too many failed attempts. Wait 15 minutes before trying again.",
  "La connexion a échoué. Réessayez.": "Sign-in failed. Try again.",
  "Planification collaborative de sprint sur Azure DevOps":
    "Collaborative sprint planning on Azure DevOps",
  "Organisation ADO": "ADO organization",
  "ex. monorganisation": "e.g. myorganization",
  "Organisation Azure DevOps": "Azure DevOps organization",
  "Collez votre jeton": "Paste your token",
  "Personal Access Token Azure DevOps": "Azure DevOps Personal Access Token",
  "Masquer le jeton": "Hide token",
  "Afficher le jeton": "Show token",
  Masquer: "Hide",
  Afficher: "Show",
  "Se souvenir de moi (30 jours)": "Remember me (30 days)",
  "Connexion…": "Signing in…",
  "Se connecter": "Sign in",
  "Renseignez l'organisation et le jeton pour activer la connexion.":
    "Fill in the organization and the token to enable sign-in.",
  "Comment créer un PAT ?": "How do I create a PAT?",
  "Dans Azure DevOps : avatar en haut à droite →": "In Azure DevOps: avatar top right →",
  ": un nom (ex. « Moires »), l'organisation ci-dessus, une expiration.":
    ": a name (e.g. “Moires”), the organization above, an expiry.",
  ", puis cocher exactement :": ", then tick exactly:",
  "(lecture des sprints/boards, écriture des tickets)":
    "(read sprints/boards, write work items)",
  "(liste des projets et des membres d'équipe)": "(list of projects and team members)",
  ", puis copier le jeton — il n'est affiché qu'une fois — et le coller ci-dessus.":
    ", then copy the token — it is shown only once — and paste it above.",

  // ---- Lobby / session ----
  "Ouverture de la session…": "Opening the session…",
  "Reprise de la session…": "Restoring the session…",
  "Planification collaborative": "Collaborative planning",
  "Nouvelle session": "New session",
  "Sélectionnez le projet Azure DevOps à planifier.":
    "Select the Azure DevOps project to plan.",
  "Chargement…": "Loading…",
  "Projet ADO": "ADO project",
  "Sélectionner…": "Select…",
  "Entrer dans la session": "Enter the session",
  "Sélectionnez un projet pour entrer dans la session.":
    "Select a project to enter the session.",
  "Aucun work item": "No work items",
  "Ce projet Azure DevOps ne contient aucun work item à planifier. Ajoutez-en dans ADO, ou choisissez un autre projet.":
    "This Azure DevOps project has no work items to plan. Add some in ADO, or pick another project.",
  "Choisir un autre projet": "Pick another project",

  // ---- Vue @me ----
  "Critères d'acceptation": "Acceptance criteria",
  "Mes tickets du sprint": "My sprint work items",
  Tickets: "Work items",
  Terminés: "Done",
  "Sprint en cours": "Current sprint",
  "Sprint suivant": "Next sprint",
  "Aucun ticket ne vous est assigné sur ce sprint.":
    "No work item is assigned to you in this sprint.",
  "Votre compte n'est rattaché à aucun membre de l'équipe.":
    "Your account is not linked to any team member.",
  "Rien de prévu pour vous.": "Nothing planned for you.",
  "Mes tickets": "My work items",
  "Ajouter une section": "Add a section",
  "Ajouter une section…": "Add a section…",
  "Retirer la section": "Remove section",
  "Aucun sprint planifié après celui-ci.": "No sprint planned after this one.",

  // ---- Itérations / modèle ----
  "Itération {n}": "Iteration {n}",
  "Non planifié": "Not planned",
  "à prioriser": "to prioritize",
  "{n}j ouvrés / pers.": "{n} working days / person",
  "Non assigné": "Unassigned",
  Tâche: "Task",

  // ---- Board : charge / capacité ----
  Surcharge: "Overloaded",
  "Proche de la capacité": "Near capacity",
  charge: "load",
  Charge: "Load",
  Capacités: "Capacity",
  "Capacité par itération": "Capacity per iteration",
  "Capacité mise à jour": "Capacity updated",
  "Profil mis à jour": "Profile updated",
  "Modifier la capacité": "Edit capacity",
  "Charge planifiée": "Planned load",
  "Capacités par itération": "Capacity per iteration",
  "{name} — capacités par itération": "{name} — capacity per iteration",
  "Matrice de capacité": "Capacity matrix",
  "Matrice de capacité — tous les membres × itérations":
    "Capacity matrix — all members × iterations",
  "capacité en jours ouvrés par membre et par itération · Tab pour passer à la cellule suivante · collage d'une plage Excel pris en charge":
    "capacity in working days per member and iteration · Tab moves to the next cell · pasting an Excel range is supported",
  Membre: "Member",
  "Σ équipe · charge / capa": "Σ team · load / cap",
  "Capacité de {name} — {iter}": "{name}'s capacity — {iter}",
  "Charge {used} ({field}) / capacité {cap} jours ouvrés — {iter}{note}":
    "Load {used} ({field}) / capacity {cap} working days — {iter}{note}",
  "Charge {used} ({field}) / capacité {cap} jours ouvrés{note} — cliquer pour modifier la capacité":
    "Load {used} ({field}) / capacity {cap} working days{note} — click to edit the capacity",
  "{name} — {iter} : charge {used} ({field}) / capacité {cap} jours ouvrés{note}":
    "{name} — {iter}: load {used} ({field}) / capacity {cap} working days{note}",
  " · convention 1 pt ≈ 1 jour": " · convention 1 pt ≈ 1 day",
  "estimation en jours": "estimate in days",
  "charge à 0": "load reads 0",
  "Aucun ticket affiché n'a de valeur « {field} » : les jauges de charge affichent 0. Choisissez un autre champ dans le menu Charge ou renseignez les valeurs dans Azure DevOps.":
    "No displayed work item has a “{field}” value: the load gauges read 0. Pick another field in the Load menu, or fill the values in Azure DevOps.",
  "Champ de charge": "Load field",
  "Champ utilisé pour les jauges de charge et le tri « Charge »":
    "Field used for the load gauges and the “Load” sort",
  "Estimation (jours)": "Estimate (days)",

  // ---- Board : en-tête / barre d'outils ----
  "Itération courante": "Current iteration",
  Personnes: "People",
  "Personnes affichées": "People shown",
  "Tout afficher": "Show all",
  "Tout désélectionner": "Deselect all",
  "Inactifs ({n})": "Inactive ({n})",
  Équipe: "Team",
  Projet: "Project",
  Arborescence: "Tree",
  "{n} personne": "{n} person",
  "{n} personnes": "{n} people",
  Granularité: "Granularity",
  Trier: "Sort",
  "Tri des personnes": "Sort people",
  "Tri des epics": "Sort epics",
  "Sens du tri : {dir}": "Sort direction: {dir}",
  croissant: "ascending",
  décroissant: "descending",
  "Inverser le sens du tri": "Reverse the sort direction",
  "Tri aléatoire": "Random sort",
  "Tri aléatoire (relance à chaque clic)": "Random sort (reshuffles on each click)",
  Nom: "Name",
  "Écart charge/capa": "Load/capacity gap",
  Aléatoire: "Random",
  Personne: "Person",
  Poste: "Job title",
  Global: "Global",
  Rôle: "Role",
  Priorité: "Priority",
  "Somme de l'effort": "Total effort",
  "Tous les epics": "All epics",
  "Masquer terminés": "Hide completed",
  "Actifs seulement": "Active only",
  "Sync…": "Syncing…",
  "ADO sync.": "ADO sync",
  "Synchronisation Azure DevOps en cours…": "Azure DevOps sync in progress…",
  "Azure DevOps synchronisé": "Azure DevOps synced",
  "Passer en thème clair": "Switch to light theme",
  "Passer en thème sombre": "Switch to dark theme",
  "{n} en ligne": "{n} online",
  "{name} (vous)": "{name} (you)",
  "{name} (inactif)": "{name} (idle)",
  "Menu du compte": "Account menu",
  "Connecté en tant que": "Signed in as",
  "Copier le lien d'invitation": "Copy invite link",
  "Changer de projet": "Switch project",
  "Se déconnecter": "Sign out",
  "Lien d'invitation copié — valable pour votre organisation ADO":
    "Invite link copied — valid for your ADO organization",
  "Impossible de copier le lien": "Could not copy the link",

  // ---- Board : intervalle / affichage ----
  Vue: "View",
  "Toutes les itérations": "All iterations",
  "Réglages d'affichage": "Display settings",
  "Intervalle d'itérations affiché": "Displayed iteration range",
  De: "From",
  À: "To",
  "Première itération affichée": "First iteration shown",
  "Dernière itération affichée": "Last iteration shown",
  "Inclure le backlog": "Include the backlog",
  Affichage: "Display",
  "Charge par": "Load by",
  "Regroupement de la charge": "Load grouping",
  "Filtre epics": "Epic filter",
  "Filtre des epics": "Epic filter",
  "Intervalle des métriques": "Metrics range",
  "Début de l'intervalle des métriques": "Start of the metrics range",
  "Fin de l'intervalle des métriques": "End of the metrics range",
  "Vue long terme": "Long-term view",
  "Toutes les itérations sont affichées. Défilez horizontalement pour naviguer ; la vue démarre sur l'itération courante. Double-cliquez sur une ligne ou une barre pour poser un flag.":
    "All iterations are shown. Scroll horizontally to navigate; the view starts on the current iteration. Double-click a row or a bar to drop a flag.",
  "Aller à l'itération courante": "Go to the current iteration",
  "Masquer les tickets fermés": "Hide closed work items",
  "Revenir à l'itération courante": "Back to the current iteration",
  courante: "current",
  passée: "past",
  "{label} (courante)": "{label} (current)",
  "{label} (passée)": "{label} (past)",
  "{n} ticket": "{n} work item",
  "{n} tickets": "{n} work items",

  // ---- Board : panneau ticket ----
  État: "State",
  "Assigné à": "Assigned to",
  Itération: "Iteration",
  "Area Path": "Area Path",
  Estimation: "Estimate",
  "Dates (début → fin)": "Dates (start → finish)",
  "Titre du ticket": "Work item title",
  Titre: "Title",
  "Personnaliser les champs affichés": "Customize displayed fields",
  "Champs affichés — {wit}": "Displayed fields — {wit}",
  "S'applique à tous les tickets « {wit} ».": "Applies to every “{wit}” work item.",
  "Champs supplémentaires": "Extra fields",
  "Retirer ce champ": "Remove this field",
  "Retirer le champ {label}": "Remove the {label} field",
  "Rechercher un champ ADO…": "Search an ADO field…",
  "Chargement des champs ADO…": "Loading ADO fields…",
  "Aucun champ disponible": "No field available",
  Annuler: "Cancel",
  "+ Ajouter un champ supplémentaire": "+ Add an extra field",
  "Ouvrir dans Azure DevOps": "Open in Azure DevOps",
  "Dupliquer ({mod}D)": "Duplicate ({mod}D)",
  Dupliquer: "Duplicate",
  Fermer: "Close",
  "{type} — ouvrir son panneau": "{type} — open its panel",
  "Diminuer les story points": "Decrease story points",
  "Augmenter les story points": "Increase story points",
  "Story points": "Story points",
  "Diminuer l'estimation": "Decrease the estimate",
  "Augmenter l'estimation": "Increase the estimate",
  "Estimation en jours": "Estimate in days",
  "Écriture dans Azure DevOps…": "Writing to Azure DevOps…",
  "Synchronisé · write-back par champ": "Synced · field-level write-back",
  "« {label} » est requis dans Azure DevOps — valeur conservée":
    "“{label}” is required in Azure DevOps — value kept",

  // ---- Board : messages d'enregistrement ----
  Assignation: "Assignment",
  Champ: "Field",
  "{field} enregistré dans Azure DevOps": "{field} saved to Azure DevOps",
  "Copie créée dans Azure DevOps : #{id}": "Copy created in Azure DevOps: #{id}",
  "Copie créée : {id}": "Copy created: {id}",
  "Impossible de créer la copie dans Azure DevOps":
    "Could not create the copy in Azure DevOps",
  "Ticket copié — {mod}V pour coller": "Work item copied — {mod}V to paste",
  "{ado} étendu sur {n} itération": "{ado} spread over {n} iteration",
  "{ado} étendu sur {n} itérations": "{ado} spread over {n} iterations",
  "{ado} réassigné à {who}": "{ado} reassigned to {who}",
  "{ado} → {who} · {what}": "{ado} → {who} · {what}",
  "{ado} → {what}": "{ado} → {what}",
  "{ado} replanifié : {from} → {to}{suffix}": "{ado} rescheduled: {from} → {to}{suffix}",
  " · {n} US rapatriée": " · {n} story pulled back",
  " · {n} US rapatriées": " · {n} stories pulled back",

  // ---- Board : jalons / flags ----
  Jalon: "Milestone",
  "Nouveau jalon": "New milestone",
  "Jalon ajouté": "Milestone added",
  "Jalon mis à jour": "Milestone updated",
  "Jalon supprimé": "Milestone deleted",
  "Éditer le jalon": "Edit milestone",
  "Supprimer le jalon": "Delete milestone",
  "Suppression du jalon": "Milestone deletion",
  "Impossible d'ajouter le jalon (erreur serveur)":
    "Could not add the milestone (server error)",
  "À partir de l'itération": "From iteration",
  "Jalon {title} — {iter}": "Milestone {title} — {iter}",
  "Flag ajouté": "Flag added",
  "Flag mis à jour": "Flag updated",
  "Flag supprimé": "Flag deleted",
  "Éditer le flag": "Edit flag",
  "Supprimer le flag": "Delete flag",
  "Suppression du flag": "Flag deletion",
  "Impossible d'ajouter le flag (erreur serveur)": "Could not add the flag (server error)",
  "Flag {title} — {iter}": "Flag {title} — {iter}",
  "{what} non enregistré côté serveur — rechargez la page":
    "{what} was not saved on the server — reload the page",
  Libellé: "Label",
  Couleur: "Color",
  Ambre: "Amber",
  Bleu: "Blue",
  Vert: "Green",
  Rose: "Pink",

  // ---- Board : Release planning ----
  "en cours": "in progress",
  "semi-actif": "partly active",
  "à venir": "upcoming",
  terminé: "done",
  "(Sans epic)": "(No epic)",
  "aucune US planifiée": "no story planned",
  " · {n} sans itération": " · {n} without an iteration",
  "charge totale des US : {total} ({field})": "total story load: {total} ({field})",
  "Des US sont planifiées sur le sprint courant ou à venir, hors de l'intervalle {from} → {to}":
    "Some stories are planned in the current or a future sprint, outside the {from} → {to} range",
  "Effort sur {range} : {effort} ({pct} % de la capacité {cap}j) · cumul dans l'ordre d'affichage : {cum}":
    "Effort over {range}: {effort} ({pct}% of the {cap}d capacity) · running total in display order: {cum}",
  "Capacité épuisée · {cap}j ({range})": "Capacity exhausted · {cap}d ({range})",
  "Cumul de l'effort des epics dans l'ordre d'affichage : tout ce qui est sous cette ligne ne tient pas dans la capacité de l'intervalle {range}.":
    "Running total of epic effort in display order: everything below this line does not fit in the {range} capacity.",
  "Réafficher (compter dans la charge)": "Show again (count in the load)",
  "Masquer (exclure de la charge)": "Hide (exclude from the load)",
  "Cliquer pour ouvrir le panneau · double-clic pour poser un flag":
    "Click to open the panel · double-click to drop a flag",
  "Glisser pour déplacer · double-clic pour un flag":
    "Drag to move · double-click for a flag",
  "Étirer/réduire le début": "Stretch/shrink the start",
  "Étirer/réduire la fin": "Stretch/shrink the end",
  "{val} ({field}) sur {iter}, hors de l'intervalle {from} → {to}":
    "{val} ({field}) on {iter}, outside the {from} → {to} range",
  Capa: "Cap",
  "Charge {total}j / capacité {cap}j · {sign}{delta}j · {pct}%":
    "Load {total}d / capacity {cap}d · {sign}{delta}d · {pct}%",
  "Capacité − effort : {sign}{delta}j": "Capacity − effort: {sign}{delta}d",
  "{range} · capacité {cap}j − effort {effort}j (charge en {field}{note} · personnes visibles, lignes masquées exclues)":
    "{range} · capacity {cap}d − effort {effort}d (load in {field}{note} · visible people, hidden rows excluded)",
};
