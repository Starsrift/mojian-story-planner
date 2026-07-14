interface ApplicationContentLoader {
  loadFile(path: string): Promise<void>
  loadURL(url: string): Promise<void>
}

interface ApplicationContentOptions {
  developmentUrl?: string
  productionEntry: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })
}

export function createLoadFailurePageUrl(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>Application load failed</title>
    <style>body{margin:0;padding:32px;font:14px system-ui,sans-serif;color:#202124;background:#f8f9fa}main{max-width:720px;margin:auto}h1{font-size:20px}pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #dadce0;padding:16px}</style>
  </head>
  <body><main><h1>Application load failed</h1><pre>${escapeHtml(message)}</pre></main></body>
</html>`

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`
}

export async function loadApplicationContent(
  loader: ApplicationContentLoader,
  options: ApplicationContentOptions,
): Promise<void> {
  try {
    if (options.developmentUrl) {
      await loader.loadURL(options.developmentUrl)
    } else {
      await loader.loadFile(options.productionEntry)
    }
  } catch (error) {
    await loader.loadURL(createLoadFailurePageUrl(error))
  }
}
