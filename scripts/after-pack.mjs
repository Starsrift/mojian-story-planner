import { rm, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

function assertContained(root, target) {
  const relativePath = relative(resolve(root), resolve(target))
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Refusing to remove path outside appOutDir: ${target}`)
  }
}

async function requireDirectory(directory) {
  const directoryStat = await stat(directory).catch(() => undefined)
  if (!directoryStat?.isDirectory()) {
    throw new Error(`Expected packaged resources directory does not exist: ${directory}`)
  }
}

export default async function afterPack(context) {
  const appOutDir = resolve(context.appOutDir)
  const productFilename = context.packager?.appInfo?.productFilename
  const resourcesDirectory =
    context.electronPlatformName === 'darwin'
      ? join(appOutDir, `${productFilename}.app`, 'Contents', 'Resources')
      : join(appOutDir, 'resources')
  const removablePaths = [
    join(appOutDir, 'version'),
    join(resourcesDirectory, 'default_app.asar'),
  ]

  assertContained(appOutDir, resourcesDirectory)
  for (const removablePath of removablePaths) {
    assertContained(appOutDir, removablePath)
  }
  await requireDirectory(resourcesDirectory)

  await Promise.all(
    removablePaths.map((removablePath) =>
      rm(removablePath, { force: true, recursive: true }),
    ),
  )
}
