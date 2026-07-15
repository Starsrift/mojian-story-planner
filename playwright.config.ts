import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/electron",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  projects: [
    {
      name: "electron",
      testMatch: "**/smoke.spec.ts",
    },
  ],
  reporter: "list",
});
