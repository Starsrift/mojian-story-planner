import { app, BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { loadApplicationContent } from './runtime.js'

const electronDirectory = dirname(fileURLToPath(import.meta.url))

function isApplicationUrl(targetUrl: string, applicationUrl: string): boolean {
  try {
    const target = new URL(targetUrl)
    const application = new URL(applicationUrl)

    if (application.protocol === 'file:') {
      return target.protocol === 'file:' && target.pathname === application.pathname
    }

    return target.origin === application.origin
  } catch {
    return false
  }
}

function createWindow(): void {
  const productionEntry = join(electronDirectory, '../dist/index.html')
  const applicationUrl = process.env.VITE_DEV_SERVER_URL ?? pathToFileURL(productionEntry).href
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(electronDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isApplicationUrl(url, applicationUrl)) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === 'https:') {
        void shell.openExternal(url).catch((error: unknown) => {
          console.error('Failed to open external URL', error)
        })
      }
    } catch {
      // Invalid URLs are denied with the same policy as unsupported schemes.
    }

    return { action: 'deny' }
  })

  void loadApplicationContent(mainWindow, {
    developmentUrl: process.env.VITE_DEV_SERVER_URL,
    productionEntry,
  }).catch((error: unknown) => {
    console.error('Failed to display the Electron load diagnostic', error)
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
