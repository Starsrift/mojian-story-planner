import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function parseWindowsElectronArchitecture(binary) {
  try {
    if (binary.length < 70 || binary.toString('ascii', 0, 2) !== 'MZ') {
      throw new Error('invalid DOS header')
    }

    const peOffset = binary.readUInt32LE(0x3c)
    if (
      peOffset + 6 > binary.length ||
      binary.toString('binary', peOffset, peOffset + 4) !== 'PE\0\0'
    ) {
      throw new Error('invalid PE header')
    }

    const machine = binary.readUInt16LE(peOffset + 4)
    if (machine === 0x8664) return 'x64'
    if (machine === 0xaa64) return 'arm64'
  } catch {
    // All malformed and unsupported binaries share one actionable error below.
  }

  throw new Error(
    'Installed electron.exe must have one supported Windows Electron architecture (x64 or arm64)',
  )
}

export function createDesktopPackageCommand(options) {
  const { nativeArchitecture, platform, projectRoot: root, runtimeArchitecture } =
    options

  if (platform === 'darwin') {
    return {
      command: process.execPath,
      args: [resolve(root, 'scripts/package-mac.mjs')],
    }
  }

  if (platform === 'win32') {
    if (!['x64', 'arm64'].includes(runtimeArchitecture)) {
      throw new Error('Windows Electron runtime architecture is missing or unsupported')
    }
    if (runtimeArchitecture !== nativeArchitecture) {
      throw new Error(
        `Windows Electron runtime ${runtimeArchitecture} does not match native Node architecture ${nativeArchitecture}`,
      )
    }

    return {
      command: process.execPath,
      args: [
        resolve(root, 'node_modules/electron-builder/cli.js'),
        '--win',
        'nsis',
        'zip',
        runtimeArchitecture === 'x64' ? '--x64' : '--arm64',
      ],
    }
  }

  throw new Error(`Unsupported desktop packaging platform: ${platform}`)
}

function run() {
  const runtimeArchitecture =
    process.platform === 'win32'
      ? parseWindowsElectronArchitecture(
          readFileSync(resolve(projectRoot, 'node_modules/electron/dist/electron.exe')),
        )
      : undefined
  const packageCommand = createDesktopPackageCommand({
    nativeArchitecture: process.arch,
    platform: process.platform,
    projectRoot,
    runtimeArchitecture,
  })
  const result = spawnSync(packageCommand.command, packageCommand.args, {
    cwd: projectRoot,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.signal) {
    throw new Error(`Desktop packager terminated by ${result.signal}`)
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
}
