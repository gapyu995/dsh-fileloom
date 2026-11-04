# Data Steward UI

The browser panel for local files, inbox uploads, organization previews, history, rules, and trash. The `steward` main-panel entry consumes the file-manager API and locale dictionaries without changing the host's file-operation policies.

## Workspace Layout

The home workspace separates recent files from an action rail containing upload, pending actions, and recent operations. File count and size reflect the latest scan, not a live filesystem total; unavailable scan values display `--`. On narrow screens the upload section precedes recent files. Organization and settings use unframed sections; individual files, rules, and dialogs keep their own visual grouping. Product copy is provided in English and Chinese.

## Model Experience

This package changes browser presentation only. It adds no model instructions, model-visible events, tokens, or KV-cache effects. The AI entry opens the existing conversation panel.

## Known Limitations and Deferred Work

Recent files are uploads recorded by the host, not every file in a root. Recently opened files and the last browsed path are browser-local preferences. File details are hidden below the existing preview breakpoint.
