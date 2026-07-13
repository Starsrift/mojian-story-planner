import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Table } from 'dexie'
import { db } from './database'
import type {
  Character,
  CharacterRelation,
  Foreshadow,
  Project,
  StoryCard,
  StoryLink,
  TimelineEvent,
  WikiEntry,
} from '../types'

export type EntityKind =
  | 'storyCards'
  | 'storyLinks'
  | 'characters'
  | 'relations'
  | 'timelineEvents'
  | 'foreshadows'
  | 'wikiEntries'

export interface EntityMap {
  storyCards: StoryCard
  storyLinks: StoryLink
  characters: Character
  relations: CharacterRelation
  timelineEvents: TimelineEvent
  foreshadows: Foreshadow
  wikiEntries: WikiEntry
}

export type ProjectBundle = {
  project: Project
  data: { [K in EntityKind]: EntityMap[K][] }
}

export type StorageStatus = {
  backend: 'sqlite' | 'indexeddb'
  databasePath?: string
  backupDirectory?: string
  lastBackupAt?: string
}

export type PersistenceStatus =
  | { phase: 'saved'; error: null }
  | { phase: 'saving'; error: null }
  | { phase: 'error'; error: string }

type PersistenceStatusListener = (status: PersistenceStatus) => void

let persistenceStatus: PersistenceStatus = { phase: 'saved', error: null }
let pendingMutations = 0
let queuedMutations = 0
let mutationBatchError: string | null = null
const persistenceStatusListeners = new Set<PersistenceStatusListener>()

