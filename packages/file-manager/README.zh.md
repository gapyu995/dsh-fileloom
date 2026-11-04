---
description: "Fileloom 文件管理插件组：定位 Host 服务与管理界面。"
kind: "package-group"
---

# Fileloom 插件

[English](README.md) | 中文

## 概述

通过 Fileloom 的 Host 和管理界面浏览、上传、整理和恢复本地文件。本组集中存放这两个插件；DSH 通用浏览器基础设施保留在 `packages/client/`。可选的只读媒体桌面由独立前端仓库维护。

## 目录

- [Packages](#packages)
- [Related Documentation](#related-documentation)
- [开发备注](#dev-note)

## Packages

| 插件包 | 职责 |
|---|---|
| [`file-manager`](file-manager/README.zh.md) | 认证文件 API、模型工具和工作流指令 |
| [`ui-file-manager`](ui-file-manager/README.zh.md) | 上传、浏览、整理、历史、规则与回收站 |

Web bundle 按现有 npm 包名加载两者。目录归组不会合并插件生命周期，也不会把文件操作策略放进浏览器。

## Related Documentation

参见 [文件管理子系统](../../docs/subsystems/file-manager.zh.md)、[Fileloom 文档](../../docs/fileloom/README.zh.md) 和 [前端接入](../../docs/fileloom/frontend-plugin.zh.md)。

<a id="dev-note"></a>
## 开发备注

无。
