import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { OperationFieldKey, TeamMember } from "@moirai/shared";
import { AdoMapper, KNOWN_FIELDS, RawAdoWorkItem } from "./ado.mapper";

// Base for cross-organization identity APIs (profile + accounts).
const VSSPS_BASE = "https://app.vssps.visualstudio.com";

/** Jours ouvrés (lun–ven) entre deux dates ISO incluses, bornés à [lo, hi]. */
function workingDays(startIso: string, endIso: string, lo?: string, hi?: string): number {
  let s = startIso.slice(0, 10), e = endIso.slice(0, 10);
  if (lo && s < lo) s = lo;
  if (hi && e > hi) e = hi;
  let count = 0;
  const d = new Date(`${s}T00:00:00Z`);
  const end = new Date(`${e}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

@Injectable()
export class AdoService {
  constructor(private mapper: AdoMapper) {}

  private orgUrl(org: string): string {
    return `https://dev.azure.com/${org}`;
  }

  private async adoFetch(url: string, token: string, options?: RequestInit) {
    if (!token) {
      throw new UnauthorizedException("Session Azure DevOps absente — reconnectez-vous.");
    }
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      // 401/203 = token invalide/expiré côté ADO.
      if (res.status === 401 || res.status === 203) {
        throw new UnauthorizedException("Session Azure DevOps expirée ou invalide — reconnectez-vous.");
      }
      throw new Error(`ADO API error: ${res.status} ${await res.text()}`);
    }
    // Token expiré : ADO redirige (302 suivi) vers une page HTML de connexion,
    // renvoyée en 200. On l'attrape ici au lieu de crasher sur un JSON.parse('<...').
    try {
      return await res.json();
    } catch {
      throw new UnauthorizedException("Session Azure DevOps expirée ou invalide — reconnectez-vous.");
    }
  }

  async getProfile(token: string): Promise<{ id: string; displayName: string }> {
    const data = await this.adoFetch(
      `${VSSPS_BASE}/_apis/profile/profiles/me?api-version=7.1`,
      token,
    );
    return { id: data.id, displayName: data.displayName };
  }

  async getOrganizations(token: string): Promise<{ id: string; name: string }[]> {
    const profile = await this.getProfile(token);
    const data = await this.adoFetch(
      `${VSSPS_BASE}/_apis/accounts?memberId=${profile.id}&api-version=7.1`,
      token,
    );
    return (data.value as any[]).map((a: any) => ({ id: a.accountId, name: a.accountName }));
  }

  async getProjects(org: string, token: string) {
    const data = await this.adoFetch(`${this.orgUrl(org)}/_apis/projects?api-version=7.1`, token);
    return (data.value as any[]).map((p: any) => ({ id: p.id, name: p.name }));
  }

  async getIterations(org: string, projectId: string, token: string) {
    const data = await this.adoFetch(
      `${this.orgUrl(org)}/${projectId}/_apis/work/teamsettings/iterations?api-version=7.1`,
      token,
    );
    return (data.value as any[]).map((i: any) => ({
      id: i.id,
      name: i.name,
      path: i.path,
      startDate: i.attributes?.startDate,
      finishDate: i.attributes?.finishDate,
    }));
  }

  async getAreas(org: string, projectId: string, token: string) {
    const data = await this.adoFetch(
      `${this.orgUrl(org)}/${projectId}/_apis/wit/classificationnodes/Areas?$depth=10&api-version=7.1`,
      token,
    );
    const paths: string[] = [];
    const walk = (node: any, prefix: string) => {
      const fullPath = prefix ? `${prefix}\\${node.name}` : node.name;
      paths.push(fullPath);
      if (node.children) node.children.forEach((c: any) => walk(c, fullPath));
    };
    walk(data, "");
    return paths.map((p) => ({ path: p }));
  }

  async getTeamMembers(org: string, projectId: string, token: string): Promise<TeamMember[]> {
    const data = await this.adoFetch(
      `${this.orgUrl(org)}/_apis/projects/${projectId}/teams?api-version=7.1`,
      token,
    );
    const teams = data.value as any[];
    if (!teams.length) return [];
    const teamId = teams[0].id;
    const members = await this.adoFetch(
      `${this.orgUrl(org)}/_apis/projects/${projectId}/teams/${teamId}/members?api-version=7.1`,
      token,
    );
    return (members.value as any[]).map((m: any) => ({
      id: m.identity.uniqueName || m.identity.id,
      displayName: m.identity.displayName,
      capacityHoursPerDay: 8,
    }));
  }

  async queryWorkItemIds(
    org: string,
    projectId: string,
    iterationIds: string[],
    token: string,
    areaPaths?: string[],
  ): Promise<string[]> {
    const iterations = await this.getIterations(org, projectId, token);
    const pathById = new Map(iterations.map((i) => [i.id, i.path]));
    const iterationClauses = iterationIds
      .map((id) => pathById.get(id))
      .filter((path): path is string => !!path)
      .map((path) => `[System.IterationPath] = '${path}'`)
      .join(" OR ");
    let wiql = `SELECT [System.Id] FROM WorkItems WHERE (${iterationClauses})`;
    if (areaPaths?.length) {
      const areaClauses = areaPaths.map((p) => `[System.AreaPath] = '${p}'`).join(" OR ");
      wiql += ` AND (${areaClauses})`;
    }
    const data = await this.adoFetch(
      `${this.orgUrl(org)}/${projectId}/_apis/wit/wiql?api-version=7.1`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ query: wiql }),
      },
    );
    return (data.workItems as any[]).map((wi: any) => String(wi.id));
  }

  // Sans `fields`, workitemsbatch renvoie tous les champs (dont les champs
  // custom des process hérités) — requis pour Ticket.customFields.
  // MAIS System.Parent n'est jamais renvoyé sans demande explicite (vérifié
  // contre l'API) : $expand=relations le fait réapparaître dans fields.
  async getWorkItemsBatch(
    org: string,
    ids: string[],
    token: string,
    fields?: string[],
  ): Promise<RawAdoWorkItem[]> {
    const results: RawAdoWorkItem[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const data = await this.adoFetch(
        `${this.orgUrl(org)}/_apis/wit/workitemsbatch?api-version=7.1`,
        token,
        {
          method: "POST",
          body: JSON.stringify(fields ? { ids: batch.map(Number), fields } : { ids: batch.map(Number), $expand: "relations" }),
        },
      );
      results.push(...(data.value as RawAdoWorkItem[]));
    }
    return results;
  }

  /**
   * Remonte la hiérarchie System.Parent de chaque work item jusqu'au premier
   * ancêtre de type "Epic". Renvoie une map ticketId -> { id, title } de l'Epic.
   * Les items sans Epic ancêtre sont absents de la map.
   */
  async resolveEpics(
    org: string,
    items: RawAdoWorkItem[],
    token: string,
  ): Promise<Map<string, { id: string; title: string }>> {
    type Node = { parentId: string | null; type: string; title: string };
    const nodes = new Map<string, Node>();

    const register = (raw: RawAdoWorkItem) => {
      const parent = raw.fields["System.Parent"];
      nodes.set(String(raw.id), {
        parentId: parent != null ? String(parent) : null,
        type: raw.fields["System.WorkItemType"] ?? "",
        title: raw.fields["System.Title"] ?? "",
      });
    };
    items.forEach(register);

    // BFS ascendant : on récupère les parents par niveau jusqu'à épuisement.
    let frontier = [
      ...new Set(
        items
          .map((i) => i.fields["System.Parent"])
          .filter((p): p is string | number => p != null)
          .map(String),
      ),
    ];
    let depth = 0;
    while (frontier.length && depth < 10) {
      const missing = frontier.filter((id) => !nodes.has(id));
      if (!missing.length) break;
      const parents = await this.getWorkItemsBatch(org, missing, token, [
        "System.Id", "System.Title", "System.WorkItemType", "System.Parent",
      ]);
      parents.forEach(register);
      frontier = parents
        .map((p) => p.fields["System.Parent"])
        .filter((p): p is string | number => p != null)
        .map(String);
      depth++;
    }

    const result = new Map<string, { id: string; title: string }>();
    for (const item of items) {
      let cursor = nodes.get(String(item.id))?.parentId ?? null;
      let walked = 0;
      while (cursor && walked < 10) {
        const node = nodes.get(cursor);
        if (!node) break;
        if (node.type === "Epic") {
          result.set(String(item.id), { id: cursor, title: node.title });
          break;
        }
        cursor = node.parentId;
        walked++;
      }
    }
    return result;
  }

  /**
   * Types de work item par défaut des catégories de backlog (Epic/Feature/
   * Requirement/Task) du process du projet. Permet de récupérer les états réels
   * de chaque niveau même quand aucun ticket de ce type n'est présent.
   */
  async getBacklogTypes(org: string, projectId: string, token: string): Promise<string[]> {
    const wanted = new Set([
      "Microsoft.EpicCategory",
      "Microsoft.FeatureCategory",
      "Microsoft.RequirementCategory",
      "Microsoft.TaskCategory",
    ]);
    const data = await this.adoFetch(
      `${this.orgUrl(org)}/${projectId}/_apis/wit/workitemtypecategories?api-version=7.1`,
      token,
    );
    return (data.value as any[])
      .filter((c: any) => wanted.has(c.referenceName))
      .map((c: any) => c.defaultWorkItemType?.name)
      .filter(Boolean);
  }

  /**
   * Colonnes des boards de l'équipe par défaut (Epics/Features/Stories…), dans
   * l'ordre du board, avec l'état ADO réel à écrire quand une carte y est
   * déposée (stateMappings). Une entrée par (colonne, type de work item).
   * Ce sont les vraies colonnes affichées dans ADO (ex: "To Do/Doing/Done" ou
   * une colonne custom "Blocked"), pas les états des types.
   */
  async getBoardColumns(
    org: string,
    projectId: string,
    token: string,
  ): Promise<{ name: string; category: string; color: string; type: string; state: string; columnField: string }[]> {
    const COLORS: Record<string, string> = { incoming: "#8a8f98", inProgress: "#0072B2", outgoing: "#009E73" };
    const CATS: Record<string, string> = { incoming: "Proposed", inProgress: "InProgress", outgoing: "Completed" };
    const boards = await this.adoFetch(
      `${this.orgUrl(org)}/${projectId}/_apis/work/boards?api-version=7.1`,
      token,
    );
    const out: { name: string; category: string; color: string; type: string; state: string; columnField: string }[] = [];
    for (const b of (boards.value as any[]) ?? []) {
      const board = await this.adoFetch(
        `${this.orgUrl(org)}/${projectId}/_apis/work/boards/${b.id}?api-version=7.1`,
        token,
      );
      // Champ Kanban du board (WEF_xxx_Kanban.Column) : écrit au drop pour
      // déplacer la carte de colonne (System.BoardColumn est en lecture seule).
      const columnField = board.fields?.columnField?.referenceName || "";
      // ponytail: colonnes split (Doing/Done) fusionnées en une seule.
      for (const col of (board.columns as any[]) ?? []) {
        for (const [type, state] of Object.entries(col.stateMappings ?? {})) {
          out.push({
            name: col.name,
            category: CATS[col.columnType] || "",
            color: COLORS[col.columnType] || "#8a8f98",
            type,
            state: state as string,
            columnField,
          });
        }
      }
    }
    return out;
  }

  /**
   * États réels (colonnes possibles) des types de work item fournis, dédupliqués
   * et ordonnés selon l'ordre ADO. Sert à la vue Daily.
   */
  async getStates(
    org: string,
    projectId: string,
    types: string[],
    token: string,
  ): Promise<{ name: string; category: string; color: string; type: string }[]> {
    const out: { name: string; category: string; color: string; type: string }[] = [];
    for (const type of types) {
      try {
        const data = await this.adoFetch(
          `${this.orgUrl(org)}/${projectId}/_apis/wit/workItemTypes/${encodeURIComponent(type)}/states?api-version=7.1`,
          token,
        );
        // États d'un type, ordonnés selon l'ordre du board ADO, tagués avec leur type.
        (data.value as any[])
          .map((s: any, i: number) => ({ name: s.name, category: s.category || "", color: s.color ? `#${s.color}` : "#8a8f98", order: s.order ?? i, type }))
          .sort((a, b) => a.order - b.order)
          .forEach(({ name, category, color }) => out.push({ name, category, color, type }));
      } catch {
        // type sans endpoint states (rare) : on ignore.
      }
    }
    return out;
  }

  /**
   * Champs proposables d'un type de work item (custom / process hérités) —
   * mêmes exclusions que Ticket.customFields : System.*, WEF_* et champs déjà
   * gérés nativement par le panneau ticket.
   */
  async getTypeFields(
    org: string,
    projectId: string,
    type: string,
    token: string,
  ): Promise<{ referenceName: string; name: string; defaultValue: string | number | boolean | null; alwaysRequired: boolean; allowedValues: string[] }[]> {
    const data = await this.adoFetch(
      `${this.orgUrl(org)}/${projectId}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/fields?$expand=allowedValues&api-version=7.1`,
      token,
    );
    return ((data.value as any[]) ?? [])
      .map((f: any) => ({
        referenceName: f.referenceName as string,
        name: f.name as string,
        // Valeur par défaut du process : affichée (comme dans ADO) tant que le
        // work item n'a pas de valeur stockée pour ce champ.
        defaultValue: ["string", "number", "boolean"].includes(typeof f.defaultValue) ? f.defaultValue : null,
        // Contraintes du process : champ requis + valeurs autorisées (picklist).
        alwaysRequired: !!f.alwaysRequired,
        allowedValues: Array.isArray(f.allowedValues) ? f.allowedValues.map(String) : [],
      }))
      .filter((f) => f.referenceName && !f.referenceName.startsWith("System.") && !f.referenceName.startsWith("WEF_") && !KNOWN_FIELDS.has(f.referenceName));
  }

  async getCapacities(
    org: string,
    projectId: string,
    iterationId: string,
    token: string,
  ): Promise<TeamMember[]> {
    const data = await this.adoFetch(
      `${this.orgUrl(org)}/${projectId}/_apis/work/teamsettings/iterations/${iterationId}/capacities?api-version=7.1`,
      token,
    );
    return ((data.value as any[]) ?? []).map((c: any) => ({
      id: c.teamMember.uniqueName || c.teamMember.id,
      displayName: c.teamMember.displayName,
      capacityHoursPerDay: c.activities?.reduce((sum: number, a: any) => sum + (a.capacityPerDay || 0), 0) || 0,
    }));
  }

  /**
   * Capacité ADO en jours par membre pour une itération : jours ouvrés de
   * l'itération − jours off d'équipe (teamdaysoff) − jours off du membre
   * (daysOff des capacities). Les heures/jour par activité ne sont pas
   * converties (unité incompatible avec la capacité par sprint de l'app).
   */
  async getCapacityDays(
    org: string,
    projectId: string,
    iterationId: string,
    startDate: string,
    finishDate: string,
    token: string,
  ): Promise<{ memberId: string; days: number }[]> {
    const base = `${this.orgUrl(org)}/${projectId}/_apis/work/teamsettings/iterations/${iterationId}`;
    const [caps, teamOff] = await Promise.all([
      this.adoFetch(`${base}/capacities?api-version=7.1`, token),
      this.adoFetch(`${base}/teamdaysoff?api-version=7.1`, token),
    ]);
    const lo = startDate.slice(0, 10), hi = finishDate.slice(0, 10);
    const off = (ranges: { start: string; end: string }[] | undefined) =>
      (ranges ?? []).reduce((sum, r) => sum + workingDays(r.start, r.end, lo, hi), 0);
    const total = workingDays(lo, hi);
    const teamOffDays = off(teamOff.daysOff);
    return ((caps.value as any[]) ?? []).map((c: any) => ({
      memberId: c.teamMember.uniqueName || c.teamMember.id,
      days: Math.max(0, total - teamOffDays - off(c.daysOff)),
    }));
  }

  async patchWorkItem(
    org: string,
    id: string,
    field: OperationFieldKey,
    value: unknown,
    expectedRev: number,
    token: string,
  ): Promise<number> {
    return this.patchWorkItemRaw(org, id, this.mapper.toJsonPatch(field, value), token);
  }

  /** Crée un work item (json-patch "add"). Retourne le work item brut créé. */
  async createWorkItem(
    org: string,
    projectId: string,
    type: string,
    patches: { op: "add"; path: string; value: unknown }[],
    token: string,
  ): Promise<RawAdoWorkItem> {
    return this.adoFetch(
      `${this.orgUrl(org)}/${projectId}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json-patch+json" },
        body: JSON.stringify(patches),
      },
    );
  }

  /** Patch JSON brut (plusieurs champs en une écriture atomique). Retourne la nouvelle rev. */
  async patchWorkItemRaw(
    org: string,
    id: string,
    patches: ({ op: "replace"; path: string; value: unknown } | { op: "remove"; path: string })[],
    token: string,
  ): Promise<number> {
    const data = await this.adoFetch(
      `${this.orgUrl(org)}/_apis/wit/workitems/${id}?api-version=7.1`,
      token,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json-patch+json" },
        body: JSON.stringify(patches),
      },
    );
    return data.rev;
  }
}
