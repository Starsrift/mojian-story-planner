import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type BuilderConfig = {
  afterExtract?: string
  appId?: string
  artifactName?: string
  electronDist?: string
  directories?: { output?: string }
  files?: string[]
  win?: { target?: string[] }
  mac?: { category?: string; target?: string[] }
  nsis?: { oneClick?: boolean; perMachine?: boolean }
}

type PackageConfig = {
  author?: { name?: string; email?: string }
  description?: string
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
    expect(packageConfig.build?.files).toEqual([
      'dist/**',
      'dist-electron/main.js',
      'dist-electron/navigationPolicy.js',
      'dist-electron/runtime.js',
      'dist-electron/preload.cjs',
      '!dist-electron/**/*.map',
      '!node_modules/**',
    ])
    expect(packageConfig.build?.directories?.output).toBe('release')
    expect(packageConfig.build?.afterExtract).toBe('scripts/after-extract.mjs')
  })

  it('packages the installed Electron runtime without downloading another archive', () => {
    expect(packageConfig.build?.electronDist).toBe('node_modules/electron/dist')
  })

  it('provides complete package identity metadata', () => {
    expect(packageConfig.description).toBe(
      'A desktop workspace for planning stories and organizing narrative structure.',
    )
    expect(packageConfig.author).toEqual({
      name: 'edward-win',
      email: 'aetherwyrm@vip.163.com',
    })
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

      expect(script).toContain(
        'npm run build && npm run build:electron && npm run clean:release && electron-builder',
      )
    },
  )

  it('builds NSIS and ZIP x64 Windows artifacts', () => {
    expect(packageConfig.scripts?.['dist:win']).toContain('--win nsis zip --x64')
  })

  it('builds host-native macOS artifacts without cross-labeling architectures', () => {
    const script = packageConfig.scripts?.['dist:mac']

    expect(script).toContain('--mac dmg zip')
    expect(script).not.toMatch(/--(?:x64|arm64|universal)/)
  })

  it('cleans only the configured release directory before packaging', () => {
    expect(packageConfig.scripts?.['clean:release']).toBe(
      'node scripts/clean-release.mjs',
    )
  })
})
