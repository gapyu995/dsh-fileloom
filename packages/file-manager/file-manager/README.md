---
description: "Manage local files with shared API and model-tool safety checks, snapshots, and rollback."
kind: "package-reference"
---

# Fileloom Host Plugin

English | [中文](README.zh.md)

## Summary

Browse local files, generate classification plans, and organize them with snapshots and rollback. Authenticated browser calls and model tools share the same file checks. Explicit confirmation is required for destructive operations.

## Table of Contents

- [Configuration](#configuration)
- [Implementation](#implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Configuration

The plugin requires `connection`, `tools`, and `systemPrompt`. Its `Config` accepts `roots`, `maxScanFiles`, and `planTtlHours`; the Web composition supplies these through its plugin row.

## Implementation

`src/index.ts` mounts the plugin. `service.ts` owns file operations, `paths.ts` constrains paths, `rules.ts` owns classification, and `state.ts` stores per-root records. `api.ts` and `tools.ts` adapt the same service for browser and model consumers. Tests live under `tests/`.

See the [file-management subsystem](../../../docs/subsystems/file-manager.md) for shared data and consumers.

Audio and video responses stream with single HTTP byte-range support. Nonmedia previews retain the 64 MB limit. Upload bodies are read through the streaming route with a checked 512 MB cap before file writes.

## Model Experience

### Tools and workflow instructions

#### What the model sees

The `data_steward_*` tools expose file operations and results through [their definitions](src/tools.ts). The workflow prompt in [the plugin entry](src/index.ts) includes configured roots and requires preview and explicit confirmation before organization or rollback.

#### Token effect

Visible tool schemas and the configured-root prompt contribute request tokens. Calls and their results add history proportional to the selected files and returned summaries.

#### KV Cache effect

The initial definitions remain stable for unchanged configuration. Configuration changes alter the prompt; subsequent tool calls append history.

## Known Limitations and Deferred Work

- Only local files are supported; there is no background watcher or native filesystem snapshot provider.
- Permanent deletion and folder deletion are unavailable.
- Explicit confirmation is an execution parameter, not human identity verification.

<a id="dev-note"></a>
### Dev Note

None.
