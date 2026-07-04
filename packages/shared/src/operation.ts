import type { Ticket } from "./ticket";

export type OperationField =
  | "assigneeId"
  | "startDate"
  | "endDate"
  | "targetDate"
  | "iterationId"
  | "state"
  | "boardColumn"
  | "storyPoints"
  | "estimateHours"
  | "tags"
  | "areaPath"
  | "priority"
  | "title";

/** Champ ADO custom (Ticket.customFields) : "custom:<referenceName>". */
export type OperationFieldKey = OperationField | `custom:${string}`;

export interface Operation {
  ticketId: string;
  field: OperationFieldKey;
  value: string | number | string[] | null;
  userId: string;
  clientTimestamp: number;
}

/** Applique la valeur d'une opération sur un ticket (champ mappé ou custom). */
export function setTicketField(t: Ticket, field: OperationFieldKey, value: Operation["value"]): void {
  if (field.startsWith("custom:")) {
    const ref = field.slice("custom:".length);
    const cf = { ...(t.customFields || {}) };
    if (value == null || value === "") delete cf[ref];
    else cf[ref] = value as string | number;
    t.customFields = cf;
  } else {
    (t as any)[field] = value;
  }
}

/** Valeur actuelle du champ d'une opération sur un ticket (pour l'audit log). */
export function getTicketField(t: Ticket, field: OperationFieldKey): unknown {
  return field.startsWith("custom:") ? t.customFields?.[field.slice("custom:".length)] : t[field as keyof Ticket];
}
