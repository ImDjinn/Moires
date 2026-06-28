import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Timezone figée : les utilitaires de dates font des aller-retours
// Date <-> string ISO ; un fuseau fixe rend les tests déterministes en CI.
process.env.TZ = "Europe/Paris";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
