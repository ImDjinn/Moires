import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    resolve: {
        // Sources TS du paquet partagé (comme le paths du tsconfig) : le dist CJS
        // n'est pas consommable tel quel par Vite pour un paquet workspace lié.
        alias: { "@moires/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) },
    },
    server: {
        port: 5173,
        proxy: {
            "/auth": "http://localhost:3000",
            "/ado": "http://localhost:3000",
            "/sessions": "http://localhost:3000",
            "/socket.io": { target: "http://localhost:3000", ws: true },
        },
    },
});
//# sourceMappingURL=vite.config.js.map