import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

import { describe, expect, it } from 'vitest'

const buildScriptPath = resolve(process.cwd(), 'scripts/build-electron.mjs')
const preloadArtifactPath = resolve(process.cwd(), 'dist-electron/preload.cjs')
const mainProcessSource = readFileSync(resolve(process.cwd(), 'electron/main.ts'), 'utf8')

describe('sandboxed preload artifact', () => {
  it('builds and executes as CommonJS while exposing only frozen version data', () => {
    expect(existsSync(buildScriptPath)).toBe(true)
    if (!existsSync(buildScriptPath)) return

    execFileSync(process.execPath, [buildScriptPath], {
      cwd: process.cwd(),
      stdio: 'pipe',
    })

    expect(existsSync(preloadArtifactPath)).toBe(true)
    const artifact = readFileSync(preloadArtifactPath, 'utf8')
    let exposedName: string | undefined
    let exposedValue: unknown

    runInNewContext(artifact, {
      console,
      process: { versions: { electron: '43.1.0-test' } },
      require: (specifier: string) => {
        expect(specifier).toBe('electron')
        return {
          contextBridge: {
            exposeInMainWorld(name: string, value: unknown) {
              exposedName = name
              exposedValue = value
            },
          },
        }
      },
    })

    expect(exposedName).toBe('desktop')
    expect(exposedValue).toEqual({ version: '43.1.0-test' })
    expect(Object.isFrozen(exposedValue)).toBe(true)
    expect(artifact).not.toMatch(/^\s*import\s/m)
  })

  it('is referenced by the exact CommonJS artifact name', () => {
    expect(mainProcessSource).toContain("join(electronDirectory, 'preload.cjs')")
  })
})
