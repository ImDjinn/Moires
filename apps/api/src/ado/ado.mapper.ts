import { Injectable } from "@nestjs/common";
import type { Ticket, OperationField, OperationFieldKey } from "@moires/shared";

export interface RawAdoWorkItem {
  id: number;
  rev: number;
  fields: Record<string, any>;
}

// boardColumn absent : le champ Kanban (WEF) est dynamique par board — résolu
// par le WritebackProcessor via patchWorkItemRaw, jamais par ce mapper.
const FIELD_MAP: Record<Exclude<OperationField, "boardColumn">, string> = {
  assigneeId: "/fields/System.AssignedTo",
  startDate: "/fields/Microsoft.VSTS.Scheduling.StartDate",
  endDate: "/fields/Microsoft.VSTS.Scheduling.FinishDate",
  targetDate: "/fields/Microsoft.VSTS.Scheduling.TargetDate",
  iterationId: "/fields/System.IterationPath",
  state: "/fields/System.State",
  storyPoints: "/fields/Microsoft.VSTS.Scheduling.StoryPoints",
  estimateHours: "/fields/Microsoft.VSTS.Scheduling.OriginalEstimate",
  areaPath: "/fields/System.AreaPath",
  priority: "/fields/Microsoft.VSTS.Common.Priority",
  title: "/fields/System.Title",
  tags: "/fields/System.Tags",
};

// Champs Microsoft.VSTS.* déjà mappés explicitement dans toTicket — exclus de
// customFields. Les System.* et WEF_* (colonnes Kanban) sont exclus par préfixe.
export const KNOWN_FIELDS = new Set(Object.values(FIELD_MAP).map((p) => p.replace("/fields/", "")));

@Injectable()
export class AdoMapper {
  /** Champs non mappés (custom / process hérités) → valeurs scalaires affichables. */
  private extractCustomFields(f: Record<string, any>): Record<string, string | number | boolean> | undefined {
    const custom: Record<string, string | number | boolean> = {};
    for (const [key, val] of Object.entries(f)) {
      if (key.startsWith("System.") || key.startsWith("WEF_") || KNOWN_FIELDS.has(key)) continue;
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") custom[key] = val;
      else if (val && typeof val === "object" && typeof val.displayName === "string") custom[key] = val.displayName; // champ identité
    }
    return Object.keys(custom).length ? custom : undefined;
  }

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
      customFields: this.extractCustomFields(f),
    };
  }

  toJsonPatch(
    field: OperationFieldKey,
    value: unknown,
  ): ({ op: "replace"; path: string; value: unknown } | { op: "remove"; path: string })[] {
    if (field === "boardColumn") throw new Error("boardColumn se traite via patchWorkItemRaw (champ WEF dynamique)");
    let path: string;
    if (field.startsWith("custom:")) {
      const ref = field.slice("custom:".length);
      // Garde-fou : ce chemin générique n'écrit que des champs custom — jamais
      // les champs système, Kanban (WEF) ou déjà mappés explicitement.
      if (!ref || ref.startsWith("System.") || ref.startsWith("WEF_") || KNOWN_FIELDS.has(ref))
        throw new Error(`Champ non autorisé en écriture custom : "${ref}"`);
      path = `/fields/${ref}`;
    } else {
      path = FIELD_MAP[field as Exclude<OperationField, "boardColumn">];
    }
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
