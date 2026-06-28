export type OperationField = "assigneeId" | "startDate" | "endDate" | "iterationId";
export interface Operation {
    ticketId: string;
    field: OperationField;
    value: string | number | null;
    userId: string;
    clientTimestamp: number;
}
//# sourceMappingURL=operation.d.ts.map