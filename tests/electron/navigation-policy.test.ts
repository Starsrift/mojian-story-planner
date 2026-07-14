import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const policyPath = resolve(process.cwd(), 'electron/navigationPolicy.ts')
const policy = existsSync(policyPath)
  ? await import(/* @vite-ignore */ pathToFileURL(policyPath).href)
  : null

describe('Electron application navigation policy', () => {
  it('allows the packaged file while ignoring query and hash changes', () => {
    expect(policy).not.toBeNull()
    if (!policy) return

    const applicationUrl = 'file:///D:/Apps/Mojian/dist/index.html?boot=1#start'
    expect(policy.isAllowedApplicationNavigation(
      'file:///D:/Apps/Mojian/dist/index.html?project=42#chapter-3',
      applicationUrl,
    )).toBe(true)
  })

  it('rejects a foreign host for the same packaged file path', () => {
    expect(policy).not.toBeNull()
    if (!policy) return

    expect(policy.isAllowedApplicationNavigation(
      'file://foreign-host/D:/Apps/Mojian/dist/index.html',
      'file:///D:/Apps/Mojian/dist/index.html',
    )).toBe(false)
  })

  it('rejects malformed input and protocol changes', () => {
    expect(policy).not.toBeNull()
    if (!policy) return

    expect(policy.isAllowedApplicationNavigation(
      'not a URL',
      'file:///D:/Apps/Mojian/dist/index.html',
    )).toBe(false)
    expect(policy.isAllowedApplicationNavigation(
      'https://example.com/index.html',
      'file:///D:/Apps/Mojian/dist/index.html',
    )).toBe(false)
  })

  it('allows only the configured development origin and path scope', () => {
    expect(policy).not.toBeNull()
    if (!policy) return

    const applicationUrl = 'http://127.0.0.1:43127/planner/'
    expect(policy.isAllowedApplicationNavigation(
      'http://127.0.0.1:43127/planner/story?id=7#board',
      applicationUrl,
    )).toBe(true)
    expect(policy.isAllowedApplicationNavigation(
      'http://localhost:43127/planner/story',
      applicationUrl,
    )).toBe(false)
    expect(policy.isAllowedApplicationNavigation(
      'http://127.0.0.1:43128/planner/story',
      applicationUrl,
    )).toBe(false)
    expect(policy.isAllowedApplicationNavigation(
      'http://127.0.0.1:43127/other/story',
      applicationUrl,
    )).toBe(false)
  })
})
