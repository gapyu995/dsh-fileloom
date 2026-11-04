# 数据管家架构

本文件描述当前实现（v0.2 界面与文件域 v1.1），不描述未来规划。产品层面为什么这样设计，见 [data-steward-design.md](data-steward-design.md)；视觉与组件标准见 [data-steward-design-standards.md](data-steward-design-standards.md)；本轮改造的取舍与优先级见 [data-steward-optimization-plan.md](data-steward-optimization-plan.md)。

## 1. 目标与边界

数据管家把“文件域”从一个通用 Agent 工具提升为一个有明确入口、明确状态和明确撤销路径的小型产品：

- **dsh** 提供会话、模型、工具运行时、Web Shell、认证、设置和 Slot 扩展点。
- **Host 包 `@deepseek-ai/dsh-file-manager`** 提供文件服务、HTTP API、上传/收件记录、索引维护和模型工具。
- **Client 包 `@deepseek-ai/dsh-client-ui-file-manager`** 提供首页、文件、整理、记录、回收站、规则、设置，以及侧栏入口和品牌。

v0.2 不做：真实 NAS 部署、Btrfs/ZFS 原生快照、EXIF/TMDB/MusicBrainz、后台 watcher、语义搜索、多用户权限、永久删除、文件夹删除。

## 2. 组件

业务插件集中在 `packages/file-manager/`：`file-manager/` 是 Host 插件，`ui-file-manager/` 是管理 Client 插件。DSH 通用客户端仍在 `packages/client/`；Fileloom 产品文档集中在本目录。独立仓库提供四个可选的只读桌面，见 [前端插件接入](frontend-plugin.md)，不替代管理插件。

```text
Browser
  └── ui-file-manager (React, dsh client plugin)
        ├── FileManagerPage      shell：导航、根切换、共享数据、toast
        ├── pages/HomePage       最近文件、推荐、收件箱上传
        ├── pages/FilesPage      浏览、搜索、预览、单文件操作
        ├── pages/OrganizePage   读取 → 预览 → 执行 → 撤销
        ├── pages/HistoryPage    操作记录与备份点
        ├── pages/TrashPage      删除与恢复
        ├── pages/RulesPage      规则阅读 + 高级 JSON 编辑
        ├── pages/SettingsPage   根目录、运行参数、快捷键
        └── fetch /api/file-manager/*
                        │
Host                    ▼
  └── dsh-file-manager (Cordis plugin)
        ├── FileManagerService
        │     ├── paths.ts    路径规范化、containment、符号链接检查
        │     ├── rules.ts    规则校验、匹配、target 模板
        │     ├── state.ts    索引/计划/快照/操作/回收站/收件记录/审计
        │     └── service.ts  扫描、分类、整理、回滚、上传、文件操作
        ├── api.ts            /api/file-manager/* 精确路由
        └── tools.ts          10 个 data_steward_* 工具
                        │
                        ▼
                  本地文件系统
```

UI 与 AI 走同一个 `FileManagerService`。权限、快照、冲突检查只有一套实现，避免“界面不能删、AI 却能删”的不一致。

## 3. Host 模块

### 3.1 paths.ts

- `normalizeRel`：只接受相对路径；拒绝绝对路径、盘符、UNC、`..`、NUL。
- `resolveWithin`：把相对路径解析到根内，并再次校验 containment。
- `assertNoSymlinkPrefix`：逐段检查符号链接/junction；缺失段可允许。
- `walkFiles`：递归遍历普通文件，跳过符号链接和状态目录；达到上限标记 `truncated`。
- `sha256File`：内容校验；`relativePosix`：统一 POSIX 分隔符。

### 3.2 state.ts

每个根一个 `.data-steward/` 状态目录：

```text
<root>/.data-steward/
  index.json                最近一次扫描的文件索引
  rules.json                可选用户规则（保存后完全替换内置规则）
  ingest.json               上传/拖入记录（最多 500 条）
  plans/<planId>.json       完整整理方案
  operations/<opId>.json    执行/回滚状态
  snapshots/<snapId>/       备份点 manifest + files/*
  trash/<trashId>.json      回收站 manifest
  audit.jsonl               追加式审计日志
```

所有 JSON 使用同目录临时文件 + rename 原子替换。状态目录永远排除在扫描、快照和 UI 列表之外。

