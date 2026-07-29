import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MyBoard, resolveMyPersonId, htmlToText } from "./MyBoard";
import type { Item, Iter, Person } from "./ganttModel";

const people: Person[] = [
  { id: "alice@corp.com", name: "Alice Beaumont", role: "Backend", initials: "AB", color: "#6366f1", cap: [5, 5] },
  { id: "bob@corp.com", name: "Bob Martin", role: "", initials: "BM", color: "#14b8a6", cap: [5, 5] },
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
  item({ id: "3", title: "US de Bob", person: "bob@corp.com" }),
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

  it("affiche description et critères d'acceptation en texte", () => {
    view();
    expect(screen.getByText("Le but")).toBeInTheDocument();
    expect(screen.getByText("• Vert")).toBeInTheDocument();
  });

  it("annonce l'absence de rattachement quand l'utilisateur n'est pas dans l'équipe", () => {
    render(
      <MyBoard items={items} people={people} iters={iters} current={0} theme="light"
        userName="Inconnu" myId={null} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText(/rattaché à aucun membre/)).toBeInTheDocument();
  });
});
