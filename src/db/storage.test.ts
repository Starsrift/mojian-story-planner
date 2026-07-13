import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  projectPut: vi.fn(),
  projectList: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))

vi.mock('./database', () => ({
  db: {
    projects: {
      put: mocks.projectPut,
      orderBy: () => ({ reverse: () => ({ toArray: mocks.projectList }) }),
    },
  },
}))

import { storage } from './storage'

const project = {
  id: 'project-1',
  name: '长夜',
  description: '',
  createdAt: 1,
  updatedAt: 2,
}

describe('storage adapter', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.invoke.mockResolvedValue(undefined)
    mocks.projectPut.mockReset()
    mocks.projectList.mockReset()
    mocks.isTauri.mockReturnValue(true)
  })

  it('uses the Rust project command in a Tauri window', async () => {
    await storage.putProject(project)

    expect(mocks.invoke).toHaveBeenCalledWith('put_project', { project })
    expect(mocks.projectPut).not.toHaveBeenCalled()
  })

  it('uses the exact entity command argument names', async () => {
    const entity = { id: 'card-1', projectId: 'project-1' }

    await storage.putEntity('storyCards', entity as never)
    await storage.listEntities('storyCards', 'project-1')
    await storage.deleteEntity('storyCards', 'card-1')

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'put_entity', { kind: 'storyCards', entity })
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'list_entities', {
      kind: 'storyCards',
      projectId: 'project-1',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, 'delete_entity', {
      kind: 'storyCards',
      id: 'card-1',
    })
  })

  it('uses aggregate deletion commands for cards and characters', async () => {
    await storage.deleteStoryCard('card-1')
    await storage.deleteCharacter('character-1')

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'delete_story_card', { id: 'card-1' })
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'delete_character', { id: 'character-1' })
  })

  it('keeps IndexedDB as a browser-preview fallback', async () => {
    mocks.isTauri.mockReturnValue(false)
    mocks.projectList.mockResolvedValue([project])

    await storage.putProject(project)
    const projects = await storage.listProjects()

    expect(mocks.projectPut).toHaveBeenCalledWith(project)
    expect(projects).toEqual([project])
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('reports saving until a mutation has actually finished', async () => {
    let resolveWrite!: () => void
    mocks.invoke.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveWrite = resolve
    }))
    const phases: string[] = []
    const unsubscribe = storage.subscribePersistenceStatus((status) => {
      phases.push(status.phase)
    })

    const pending = storage.putProject(project)
    expect(storage.getPersistenceStatus().phase).toBe('saving')

    resolveWrite()
    await pending

    expect(storage.getPersistenceStatus()).toEqual({ phase: 'saved', error: null })
    expect(phases.slice(-2)).toEqual(['saving', 'saved'])
    unsubscribe()
  })

  it('keeps a failed mutation visible to the UI', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('database is locked'))

    await expect(storage.putProject(project)).rejects.toThrow('database is locked')

    expect(storage.getPersistenceStatus()).toEqual({
      phase: 'error',
      error: 'database is locked',
    })
  })

  it('stays in saving state while a queued mutation has not started yet', async () => {
    const finishQueuedMutation = storage.beginQueuedMutation()

    await storage.putProject(project)

    expect(storage.getPersistenceStatus().phase).toBe('saving')
    finishQueuedMutation()
    expect(storage.getPersistenceStatus()).toEqual({ phase: 'saved', error: null })
  })
})
