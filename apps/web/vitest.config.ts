import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Timezone figée : les utilitaires de dates font des aller-retours
// Date <-> string ISO ; un fuseau fixe rend les tests déterministes en CI.
process.env.TZ = "Europe/Paris";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Même alias que vite.config.ts : Vitest n'hérite pas de sa config, et le
    // dist du paquet workspace n'est pas résolvable tel quel.
    alias: { "@moirai/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
