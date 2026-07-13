import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  putEntity: vi.fn(),
  deleteEntity: vi.fn(),
  listEntities: vi.fn(),
  beginQueuedMutation: vi.fn(() => () => undefined),
}))

vi.mock('../db/storage', () => ({
  storage: {
    putEntity: mocks.putEntity,
    deleteEntity: mocks.deleteEntity,
    listEntities: mocks.listEntities,
    beginQueuedMutation: mocks.beginQueuedMutation,
  },
}))

vi.mock('../db/database', () => ({
  uid: () => 'generated-id',
}))

import { useStore } from './useStore'

describe('useStore queued updates', () => {
  beforeEach(() => {
    mocks.putEntity.mockReset()
    mocks.deleteEntity.mockReset()
    mocks.deleteEntity.mockResolvedValue(undefined)
    mocks.listEntities.mockReset()
    mocks.listEntities.mockResolvedValue([])
    mocks.beginQueuedMutation.mockClear()
    useStore.setState({
      storyCards: [{
        id: 'card-1',
        projectId: 'project-1',
        title: '原标题',
        summary: '原摘要',
        keyPoints: '',
        notes: '',
        act: 1,
        order: 0,
        position: { x: 0, y: 0 },
        color: '#8b5e3c',
        createdAt: 1,
        updatedAt: 1,
      }],
    })
  })

  it('merges rapid patches against the latest persisted entity', async () => {
    let resolveFirst!: () => void
    mocks.putEntity
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce(undefined)

    const first = useStore.getState().updateStoryCard('card-1', { summary: '新摘要' })
    const second = useStore.getState().updateStoryCard('card-1', { title: '新标题' })

    await Promise.resolve()
    expect(mocks.putEntity).toHaveBeenCalledTimes(1)

    resolveFirst()
    await Promise.all([first, second])

    expect(mocks.putEntity).toHaveBeenNthCalledWith(
      2,
      'storyCards',
      expect.objectContaining({ title: '新标题', summary: '新摘要' }),
    )
    expect(useStore.getState().storyCards[0]).toEqual(
      expect.objectContaining({ title: '新标题', summary: '新摘要' }),
    )
  })

  it('serializes an entity deletion after its pending update', async () => {
    let resolveUpdate!: () => void
    mocks.putEntity.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveUpdate = resolve
    }))
    useStore.setState({
      timelineEvents: [{
        id: 'event-1',
        projectId: 'project-1',
        title: '开端',
        description: '',
        track: '主线',
        order: 0,
        characterIds: [],
        color: '#8b5e3c',
        createdAt: 1,
        updatedAt: 1,
      }],
    })

    const update = useStore.getState().updateTimelineEvent('event-1', { title: '新开端' })
    const deletion = useStore.getState().deleteTimelineEvent('event-1')

    await Promise.resolve()
    expect(mocks.deleteEntity).not.toHaveBeenCalled()

    resolveUpdate()
    await Promise.all([update, deletion])

    expect(mocks.deleteEntity).toHaveBeenCalledWith('timelineEvents', 'event-1')
    expect(useStore.getState().timelineEvents).toEqual([])
  })

  it('waits for queued updates before loading another project', async () => {
    let resolveFirst!: () => void
    mocks.putEntity
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce(undefined)

    const first = useStore.getState().updateStoryCard('card-1', { summary: '排队摘要' })
    const second = useStore.getState().updateStoryCard('card-1', { title: '排队标题' })
    const switching = useStore.getState().selectProject('project-2')

    await Promise.resolve()
    expect(mocks.listEntities).not.toHaveBeenCalled()

    resolveFirst()
    await Promise.all([first, second, switching])

    expect(mocks.putEntity).toHaveBeenNthCalledWith(
      2,
      'storyCards',
      expect.objectContaining({ title: '排队标题', summary: '排队摘要' }),
    )
    expect(useStore.getState().currentProjectId).toBe('project-2')
    expect(mocks.listEntities).toHaveBeenCalledTimes(7)
  })
})
