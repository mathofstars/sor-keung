import { defineConfig } from "vite";

export default defineConfig({
  root: "desktop",
  build: {
    outDir: "../desktop-dist",
    emptyOutDir: true
  },
  clearScreen: false
});
