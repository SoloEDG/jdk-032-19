import type { ContactReport, SimulationEvent, SimulationRun } from '@/shared/document'

/**
 * 旧运行归档的兼容边界。
 *
 * 原则：新增的取证字段只能“附带”，绝不能覆盖历史事件自带的
 * detail / interruptionReason。归一化只补结构默认值，不按当前构筑
 * 重算碰撞、不改写任何历史说明。
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number | null = null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** 读取事件上的碰撞取证快照，兼容历史字段命名；没有时返回 null（绝不现算）。 */
export function getEventReport(event: SimulationEvent | null | undefined): ContactReport | null {
  if (!event) return null
  const report = event.contactReport ?? event.collision ?? null
  if (!report || typeof report !== 'object') return null
  const record = report as ContactReport
  if (!Array.isArray(record.candidates)) return null
  return record
}

/** 历史运行（evidenceVersion 缺失/为 0，且事件上没有取证快照）。 */
export function isLegacyRun(run: SimulationRun | null | undefined): boolean {
  if (!run) return false
  if (typeof run.evidenceVersion === 'number' && run.evidenceVersion > 0) return false
  return !run.events.some(event => getEventReport(event) !== null)
}

function normalizeEvent(value: unknown, index: number): SimulationEvent | null {
  const raw = asRecord(value)
  if (!raw) return null
  const kind = raw.kind === 'trigger' || raw.kind === 'fall' || raw.kind === 'mechanism' || raw.kind === 'interrupted'
    ? raw.kind
    : 'fall'
  // 注意：detail 原样保留，缺失时给空串，绝不根据新取证重新生成。
  const event: SimulationEvent = {
    id: asString(raw.id, `restored-event-${index + 1}`),
    pieceId: asString(raw.pieceId),
    time: asNumber(raw.time, 0) ?? 0,
    causeId: typeof raw.causeId === 'string' ? raw.causeId : null,
    kind,
    detail: asString(raw.detail, ''),
  }
  const report = getEventReport(raw as unknown as SimulationEvent)
  if (report) {
    event.contactReport = report
    event.collision = report
    event.contacts = report.candidates
    event.evidenceVersion = 1
  } else if (typeof raw.evidenceVersion === 'number') {
    event.evidenceVersion = raw.evidenceVersion
  }
  return event
}

/**
 * 把 localStorage / 外部 JSON 中的运行恢复成 SimulationRun。
 * 无法识别时返回 null。该函数不接触当前 document，因此不可能用新构筑
 * 的几何结果改写旧回放的解释。
 */
export function normalizeSimulationRun(input: unknown): SimulationRun | null {
  const raw = asRecord(input)
  if (!raw || !Array.isArray(raw.events)) return null

  const events = raw.events
    .map((event, index) => normalizeEvent(event, index))
    .filter((event): event is SimulationEvent => event !== null)

  const embeddedReports = events
    .map(event => getEventReport(event))
    .filter((report): report is ContactReport => report !== null)

  const rawReports = Array.isArray(raw.contactReports)
    ? raw.contactReports
    : Array.isArray(raw.collisions) ? raw.collisions : null
  const contactReports: ContactReport[] = rawReports
    ? rawReports.filter((item): item is ContactReport => getEventReport({ contactReport: item } as SimulationEvent) !== null)
    : embeddedReports

  const explicitEvidence = asNumber(raw.evidenceVersion, null)
  const evidenceVersion = explicitEvidence ?? (embeddedReports.length ? 1 : 0)
  const legacy = evidenceVersion < 1 && embeddedReports.length === 0

  const run: SimulationRun = {
    id: asString(raw.id, `restored-run-${Date.now()}`),
    documentId: asString(raw.documentId),
    revision: asNumber(raw.revision, 0) ?? 0,
    startedAt: asNumber(raw.startedAt, 0) ?? 0,
    startPieceId: asString(raw.startPieceId),
    status: raw.status === 'complete' || raw.status === 'interrupted' || raw.status === 'empty'
      ? raw.status
      : events.length ? 'interrupted' : 'empty',
    events,
    interruptedPieceId: typeof raw.interruptedPieceId === 'string' ? raw.interruptedPieceId : null,
    // 历史中断原因逐字保留；缺失或损坏时为 null，由界面决定回落文案，绝不重新生成。
    interruptionReason: typeof raw.interruptionReason === 'string' ? raw.interruptionReason : null,
    duration: asNumber(raw.duration, events.at(-1)?.time ?? 0) ?? 0,
    schemaVersion: asNumber(raw.schemaVersion, 0) ?? 0,
    evidenceVersion,
    contactReports,
    collisions: contactReports,
    legacy,
  }
  return run
}

// —— 语义化兼容别名 ——
export const migrateSimulationRun = normalizeSimulationRun
export const restoreSimulationRun = normalizeSimulationRun
export const parseSimulationRun = normalizeSimulationRun
export const readContactReport = getEventReport
export const readEventEvidence = getEventReport
