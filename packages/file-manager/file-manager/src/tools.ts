/** Model-facing tools over the shared FileManagerService. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { formatBytes } from './paths.ts'
import type { FileManagerService } from './service.ts'

const TEXT = (text: string): Array<{ type: 'text'; text: string }> => [{ type: 'text', text }]

/** Register the data-steward tool surface. */
export function registerFileManagerTools(ctx: Context, service: FileManagerService): void {
  ctx.tools.register(defineTool({
    name: 'data_steward_roots',
    description: '列出数据管家当前允许管理的根目录。任何文件操作都必须使用这里的 rootId。',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          roots: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                name: { type: 'string', required: true },
                path: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => TEXT(value.roots.length === 0
        ? '没有配置数据根目录。'
        : value.roots.map(root => `${root.name} (${root.id}): ${root.path}`).join('\n')),
    },
    async execute() {
      return { roots: service.rootsInfo().map(root => ({ id: root.id, name: root.name, path: root.path })) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_steward_list',
    description: '列出某个数据根目录下指定相对路径的文件和子目录。只读，不移动文件。',
    parameters: {
      rootId: { type: 'string', required: true, description: '来自 data_steward_roots 的根目录 id' },
      path: { type: 'string', description: '相对根目录的路径，默认 "."' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          rootId: { type: 'string', required: true },
          path: { type: 'string', required: true },
          entries: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                name: { type: 'string', required: true },
                kind: { type: 'string', required: true, enum: ['file', 'directory'] },
                size: { type: 'integer', required: true },
                modifiedAt: { type: 'string', required: true },
                ext: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = value.entries.slice(0, 30).map(entry => `${entry.kind === 'directory' ? 'DIR ' : 'FILE'} ${entry.path}${entry.kind === 'directory' ? '' : ` (${formatBytes(entry.size)})`}`)
        return TEXT(`根目录 ${value.rootId}，路径 ${value.path}，共 ${value.entries.length} 项。\n${lines.join('\n')}${value.entries.length > 30 ? '\n...' : ''}`)
      },
    },
    async execute(args) {
      const listed = await service.list(args.rootId, args.path ?? '.')
      return {
        rootId: listed.rootId,
        path: listed.path,
        entries: listed.entries.map(entry => ({
          path: entry.path, name: entry.name, kind: entry.kind, size: entry.size,
          modifiedAt: new Date(entry.mtimeMs).toISOString(), ext: entry.ext,
        })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_steward_scan',
    description: '扫描数据根目录下的相对路径，建立 JSON 索引并返回类型/容量摘要。不会移动文件。',
    parameters: {
      rootId: { type: 'string', required: true },
      path: { type: 'string', description: '相对根目录的路径，默认 "."' },
      maxFiles: { type: 'integer', description: '本次最多索引文件数，不超过服务配置上限' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          scanId: { type: 'string', required: true },
          rootId: { type: 'string', required: true },
          path: { type: 'string', required: true },
          scannedAt: { type: 'string', required: true },
          fileCount: { type: 'integer', required: true },
          totalBytes: { type: 'integer', required: true },
          truncated: { type: 'boolean', required: true },
          byExtension: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                extension: { type: 'string', required: true },
                count: { type: 'integer', required: true },
                bytes: { type: 'integer', required: true },
              },
            },
          },
          byCategory: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                category: { type: 'string', required: true },
                count: { type: 'integer', required: true },
                bytes: { type: 'integer', required: true },
              },
            },
          },
          samples: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: { path: { type: 'string', required: true }, size: { type: 'integer', required: true } },
            },
          },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => TEXT([
        `扫描完成，索引 ID：${value.scanId}`,
        `文件：${value.fileCount} 个，共 ${formatBytes(value.totalBytes)}${value.truncated ? '（达到上限，已截断）' : ''}`,
        `类型分布：${value.byCategory.map(item => `${item.category} ${item.count}`).join('，') || '无'}`,
        '下一步调用 data_steward_classify 生成归档计划；尚未移动任何文件。',
      ].join('\n')),
    },
    async execute(args) {
      const result = await service.scan(args.rootId, args.path ?? '.', args.maxFiles)
      return {
        scanId: result.scanId, rootId: result.rootId, path: result.path, scannedAt: result.scannedAt,
        fileCount: result.fileCount, totalBytes: result.totalBytes, truncated: result.truncated,
        byExtension: result.byExtension, byCategory: result.byCategory,
        samples: result.samples.map(sample => ({ path: sample.path, size: sample.size })),
        warnings: result.warnings,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_steward_search',
    description: '在最近一次扫描索引中按名称、扩展名、分类或修改时间搜索文件。',
    parameters: {
      rootId: { type: 'string', required: true },
      query: { type: 'string', description: '文件名或相对路径包含的文本' },
      extension: { type: 'string', description: '扩展名，如 mp4 或 .mp4' },
      category: { type: 'string', description: '分类，如 video/music/photo/document/archive/other' },
      after: { type: 'string', description: 'ISO 时间下界（含）' },
      before: { type: 'string', description: 'ISO 时间上界（含）' },
      offset: { type: 'integer', description: '分页偏移，默认 0' },
      limit: { type: 'integer', description: '每页条数，默认 20，最大 100' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          totalMatches: { type: 'integer', required: true },
          offset: { type: 'integer', required: true },
          limit: { type: 'integer', required: true },
          hasMore: { type: 'boolean', required: true },
          results: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                name: { type: 'string', required: true },
                size: { type: 'integer', required: true },
                modifiedAt: { type: 'string', required: true },
                category: { type: 'string', required: true },
                label: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => TEXT(`找到 ${value.totalMatches} 个文件，当前第 ${value.offset + 1}—${value.offset + value.results.length} 条。\n${value.results.map(item => `${item.path} (${item.category}, ${formatBytes(item.size)})`).join('\n')}`),
    },
    async execute(args) {
      const result = await service.search(args.rootId, {
        query: args.query, extension: args.extension, category: args.category,
        after: args.after, before: args.before, offset: args.offset, limit: args.limit,
      }) as {
        totalMatches: number
        offset: number
        limit: number
        hasMore: boolean
        results: Array<{ path: string; name: string; size: number; modifiedAt: string; category: string; label: string }>
      }
      return {
        totalMatches: result.totalMatches, offset: result.offset, limit: result.limit, hasMore: result.hasMore,
        results: result.results.map(({ path, name, size, modifiedAt, category, label }) => ({
          path, name, size, modifiedAt, category, label,
        })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_steward_classify',
    description: '按当前规则为索引中的文件生成归档计划。只生成计划，不移动文件；必须把 planId 和摘要展示给用户。',
    parameters: {
      rootId: { type: 'string', required: true },
      path: { type: 'string', description: '相对根目录的路径，默认 "."' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          planId: { type: 'string', required: true },
          scanId: { type: 'string', required: true },
          path: { type: 'string', required: true },
          createdAt: { type: 'string', required: true },
          expiresAt: { type: 'string', required: true },
          fileCount: { type: 'integer', required: true },
          moveCount: { type: 'integer', required: true },
          noopCount: { type: 'integer', required: true },
          unmatchedCount: { type: 'integer', required: true },
          collisionCount: { type: 'integer', required: true },
          totalBytes: { type: 'integer', required: true },
          rulesSource: { type: 'string', required: true, enum: ['default', 'user'] },
          samples: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                source: { type: 'string', required: true },
                target: { type: 'string', required: true },
                category: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => TEXT([
        `已生成归档计划 ${value.planId}（${value.rulesSource === 'user' ? '用户规则' : '默认规则'}）。`,
        `计划移动 ${value.moveCount} 个文件，共 ${formatBytes(value.totalBytes)}；跳过 ${value.noopCount} 个，未匹配 ${value.unmatchedCount} 个，重名处理 ${value.collisionCount} 个。`,
        '示例：',
        ...value.samples.slice(0, 8).map(item => `  ${item.source} -> ${item.target}`),
        `计划有效期至 ${value.expiresAt}。只有用户明确确认后才能调用 data_steward_organize，并传 confirm=true。`,
      ].join('\n')),
    },
    async execute(args) {
      const result = await service.classify(args.rootId, args.path ?? '.') as {
        planId: string
        scanId: string
        path: string
        createdAt: string
        expiresAt: string
        fileCount: number
        moveCount: number
        noopCount: number
        unmatchedCount: number
        collisionCount: number
        totalBytes: number
        rulesSource: 'default' | 'user'
        samples: Array<{ source: string; target: string; category: string }>
      }
      return {
        planId: result.planId, scanId: result.scanId, path: result.path, createdAt: result.createdAt, expiresAt: result.expiresAt,
        fileCount: result.fileCount, moveCount: result.moveCount, noopCount: result.noopCount, unmatchedCount: result.unmatchedCount,
        collisionCount: result.collisionCount, totalBytes: result.totalBytes, rulesSource: result.rulesSource,
        samples: result.samples.map(({ source, target, category }) => ({ source, target, category })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_steward_organize',
    description: '执行一个已生成的归档计划。会先创建快照，再移动文件；失败时自动回滚。必须得到用户明确确认后传 confirm=true。',
    parameters: {
      rootId: { type: 'string', required: true },
      planId: { type: 'string', required: true },
      confirm: { type: 'boolean', required: true, description: '必须严格为 true' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          planId: { type: 'string', required: true },
          operationId: { type: 'string', required: true },
          snapshotId: { type: 'string', required: true },
          status: { type: 'string', required: true },
          movedCount: { type: 'integer', required: true },
          samples: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: { source: { type: 'string', required: true }, target: { type: 'string', required: true } },
            },
          },
        },
      },
      render: (_args, value) => TEXT(`归档${value.status === 'succeeded' ? '完成' : value.status}，移动 ${value.movedCount} 个文件。\noperationId=${value.operationId}\nsnapshotId=${value.snapshotId}\n如需撤销，调用 data_steward_rollback 并传 operationId 和 confirm=true。`),
    },
    async execute(args) {
      const result = await service.organize(args.rootId, args.planId, args.confirm) as {
        planId: string
        operationId: string
        snapshotId: string
        status: string
        movedCount: number
        samples: Array<{ source: string; target: string }>
      }
      return {
        planId: result.planId, operationId: result.operationId, snapshotId: result.snapshotId,
        status: result.status, movedCount: result.movedCount,
        samples: result.samples.map(({ source, target }) => ({ source, target })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_steward_snapshot_create',
    description: '为某个相对路径创建手动快照。优先使用硬链接，失败时复制。',
    parameters: {
      rootId: { type: 'string', required: true },
      path: { type: 'string', description: '相对根目录的路径，默认 "."' },
      label: { type: 'string', description: '快照说明' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          snapshotId: { type: 'string', required: true },
          createdAt: { type: 'string', required: true },
          label: { type: 'string', required: true },
          path: { type: 'string', required: true },
          fileCount: { type: 'integer', required: true },
          totalBytes: { type: 'integer', required: true },
          hardLinkCount: { type: 'integer', required: true },
          copyCount: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => TEXT(`已创建快照 ${value.snapshotId}：${value.fileCount} 个文件，${formatBytes(value.totalBytes)}（硬链接 ${value.hardLinkCount}，复制 ${value.copyCount}）。`),
    },
    async execute(args) {
      const result = await service.snapshotCreate(args.rootId, args.path ?? '.', args.label ?? '') as {
        snapshotId: string
        createdAt: string
        label: string
        path: string
        fileCount: number
        totalBytes: number
        hardLinkCount: number
        copyCount: number
      }
      return {
        snapshotId: result.snapshotId, createdAt: result.createdAt, label: result.label, path: result.path,
        fileCount: result.fileCount, totalBytes: result.totalBytes, hardLinkCount: result.hardLinkCount, copyCount: result.copyCount,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_steward_snapshot_list',
    description: '列出某个数据根目录的快照和操作快照。',
    parameters: { rootId: { type: 'string', required: true } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          snapshots: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                snapshotId: { type: 'string', required: true },
                createdAt: { type: 'string', required: true },
                kind: { type: 'string', required: true, enum: ['manual', 'operation'] },
                label: { type: 'string', required: true },
                operationId: { type: 'string' },
                fileCount: { type: 'integer', required: true },
                totalBytes: { type: 'integer', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => TEXT(value.snapshots.length === 0 ? '没有快照。' : value.snapshots.map(snapshot => `${snapshot.snapshotId} ${snapshot.kind} ${snapshot.label} (${snapshot.fileCount} 个文件, ${formatBytes(snapshot.totalBytes)})`).join('\n')),
    },
    async execute(args) {
      const listed = await service.snapshotList(args.rootId)
      return {
        snapshots: listed.snapshots.map(snapshot => ({
          snapshotId: snapshot.snapshotId, createdAt: snapshot.createdAt, kind: snapshot.kind,
          label: snapshot.label, ...(snapshot.operationId === undefined ? {} : { operationId: snapshot.operationId }),
          fileCount: snapshot.fileCount, totalBytes: snapshot.totalBytes,
        })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_steward_rollback',
    description: '按 operationId 或 snapshotId 回滚。会先做冲突检查；发现原路径被占用或内容被修改时整体中止。必须得到用户明确确认后传 confirm=true。',
    parameters: {
      rootId: { type: 'string', required: true },
      operationId: { type: 'string' },
      snapshotId: { type: 'string' },
      confirm: { type: 'boolean', required: true, description: '必须严格为 true' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          snapshotId: { type: 'string', required: true },
          operationId: { type: 'string' },
          restoredCount: { type: 'integer', required: true },
          keptCount: { type: 'integer', required: true },
          removedTargetCount: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => TEXT(`回滚完成：恢复 ${value.restoredCount} 个，保留 ${value.keptCount} 个，移除目标 ${value.removedTargetCount} 个。snapshotId=${value.snapshotId}${value.operationId === undefined ? '' : `，operationId=${value.operationId}`}`),
    },
    async execute(args) {
      const result = await service.rollback(args.rootId, {
        operationId: args.operationId, snapshotId: args.snapshotId, confirm: args.confirm,
      }) as {
        status: string
        snapshotId: string
        operationId?: string
        restoredCount: number
        keptCount: number
        removedTargetCount: number
      }
      return {
        status: result.status, snapshotId: result.snapshotId,
        ...(result.operationId === undefined ? {} : { operationId: result.operationId }),
        restoredCount: result.restoredCount, keptCount: result.keptCount, removedTargetCount: result.removedTargetCount,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'data_steward_file_op',
    description: '执行单文件/目录操作：mkdir、rename、move、copy、delete（移到回收站）、restore（从回收站恢复）。删除和移动会创建快照或回收站记录，不覆盖已有文件。',
    parameters: {
      rootId: { type: 'string', required: true },
      op: { type: 'string', required: true, enum: ['mkdir', 'rename', 'move', 'copy', 'delete', 'restore'] },
      path: { type: 'string', description: '源路径或待创建/删除的路径' },
      targetPath: { type: 'string', description: 'rename/move/copy 的目标路径' },
      trashId: { type: 'string', description: 'restore 使用的回收站 id' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          rootId: { type: 'string', required: true },
          op: { type: 'string', required: true },
          status: { type: 'string', required: true },
          path: { type: 'string' },
          target: { type: 'string' },
          trashId: { type: 'string' },
        },
      },
      render: (_args, value) => TEXT(`${value.op} ${value.status}${value.path === undefined ? '' : `：${value.path}`}${value.target === undefined ? '' : ` -> ${value.target}`}${value.trashId === undefined ? '' : `（回收站 ${value.trashId}）`}`),
    },
    async execute(args) {
      const result = await service.fileOp(args.rootId, {
        op: args.op,
        ...(args.path === undefined ? {} : { path: args.path }),
        ...(args.targetPath === undefined ? {} : { targetPath: args.targetPath }),
        ...(args.trashId === undefined ? {} : { trashId: args.trashId }),
      }) as { rootId: string; op: string; status: string; path?: string; source?: string; target?: string; trashId?: string }
      return {
        rootId: result.rootId, op: result.op, status: result.status,
        ...(result.path === undefined ? {} : { path: result.path }),
        ...(result.source === undefined ? {} : { path: result.source }),
        ...(result.target === undefined ? {} : { target: result.target }),
        ...(result.trashId === undefined ? {} : { trashId: result.trashId }),
      }
    },
  }))
}
