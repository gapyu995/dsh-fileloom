# Fileloom 插件接入

[English](frontend-plugin.md) | 中文

## Distribution

[统一插件](../../plugins/fileloom/README.zh.md) 包含 Host、管理面板与四个只读媒体桌面。全部源码统一在本仓库维护。将预构建的 GitHub Release 压缩包安装到原版 DSH Web profile 即可；不需要本 fork 运行时或单独的前端 checkout。

| 面板 | 当前展示 |
|---|---|
| `fileloom-movies` | 精选视频、横向内容列、本地片单、受限 MP4/WebM 播放与本地续播 |
| `fileloom-music` | 文件夹曲库、可编辑队列、底部播放器、进度、音量、随机与循环 |
| `fileloom-photos` | 全部/月/年分组、网格密度、批量收藏、键盘灯箱、缩略图条与缩放 |
| `fileloom-files` | 通用文件列表、目录、本地筛选与文本/PDF/媒体预览 |

四者复用认证 Host API。文件权限与修改仍由 Host 负责；前端筛选不是授权。插件注册语言字典以及可撤销的主面板/侧栏入口，不创建第二个应用根节点。上传、整理、规则、回收站与历史仍由管理面板负责。

左侧导航通过可撤销主题层跟随当前桌面：视频为深色，图片/文件使用中性色，音乐使用低饱和绿色。离开桌面或卸载插件时恢复原主题，不修改保存的外观设置。非视频桌面保留系统明暗选择。

## Source Ownership

Host 与管理源码位于 `packages/file-manager/`。媒体代码及其 UI 测试位于 `plugins/fileloom/media/`。独立发行工程负责构建、包清单、兼容性声明与安装冒烟测试。

```sh
npm --prefix plugins/fileloom install --workspaces=false
npm --prefix plugins/fileloom test
npm --prefix plugins/fileloom run pack:release
npm --prefix plugins/fileloom run smoke
```

仅针对现有 fork 的开发 profile，先构建插件，再使用 [源码 overlay](../../apps/cli/config/examples/fileloom-frontend/desktop.cordis.patch.yml)：

```sh
pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml --patch apps/cli/config/examples/fileloom-frontend/desktop.cordis.patch.yml --no-open
```

overlay 禁用 fork 中重复的 Host/管理入口，并加载本仓库的统一产物。picker overlay 选择页面内目录选择器。普通使用者安装 Release 压缩包即可；安装、配置和卸载见插件 README。

## Limits

- 视频和音频使用流式响应，支持单段 HTTP 字节范围；非媒体预览保留 64 MB 上限。尚无转码。
- 图片网格按需加载原文件；尚无缩略图服务。
- 封面使用实际同名图片；音乐也可读取文件夹封面。在线海报查询、专辑/艺术家元数据、EXIF 拍摄日期、递归媒体库、持久队列与服务端同步仍待实现。
- 片单、照片收藏与按文件识别的续播进度仅保存在当前浏览器，按数据根隔离。照片日期为文件修改日期。存储失败时显示提示，并将更改保留在内存中。
- Release 面向 DSH `0.2.2-rc.1`，不承诺兼容其他版本。

## Verification

媒体检查覆盖 API 校验、取消、迟到响应、筛选、队列、预览、UI 期望与清理适配器。发行检查验证打包后的 Host 与浏览器 factory；隔离冒烟测试通过已发布 DSH 启动器安装和移除压缩包。这些只读视图不需要，也不声称验证了模型轮次。
