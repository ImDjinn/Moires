# Design Plan — Moires (Gantt collaboratif temps réel)

> Plan de design UI/UX. Couvre l'écran, l'interaction et le système visuel.
> Le plan technique vit dans [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

---

## 1. Goal

Donner à une équipe en sprint planning une vue Gantt unique et lisible où l'on **voit la charge de chacun** et où **déplacer/étirer un ticket est instantané et collaboratif** (présence façon Figma), sans jamais douter de l'état de synchronisation avec Azure DevOps.

---

## 2. Constraints

- **Une seule surface de travail** : pas de modale qui masque le board pendant l'édition ; le lobby est l'unique étape avant le board.
- **Feedback immédiat** : tout drag/resize est optimiste à l'écran avant l'ack serveur (cohérent avec les règles `/frontend`).
- **Lisibilité de la charge** prioritaire sur l'esthétique : la surcharge (>100% capacité) doit sauter aux yeux.
- **Accessibilité** : barres du Gantt navigables au clavier (flèches = déplacement, Shift+flèches = resize), focus visible, contraste AA.
- **Densité maîtrisée** : un sprint = jusqu'à ~10 membres × ~40 tickets doit tenir sans scroll horizontal infini ingérable (zoom temporel jour/semaine).
- **Couleurs de présence stables** : la couleur d'un utilisateur (`avatar_color`) est attribuée à la connexion et ne change pas pendant la session.
- **Pas de dépendance UI lourde** : composants maison + dnd-kit ; pas de librairie Gantt tierce (le rendu est custom car couplé à la présence temps réel).

---

## 3. Écrans & layout

### 3.1 Carte des écrans

```
[AuthGuard] → non connecté ─→ LoginButton (plein écran, centré)
            → connecté ─────→ [SessionLobby] ──onEnter──→ [Board live]
```

### 3.2 SessionLobby

3 sélecteurs en cascade, en colonne centrée (max-width 560px) :
`Projet ADO` → `Itération(s)` (multi-select pour release planning) → `Areas` (multi, optionnel) → bouton **« Entrer dans la session »**.
État de chargement par étape (skeleton). Erreur ADO = bandeau inline non bloquant.

### 3.3 Board live — grille

```
┌──────────────┬─────────────────────────────────────────────┐
│  [Toolbar]   │  zoom jour/semaine · filtres · participants  │  ← 56px
├──────────────┼─────────────────────────────────────────────┤
│              │  TimelineHeader (jours/semaines)             │  ← 40px, sticky top
│  Colonne     ├─────────────────────────────────────────────┤
│  membres     │                                              │
│  (avatars +  │   GanttBoard : 1 ligne par membre,           │
│   capacité)  │   barres = TicketBar, grille verticale=jours │
│  sticky left │   PresenceLayer en overlay (curseurs)        │
│              │                                              │
├──────────────┼─────────────────────────────────────────────┤
│              │  LoadHistogram : 1 colonne empilée / jour    │  ← 120px, sticky bottom
│              │  aligné au pixel avec la timeline            │
└──────────────┴─────────────────────────────────────────────┘
```

- Colonne membres figée à gauche, TimelineHeader figé en haut, LoadHistogram figé en bas → seul le centre scrolle.
- Une **ligne « Non assigné »** en tête de la colonne membres reçoit les tickets `assigneeId = null`.
- Largeur d'un jour `dayWidthPx` : 40px (zoom jour) / ~12px (zoom semaine).

---

## 4. Système visuel

### 4.1 Tokens (CSS variables)

```
--bg:            #0F1115   /* fond board (dark, façon outil pro) */
--surface:       #171A21   /* lignes paires, panneaux */
--surface-alt:   #1E2230   /* lignes impaires (zébrage léger) */
--border:        #2A2F3A
--text:          #E6E8EC
--text-muted:    #8A92A6
--grid-line:     #232733   /* séparateurs de jours */
--grid-weekend:  #14161C   /* colonnes week-end assombries */
--accent:        #4C8DFF   /* sélection, focus */
--radius-bar:    6px
--bar-height:    28px
--row-height:    44px
```

### 4.2 Statuts de synchronisation (couleur + forme, jamais couleur seule)

| Statut | Visuel sur la barre | Pastille |
|---|---|---|
| `synced` | bord plein | ● vert `#3FB950` |
| `pending` | bord plein + pastille animée (pulse) | ◐ ambre `#D29922` |
| `error` | bord pointillé rouge + icône ⚠ cliquable | ▲ rouge `#F85149` |

### 4.3 Charge (LoadHistogram)

Barre empilée par jour, hauteur = somme `estimateHours` des tickets du membre survolé / de tous :
- ≤ 80% capacité → vert `#3FB950`
- 80–100% → ambre `#D29922`
- > 100% → rouge `#F85149` + liseré supérieur clignotant léger (signal de surcharge).
Ligne de capacité (100%) tracée en pointillés `--text-muted`.

### 4.4 Présence (façon Figma)

- Curseur distant = flèche colorée (`PresenceState.color`) + étiquette `displayName`.
- Ticket en cours d'édition par un pair = halo coloré 2px autour de la `TicketBar` + mini-avatar dans le coin sup-droit.
- Avatars des participants connectés alignés dans la toolbar (overflow `+N`).

---

## 5. Design d'interaction

### 5.1 Drag (changement d'assigné)

`mousedown` → la barre se soulève (ombre + scale 1.02), émission `presence:update{action:"dragging"}` ; pendant le move → snap vertical sur la ligne survolée, `LoadHistogram` recalcule en direct la colonne source et cible ; `drop` → barre repositionnée optimiste, `Operation{field:"assigneeId"}` émise, pastille passe `pending`.

### 5.2 Resize (changement de dates)

Poignées 8px aux bords gauche/droit (curseur `ew-resize`), apparaissent au hover. Drag → snap au jour ; bord gauche modifie `startDate`, bord droit `endDate`. La barre ne peut pas passer `endDate < startDate` (largeur min = 1 jour). Émet l'`Operation` correspondante au relâchement.

### 5.3 Réception d'une opération distante

La barre concernée fait une transition douce (200ms) vers sa nouvelle position/ligne ; si un pair écrase un champ que l'utilisateur vient de modifier → toast discret bas-droite : « {nom} a modifié ce ticket » (non bloquant, Phase 2).

### 5.4 États de connexion

- **Connecté** : indicateur vert discret dans la toolbar.
- **Reconnexion en cours** : bandeau ambre « Reconnexion… », board grisé/non-interactif, puis re-snapshot transparent au retour.
- **Opération rejetée** : la barre revient à sa position d'origine (rollback animé) + toast d'erreur.

### 5.5 Clavier / accessibilité

- `Tab` parcourt les `TicketBar` ; focus = anneau `--accent`.
- `←/→` déplace d'un jour, `Shift+←/→` resize d'un jour, `↑/↓` change de membre.
- Toute action clavier émet la même `Operation` que la souris.

---

## 6. Component contracts (vue design)

Les props sont définies en §4.5 de [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). États visuels que chaque composant doit gérer :

| Composant | États à rendre |
|---|---|
| `LoginButton` | idle, loading (redirection) |
| `SessionLobby` | loading par sélecteur, vide, erreur ADO, prêt |
| `TimelineHeader` | zoom jour / zoom semaine, mise en évidence week-ends |
| `GanttBoard` | vide (aucun ticket), peuplé, ligne « Non assigné » |
| `TicketBar` | normal, hover (poignées), focus clavier, dragging, resizing, édité-par-pair (halo) + 3 `syncStatus` |
| `LoadHistogram` | sous-charge / proche capacité / surcharge, ligne de capacité |
| `PresenceLayer` | 0..N curseurs, étiquette nom, débordement avatars |
| `SyncStatusIndicator` | synced / pending(pulse) / error(+retry) |

---

## 7. Couverture des features (mapping design ↔ phases)

- **MVP** : Lobby, GanttBoard lecture, drag assigné, resize dates, LoadHistogram, SyncStatusIndicator, tokens visuels §4.
- **Phase 2** : PresenceLayer complet (curseurs/halo), toast de conflit §5.3, bandeau reconnexion §5.4, filtres toolbar, vue release multi-sprints (même timeline).
- **Phase 3** : alerte surcharge proactive (≥ capacité), undo/redo visuel, comparaison avant/après de session.

---

## 8. Pre-handoff checklist

- ✓ Chaque écran et zone de layout est spécifié (§3) avec dimensions/sticky.
- ✓ Système visuel chiffré : tokens, statuts, seuils de charge (§4).
- ✓ Chaque interaction (drag, resize, distant, reco, clavier) décrite sans ambiguïté (§5).
- ✓ États visuels par composant énumérés (§6) — testables un par un.
- ✓ Couleur jamais porteuse seule d'information (forme + icône en complément) → AA.
- ✓ Découpage MVP/Phase 2/3 aligné sur le catalogue de features (§7).
