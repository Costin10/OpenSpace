import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const MAIN_ENTRY_SUFFIX = "/src/renderer/src/main.tsx";

const injectOpenSpaceBridge = (): Plugin => ({
  name: "inject-openspace-tauri-bridge",
  enforce: "pre",
  transform(code, id) {
    const normalizedId = id.replaceAll("\\\\", "/");
    if (normalizedId.endsWith(MAIN_ENTRY_SUFFIX)) {
      return `import "@shared/tauri-bridge";\n${code}`;
    }
    return null;
  }
});

export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  plugins: [injectOpenSpaceBridge(), react()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true
  }
});
