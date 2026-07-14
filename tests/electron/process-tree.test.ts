import { existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const helperPath = resolve(process.cwd(), 'scripts/process-tree.mjs')
const processTree = existsSync(helperPath)
  ? await import(/* @vite-ignore */ pathToFileURL(helperPath).href)
  : null

describe('process tree termination', () => {
  it('selects taskkill for an owned Windows process tree', () => {
    expect(processTree).not.toBeNull()
    if (!processTree) return

    expect(processTree.createTerminationPlan(4312, 'win32')).toEqual({
      command: 'taskkill.exe',
      args: ['/PID', '4312', '/T', '/F'],
    })
  })

  it('selects the owned POSIX process group', () => {
    expect(processTree).not.toBeNull()
    if (!processTree) return

    expect(processTree.createTerminationPlan(4312, 'linux')).toEqual({
      processGroupId: -4312,
    })
    expect(processTree.shouldDetachOwnedProcess('linux')).toBe(true)
    expect(processTree.shouldDetachOwnedProcess('win32')).toBe(false)
  })

  it('does not invoke termination for an unowned PID', async () => {
    expect(processTree).not.toBeNull()
    if (!processTree) return

    const execute = vi.fn()
    const terminated = await processTree.terminateProcessTree(
      { pid: 4312, exitCode: null },
      new Set<number>(),
      { platform: 'win32', execute },
    )

    expect(terminated).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })

  it('awaits termination of an owned Windows PID', async () => {
    expect(processTree).not.toBeNull()
    if (!processTree) return

    const child = Object.assign(new EventEmitter(), { pid: 4312, exitCode: null as number | null })
    let release: (() => void) | undefined
    const execute = vi.fn(() => new Promise<void>((resolve) => {
      release = () => {
        child.exitCode = 0
        child.emit('exit', 0, null)
        resolve()
      }
    }))
    const termination = processTree.terminateProcessTree(
      child,
      new Set([4312]),
      { platform: 'win32', execute },
    )

    let settled = false
    void termination.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    release?.()
    await expect(termination).resolves.toBe(true)
  })

  it('forces and awaits child exit when the tree command returns early', async () => {
    expect(processTree).not.toBeNull()
    if (!processTree) return

    const child = Object.assign(new EventEmitter(), {
      pid: 4312,
      exitCode: null as number | null,
      kill: vi.fn(),
    })
    child.kill.mockImplementation(() => {
      child.exitCode = 1
      child.emit('exit', 1, null)
      return true
    })

    await processTree.terminateProcessTree(child, new Set([4312]), {
      platform: 'win32',
      execute: vi.fn().mockResolvedValue(undefined),
      exitTimeoutMs: 0,
    })

    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(child.exitCode).toBe(1)
  })
})
