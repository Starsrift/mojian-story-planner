import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

type Workflow = {
  name?: string;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, Job>;
};

type Job = {
  needs?: string[];
  permissions?: Record<string, string>;
  "runs-on"?: string;
  steps?: Step[];
};

type Step = {
  env?: Record<string, string>;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
};

const root = process.cwd();
const packageConfig = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
) as { scripts?: Record<string, string> };

function readWorkflow(filename: string): {
  source: string;
  workflow: Workflow;
} {
  const source = readFileSync(
    resolve(root, ".github", "workflows", filename),
    "utf8",
  );
  const document = parseDocument(source);

  expect(document.errors).toEqual([]);
  return { source, workflow: document.toJSON() as Workflow };
}

function job(workflow: Workflow, name: string): Job {
  const value = workflow.jobs?.[name];
  expect(value, `expected ${name} job`).toBeDefined();
  return value as Job;
}

function steps(value: Job): Step[] {
  expect(value.steps).toBeDefined();
  return value.steps as Step[];
}

function stepWithRun(value: Job, command: string): Step {
  const match = steps(value).find((step) => step.run?.includes(command));
  expect(match, `expected step running ${command}`).toBeDefined();
  return match as Step;
}

function stepIndexWithRun(value: Job, command: string): number {
  const index = steps(value).findIndex((step) => step.run?.includes(command));
  expect(index, `expected step running ${command}`).toBeGreaterThanOrEqual(0);
  return index;
}

