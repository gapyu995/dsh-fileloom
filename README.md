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
dsh plugin --profile web add https://github.com/gapyu995/dsh-fileloom/releases/download/fileloom-plugin-v0.1.0/dsh-plugin-fileloom-0.1.0.tgz
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

<a id="limits"></a>
## Limits

Video and audio support streamed GET, HEAD, and single HTTP byte ranges without the former 64 MB media limit. Images, PDF, text, and other previews retain a 64 MB limit. Uploads accept up to 512 MB. Browser codec support still applies; there is no transcoding, thumbnail service, online metadata, or EXIF timeline. Movies use same-stem local artwork; music also accepts folder covers. Watchlists, photo favorites, and playback positions are browser-local; music queues are not persisted.

<a id="development"></a>
## Development

From the repository root, install the release project's independent build dependencies:

```sh
npm ci
npm test
npm run pack:release
npm run smoke
```

The build reads the Host and management sources in `management/` and media sources in `media/shared/`; it bundles private stateless dependencies and leaves host-owned services and React shared. Release files and their SHA-256 checksum are under `.artifacts/release/`. The smoke test uses the published DSH package with an isolated home, data root, and dynamically assigned loopback port; it does not require AI credentials.

<a id="dev-note"></a>
## Dev Note

None.
