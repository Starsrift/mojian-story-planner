import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

type Platform = 'win' | 'mac'

type ValidatorModule = {
  validateArtifactNames: (options: {
    arch: string
    entries: string[]
    platform: Platform
    version: string
  }) => string[]
  verifyReleaseArtifacts: (options: {
    arch: string
    dir: string
    platform: Platform
    version: string
  }) => Promise<{ checksumFile: string; lines: string[] }>
}

const validatorPath = resolve(process.cwd(), 'scripts/verify-release-artifacts.mjs')
const temporaryDirectories: string[] = []

async function loadValidator(): Promise<ValidatorModule> {
  return (await import(pathToFileURL(validatorPath).href)) as ValidatorModule
}

async function createReleaseDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mojian-release-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('release artifact validation', () => {
  it('rejects a missing required artifact without changing an existing checksum file', async () => {
    const validator = await loadValidator()
    const directory = await createReleaseDirectory()
    const checksumFile = join(directory, 'SHA256SUMS.txt')
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-win-x64.exe'),
      'installer',
    )
    await writeFile(checksumFile, 'previous checksums\n')

    await expect(
      validator.verifyReleaseArtifacts({
        arch: 'x64',
        dir: directory,
        platform: 'win',
        version: '1.2.3',
      }),
    ).rejects.toThrow(/Missing required artifact.*\.zip/)
    await expect(readFile(checksumFile, 'utf8')).resolves.toBe(
      'previous checksums\n',
    )
  })

  it('rejects duplicate required artifacts instead of selecting one', async () => {
    const validator = await loadValidator()
    const installer = 'mojian-story-planner-1.2.3-win-x64.exe'

    expect(() =>
      validator.validateArtifactNames({
        arch: 'x64',
        entries: [
          installer,
          installer,
          'mojian-story-planner-1.2.3-win-x64.zip',
        ],
        platform: 'win',
        version: '1.2.3',
      }),
    ).toThrow(/Duplicate required artifact.*\.exe/)
  })

  it.each([
    ['mojian-story-planner-1.2.4-win-x64.exe', 'version'],
    ['mojian-story-planner-1.2.3-win-arm64.exe', 'architecture'],
  ])('rejects an unexpected %s mismatch (%s)', async (artifact) => {
    const validator = await loadValidator()

    expect(() =>
      validator.validateArtifactNames({
        arch: 'x64',
        entries: [
          artifact,
          'mojian-story-planner-1.2.3-win-x64.exe',
          'mojian-story-planner-1.2.3-win-x64.zip',
        ],
        platform: 'win',
        version: '1.2.3',
      }),
    ).toThrow(/Unexpected release artifact/)
  })

  it('accepts the complete Windows set and ignores known auxiliary output', async () => {
    const validator = await loadValidator()

    expect(
      validator.validateArtifactNames({
        arch: 'x64',
        entries: [
          'win-unpacked',
          'builder-debug.yml',
          'mojian-story-planner-1.2.3-win-x64.exe.blockmap',
          'mojian-story-planner-1.2.3-win-x64.zip',
          'mojian-story-planner-1.2.3-win-x64.exe',
        ],
        platform: 'win',
        version: '1.2.3',
      }),
    ).toEqual([
      'mojian-story-planner-1.2.3-win-x64.exe',
      'mojian-story-planner-1.2.3-win-x64.zip',
    ])
  })

  it('accepts the complete macOS set', async () => {
    const validator = await loadValidator()

    expect(
      validator.validateArtifactNames({
        arch: 'arm64',
        entries: [
          'mojian-story-planner-1.2.3-mac-arm64.zip',
          'mojian-story-planner-1.2.3-mac-arm64.dmg',
        ],
        platform: 'mac',
        version: '1.2.3',
      }),
    ).toEqual([
      'mojian-story-planner-1.2.3-mac-arm64.dmg',
      'mojian-story-planner-1.2.3-mac-arm64.zip',
    ])
  })

  it('writes deterministic sorted checksum lines with LF endings', async () => {
    const validator = await loadValidator()
    const directory = await createReleaseDirectory()
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-win-x64.zip'),
      'zip bytes',
    )
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-win-x64.exe'),
      'exe bytes',
    )

    const result = await validator.verifyReleaseArtifacts({
      arch: 'x64',
      dir: directory,
      platform: 'win',
      version: '1.2.3',
    })
    const contents = await readFile(result.checksumFile, 'utf8')

    expect(result.lines.map((line) => line.split('  ')[1])).toEqual([
      'mojian-story-planner-1.2.3-win-x64.exe',
      'mojian-story-planner-1.2.3-win-x64.zip',
    ])
    expect(contents).toBe(`${result.lines.join('\n')}\n`)
    expect(contents).not.toContain('\r')
    expect(contents).not.toContain('SHA256SUMS.txt')
  })

  it('writes SHA-256 values matching the actual artifact bytes', async () => {
    const validator = await loadValidator()
    const directory = await createReleaseDirectory()
    await mkdir(join(directory, 'win-unpacked'))
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-win-x64.exe'),
      Buffer.from('abc'),
    )
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-win-x64.zip'),
      Buffer.alloc(0),
    )

    const { checksumFile } = await validator.verifyReleaseArtifacts({
      arch: 'x64',
      dir: directory,
      platform: 'win',
      version: '1.2.3',
    })

    await expect(readFile(checksumFile, 'utf8')).resolves.toBe(
      [
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  mojian-story-planner-1.2.3-win-x64.exe',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  mojian-story-planner-1.2.3-win-x64.zip',
        '',
      ].join('\n'),
    )
  })
})
