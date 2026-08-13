import { css } from "./css";
import * as M from "./ganttModel";
import type { Item, Iter, Person, Theme } from "./ganttModel";
import type { TicketComment } from "@moires/shared";
import { t, useLang, locale } from "../../i18n";

const C = css;
const mono = "'IBM Plex Mono',monospace";

/**
 * Id de la personne connectée dans le référentiel du board (= TeamMember.id,
 * soit System.AssignedTo.uniqueName). Le nom affiché sert de repli pour les
 * sessions dont le cookie a été émis avant l'ajout de uniqueName.
 */
export function resolveMyPersonId(
  user: { id: string; displayName: string; uniqueName?: string },
  people: { id: string; name: string }[],
): string | null {
  // ADO ne garantit pas la casse : l'email renvoyé par connectionData
  // (« Prenom.Nom@corp.com ») et celui porté par System.AssignedTo peuvent
  // différer sur ce seul point.
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  const keys = [norm(user.uniqueName), norm(user.id)].filter(Boolean);
  const p = people.find((x) => keys.includes(norm(x.id)) || norm(x.name) === norm(user.displayName));
  // Sans correspondance : null, pas l'uniqueName. Un id absent du référentiel ne
  // matche aucun ticket et affichait « aucun ticket assigné » au lieu de
  // « compte non rattaché ».
  return p?.id ?? null;
}

// HTML ADO → texte. On n'injecte jamais le HTML (une description peut contenir
// n'importe quel markup saisi dans ADO) : les sauts de ligne des blocs sont
// préservés, le reste est aplati.
// ponytail: texte brut ; passer à DOMPurify + dangerouslySetInnerHTML si le
// formatage riche (tableaux, images) devient nécessaire.
export function htmlToText(html?: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<li[^>]*>/gi, "\n• ")
    // `</li>` exclu : l'ouverture pose déjà le saut de ligne de la puce.
    .replace(/<\/(p|div|ul|ol|tr|h[1-6])>|<br\s*\/?>/gi, "\n");
  const text = new DOMParser().parseFromString(withBreaks, "text/html").body.textContent ?? "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * ADO n'a pas de champ « reviewer » : c'est un champ custom de type identité
 * (Reviewed By, Relecteur, Approbateur…) dont le referenceName varie d'un
 * process à l'autre. `field` fixe lequel lire ; sans lui, on retombe sur le nom
 * du champ — suffisant tant qu'un seul champ « review » existe dans le process.
 *
 * La valeur est comparée à l'email comme au nom affiché : selon le format
 * renvoyé, un champ identité arrive en « Prénom Nom » ou « Prénom Nom <email> ».
 */
const REVIEW_FIELD = /review|relect/i;

export function isMyReview(item: Item, me?: { id: string; name: string }, field?: string): boolean {
  if (!me || !item.custom) return false;
  const keys = [me.id, me.name].map((s) => s.trim().toLowerCase()).filter(Boolean);
  const holds = (val: unknown) => val != null && keys.some((k) => String(val).toLowerCase().includes(k));
  if (field) return holds(item.custom[field]);
  return Object.entries(item.custom).some(([ref, val]) => REVIEW_FIELD.test(ref) && holds(val));
}

const KICKER = "font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint,#71717c)";
const PANEL = "background:var(--panel,#fff);border:1px solid var(--line,#e8e8ee);border-radius:var(--r-xl,11px)";

function TypeBadge({ item, theme }: { item: Item; theme: Theme }) {
  const cm = M.colorMap(item.type, theme);
  return (
    <span style={C(`font-size:10px;font-weight:600;padding:2px 7px;border-radius:var(--r-md,7px);background:${cm.bg};border:1px solid ${cm.border};color:${cm.text};white-space:nowrap`)}>
      {M.typeLabels[item.type] || item.type}
    </span>
  );
}

