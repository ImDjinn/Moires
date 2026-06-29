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
  iterationId: "/fields/System.IterationPath",
};

@Injectable()
export class AdoMapper {
  toTicket(raw: RawAdoWorkItem): Ticket {
    const f = raw.fields;
    return {
      id: String(raw.id),
      title: f["System.Title"] || "",
      assigneeId: f["System.AssignedTo"]?.uniqueName || f["System.AssignedTo"]?.id || null,
      areaPath: f["System.AreaPath"] || "",
      // On stocke le chemin d'itération : c'est la clé de jointure avec les
      // colonnes de sprint et la valeur réécrite dans System.IterationPath.
      iterationId: f["System.IterationPath"] ?? String(f["System.IterationId"] ?? ""),
      epicId: null,
      epicTitle: null,
      startDate: f["Microsoft.VSTS.Scheduling.StartDate"] || new Date().toISOString(),
      endDate: f["Microsoft.VSTS.Scheduling.FinishDate"] || new Date().toISOString(),
      estimateHours: f["Microsoft.VSTS.Scheduling.OriginalEstimate"] || 0,
      adoRev: raw.rev,
      syncStatus: "synced",
    };
  }

  toJsonPatch(
    field: OperationField,
    value: unknown,
  ): ({ op: "replace"; path: string; value: unknown } | { op: "remove"; path: string })[] {
    const path = FIELD_MAP[field];
    // ADO refuse `replace` avec null/"" (VssPropertyValidationException
    // "Value cannot be null"). Le vider = `remove` (ex: désassigner).
    if (value === null || value === "") {
      return [{ op: "remove", path }];
    }
    return [{ op: "replace", path, value }];
  }
}
