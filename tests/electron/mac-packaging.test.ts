import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

type MacPackagingModule = {
  createBuilderCommand: (
    projectRoot: string,
    lipoOutput: string,
  ) => { command: string; args: string[] }
  createLipoCommand: (projectRoot: string) => { command: string; args: string[] }
  parseLipoArchitecture: (output: string) => 'x64' | 'arm64'
}

const launcherPath = resolve(process.cwd(), 'scripts/package-mac.mjs')

async function loadLauncher(): Promise<MacPackagingModule | undefined> {
  expect(existsSync(launcherPath)).toBe(true)
  if (!existsSync(launcherPath)) return undefined

  return (await import(pathToFileURL(launcherPath).href)) as MacPackagingModule
}

describe('macOS Electron architecture detection', () => {
  it.each([
    ['x86_64', 'x64'],
    ['arm64', 'arm64'],
  ] as const)('maps thin %s Electron binaries to %s artifacts', async (output, arch) => {
    const launcher = await loadLauncher()
    expect(launcher?.parseLipoArchitecture(`${output}\n`)).toBe(arch)
  })

  it.each(['', 'i386', 'x86_64 arm64', 'Architectures: x86_64 arm64'])(
    'rejects unsupported lipo output %j',
    async (output) => {
      const launcher = await loadLauncher()
      if (!launcher) return

      expect(() => launcher.parseLipoArchitecture(output)).toThrow(
        /exactly one supported architecture/,
      )
    },
  )

  it('inspects the installed Electron Mach-O executable with lipo', async () => {
    const launcher = await loadLauncher()

    expect(launcher?.createLipoCommand('/project')).toEqual({
      command: 'lipo',
      args: [
        '-archs',
        resolve(
          '/project',
          'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
        ),
      ],
    })
  })

  it.each([
    ['x86_64', '--x64'],
    ['arm64', '--arm64'],
  ] as const)('passes the verified %s architecture to electron-builder', async (output, flag) => {
    const launcher = await loadLauncher()
    const command = launcher?.createBuilderCommand('/project', output)

    expect(command?.command).toBe(process.execPath)
    expect(command?.args).toEqual([
      resolve('/project', 'node_modules/electron-builder/cli.js'),
      '--mac',
      'dmg',
      'zip',
      flag,
    ])
  })
})
