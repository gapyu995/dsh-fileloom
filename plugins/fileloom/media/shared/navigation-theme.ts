/** Transient theme layers follow the active desktop without changing saved appearance settings. */
import type { DesktopKind, PluginContext } from './protocol.ts'

const sidebarColors = {
  movies: { light: '#181818', dark: '#181818' },
  photos: { light: '#f6f7f9', dark: '#1b1c1f' },
  music: { light: '#f0f6f3', dark: '#18201d' },
  files: { light: '#f4f5f7', dark: '#1b1c1f' },
}

const cinemaColors: Record<string, string> = {
  '--dsw-alias-bg-base': '#151515',
  '--dsw-alias-bg-layer-1': '#1c1c1c',
  '--dsw-alias-bg-layer-2': '#242424',
  '--dsw-alias-bg-layer-3': '#292929',
  '--dsw-alias-bg-overlay': '#292929',
  '--dsw-alias-label-primary': '#fafafa',
  '--dsw-alias-label-primary-dimmed': '#e5e5e5',
  '--dsw-alias-label-primary-inverted': '#181818',
  '--dsw-alias-label-secondary': '#bcbcbc',
  '--dsw-alias-label-tertiary': '#a6a6a6',
  '--dsw-alias-label-caption': '#a6a6a6',
  '--dsw-alias-brand-primary': '#f54750',
  '--dsw-alias-brand-text': '#ff777e',
  '--dsw-alias-border-l1': '#292929',
  '--dsw-alias-border-l2': '#363636',
  '--dsw-alias-border-l3': '#454545',
  '--dsw-alias-border-l4': '#555555',
  '--dsw-alias-interactive-bg-hover': '#2b2b2b',
  '--dsw-alias-interactive-bg-active': '#373737',
  '--dsw-alias-button-elevated-fill': '#242424',
  '--dsw-alias-button-floating-fill': '#242424',
  '--dsw-alias-button-floating-hover': '#343434',
}

export function followDesktopTheme(ctx: Pick<PluginContext, 'effect' | 'layout' | 'theme'>, kind: DesktopKind): void {
  ctx.effect(() => {
    let release: (() => void) | undefined
    const sync = () => {
      const selected = ctx.layout.panelInfo.getSnapshot().activePanelId === `fileloom-${kind}`
      if (selected && release === undefined) {
        const tokens: Record<string, { light: string; dark: string }> = { '--dsw-specific-sidebar-fill': sidebarColors[kind] }
        if (kind === 'movies') {
          for (const [token, value] of Object.entries(cinemaColors)) tokens[token] = { light: value, dark: value }
        }
        release = ctx.theme.overrideTokens(`@fileloom/desktop-${kind}`, tokens)
      } else if (!selected && release !== undefined) {
        release()
        release = undefined
      }
    }
    const unsubscribe = ctx.layout.panelInfo.subscribe(sync)
    try { sync() }
    catch (error) { unsubscribe(); throw error }
    return () => { unsubscribe(); release?.() }
  }, `fileloom-${kind}: active navigation theme`)
}
