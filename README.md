---
description: "Install Fileloom file management and media desktops in DeepSeek Harness."
kind: "package-bundle"
---

# Fileloom DSH Plugin

English | [中文](README.zh.md)

## Summary

Manage files and browse movies, photos, music, and documents inside an existing DSH Web installation. One prebuilt package includes the file service, management panel, and four media desktops. This repository owns all of their sources; installation needs neither a Fileloom checkout nor a second frontend repository.

## Table of Contents

- [Install](#install)
- [Configuration](#configuration)
- [Limits](#limits)
- [Development](#development)
- [Dev Note](#dev-note)

<a id="install"></a>
## Install

Requires Node.js 24.9+ and the tested DSH release `0.2.2-rc.1`. On November 4, 2026, that release is on npm's `next` channel, not its default `latest` channel. The package intentionally accepts only the verified DSH version.

```sh
npm install --global @deepseek-ai/dsh@0.2.2-rc.1
dsh web --dump-config
dsh plugin --profile web add https://github.com/gapyu995/dsh-fileloom/releases/download/fileloom-plugin-v0.2.0/dsh-plugin-fileloom-0.2.0.tgz
dsh web
```

The first profile command initializes the stock Web profile. The release archive contains built JavaScript and has no install/build lifecycle scripts. Installing a downloaded `.tgz` by its local absolute path also works. GitHub source ZIPs and `github:gapyu995/dsh-fileloom` are not installable plugin artifacts.

To remove the plugin:

```sh
dsh plugin --profile web remove dsh-plugin-fileloom
```

Restart a running profile if its plugin manager requests it. Uninstalling removes the package and its configuration layer, not user files or `.data-steward` recovery records. Installation executes trusted Host code outside the agent sandbox; inspect the release and checksum before installing.

<a id="configuration"></a>
## Configuration

By default, the plugin uses `DSH_DATA_STEWARD_ROOT`, or a dedicated `data-steward` folder under `DSH_HOME` or the user's home. For multiple roots and scan limits, override the `fileloom` row in the Web profile's `cordis.patch.yml`:

```yaml
- id: fileloom
  config:
    roots: ['D:/Media', 'D:/Documents']
    maxScanFiles: 20000
    planTtlHours: 24
```

Use existing directories you intend to manage; missing configured directories are created. An override replaces the complete row configuration. File operations stay within these roots. Upload, organization, trash, history, rules, and recovery live in the management panel. The media desktops remain read-only. No model credential is required for browsing; AI assistance uses the host's model configuration and requires valid credentials.

This package adds panels without replacing DSH branding, its default page, or saved theme preferences. Desktop colors apply only while their panels are selected. Do not install it alongside the fork's already-mounted `file-manager` and `ui-file-manager` rows: they provide the same API and panel ids.

### NAS Libraries

Mount an SMB or NFS share through the operating system, then configure an existing subdirectory. Windows UNC paths also work. Use a local state directory for a read-only share:

```yaml
- id: fileloom
  config:
    roots: ['//nas/Media/Library']
    readOnly: true
    stateDirectory: 'C:/Fileloom/state'
    mediaCacheMaxAgeSeconds: 300
    maxScanFiles: 20000
    planTtlHours: 24
```

On Linux, use paths such as `/mnt/nas/Library` and `/var/lib/fileloom`. `readOnly` applies to every configured root and requires an absolute `stateDirectory` outside all roots. The service refuses file changes, upload, organization, and recovery; scanning and local indexes remain available. It does not create missing read-only roots. Filesystem roots and entire Windows share roots are refused; select a library subdirectory. Network authentication and mounting belong to the operating system; this plugin does not include an SMB, WebDAV, or S3 client. Reconnect an unavailable mount before retrying.

Writable libraries retain their default `.data-steward` recovery directory beside their files; `stateDirectory` is reserved for read-only mode. Existing recovery history is not migrated when configuration changes. Physical NAS hardware has not been exercised in this release; path containment, local state, and write refusal are covered by tests.

<a id="limits"></a>
## Limits

Movie, music, and photo home views recursively read the selected root up to `maxScanFiles`; a warning appears when the limit is reached or a directory cannot be read. The host shares and persists the media index independently of the file-organization index. Its default cache age is 300 seconds; `mediaCacheMaxAgeSeconds` accepts 0..86400, with 0 disabling reuse. Refresh rescans external changes; plugin file operations invalidate memory and disk caches. Folder navigation remains available.

The photo grid and file list render in batches; use Load more for later items. The photo viewer limits its filmstrip to nearby photos. JPEG, PNG, WebP, and BMP artwork uses browser-generated previews up to 480 pixels, cached locally for up to 256 entries. The first generation still downloads the original file; this is not a server thumbnail or video-frame service. Full photo previews retain the original resolution. Movies use same-stem local artwork; music also accepts folder covers.

The music player stays in the DSH bottom bar across panel and folder navigation. Its queue (up to 500 tracks), repeat/shuffle, volume, and position are browser-local. Position is saved every five seconds and on pause. Reload restores valid indexed files paused, without autoplay. Watchlists and photo favorites are also browser-local. Browser storage failures leave the current session usable and show a warning.

Video and audio support streamed GET, HEAD, and single HTTP byte ranges without the former 64 MB media limit. Images, PDF, text, and other previews retain a 64 MB limit. Uploads accept up to 512 MB. Browser codec support still applies; there is no transcoding, online metadata, or EXIF timeline.

<a id="development"></a>
## Development

From the repository root, install the release project's independent build dependencies:

```sh
npm ci
npm test
npm run pack:release
npm run smoke
```

The build reads the Host and management sources in `management/` and media sources in `media/shared/`; it bundles private stateless dependencies and leaves host-owned services and React shared. Release files and their SHA-256 checksum are under `.artifacts/release/`. The smoke test uses the published DSH package with an isolated home, data root, and dynamically assigned loopback port; it does not require AI credentials. Set `FILELOOM_DSH_CLI` to the absolute path of another built DSH `lib/bin.js` to test that installation instead; its package version must match the plugin's verified DSH version.

Set `FILELOOM_PLUGIN_ARCHIVE` to an absolute downloaded `.tgz` path to run the same smoke test against a released artifact. Visual verification for 0.2.0 covered all four desktops at 1280x720 and 390x844 in light and dark appearances, plus video playback, original photo zoom, file preview, and persistent audio navigation/reload. Reduced motion behavior is covered by unit tests and CSS media rules.

<a id="dev-note"></a>
## Dev Note

None.
