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

const ACTION_PINS = {
  checkout: "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5",
  downloadArtifact:
    "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
  setupNode: "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  uploadArtifact:
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
} as const;

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

function runBlocks(value: Job): string[] {
  return steps(value)
    .map((step) => step.run)
    .filter((run): run is string => typeof run === "string");
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
          uses: ACTION_PINS.setupNode,
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
    expect(stepWithRun(build, "npm run audit:production")).toBeDefined();
    expect(stepWithRun(build, "npm run check:workflows")).toBeDefined();
  });
});

describe("workflow action pinning", () => {
  it("uses the approved immutable action revisions in every workflow", () => {
    for (const filename of [
      "ci.yml",
      "release.yml",
      "update-star-history.yml",
    ]) {
      const { source } = readWorkflow(filename);

      expect(source).not.toMatch(
        /actions\/(?:checkout|setup-node|upload-artifact|download-artifact)@v4/,
      );
    }

    const { workflow: ci } = readWorkflow("ci.yml");
    const { workflow: release } = readWorkflow("release.yml");
    const { workflow: starHistory } = readWorkflow("update-star-history.yml");
    const allSteps = [
      ...steps(job(ci, "build")),
      ...Object.values(release.jobs ?? {}).flatMap(steps),
      ...steps(job(starHistory, "update")),
    ];

    for (const [prefix, expectedPin] of [
      ["actions/checkout@", ACTION_PINS.checkout],
      ["actions/setup-node@", ACTION_PINS.setupNode],
      ["actions/upload-artifact@", ACTION_PINS.uploadArtifact],
      ["actions/download-artifact@", ACTION_PINS.downloadArtifact],
    ]) {
      const actionSteps = allSteps.filter((step) =>
        step.uses?.startsWith(prefix),
      );

      expect(
        actionSteps.length,
        `expected at least one ${prefix} step`,
      ).toBeGreaterThan(0);
      expect(actionSteps.every((step) => step.uses === expectedPin)).toBe(true);
    }
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
    expect(packageConfig.scripts?.["audit:production"]).toBe(
      "npm audit --omit=dev --audit-level=high",
    );
  });
});

