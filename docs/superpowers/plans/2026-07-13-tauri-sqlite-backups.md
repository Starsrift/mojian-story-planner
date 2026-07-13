# Tauri SQLite Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows/macOS Tauri desktop application whose canonical data store is `~/.mojian/mojian.db` and which creates a consistent SQLite backup every 48 hours in `~/.mojian/backups`.

**Architecture:** React/Zustand talks only to a `storage` adapter. In Tauri it invokes Rust commands backed by rusqlite; in browser preview it falls back to Dexie. The Rust process owns schema initialization, old JSON migration, database backups, retention, autostart, and tray lifecycle.

**Tech Stack:** Tauri 2, Rust, rusqlite with bundled SQLite and backup API, serde/serde_json, React 19, TypeScript 6, Zustand, Dexie browser fallback.

## Global Constraints

- Canonical desktop database path is `~/.mojian/mojian.db` on both Windows and macOS.
- Automatic backup directory is `~/.mojian/backups`.
- Backup interval is 48 hours and retention is 30 successful snapshots.
- Existing `~/.mojian/latest.json` is imported only when the SQLite database has no projects.
- Browser preview is not a production storage mode and must be labeled “浏览器预览”.
- No cloud upload, backup encryption, incremental backup, or settings UI is included.

---

### Task 1: Storage engine and commands

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/storage.rs`
- Create: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/storage.rs`

**Interfaces:**
- Produces: `StorageEngine::open(root: PathBuf) -> Result<Self>`, project/entity CRUD methods, `import_project_bundle(Value)`, `migrate_legacy_snapshot()`, `backup_if_due(now)`, and serializable `StorageStatus`.
- Produces Tauri commands: `list_projects`, `put_project`, `delete_project`, `list_entities`, `put_entity`, `delete_entity`, `import_project_bundle`, `storage_status`, `backup_now`.

- [ ] **Step 1: Write failing Rust tests** for schema creation, entity validation and CRUD, cascade deletion, legacy snapshot import, backup due logic, readable backup output, and 30-file retention.
- [ ] **Step 2: Run red tests** with `cargo test --manifest-path src-tauri/Cargo.toml`; expected failure is missing `StorageEngine` behavior.
- [ ] **Step 3: Implement the minimal engine** with `projects`, `entities`, and `metadata` tables; whitelist the seven entity kinds and wrap multi-row imports in transactions.
- [ ] **Step 4: Implement safe backups** with SQLite Online Backup API, temporary output plus rename, `PRAGMA integrity_check`, and metadata update only after success.
- [ ] **Step 5: Run green tests** with `cargo test --manifest-path src-tauri/Cargo.toml`; expected output has zero failed tests.

### Task 2: Tauri desktop lifecycle

**Files:**
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `StorageEngine` and the command functions from Task 1.
- Produces: main window, tray “显示墨笺/退出”, hidden `--background` launch, hourly backup checker, and Windows/macOS autostart.

- [ ] **Step 1: Add a failing lifecycle unit test** for parsing `--background` and close/quit state transitions.
- [ ] **Step 2: Run the focused test** and confirm it fails because lifecycle helpers do not exist.
- [ ] **Step 3: Configure Tauri** with Vite `devUrl`, `frontendDist`, identifier `com.starsrift.mojian`, and the `autostart` plugin using macOS LaunchAgent.
- [ ] **Step 4: Add tray and background behavior** so a normal close hides the window while explicit tray exit terminates the app.
- [ ] **Step 5: Start the hourly checker** and invoke `backup_if_due` once during setup; errors are logged without stopping editing.
- [ ] **Step 6: Run all Rust tests** and `cargo check --manifest-path src-tauri/Cargo.toml`.

### Task 3: Frontend storage adapter and save status

**Files:**
- Modify: `src/db/storage.ts`
- Modify: `src/store/useStore.ts`
- Modify: `src/components/TopBar.tsx`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: the eight Tauri commands from Task 1.
- Produces: typed `storage` methods and `StorageStatus { backend, databasePath, backupDirectory, lastBackupAt }`.

- [ ] **Step 1: Add a failing adapter test** that verifies Tauri invokes use the exact command and argument names and browser mode delegates to Dexie.
- [ ] **Step 2: Run the test** and confirm the adapter lacks the required behavior.
- [ ] **Step 3: Route all Zustand persistence** through `storage`; construct a complete updated entity before `putEntity` and only mutate state after persistence resolves.
- [ ] **Step 4: Display backend truth** as “SQLite 已保存” with database/backup paths in Tauri and “浏览器预览” in Vite.
- [ ] **Step 5: Run frontend tests and `npm run build`**; expected result is zero failures and a successful Vite production build.

### Task 4: Cross-platform setup and documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `start-macos.command`
- Modify: `start-windows.bat`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run desktop:dev`, `npm run desktop:build`, and beginner-friendly launchers that validate Node and Rust.

- [ ] **Step 1: Update launchers** to check `rustc` and `cargo`, link to `https://rustup.rs/` when missing, then run `npm run desktop:dev`.
- [ ] **Step 2: Rewrite README storage claims** so SQLite is canonical, IndexedDB is browser preview only, and paths/interval/retention/migration are explicit.
- [ ] **Step 3: Run shell syntax checks** with `zsh -n start-macos.command` and manually inspect Windows batch labels and error paths.
- [ ] **Step 4: Run complete verification** with `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `npm run tauri build -- --debug --no-bundle`.
- [ ] **Step 5: Review `git diff --check` and `git status --short`** to ensure no generated build artifacts or unrelated files are included.

### Task 5: GitHub Release automation

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: version `0.1.0`, `npm test`, Cargo tests, and the Tauri desktop build from Tasks 1–4.
- Produces: Draft GitHub Release assets for macOS Apple Silicon DMG, macOS Intel DMG, and Windows x64 NSIS.

- [ ] **Step 1: Align application versions** across npm, Cargo, and Tauri configuration.
- [ ] **Step 2: Add the release matrix** triggered by `v*` tags or manual dispatch, with `contents: write` limited to this workflow.
- [ ] **Step 3: Test before packaging** by running frontend and Rust test suites on every native build runner.
- [ ] **Step 4: Upload installers to a Draft Release** with generated release notes; do not publish the release automatically.
- [ ] **Step 5: Document tag creation, supported assets, unsigned-test warnings, and the manual publish gate.**
