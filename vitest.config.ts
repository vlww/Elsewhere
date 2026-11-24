import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Tests are deterministic: they exercise the built-in engine and never call Claude.
    env: { ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "" },
  },
});