describe("desktop release workflow", () => {
  it.each(["windows", "macos", "web", "publish"])(
    "%s validates a tag from REF_NAME without interpolating expressions in run blocks",
    (jobName) => {
      const { workflow } = readWorkflow("release.yml");
      const releaseJob = job(workflow, jobName);
      const versionStep = steps(releaseJob).find(
        (step) => step.name === "Read release version",
      );

      expect(versionStep?.env).toEqual({ REF_NAME: "${{ github.ref_name }}" });
      expect(versionStep?.run).toContain("REF_NAME");
      expect(versionStep?.run).toContain("GITHUB_OUTPUT");
      expect(versionStep?.run).toMatch(/semver/i);
      for (const run of runBlocks(releaseJob)) {
        expect(run).not.toContain("${{");
        expect(run).not.toContain("GITHUB_REF_NAME");
      }
    },
  );

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
      stepIndexWithUse(windows, ACTION_PINS.uploadArtifact),
    );
    expect(source).toContain("release-validation/win/*.exe");
    expect(source).toContain("release-validation/win/*.zip");
    expect(source).toContain("release-validation/win/*.blockmap");
    expect(source).not.toContain("release-validation/win/**");
  });

  it("keeps Windows secrets isolated to a signed packaging branch", () => {
    const { workflow } = readWorkflow("release.yml");
    const windows = job(workflow, "windows");
    const packageConfig = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    );
    const detectionStep = steps(windows).find(
      (step) => step.name === "Detect Windows signing certificate",
    );
    const signedPackageStep = steps(windows).find(
      (step) => step.name === "Build signed Windows installer and archive",
    );
    const unsignedPackageStep = steps(windows).find(
      (step) => step.name === "Build unsigned Windows installer and archive",
    );

    expect(packageConfig.build.win.signExecutable).toBe(false);
    expect(windows.env).toBeUndefined();
    expect(detectionStep?.env).toEqual({
      WIN_CSC_LINK: "${{ secrets.WIN_CSC_LINK }}",
    });
    expect(detectionStep?.run).toContain("enabled=$");
    expect(detectionStep?.run).toContain("ToLowerInvariant");
    expect(signedPackageStep).toMatchObject({
      if: "${{ steps.signing.outputs.enabled == 'true' }}",
      env: {
        CSC_KEY_PASSWORD: "${{ secrets.WIN_CSC_KEY_PASSWORD }}",
        CSC_LINK: "${{ secrets.WIN_CSC_LINK }}",
      },
    });
    expect(unsignedPackageStep).toMatchObject({
      if: "${{ steps.signing.outputs.enabled != 'true' }}",
    });
    expect(unsignedPackageStep?.env).toBeUndefined();
    for (const step of steps(windows).filter(
      (step) =>
        step.name !== "Detect Windows signing certificate" &&
        step.name !== "Build signed Windows installer and archive",
    )) {
      expect(JSON.stringify(step.env ?? {})).not.toContain("secrets.WIN_CSC_");
    }
  });

  it("runs macOS packaging natively, validates the architecture detected from its artifacts, and gates optional signing inputs", () => {
    const { workflow, source } = readWorkflow("release.yml");
    const macos = job(workflow, "macos");
    const signingStep = steps(macos).find(
      (step) => step.name === "Detect macOS signing certificate",
    );
    const signedPackageStep = steps(macos).find(
      (step) => step.name === "Build signed macOS disk image and archive",
    );
    const unsignedPackageStep = steps(macos).find(
      (step) => step.name === "Build unsigned macOS disk image and archive",
    );

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
      stepIndexWithUse(macos, ACTION_PINS.uploadArtifact),
    );
    expect(signingStep?.env).toEqual({
      MAC_CSC_LINK: "${{ secrets.MAC_CSC_LINK }}",
    });
    expect(signedPackageStep).toMatchObject({
      if: "${{ steps.signing.outputs.enabled == 'true' }}",
      env: {
        APPLE_ID: "${{ secrets.APPLE_ID }}",
        APPLE_APP_SPECIFIC_PASSWORD: "${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}",
        APPLE_TEAM_ID: "${{ secrets.APPLE_TEAM_ID }}",
        CSC_LINK: "${{ secrets.MAC_CSC_LINK }}",
        CSC_KEY_PASSWORD: "${{ secrets.MAC_CSC_KEY_PASSWORD }}",
      },
    });
    expect(unsignedPackageStep).toMatchObject({
      if: "${{ steps.signing.outputs.enabled != 'true' }}",
      env: { CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    });
    expect(source).toContain("release-validation/macos/*.dmg");
    expect(source).toContain("release-validation/macos/*.zip");
    expect(source).toContain("release-validation/macos/*.blockmap");
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
      stepIndexWithUse(web, ACTION_PINS.uploadArtifact),
    );
    const uploadStep = steps(web).find(
      (step) => step.uses === ACTION_PINS.uploadArtifact,
    );
    expect(uploadStep?.with?.path).toBe("release-validation/web/*.zip");
    expect(source).toContain(
      "release-validation/web/mojian-story-planner-$VERSION-web-any.zip",
    );
  });

  it("revalidates assets before atomically publishing a complete draft release", () => {
    const { workflow, source } = readWorkflow("release.yml");
    const publish = job(workflow, "publish");

    expect(publish.needs).toEqual(["windows", "macos", "web"]);
    expect(publish.permissions).toEqual({ contents: "write" });
    expect(steps(publish)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uses: ACTION_PINS.checkout }),
      ]),
    );
    expect(stepWithRun(publish, "npm ci")).toBeDefined();
    expect(source).toContain("path: publish/windows");
    expect(source).toContain("path: publish/macos");
    expect(source).toContain("path: publish/web");
    const createDraft = stepIndexWithRun(publish, "gh release create");
    const uploadAssets = stepIndexWithRun(publish, "gh release upload");
    const verifyAssets = steps(publish).findIndex(
      (step) => step.name === "Verify draft release asset set",
    );
    expect(verifyAssets).toBeGreaterThanOrEqual(0);
    const publishDraft = stepIndexWithRun(publish, "gh release edit");

    expect(stepWithRun(publish, "gh release create").run).toContain("--draft");
    expect(createDraft).toBeLessThan(uploadAssets);
    expect(uploadAssets).toBeLessThan(verifyAssets);
    expect(verifyAssets).toBeLessThan(publishDraft);
    expect(stepWithRun(publish, "gh release edit").run).toContain(
      "--draft=false",
    );
    expect(steps(publish)[verifyAssets].run).toContain("diff -u");
    expect(source).toContain("publish/SHA256SUMS.txt");
    expect(source).toContain("publish/windows/*.blockmap");
    expect(source).toContain("publish/macos/*.blockmap");
    const retryStep = steps(publish).find((step) =>
      step.name?.includes("draft release"),
    );
    expect(retryStep?.run).toContain("gh release view");
    expect(retryStep?.run).toContain("--jq '.isDraft'");
    expect(retryStep?.run).toContain('gh release delete "v$VERSION" --yes');
    expect(retryStep?.run).toContain("refusing to overwrite it");
    expect(source).toContain(
      "Unsigned builds are published when signing secrets are not configured.",
    );
  });
});
