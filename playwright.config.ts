import { defineConfig } from "@playwright/test";
import { dirname, delimiter } from "node:path";

const runtimePath = `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  webServer: [
    {
      command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      env: { PATH: runtimePath, VITE_BASE_URL: "http://127.0.0.1:5417", VITE_GAME_HUB: "/hubs/game" },
      reuseExistingServer: false,
    },
    {
      command: "dotnet run --project ../MenchGame-Back/MenchGameBackend.csproj --no-restore --no-launch-profile --urls http://127.0.0.1:5417",
      url: "http://127.0.0.1:5417/hubs/game",
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
