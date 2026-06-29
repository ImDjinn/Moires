import { Injectable } from "@nestjs/common";
import type { OperationField, TeamMember } from "@moires/shared";
import { AdoMapper, RawAdoWorkItem } from "./ado.mapper";

// Base for cross-organization identity APIs (profile + accounts).
const VSSPS_BASE = "https://app.vssps.visualstudio.com";

@Injectable()
export class AdoService {
  constructor(private mapper: AdoMapper) {}

  private orgUrl(org: string): string {
    return `https://dev.azure.com/${org}`;
  }

  private async adoFetch(url: string, token: string, options?: RequestInit) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) throw new Error(`ADO API error: ${res.status} ${await res.text()}`);
    return res.json();
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

  async getWorkItemsBatch(
    org: string,
    ids: string[],
    token: string,
    fields: string[] = [
      "System.Id", "System.Title", "System.AssignedTo",
      "System.AreaPath", "System.IterationId", "System.IterationPath",
      "System.WorkItemType", "System.Parent",
      "Microsoft.VSTS.Scheduling.StartDate", "Microsoft.VSTS.Scheduling.FinishDate",
      "Microsoft.VSTS.Scheduling.OriginalEstimate", "System.Rev",
    ],
  ): Promise<RawAdoWorkItem[]> {
    const results: RawAdoWorkItem[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const data = await this.adoFetch(
        `${this.orgUrl(org)}/_apis/wit/workitemsbatch?api-version=7.1`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ ids: batch.map(Number), fields }),
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

  async patchWorkItem(
    org: string,
    id: string,
    field: OperationField,
    value: unknown,
    expectedRev: number,
    token: string,
  ): Promise<number> {
    const patches = this.mapper.toJsonPatch(field, value);
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
