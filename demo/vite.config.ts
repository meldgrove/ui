import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** The demo page: every component in light and dark, English and German, and with an app accent. */
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  server: { port: Number(process.env.DEMO_PORT ?? 5180), strictPort: true },
  build: { outDir: "../dist-demo", emptyOutDir: true },
});
