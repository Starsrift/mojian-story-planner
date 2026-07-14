import { spawn } from 'node:child_process'

function assertOwnedPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new TypeError(`Invalid owned process ID: ${pid}`)
  }
}

export function createTerminationPlan(pid, platform = process.platform) {
  assertOwnedPid(pid)

  if (platform === 'win32') {
    return {
      command: 'taskkill.exe',
      args: ['/PID', String(pid), '/T', '/F'],
    }
  }

  return { processGroupId: -pid }
}

export function shouldDetachOwnedProcess(platform = process.platform) {
  return platform !== 'win32'
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
}

function hasExited(child) {
  return child.exitCode != null || child.signalCode != null
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true)

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.off?.('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timeout)
      resolve(true)
    }
    child.once?.('exit', onExit)
  })
}

async function executePosixPlan(plan, child) {
  try {
    process.kill(plan.processGroupId, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') child.kill?.('SIGTERM')
  }

  if (await waitForExit(child, 1500)) return

  try {
    process.kill(plan.processGroupId, 'SIGKILL')
  } catch (error) {
    if (error?.code !== 'ESRCH') child.kill?.('SIGKILL')
  }
  await waitForExit(child, 500)
}

async function executePlan(plan, child, platform) {
  if (platform === 'win32') {
    const code = await runCommand(plan.command, plan.args)
    if (code !== 0 && !hasExited(child)) {
      child.kill?.()
      await waitForExit(child, 500)
    }
    return
  }

  await executePosixPlan(plan, child)
}

export async function terminateProcessTree(child, ownedProcessIds, options = {}) {
  const pid = child?.pid
  if (!Number.isSafeInteger(pid) || !ownedProcessIds.has(pid) || hasExited(child)) {
    return false
  }

  const platform = options.platform ?? process.platform
  const plan = createTerminationPlan(pid, platform)
  const execute = options.execute ?? ((selectedPlan) => executePlan(selectedPlan, child, platform))
  await execute(plan)

  if (!(await waitForExit(child, options.exitTimeoutMs ?? 1500)) && !hasExited(child)) {
    child.kill?.('SIGKILL')
    const forcedExit = await waitForExit(child, options.forceTimeoutMs ?? 500)
    if (!forcedExit && !hasExited(child)) {
      throw new Error(`Owned process tree ${pid} did not exit`)
    }
  }
  return true
}
