// SPA mode: static build only (dist/client) so it can be hosted on Hostinger without a server.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    spa: { enabled: true, prerender: { outputPath: "/index.html" } },
  },
});
