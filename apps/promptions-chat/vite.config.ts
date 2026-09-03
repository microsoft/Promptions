import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { openaiProxy } from "@promptions/promptions-openai-proxy";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), openaiProxy()],
    server: {
        port: 3003,
    },
    define: {
        "process.env": {},
    },
});