function stepIndexWithUse(value: Job, action: string): number {
  const index = steps(value).findIndex((step) => step.uses === action);
  expect(index, `expected step using ${action}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe("continuous integration workflow", () => {
  it("runs verified application checks on pull requests and main pushes", () => {
    const { workflow } = readWorkflow("ci.yml");
    const build = job(workflow, "build");

    expect(workflow.on).toMatchObject({
      pull_request: {},
      push: { branches: ["main"] },
    });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(steps(build)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uses: "actions/setup-node@v4",
          with: expect.objectContaining({ "node-version": "24" }),
        }),
      ]),
    );
    expect(stepWithRun(build, "npm ci")).toBeDefined();
    expect(stepWithRun(build, "npm run install:electron")).toBeDefined();
    expect(stepIndexWithRun(build, "npm ci")).toBeLessThan(
      stepIndexWithRun(build, "npm run install:electron"),
    );
    expect(stepIndexWithRun(build, "npm run install:electron")).toBeLessThan(
      stepIndexWithRun(build, "npm run test:run"),
    );
    expect(stepWithRun(build, "npm run test:run")).toBeDefined();
    expect(stepWithRun(build, "npm run build")).toBeDefined();
    expect(stepWithRun(build, "npm run check:workflows")).toBeDefined();
  });
});

describe("Electron runtime installation", () => {
  it("installs Electron explicitly for desktop flows without coupling web builds to the download", () => {
    expect(packageConfig.scripts?.["install:electron"]).toBe(
      "node node_modules/electron/install.js",
    );
    for (const scriptName of [
      "electron:dev",
      "electron:build",
      "dist:win",
      "dist:mac",
    ]) {
      expect(packageConfig.scripts?.[scriptName]).toContain(
        "npm run install:electron &&",
      );
    }
    expect(packageConfig.scripts?.build).not.toContain("install:electron");
  });
});

describe("desktop release workflow", () => {
  it.each(["windows", "macos", "web"])(
    "%s installs Electron after npm ci and before tests or builds",
    (jobName) => {
      const { workflow } = readWorkflow("release.yml");
      const buildJob = job(workflow, jobName);
      const installIndex = stepIndexWithRun(
        buildJob,
        "npm run install:electron",
      );

      expect(stepIndexWithRun(buildJob, "npm ci")).toBeLessThan(installIndex);
      expect(installIndex).toBeLessThan(
        stepIndexWithRun(buildJob, "npm run test:run"),
      );
    },
  );

  it("is limited to v-prefixed tags and defines every build plus publication job", () => {
    const { workflow } = readWorkflow("release.yml");

    expect(workflow.on).toEqual({ push: { tags: ["v*"] } });
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs).toEqual(
      expect.objectContaining({
        windows: expect.any(Object),
        macos: expect.any(Object),
        web: expect.any(Object),
        publish: expect.any(Object),
      }),
    );
  });

  it("runs Windows release work on a native runner and uploads only validated installer assets", () => {
    const { workflow, source } = readWorkflow("release.yml");
    const windows = job(workflow, "windows");

    expect(windows["runs-on"]).toBe("windows-latest");
    expect(stepWithRun(windows, "npm ci")).toBeDefined();
    expect(stepIndexWithRun(windows, "npm ci")).toBeLessThan(
      steps(windows).findIndex(
        (step) => step.name === "Set package version for this runner",
      ),
    );
    expect(stepWithRun(windows, "npm run test:run")).toBeDefined();
    expect(stepWithRun(windows, "npm run dist:win")).toBeDefined();
    expect(stepWithRun(windows, "--platform win")).toBeDefined();
    expect(stepWithRun(windows, "release-validation\\win")).toBeDefined();
    expect(stepIndexWithRun(windows, "--platform win")).toBeLessThan(
      stepIndexWithUse(windows, "actions/upload-artifact@v4"),
    );
    expect(source).toContain("release-validation/win/*.exe");
    expect(source).toContain("release-validation/win/*.zip");
    expect(source).not.toContain("release-validation/win/**");
  });

  it("keeps Windows unsigned by default and enables certificate signing only when supplied", () => {
    const { workflow } = readWorkflow("release.yml");
    const windows = job(workflow, "windows");
    const packageConfig = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    );
    const signingStep = steps(windows).find(
      (step) => step.name === "Enable Windows signing",
    );
    const packageStep = stepWithRun(windows, "npm run dist:win");

    expect(packageConfig.build.win.signExecutable).toBe(false);
    expect(signingStep).toMatchObject({ if: "${{ env.WIN_CSC_LINK != '' }}" });
    expect(signingStep?.env).toMatchObject({
      CSC_LINK: "${{ env.WIN_CSC_LINK }}",
    });
    expect(packageStep.env).toMatchObject({
      CSC_LINK: "${{ env.WIN_CSC_LINK }}",
    });
  });

  it("runs macOS packaging natively, validates the architecture detected from its artifacts, and maps optional signing inputs", () => {
    const { workflow, source } = readWorkflow("release.yml");
    const macos = job(workflow, "macos");
    const packageStep = stepWithRun(macos, "npm run dist:mac");

    expect(macos["runs-on"]).toBe("macos-latest");
    expect(stepWithRun(macos, "npm ci")).toBeDefined();
    expect(stepIndexWithRun(macos, "npm ci")).toBeLessThan(
      steps(macos).findIndex(
        (step) => step.name === "Set package version for this runner",
      ),
    );
    expect(stepWithRun(macos, "npm run test:run")).toBeDefined();
    expect(stepWithRun(macos, "npm run dist:mac")).toBeDefined();
    expect(stepWithRun(macos, "--platform mac")).toBeDefined();
    expect(stepWithRun(macos, "mac-*.dmg")).toBeDefined();
    expect(stepIndexWithRun(macos, "--platform mac")).toBeLessThan(
      stepIndexWithUse(macos, "actions/upload-artifact@v4"),
    );
    expect(packageStep.env).toMatchObject({
      APPLE_ID: "${{ secrets.APPLE_ID }}",
      APPLE_APP_SPECIFIC_PASSWORD: "${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}",
      APPLE_TEAM_ID: "${{ secrets.APPLE_TEAM_ID }}",
      CSC_LINK: "${{ secrets.MAC_CSC_LINK }}",
      CSC_KEY_PASSWORD: "${{ secrets.MAC_CSC_KEY_PASSWORD }}",
    });
    expect(source).toContain("release-validation/macos/*.dmg");
    expect(source).toContain("release-validation/macos/*.zip");
  });

  it("builds the web bundle on Ubuntu, names it web-any, and validates it before upload", () => {
    const { workflow, source } = readWorkflow("release.yml");
    const web = job(workflow, "web");

    expect(web["runs-on"]).toBe("ubuntu-latest");
    expect(stepWithRun(web, "npm ci")).toBeDefined();
    expect(stepIndexWithRun(web, "npm ci")).toBeLessThan(
      steps(web).findIndex(
        (step) => step.name === "Set package version for this runner",
      ),
    );
    expect(stepWithRun(web, "npm run test:run")).toBeDefined();
    expect(stepWithRun(web, "npm run build")).toBeDefined();
    expect(
      stepWithRun(web, "mojian-story-planner-$VERSION-web-any.zip"),
    ).toBeDefined();
    expect(
      stepWithRun(web, "--platform web --version $VERSION --arch any"),
    ).toBeDefined();
    expect(stepIndexWithRun(web, "--platform web")).toBeLessThan(
      stepIndexWithUse(web, "actions/upload-artifact@v4"),
    );
    expect(source).toContain(
      "release-validation/web/mojian-story-planner-$VERSION-web-any.zip",
    );
  });

  it("revalidates isolated artifact downloads before creating one complete release manifest and release", () => {
    const { workflow, source } = readWorkflow("release.yml");
    const publish = job(workflow, "publish");

    expect(publish.needs).toEqual(["windows", "macos", "web"]);
    expect(publish.permissions).toEqual({ contents: "write" });
    expect(steps(publish)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uses: "actions/checkout@v4" }),
      ]),
    );
    expect(stepWithRun(publish, "npm ci")).toBeDefined();
    expect(source).toContain("path: publish/windows");
    expect(source).toContain("path: publish/macos");
    expect(source).toContain("path: publish/web");
    expect(stepIndexWithRun(publish, "--platform win")).toBeLessThan(
      stepIndexWithRun(publish, "gh release create"),
    );
    expect(stepIndexWithRun(publish, "--platform mac")).toBeLessThan(
      stepIndexWithRun(publish, "gh release create"),
    );
    expect(stepIndexWithRun(publish, "--platform web")).toBeLessThan(
      stepIndexWithRun(publish, "gh release create"),
    );
    expect(stepIndexWithRun(publish, "LC_ALL=C sort")).toBeLessThan(
      stepIndexWithRun(publish, "gh release create"),
    );
    expect(source).toContain("publish/SHA256SUMS.txt");
    expect(source).toContain(
      "Unsigned builds are published when signing secrets are not configured.",
    );
  });
});
