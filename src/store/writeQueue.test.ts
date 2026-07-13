import { describe, expect, it } from 'vitest'
import { KeyedWriteQueue } from './writeQueue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('KeyedWriteQueue', () => {
  it('serializes writes for the same entity', async () => {
    const queue = new KeyedWriteQueue()
    const firstGate = deferred()
    const events: string[] = []

    const first = queue.run('storyCards:card-1', async () => {
      events.push('first:start')
      await firstGate.promise
      events.push('first:end')
    })
    const second = queue.run('storyCards:card-1', async () => {
      events.push('second:start')
      events.push('second:end')
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    firstGate.resolve()
    await Promise.all([first, second])

    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('does not block a later write after an earlier failure', async () => {
    const queue = new KeyedWriteQueue()
    const events: string[] = []

    const first = queue.run('characters:character-1', async () => {
      events.push('first')
      throw new Error('disk full')
    })
    const second = queue.run('characters:character-1', async () => {
      events.push('second')
    })

    await expect(first).rejects.toThrow('disk full')
    await expect(second).resolves.toBeUndefined()
    expect(events).toEqual(['first', 'second'])
  })

  it('allows different entities to write concurrently', async () => {
    const queue = new KeyedWriteQueue()
    const firstGate = deferred()
    const events: string[] = []

    const first = queue.run('wikiEntries:entry-1', async () => {
      events.push('first:start')
      await firstGate.promise
      events.push('first:end')
    })
    const second = queue.run('wikiEntries:entry-2', async () => {
      events.push('second')
    })

    await second
    expect(events).toEqual(['first:start', 'second'])

    firstGate.resolve()
    await first
  })

  it('waits until every queued write is idle', async () => {
    const queue = new KeyedWriteQueue()
    const gate = deferred()
    let idle = false

    const write = queue.run('storyCards:card-1', async () => {
      await gate.promise
    })
    const waiting = queue.onIdle().then(() => {
      idle = true
    })

    await Promise.resolve()
    expect(idle).toBe(false)

    gate.resolve()
    await Promise.all([write, waiting])
    expect(idle).toBe(true)
  })
})
