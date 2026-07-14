import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const mainProcessPath = resolve(process.cwd(), 'electron/main.ts')
const mainProcessSource = existsSync(mainProcessPath)
  ? readFileSync(mainProcessPath, 'utf8')
  : ''

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
