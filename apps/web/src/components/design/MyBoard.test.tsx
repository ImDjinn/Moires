import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MyBoard, resolveMyPersonId, htmlToText, isMyReview } from "./MyBoard";
import type { Item, Iter, Person } from "./ganttModel";

const people: Person[] = [
  { id: "alice@corp.com", name: "Alice Beaumont", role: "Backend", initials: "AB", color: "#6366f1", cap: [5, 5] },
  { id: "bob@corp.com", name: "Bob Martin", role: "", initials: "BM", color: "#14b8a6", cap: [5, 5] },
  // Chef de projet : relit, n'est assigné à rien.
  { id: "chloe@corp.com", name: "Chloé Dupont", role: "PO", initials: "CD", color: "#f59e0b", cap: [0, 0] },
];

const iters: Iter[] = [
  { label: "Sprint 1", short: "It.1", dates: "15 juin – 26 juin", sub: "", iso: ["2026-06-15", "2026-06-26"] },
  { label: "Sprint 2", short: "It.2", dates: "29 juin – 10 juil.", sub: "", iso: ["2026-06-29", "2026-07-10"] },
];

function item(p: Partial<Item>): Item {
  return {
    id: "1", ado: "#1", level: "story", type: "story", title: "US", points: 3, effortDays: 0,
    person: "alice@corp.com", iter: 0, span: 1, state: "Active", progress: 0.5, parent: null, tags: [],
    startISO: "2026-06-15", endISO: "2026-06-26", area: "P\\A", ...p,
  };
}

const items: Item[] = [
  item({ id: "1", title: "Mon US du sprint", description: "<p>Le but</p>", acceptanceCriteria: "<ul><li>Vert</li></ul>" }),
  item({ id: "2", title: "Ma tâche du sprint suivant", iter: 1 }),
  item({ id: "3", title: "US de Bob", person: "bob@corp.com", custom: { "Custom.Reviewer": "Chloé Dupont" } }),
  item({ id: "4", title: "US à relire", person: "bob@corp.com", custom: { "Custom.Reviewer": "Alice Beaumont" } }),
];

describe("resolveMyPersonId", () => {
  it("relie l'utilisateur à sa personne par uniqueName (l'id de session est un uuid Postgres)", () => {
    expect(resolveMyPersonId({ id: "db-uuid", displayName: "Alice Beaumont", uniqueName: "alice@corp.com" }, people)).toBe("alice@corp.com");
  });

  it("retombe sur le nom affiché pour les cookies émis sans uniqueName", () => {
    expect(resolveMyPersonId({ id: "db-uuid", displayName: "Bob Martin" }, people)).toBe("bob@corp.com");
  });

  it("ignore la casse (ADO renvoie l'email différemment selon l'API)", () => {
    expect(resolveMyPersonId({ id: "db-uuid", displayName: "X", uniqueName: "Alice@Corp.com" }, people)).toBe("alice@corp.com");
  });

  it("renvoie null hors du référentiel d'équipe", () => {
    expect(resolveMyPersonId({ id: "db-uuid", displayName: "Inconnu" }, people)).toBeNull();
  });
});

describe("htmlToText", () => {
  it("aplatit le HTML ADO sans l'injecter et garde les sauts de bloc", () => {
    expect(htmlToText("<p>Ligne 1</p><p>Ligne 2</p>")).toBe("Ligne 1\nLigne 2");
    expect(htmlToText("<ul><li>A</li><li>B</li></ul>")).toBe("• A\n• B");
    expect(htmlToText("<img src=x onerror=alert(1)>Texte")).toBe("Texte");
    expect(htmlToText(undefined)).toBe("");
  });
});

describe("isMyReview", () => {
  const me = people[0];

  it("reconnaît le champ custom identité quel que soit son referenceName", () => {
    expect(isMyReview(item({ custom: { "Custom.Reviewer": "Alice Beaumont" } }), me)).toBe(true);
    expect(isMyReview(item({ custom: { "Custom.Relecteur": "alice@corp.com" } }), me)).toBe(true);
    // Format « Nom <email> » de certains champs identité.
    expect(isMyReview(item({ custom: { "Custom.CodeReview": "Alice Beaumont <alice@corp.com>" } }), me)).toBe(true);
  });

  it("champ explicite : ne lit que celui-là, l'heuristique ne s'applique plus", () => {
    const it4 = item({ custom: { "Custom.Reviewer": "Alice Beaumont", "Custom.Approbateur": "Bob Martin" } });
    expect(isMyReview(it4, me, "Custom.Reviewer")).toBe(true);
    expect(isMyReview(it4, me, "Custom.Approbateur")).toBe(false);
    expect(isMyReview(it4, me, "Custom.Absent")).toBe(false);
  });

  it("ignore un autre relecteur, un autre champ, ou l'absence de champ", () => {
    expect(isMyReview(item({ custom: { "Custom.Reviewer": "Bob Martin" } }), me)).toBe(false);
    expect(isMyReview(item({ custom: { "Custom.Demandeur": "Alice Beaumont" } }), me)).toBe(false);
    expect(isMyReview(item({}), me)).toBe(false);
    expect(isMyReview(item({ custom: { "Custom.Reviewer": "Alice Beaumont" } }), undefined)).toBe(false);
  });
});

