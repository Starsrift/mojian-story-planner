import { rm } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDirectory = resolve(projectRoot, 'release')

if (relative(projectRoot, releaseDirectory) !== 'release') {
  throw new Error('Refusing to clean outside the project release directory')
}

await rm(releaseDirectory, { force: true, recursive: true })
