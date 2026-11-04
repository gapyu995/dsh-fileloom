# Fileloom 前端插件接入

[English](frontend-plugin.md) | 中文

## Current Plugins

公开仓库 <https://github.com/gapyu995/fileloom-frontend> 包含四个独立构建的只读 DSH Client 插件。现有管理界面保留在本仓库，负责上传、整理、规则、回收站与历史。

| 插件包 | 当前展示 |
|---|---|
| `@fileloom/desktop-movies` | 精选视频、横向内容列、本地片单、受限 MP4/WebM 播放与本地续播 |
| `@fileloom/desktop-music` | 文件夹曲库、可编辑队列、底部播放器、进度、音量、随机与循环 |
| `@fileloom/desktop-photos` | 全部/月/年分组、网格密度、批量收藏、键盘灯箱、缩略图条与缩放 |
| `@fileloom/desktop-files` | 通用文件列表、目录、本地筛选与文本/PDF/媒体预览 |

四者复用现有的认证 Host API。文件权限与修改仍由 Host 负责；前端筛选不是授权。插件注册语言字典以及可撤销的主面板/侧栏入口，不创建第二个应用根节点。

左侧导航通过可撤销主题层跟随当前桌面：视频为深色，图片/文件使用中性色，音乐使用低饱和绿色。离开桌面或卸载插件时恢复原主题，不修改保存的外观设置。非视频桌面保留系统明暗选择。

## Build and Load

将 `fileloom-frontend` 放在本仓库旁边。在前端仓库运行：

```sh
pnpm install --frozen-lockfile
pnpm check
```

在此 Fileloom 仓库运行：

```sh
pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml --patch apps/cli/config/examples/fileloom-frontend/desktop.cordis.patch.yml --no-open
```

picker overlay 选择页面内目录选择器。[桌面 overlay](../../apps/cli/config/examples/fileloom-frontend/desktop.cordis.patch.yml) 定位相邻仓库构建出的 Host 入口，DSH 从包中发现 Client manifest。移除单独的配置行即可不加载对应桌面。当前是本地源码接入，不是 npm 发布版。

## Limits

- 内容预览保留 Host 的 64 MB 上限；尚无 Range 流式读取或转码。
- 图片网格按需加载原文件；尚无缩略图服务。
- 封面使用实际同名图片；音乐也可读取文件夹封面。在线海报查询、专辑/艺术家元数据、EXIF 拍摄日期、递归媒体库、持久队列与服务端同步仍待实现。
- 片单、照片收藏与按文件识别的续播进度仅保存在当前浏览器，按数据根隔离。照片日期为文件修改日期。存储失败时显示提示，并将更改保留在内存中。
- 兼容性仅验证当前 Fileloom 开发仓库，不代表支持所有已发布的 DSH 版本。

## Verification

独立前端检查覆盖 API 校验、取消、迟到响应、筛选、队列、预览上限、UI 期望、工厂加载与清理适配器。真实宿主浏览器验证另外检查导航、图片解码、音频播放、媒体卸载、文本预览与 390px 布局，不替换 API 响应。这些只读视图不需要模型轮次，也不声称已验证模型轮次。
