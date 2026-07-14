import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = resolve(projectRoot, 'dist-electron')

function runTypeScript(configRelativePath, label) {
  const compilerPath = resolve(projectRoot, 'node_modules/typescript/bin/tsc')
  const configPath = resolve(projectRoot, configRelativePath)

  return new Promise((resolvePromise, reject) => {
    const compiler = spawn(process.execPath, [compilerPath, '-p', configPath], {
      cwd: projectRoot,
      stdio: 'inherit',
    })
    compiler.once('error', reject)
    compiler.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${label} exited after ${signal}`))
      else if (code !== 0) reject(new Error(`${label} exited with code ${code}`))
      else resolvePromise()
    })
  })
}

await rm(outputDirectory, { force: true, recursive: true })
await Promise.all([
  runTypeScript('electron/tsconfig.json', 'Electron main-process build'),
  runTypeScript('electron/tsconfig.preload.json', 'Electron preload type check'),
])
await build({
  entryPoints: [resolve(projectRoot, 'electron/preload.ts')],
  outfile: resolve(outputDirectory, 'preload.cjs'),
  bundle: true,
  external: ['electron'],
  format: 'cjs',
  platform: 'node',
  sourcemap: false,
  target: 'node22',
})
