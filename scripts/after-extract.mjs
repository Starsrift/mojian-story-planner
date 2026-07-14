import { rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

function assertContained(root, target) {
  const relativePath = relative(resolve(root), resolve(target))
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Refusing to remove path outside appOutDir: ${target}`)
  }
}

export default async function afterExtract(context) {
  const appOutDir = resolve(context.appOutDir)
  const resourcesDirectory = context.packager?.getResourcesDir
    ? context.packager.getResourcesDir(appOutDir)
    : join(appOutDir, 'resources')
  const removablePaths = [
    join(appOutDir, 'version'),
    join(resourcesDirectory, 'default_app.asar'),
  ]

  for (const removablePath of removablePaths) {
    assertContained(appOutDir, removablePath)
  }

  await Promise.all(
    removablePaths.map((removablePath) =>
      rm(removablePath, { force: true, recursive: true }),
    ),
  )
}