function StatePill({ state }: { state: string }) {
  const col = M.stateColors[state] || "#8a8f98";
  return (
    <span style={C(`display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:500;color:var(--muted,#6b6b75);white-space:nowrap`)}>
      <span style={C(`width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:${col}`)} />
      {state}
    </span>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <div style={C(`${KICKER};margin-bottom:5px`)}>{label}</div>
      <div style={C("font-size:12.5px;line-height:1.55;color:var(--muted,#6b6b75);white-space:pre-wrap")}>{text}</div>
    </div>
  );
}

function Discussion({ comments }: { comments: TicketComment[] }) {
  return (
    <div>
      <div style={C(`${KICKER};margin-bottom:7px`)}>{t("Discussion")} ({comments.length})</div>
      <div style={C("display:flex;flex-direction:column;gap:9px")}>
        {comments.map((c) => (
          <div key={c.id} style={C("border-left:2px solid var(--line,#e8e8ee);padding-left:9px")}>
            <div style={C("display:flex;align-items:baseline;gap:7px")}>
              <span style={C("font-size:11.5px;font-weight:600;color:var(--ink,#1a1a20)")}>{c.author}</span>
              <span style={C(`font-family:${mono};font-size:10.5px;color:var(--faint,#71717c)`)}>
                {c.date ? new Date(c.date).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" }) : ""}
              </span>
            </div>
            <div style={C("font-size:12.5px;line-height:1.5;color:var(--muted,#6b6b75);white-space:pre-wrap")}>{htmlToText(c.text)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ item, theme, selected, onSelect, adoUrl, comments, note }: {
  item: Item; theme: Theme; selected: boolean; onSelect: (id: string) => void; adoUrl?: string;
  comments?: TicketComment[];
  /** Mention secondaire en tête de carte (l'assigné, sur une relecture). */
  note?: string;
}) {
  const cm = M.colorMap(item.type, theme);
  const desc = htmlToText(item.description);
  const ac = htmlToText(item.acceptanceCriteria);
  return (
    <div
      onClick={() => onSelect(item.id)}
      style={C(`${PANEL};border-left:3px solid ${cm.accent};box-shadow:${selected ? "0 0 0 2px var(--accentsoft,#ececfb)" : "0 1px 2px rgba(20,20,40,.05)"};padding:13px 15px;display:flex;flex-direction:column;gap:11px;cursor:pointer`)}
    >
      <div style={C("display:flex;align-items:center;gap:9px;flex-wrap:wrap")}>
        <TypeBadge item={item} theme={theme} />
        {adoUrl ? (
          <a href={`${adoUrl}/_workitems/edit/${item.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={C(`font-family:${mono};font-size:11px;color:var(--accent,#5b5bd6);text-decoration:none`)}>{item.ado}</a>
        ) : (
          <span style={C(`font-family:${mono};font-size:11px;color:var(--faint,#71717c)`)}>{item.ado}</span>
        )}
        {note && <span style={C(`font-size:11px;color:var(--faint,#71717c)`)}>{note}</span>}
        <div style={{ flex: 1 }} />
        <StatePill state={item.state} />
        {item.points > 0 && (
          <span style={C(`font-family:${mono};font-size:11px;color:var(--muted,#6b6b75)`)}>{item.points} p</span>
        )}
      </div>
      <div style={C("font-size:14px;font-weight:600;line-height:1.35;color:var(--ink,#1a1a20)")}>{item.title}</div>
      {(desc || ac || comments?.length) && (
        <div style={C("display:flex;flex-direction:column;gap:11px;padding-top:2px")}>
          <Field label={t("Description")} text={desc} />
          <Field label={t("Critères d'acceptation")} text={ac} />
          {!!comments?.length && <Discussion comments={comments} />}
        </div>
      )}
    </div>
  );
}

/** Intitulé de section de la colonne principale (affiché dès qu'il y en a deux). */
function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <div style={C("display:flex;align-items:baseline;gap:8px;padding:6px 2px 0")}>
      <span style={C(KICKER)}>{label}</span>
      <span style={C(`font-family:${mono};font-size:11px;color:var(--faint,#71717c)`)}>{count}</span>
      <div style={C("flex:1;height:1px;background:var(--line,#e8e8ee)")} />
    </div>
  );
}

export function MyBoard({ items, people, iters, current, theme, userName, myId, selectedId, onSelect, adoUrl, comments, reviewField, onReviewField }: {
  items: Item[];
  people: Person[];
  iters: Iter[];
  current: number;
  theme: Theme;
  userName: string;
  myId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  adoUrl?: string;
  /** Discussions ADO par id de ticket (chargées à la demande par le parent). */
  comments?: Record<string, TicketComment[]>;
  /** Champ ADO portant le relecteur ("" = détection sur le nom du champ). */
  reviewField?: string;
  onReviewField?: (ref: string) => void;
}) {
  useLang();
  const me = people.find((p) => p.id === myId);
  const mine = items.filter((it) => it.person === myId);
  const ofIter = (i: number) => mine.filter((it) => it.iter === i).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const cur = ofIter(current);
  const next = ofIter(current + 1);
  // Relectures du sprint courant : mes tickets assignés en sont exclus (ils sont
  // déjà dans la colonne principale).
  const reviews = items
    .filter((it) => it.iter === current && it.person !== myId && isMyReview(it, me, reviewField))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  // Champs ADO proposables : ceux réellement portés par les tickets du board. Un
  // champ vide partout n'aurait de toute façon aucune relecture à afficher.
  const customRefs = [...new Set(items.flatMap((it) => Object.keys(it.custom ?? {})))].sort();
  const points = cur.reduce((s, it) => s + it.points, 0);
  const done = cur.filter((it) => M.stateProgress(it.state) >= 1).length;

  const stat = (value: string, label: string) => (
    <div style={C("display:flex;flex-direction:column;gap:2px")}>
      <div style={C(`font-family:${mono};font-size:16px;font-weight:600;color:var(--ink,#1a1a20);line-height:1`)}>{value}</div>
      <div style={C(KICKER)}>{label}</div>
    </div>
  );

  return (
    <div style={C("flex:1;overflow:auto;background:var(--canvas,#f4f4f7)")}>
      <div style={C("max-width:1680px;margin:0 auto;padding:20px 18px 40px;display:flex;flex-direction:column;gap:16px")}>
        {/* Bandeau identité + compteurs — même langage visuel que les jauges du board */}
        <div style={C(`${PANEL};padding:15px 18px;display:flex;align-items:center;gap:18px;flex-wrap:wrap`)}>
          <div style={C(`width:38px;height:38px;border-radius:50%;flex:0 0 auto;background:${me?.color || "var(--accent,#5b5bd6)"};color:${me?.color ? M.onColor(me.color) : "#fff"};font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center`)}>
            {me?.initials || userName.slice(0, 1).toUpperCase()}
          </div>
          <div style={C("min-width:0")}>
            <div style={C("font-size:15px;font-weight:600;color:var(--ink,#1a1a20)")}>{me?.name || userName}</div>
            <div style={C("font-size:12px;color:var(--muted,#6b6b75)")}>{me?.role || me?.teamRole || t("Mes tickets du sprint")}</div>
          </div>
          <div style={C("width:1px;height:32px;background:var(--line,#e8e8ee)")} />
          {stat(String(cur.length), t("Tickets"))}
          {stat(String(points), t("Points"))}
          {stat(`${done}/${cur.length}`, t("Terminés"))}
          {stat(String(reviews.length), t("À relire"))}
          {/* Source des relectures : « Reviewed By » est un champ custom, son
              referenceName dépend du process ADO. Toujours accessible ici, même
              quand la détection automatique ne trouve rien. */}
          {onReviewField && (
            <select
              value={reviewField ?? ""}
              onChange={(e) => onReviewField(e.target.value)}
              aria-label={t("Champ ADO du relecteur")}
              title={reviewField || t("Champ ADO du relecteur")}
              style={C("align-self:center;max-width:160px;height:26px;padding:0 6px;border-radius:var(--r-md,7px);border:1px solid var(--line,#e8e8ee);background:var(--panel2,#fafafc);color:var(--muted,#6b6b75);font-size:11px;cursor:pointer")}
            >
              <option value="">{t("Détection auto")}</option>
              {customRefs.map((ref) => (
                <option key={ref} value={ref}>{ref.split(".").pop()}</option>
              ))}
            </select>
          )}
          <div style={{ flex: 1 }} />
          {iters[current] && (
            <div style={C("text-align:right")}>
              <div style={C(KICKER)}>{t("Sprint en cours")}</div>
              <div style={C("font-size:13px;font-weight:600;color:var(--ink,#1a1a20)")}>
                {iters[current].label} <span style={C(`font-weight:400;color:var(--muted,#6b6b75);font-family:${mono};font-size:11px`)}>· {iters[current].dates}</span>
              </div>
            </div>
          )}
        </div>

        <div style={C("display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap")}>
          {/* Sprint en cours — détail complet. Assignés puis relectures : deux
              sections du même flux, intitulées seulement quand les deux existent
              (un chef de projet n'a que des relectures, un dev que des assignés). */}
          <div style={C("flex:1 1 560px;min-width:0;display:flex;flex-direction:column;gap:12px")}>
            {cur.length === 0 && reviews.length === 0 ? (
              <div style={C(`${PANEL};padding:22px;text-align:center;font-size:13px;color:var(--muted,#6b6b75)`)}>
                {myId ? t("Aucun ticket ne vous est assigné sur ce sprint.") : t("Votre compte n'est rattaché à aucun membre de l'équipe.")}
              </div>
            ) : (
              <>
                {cur.length > 0 && reviews.length > 0 && <SectionHead label={t("Mes tickets")} count={cur.length} />}
                {cur.map((it) => (
                  <Card key={it.id} item={it} theme={theme} selected={selectedId === it.id} onSelect={onSelect} adoUrl={adoUrl} comments={comments?.[it.id]} />
                ))}
                {cur.length > 0 && reviews.length > 0 && <SectionHead label={t("À relire")} count={reviews.length} />}
                {reviews.map((it) => (
                  <Card key={it.id} item={it} theme={theme} selected={selectedId === it.id} onSelect={onSelect} adoUrl={adoUrl} comments={comments?.[it.id]}
                    note={`${t("Assigné à")} ${nameOf(it.person)}`} />
                ))}
              </>
            )}
          </div>

          {/* Sprint suivant — aperçu compact */}
          <div style={C("flex:0 1 320px;min-width:260px;display:flex;flex-direction:column;gap:10px")}>
            <div style={C("display:flex;align-items:baseline;gap:8px;padding:0 2px")}>
              <span style={C(KICKER)}>{t("Sprint suivant")}</span>
              <span style={C("font-size:12px;font-weight:600;color:var(--ink,#1a1a20)")}>{iters[current + 1]?.label ?? "—"}</span>
            </div>
            <div style={C(`${PANEL};padding:6px`)}>
              {!iters[current + 1] || next.length === 0 ? (
                <div style={C("padding:16px;text-align:center;font-size:12.5px;color:var(--muted,#6b6b75)")}>
                  {iters[current + 1] ? t("Rien de prévu pour vous.") : t("Aucun sprint planifié après celui-ci.")}
                </div>
              ) : (
                next.map((it) => (
                  <div
                    key={it.id}
                    onClick={() => onSelect(it.id)}
                    style={C(`padding:9px 10px;border-radius:var(--r-lg,9px);display:flex;flex-direction:column;gap:6px;cursor:pointer;background:${selectedId === it.id ? "var(--accentsoft,#ececfb)" : "transparent"}`)}
                  >
                    <div style={C("display:flex;align-items:center;gap:8px")}>
                      <TypeBadge item={it} theme={theme} />
                      <span style={C(`font-family:${mono};font-size:11px;color:var(--faint,#71717c)`)}>{it.ado}</span>
                      <div style={{ flex: 1 }} />
                      {it.points > 0 && <span style={C(`font-family:${mono};font-size:11px;color:var(--muted,#6b6b75)`)}>{it.points} p</span>}
                    </div>
                    <div style={C("font-size:12.5px;font-weight:500;line-height:1.35;color:var(--ink,#1a1a20)")}>{it.title}</div>
                    <StatePill state={it.state} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
