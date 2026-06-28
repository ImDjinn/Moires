import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { OperationField, TeamMember } from "@moires/shared";
import { AdoMapper, RawAdoWorkItem } from "./ado.mapper";

@Injectable()
export class AdoService {
  private orgUrl: string;

  constructor(
    private config: ConfigService,
    private mapper: AdoMapper,
  ) {
    this.orgUrl = config.get<string>("ADO_ORG_URL")!;
  }

  private async adoFetch(path: string, token: string, options?: RequestInit) {
    const res = await fetch(`${this.orgUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) throw new Error(`ADO API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getProjects(token: string) {
    const data = await this.adoFetch("/_apis/projects?api-version=7.1", token);
    return (data.value as any[]).map((p: any) => ({ id: p.id, name: p.name }));
  }

  async getIterations(projectId: string, token: string) {
    const data = await this.adoFetch(
      `/${projectId}/_apis/work/teamsettings/iterations?api-version=7.1`,
      token,
    );
    return (data.value as any[]).map((i: any) => ({
      id: i.id,
      name: i.name,
      startDate: i.attributes?.startDate,
      finishDate: i.attributes?.finishDate,
    }));
  }

  async getAreas(projectId: string, token: string) {
    const data = await this.adoFetch(
      `/${projectId}/_apis/wit/classificationnodes/Areas?$depth=10&api-version=7.1`,
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

  async getTeamMembers(projectId: string, token: string): Promise<TeamMember[]> {
    const data = await this.adoFetch(
      `/${projectId}/_apis/projects/${projectId}/teams?api-version=7.1`,
      token,
    );
    const teams = data.value as any[];
    if (!teams.length) return [];
    const teamId = teams[0].id;
    const members = await this.adoFetch(
      `/_apis/projects/${projectId}/teams/${teamId}/members?api-version=7.1`,
      token,
    );
    return (members.value as any[]).map((m: any) => ({
      id: m.identity.id,
      displayName: m.identity.displayName,
      capacityHoursPerDay: 8,
    }));
  }

  async queryWorkItemIds(
    projectId: string,
    iterationIds: string[],
    token: string,
    areaPaths?: string[],
  ): Promise<string[]> {
    const iterationClauses = iterationIds
      .map((id) => `[System.IterationId] = '${id}'`)
      .join(" OR ");
    let wiql = `SELECT [System.Id] FROM WorkItems WHERE (${iterationClauses})`;
    if (areaPaths?.length) {
      const areaClauses = areaPaths.map((p) => `[System.AreaPath] = '${p}'`).join(" OR ");
      wiql += ` AND (${areaClauses})`;
    }
    const data = await this.adoFetch(`/${projectId}/_apis/wit/wiql?api-version=7.1`, token, {
      method: "POST",
      body: JSON.stringify({ query: wiql }),
    });
    return (data.workItems as any[]).map((wi: any) => String(wi.id));
  }

  async getWorkItemsBatch(ids: string[], token: string): Promise<RawAdoWorkItem[]> {
    const results: RawAdoWorkItem[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const data = await this.adoFetch("/_apis/wit/workitemsbatch?api-version=7.1", token, {
        method: "POST",
        body: JSON.stringify({ ids: batch.map(Number), fields: [
          "System.Id", "System.Title", "System.AssignedTo",
          "System.AreaPath", "System.IterationId", "System.IterationPath",
          "Microsoft.VSTS.Scheduling.StartDate", "Microsoft.VSTS.Scheduling.FinishDate",
          "Microsoft.VSTS.Scheduling.OriginalEstimate", "System.Rev",
        ]}),
      });
      results.push(...(data.value as RawAdoWorkItem[]));
    }
    return results;
  }

  async getCapacities(
    projectId: string,
    iterationId: string,
    token: string,
  ): Promise<TeamMember[]> {
    const data = await this.adoFetch(
      `/${projectId}/_apis/work/teamsettings/iterations/${iterationId}/capacities?api-version=7.1`,
      token,
    );
    return (data.value as any[]).map((c: any) => ({
      id: c.teamMember.id,
      displayName: c.teamMember.displayName,
      capacityHoursPerDay: c.activities?.reduce((sum: number, a: any) => sum + (a.capacityPerDay || 0), 0) || 0,
    }));
  }

  async patchWorkItem(
    id: string,
    field: OperationField,
    value: unknown,
    expectedRev: number,
    token: string,
  ): Promise<number> {
    const patches = this.mapper.toJsonPatch(field, value);
    const data = await this.adoFetch(`/_apis/wit/workitems/${id}?api-version=7.1`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json-patch+json" },
      body: JSON.stringify(patches),
    });
    return data.rev;
  }
}
