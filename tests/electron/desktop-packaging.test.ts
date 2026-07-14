import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

type RuntimeArchitecture = 'x64' | 'arm64'

type DesktopPackagingModule = {
  createDesktopPackageCommand: (options: {
    nativeArchitecture: string
    platform: string
    projectRoot: string
    runtimeArchitecture?: RuntimeArchitecture
  }) => { command: string; args: string[] }
  parseWindowsElectronArchitecture: (binary: Buffer) => RuntimeArchitecture
}

const dispatcherPath = resolve(process.cwd(), 'scripts/package-electron.mjs')

async function loadDispatcher(): Promise<DesktopPackagingModule | undefined> {
  expect(existsSync(dispatcherPath)).toBe(true)
  if (!existsSync(dispatcherPath)) return undefined

  return (await import(pathToFileURL(dispatcherPath).href)) as DesktopPackagingModule
}

function createPeBinary(machine: number): Buffer {
  const binary = Buffer.alloc(128)
  binary.write('MZ', 0, 'ascii')
  binary.writeUInt32LE(64, 0x3c)
  binary.write('PE\0\0', 64, 'binary')
  binary.writeUInt16LE(machine, 68)
  return binary
}

describe('generic desktop packaging dispatcher', () => {
  it.each([
    [0x8664, 'x64'],
    [0xaa64, 'arm64'],
  ] as const)('reads PE machine 0x%s as %s', async (machine, architecture) => {
    const dispatcher = await loadDispatcher()

    expect(dispatcher?.parseWindowsElectronArchitecture(createPeBinary(machine))).toBe(
      architecture,
    )
  })

  it.each([Buffer.from('not PE'), createPeBinary(0x014c)])(
    'rejects malformed or unsupported Windows Electron binaries',
    async (binary) => {
      const dispatcher = await loadDispatcher()
      if (!dispatcher) return

      expect(() => dispatcher.parseWindowsElectronArchitecture(binary)).toThrow(
        /supported Windows Electron architecture/,
      )
    },
  )

  it('delegates Darwin packaging exclusively to the lipo-verified launcher', async () => {
    const dispatcher = await loadDispatcher()
    const command = dispatcher?.createDesktopPackageCommand({
      nativeArchitecture: 'x64',
      platform: 'darwin',
      projectRoot: '/project',
    })

    expect(command).toEqual({
      command: process.execPath,
      args: [resolve('/project', 'scripts/package-mac.mjs')],
    })
    expect(command?.args.join(' ')).not.toContain('electron-builder')
  })

  it.each([
    ['x64', '--x64'],
    ['arm64', '--arm64'],
  ] as const)('builds explicit Windows targets for matching %s runtimes', async (architecture, flag) => {
    const dispatcher = await loadDispatcher()
    const command = dispatcher?.createDesktopPackageCommand({
      nativeArchitecture: architecture,
      platform: 'win32',
      projectRoot: '/project',
      runtimeArchitecture: architecture,
    })

    expect(command).toEqual({
      command: process.execPath,
      args: [
        resolve('/project', 'node_modules/electron-builder/cli.js'),
        '--win',
        'nsis',
        'zip',
        flag,
      ],
    })
  })

  it('rejects a Windows runtime that does not match the native Node architecture', async () => {
    const dispatcher = await loadDispatcher()
    if (!dispatcher) return

    expect(() =>
      dispatcher.createDesktopPackageCommand({
        nativeArchitecture: 'arm64',
        platform: 'win32',
        projectRoot: '/project',
        runtimeArchitecture: 'x64',
      }),
    ).toThrow(/does not match native Node architecture/)
  })

  it('rejects unsupported host platforms', async () => {
    const dispatcher = await loadDispatcher()
    if (!dispatcher) return

    expect(() =>
      dispatcher.createDesktopPackageCommand({
        nativeArchitecture: 'x64',
        platform: 'linux',
        projectRoot: '/project',
      }),
    ).toThrow(/Unsupported desktop packaging platform/)
  })
})
