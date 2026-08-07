import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

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
      entry: resolve(rootDir, "src/main.ts"),
      name: "DataGridReactRouter",
      fileName: "datagrid-react-router",
      formats: ["es"],
    },
    rolldownOptions: {
      // `@sovgut/datagrid` is external and a peer dependency. Bundling it would
      // give the consumer a second copy of the core: its own contexts and its
      // own `DATAGRID_DEFAULT_*` objects, which the core documents as single
      // values shared by every grid on the page. The emitted declarations
      // already import from it, so this only makes the runtime agree with them.
      external: [
        "@sovgut/datagrid",
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
});
