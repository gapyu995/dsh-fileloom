---
description: "Fileloom file-management plugins: locate the Host service and management interface."
kind: "package-group"
---

# Fileloom Plugins

English | [中文](README.zh.md)

## Summary

Browse, upload, organize, and recover local files through Fileloom's Host and management UI. This group keeps both plugins together; shared DSH browser infrastructure stays in `packages/client/`. Optional read-only media desktops are maintained in the separate frontend repository.

## Table of Contents

- [Packages](#packages)
- [Related Documentation](#related-documentation)
- [Dev Note](#dev-note)

## Packages

| Package | Responsibility |
|---|---|
| [`file-manager`](file-manager/README.md) | Authenticated file API, model tools, and workflow instructions |
| [`ui-file-manager`](ui-file-manager/README.md) | Uploads, browsing, organization, history, rules, and trash |

The Web bundle mounts both packages by their existing npm names. Grouping does not merge their plugin lifecycles or move file-operation policy into the browser.

## Related Documentation

See the [file-management subsystem](../../docs/subsystems/file-manager.md), [Fileloom documentation](../../docs/fileloom/README.md), and [frontend integration](../../docs/fileloom/frontend-plugin.md).

<a id="dev-note"></a>
## Dev Note

None.