### 3.3 rules.ts

- 内置规则：截图、视频、音乐、照片、压缩包、文档、其他。
- 支持扩展名、文件名正则、大小上限/下限、优先级和 target 模板。
- target 可用变量：`{year}` `{month}` `{day}` `{stem}` `{ext}` `{name}` `{category}`。
- 用户规则必须可解析、id 唯一、target 不能逃逸根目录；保存后完全替换内置规则。
- 可通过 `POST /api/file-manager/rules/reset` 恢复内置规则。

### 3.4 service.ts

核心方法：

| 方法 | 作用 | 是否写文件 |
|---|---|---|
| `list` / `stat` | 浏览目录、读取元数据 | 否 |
| `scan` | 遍历并写索引 | 只写状态目录 |
| `indexStatus` | 读取索引覆盖范围和时间 | 否 |
| `classify` | 按规则生成计划 | 只写计划 |
| `planDetail` | 分页读取计划条目 | 否 |
| `organize` | 预检 → 备份 → 移动 → 失败自动回滚 | 是 |
| `rollback` | 预检冲突 → 恢复文件 → 更新索引 | 是 |
| `snapshotCreate` / `snapshotList` / `snapshotDetail` | 手动备份与读取 | 写状态目录 |
| `operations` / `operationDetail` | 操作历史 | 否 |
| `upload` | 不覆盖写入、更新索引、写收件记录 | 是 |
| `recent` | 过滤仍存在的最近上传 | 否 |
| `fileOp` | mkdir / rename / move / copy / delete / restore | 是 |

### 3.5 索引维护

索引不是“永远正确”的缓存，而是有明确生命周期的派生数据：

- `scan` 写入新索引，替换旧索引并生成新 `scanId`。
- `upload`、`copy`、`restore` 会在索引覆盖该路径时增量插入。
- `organize`、`rollback`、`rename`、`move` 会同步改写索引中的路径（支持目录前缀）。
- `delete` 会移除索引条目。
- 索引的 `scope` 表示它覆盖的范围；UI 在整理前检查“当前范围是否被索引覆盖”。

计划绑定 `scanId`。索引任何变化都会让未执行的旧计划在预检时判定为 stale，需要重新生成。

## 4. HTTP API

所有路由走 dsh Connection 的精确 Fetch 路由，天然复用 Cookie/Origin 认证；未登录返回 401。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/roots` | 根列表 + 运行参数 |
| GET | `/list` | 浏览目录 |
| GET | `/stat` | 单路径元数据 |
| GET/HEAD | `/content` | 预览内容，单文件上限 64 MB |
| GET | `/search` | 基于索引搜索 |
| GET | `/index` | 索引状态与覆盖范围 |
| GET | `/recent` | 最近上传（过滤已不存在文件） |
| GET | `/plan` | 计划详情，支持 query/category/分页 |
| POST | `/scan` | 更新索引 |
| POST | `/classify` | 生成计划 |
| POST | `/organize` | 执行计划，必须 `confirm: true` |
| GET/POST | `/operation` | GET 详情；POST 单文件操作 |
| GET | `/operations` | 操作历史 |
| GET/POST | `/snapshot` | GET 备份详情；POST 创建备份 |
| GET | `/snapshots` | 备份列表 |
| POST | `/rollback` | 按操作或备份恢复，必须 `confirm: true` |
| GET | `/trash` | 回收站列表 |
| GET/POST | `/rules` | GET 规则；POST 保存规则 |
| POST | `/rules/reset` | 恢复内置规则 |
| POST | `/upload` | 原始文件体上传；query 传 rootId/path/name/source |

注意：Connection 的精确路由按 **path 单键** 登记，同一路径的多个方法必须合并到一次 `register`，否则启动时报 “already registered”。

## 5. 关键流程

### 5.1 上传与“下次还能看到”

```text
拖入 / 选择文件
  → POST /upload（name、path、原始字节）
  → 校验文件名与路径；目标重名自动追加 (1)
  → writeFile(flag: wx) 不覆盖
  → 写 ingest.json（ingestId、path、ingestedAt、source、sha256）
  → 若索引覆盖该路径：增量 upsert
  → audit.jsonl
  → UI 刷新 recent，首页“最近文件”置顶
