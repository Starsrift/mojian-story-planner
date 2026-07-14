import { spawn } from 'node:child_process'
import { createServer as createHttpServer } from 'node:http'

import electronPath from 'electron'
import { createServer as createViteServer } from 'vite'

import { shouldDetachOwnedProcess, terminateProcessTree } from './process-tree.mjs'

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
      detached: shouldDetachOwnedProcess(),
    })
  }

  return spawn('npm', ['run', 'build:electron'], {
    stdio: 'inherit',
    detached: shouldDetachOwnedProcess(),
  })
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
const ownedProcessIds = new Set()

function registerOwnedProcess(child) {
  if (Number.isSafeInteger(child.pid) && child.pid > 0) {
    ownedProcessIds.add(child.pid)
  }
  return child
}

async function cleanup() {
  if (!cleanupPromise) {
    cleanupPromise = (async () => {
      await Promise.all(
        [buildProcess, electronProcess].map((child) =>
          terminateProcessTree(child, ownedProcessIds),
        ),
      )
      await Promise.all([viteServer?.close(), closeHttpServer(httpServer)])
      ownedProcessIds.clear()
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
  buildProcess = registerOwnedProcess(runElectronBuild())
  const buildExitCode = await waitForExit(buildProcess, 'Electron build')
  ownedProcessIds.delete(buildProcess.pid)
  buildProcess = undefined
  if (buildExitCode !== 0) {
    throw new Error(`Electron build exited with code ${buildExitCode}`)
  }

  electronProcess = registerOwnedProcess(spawn(electronPath, ['.'], {
    stdio: 'inherit',
    detached: shouldDetachOwnedProcess(),
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: developmentUrl,
    },
  }))

  process.exitCode = await waitForExit(electronProcess, 'Electron')
  ownedProcessIds.delete(electronProcess.pid)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await cleanup()
}
