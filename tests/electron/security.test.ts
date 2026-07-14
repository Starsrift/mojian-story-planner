import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const mainProcessPath = resolve(process.cwd(), 'electron/main.ts')
const mainProcessSource = existsSync(mainProcessPath)
  ? readFileSync(mainProcessPath, 'utf8')
  : ''
const developmentLauncherPath = resolve(process.cwd(), 'scripts/electron-dev.mjs')
const developmentLauncherSource = existsSync(developmentLauncherPath)
  ? readFileSync(developmentLauncherPath, 'utf8')
  : ''
const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> }
const applicationHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

describe('Electron security policy', () => {
  it('enables renderer process isolation', () => {
    expect(mainProcessSource).toMatch(/contextIsolation:\s*true/)
    expect(mainProcessSource).toMatch(/nodeIntegration:\s*false/)
    expect(mainProcessSource).toMatch(/sandbox:\s*true/)
  })

  it('blocks navigation away from the application', () => {
    expect(mainProcessSource).toContain("will-navigate")
    expect(mainProcessSource).toMatch(/event\.preventDefault\(\)/)
  })

  it('denies new windows and delegates only HTTPS URLs externally', () => {
    expect(mainProcessSource).toContain('setWindowOpenHandler')
    expect(mainProcessSource).toMatch(/protocol\s*===\s*['"]https:['"]/)
    expect(mainProcessSource).toContain('shell.openExternal')
    expect(mainProcessSource).toMatch(/action:\s*['"]deny['"]/)
  })
})

describe('Electron development server ownership', () => {
  it('passes the URL resolved by its own dynamic Vite server to Electron', () => {
    expect(packageJson.scripts?.['electron:dev']).toBe('node scripts/electron-dev.mjs')
    expect(developmentLauncherSource).toContain(
      "import { createServer as createHttpServer } from 'node:http'",
    )
    expect(developmentLauncherSource).toContain(
      "import { createServer as createViteServer } from 'vite'",
    )
    expect(developmentLauncherSource).toMatch(/httpServer\.listen\(0,\s*HOST/)
    expect(developmentLauncherSource).toMatch(/address\.port/)
    expect(developmentLauncherSource).toMatch(/VITE_DEV_SERVER_URL:\s*developmentUrl/)
    expect(developmentLauncherSource).not.toContain('5173')
  })

  it('allows Vite HMR on the owned dynamic loopback port', () => {
    expect(applicationHtml).toContain("connect-src 'self' ws://127.0.0.1:*")
    expect(applicationHtml).not.toContain('ws://localhost:5173')
  })

  it('cleans up active child processes and both development servers', () => {
    expect(developmentLauncherSource).toContain('[buildProcess, electronProcess]')
    expect(developmentLauncherSource).toMatch(/child\.kill\(\)/)
    expect(developmentLauncherSource).toContain('viteServer?.close()')
    expect(developmentLauncherSource).toContain('closeHttpServer(httpServer)')
  })
})
