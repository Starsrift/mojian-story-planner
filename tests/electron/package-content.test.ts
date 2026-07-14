import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { listPackage } from '@electron/asar'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const npmCliPath = process.env.npm_execpath
const buildScriptPath = resolve(projectRoot, 'scripts/build-electron.mjs')
const cleanScriptPath = resolve(projectRoot, 'scripts/clean-release.mjs')
const afterPackPath = resolve(projectRoot, 'scripts/after-pack.mjs')

type AfterPackHook = (context: object) => Promise<void>

async function runAfterPack(context: object): Promise<void> {
  const hookModule = (await import(pathToFileURL(afterPackPath).href)) as {
    default: AfterPackHook
  }
  await hookModule.default(context)
}

describe('release cleanup', () => {
  it('ignores arbitrary CLI paths and removes only its project release directory', () => {
    expect(existsSync(cleanScriptPath)).toBe(true)
    if (!existsSync(cleanScriptPath)) return

    const fixtureRoot = mkdtempSync(join(tmpdir(), 'mojian-clean-release-'))
    const fixtureScript = join(fixtureRoot, 'scripts', 'clean-release.mjs')
    const releaseDirectory = join(fixtureRoot, 'release')
    const unrelatedDirectory = mkdtempSync(join(tmpdir(), 'mojian-clean-unrelated-'))

    try {
      mkdirSync(dirname(fixtureScript), { recursive: true })
      mkdirSync(releaseDirectory)
      writeFileSync(join(releaseDirectory, 'stale.txt'), 'stale')
      writeFileSync(join(unrelatedDirectory, 'keep.txt'), 'keep')
      copyFileSync(cleanScriptPath, fixtureScript)

      execFileSync(process.execPath, [fixtureScript, unrelatedDirectory])

      expect(existsSync(releaseDirectory)).toBe(false)
      expect(existsSync(join(unrelatedDirectory, 'keep.txt'))).toBe(true)
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
      rmSync(unrelatedDirectory, { recursive: true, force: true })
    }
  })
})

