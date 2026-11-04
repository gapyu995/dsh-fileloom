# File Management

English | [中文](file-manager.zh.md)

## Summary

Fileloom exposes local file operations to authenticated browser clients and model tools through one Host service. The [plugin group](../../packages/file-manager/README.md) contains the Host and management UI; the [distribution](../../plugins/fileloom/README.md) packages them with media consumers of the same API.

## Table of Contents

- [Data and Operations](#data-and-operations)
- [Consumers](#consumers)
- [Dev Note](#dev-note)

<a id="data-and-operations"></a>
## Data and Operations

The [shared data model](../../packages/file-manager/file-manager/src/types.ts) defines roots, directory entries, classification rules, plans, snapshots, and operation records. File paths are relative to a configured root. Plans capture proposed moves before execution; snapshots and operation history support recovery. The [Host README](../../packages/file-manager/file-manager/README.md) owns configuration and limitations.

<a id="consumers"></a>
## Consumers

The management UI and model tools invoke the same Host operations. Media desktops use authenticated file listing and preview APIs without adding file-mutation policy. The [integration guide](../fileloom/frontend-plugin.md) locates the unified plugin and its media sources.

<a id="dev-note"></a>
## Dev Note

None.
