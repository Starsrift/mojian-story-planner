import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = resolve(projectRoot, 'dist-electron')

function compileMainProcess() {
  const compilerPath = resolve(projectRoot, 'node_modules/typescript/bin/tsc')
  const configPath = resolve(projectRoot, 'electron/tsconfig.json')

  return new Promise((resolvePromise, reject) => {
    const compiler = spawn(process.execPath, [compilerPath, '-p', configPath], {
      cwd: projectRoot,
      stdio: 'inherit',
    })
    compiler.once('error', reject)
    compiler.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Electron TypeScript build exited after ${signal}`))
      else if (code !== 0) reject(new Error(`Electron TypeScript build exited with code ${code}`))
      else resolvePromise()
    })
  })
}

await compileMainProcess()
await Promise.all([
  rm(resolve(outputDirectory, 'preload.js'), { force: true }),
  rm(resolve(outputDirectory, 'preload.js.map'), { force: true }),
])
await build({
  entryPoints: [resolve(projectRoot, 'electron/preload.ts')],
  outfile: resolve(outputDirectory, 'preload.cjs'),
  bundle: true,
  external: ['electron'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  target: 'node22',
})
