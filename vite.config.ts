import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const __dirname = new URL(".", import.meta.url).pathname;

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    dts({
      tsconfigPath: "./tsconfig.app.json",
      entryRoot: "src",
      outDirs: "dist",
      compilerOptions: {
        rootDir: "src",
      },
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/main.ts"),
      name: "DataGridReactRouter",
      fileName: "datagrid-react-router",
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/compiler-runtime",
        "react-router",
        "react-router-dom",
        /^react-router\/.*/,
        /^react-router-dom\/.*/,
      ],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
