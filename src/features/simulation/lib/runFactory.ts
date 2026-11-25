import type { DominoDocument, SimulationRun } from '@/shared/document'
import { CONTACT_EVIDENCE_VERSION } from '../../layout/lib/contacts'
import type { PropagationResult } from './propagate'

export const RUN_SCHEMA_VERSION = 1

/**
 * 把传播结果装配成可归档的运行快照。
 * useSimulation 与校验脚本共用这一个入口，保证新运行一定带取证版本号。
 */
export function buildSimulationRun(
  document: DominoDocument,
  result: PropagationResult,
  startedAt: number = Date.now(),
  id?: string,
): SimulationRun {
  const runId = id
    ?? globalThis.crypto?.randomUUID?.()
    ?? `run-${startedAt}-${Math.random().toString(36).slice(2, 10)}`
  return {
    id: runId,
    documentId: document.id,
    revision: document.revision,
    startedAt,
    startPieceId: document.startPieceId,
    status: result.status,
    events: result.events,
    interruptedPieceId: result.interruptedPieceId,
    interruptionReason: result.interruptionReason,
    duration: result.duration,
    schemaVersion: RUN_SCHEMA_VERSION,
    evidenceVersion: CONTACT_EVIDENCE_VERSION,
    contactReports: result.contactReports,
    collisions: result.contactReports,
    legacy: false,
  }
}
