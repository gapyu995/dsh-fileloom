/** Pack reviewed artifacts without running install hooks on the user's machine. */
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, `fileloom-plugin-v${manifest.version}`)
const output = join(root, '.artifacts/release')
await mkdir(output, { recursive: true })
const npm = process.env.npm_execpath
if (npm === undefined) throw new Error('Run this command with npm run pack:release')
const result = spawnSync(process.execPath, [npm, 'pack', '--json', '--ignore-scripts', '--workspaces=false', '--pack-destination', output], { cwd: root, encoding: 'utf8' })
if (result.status !== 0) throw new Error(result.stderr || result.stdout)
const [packed] = JSON.parse(result.stdout)
const files = new Set(packed.files.map(file => file.path))
for (const file of ['lib/index.js', 'lib/client.js', 'lib/THIRD_PARTY_NOTICES.txt', 'cordis.patch.yml', 'README.md', 'README.zh.md', 'LICENSE']) assert.ok(files.has(file), `Archive is missing ${file}`)
assert.ok([...files].every(file => file.startsWith('lib/') || ['cordis.patch.yml', 'README.md', 'README.zh.md', 'LICENSE', 'package.json'].includes(file)), 'Archive contains unexpected source or local files')
const digest = createHash('sha256').update(await readFile(join(output, packed.filename))).digest('hex')
await writeFile(join(output, 'SHA256SUMS'), `${digest}  ${packed.filename}\n`)
console.log(JSON.stringify({ filename: packed.filename, files: packed.files.map(file => file.path), sha256: digest }, null, 2))
