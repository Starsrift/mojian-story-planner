# Mojian Knowledge Graph and Desktop Release Design

Date: 2026-07-14
Status: Approved design, pending written-spec review

## Goals

This release improves every existing planning module according to user impact, adds hierarchical tags and a knowledge graph, introduces Electron desktop distributions, and establishes automated tests and release checks.

The release must:

- Keep character records focused on relationships and story events.
- Keep wiki character entries focused on descriptive background knowledge.
- Connect characters and wiki entries through hierarchical tags without merging their records.
- Produce Windows `.exe` and `.zip`, macOS `.dmg` and `.zip`, and a web build archive.
- Document that unsigned installers may trigger SmartScreen or Gatekeeper until signing credentials are available.
- Preserve local-first storage and reliable JSON backup and restore.

Cloud sync, accounts, AI content generation, installer signing, and Apple notarization are outside this release.

## Architecture

The React application remains the shared renderer for the web and Electron versions. Electron adds a minimal main process that creates the application window and loads either the Vite development server or the packaged renderer assets.

Electron security defaults are mandatory:

- `nodeIntegration` is disabled.
- `contextIsolation` is enabled.
- The renderer receives no unrestricted filesystem, shell, or process APIs.
- Navigation and new-window requests outside the application are denied or opened through a narrowly scoped external-link handler.
- A restrictive Content Security Policy is used where compatible with Vite and the graph renderer.

Application data remains in IndexedDB. Electron stores it within its own per-user application profile. Browser data is not silently copied into Electron; users move projects through the existing JSON export and import flow.

## Data Model

`WikiEntry.tags` remains the source of wiki tags. `Character` gains a `tags: string[]` field. Existing characters migrate with an empty tag list.

Tags are canonical hierarchical paths with slash-separated segments, for example:

- `Family/Lin/Direct`
- `Religion/Starlight/Priest`

The Chinese UI displays localized examples such as `家庭 / 林家 / 直系`. Storage normalization trims segments, removes empty segments, collapses duplicate separators, and performs case-insensitive deduplication while retaining a stable display label. Existing flat tags are valid root tags and require no destructive migration.

Character records and wiki character entries stay independent:

- Character records describe relationships, involvement, and story events.
- Wiki character entries describe background, identity, family, religion, geography, organizations, and related lore.
- Matching names do not merge records and do not imply identity.

## Knowledge Graph

The wiki workspace adds `Entries` and `Knowledge Graph` views. The graph contains:

- Character nodes from character records.
- Wiki entity nodes for characters, locations, items, events, concepts, and organizations.
- Tag nodes representing each hierarchical path segment.
- Tag membership edges connecting entities to their most specific assigned tag.
- Hierarchy edges connecting child tags to parent tags.
- Optional character relation and character-event edges from the planning data.

Selecting a tag scopes the graph to that tag and its descendants. Selecting `家庭` shows all family branches; selecting `家庭/林家` shows only the Lin family branch and its connected entities; selecting `家庭/林家/直系` narrows the result further.

Users can filter by entity type, tag branch, and edge type. Background knowledge edges and relationship/event edges are visually distinct and can be toggled independently. Clicking a character node opens the relevant character workspace; clicking a wiki node opens its wiki details. Empty graph states explain why no nodes match and offer a way to clear filters.

Graph derivation is implemented as pure, testable functions. Persistent graph node positions may be stored separately from domain data so layout changes do not mutate character or wiki content.

## Existing Module Improvements

### Project Overview

Add actionable integrity checks for unresolved foreshadows, isolated characters and entries, timeline events without participants or chapters, and incomplete planning records. Each check links to the relevant workspace and filter.

### Story Structure

Improve node creation and editing, viewport fit and focus, connection feedback, empty states, and destructive-action confirmation. Preserve existing card positions and links.

### Characters

Add hierarchical tags, linked-event visibility, relationship filtering, and local graph focus. Keep this workspace centered on character relationships and event involvement rather than duplicating wiki background content.

### Timeline

