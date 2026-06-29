export interface Ticket {
  id: string;
  title: string;
  assigneeId: string | null;
  areaPath: string;
  iterationId: string;
  epicId: string | null;
  epicTitle: string | null;
  startDate: string;
  endDate: string;
  estimateHours: number;
  adoRev: number;
  syncStatus: "synced" | "pending" | "error";
}
