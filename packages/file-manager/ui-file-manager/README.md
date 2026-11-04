---
description: "Browse, upload, organize, and recover local files from the Fileloom management panel."
kind: "package-reference"
---

# Fileloom Management UI

English | [中文](README.zh.md)

## Summary

Browse local files, upload into an inbox, preview organization plans, and inspect history, rules, or trash. The `steward` main panel consumes the file-manager API without changing Host file-operation policies. Optional read-only media desktops are maintained separately.

## Table of Contents

- [Workspace Layout](#workspace-layout)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Workspace Layout

The home workspace separates recent files from an action rail with upload, pending actions, and recent operations. Counts reflect the latest scan, not a live total; unavailable values display `--`. Narrow screens place upload before recent files. Product copy is provided in English and Chinese.

## Model Experience

### Browser presentation

#### What the model sees

The `steward` panel adds nothing to model requests. The AI entry opens the existing conversation panel; the Host plugin owns model instructions and tools.

#### Token effect

None; browser presentation adds no model-visible events or messages.

#### KV Cache effect

None; the panel does not assemble or send provider requests.

## Known Limitations and Deferred Work

- Recent files are uploads recorded by the Host, not every file in a root.
- Recently opened files and the last browsed path are browser-local preferences.
- File details are hidden below the existing preview breakpoint.

<a id="dev-note"></a>
### Dev Note

None.
