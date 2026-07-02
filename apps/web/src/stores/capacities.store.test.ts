import { describe, it, expect, beforeEach, vi } from "vitest";

const setCapacityApi = vi.fn().mockResolvedValue([]);
vi.mock("../services/rest.client", () => ({
  api: { setCapacity: (...args: unknown[]) => setCapacityApi(...args) },
}));

import { useCapacitiesStore } from "./capacities.store";

beforeEach(() => {
  useCapacitiesStore.setState({ capacities: [] });
  setCapacityApi.mockClear();
});

describe("capacities.store.setCapacity", () => {
  it("ajoute puis met à jour une capacité et persiste", () => {
    useCapacitiesStore.getState().setCapacity("s1", "m1", "S1", 13);
    expect(useCapacitiesStore.getState().capacities).toEqual([
      { memberId: "m1", iterationPath: "S1", storyPoints: 13 },
    ]);
    expect(setCapacityApi).toHaveBeenCalledWith("s1", {
      memberId: "m1",
      iterationPath: "S1",
      storyPoints: 13,
    });

    useCapacitiesStore.getState().setCapacity("s1", "m1", "S1", 21);
    expect(useCapacitiesStore.getState().capacities).toEqual([
      { memberId: "m1", iterationPath: "S1", storyPoints: 21 },
    ]);
  });

  it("retire la capacité quand mise à 0", () => {
    useCapacitiesStore.getState().setCapacity("s1", "m1", "S1", 8);
    useCapacitiesStore.getState().setCapacity("s1", "m1", "S1", 0);
    expect(useCapacitiesStore.getState().capacities).toEqual([]);
  });
});
