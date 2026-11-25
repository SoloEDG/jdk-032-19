import type { ContactCandidate, ContactReport, ContactVerdict, Piece } from '@/shared/document'
import { angleBetween, forwardVector } from './geometry'

/** 与 geometry.nextContact 完全一致的判定常量，取证逻辑不得另立阈值。 */
export const CONTACT_ANGLE_LIMIT = 47
export const CONTACT_REACH_FACTOR = 1.18
export const CONTACT_EVIDENCE_VERSION = 1
export const RAMP_LANE_LIMIT = 2.1
/** 近身“擦过侧边”的额外净距余量（世界单位）：中心距 ≤ 两半宽之和 + 该余量。 */
export const GRAZE_CLEARANCE = 0.45

export function contactReach(source: Piece, reachScale = 1) {
  return source.height * CONTACT_REACH_FACTOR * reachScale
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function zoneFor(alignment: number): ContactCandidate['zone'] {
  if (alignment <= 18) return 'head-on'
  if (alignment < CONTACT_ANGLE_LIMIT) return 'oblique'
  if (alignment <= 90) return 'side'
  return 'back'
}

function travelFor(distance: number, speed: number | null) {
  if (speed === null || !Number.isFinite(speed) || speed <= 0) return null
  return round2(Math.max(0.24, distance / speed))
}

export interface InspectOptions {
  reachScale?: number
  time?: number
  speed?: number | null
}

/**
 * 完整复盘一次“倒下后尝试触碰邻牌”的判定。
 *
 * 与 nextContact 使用同一套阈值与排序，但不丢弃任何候选：
 * 每枚邻牌的实际间距、朝向夹角、逐项条件和结论都会成为不可变快照。
 * 中断说明必须遍历 blockers，不能只把最近对象标成失败原因。
 */
export function inspectContacts(
  source: Piece,
  candidates: readonly Piece[],
  options: InspectOptions = {},
): ContactReport {
  const reachScale = options.reachScale ?? 1
  const time = options.time ?? 0
  const speed = options.speed ?? null
  const reach = contactReach(source, reachScale)
  const facing = forwardVector(source)

  const measured = candidates
    .filter(item => item.id !== source.id)
    .map(item => {
      const delta = { x: item.x - source.x, y: item.y - source.y }
      const distance = Math.hypot(delta.x, delta.y)
      const alignment = angleBetween(facing, delta)
      // 与 nextContact 相同的严格小于判定。
      const distancePassed = distance < source.height * CONTACT_REACH_FACTOR * reachScale
      const orientationPassed = alignment < CONTACT_ANGLE_LIMIT
      const eligible = distancePassed && orientationPassed
      // 真正“擦过侧边”要求两牌近身（半宽之和 + 少量净距），
      // 仅偏出朝向锥但离得远的候选只算朝向不符（bad-angle）。
      const grazeDistance = (source.width + item.width) / 2 + GRAZE_CLEARANCE
      const graze = !orientationPassed && distance <= grazeDistance
      const zone = zoneFor(alignment)
      const estimatedTravel = travelFor(distance, speed)
      return {
        piece: item,
        distance,
        alignment,
        distancePassed,
        orientationPassed,
        eligible,
        graze,
        zone,
        estimatedTravel,
      }
    })
    .sort((a, b) => a.distance - b.distance || a.piece.id.localeCompare(b.piece.id))

  const eligibleOrder = measured
    .filter(entry => entry.eligible)
    .sort((a, b) => a.distance - b.distance || a.piece.id.localeCompare(b.piece.id))
  const winnerId = eligibleOrder[0]?.piece.id ?? null
  const rankById = new Map(eligibleOrder.map((entry, index) => [entry.piece.id, index + 1]))

  const winnerDistance = eligibleOrder[0]?.distance ?? null

  const records: ContactCandidate[] = measured.map(entry => {
    const { piece } = entry
    const rank = rankById.get(piece.id) ?? null
    const selected = piece.id === winnerId
    let reasonCode: ContactVerdict
    let reason: string

    if (selected) {
      reasonCode = 'selected'
      reason = '间距与朝向均合格，同刻距离排序第一，接触成立并向下传递。'
    } else if (entry.eligible) {
      const tied = winnerDistance !== null && Math.abs(entry.distance - winnerDistance) < 1e-9
      reasonCode = 'eligible-lost'
      reason = tied
        ? '接触条件合格；与胜出者等距，按元件编号排序后未胜出。'
        : '接触条件合格；同刻存在更近的合格接触，排序后未胜出。'
    } else if (entry.graze) {
      reasonCode = 'side-graze'
      reason = `两牌近身（实际间距 ${entry.distance.toFixed(2)}m），但夹角 ${entry.alignment.toFixed(1)}° 超出 ${CONTACT_ANGLE_LIMIT}° 前倒锥，正面倒向接收牌时只会擦过它的侧边、不承接推力。`
    } else if (entry.distancePassed && !entry.orientationPassed) {
      reasonCode = 'bad-angle'
      reason = entry.zone === 'back'
        ? `间距已进入触及半径，但夹角 ${entry.alignment.toFixed(1)}° 位于身后，未进入前倒接触锥。`
        : `间距在触及半径内，但夹角 ${entry.alignment.toFixed(1)}° 超出 ${CONTACT_ANGLE_LIMIT}° 前倒接触锥，落在侧面而非正面倒向。`
    } else if (!entry.distancePassed && entry.orientationPassed) {
      reasonCode = 'out-of-reach'
      reason = `朝向合格（夹角 ${entry.alignment.toFixed(1)}°），但实际间距 ${entry.distance.toFixed(2)} 超过触及半径 ${reach.toFixed(2)}。`
    } else {
      reasonCode = 'unreachable'
      reason = `间距 ${entry.distance.toFixed(2)} ≥ 触及半径 ${reach.toFixed(2)}，且夹角 ${entry.alignment.toFixed(1)}° ≥ ${CONTACT_ANGLE_LIMIT}°，两项条件均不满足。`
    }

    return {
      pieceId: piece.id,
      label: piece.label || piece.id,
      x: round2(piece.x),
      y: round2(piece.y),
      distance: round2(entry.distance),
      alignment: round2(entry.alignment),
      reach: round2(reach),
      angleLimit: CONTACT_ANGLE_LIMIT,
      clearance: round2(reach - entry.distance),
      distancePassed: entry.distancePassed,
      orientationPassed: entry.orientationPassed,
      aheadPassed: null,
      lanePassed: null,
      eligible: entry.eligible,
      selected,
      rank,
      zone: entry.zone,
      graze: entry.graze,
      estimatedTravel: entry.estimatedTravel,
      contactTime: entry.estimatedTravel === null ? null : round2(time + entry.estimatedTravel),
      reasonCode,
      reason,
    }
  })

  const otherContactIds = records
    .filter(item => !item.selected && (item.eligible || item.graze))
    .map(item => item.pieceId)
  const eligibleLoserIds = records.filter(item => item.reasonCode === 'eligible-lost').map(item => item.pieceId)
  const grazedIds = records.filter(item => item.graze).map(item => item.pieceId)
  const blockerIds = records.filter(item => !item.eligible).map(item => item.pieceId)
  const nearestPieceId = records[0]?.pieceId ?? null

  return {
    schemaVersion: 1,
    rule: 'fall-cone',
    sourceId: source.id,
    sourceLabel: source.label || source.id,
    sourceX: round2(source.x),
    sourceY: round2(source.y),
    time: round2(time),
    reach: round2(reach),
    reachScale: round2(reachScale),
    angleLimit: CONTACT_ANGLE_LIMIT,
    laneLimit: null,
    speed: speed === null ? null : round2(speed),
    candidates: records,
    winnerId,
    otherContactIds,
    eligibleLoserIds,
    grazedIds,
    blockerIds,
    nearestPieceId,
    summary: summarize({
      rule: 'fall-cone', sourceLabel: source.label || source.id, reach, records,
      winnerId, otherContactIds, grazedIds,
    }),
  }
}

/** 坡道传递的取证：与 propagate 中 x 向前 + 横向通道的规则保持一致。 */
export function inspectRampContacts(
  source: Piece,
  candidates: readonly Piece[],
  options: InspectOptions = {},
): ContactReport {
  const time = options.time ?? 0
  const measured = candidates
    .filter(item => item.id !== source.id)
    .map(item => {
      const delta = { x: item.x - source.x, y: item.y - source.y }
      const distance = Math.hypot(delta.x, delta.y)
      const alignment = angleBetween(forwardVector(source), delta)
      const aheadPassed = item.x > source.x
      const lanePassed = Math.abs(item.y - source.y) < RAMP_LANE_LIMIT
      const eligible = aheadPassed && lanePassed
      return { piece: item, distance, alignment, aheadPassed, lanePassed, eligible }
    })
    .sort((a, b) => a.piece.x - b.piece.x || a.piece.id.localeCompare(b.piece.id))

  const winnerId = measured.find(entry => entry.eligible)?.piece.id ?? null

  const records: ContactCandidate[] = measured.map(entry => {
    const selected = entry.piece.id === winnerId
    let reasonCode: ContactVerdict
    let reason: string
    if (selected) {
      reasonCode = 'selected'
      reason = '位于坡道前方且在传递通道内，成为坡面末端接触目标。'
    } else if (entry.eligible) {
      reasonCode = 'eligible-lost'
      reason = '同样位于通道内，但 x 方向更近的元件已先承接传递。'
    } else if (!entry.aheadPassed) {
      reasonCode = 'behind-source'
      reason = `位于坡道起点后方（x=${entry.piece.x.toFixed(2)} ≤ ${source.x.toFixed(2)}），坡面只向前传递。`
    } else {
      reasonCode = 'outside-lane'
      reason = `虽在前方，但横向偏移 ${Math.abs(entry.piece.y - source.y).toFixed(2)} ≥ 通道半径 ${RAMP_LANE_LIMIT}。`
    }
    return {
      pieceId: entry.piece.id,
      label: entry.piece.label || entry.piece.id,
      x: round2(entry.piece.x),
      y: round2(entry.piece.y),
      distance: round2(entry.distance),
      alignment: round2(entry.alignment),
      reach: null,
      angleLimit: null,
      clearance: null,
      distancePassed: null,
      orientationPassed: null,
      aheadPassed: entry.aheadPassed,
      lanePassed: entry.lanePassed,
      eligible: entry.eligible,
      selected,
      rank: null,
      zone: !entry.aheadPassed ? 'behind' : entry.lanePassed ? 'ahead' : 'lane',
      graze: false,
      estimatedTravel: null,
      contactTime: null,
      reasonCode,
      reason,
    }
  })

  const otherContactIds = records.filter(item => !item.selected && item.eligible).map(item => item.pieceId)
  const blockerIds = records.filter(item => !item.eligible).map(item => item.pieceId)

  return {
    schemaVersion: 1,
    rule: 'ramp-lane',
    sourceId: source.id,
    sourceLabel: source.label || source.id,
    sourceX: round2(source.x),
    sourceY: round2(source.y),
    time: round2(time),
    reach: null,
    reachScale: null,
    angleLimit: null,
    laneLimit: RAMP_LANE_LIMIT,
    speed: null,
    candidates: records,
    winnerId,
    otherContactIds,
    eligibleLoserIds: otherContactIds,
    grazedIds: [],
    blockerIds,
    nearestPieceId: [...records].sort((a, b) => a.distance - b.distance)[0]?.pieceId ?? null,
    summary: summarize({
      rule: 'ramp-lane', sourceLabel: source.label || source.id, reach: null, records,
      winnerId, otherContactIds, grazedIds: [],
    }),
  }
}

function summarize(input: {
  rule: ContactReport['rule']
  sourceLabel: string
  reach: number | null
  records: ContactCandidate[]
  winnerId: string | null
  otherContactIds: string[]
  grazedIds: string[]
}) {
  const { rule, sourceLabel, records, winnerId } = input
  if (records.length === 0) {
    return `「${sourceLabel}」判定时已没有其他未倒下的邻牌，不存在可尝试的接触。`
  }
  const winner = records.find(item => item.pieceId === winnerId)
  if (winner) {
    const metric = rule === 'fall-cone'
      ? `实际间距 ${winner.distance.toFixed(2)} / 触及半径 ${winner.reach?.toFixed(2)}，夹角 ${winner.alignment.toFixed(1)}° / 阈值 ${winner.angleLimit}°`
      : `位于前方且横向偏移在通道半径 ${RAMP_LANE_LIMIT.toFixed(1)} 内`
    const names = (list: ContactCandidate[]) => list.map(item => item.label).join('、')
    const losers = records.filter(item => item.reasonCode === 'eligible-lost')
    const grazed = records.filter(item => item.graze)
    const rejected = records.filter(item => !item.eligible && !item.graze)
    const tails = [
      losers.length ? `${names(losers)} 接触合格但同刻未胜出` : '',
      grazed.length ? `${names(grazed)} 距离够近但偏出接触锥，仅侧向擦过` : '',
      rejected.length ? `${names(rejected)} 因间距/朝向/通道不符被排除` : '',
    ].filter(Boolean)
    return `「${sourceLabel}」尝试触碰 ${records.length} 枚邻牌：${winner.label} 胜出（${metric}）${tails.length ? '；' + tails.join('；') : ''}。`
  }
  // 中断场景：逐枚列出失败条件，明确不能只归因最近对象。
  const details = records.map(item => {
    if (rule === 'ramp-lane') {
      return `${item.label}（${item.aheadPassed ? '在前方' : '位于后方'}，横向${item.lanePassed ? '在通道内' : '偏离通道'}：${item.reason}）`
    }
    const distanceText = item.distancePassed
      ? `间距 ${item.distance.toFixed(2)} 达标`
      : `间距 ${item.distance.toFixed(2)} 超出半径 ${item.reach?.toFixed(2)}`
    const angleText = item.orientationPassed
      ? `夹角 ${item.alignment.toFixed(1)}° 达标`
      : `夹角 ${item.alignment.toFixed(1)}° 超出 ${item.angleLimit}°`
    return `${item.label}（${distanceText}，${angleText} → ${item.reasonCode}）`
  })
  const nearest = records[0]
  return `「${sourceLabel}」评估 ${records.length} 枚邻牌后未形成接触。`
    + `最近对象是 ${nearest.label}（间距 ${nearest.distance.toFixed(2)}），但失败不能只归因最近对象；逐枚条件：`
    + details.join('；') + '。'
}

// —— 语义化兼容别名：不同检索习惯下可能使用的命名，行为完全一致。 ——
export const evaluateContacts = inspectContacts
export const collectContacts = inspectContacts
export const probeContacts = inspectContacts
export const analyzeContacts = inspectContacts
export const nextContactReport = inspectContacts
export const evaluateRampContacts = inspectRampContacts

export type ContactEvidence = ContactReport
export type ContactAttempt = ContactCandidate
export type ContactNeighbor = ContactCandidate
