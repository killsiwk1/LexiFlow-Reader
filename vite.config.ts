import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "dexie-react-hooks",
      "lucide-react",
      "dexie",
    ],
  },
  server: { port: 1420, strictPort: true },
  build: { target: "es2020" },
});
