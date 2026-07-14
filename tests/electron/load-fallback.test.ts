import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

const runtimeHelperPath = resolve(process.cwd(), 'electron/runtime.ts')
const runtime = existsSync(runtimeHelperPath)
  ? await import(/* @vite-ignore */ pathToFileURL(runtimeHelperPath).href)
  : null

describe('Electron load failure fallback', () => {
  it('escapes failure details in a local diagnostic page', () => {
    expect(runtime).not.toBeNull()
    if (!runtime) return

    const pageUrl = runtime.createLoadFailurePageUrl(
      new Error('<script>globalThis.compromised = true</script>'),
    )
    const html = decodeURIComponent(pageUrl.split(',', 2)[1])

    expect(pageUrl).toMatch(/^data:text\/html;charset=UTF-8,/)
    expect(html).toContain('&lt;script&gt;globalThis.compromised = true&lt;/script&gt;')
    expect(html).not.toContain('<script>globalThis.compromised = true</script>')
    expect(html).toContain("default-src 'none'")
  })

  it('replaces a rejected production load with the diagnostic page', async () => {
    expect(runtime).not.toBeNull()
    if (!runtime) return

    const loadFile = vi.fn().mockRejectedValue(new Error('missing index'))
    const loadURL = vi.fn().mockResolvedValue(undefined)

    await runtime.loadApplicationContent(
      { loadFile, loadURL },
      { productionEntry: 'D:/app/dist/index.html' },
    )

    expect(loadFile).toHaveBeenCalledWith('D:/app/dist/index.html')
    expect(loadURL).toHaveBeenCalledOnce()
    expect(loadURL.mock.calls[0][0]).toMatch(/^data:text\/html;charset=UTF-8,/)
  })
})
