import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The standalone elements for apps without React, one ES module each: the
 * update button and settings (React and the styles inside), and the eye
 * button of a password field (no React).
 */
/**
 * Sonner adds its CSS to the page's <head> when it loads. The elements bring
 * that CSS in their shadow roots, and a page with a strict Content Security
 * Policy (style-src 'self') would refuse the <style> and log an error.
 */
function noSonnerStyleTag(): Plugin {
  return {
    name: "meldgrove:no-sonner-style-tag",
    transform(code, id) {
      if (!/[\\/]sonner[\\/]dist[\\/]index\.m?js$/.test(id)) return null;
      const patched = code.replace("function __insertCSS(code) {", "function __insertCSS(code) {\n  return;");
      if (patched === code) throw new Error("sonner changed: __insertCSS not found");
      return { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [noSonnerStyleTag(), react(), tailwindcss()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/standalone",
    emptyOutDir: true,
    copyPublicDir: false,
    lib: {
      entry: {
        "meldgrove-updates": "src/updates/element.tsx",
        "meldgrove-secret-input": "src/elements/secret-input.ts",
      },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
    minify: true,
    rolldownOptions: { output: { minify: true } },
    sourcemap: false,
  },
});
