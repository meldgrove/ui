import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The standalone update button and settings (custom elements with React and
 * the styles inside) for apps without React: one ES module.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/standalone",
    emptyOutDir: true,
    copyPublicDir: false,
    lib: {
      entry: "src/updates/element.tsx",
      formats: ["es"],
      fileName: () => "meldgrove-updates.js",
    },
    minify: true,
    rolldownOptions: { output: { minify: true } },
    sourcemap: false,
  },
});
