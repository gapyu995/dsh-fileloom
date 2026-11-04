# Fileloom · 织序

Fileloom（织序）是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 二次开发的本地文件管理系统，提供文件收集、浏览、确认整理与安全撤销。

这是中期报告里“私人智能数据管理系统”的新技术路线：不再把 OpenClaw 当作应用底座，而是用 dsh 的插件、会话和 Web UI 做运行时，把文件治理、安全边界和用户确认留在应用层。

## 功能

- **首页与最近文件**：拖入即进收件箱；最近文件持久记录，关闭后再打开仍在首页置顶；提供“继续浏览、待整理、可撤销”等可解释推荐。
- **文件浏览**：多数据根、文件夹导航、搜索、排序、图片/文本/PDF/媒体预览、下载。
- **文件操作**：上传、新建文件夹、重命名、移动、复制、删除到回收站、从回收站恢复；不覆盖已有文件。
- **规则整理**：按扩展名、文件名、大小、时间生成归档方案；完整预览、分页筛选、确认后执行。
- **安全撤销**：执行前创建备份点（硬链接优先、复制兜底），失败自动回滚；整理记录可逐次撤销，冲突检查拒绝覆盖用户修改。
- **AI 集成**：dsh 对话可调用 `data_steward_*` 工具完成扫描、分类、整理、快照、回滚和单文件操作。
- **简化界面**：首页 / 文件 / 整理 三个主要入口，“更多”收纳记录、回收站、规则与设置；全部使用应用内弹窗与统一状态反馈。

## 环境

- Node.js `^22.19.0 || >=24.0.0`
- pnpm `11.x`
- 一个本地数据目录（不要直接指向整个磁盘根目录）

## 构建与启动

```powershell
cd D:\github\fileloom
pnpm install
pnpm run build

$env:DSH_DATA_STEWARD_ROOT = 'D:\DataSteward'
pnpm dsh web --no-open
```

打开终端打印的 `http://127.0.0.1:3080/?token=...`，默认进入 Fileloom 工作台。首页以最近文件为主区，上传、待办和整理记录放在辅助栏；窄屏优先显示上传入口。

多个根目录用分号分隔：

```powershell
$env:DSH_DATA_STEWARD_ROOT = 'D:\Media;E:\Documents'
```

不设置时，默认使用 `$DSH_HOME/data-steward`（通常是 `C:\Users\<you>\.dsh\data-steward`）。

### AI 对话

Web 界面本身不需要 API key；要使用对话和工具，需要在 dsh 的 Settings → Models 里配置 DeepSeek 凭据，或启动前设置：

```powershell
$env:DEEPSEEK_API_KEY = '...'
```

可以这样和它说话：

```text
扫描当前数据根，先看看有多少视频和文档。
按规则生成整理计划，把计划摘要给我。
确认执行这个计划。
刚才的整理不对，回滚上一次操作。
```

## 目录与状态

每个数据根下会创建 `.data-steward/`：

```text
.data-steward/
  index.json           # 最近一次扫描索引
  rules.json           # 可选；用户规则会完全替换默认规则
  ingest.json          # 上传/拖入记录，支撑首页“最近文件”
  plans/               # 分类计划
  operations/          # 操作记录
  snapshots/           # 备份点 manifest + 硬链接/复制文件
  trash/               # 回收站 manifest 与文件
  audit.jsonl          # 审计日志
```

状态目录不会出现在文件列表、扫描或快照中。

## 规则

默认规则覆盖视频、音乐、照片、截图、文档、压缩包和其他文件。要自定义，编辑 `<root>/.data-steward/rules.json`，或在界面“规则”页修改并保存：

```json
{
  "version": 1,
  "rules": [
    {
      "id": "video",
      "category": "video",
      "label": "视频",
      "priority": 100,
      "extensions": [".mp4", ".mkv", ".mov"],
      "target": "Media/Videos/{year}/{stem}{ext}"
    },
    {
      "id": "other",
      "category": "other",
      "label": "其他",
      "priority": -1000,
      "target": "Other/{stem}{ext}"
    }
  ]
}
```

可用模板变量：`{year}`、`{month}`、`{day}`、`{stem}`、`{ext}`、`{name}`、`{category}`。年份来自文件修改时间。

## 上传与“最近文件”

- 首页拖放或选择文件会进入根目录下的 `收件箱/`；文件页拖放/上传进入当前文件夹。
- 上传不覆盖：重名自动变成 `name (1).ext`；单文件上限 512 MB。
- 每次上传都会写入 `ingest.json`，并立即更新文件索引。因此关闭页面、重启服务后再打开，首页仍能看到最近文件，搜索也能直接找到。
- 文件被整理/移动时，收件记录会同步更新；文件不存在时自动从最近列表隐藏。

## 安全边界

- 所有路径都限制在配置的数据根内；拒绝 `..`、绝对路径和符号链接逃逸。
- 归档使用 `classify` 生成的计划；执行需要 `confirm: true`，计划绑定扫描 ID 并默认 24 小时过期。
- 执行前创建快照；任何一步失败会自动回滚已完成的移动。
- 移动和复制都不覆盖目标；目标已存在时先报冲突。
- 删除只进入回收站，不直接永久删除；当前版本不支持删除文件夹。
- `confirm: true` 只是程序约束，不是人类身份认证；v1 依赖界面二次确认和系统提示词，后续可接 dsh 的 approval 机制。

## 已知限制

- 只在本地文件系统验证，未在真实 NAS 上部署；没有 Btrfs/ZFS 原生快照。
- 没有后台 watcher，外部程序改动文件后需要手动刷新或重新扫描。
- 没有 EXIF、TMDB、MusicBrainz 等元数据补全；分类只看扩展名、文件名、大小和修改时间。
- 上传是整体缓冲（512 MB 上限），没有断点续传/分片；没有多用户权限、远程访问或 URL 深链接。
- 硬链接快照共享 inode，不能当作长期点时间备份；回滚前会用 sha256 校验快照内容。
- 备份/操作详情最多返回 500 个文件；更大的集合后续分页。

## 开发

```powershell
pnpm run build          # 全量构建
pnpm run test:gui       # 客户端/宿主 GUI 测试
pnpm exec vitest run packages/file-manager/file-manager/tests
```

新增代码只通过 dsh 的公开扩展点接入：Host 服务、精确 `/api/file-manager/*` 路由、`ctx.tools.register`、`main` / `sidebar.panellist` / 品牌 Slot。不要修改 `client/connection`、`api/gateway` 或 Typert 生成器。

文档：

- [架构说明](docs/data-steward-architecture.md)
- [产品与交互设计](docs/data-steward-design.md)
- [设计规范](docs/data-steward-design-standards.md)
- [优化计划与现状审计](docs/data-steward-optimization-plan.md)
- [与中期报告的对应关系](docs/data-steward-report-mapping.md)

上游 dsh 文档保留在 [docs/architecture.md](docs/architecture.md) 与 [README-DSH.md](README-DSH.md)。

## 许可证

MIT。DeepSeek Harness 的代码与品牌资产遵循其各自许可证；本项目是非官方二次开发，使用自有产品名称和 Logo。
