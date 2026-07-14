import { spawn } from 'node:child_process'
import { createServer as createHttpServer } from 'node:http'

import electronPath from 'electron'
import { createServer as createViteServer } from 'vite'

const HOST = '127.0.0.1'

function waitForExit(child, commandName) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${commandName} exited after ${signal}`))
      } else {
        resolve(code ?? 1)
      }
    })
  })
}

function runElectronBuild() {
  if (process.platform === 'win32') {
    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm run build:electron'], {
      stdio: 'inherit',
    })
  }

  return spawn('npm', ['run', 'build:electron'], { stdio: 'inherit' })
}

function listenOnDynamicPort(httpServer) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      httpServer.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      httpServer.off('error', onError)
      resolve()
    }

    httpServer.once('error', onError)
    httpServer.once('listening', onListening)
    httpServer.listen(0, HOST)
  })
}

function closeHttpServer(httpServer) {
  if (!httpServer.listening) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

const httpServer = createHttpServer()
let viteServer
let buildProcess
let electronProcess
let cleanupPromise

async function cleanup() {
  if (!cleanupPromise) {
    cleanupPromise = (async () => {
      for (const child of [buildProcess, electronProcess]) {
        if (child && child.exitCode === null && !child.killed) {
          child.kill()
        }
      }
      await Promise.all([viteServer?.close(), closeHttpServer(httpServer)])
    })()
  }

  return cleanupPromise
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => {
    void cleanup().finally(() => {
      process.kill(process.pid, signal)
    })
  })
}

try {
  await listenOnDynamicPort(httpServer)
  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve the Electron development server address')
  }

  viteServer = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer,
        clientPort: address.port,
      },
    },
  })
  httpServer.on('request', viteServer.middlewares)

  const developmentUrl = `http://${HOST}:${address.port}/`
  buildProcess = runElectronBuild()
  const buildExitCode = await waitForExit(buildProcess, 'Electron build')
  buildProcess = undefined
  if (buildExitCode !== 0) {
    throw new Error(`Electron build exited with code ${buildExitCode}`)
  }

  electronProcess = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: developmentUrl,
    },
  })

  process.exitCode = await waitForExit(electronProcess, 'Electron')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await cleanup()
}
