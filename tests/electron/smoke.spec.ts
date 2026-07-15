import { _electron as electron } from "playwright";
import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("launches the compiled Electron app with its secure window policy", async () => {
  const userDataDirectory = await mkdtemp(
    resolve(tmpdir(), "mojian-electron-"),
  );
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    app = await electron.launch({
      args: [
        "--in-process-gpu",
        // The managed Windows test host cannot initialize Electron's GPU sandbox.
        "--no-sandbox",
        `--user-data-dir=${userDataDirectory}`,
        projectRoot,
      ],
      cwd: projectRoot,
    });

    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await expect(window.locator(".welcome")).toBeVisible();
    await expect(
      window.getByRole("heading", { name: "让复杂故事，始终清晰可见" }),
    ).toBeVisible();

    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const [browserWindow] = BrowserWindow.getAllWindows();
      return browserWindow
        ? {
            isVisible: browserWindow.isVisible(),
            ...browserWindow.webContents.getLastWebPreferences(),
          }
        : null;
    });

    expect(preferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      isVisible: true,
    });
  } finally {
    try {
      await app?.close();
    } finally {
      await rm(userDataDirectory, { force: true, recursive: true });
    }
  }
});
