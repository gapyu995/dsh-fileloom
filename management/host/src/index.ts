/**
 * Data Steward host plugin: one file-domain service behind both the authenticated
 * HTTP API and the model-facing data_steward_* tools.
 * @module @deepseek-ai/dsh-file-manager
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { registerFileManagerApi } from './api.ts'
import { FileManagerService } from './service.ts'
import { registerFileManagerTools } from './tools.ts'

export const name = 'file-manager'

/** Services the plugin needs before it can mount routes and tools. */
export const inject = ['connection', 'tools', 'systemPrompt']

/** Deployment settings. */
export interface Config {
  /** Absolute directories the steward may manage. Empty selects a per-user default. */
  roots?: string[]
  /** Upper bound for one scan; 100..100000. */
  maxScanFiles?: number
  /** How long a classification plan stays valid; 1..720 hours. */
  planTtlHours?: number
  /** Local state for read-only shares; writable roots retain per-root recovery state. */
  stateDirectory?: string
  /** Browse roots without creating or changing files in them. Requires stateDirectory. */
  readOnly?: boolean
  /** Maximum age of a persisted media index before a fresh scan, in seconds. */
  mediaCacheMaxAgeSeconds?: number
}

export const Config: z<Config> = z.object({
  roots: z.array(z.string()).default([]),
  maxScanFiles: z.number().default(20_000),
  planTtlHours: z.number().default(24),
  stateDirectory: z.string().default(''),
  readOnly: z.boolean().default(false),
  mediaCacheMaxAgeSeconds: z.number().default(300),
})

const PROMPT = `你是“数据管家”的文件管理助手。你的所有文件操作都必须通过 data_steward_* 工具完成，并且只能作用于工具返回的 rootId 下的相对路径。

工作顺序：
1. 先调用 data_steward_roots 确认可管理的根目录；如果用户没有指定 rootId，先问清楚。
2. 用 data_steward_scan 建立/刷新索引，再把文件数量、容量和类型摘要告诉用户。
3. 用 data_steward_classify 生成归档计划。分类不会移动文件。
4. 把 planId、移动数量、跳过数量、重名处理和至少几条 source -> target 示例展示给用户。
5. 只有用户明确确认后，才能调用 data_steward_organize，并传 confirm=true。模糊的“可以”“你看着办”不算确认。
6. 执行后报告 operationId 和 snapshotId；如果失败，报告错误中的两个 ID 和自动回滚结果。
7. 回滚同样是破坏性操作。先说明会恢复哪些文件、有哪些冲突，得到明确确认后再调用 data_steward_rollback 并传 confirm=true。
8. 不要编造路径、文件数量或执行结果。不要操作 .data-steward 状态目录，不要跟随符号链接，不要覆盖已有文件。
9. 单文件操作使用 data_steward_file_op；删除只会移到回收站，不会永久删除。

当前数据根：
{{roots}}`

function defaultRoot(): string {
  const configured = process.env.DSH_DATA_STEWARD_ROOT?.trim()
  if (configured !== undefined && configured !== '') return configured
  const home = process.env.DSH_HOME?.trim() || homedir()
  return join(home, 'data-steward')
}

/**
 * Mount the file service, its API, its tools, and the workflow prompt.
 * @param ctx - host plugin context.
 * @param config - deployment roots and limits.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const roots = config.roots !== undefined && config.roots.length > 0 ? config.roots : [defaultRoot()]
  if (!config.readOnly) for (const root of roots) await mkdir(root, { recursive: true })
  const service = await FileManagerService.create({
    roots,
    maxScanFiles: config.maxScanFiles,
    planTtlHours: config.planTtlHours,
    stateDirectory: config.stateDirectory || undefined,
    readOnly: config.readOnly,
    mediaCacheMaxAgeSeconds: config.mediaCacheMaxAgeSeconds,
  })
  registerFileManagerApi(ctx, service)
  registerFileManagerTools(ctx, service)
  ctx.systemPrompt.section({
    name: 'data-steward:workflow',
    order: 2450,
    interpolate: false,
    text: PROMPT.replace('{{roots}}', service.rootsInfo().map(root => `- ${root.name} (${root.id}): ${root.path}`).join('\n')),
  })
  console.info(`[data-steward] ready roots=${service.rootsInfo().length} maxScanFiles=${service.maxScanFiles}`)
}
