import { create } from "zustand";
import type { Capacity } from "@moires/shared";
import { api } from "../services/rest.client";

interface CapacitiesState {
  capacities: Capacity[];
  setCapacities: (capacities: Capacity[]) => void;
  /** Met à jour la capacité d'un membre/itération (optimiste + persistance). */
  setCapacity: (
    sessionId: string,
    memberId: string,
    iterationPath: string,
    storyPoints: number,
  ) => void;
}

export const useCapacitiesStore = create<CapacitiesState>((set, get) => ({
  capacities: [],
  setCapacities: (capacities) => set({ capacities }),
  setCapacity: (sessionId, memberId, iterationPath, storyPoints) => {
    const next = get().capacities.filter(
      (c) => !(c.memberId === memberId && c.iterationPath === iterationPath),
    );
    if (storyPoints > 0) next.push({ memberId, iterationPath, storyPoints });
    set({ capacities: next });
    api.setCapacity(sessionId, { memberId, iterationPath, storyPoints }).catch(() => {});
  },
}));
