/** Build a self-contained release from this repository's authoritative sources. */
import { build } from 'esbuild'
import { transform } from 'lightningcss'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const repo = fileURLToPath(new URL('../../../', import.meta.url))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const require = createRequire(import.meta.url)
const nodePaths = [join(root, 'node_modules')]
await mkdir(join(root, 'lib'), { recursive: true })

await build({
  entryPoints: [join(repo, 'packages/file-manager/file-manager/src/index.ts')],
  outfile: join(root, 'lib/index.js'), bundle: true, format: 'esm', platform: 'node',
  target: 'node24', nodePaths,
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools'],
  plugins: [{
    name: 'published-schema',
    setup(builder) {
      builder.onResolve({ filter: /^@deepseek-ai\/schemastery$/ }, () => ({ path: require.resolve('@deepseek-ai/schemastery') }))
    },
  }],
})

const cssPath = join(repo, 'packages/file-manager/ui-file-manager/src/client/FileManagerPage.module.css')
const compiled = transform({ filename: 'FileManagerPage.module.css', code: await readFile(cssPath), cssModules: true, minify: true })
const classes = Object.fromEntries(Object.entries(compiled.exports).map(([key, value]) => [key, value.name]))
const stylesheet = compiled.code.toString()

await build({
  entryPoints: [join(root, 'src/client.ts')], outfile: join(root, 'lib/client.js'),
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', jsx: 'automatic', minify: true,
  nodePaths, external: ['react', 'react/jsx-runtime'], loader: { '.css': 'text' },
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory(require){const module={exports:{}};const exports=module.exports;` },
  footer: { js: 'return module.exports;}});' },
  plugins: [{
    name: 'owned-management-styles',
    setup(builder) {
      builder.onResolve({ filter: /^fileloom:styles$/ }, () => ({ path: 'styles', namespace: 'fileloom' }))
      builder.onLoad({ filter: /.*/, namespace: 'fileloom' }, () => ({ contents: `export default ${JSON.stringify(stylesheet)}`, loader: 'js' }))
      builder.onLoad({ filter: /FileManagerPage\.module\.css$/ }, () => ({ contents: `export default ${JSON.stringify(classes)}`, loader: 'js' }))
    },
  }],
})

const notices = []
for (const dependency of ['lucide-react', 'zod', '@deepseek-ai/schemastery', '@deepseek-ai/cosmokit', 'hono', '@hono/node-server']) {
  const metadata = findPackageJSON(dependency, import.meta.url)
  if (metadata === undefined) throw new Error(`Missing package metadata for ${dependency}`)
  const directory = dirname(metadata)
  notices.push(`${dependency}\n\n${await readFile(join(directory, 'LICENSE'), 'utf8')}`)
}
await writeFile(join(root, 'lib/THIRD_PARTY_NOTICES.txt'), `${notices.join('\n\n')}\n`)
await writeFile(join(root, 'lib/build-info.json'), `${JSON.stringify({
  package: manifest.name, version: manifest.version, dsh: manifest.engines.dsh,
  node: manifest.engines.node, panels: ['steward', 'fileloom-movies', 'fileloom-music', 'fileloom-photos', 'fileloom-files'],
}, null, 2)}\n`)
console.log(`Built ${manifest.name}@${manifest.version} for DSH ${manifest.engines.dsh}`)
