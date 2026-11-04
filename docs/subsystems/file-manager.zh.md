# 文件管理

[English](file-manager.md) | 中文

## 概述

Fileloom 通过同一个 Host 服务向已认证的浏览器客户端和模型工具提供本地文件操作。[插件组](../../packages/file-manager/README.zh.md) 包含 Host 与管理界面；[发行包](../../plugins/fileloom/README.zh.md) 将两者与使用相同 API 的媒体展示方一起打包。

## 目录

- [数据与操作](#data-and-operations)
- [使用方](#consumers)
- [开发备注](#dev-note)

<a id="data-and-operations"></a>
## 数据与操作

[共享数据模型](../../packages/file-manager/file-manager/src/types.ts) 定义数据根、目录项、分类规则、计划、快照和操作记录。文件路径相对于配置的数据根。计划在执行前记录拟进行的移动；快照和操作历史支持恢复。[Host README](../../packages/file-manager/file-manager/README.zh.md) 负责配置与限制说明。

<a id="consumers"></a>
## 使用方

管理界面与模型工具调用相同的 Host 操作。媒体桌面使用已认证的文件列表与预览 API，不增加文件修改策略。[接入指南](../fileloom/frontend-plugin.zh.md) 提供统一插件及其媒体源码的位置。

<a id="dev-note"></a>
## 开发备注

无。
