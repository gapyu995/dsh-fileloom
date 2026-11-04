# Fileloom Frontend Integration

English | [中文](frontend-plugin.zh.md)

## Current Plugins

The public repository <https://github.com/gapyu995/fileloom-frontend> contains four independently built, read-only DSH Client plugins. The existing management UI remains in this repository; it owns uploads, organization, rules, trash, and history.

| Package | Current display |
|---|---|
| `@fileloom/desktop-movies` | Featured video, horizontal shelves, local watchlist, bounded MP4/WebM playback and local resume |
| `@fileloom/desktop-music` | Folder library, editable queue, sticky player, seek, volume, shuffle and repeat |
| `@fileloom/desktop-photos` | All/month/year collections, grid density, bulk favorites, keyboard lightbox, filmstrip and zoom |
| `@fileloom/desktop-files` | General file list, folders, local filtering, text/PDF/media preview |

All four use the current authenticated Host API. File permissions and mutations remain on the Host; frontend filtering is not authorization. The plugins register locale dictionaries and reversible main/sidebar entries, not a second application root.

The left navigation follows the selected desktop through a reversible theme layer: cinema is dark, photos/files use neutral fills, and music uses a muted green tint. Leaving a desktop or unloading its plugin restores the underlying theme without changing saved appearance settings. Noncinema desktops retain system light/dark selection.

## Build and Load

Keep `fileloom-frontend` beside this checkout. From the frontend repository:

```sh
pnpm install --frozen-lockfile
pnpm check
```

From this Fileloom checkout:

```sh
pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml --patch apps/cli/config/examples/fileloom-frontend/desktop.cordis.patch.yml --no-open
```

The picker overlay selects the in-page directory picker. The [desktop overlay](../../apps/cli/config/examples/fileloom-frontend/desktop.cordis.patch.yml) resolves the sibling checkout's built Host entries; DSH discovers their Client manifests. Remove individual rows to omit a desktop. This is a local-source integration, not an npm release.

## Limits

- Content previews retain the Host's 64 MB limit; Range streaming and transcoding are absent.
- Image tiles load original files lazily; a thumbnail service is not implemented.
- Artwork uses actual same-stem image files; music also accepts a folder cover image. Online poster lookup, album/artist metadata, EXIF capture dates, recursive libraries, durable queues, and server synchronization remain future work.
- Watchlists, photo favorites, and file-specific resume positions are browser-local per data root. Photo dates are file modification dates. Storage failures display a warning and retain changes in memory.
- Compatibility is verified with this Fileloom development checkout, not every published DSH version.

## Verification

Independent frontend checks cover API validation, cancellation, late responses, filtering, queues, preview limits, UI expectations, factory loading, and disposal adapters. Real-host browser verification additionally checks navigation, image decoding, audio playback, media unmounting, text previews, and 390px layout without replacing API responses. No model round is required or claimed for these read-only views.
