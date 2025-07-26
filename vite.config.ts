/// <reference types="vite/client" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";
import packageJson from "./package.json";

const __dirname = new URL(".", import.meta.url).pathname;

const peerDependencies = Object.keys(packageJson.peerDependencies || {});

export default defineConfig({
  plugins: [
    react(),
    dts({
      rollupTypes: true,
      tsconfigPath: "./tsconfig.app.json",
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/main.ts"),
      name: "DataGrid",
      fileName: "datagrid",
      formats: ["es"],
    },
    rollupOptions: {
      external: [...peerDependencies, "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "react/jsx-runtime",
        },
      },
    },
  },
});