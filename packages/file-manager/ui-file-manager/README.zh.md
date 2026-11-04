---
description: "通过 Fileloom 管理面板浏览、上传、整理和恢复本地文件。"
kind: "package-reference"
---

# Fileloom 管理界面

[English](README.md) | 中文

## 概述

浏览本地文件，上传到收件箱，预览整理计划，并查看历史、规则和回收站。`steward` 主面板使用 file-manager API，不改变 Host 的文件操作策略。可选的只读媒体桌面独立维护。

## 目录

- [Workspace Layout](#workspace-layout)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Workspace Layout

首页将最近文件与包含上传、待办和最近操作的辅助栏分开。统计反映最近一次扫描，不是实时总数；缺失值显示 `--`。窄屏将上传放在最近文件前。产品文案支持中英文。

## Model Experience

### Browser presentation

#### What the model sees

`steward` 主面板不向模型请求添加内容。AI 入口打开现有对话面板；模型指令与工具由 Host 插件负责。

#### Token effect

无；浏览器展示不添加模型可见事件或消息。

#### KV Cache effect

无；此面板不组装或发送模型提供方请求。

## Known Limitations and Deferred Work

- 最近文件是 Host 记录的上传文件，不是数据根中的全部文件。
- 最近打开文件与上次浏览路径是浏览器本地偏好。
- 窄屏布局隐藏详情栏；激活文件行或使用预览操作可打开包含预览与下载的弹窗。

<a id="dev-note"></a>
### 开发备注

无。
