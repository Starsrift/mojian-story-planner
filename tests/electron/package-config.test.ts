import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type BuilderConfig = {
  appId?: string
  artifactName?: string
  directories?: { output?: string }
  files?: string[]
  win?: { target?: string[] }
  mac?: { category?: string; target?: string[] }
  nsis?: { oneClick?: boolean; perMachine?: boolean }
}

type PackageConfig = {
  productName?: string
  main?: string
  scripts?: Record<string, string>
  build?: BuilderConfig
}

const packageConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as PackageConfig

describe('Electron packaging metadata', () => {
  it('defines stable application identity and artifact naming', () => {
    expect(packageConfig.productName).toBe('Mojian Story Planner')
    expect(packageConfig.build?.appId).toBe('com.starsrift.mojian')
    expect(packageConfig.build?.artifactName).toBe(
      'mojian-story-planner-${version}-${os}-${arch}.${ext}',
    )
  })

  it('packages the web application and all Electron runtime artifacts', () => {
    expect(packageConfig.main).toBe('dist-electron/main.js')
    expect(packageConfig.build?.files).toEqual(
      expect.arrayContaining(['dist/**', 'dist-electron/**']),
    )
    expect(packageConfig.build?.directories?.output).toBe('release')
  })

  it('configures Windows NSIS and ZIP distributions', () => {
    expect(packageConfig.build?.win?.target).toEqual(['nsis', 'zip'])
    expect(packageConfig.build?.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
    })
  })

  it('configures macOS DMG and ZIP productivity distributions', () => {
    expect(packageConfig.build?.mac).toMatchObject({
      category: 'public.app-category.productivity',
      target: ['dmg', 'zip'],
    })
  })
})

describe('Electron packaging scripts', () => {
  it.each(['electron:build', 'dist:win', 'dist:mac'])(
    '%s builds both application layers before packaging',
    (scriptName) => {
      const script = packageConfig.scripts?.[scriptName]

      expect(script).toContain('npm run build && npm run build:electron && electron-builder')
    },
  )

  it('builds NSIS and ZIP x64 Windows artifacts', () => {
    expect(packageConfig.scripts?.['dist:win']).toContain('--win nsis zip --x64')
  })

  it('builds DMG and ZIP macOS artifacts for x64 and arm64', () => {
    expect(packageConfig.scripts?.['dist:mac']).toContain(
      '--mac dmg zip --x64 --arm64',
    )
  })
})
