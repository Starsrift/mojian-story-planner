# Electron Desktop and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Package Mojian as secure Electron applications for Windows and macOS and publish installers, archives, checksums, and a web fallback from version tags.

**Architecture:** A minimal Electron main process hosts the existing Vite renderer with context isolation and no Node integration. electron-builder produces native artifacts; GitHub Actions builds on native runners and publishes only after validating the complete artifact set.

**Tech Stack:** Electron, electron-builder, Vite, TypeScript, GitHub Actions, Vitest, Playwright Electron

---

## File Map

- Create "electron/main.ts", "preload.ts", and "tsconfig.json".
- Create release artifact validation and tests under "scripts".
- Create Electron security and smoke tests under "tests/electron".
- Create ".github/workflows/ci.yml" and "release.yml".
- Modify package metadata, Vite config, CSP, gitignore, and README.

### Task 1: Add the Secure Electron Shell

**Files:** Modify "package.json", "vite.config.ts", and "index.html"; create the Electron files and "tests/electron/security.test.ts".

- [ ] Write a failing static security test:

~~~ts
const source = readFileSync('electron/main.ts', 'utf8')
expect(source).toContain('contextIsolation: true')
expect(source).toContain('nodeIntegration: false')
expect(source).toContain('sandbox: true')
~~~

- [ ] Run "npm run test:run -- tests/electron/security.test.ts"; expect missing-file failure.
- [ ] Install electron, electron-builder, concurrently, and wait-on. Create one BrowserWindow with the asserted security options, deny foreign navigation and new windows, and allow only HTTPS external links through shell.openExternal. Load the Vite URL in development and packaged index in production.
- [ ] Add a narrow preload bridge exposing only a frozen version value. Run the security test and "npm run electron:dev"; expect a working desktop window.
- [ ] Commit with message "feat: add secure electron shell".

### Task 2: Configure Native Packaging

**Files:** Modify "package.json" and ".gitignore"; create "tests/electron/package-config.test.ts".

- [ ] Write a failing metadata test requiring product name "Mojian Story Planner", Windows targets NSIS and zip, macOS targets DMG and zip, and artifact names containing version, OS, and architecture.
- [ ] Run the test; expect missing build metadata.
- [ ] Set appId "com.starsrift.mojian", include web and Electron outputs, write to "release", configure assisted NSIS installation, and set macOS productivity category. Add build:electron, electron:build, dist:win, and dist:mac scripts.
- [ ] Run the metadata test and "npm run dist:win"; expect an unsigned EXE and ZIP in "release".
- [ ] Commit with message "build: configure desktop packaging".

### Task 3: Validate Artifacts and Checksums

**Files:** Create "scripts/verify-release-artifacts.mjs" and its test; modify "package.json".

- [ ] Write failing tests for a missing artifact, duplicate artifact, complete Windows set, complete macOS set, and sorted SHA256SUMS output.
- [ ] Run the tests; expect module-not-found failure.
- [ ] Implement command arguments platform, version, and dir. Match required extensions exactly, reject incomplete sets, stream SHA-256 hashes, write sorted checksum lines, and exit nonzero on mismatch.
- [ ] Run validator tests; expect all cases to pass.
- [ ] Commit with message "build: validate release artifacts".

### Task 4: Add CI and Native Release Workflows

**Files:** Create ".github/workflows/ci.yml" and ".github/workflows/release.yml".

- [ ] Add CI for pull requests and main pushes using Node 24, npm ci, test:run, and build.
- [ ] Add version-tag Windows and macOS jobs on native runners. Each runs tests, builds both native target formats, validates required files, and uploads complete outputs.
- [ ] Add a web job producing a versioned web ZIP and checksum.
- [ ] Add a publish job depending on every build job. It downloads and revalidates all artifacts before creating a GitHub Release. Map future Windows PFX and Apple Developer ID secrets conditionally; leave signing disabled when absent.
- [ ] Format-check both workflow files and commit with message "ci: publish native desktop releases".

### Task 5: Add Electron Smoke Coverage

**Files:** Create "tests/electron/smoke.spec.ts"; modify "playwright.config.ts" and "package.json".

- [ ] Write a Playwright Electron test that launches the compiled app, finds one visible window, verifies the welcome screen, and asserts isolated, sandboxed webPreferences with Node integration disabled.
- [ ] Run "npm run test:electron"; expect failure until the Electron build is included.
- [ ] Make test:electron run the web build, Electron TypeScript build, and a dedicated Playwright Electron project.
- [ ] Re-run test:electron; expect launch and security assertions to pass.
- [ ] Commit with message "test: add electron smoke coverage".

### Task 6: Rewrite Installation and Release Documentation

**Files:** Modify "README.md".

- [ ] Remove the obsolete statement that installers exist only for v1.0. Document EXE, DMG, platform ZIP, checksum, and web fallback artifacts for later releases.
- [ ] State that current installers are unsigned and may trigger SmartScreen or Gatekeeper; document SHA-256 verification without claiming it replaces signing.
- [ ] Explain separate browser and Electron IndexedDB profiles and JSON migration.
- [ ] Document development, unit, browser, Electron, build, and native packaging commands.
- [ ] Run tests and build, then commit with message "docs: document desktop releases and testing".

### Task 7: Final Release Verification

**Files:** No new files.

- [ ] Run "npm run test:run"; expect zero failed tests.
- [ ] Run "npx playwright test" and "npm run test:electron"; expect all workflows to pass.
- [ ] Run "npm run build" and "npm run dist:win"; expect web build, unsigned EXE, ZIP, and checksums.
- [ ] Run "git diff --check" and inspect the README and package metadata; expect no formatting or requirement gaps.
- [ ] Push the implementation branch only after user approval.
