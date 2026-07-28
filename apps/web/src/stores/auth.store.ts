import { create } from "zustand";

export interface AuthUser {
  id: string;
  displayName: string;
  /** Identifiant ADO (email) = System.AssignedTo.uniqueName. Absent des cookies émis avant cette version. */
  uniqueName?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
}));
