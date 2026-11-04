---
description: "通过共享的 API 与模型工具安全检查、快照和回滚管理本地文件。"
kind: "package-reference"
---

# Fileloom Host 插件

[English](README.md) | 中文

## 概述

浏览本地文件，生成分类计划，并通过快照和回滚执行整理。认证浏览器请求与模型工具共享同一套文件检查。破坏性操作需要显式确认。

## 目录

- [Configuration](#configuration)
- [Implementation](#implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Configuration

插件需要 `connection`、`tools` 和 `systemPrompt`。`Config` 接受 `roots`、`maxScanFiles` 与 `planTtlHours`；Web 组合通过插件配置行传入这些设置。

## Implementation

`src/index.ts` 加载插件。`service.ts` 负责文件操作，`paths.ts` 限制路径，`rules.ts` 负责分类，`state.ts` 保存各数据根的记录。`api.ts` 与 `tools.ts` 将同一服务提供给浏览器与模型。测试位于 `tests/`。

共享数据与使用方见 [文件管理子系统](../../../docs/subsystems/file-manager.zh.md)。

音视频响应使用流式读取，支持单段 HTTP 字节范围。非媒体预览保留 64 MB 上限。上传请求体通过 streaming 路由读取，在写文件前检查 512 MB 上限。

## Model Experience

### Tools and workflow instructions

#### What the model sees

`data_steward_*` 工具通过 [工具定义](src/tools.ts) 提供文件操作及结果。[插件入口](src/index.ts) 的工作流提示词包含配置的数据根，要求在整理或回滚前预览并获得显式确认。

#### Token effect

可见工具 schema 和数据根提示词占用请求 token。工具调用及其结果按所选文件与返回摘要的规模增加历史。

#### KV Cache effect

配置不变时初始定义保持稳定。配置变更会改变提示词；后续工具调用追加历史。

## Known Limitations and Deferred Work

- 只支持本地文件；没有后台 watcher 或原生文件系统快照提供方。
- 不提供永久删除和文件夹删除。
- 显式确认是执行参数，不是人类身份验证。

<a id="dev-note"></a>
### 开发备注

无。
