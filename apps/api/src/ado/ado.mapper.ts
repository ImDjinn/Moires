import { Injectable } from "@nestjs/common";
import type { Ticket, OperationField } from "@moires/shared";

export interface RawAdoWorkItem {
  id: number;
  rev: number;
  fields: Record<string, any>;
}

const FIELD_MAP: Record<OperationField, string> = {
  assigneeId: "/fields/System.AssignedTo",
  startDate: "/fields/Microsoft.VSTS.Scheduling.StartDate",
  endDate: "/fields/Microsoft.VSTS.Scheduling.FinishDate",
  targetDate: "/fields/Microsoft.VSTS.Scheduling.TargetDate",
  iterationId: "/fields/System.IterationPath",
  state: "/fields/System.State",
  storyPoints: "/fields/Microsoft.VSTS.Scheduling.StoryPoints",
  estimateHours: "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate",
  areaPath: "/fields/System.AreaPath",
  title: "/fields/System.Title",
  tags: "/fields/System.Tags",
};

@Injectable()
export class AdoMapper {
  toTicket(raw: RawAdoWorkItem): Ticket {
    const f = raw.fields;
    return {
      id: String(raw.id),
      title: f["System.Title"] || "",
      workItemType: f["System.WorkItemType"] || "",
      parentId: f["System.Parent"] != null ? String(f["System.Parent"]) : null,
      state: f["System.State"] || "",
      boardColumn: f["System.BoardColumn"] || null,
      tags: f["System.Tags"]
        ? String(f["System.Tags"]).split(";").map((t) => t.trim()).filter(Boolean)
        : [],
      assigneeId: f["System.AssignedTo"]?.uniqueName || f["System.AssignedTo"]?.id || null,
      areaPath: f["System.AreaPath"] || "",
      // On stocke le chemin d'itération : c'est la clé de jointure avec les
      // colonnes de sprint et la valeur réécrite dans System.IterationPath.
      iterationId: f["System.IterationPath"] ?? String(f["System.IterationId"] ?? ""),
      epicId: null,
      epicTitle: null,
      startDate: f["Microsoft.VSTS.Scheduling.StartDate"] || new Date().toISOString(),
      endDate: f["Microsoft.VSTS.Scheduling.FinishDate"] || new Date().toISOString(),
      targetDate: f["Microsoft.VSTS.Scheduling.TargetDate"] || null,
      priority: f["Microsoft.VSTS.Common.Priority"],
      estimateHours: f["Microsoft.VSTS.Scheduling.OriginalEstimate"] || 0,
      storyPoints: f["Microsoft.VSTS.Scheduling.StoryPoints"] || 0,
      adoRev: raw.rev,
      syncStatus: "synced",
    };
  }

  toJsonPatch(
    field: OperationField,
    value: unknown,
  ): ({ op: "replace"; path: string; value: unknown } | { op: "remove"; path: string })[] {
    const path = FIELD_MAP[field];
    // System.Tags : ADO attend une chaîne "a; b; c" ; tableau vide = remove.
    if (field === "tags") {
      const tags = Array.isArray(value) ? value : [];
      return tags.length ? [{ op: "replace", path, value: tags.join("; ") }] : [{ op: "remove", path }];
    }
    // ADO refuse `replace` avec null/"" (VssPropertyValidationException
    // "Value cannot be null"). Le vider = `remove` (ex: désassigner).
    // NB: 0 est une valeur valide (story points / estimate) → replace.
    if (value === null || value === "") {
      return [{ op: "remove", path }];
    }
    return [{ op: "replace", path, value }];
  }
}
