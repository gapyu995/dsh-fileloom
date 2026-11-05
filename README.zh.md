---
description: "在 DeepSeek Harness 中安装 Fileloom 文件管理与媒体桌面。"
kind: "package-bundle"
---

# Fileloom DSH 插件

[English](README.md) | 中文

## 概述

在已有 DSH Web 中管理文件，并浏览电影、图片、音乐和文档。一个预构建包包含文件服务、管理面板与四个媒体桌面。所有源码统一在本仓库维护；安装不需要克隆 Fileloom，也不需要第二个前端仓库。

## 目录

- [安装](#install)
- [配置](#configuration)
- [限制](#limits)
- [开发](#development)
- [开发备注](#dev-note)

<a id="install"></a>
## 安装

需要 Node.js 24.9+ 和已验证的 DSH `0.2.2-rc.1`。截至 2026 年 11 月 4 日，该版本位于 npm 的 `next` 通道，不是默认 `latest` 通道。插件有意只接受经过验证的 DSH 版本。

```sh
npm install --global @deepseek-ai/dsh@0.2.2-rc.1
dsh web --dump-config
dsh plugin --profile web add https://github.com/gapyu995/dsh-fileloom/releases/download/fileloom-plugin-v0.1.0/dsh-plugin-fileloom-0.1.0.tgz
dsh web
```

第一条 profile 命令初始化原版 Web profile。Release 压缩包已包含构建后的 JavaScript，不带安装或构建生命周期脚本。也可以通过本地绝对路径安装下载好的 `.tgz`。GitHub 源码 ZIP 与 `github:gapyu995/dsh-fileloom` 不是可安装的插件产物。

卸载插件：

```sh
dsh plugin --profile web remove dsh-plugin-fileloom
```

如果插件管理器提示重启，请重启运行中的 profile。卸载移除插件包及其配置层，不删除用户文件或 `.data-steward` 恢复记录。安装会在 agent 沙箱外运行受信任的 Host 代码；安装前请检查 Release 与校验和。

<a id="configuration"></a>
## 配置

默认使用 `DSH_DATA_STEWARD_ROOT`，否则使用 `DSH_HOME` 或用户主目录下专门的 `data-steward` 文件夹。需要多个数据根或调整扫描限制时，在 Web profile 的 `cordis.patch.yml` 中覆盖 `fileloom` 配置行：

```yaml
- id: fileloom
  config:
    roots: ['D:/Media', 'D:/Documents']
    maxScanFiles: 20000
    planTtlHours: 24
```

请指定确实打算管理的现有目录；配置的目录不存在时会创建。覆盖会替换该行的完整配置。文件操作限制在这些数据根内。上传、整理、回收站、历史、规则与恢复位于管理面板；媒体桌面保持只读。浏览不需要模型凭据；AI 助手使用宿主模型配置，需要有效凭据。

插件只添加功能面板，不替换 DSH 品牌、默认页面或保存的主题偏好。桌面配色只在对应面板选中时生效。不要与本 fork 已加载的 `file-manager` 和 `ui-file-manager` 配置行同时安装：两者提供相同的 API 与面板 id。

<a id="limits"></a>
## 限制

电影、音乐和图片首页会递归读取所选数据根，最多读取 `maxScanFiles` 个文件；达到上限或部分文件夹无法读取时会显示提示。宿主在内存中共享扫描结果，页面显示扫描时间；通过插件执行文件操作会使缓存失效，外部文件变化可通过刷新重新读取，且不会替换文件整理的扫描索引。仍可进入文件夹浏览。视频和音频支持流式 GET、HEAD 及单段 HTTP 字节范围读取，不再受原有的 64 MB 媒体限制。图片、PDF、文本和其他预览保留 64 MB 上限。上传支持最大 512 MB。仍受浏览器编解码器支持限制；没有转码、缩略图服务、在线元数据或 EXIF 时间线。电影使用本地同名图片；音乐还支持文件夹封面。待看列表、图片收藏与播放进度保存在当前浏览器；音乐队列不持久化。

<a id="development"></a>
## 开发

在仓库根目录安装发行工程独立的构建依赖：

```sh
npm ci
npm test
npm run pack:release
npm run smoke
```

构建读取 `management/` 的 Host 与管理源码，以及 `media/shared/` 的媒体源码；私有无状态依赖打包进产物，宿主服务与 React 保持共享。Release 文件及 SHA-256 校验和位于 `.artifacts/release/`。冒烟测试使用已发布的 DSH 包，隔离 home、数据根与动态分配的回环端口；不需要 AI 凭据。设置 `FILELOOM_DSH_CLI` 为另一份已构建 DSH 的 `lib/bin.js` 绝对路径，可改用该安装进行测试；其包版本必须与插件验证的 DSH 版本一致。

<a id="dev-note"></a>
## 开发备注

无。
