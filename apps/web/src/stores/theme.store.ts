import { create } from "zustand";

export type Theme = "light" | "dark";

const KEY = "moirai-theme";

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

const initial: Theme =
  typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "dark"
    ? "dark"
    : "light";

apply(initial);

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initial,
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    apply(next);
    set({ theme: next });
  },
}));
