/** Built-factory and package checks independent of a DSH source installation. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { load } from 'js-yaml'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))

test('one installable bundle carries a browser factory and no install-time execution', async () => {
  assert.equal(manifest.engines.dsh, '0.2.2-rc.1')
  assert.equal(manifest.dsh.client.platform, 'web')
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(manifest.scripts[script], undefined)
  assert.equal(manifest.dependencies, undefined)
  const patch = load(await readFile(new URL('cordis.patch.yml', root), 'utf8'))
  assert.equal(patch.length, 1)
  assert.equal(patch[0].insert.length, 1)
  assert.equal(patch[0].insert[0].name, manifest.name)
  const host = await import(new URL('lib/index.js', root))
  assert.equal(typeof host.apply, 'function')
  assert.deepEqual(host.inject, ['connection', 'tools', 'systemPrompt'])
})

test('all five panels unload without leaving copy, styles, slots, or theme layers', async t => {
  const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'http://127.0.0.1/' })
  t.after(() => { dom.window.close() })
  let module
  dom.window.__ModuleLoader__ = { load(value) { module = value } }
  runInNewContext(await readFile(new URL('lib/client.js', root), 'utf8'), { window: dom.window, document: dom.window.document, URL })
  assert.equal(module.id, manifest.name)
  assert.equal(dom.window.document.head.children.length, 0)
  const require = createRequire(import.meta.url)
  const requested = []
  const plugin = module.factory(name => { requested.push(name); return require(name) })
  assert.ok(requested.every(name => name === 'react' || name === 'react/jsx-runtime'))
  const slots = new Set()
  const namespaces = new Set()
  const layers = new Map()
  const listeners = new Set()
  let activePanelId = 'conversation'
  function context() {
    const disposers = []
    const ctx = {
      effect(callback) { const dispose = callback(); disposers.push(dispose); return dispose },
      plugin(child) {
        const childContext = context()
        disposers.push(childContext.dispose)
        child.apply(childContext.ctx)
      },
      locale: {
        register(namespace) { namespaces.add(namespace); return () => { namespaces.delete(namespace) } },
        bind() { return key => key },
      },
      slots: {
        inject(slot, callback) { assert.ok(slot === 'main' || slot === 'sidebar.panellist'); ctx.effect(callback) },
        register(options) {
          const id = `${options.name}/${options.key ?? options.id}`
          assert.ok(!slots.has(id))
          slots.add(id)
          return () => { slots.delete(id) }
        },
      },
      layout: {
        panelInfo: {
          getSnapshot() { return { activePanelId } },
          subscribe(callback) { listeners.add(callback); return () => { listeners.delete(callback) } },
        },
      },
      theme: { overrideTokens(id, tokens) { layers.set(id, tokens); return () => { layers.delete(id) } } },
    }
    return { ctx, dispose() { while (disposers.length > 0) disposers.pop()() } }
  }
  const mounted = context()
  t.after(mounted.dispose)
  plugin.apply(mounted.ctx)
  assert.equal(dom.window.document.head.children.length, 1)
  assert.equal(namespaces.size, 5)
  assert.equal(slots.size, 10)
  assert.equal(activePanelId, 'conversation')
  assert.equal(layers.size, 0)
  for (const kind of ['movies', 'photos', 'music', 'files']) {
    activePanelId = `fileloom-${kind}`
    for (const listener of listeners) listener()
    assert.equal(layers.size, 1)
  }
  mounted.dispose()
  assert.equal(slots.size, 0)
  assert.equal(namespaces.size, 0)
  assert.equal(layers.size, 0)
  assert.equal(listeners.size, 0)
  assert.equal(dom.window.document.head.children.length, 0)
})
