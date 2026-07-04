const add = jest.fn();
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ add })),
}));

import { WritebackService } from "./writeback.service";
import type { Operation } from "@moirai/shared";

const config = { get: () => "redis://localhost:6379" } as any;

describe("WritebackService", () => {
  it("enfile un job patch avec retries et backoff exponentiel", async () => {
    add.mockReset();
    const service = new WritebackService(config);
    const op: Operation = {
      ticketId: "t1",
      field: "assigneeId",
      value: "m2",
      userId: "u1",
      clientTimestamp: 1,
    };
    await service.enqueue("s1", op, "log1");

    expect(add).toHaveBeenCalledWith(
      "patch",
      { sessionId: "s1", op, logId: "log1" },
      expect.objectContaining({
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
      }),
    );
  });
});
