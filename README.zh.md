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
dsh plugin --profile web add https://github.com/gapyu995/dsh-fileloom/releases/download/fileloom-plugin-v0.2.0/dsh-plugin-fileloom-0.2.0.tgz
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

### NAS 文件库

先通过操作系统挂载 SMB 或 NFS 共享，再配置已有的子目录；Windows 也可使用 UNC 路径。只读共享使用独立的本地状态目录：

```yaml
- id: fileloom
  config:
    roots: ['//nas/Media/Library']
    readOnly: true
    stateDirectory: 'C:/Fileloom/state'
    mediaCacheMaxAgeSeconds: 300
    maxScanFiles: 20000
    planTtlHours: 24
```

Linux 可改用 `/mnt/nas/Library` 和 `/var/lib/fileloom`。`readOnly` 对全部配置根生效，必须提供位于所有数据根之外的绝对 `stateDirectory`。服务拒绝修改文件、上传、整理和恢复，仍可扫描并保存本地索引；不会创建缺失的只读根目录。不接受文件系统根或 Windows 整个共享根，请指定文件库子目录。网络认证与挂载由操作系统负责，插件不内置 SMB、WebDAV 或 S3 客户端；挂载失联时先重新连接，再重试。

可写文件库继续把 `.data-steward` 恢复目录放在文件旁，`stateDirectory` 仅用于只读模式。配置变更不会自动迁移旧恢复历史。本版尚未连接实体 NAS；路径边界、本地状态和拒绝写入已由测试覆盖。

<a id="limits"></a>
## 限制

电影、音乐和图片首页会递归读取所选数据根，最多读取 `maxScanFiles` 个文件；达到上限或部分文件夹无法读取时会显示提示。宿主共享并持久保存媒体索引，与文件整理索引相互独立。默认缓存 300 秒；`mediaCacheMaxAgeSeconds` 可设为 0..86400，0 表示不复用缓存。刷新会重扫外部变化，插件文件操作会使内存和磁盘缓存失效。仍可进入文件夹浏览。

照片网格和文件列表分批显示，可使用“加载更多”展示后续内容；照片查看器只显示当前位置附近的胶片。JPEG、PNG、WebP 和 BMP 封面会在浏览器中生成最长边 480 像素的预览，本地最多缓存 256 项。首次生成仍需下载原文件，不是服务端缩略图或视频抽帧服务；照片大图仍保留原始分辨率。电影使用本地同名图片，音乐还支持文件夹封面。

音乐播放器常驻 DSH 底栏，切换面板或文件夹不会中断播放。队列（最多 500 首）、循环、随机播放、音量与位置保存在当前浏览器，位置每五秒及暂停时保存。刷新后按索引验证文件并暂停恢复，不自动播放。待看列表与图片收藏也保存在当前浏览器；存储不可用时会显示提示，当前会话仍可使用。

视频和音频支持流式 GET、HEAD 及单段 HTTP 字节范围读取，不再受原有的 64 MB 媒体限制。图片、PDF、文本和其他预览保留 64 MB 上限；上传支持最大 512 MB。仍受浏览器编解码器支持限制，没有转码、在线元数据或 EXIF 时间线。

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

将 `FILELOOM_PLUGIN_ARCHIVE` 设为已下载 `.tgz` 的绝对路径，可对线上 Release 产物执行同一冒烟测试。0.2.0 已截图检查四个桌面在 1280x720、390x844 和明暗主题下的表现，并实测视频播放、原图缩放、文件预览、跨面板音频与刷新恢复。减少动态效果的行为由单元测试及 CSS 媒体规则覆盖。

<a id="dev-note"></a>
## 开发备注

无。
