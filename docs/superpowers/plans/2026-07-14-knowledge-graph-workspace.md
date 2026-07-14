# Knowledge Graph and Workspace Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add hierarchical tags, a scoped knowledge graph, safer data migration/import, and high-impact improvements across every existing planning workspace.

**Architecture:** Pure domain modules normalize tags, derive graph data, validate backups, and compute project integrity findings. React components consume those modules; Zustand and Dexie remain responsible for persistence. Character and wiki records stay independent and connect only through tag hierarchy.

**Tech Stack:** React 19, TypeScript 6, Zustand, Dexie, React Flow, Vitest, React Testing Library, Playwright

---

## File Map

- Create "src/domain/tags.ts" for hierarchical tag normalization and tree helpers.
- Create "src/domain/knowledgeGraph.ts" for graph node and edge derivation.
- Create "src/domain/integrity.ts" for project consistency findings.
- Create "src/domain/backup.ts" for backup validation.
- Create "src/components/tags/HierarchicalTagEditor.tsx" for reusable tag editing.
- Create "src/components/wiki/KnowledgeGraphView.tsx" and "TagTree.tsx" for graph navigation.
- Modify types, database, store, and all workspace components.
- Create unit, component, and Playwright workflow tests.

### Task 1: Configure the Test Harness

**Files:** Modify "package.json" and "vite.config.ts"; create "src/test/setup.ts" and "src/test/smoke.test.ts".

- [ ] Write a failing smoke test:

~~~ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('provides IndexedDB', () => expect(indexedDB).toBeDefined())
})
~~~

- [ ] Run "npm test -- --run src/test/smoke.test.ts"; expect failure because the runner is absent.
- [ ] Install Vitest, jsdom, Testing Library, user-event, jest-dom, and fake-indexeddb. Add test, test:run, and test:coverage scripts. Configure jsdom and "src/test/setup.ts".
- [ ] Run "npm run test:run -- src/test/smoke.test.ts"; expect one passing test.
- [ ] Commit with message "test: add frontend test harness".

### Task 2: Implement Hierarchical Tag Semantics

**Files:** Create "src/domain/tags.ts" and "src/domain/tags.test.ts".

- [ ] Write failing tests:

~~~ts
expect(normalizeTagPath(' 家庭 / 林家 // 直系 ')).toBe('家庭/林家/直系')
expect(tagAncestors('家庭/林家/直系')).toEqual([
  '家庭',
  '家庭/林家',
  '家庭/林家/直系',
])
expect(buildTagTree(['Lore/Magic', 'lore/magic'])).toHaveLength(1)
~~~

- [ ] Run "npm run test:run -- src/domain/tags.test.ts"; expect module-not-found failure.
- [ ] Implement TagTreeNode plus normalizeTagPath, normalizeTagPaths, tagAncestors, isTagDescendant, and buildTagTree. Compare paths case-insensitively but preserve the first display spelling.
- [ ] Re-run the tests; expect all tag tests to pass.
- [ ] Commit with message "feat: add hierarchical tag domain".

### Task 3: Migrate Character Tags and Validate Backups

**Files:** Modify "src/types/index.ts", "src/db/database.ts", and "src/store/useStore.ts"; create "src/domain/backup.ts" and its test.

- [ ] Write failing tests that legacy characters receive an empty tags array and malformed character arrays throw "角色数据格式无效" before a database transaction begins.
- [ ] Run the backup test; expect failure because validateProjectBackup does not exist.
- [ ] Add tags to Character. Add Dexie schema version 2 and normalize every existing character:

~~~ts
tx.table<Character>('characters').toCollection().modify((character) => {
  character.tags = normalizeTagPaths(
    Array.isArray(character.tags) ? character.tags : [],
  )
})
~~~

- [ ] Implement explicit object and array validation in validateProjectBackup, call it before ID remapping, and default new character tags to an empty array. Run domain tests and "npm run build"; expect success.
- [ ] Commit with message "feat: migrate tags and validate backups".

### Task 4: Derive the Knowledge Graph

**Files:** Create "src/domain/knowledgeGraph.ts" and its test; modify "src/types/index.ts".

- [ ] Write failing tests that a "家庭/林家" scope includes child entities and hierarchy edges, and that same-name character and wiki records remain two nodes.
- [ ] Run the graph test; expect module-not-found failure.
- [ ] Define KnowledgeNode, KnowledgeEdge, KnowledgeGraphFilters, and KnowledgeGraphData. Prefix IDs with "character:", "wiki:", and "tag:". Generate hierarchy, membership, character-relation, and character-event edges.
- [ ] Apply branch, entity-type, and edge-type filters, then run tests; expect all graph tests to pass.
- [ ] Commit with message "feat: derive hierarchical knowledge graphs".

### Task 5: Build the Hierarchical Tag Editor

**Files:** Create "src/components/tags/HierarchicalTagEditor.tsx" and its test; modify "src/styles/global.css".