```

`ingest.json` 是“最近文件”的持久来源。即使客户端关闭、dsh 重启，下次打开首页仍能列出这些文件；文件被移动/整理时同步更新路径，被删除时通过“文件是否仍存在”过滤。上传同时更新索引，因此搜索立即可见，不需要再扫描。

### 5.2 扫描 → 计划 → 整理 → 撤销

```text
更新文件清单（scan）
  → 生成方案（classify，只写 plan）
  → 分页预览全部目标（planDetail）
  → 用户确认（confirm: true）
  → 全量预检：计划 ready、未过期、scanId 一致、源 size/mtime 未变、目标不存在、父路径无链接
  → 创建快照（硬链接优先，复制并校验兜底）
  → 写 operation（running）
  → 逐个 link+unlink；失败自动逆序恢复
  → 成功：更新索引与 ingest 路径，写 operation succeeded
  → 撤销：rollback 全量冲突预检 → 复制回原路径 → 删除未修改 target → 更新索引/ingest
```

### 5.3 删除与恢复

- 删除只支持普通文件，移动到 `trash/<trashId>/files/*` 并写 manifest，同时移除索引条目。
- 恢复前校验 sha256、原路径未被占用；成功后重新插入索引。
- 不提供永久删除和文件夹删除，避免不可逆误操作。

## 6. 状态模型

界面必须能回答“我现在在哪一步、下一步能做什么”。

### 6.1 索引

```text
未建立 --scan--> 已建立 --scan--> 已建立（新 scanId）
已建立 --任意路径变更--> 索引仍可用，但旧计划可能 stale
```

### 6.2 计划

```text
ready --organize 开始--> running
running --全部成功--> executed
running --失败且自动回滚--> failed
ready --过期/索引变化--> stale（预检拒绝）
```

### 6.3 操作（operation）

```text
running → succeeded → rolled_back
        ↘ failed
        ↘ rollback_failed
```

UI 只对 `succeeded` 且存在快照的操作提供“撤销”；`rolled_back` 终态不可重复撤销。

### 6.4 页面状态

每个页面都有且只有以下基本状态：

- 加载中：局部 Spinner，不阻塞整个面板。
- 空：说明为什么空、下一步做什么。
- 错误：错误原因 + 重试按钮；不吞错、不把技术 ID 当主文案。
- 忙：按钮自己显示 busy，禁止重复提交。
- 成功：toast + 局部结果卡片；toast 不替代结果。

## 7. 安全不变量

1. 路径只能是数据根内的相对路径；每一段检查符号链接。
2. 批量写操作必须来自 classify 生成的计划，并显式确认。
3. 写前快照、写后审计；失败自动回滚。
4. 不覆盖、不跟随链接、不操作状态目录。
5. 上传不覆盖；文件名不能包含路径或 Windows 保留设备名。
6. 文件内容只在预览路由按需读取，单文件上限 64 MB；上传上限 512 MB。
7. `confirm: true` 是程序约束，不是人类身份认证；v0.2 依赖界面二次确认与系统提示词，后续接 dsh approval。

## 8. dsh 集成点

- Host：`ctx.connection.fetch.register` 注册精确 `/api/file-manager/*` 路由；`ctx.tools.register(defineTool(...))` 注册 10 个工具；`ctx.systemPrompt.section` 注入工作流和安全要求。
- Client：`main` keyed Slot 注册主面板；`sidebar.panellist` 注册导航；`sidebar.brand.*` 注册品牌；`ctx.theme.overrideTokens` 注册强调色。
- 唯一的 Shell 改动：`AppFrame.tsx` 默认主面板从 `conversation` 改为 `steward`。
- 不修改 `client/connection`、`api/gateway` 或 Typert 生成器。

## 9. 已知限制与后续

- 无后台 watcher：文件系统变化后需要手动刷新或重新扫描。
- 硬链接快照共享 inode，不是长期时间点备份；回滚前会做 sha256 校验。
- 快照/操作详情最多返回 500 个文件；更大的集合需要后续分页。
- 推荐是本地启发式（最近、待整理、继续浏览、可撤销），不是模型生成。
- 后续：dsh approval 接入、增量索引、原生快照适配器、永久清理策略、文件夹删除、批量选择、URL 深链接。