function setPersistenceStatus(status: PersistenceStatus) {
  persistenceStatus = status
  persistenceStatusListeners.forEach((listener) => listener(status))
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function settlePersistenceStatus() {
  if (pendingMutations > 0 || queuedMutations > 0) return
  if (mutationBatchError) {
    setPersistenceStatus({ phase: 'error', error: mutationBatchError })
  } else {
    setPersistenceStatus({ phase: 'saved', error: null })
  }
}

function beginQueuedMutation() {
  if (pendingMutations === 0 && queuedMutations === 0) {
    mutationBatchError = null
  }
  queuedMutations += 1
  setPersistenceStatus({ phase: 'saving', error: null })
  let finished = false

  return () => {
    if (finished) return
    finished = true
    queuedMutations -= 1
    settlePersistenceStatus()
  }
}

async function trackMutation<T>(operation: () => Promise<T>): Promise<T> {
  if (pendingMutations === 0 && queuedMutations === 0) {
    mutationBatchError = null
  }
  pendingMutations += 1
  setPersistenceStatus({ phase: 'saving', error: null })

  try {
    const result = await operation()
    pendingMutations -= 1
    settlePersistenceStatus()
    return result
  } catch (error) {
    pendingMutations -= 1
    mutationBatchError = errorMessage(error)
    setPersistenceStatus({ phase: 'error', error: mutationBatchError })
    throw error
  }
}

function getPersistenceStatus() {
  return persistenceStatus
}

function subscribePersistenceStatus(listener: PersistenceStatusListener) {
  persistenceStatusListeners.add(listener)
  listener(persistenceStatus)
  return () => {
    persistenceStatusListeners.delete(listener)
  }
}

export function isDesktopRuntime() {
  return isTauri()
}

function browserTable<K extends EntityKind>(kind: K) {
  return db[kind] as Table<EntityMap[K], string>
}

async function listProjects() {
  if (isDesktopRuntime()) {
    return invoke<Project[]>('list_projects')
  }
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

async function putProject(project: Project) {
  await trackMutation(async () => {
    if (isDesktopRuntime()) {
      await invoke('put_project', { project })
      return
    }
    await db.projects.put(project)
  })
}

async function deleteProject(projectId: string) {
  await trackMutation(async () => {
    if (isDesktopRuntime()) {
      await invoke('delete_project', { projectId })
      return
    }

    await db.transaction(
      'rw',
      [
        db.projects,
        db.storyCards,
        db.storyLinks,
        db.characters,
        db.relations,
        db.timelineEvents,
        db.foreshadows,
        db.wikiEntries,
      ],
      async () => {
        await db.projects.delete(projectId)
        await db.storyCards.where('projectId').equals(projectId).delete()
        await db.storyLinks.where('projectId').equals(projectId).delete()
        await db.characters.where('projectId').equals(projectId).delete()
        await db.relations.where('projectId').equals(projectId).delete()
        await db.timelineEvents.where('projectId').equals(projectId).delete()
        await db.foreshadows.where('projectId').equals(projectId).delete()
        await db.wikiEntries.where('projectId').equals(projectId).delete()
      },
    )
  })
}

async function listEntities<K extends EntityKind>(kind: K, projectId: string) {
  if (isDesktopRuntime()) {
    return invoke<EntityMap[K][]>('list_entities', { kind, projectId })
  }
  return browserTable(kind).where('projectId').equals(projectId).toArray()
}

async function putEntity<K extends EntityKind>(kind: K, entity: EntityMap[K]) {
  await trackMutation(async () => {
    if (isDesktopRuntime()) {
      await invoke('put_entity', { kind, entity })
      return
    }
    await browserTable(kind).put(entity)
  })
}

async function deleteEntity(kind: EntityKind, id: string) {
  await trackMutation(async () => {
    if (isDesktopRuntime()) {
      await invoke('delete_entity', { kind, id })
      return
    }
    await browserTable(kind).delete(id)
  })
}

async function deleteStoryCard(id: string) {
  await trackMutation(async () => {
    if (isDesktopRuntime()) {
      await invoke('delete_story_card', { id })
      return
    }
    await db.transaction('rw', [db.storyCards, db.storyLinks], async () => {
      await db.storyLinks.where('source').equals(id).or('target').equals(id).delete()
      await db.storyCards.delete(id)
    })
  })
}

async function deleteCharacter(id: string) {
  await trackMutation(async () => {
    if (isDesktopRuntime()) {
      await invoke('delete_character', { id })
      return
    }
    await db.transaction('rw', [db.characters, db.relations], async () => {
      await db.relations.where('source').equals(id).or('target').equals(id).delete()
      await db.characters.delete(id)
    })
  })
}

async function importProjectBundle(bundle: ProjectBundle) {
  await trackMutation(async () => {
    if (isDesktopRuntime()) {
      await invoke('import_project_bundle', { bundle })
      return
    }

    await db.transaction(
      'rw',
      [
        db.projects,
        db.storyCards,
        db.storyLinks,
        db.characters,
        db.relations,
        db.timelineEvents,
        db.foreshadows,
        db.wikiEntries,
      ],
      async () => {
        await db.projects.put(bundle.project)
        if (bundle.data.storyCards.length) await db.storyCards.bulkPut(bundle.data.storyCards)
        if (bundle.data.storyLinks.length) await db.storyLinks.bulkPut(bundle.data.storyLinks)
        if (bundle.data.characters.length) await db.characters.bulkPut(bundle.data.characters)
        if (bundle.data.relations.length) await db.relations.bulkPut(bundle.data.relations)
        if (bundle.data.timelineEvents.length) await db.timelineEvents.bulkPut(bundle.data.timelineEvents)
        if (bundle.data.foreshadows.length) await db.foreshadows.bulkPut(bundle.data.foreshadows)
        if (bundle.data.wikiEntries.length) await db.wikiEntries.bulkPut(bundle.data.wikiEntries)
      },
    )
  })
}

async function getStorageStatus(): Promise<StorageStatus> {
  if (isDesktopRuntime()) {
    return invoke<StorageStatus>('storage_status')
  }
  return { backend: 'indexeddb' }
}

export const storage = {
  listProjects,
  putProject,
  deleteProject,
  listEntities,
  putEntity,
  deleteEntity,
  deleteStoryCard,
  deleteCharacter,
  importProjectBundle,
  getStorageStatus,
  getPersistenceStatus,
  subscribePersistenceStatus,
  beginQueuedMutation,
}
