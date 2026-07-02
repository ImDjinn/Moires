export type OperationField =
  | "assigneeId"
  | "startDate"
  | "endDate"
  | "targetDate"
  | "iterationId"
  | "state"
  | "storyPoints"
  | "estimateHours"
  | "tags"
  | "areaPath"
  | "title";

export interface Operation {
  ticketId: string;
  field: OperationField;
  value: string | number | string[] | null;
  userId: string;
  clientTimestamp: number;
}
