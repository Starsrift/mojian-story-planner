import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'

const PRODUCT_NAME = 'mojian-story-planner'
const CHECKSUM_FILENAME = 'SHA256SUMS.txt'
const PLATFORM_EXTENSIONS = {
  mac: ['dmg', 'zip'],
  web: ['zip'],
  win: ['exe', 'zip'],
}
const SUPPORTED_ARCHITECTURES = new Set(['arm64', 'x64'])

function assertSafeSegment(label, value) {
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(value)) {
    throw new Error(`Invalid ${label} ${JSON.stringify(value)}`)
  }
}

export function expectedArtifactNames({ arch, platform, version }) {
  if (!(platform in PLATFORM_EXTENSIONS)) {
    throw new Error(
      `Unsupported platform ${JSON.stringify(platform)}; expected win, mac, or web`,
    )
  }
  if (platform === 'web' && arch !== 'any') {
    throw new Error(
      `Unsupported architecture ${JSON.stringify(arch)} for web; expected any`,
    )
  }
  if (platform !== 'web' && !SUPPORTED_ARCHITECTURES.has(arch)) {
    throw new Error(
      `Unsupported architecture ${JSON.stringify(arch)}; expected x64 or arm64`,
    )
  }
  assertSafeSegment('version', version)

  return PLATFORM_EXTENSIONS[platform]
    .map(
      (extension) =>
        `${PRODUCT_NAME}-${version}-${platform}-${arch}.${extension}`,
    )
    .sort()
}

function isKnownAuxiliaryEntry(name) {
  return (
    name === CHECKSUM_FILENAME ||
    name === 'builder-debug.yml' ||
    name === 'builder-effective-config.yaml' ||
    name.endsWith('.blockmap') ||
    name.endsWith('-unpacked')
  )
}

export function validateArtifactNames({ arch, entries, platform, version }) {
  const expected = expectedArtifactNames({ arch, platform, version })

  for (const name of expected) {
    const count = entries.filter((entry) => entry === name).length
    if (count > 1) {
      throw new Error(`Duplicate required artifact: ${name}`)
    }
  }

  const unexpected = entries
    .filter((name) => !expected.includes(name) && !isKnownAuxiliaryEntry(name))
    .sort()
  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected release artifact(s) for version ${version}, platform ${platform}, architecture ${arch}: ${unexpected.join(', ')}`,
    )
  }

  const missing = expected.filter((name) => !entries.includes(name))
  if (missing.length > 0) {
    throw new Error(`Missing required artifact(s): ${missing.join(', ')}`)
  }

  return expected
}

export async function hashFile(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

function resolveArtifactPath(directory, filename) {
  const artifactPath = resolve(directory, filename)
  if (relative(directory, artifactPath) !== filename || basename(artifactPath) !== filename) {
    throw new Error(`Refusing to access artifact outside release directory: ${filename}`)
  }
  return artifactPath
}

export async function verifyReleaseArtifacts({ arch, dir, platform, version }) {
  const directory = resolve(dir)
  let directoryStats
  try {
    directoryStats = await stat(directory)
  } catch (error) {
    throw new Error(`Release directory does not exist: ${directory}`, { cause: error })
  }
  if (!directoryStats.isDirectory()) {
    throw new Error(`Release path is not a directory: ${directory}`)
  }

  const directoryEntries = await readdir(directory, { withFileTypes: true })
  const artifactNames = validateArtifactNames({
    arch,
    entries: directoryEntries
      .filter((entry) => !entry.isDirectory())
      .map((entry) => entry.name),
    platform,
    version,
  })

  for (const artifactName of artifactNames) {
    const entry = directoryEntries.find(({ name }) => name === artifactName)
    if (!entry?.isFile()) {
      throw new Error(`Required artifact is not a regular file: ${artifactName}`)
    }
  }

  const lines = []
  for (const artifactName of artifactNames) {
    const digest = await hashFile(resolveArtifactPath(directory, artifactName))
    lines.push(`${digest}  ${artifactName}`)
  }

  const checksumFile = resolve(directory, CHECKSUM_FILENAME)
  await writeFile(checksumFile, `${lines.join('\n')}\n`, 'utf8')
  return { checksumFile, lines }
}

export function parseArguments(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!['--arch', '--dir', '--platform', '--version'].includes(flag) || !value) {
      throw new Error(
        'Usage: node scripts/verify-release-artifacts.mjs --platform <win|mac|web> --version <version> --arch <x64|arm64|any> --dir <directory>',
      )
    }
    const key = flag.slice(2)
    if (key in values) {
      throw new Error(`Duplicate option: ${flag}`)
    }
    values[key] = value
  }

  for (const key of ['platform', 'version', 'arch', 'dir']) {
    if (!(key in values)) {
      throw new Error(`Missing required option: --${key}`)
    }
  }
  return values
}

export async function main(argv = process.argv.slice(2)) {
  const result = await verifyReleaseArtifacts(parseArguments(argv))
  console.log(
    `Verified ${result.lines.length} release artifacts; wrote ${result.checksumFile}`,
  )
  return result
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`Release artifact validation failed: ${error.message}`)
    process.exitCode = 1
  })
}