describe("MyBoard", () => {
  const view = () =>
    render(
      <MyBoard items={items} people={people} iters={iters} current={0} theme="light"
        userName="Alice Beaumont" myId="alice@corp.com" selectedId={null} onSelect={() => {}} />,
    );

  it("sépare mes tickets du sprint courant et du suivant, et ignore ceux des autres", () => {
    view();
    expect(screen.getByText("Mon US du sprint")).toBeInTheDocument();
    expect(screen.getByText("Ma tâche du sprint suivant")).toBeInTheDocument();
    expect(screen.queryByText("US de Bob")).not.toBeInTheDocument();
  });

  it("liste les tickets des autres où je suis reviewer, avec leur assigné", () => {
    view();
    expect(screen.getByText("US à relire")).toBeInTheDocument();
    expect(screen.getByText("Assigné à Bob Martin")).toBeInTheDocument();
    // Les deux sections coexistent → intitulés affichés ("À relire" est aussi un
    // compteur du bandeau, d'où les deux occurrences).
    expect(screen.getByText("Mes tickets")).toBeInTheDocument();
    expect(screen.getAllByText("À relire")).toHaveLength(2);
  });

  it("propose les champs ADO présents sur les tickets et remonte le choix", () => {
    const onReviewField = vi.fn();
    render(
      <MyBoard items={items} people={people} iters={iters} current={0} theme="light"
        userName="Alice Beaumont" myId="alice@corp.com" selectedId={null} onSelect={() => {}}
        reviewField="" onReviewField={onReviewField} />,
    );
    const select = screen.getByLabelText("Champ ADO du relecteur");
    expect([...select.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Détection auto", "Reviewer"]);
    fireEvent.change(select, { target: { value: "Custom.Reviewer" } });
    expect(onReviewField).toHaveBeenCalledWith("Custom.Reviewer");
  });

  it("sans onReviewField (mock), pas de sélecteur", () => {
    view();
    expect(screen.queryByLabelText("Champ ADO du relecteur")).not.toBeInTheDocument();
  });

  it("chef de projet (relectures seules) : pas de message de vide, pas d'intitulés de section", () => {
    render(
      <MyBoard items={items} people={people} iters={iters} current={0} theme="light"
        userName="Chloé Dupont" myId="chloe@corp.com" selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText("US de Bob")).toBeInTheDocument();
    expect(screen.queryByText(/assigné sur ce sprint/)).not.toBeInTheDocument();
    expect(screen.queryByText("Mes tickets")).not.toBeInTheDocument();
    expect(screen.getAllByText("À relire")).toHaveLength(1); // le compteur du bandeau seul
  });

  it("affiche description et critères d'acceptation en texte", () => {
    view();
    expect(screen.getByText("Le but")).toBeInTheDocument();
    expect(screen.getByText("• Vert")).toBeInTheDocument();
  });

  it("affiche la discussion sans sélection préalable", () => {
    render(
      <MyBoard items={items} people={people} iters={iters} current={0} theme="light"
        userName="Alice Beaumont" myId="alice@corp.com" selectedId={null} onSelect={() => {}}
        comments={{ "1": [{ id: 1, author: "Bob", text: "<p>Vu</p>", date: "2026-06-20T10:00:00Z" }] }} />,
    );
    expect(screen.getByText("Discussion (1)")).toBeInTheDocument();
    expect(screen.getByText("Vu")).toBeInTheDocument();
  });

  it("annonce l'absence de rattachement quand l'utilisateur n'est pas dans l'équipe", () => {
    render(
      <MyBoard items={items} people={people} iters={iters} current={0} theme="light"
        userName="Inconnu" myId={null} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText(/rattaché à aucun membre/)).toBeInTheDocument();
  });
});
