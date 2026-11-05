/** Exercise the packed plugin through the published dsh launcher in an isolated home. */
import assert from 'node:assert/strict'
import { spawn, spawnSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, open, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const runtime = require.resolve('@deepseek-ai/dsh/package.json')
const cli = process.env.FILELOOM_DSH_CLI ?? join(dirname(runtime), 'lib/bin.js')
const runtimeManifest = JSON.parse(await readFile(join(dirname(dirname(cli)), 'package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
assert.equal(runtimeManifest.version, manifest.engines.dsh)
const archive = join(root, '.artifacts/release', `${manifest.name}-${manifest.version}.tgz`)
await readFile(archive)
await mkdir(join(root, '.artifacts/smoke'), { recursive: true })
const directory = await mkdtemp(join(root, '.artifacts/smoke/run-'))
const library = join(directory, 'library')
await mkdir(join(library, 'inbox'), { recursive: true })
await writeFile(join(library, 'inbox/note.txt'), 'Fileloom release smoke\n')
const env = { ...process.env, DSH_HOME: join(directory, 'home'), DSH_DATA_STEWARD_ROOT: library }
delete env.DEEPSEEK_API_KEY
delete env.DEEPSEEK_BASE_URL

async function command(args) {
  console.log(`dsh ${args.join(' ')}`)
  const result = await exec(process.execPath, [cli, ...args], { cwd: directory, env, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 })
  return result.stdout
}

await command(['web', '--dump-config'])
await command(['plugin', '--profile', 'web', 'add', archive])
assert.match(await command(['web', '--dump-config']), /dsh-plugin-fileloom/)
const child = spawn(process.execPath, [cli, 'web', '--no-open', '--port', '0'], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
const closed = new Promise(resolve => { child.once('close', resolve) })
let logs = ''
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => { reject(new Error(`DSH did not report readiness:\n${logs}`)) }, 120_000)
  function append(chunk) {
    logs = (logs + chunk.toString()).slice(-128_000)
    const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(logs)
    if (match !== null) { clearTimeout(timer); resolve(new URL(match[1])) }
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.once('error', error => { clearTimeout(timer); reject(error) })
  child.once('exit', code => { clearTimeout(timer); reject(new Error(`DSH exited ${code}:\n${logs}`)) })
})

try {
  const address = await ready
  const base = address.origin
  const unauthenticated = await fetch(`${base}/api/file-manager/roots`)
  assert.notEqual(unauthenticated.status, 200)
  const exchange = await fetch(address, { redirect: 'manual' })
  const cookie = exchange.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.ok(cookie.length > 0)
  const headers = { cookie, origin: base }
  const index = await fetch(base, { headers })
  assert.equal(index.status, 200)
  assert.match(await index.text(), /dsh-plugin-fileloom/)
  async function request(path, data, expected = 200) {
    const response = await fetch(`${base}/api/file-manager${path}`, data === undefined
      ? { headers }
      : { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(data) })
    const text = await response.text()
    assert.equal(response.status, expected, `${path}: ${text}`)
    return JSON.parse(text)
  }
  const roots = await request('/roots')
  assert.equal(roots.roots.length, 1)
  const rootId = roots.roots[0].id
  const mediaLibrary = await request(`/media-library?rootId=${rootId}`)
  assert.ok(mediaLibrary.entries.some(entry => entry.path === 'inbox/note.txt'))
  assert.equal(mediaLibrary.truncated, false)
  assert.equal(mediaLibrary.incomplete, false)
  assert.equal(roots.roots[0].path.replaceAll('\\', '/').toLowerCase(), library.replaceAll('\\', '/').toLowerCase())
  const listed = await request(`/list?rootId=${rootId}&path=inbox`)
  assert.ok(listed.entries.some(entry => entry.name === 'note.txt'))
  const content = await fetch(`${base}/api/file-manager/content?rootId=${rootId}&path=inbox/note.txt`, { headers })
  assert.equal(await content.text(), 'Fileloom release smoke\n')
  const traversal = await fetch(`${base}/api/file-manager/content?rootId=${rootId}&path=../outside.txt`, { headers })
  assert.notEqual(traversal.status, 200)
  const scanned = await request('/scan', { rootId })
  assert.equal(scanned.fileCount, 1)
  const plan = await request('/classify', { rootId })
  const rejected = await fetch(`${base}/api/file-manager/organize`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ rootId, planId: plan.planId, confirm: false }) })
  assert.notEqual(rejected.status, 200)
  const organized = await request('/organize', { rootId, planId: plan.planId, confirm: true })
  assert.ok(organized.operationId)
  assert.ok(organized.snapshotId)
  await request('/rollback', { rootId, operationId: organized.operationId, confirm: true })
  assert.equal(await readFile(join(library, 'inbox/note.txt'), 'utf8'), 'Fileloom release smoke\n')
  const uploaded = await fetch(`${base}/api/file-manager/upload?rootId=${rootId}&path=inbox&name=uploaded.txt`, { method: 'POST', headers, body: 'Uploaded from smoke\n' })
  assert.equal(uploaded.status, 200, await uploaded.text())
  assert.equal(await readFile(join(library, 'inbox/uploaded.txt'), 'utf8'), 'Uploaded from smoke\n')
  assert.ok((await request(`/media-library?rootId=${rootId}`)).entries.some(entry => entry.path === 'inbox/uploaded.txt'))
  await writeFile(join(library, 'inbox/external.txt'), 'External change\n')
  assert.equal((await request(`/media-library?rootId=${rootId}`)).entries.some(entry => entry.path === 'inbox/external.txt'), false)
  assert.ok((await request(`/media-library?rootId=${rootId}&refresh=1`)).entries.some(entry => entry.path === 'inbox/external.txt'))
  const large = await open(join(library, 'large.mp4'), 'w')
  try { await large.truncate(128 * 1024 * 1024); await large.write('media', 0) }
  finally { await large.close() }
  const segment = await fetch(`${base}/api/file-manager/content?rootId=${rootId}&path=large.mp4`, { headers: { ...headers, range: 'bytes=0-4' } })
  assert.equal(segment.status, 206)
  assert.equal(segment.headers.get('content-length'), '5')
  assert.equal(await segment.text(), 'media')
  await writeFile(join(directory, 'browser-session.json'), `${JSON.stringify({ url: address.href, cookie }, null, 2)}\n`)
  console.log(`Authenticated API, reads, upload, scanning, confirmation, organization, rollback and large-media ranges passed on DSH ${runtimeManifest.version}`)
} finally {
  await writeFile(join(directory, 'server.log'), logs)
  if (child.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    else child.kill('SIGTERM')
  }
  await closed
}

await command(['plugin', '--profile', 'web', 'remove', manifest.name])
assert.doesNotMatch(await command(['web', '--dump-config']), /dsh-plugin-fileloom/)
assert.equal(await readFile(join(library, 'inbox/note.txt'), 'utf8'), 'Fileloom release smoke\n')
await writeFile(join(root, '.artifacts/smoke/latest.json'), `${JSON.stringify({ directory, dsh: runtimeManifest.version, passed: true }, null, 2)}\n`)
console.log('Plugin removal passed; user files were preserved.')