- [ ] Write failing interaction tests for adding "家庭/林家/直系", case-insensitive duplicate rejection, suggestion selection, and icon-button removal.
- [ ] Run the component test; expect module-not-found failure.
- [ ] Implement visible tag chips, a suggestion list, Enter/comma confirmation, empty-input Backspace removal, accessible status messages, and normalized onChange output.
- [ ] Run the editor tests; expect all interactions to pass.
- [ ] Commit with message "feat: add hierarchical tag editor".

### Task 6: Add Wiki Tag Tree and Knowledge Graph View

**Files:** Create "src/components/wiki/TagTree.tsx", "KnowledgeGraphView.tsx", and tests; modify "src/components/WikiPanel.tsx" and global styles.

- [ ] Write failing tests for Entries/Knowledge Graph tabs, selecting "家庭/林家", toggling relationship edges, opening entity details, and clearing an empty filter result.
- [ ] Run the tests; expect failure because the graph view is absent.
- [ ] Implement a React Flow canvas with fixed node dimensions, entity-type colors, tag-tree navigation, segmented entity and edge filters, selected-branch fit, and accessible empty state. Replace comma-only wiki tag entry with HierarchicalTagEditor.
- [ ] Run graph component tests and "npm run build"; expect success.
- [ ] Commit with message "feat: add wiki knowledge graph".

### Task 7: Improve Character Relationships and Event Visibility

**Files:** Modify "src/components/CharacterMap.tsx"; create "src/components/CharacterMap.test.tsx".

- [ ] Write failing tests that character tags save, relation-type filters hide unrelated edges, a selected character lists linked timeline events, and local focus includes immediate neighbors.
- [ ] Run the tests; expect the new controls to be absent.
- [ ] Add HierarchicalTagEditor to character details, derive linked events from characterIds, add relation and tag filters, and focus the selected React Flow neighborhood.
- [ ] Run character tests and the production build; expect success.
- [ ] Commit with message "feat: improve character relationship workspace".

### Task 8: Add Integrity Checks and Module Filters

**Files:** Create "src/domain/integrity.ts" and its test; modify ProjectOverview, Timeline, ForeshadowTable, and StoryBoard.

- [ ] Write a failing test:

~~~ts
const findings = inspectProject({
  storyCards: [],
  characters: [{ id: 'c1', name: '孤立角色', tags: [] }],
  relations: [],
  timelineEvents: [{
    id: 'e1',
    title: '事件',
    characterIds: [],
    chapterId: 'missing',
  }],
  foreshadows: [{
    id: 'f1',
    status: 'resolved',
    resolveChapterId: undefined,
  }],
  wikiEntries: [],
})
expect(findings.map((item) => item.code)).toEqual(expect.arrayContaining([
  'isolated-character',
  'missing-chapter',
  'invalid-foreshadow-resolution',
]))
~~~

- [ ] Run the integrity test; expect failure because inspectProject is absent.
- [ ] Return findings with code, severity, label, detail, view, and optional entityId. Render them in Overview with navigation. Add timeline track/character/chapter filters, foreshadow status/priority filters, reference warnings, StoryBoard fit-view, and delete confirmation.
- [ ] Run integrity tests and "npm run build"; expect success.
- [ ] Commit with message "feat: add planning integrity checks".

### Task 9: Add Recovery States and Shared Accessibility

**Files:** Create "src/components/WorkspaceErrorBoundary.tsx" and its test; modify "src/App.tsx", "src/components/WelcomeScreen.tsx", and "src/styles/global.css".

- [ ] Write failing tests that a graph render error offers a return-to-entries action, a project-load failure shows backup-oriented recovery guidance, icon controls have accessible names, and workspace layouts remain operable at 390 CSS pixels.
- [ ] Run the tests; expect recovery components and responsive behavior to be absent.
- [ ] Add a workspace error boundary around lazy views, a graph-specific fallback that preserves wiki entry editing, and explicit project-load error state. Add focus-visible styles, named icon buttons, responsive filter wrapping, and non-overlapping mobile panels.
- [ ] Run component tests and "npm run build"; expect success with no inaccessible unnamed controls in the tested workflows.
- [ ] Commit with message "fix: add workspace recovery and accessibility".

### Task 10: Add Browser Workflow Coverage

**Files:** Modify "package.json"; create "playwright.config.ts" and "e2e/project-workflow.spec.ts".

- [ ] Install Playwright and write a workflow that creates a project, adds a character and wiki entry, assigns "家庭/林家/直系", scopes the graph to "家庭/林家", exports JSON, restores it, and verifies the restored project.
- [ ] Run the test; expect initial selector failures.
- [ ] Add stable roles, labels, and visible names; use test IDs only for generated graph nodes that lack semantic selectors.
- [ ] Run "npm run test:run", "npx playwright test", and "npm run build"; expect zero failures.
- [ ] Commit with message "test: cover project knowledge workflow".
