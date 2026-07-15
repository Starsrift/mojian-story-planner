import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import {
  lstat,
  open,
  readdir,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'

const PRODUCT_NAME = 'mojian-story-planner'
const CHECKSUM_FILENAME = 'SHA256SUMS.txt'
const PLATFORM_CONFIG = new Map([
  [
    'mac',
    {
      architectures: new Set(['arm64', 'x64']),
      extensions: ['dmg', 'zip'],
      stagingDirectories: (arch) => [arch === 'x64' ? 'mac' : 'mac-arm64'],
    },
  ],
  [
    'web',
    {
      architectures: new Set(['any']),
      extensions: ['zip'],
      stagingDirectories: () => [],
    },
  ],
  [
    'win',
    {
      architectures: new Set(['arm64', 'x64']),
      extensions: ['exe', 'zip'],
      stagingDirectories: () => ['win-unpacked'],
    },
  ],
])
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0

function platformConfig(platform) {
  if (typeof platform !== 'string' || !PLATFORM_CONFIG.has(platform)) {
    throw new Error(
      `Unsupported platform ${JSON.stringify(platform)}; expected win, mac, or web`,
    )
  }
  return PLATFORM_CONFIG.get(platform)
}

function validateVersion(version) {
  if (typeof version !== 'string') {
    throw new Error(
      `Version must be a semver-compatible string; received ${JSON.stringify(version)}`,
    )
  }
  const match = SEMVER_PATTERN.exec(version)
  const hasInvalidNumericPrerelease = match?.[4]
    ?.split('.')
    .some((identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'))
  if (!match || hasInvalidNumericPrerelease) {
    throw new Error(
      `Version must be a semver-compatible string; received ${JSON.stringify(version)}`,
    )
  }
}

function releaseLayout({ arch, platform, version }) {
  const config = platformConfig(platform)
  validateVersion(version)
  if (typeof arch !== 'string' || !config.architectures.has(arch)) {
    throw new Error(
      `Unsupported architecture ${JSON.stringify(arch)} for ${platform}; expected ${[...config.architectures].join(' or ')}`,
    )
  }

  const artifactNames = config.extensions
    .map(
      (extension) =>
        `${PRODUCT_NAME}-${version}-${platform}-${arch}.${extension}`,
    )
    .sort()
  return {
    artifactNames,
    blockmapNames: artifactNames.map((name) => `${name}.blockmap`),
    stagingDirectoryNames: config.stagingDirectories(arch),
  }
}

export function expectedArtifactNames(options) {
  return releaseLayout(options).artifactNames
}

export function validateArtifactNames({ arch, entries, platform, version }) {
  if (!Array.isArray(entries) || entries.some((name) => typeof name !== 'string')) {
    throw new Error('Release entries must be an array of names')
  }
  const layout = releaseLayout({ arch, platform, version })
  const allowed = new Set([
    ...layout.artifactNames,
    ...layout.blockmapNames,
    ...layout.stagingDirectoryNames,
    CHECKSUM_FILENAME,
  ])

  for (const name of layout.artifactNames) {
    if (entries.filter((entry) => entry === name).length > 1) {
      throw new Error(`Duplicate required artifact: ${name}`)
    }
  }

  const unexpected = entries.filter((name) => !allowed.has(name)).sort()
  if (unexpected.length > 0) {
    throw new Error(`Unexpected release entry(s): ${unexpected.join(', ')}`)
  }

  const missing = layout.artifactNames.filter((name) => !entries.includes(name))
  if (missing.length > 0) {
    throw new Error(`Missing required artifact(s): ${missing.join(', ')}`)
  }

  return layout.artifactNames
}

function describeEntryProblem(entry, expectedKind) {
  if (entry.isSymbolicLink()) return 'is a symbolic link'
  return `must be ${expectedKind}`
}

function validateDirectoryEntries(directoryEntries, layout) {
  const byName = new Map(directoryEntries.map((entry) => [entry.name, entry]))
  const artifactNames = validateArtifactNames({
    arch: layout.arch,
    entries: directoryEntries.map((entry) => entry.name),
    platform: layout.platform,
    version: layout.version,
  })

  for (const name of artifactNames) {
    const entry = byName.get(name)
    if (!entry?.isFile()) {
      throw new Error(
        `Required artifact ${name} ${describeEntryProblem(entry, 'a regular single-link file')}`,
      )
    }
  }
  for (const name of layout.blockmapNames) {
    const entry = byName.get(name)
    if (entry && !entry.isFile()) {
      throw new Error(
        `Blockmap ${name} ${describeEntryProblem(entry, 'a regular file')}`,
      )
    }
  }
  for (const name of layout.stagingDirectoryNames) {
    const entry = byName.get(name)
    if (entry && !entry.isDirectory()) {
      throw new Error(
        `Staging entry ${name} ${describeEntryProblem(entry, 'a directory')}`,
      )
    }
  }
  const manifestEntry = byName.get(CHECKSUM_FILENAME)
  if (manifestEntry && !manifestEntry.isFile()) {
    throw new Error(
      `${CHECKSUM_FILENAME} ${describeEntryProblem(manifestEntry, 'a regular single-link file')}`,
    )
  }
  return artifactNames
}

function resolveChildPath(directory, filename) {
  const childPath = resolve(directory, filename)
  if (relative(directory, childPath) !== filename || basename(childPath) !== filename) {
    throw new Error(`Refusing to access a release entry outside ${directory}: ${filename}`)
  }
  return childPath
}

function assertRegularSingleLink(stats, label) {
  if (!stats.isFile()) {
    throw new Error(`${label} must be a regular single-link file`)
  }
  if (stats.nlink !== 1n) {
    throw new Error(`${label} must be a regular single-link file; hardlinks are not allowed`)
  }
}

function sameFileState(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}

async function safeLstat(filePath, label) {
  try {
    const stats = await lstat(filePath, { bigint: true })
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} is a symbolic link`)
    }
    assertRegularSingleLink(stats, label)
    return stats
  } catch (error) {
    if (error?.code === 'ENOENT') throw error
    if (error instanceof Error && error.message.startsWith(label)) throw error
    throw new Error(`Unable to inspect ${label}: ${error.message}`, { cause: error })
  }
}

async function revalidateArtifactSession(session, phase) {
  const currentHandleStats = await session.handle.stat({ bigint: true })
  let currentPathStats
  try {
    currentPathStats = await safeLstat(session.filePath, session.label)
  } catch (error) {
    throw new Error(
      `${session.label} was replaced or changed ${phase}: ${error.message}`,
      { cause: error },
    )
  }
  assertRegularSingleLink(currentHandleStats, session.label)
  if (
    !sameFileState(session.initialStats, currentHandleStats) ||
    !sameFileState(currentHandleStats, currentPathStats)
  ) {
    throw new Error(`${session.label} was replaced or changed ${phase}`)
  }
}

async function openArtifactSession(filePath, hooks = {}) {
  const label = `Artifact ${basename(filePath)}`
  const initialPathStats = await safeLstat(filePath, label)
  let handle
  try {
    try {
      handle = await open(filePath, constants.O_RDONLY | NO_FOLLOW)
    } catch (error) {
      throw new Error(
        `Unable to open ${label} without following links: ${error.message}`,
        { cause: error },
      )
    }
    const initialHandleStats = await handle.stat({ bigint: true })
    assertRegularSingleLink(initialHandleStats, label)
    if (!sameFileState(initialPathStats, initialHandleStats)) {
      throw new Error(`${label} was replaced or changed before hashing`)
    }

    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (bytesRead === 0) break
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }

    await hooks.afterRead?.()
    const session = {
      digest: hash.digest('hex'),
      filePath,
      handle,
      initialStats: initialHandleStats,
      label,
    }
    await revalidateArtifactSession(session, 'during hashing')
    return session
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {})
    }
    throw error
  }
}

export async function hashVerifiedArtifact(filePath, hooks = {}) {
  const session = await openArtifactSession(filePath, hooks)
  try {
    return session.digest
  } finally {
    await session.handle.close()
  }
}

export async function hashFile(filePath) {
  return hashVerifiedArtifact(filePath)
}

async function validateSingleLinkFile(filePath, label) {
  const pathStats = await safeLstat(filePath, label)
  let handle
  try {
    try {
      handle = await open(filePath, constants.O_RDONLY | NO_FOLLOW)
    } catch (error) {
      throw new Error(
        `Unable to open ${label} without following links: ${error.message}`,
        { cause: error },
      )
    }
    const handleStats = await handle.stat({ bigint: true })
    const finalPathStats = await safeLstat(filePath, label)
    assertRegularSingleLink(handleStats, label)
    if (
      !sameFileState(pathStats, handleStats) ||
      !sameFileState(handleStats, finalPathStats)
    ) {
      throw new Error(`${label} was replaced or changed during validation`)
    }
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function validateExistingManifest(manifestPath) {
  try {
    await safeLstat(manifestPath, CHECKSUM_FILENAME)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
}

function comparablePath(filePath, platform = process.platform) {
  const normalized = resolve(filePath)
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

async function validateReleaseDirectory(directory, initialState) {
  let directoryStats
  let canonicalPath
  try {
    directoryStats = await lstat(directory, { bigint: true })
    if (directoryStats.isSymbolicLink()) {
      throw new Error(`Release directory is a symbolic link or junction: ${directory}`)
    }
    if (!directoryStats.isDirectory()) {
      throw new Error(`Release path is not a directory: ${directory}`)
    }
    canonicalPath = await realpath(directory)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Release ')) throw error
    throw new Error(`Unable to validate release directory ${directory}: ${error.message}`, {
      cause: error,
    })
  }
  if (comparablePath(canonicalPath) !== comparablePath(directory)) {
    throw new Error(
      `Release directory resolves through a symbolic link, junction, or redirect: ${directory} -> ${canonicalPath}`,
    )
  }
  if (
    initialState &&
    (initialState.dev !== directoryStats.dev || initialState.ino !== directoryStats.ino)
  ) {
    throw new Error(`Release directory was replaced during validation: ${directory}`)
  }
  return { dev: directoryStats.dev, ino: directoryStats.ino }
}

export async function syncContainingDirectory(
  directory,
  { openDirectory, platform = process.platform } = {},
) {
  if (platform === 'win32') return

  const directoryHandle = await (openDirectory
    ? openDirectory(directory)
    : open(directory, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0)))
  try {
    await directoryHandle.sync()
  } finally {
    await directoryHandle.close()
  }
}

async function writeChecksumManifest(
  directory,
  contents,
  { afterRename, beforeRename } = {},
) {
  const manifestPath = resolveChildPath(directory, CHECKSUM_FILENAME)
  await validateExistingManifest(manifestPath)

  const tempName = `.${CHECKSUM_FILENAME}.${randomBytes(16).toString('hex')}.tmp`
  const tempPath = resolveChildPath(directory, tempName)
  let tempHandle
  let renamed = false
  let completed = false
  try {
    tempHandle = await open(
      tempPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW,
      0o600,
    )
    await tempHandle.writeFile(contents, 'utf8')
    await tempHandle.sync()
    await tempHandle.close()
    tempHandle = undefined
    await beforeRename?.()
    await rename(tempPath, manifestPath)
    renamed = true
    await afterRename?.()
    await syncContainingDirectory(directory)
    completed = true
  } finally {
    await tempHandle?.close().catch(() => {})
    if (!renamed) {
      await unlink(tempPath).catch((error) => {
        if (error?.code !== 'ENOENT') throw error
      })
    } else if (!completed) {
      await unlink(manifestPath).catch((error) => {
        if (error?.code !== 'ENOENT') throw error
      })
      await syncContainingDirectory(directory)
    }
  }
  return manifestPath
}

async function revalidateAllArtifacts(sessions, phase) {
  for (const session of sessions) {
    await revalidateArtifactSession(session, phase)
  }
}

export async function verifyReleaseArtifacts({
  arch,
  dir,
  hooks = {},
  platform,
  version,
}) {
  const layout = { ...releaseLayout({ arch, platform, version }), arch, platform, version }
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new Error(`Release directory must be a non-empty string; received ${JSON.stringify(dir)}`)
  }
  const directory = resolve(dir)
  const directoryState = await validateReleaseDirectory(directory)

  const directoryEntries = await readdir(directory, { withFileTypes: true })
  const artifactNames = validateDirectoryEntries(directoryEntries, layout)
  const entryNames = new Set(directoryEntries.map((entry) => entry.name))
  for (const blockmapName of layout.blockmapNames) {
    if (entryNames.has(blockmapName)) {
      await validateSingleLinkFile(
        resolveChildPath(directory, blockmapName),
        `Blockmap ${blockmapName}`,
      )
    }
  }

  const sessions = []
  const lines = []
  let failed = false
  try {
    for (const artifactName of artifactNames) {
      const session = await openArtifactSession(
        resolveChildPath(directory, artifactName),
        hooks.afterArtifactRead
          ? { afterRead: () => hooks.afterArtifactRead(artifactName) }
          : undefined,
      )
      sessions.push(session)
      lines.push(`${session.digest}  ${artifactName}`)
    }

    await validateReleaseDirectory(directory, directoryState)
    const checksumFile = await writeChecksumManifest(
      directory,
      `${lines.join('\n')}\n`,
      {
        afterRename: hooks.afterManifestRename,
        beforeRename: async () => {
          await hooks.beforeManifestRename?.()
          await validateReleaseDirectory(directory, directoryState)
          await revalidateAllArtifacts(sessions, 'before manifest publication')
        },
      },
    )

    try {
      await validateReleaseDirectory(directory, directoryState)
      await revalidateAllArtifacts(sessions, 'after manifest publication')
    } catch (error) {
      await unlink(checksumFile).catch((unlinkError) => {
        if (unlinkError?.code !== 'ENOENT') throw unlinkError
      })
      await syncContainingDirectory(directory)
      throw error
    }
    return { checksumFile, lines }
  } catch (error) {
    failed = true
    throw error
  } finally {
    const closeResults = await Promise.allSettled(
      sessions.map((session) => session.handle.close()),
    )
    const closeErrors = closeResults
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason)
    if (!failed && closeErrors.length > 0) {
      throw new AggregateError(closeErrors, 'Failed to close verified artifact handles')
    }
  }
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