Add filters for track, character, and chapter; improve ordering and cross-workspace navigation; flag events with missing chapter references or no participants.

### Foreshadowing

Add status and priority filters, pending-resolution indicators, and consistency checks for planting and resolution chapters.

### Wiki

Replace comma-only tag editing with a hierarchical tag picker while retaining compatibility with imported flat tags. Add a tag tree, graph view, scoped subgraphs, node details, and graph filters.

### Data Management

Version IndexedDB migrations explicitly. Validate imported JSON before writing, preserve the current project when validation fails, report actionable errors, and verify references after restore. Migration and import operations must not partially overwrite valid data.

### Shared Experience

Standardize save status, confirmations, focus behavior, empty states, keyboard accessibility, and responsive layouts. Scope excludes accounts, cloud sync, and AI generation.

## Electron Packaging and Release

Use Electron with electron-builder because it matches the existing TypeScript toolchain and provides mature Windows and macOS packaging.

A version-tagged GitHub Actions workflow builds on native runners:

- Windows produces an NSIS `.exe`, a portable `.zip`, and SHA-256 checksums.
- macOS produces a `.dmg`, an application `.zip`, and SHA-256 checksums.
- The web renderer build is published as a separate `.zip` fallback.
- Artifact names include product name, version, operating system, and architecture.

Signing and notarization are prepared but disabled. The workflow will support future Windows PFX and Apple Developer ID secrets without changing artifact naming or release structure. Until credentials are configured, documentation must state that SmartScreen and Gatekeeper warnings can occur. Antivirus scanning and checksums improve trust but do not claim to replace trusted code signing.

The release job must not publish a partially successful release. All required artifacts and checksums must exist before release publication.

## Error Handling

- Database migration failures leave the previous database version available and show a recovery-oriented message.
- Import validation failures do not modify existing projects and identify the invalid section.
- Graph build failures degrade to the entries view without blocking wiki editing.
- Empty graph results explain active filters and provide a reset action.
- Electron renderer load failures display a local diagnostic page rather than a blank window.
- Release validation failures stop publication before an incomplete GitHub Release is created.

## Testing Strategy

Use Vitest for unit tests and React Testing Library for component behavior. Use Playwright for browser workflows and an Electron smoke suite for packaged application startup.

Unit coverage includes:

- Hierarchical tag parsing, normalization, ancestors, descendants, and deduplication.
- Knowledge graph node and edge derivation.
- Graph filters and scoped subgraphs.
- Project integrity checks.
- Import validation and database migrations.

Component coverage includes wiki editing, hierarchical tag selection, graph filters, character-event associations, and save/delete feedback.

Playwright covers project creation, character and wiki entry creation, hierarchical tagging, scoped graph generation, JSON export, and restore.

Electron smoke tests verify development startup, packaged renderer loading, window security configuration, and application launch. Release workflows verify required artifact names, file existence, and SHA-256 generation on native Windows and macOS runners.

Pull requests and `main` pushes run type checking, unit tests, component tests, and the web build. Version tags additionally run Electron packaging and release validation.

## Documentation

`README.md` will be updated with:

- Hierarchical tag and knowledge graph behavior.
- The distinction between character planning and wiki character background.
- Web and Electron development commands.
- `.exe`, `.dmg`, platform `.zip`, and web archive installation paths.
- Unsigned installer warnings and the future signing policy.
- Data location, browser-to-desktop migration, backup, and restore guidance.
- Test commands and release artifact naming.

## Acceptance Criteria

The release is accepted when:

1. Existing flat tags remain usable and hierarchical tags can be created and filtered.
2. Characters and wiki entries appear as distinct graph node types connected through tag hierarchy.
3. Selecting a tag branch produces the expected scoped subgraph.
4. Character relationships and events can be shown independently of wiki background links.
5. Existing projects migrate without losing content or references.
6. Import failures leave existing data unchanged.
7. Automated unit, component, browser, build, and Electron smoke checks pass.
8. Windows and macOS release workflows produce all required installers, archives, and checksums.
9. README accurately explains features, migration, installation, unsigned-package limitations, and testing.
