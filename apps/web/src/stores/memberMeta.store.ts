import { create } from "zustand";
import type { MemberMeta } from "@moirai/shared";
import { api } from "../services/rest.client";

interface MemberMetaState {
  memberMeta: MemberMeta[];
  setMemberMetas: (memberMeta: MemberMeta[]) => void;
  /** Met à jour le poste/rôle d'un membre (optimiste + persistance). */
  setMemberMeta: (sessionId: string, meta: MemberMeta) => void;
}

export const useMemberMetaStore = create<MemberMetaState>((set, get) => ({
  memberMeta: [],
  setMemberMetas: (memberMeta) => set({ memberMeta }),
  setMemberMeta: (sessionId, meta) => {
    const next = get().memberMeta.filter((m) => m.memberId !== meta.memberId);
    next.push(meta);
    set({ memberMeta: next });
    api.setMemberMeta(sessionId, meta).catch(() => {});
  },
}));
