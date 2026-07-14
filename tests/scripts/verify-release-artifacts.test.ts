import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

type Platform = 'win' | 'mac' | 'web'

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

async function runCli(args: string[]): Promise<{
  code: number | null
  stderr: string
  stdout: string
}> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [validatorPath, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolvePromise({ code, stderr, stdout }))
  })
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

  it('ignores unpacked macOS output directories by entry type', async () => {
    const validator = await loadValidator()
    const directory = await createReleaseDirectory()
    await mkdir(join(directory, 'mac-arm64'))
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-mac-arm64.dmg'),
      'disk image',
    )
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-mac-arm64.zip'),
      'archive',
    )

    await expect(
      validator.verifyReleaseArtifacts({
        arch: 'arm64',
        dir: directory,
        platform: 'mac',
        version: '1.2.3',
      }),
    ).resolves.toMatchObject({ lines: expect.any(Array) })
  })

  it('accepts the complete web set with the architecture fixed to any', async () => {
    const validator = await loadValidator()

    expect(
      validator.validateArtifactNames({
        arch: 'any',
        entries: ['mojian-story-planner-1.2.3-web-any.zip'],
        platform: 'web',
        version: '1.2.3',
      }),
    ).toEqual(['mojian-story-planner-1.2.3-web-any.zip'])
  })

  it('rejects a missing web zip', async () => {
    const validator = await loadValidator()

    expect(() =>
      validator.validateArtifactNames({
        arch: 'any',
        entries: [],
        platform: 'web',
        version: '1.2.3',
      }),
    ).toThrow(/Missing required artifact.*web-any\.zip/)
  })

  it('rejects a misnamed web artifact in its isolated validation directory', async () => {
    const validator = await loadValidator()
    const directory = await createReleaseDirectory()
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-web-any.zip'),
      'web bundle',
    )
    await writeFile(
      join(directory, 'website.zip'),
      'misnamed bundle',
    )

    await expect(
      validator.verifyReleaseArtifacts({
        arch: 'any',
        dir: directory,
        platform: 'web',
        version: '1.2.3',
      }),
    ).rejects.toThrow(/Unexpected release artifact.*website\.zip/)
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

describe('release artifact validator CLI', () => {
  const requiredArguments = (directory: string) => [
    '--platform',
    'web',
    '--version',
    '1.2.3',
    '--arch',
    'any',
    '--dir',
    directory,
  ]

  it('succeeds with all four options and reports the checksum output', async () => {
    const directory = await createReleaseDirectory()
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-web-any.zip'),
      'web bundle',
    )

    const result = await runCli(requiredArguments(directory))

    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toMatch(/Verified 1 release artifacts/)
    expect(result.stdout).toContain(join(directory, 'SHA256SUMS.txt'))
    await expect(readFile(join(directory, 'SHA256SUMS.txt'), 'utf8')).resolves.toMatch(
      /^[0-9a-f]{64}  mojian-story-planner-1\.2\.3-web-any\.zip\n$/,
    )
  })

  it.each(['platform', 'version', 'arch', 'dir'])(
    'exits nonzero with actionable stderr when --%s is missing',
    async (missingOption) => {
      const directory = await createReleaseDirectory()
      const args = requiredArguments(directory)
      const optionIndex = args.indexOf(`--${missingOption}`)
      args.splice(optionIndex, 2)

      const result = await runCli(args)

      expect(result.code).not.toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr).toMatch(
        new RegExp(`Release artifact validation failed: Missing required option: --${missingOption}`),
      )
    },
  )

  it('exits nonzero with actionable stderr for a duplicate option', async () => {
    const directory = await createReleaseDirectory()
    const result = await runCli([
      ...requiredArguments(directory),
      '--arch',
      'any',
    ])

    expect(result.code).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(
      /Release artifact validation failed: Duplicate option: --arch/,
    )
  })

  it('exits nonzero with actionable stderr for an unsupported platform', async () => {
    const directory = await createReleaseDirectory()
    const args = requiredArguments(directory)
    args[args.indexOf('web')] = 'linux'

    const result = await runCli(args)

    expect(result.code).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(
      /Release artifact validation failed: Unsupported platform.*expected win, mac, or web/,
    )
  })

  it('has no CLI side effects when dynamically imported', async () => {
    const directory = await createReleaseDirectory()
    await writeFile(
      join(directory, 'mojian-story-planner-1.2.3-web-any.zip'),
      'web bundle',
    )
    const originalArgv = process.argv
    const originalExitCode = process.exitCode
    process.argv = [process.execPath, validatorPath, ...requiredArguments(directory)]
    process.exitCode = 73

    try {
      await import(`${pathToFileURL(validatorPath).href}?side-effect=${Date.now()}`)
      await expect(
        readFile(join(directory, 'SHA256SUMS.txt'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      expect(process.exitCode).toBe(73)

      process.argv = [process.execPath, validatorPath, '--platform']
      await import(`${pathToFileURL(validatorPath).href}?no-exit=${Date.now()}`)
      expect(process.exitCode).toBe(73)
    } finally {
      process.argv = originalArgv
      process.exitCode = originalExitCode
    }
  })
})
