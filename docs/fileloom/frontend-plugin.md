# Fileloom Plugin Integration

English | [中文](frontend-plugin.zh.md)

## Distribution

The [unified plugin](../../plugins/fileloom/README.md) includes the Host, management panel, and four read-only media desktops. Their sources are maintained together in this repository. Install its prebuilt GitHub Release archive into a stock DSH Web profile; neither the fork runtime nor a separate frontend checkout is required.

| Panel | Current display |
|---|---|
| `fileloom-movies` | Featured video, horizontal shelves, local watchlist, bounded MP4/WebM playback and local resume |
| `fileloom-music` | Folder library, editable queue, sticky player, seek, volume, shuffle and repeat |
| `fileloom-photos` | All/month/year collections, grid density, bulk favorites, keyboard lightbox, filmstrip and zoom |
| `fileloom-files` | General file list, folders, local filtering, text/PDF/media preview |

All four use the authenticated Host API. File permissions and mutations remain on the Host; frontend filtering is not authorization. The package registers locale dictionaries and reversible main/sidebar entries, not a second application root. Upload, organization, rules, trash, and history remain in the management panel.

The left navigation follows the selected desktop through a reversible theme layer: cinema is dark, photos/files use neutral fills, and music uses a muted green tint. Leaving a desktop or unloading its plugin restores the underlying theme without changing saved appearance settings. Noncinema desktops retain system light/dark selection.

## Source Ownership

Host and management sources live in `packages/file-manager/`. Media code and its UI tests live in `plugins/fileloom/media/`. The independent release project owns its build, package manifest, compatibility declaration, and installation smoke test.

```sh
npm --prefix plugins/fileloom install --workspaces=false
npm --prefix plugins/fileloom test
npm --prefix plugins/fileloom run pack:release
npm --prefix plugins/fileloom run smoke
```

For the existing fork development profile only, build the plugin first and use the [source overlay](../../apps/cli/config/examples/fileloom-frontend/desktop.cordis.patch.yml):

```sh
pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml --patch apps/cli/config/examples/fileloom-frontend/desktop.cordis.patch.yml --no-open
```

The overlay disables the fork's duplicate Host/management entries and mounts the unified artifact from this repository. The picker overlay selects the in-page directory picker. Ordinary users install the release archive instead; see the plugin README for installation, configuration, and removal.

## Limits

- Video and audio use streamed responses with single HTTP byte ranges; nonmedia previews retain the 64 MB limit. Transcoding is absent.
- Image tiles load original files lazily; a thumbnail service is not implemented.
- Artwork uses actual same-stem image files; music also accepts a folder cover image. Online poster lookup, album/artist metadata, EXIF capture dates, recursive libraries, durable queues, and server synchronization remain future work.
- Watchlists, photo favorites, and file-specific resume positions are browser-local per data root. Photo dates are file modification dates. Storage failures display a warning and retain changes in memory.
- The release targets DSH `0.2.2-rc.1`; compatibility with other versions is not promised.

## Verification

Media checks cover API validation, cancellation, late responses, filtering, queues, previews, UI expectations, and disposal adapters. Release checks exercise the packed Host and browser factory; the isolated smoke test installs and removes the archive through the published DSH launcher. No model round is required or claimed for the read-only views.