describe('custom Electron distribution cleanup', () => {
  it('removes only Windows runtime metadata from appOutDir', async () => {
    expect(existsSync(afterPackPath)).toBe(true)
    if (!existsSync(afterPackPath)) return

    const appOutDir = mkdtempSync(join(tmpdir(), 'mojian-after-pack-win-'))
    const unrelatedDirectory = mkdtempSync(join(tmpdir(), 'mojian-after-pack-unrelated-'))
    const defaultAppPath = join(appOutDir, 'resources', 'default_app.asar')
    const applicationAsarPath = join(appOutDir, 'resources', 'app.asar')
    const unrelatedPath = join(unrelatedDirectory, 'keep.txt')

    try {
      mkdirSync(dirname(defaultAppPath), { recursive: true })
      writeFileSync(defaultAppPath, 'default app')
      writeFileSync(applicationAsarPath, 'application')
      writeFileSync(join(appOutDir, 'version'), '43.1.0')
      writeFileSync(unrelatedPath, 'keep')

      await runAfterPack({
        appOutDir,
        electronPlatformName: 'win32',
        packager: { appInfo: { productFilename: 'Mojian Story Planner' } },
      })

      expect(existsSync(defaultAppPath)).toBe(false)
      expect(existsSync(join(appOutDir, 'version'))).toBe(false)
      expect(existsSync(applicationAsarPath)).toBe(true)
      expect(existsSync(unrelatedPath)).toBe(true)
    } finally {
      rmSync(appOutDir, { recursive: true, force: true })
      rmSync(unrelatedDirectory, { recursive: true, force: true })
    }
  })

  it('uses the final product bundle name for macOS runtime metadata', async () => {
    expect(existsSync(afterPackPath)).toBe(true)
    if (!existsSync(afterPackPath)) return

    const appOutDir = mkdtempSync(join(tmpdir(), 'mojian-after-pack-mac-'))
    const productFilename = 'Mojian Story Planner'
    const resourcesDirectory = join(
      appOutDir,
      `${productFilename}.app`,
      'Contents',
      'Resources',
    )
    const defaultAppPath = join(resourcesDirectory, 'default_app.asar')
    const applicationAsarPath = join(resourcesDirectory, 'app.asar')

    try {
      mkdirSync(resourcesDirectory, { recursive: true })
      writeFileSync(defaultAppPath, 'default app')
      writeFileSync(applicationAsarPath, 'application')
      writeFileSync(join(appOutDir, 'version'), '43.1.0')

      await runAfterPack({
        appOutDir,
        electronPlatformName: 'darwin',
        packager: { appInfo: { productFilename } },
      })

      expect(existsSync(defaultAppPath)).toBe(false)
      expect(existsSync(join(appOutDir, 'version'))).toBe(false)
      expect(existsSync(applicationAsarPath)).toBe(true)
    } finally {
      rmSync(appOutDir, { recursive: true, force: true })
    }
  })

  it('rejects a macOS product filename that escapes appOutDir', async () => {
    expect(existsSync(afterPackPath)).toBe(true)
    if (!existsSync(afterPackPath)) return

    const fixtureRoot = mkdtempSync(join(tmpdir(), 'mojian-after-pack-safe-'))
    const appOutDir = join(fixtureRoot, 'app-out')
    const escapedPath = join(fixtureRoot, 'outside.app', 'Contents', 'Resources')

    try {
      mkdirSync(appOutDir)
      mkdirSync(escapedPath, { recursive: true })
      writeFileSync(join(escapedPath, 'default_app.asar'), 'keep')

      await expect(
        runAfterPack({
          appOutDir,
          electronPlatformName: 'darwin',
          packager: { appInfo: { productFilename: '../outside' } },
        }),
      ).rejects.toThrow(/outside appOutDir/)
      expect(existsSync(join(escapedPath, 'default_app.asar'))).toBe(true)
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })
})

describe('Electron production output', () => {
  it('does not emit source maps', () => {
    execFileSync(process.execPath, [buildScriptPath], { cwd: projectRoot })

    const files = readdirSync(resolve(projectRoot, 'dist-electron'))
    expect(files.filter((file) => file.endsWith('.map'))).toEqual([])
  })
})

describe.runIf(process.platform === 'win32')('packaged application contents', () => {
  let outputDirectory: string
  let appOutDir: string

  beforeAll(() => {
    if (!npmCliPath) throw new Error('npm_execpath is required for packaging tests')

    outputDirectory = mkdtempSync(join(tmpdir(), 'mojian-package-content-'))
    appOutDir = join(outputDirectory, 'win-unpacked')

    execFileSync(process.execPath, [npmCliPath, 'run', 'build'], {
      cwd: projectRoot,
      stdio: 'pipe',
    })
    execFileSync(process.execPath, [npmCliPath, 'run', 'build:electron'], {
      cwd: projectRoot,
      stdio: 'pipe',
    })
    execFileSync(
      process.execPath,
      [
        resolve(projectRoot, 'node_modules/electron-builder/cli.js'),
        '--win',
        'dir',
        '--x64',
        `--config.directories.output=${outputDirectory}`,
      ],
      { cwd: projectRoot, stdio: 'pipe' },
    )
  }, 120_000)

  afterAll(() => {
    rmSync(outputDirectory, { recursive: true, force: true })
  })

  it('contains only compiled application files in ASAR', () => {
    const archivePath = join(appOutDir, 'resources', 'app.asar')
    const entries = listPackage(archivePath, { isPack: false }).map((entry) =>
      entry.replaceAll('\\', '/').replace(/^\//, ''),
    )
    const electronFiles = entries.filter(
      (entry) => entry.startsWith('dist-electron/') && !entry.endsWith('/'),
    )

    expect(electronFiles).toEqual([
      'dist-electron/main.js',
      'dist-electron/navigationPolicy.js',
      'dist-electron/preload.cjs',
      'dist-electron/runtime.js',
    ])
    expect(entries.some((entry) => entry.startsWith('node_modules/'))).toBe(false)
    expect(entries.some((entry) => entry.endsWith('.map'))).toBe(false)
    expect(
      entries.every(
        (entry) =>
          entry === 'package.json' ||
          entry === 'dist' ||
          entry.startsWith('dist/') ||
          entry === 'dist-electron' ||
          entry.startsWith('dist-electron/'),
      ),
    ).toBe(true)
  })

  it('removes custom-distribution metadata and leaves no temporary unpack directory', () => {
    expect(existsSync(join(appOutDir, 'version'))).toBe(false)
    expect(existsSync(join(appOutDir, 'resources', 'default_app.asar'))).toBe(false)
    expect(existsSync(`${appOutDir}.tmp`)).toBe(false)
  })
})
