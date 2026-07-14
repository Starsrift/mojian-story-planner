import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function parseLipoArchitecture(output) {
  const architectures = output.trim().split(/\s+/).filter(Boolean)
  if (
    architectures.length !== 1 ||
    !['x86_64', 'arm64'].includes(architectures[0])
  ) {
    throw new Error(
      `lipo -archs must report exactly one supported architecture (x86_64 or arm64); received: ${JSON.stringify(output.trim())}`,
    )
  }

  return architectures[0] === 'x86_64' ? 'x64' : 'arm64'
}

export function createLipoCommand(root) {
  return {
    command: 'lipo',
    args: [
      '-archs',
      resolve(
        root,
        'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
      ),
    ],
  }
}

export function createBuilderCommand(root, lipoOutput) {
  const architecture = parseLipoArchitecture(lipoOutput)
  return {
    command: process.execPath,
    args: [
      resolve(root, 'node_modules/electron-builder/cli.js'),
      '--mac',
      'dmg',
      'zip',
      architecture === 'x64' ? '--x64' : '--arm64',
    ],
  }
}

function run() {
  if (process.platform !== 'darwin') {
    throw new Error('macOS packaging must run on a native macOS runner')
  }

  const lipoCommand = createLipoCommand(projectRoot)
  const lipoOutput = execFileSync(lipoCommand.command, lipoCommand.args, {
    encoding: 'utf8',
  })
  const builderCommand = createBuilderCommand(projectRoot, lipoOutput)
  const result = spawnSync(builderCommand.command, builderCommand.args, {
    cwd: projectRoot,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.signal) {
    throw new Error(`electron-builder terminated by ${result.signal}`)
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
}
