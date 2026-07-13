import { readFileSync } from 'node:fs'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const packageVersion = readJson('package.json').version
const tauriVersion = readJson('src-tauri/tauri.conf.json').version
const cargoManifest = readFileSync('src-tauri/Cargo.toml', 'utf8')
const cargoVersion = cargoManifest.match(
  /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"\s*$/m,
)?.[1]
const versions = {
  'package.json': packageVersion,
  'src-tauri/Cargo.toml': cargoVersion,
  'src-tauri/tauri.conf.json': tauriVersion,
}

if (!cargoVersion || new Set(Object.values(versions)).size !== 1) {
  throw new Error(`应用版本不一致：${JSON.stringify(versions)}`)
}

const releaseTag = process.env.RELEASE_TAG
const expectedTag = `v${packageVersion}`
if (releaseTag !== expectedTag) {
  throw new Error(`Release 标签必须与应用版本一致：期望 ${expectedTag}，实际 ${releaseTag || '未设置'}`)
}

console.log(`Release 版本校验通过：${releaseTag}`)
