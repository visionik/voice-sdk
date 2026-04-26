import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "providers/mock/index": "src/providers/mock/index.ts",
  },
  outDir: "dist",
  format: "esm",
  platform: "node",
  fixedExtension: true,
  dts: true,
  sourcemap: true,
  clean: true,
});
