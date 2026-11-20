import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The template demo: the app frame and page templates in their variants,
 * with fake content of three apps. `npm run dev:templates`; one HTML file
 * with `npm run build:templates -- <out-dir>`.
 */
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { port: Number(process.env.DEMO_PORT ?? 5181), strictPort: true },
  build: {
    outDir: "../../dist-templates",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
