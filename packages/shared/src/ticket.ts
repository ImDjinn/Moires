export interface Ticket {
  id: string;
  title: string;
  assigneeId: string | null;
  areaPath: string;
  iterationId: string;
  startDate: string;
  endDate: string;
  estimateHours: number;
  adoRev: number;
  syncStatus: "synced" | "pending" | "error";
}
