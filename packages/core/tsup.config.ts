import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
  },
  {
    // Node-only exports (FileStore) — a separate entry so a browser bundle importing
    // the main "." export never pulls in node:fs/node:path.
    entry: { node: "src/node.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "node18",
  },
  {
    // CLI is invoked as an executable, never imported, so it only needs one format.
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    sourcemap: true,
    clean: false,
    target: "node18",
  },
]);
