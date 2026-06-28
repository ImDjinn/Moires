import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
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