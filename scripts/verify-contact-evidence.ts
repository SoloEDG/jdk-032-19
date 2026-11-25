/**
 * 碰撞取证 / 旧回放兼容 / 返回构筑 —— 行为验证脚本。
 *
 * 运行：npx -y tsx scripts/verify-contact-evidence.ts
 *
 * 关键布局（用例 A）：
 *   一枚牌 s 正面倒向接收牌 r（夹角 0°、间距 1.60），
 *   另一枚 g 同时贴在侧边擦过（最近、间距 0.57，但夹角约 74.7°），
 *   再有一枚 c 同样满足接触条件、却因更远而同刻落选。
 */
import assert from 'node:assert/strict'
import { ref } from 'vue'
import type { DominoDocument, Piece, SimulationRun } from '../src/shared/document'
import { propagate } from '../src/features/simulation/lib/propagate'
import { buildSimulationRun } from '../src/features/simulation/lib/runFactory'
import { nextContact } from '../src/features/layout/lib/geometry'
import { inspectContacts } from '../src/features/layout/lib/contacts'
import { normalizeSimulationRun, getEventReport, isLegacyRun } from '../src/features/replay/lib/runArchive'
import { useReview } from '../src/features/replay/model/useReview'
import { createDefaultDocument } from '../src/shared/defaults'

let passed = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    console.error(`  ✗ ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

function domino(id: string, x: number, y: number, angle = 0, label = id): Piece {
  return {
    id, kind: 'domino', x, y, angle, facing: 'east', label,
    height: 1.6, width: 0.42, fallThreshold: 0.8, friction: 0.55,
  }
}
function trigger(id: string, x: number, y: number): Piece {
  return { ...domino(id, x, y, 0, '终点'), kind: 'trigger', height: 0.8, width: 0.7 }
}
function doc(pieces: Piece[], startPieceId: string, revision = 1): DominoDocument {
  return {
    id: 'verify-doc', title: '验证布局', revision, updatedAt: 0,
    pieces, connections: [], scene: { gravity: 9.8, friction: 0.62, width: 21, height: 9, showGrid: false },
    startPieceId,
  }
}
const approx = (actual: number, expected: number, tolerance = 0.02) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} ≈ ${expected} ±${tolerance}`)

// reach = 1.6 * 1.18 * ((0.94 + 0.585*0.35) * (1.25 - 0.8*0.25)) ≈ 2.269
const REACH = 2.269

console.log('\nA. 正面倒向接收牌 + 侧边同时擦过 + 同刻落选接触')
{
  const pieces = [
    domino('s', 4.0, 4.0, 0, '源牌'),
    domino('r', 5.6, 4.0, 0, '接收牌'),       // 1.60m, 0°   -> winner
    domino('g', 4.15, 4.55, 0, '侧边擦过牌'),  // 0.57m, 74.7° -> nearest but graze
    domino('c', 5.85, 4.9, 0, '同刻落选牌'),    // 2.06m, 25.9° -> eligible but lost
    trigger('t', 7.2, 4.0),                    // r -> t, chain completes
  ]
  const document = doc(pieces, 's')
  const result = propagate(document)
  const fall = result.events.find(e => e.pieceId === 's' && e.kind === 'fall')!
  const report = fall.contactReport!
  const byId = Object.fromEntries(report.candidates.map(c => [c.pieceId, c]))

  check('链路完整到达触发器', () => assert.equal(result.status, 'complete'))
  check('胜出者是正面接收牌 r，而不是最近的侧边牌 g', () => {
    assert.equal(report.winnerId, 'r')
    assert.equal(byId.r.selected, true)
    assert.equal(byId.r.zone, 'head-on')
    approx(byId.r.distance, 1.6)
    approx(byId.r.alignment, 0, 0.01)
  })
  check('最近对象确实是侧边牌 g（验证不是靠距离安排出来的）', () => {
    assert.equal(report.nearestPieceId, 'g')
    approx(byId.g.distance, 0.57, 0.01)
    approx(byId.g.alignment, 74.7, 0.2)
  })
  check('g 被识别为侧边擦过：间距达标、朝向不达标、未胜出', () => {
    assert.equal(byId.g.distancePassed, true)
    assert.equal(byId.g.orientationPassed, false)
    assert.equal(byId.g.eligible, false)
    assert.equal(byId.g.selected, false)
    assert.equal(byId.g.graze, true)
    assert.ok(['side-graze', 'bad-angle'].includes(byId.g.reasonCode))
  })
  check('c 是合格但同刻未胜出的其他接触', () => {
    assert.equal(byId.c.eligible, true)
    assert.equal(byId.c.selected, false)
    assert.equal(byId.c.reasonCode, 'eligible-lost')
    assert.deepEqual(report.eligibleLoserIds, ['c'])
  })
  check('otherContactIds 同时包含落选接触 c 与擦过 g', () => {
    assert.ok(report.otherContactIds.includes('c'))
    assert.ok(report.otherContactIds.includes('g'))
  })
  check('取证记录了实际触及半径与朝向阈值', () => {
    approx(report.reach ?? 0, REACH, 0.01)
    assert.equal(report.angleLimit, 47)
    assert.equal(byId.r.reach, report.reach)
  })
  check('摘要逐枚说明，且没有把最近 g 当成失败原因', () => {
    assert.ok(report.summary.includes('接收牌'))
    assert.ok(report.summary.includes('侧边擦过牌'))
    assert.ok(!/最近对象是[\s\S]*失败原因/.test(report.summary) || report.summary.includes('不能只归因最近对象'))
  })
  check('事件别名视图一致（collision / contacts）', () => {
    assert.equal(fall.collision?.winnerId, 'r')
    assert.equal(fall.contacts?.length, report.candidates.length)
    assert.equal(fall.evidenceVersion, 1)
  })
}

console.log('\nB. 中断布局：最近者朝向不符 + 正前者超距，不能只怪最近对象')
{
  const pieces = [
    domino('f', 4.0, 4.0, 0, '失手源牌'),
    domino('n', 4.18, 4.55, 0, '最近但偏侧'), // 0.58m, 71.9° -> 近身 side-graze
    domino('a', 7.0, 4.0, 0, '正面但够不到'), // 3.0m, 0°     -> out-of-reach
  ]
  const result = propagate(doc(pieces, 'f'))
  const interrupted = result.events.find(e => e.kind === 'interrupted')!
  const report = interrupted.contactReport!
  const byId = Object.fromEntries(report.candidates.map(c => [c.pieceId, c]))

  check('定位到中断对象 f', () => assert.equal(result.interruptedPieceId, 'f'))
  check('中断事件也挂着同一份取证', () => assert.ok(interrupted.contactReport))
  check('没有胜出接触', () => assert.equal(report.winnerId, null))
  check('最近对象 n 失败于朝向而非间距，且属近身擦过', () => {
    assert.equal(report.nearestPieceId, 'n')
    assert.equal(byId.n.distancePassed, true)
    assert.equal(byId.n.orientationPassed, false)
    assert.equal(byId.n.graze, true)
    assert.equal(byId.n.reasonCode, 'side-graze')
  })
  check('正面的 a 失败于间距，且同样进入 blocker 列表', () => {
    assert.equal(byId.a.orientationPassed, true)
    assert.equal(byId.a.distancePassed, false)
    assert.equal(byId.a.reasonCode, 'out-of-reach')
  })
  check('blockerIds 同时包含 n 与 a —— 不是只标最近对象', () => {
    assert.equal(report.blockerIds.length, 2)
    assert.ok(report.blockerIds.includes('n'))
    assert.ok(report.blockerIds.includes('a'))
  })
  check('中断摘要逐枚列出 n 与 a 的间距/朝向证据', () => {
    assert.ok(report.summary.includes('最近但偏侧'))
    assert.ok(report.summary.includes('正面但够不到'))
    assert.ok(report.summary.includes('不能只归因最近对象'))
  })
  check('基础中断文案保持原样（历史文案契约）', () => {
    assert.equal(result.interruptionReason, '倒下方向内没有可触达的元件，链路在此停止。')
    assert.equal(interrupted.detail, result.interruptionReason)
  })
}

console.log('\nC. 局部修正后：新回放有新证据，旧运行快照不变')
{
  const v1Pieces = [
    domino('s', 4.0, 4.0, 0, '源牌'),
    domino('r', 5.6, 4.0, 0, '接收牌'),
    domino('g', 4.15, 4.55, 0, '侧边擦过牌'),
    domino('c', 5.85, 4.9, 0, '同刻落选牌'),
    trigger('t', 7.2, 4.0),
  ]
  const run1 = buildSimulationRun(doc(v1Pieces, 's', 7), propagate(doc(v1Pieces, 's', 7)))
  const oldJson = JSON.stringify(run1)

  // 局部修正：把接收牌向外挪到触及半径之外 -> c 变为胜出者
  const v2Pieces = v1Pieces.map(p => p.id === 'r' ? domino('r', 6.4, 4.0, 0, '接收牌') : p)
  const run2 = buildSimulationRun(doc(v2Pieces, 's', 8), propagate(doc(v2Pieces, 's', 8)))

  check('新运行证据显示新的胜出者 c', () => {
    assert.equal(run2.contactReports![0].winnerId, 'c')
    assert.equal(run2.revision, 8)
  })
  check('旧运行对象的证据仍是 r / 旧坐标 5.6 / 旧间距 1.60', () => {
    const oldRestored = normalizeSimulationRun(JSON.parse(oldJson))!
    const oldS = oldRestored.contactReports!.find(r => r.sourceId === 's')!
    assert.equal(oldS.winnerId, 'r')
    assert.equal(oldS.candidates.find(c => c.pieceId === 'r')!.x, 5.6)
    approx(oldS.candidates.find(c => c.pieceId === 'r')!.distance, 1.6)
    assert.equal(oldRestored.revision, 7)
  })
  check('当前构筑里 r 已在 6.4，证明旧证据不是从当前布局算的', () => {
    assert.equal(v2Pieces.find(p => p.id === 'r')!.x, 6.4)
  })
  check('新旧运行 JSON 均可往返且保留取证版本', () => {
    assert.equal(run1.evidenceVersion, 1)
    assert.equal(run2.evidenceVersion, 1)
    assert.equal(normalizeSimulationRun(JSON.parse(JSON.stringify(run2)))!.evidenceVersion, 1)
  })
}

console.log('\nD. 历史运行兼容：新属性不得覆盖历史碰撞说明')
{
  const legacy = {
    id: 'run-legacy',
    documentId: 'old-doc',
    revision: 3,
    startedAt: 0,
    startPieceId: 'd1',
    status: 'interrupted',
    events: [
      { id: 'event-1', pieceId: 'd1', time: 0, causeId: null, kind: 'fall', detail: '受力倒下 · 相邻接触' },
      { id: 'event-2', pieceId: 'd9', time: 0.42, causeId: 'event-1', kind: 'fall', detail: '受力倒下 · 相邻接触' },
      { id: 'event-3', pieceId: 'd9', time: 0.47, causeId: 'event-2', kind: 'interrupted', detail: '旧版中断说明-必须逐字保留' },
    ],
    interruptedPieceId: 'd9',
    interruptionReason: '旧版中断原因-必须逐字保留',
    duration: 0.47,
  } satisfies Partial<SimulationRun>

  const normalized = normalizeSimulationRun(legacy)!
  check('识别为历史运行', () => {
    assert.ok(normalized)
    assert.equal(normalized.evidenceVersion, 0)
    assert.equal(normalized.legacy, true)
    assert.equal(isLegacyRun(normalized), true)
  })
  check('三条事件 detail 逐字未被覆盖/重算', () => {
    assert.equal(normalized.events[0].detail, '受力倒下 · 相邻接触')
    assert.equal(normalized.events[2].detail, '旧版中断说明-必须逐字保留')
  })
  check('interruptionReason 逐字保留', () => {
    assert.equal(normalized.interruptionReason, '旧版中断原因-必须逐字保留')
  })
  check('历史事件取不到取证快照（返回 null，而不是现算）', () => {
    assert.equal(getEventReport(normalized.events[1]), null)
  })
  check('重复归一化幂等，仍不会生成取证', () => {
    const again = normalizeSimulationRun(normalized)!
    assert.equal(getEventReport(again.events[2]), null)
    assert.equal(again.events[2].detail, '旧版中断说明-必须逐字保留')
  })
  check('损坏输入安全返回 null', () => {
    assert.equal(normalizeSimulationRun(null), null)
    assert.equal(normalizeSimulationRun({ foo: 1 }), null)
    assert.equal(normalizeSimulationRun('nope'), null)
  })
}

console.log('\nE. nextContact 与 inspectContacts 胜出者完全一致（随机 + 默认文档）')
{
  let mismatches = 0
  let cases = 0
  let seed = 1234567
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (let i = 0; i < 400; i += 1) {
    const source = domino('src', 2 + rand() * 17, 1 + rand() * 7, Math.floor(rand() * 360))
    const others = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, j) =>
      domino(`p${j}`, 1 + rand() * 19, 0.5 + rand() * 8, Math.floor(rand() * 360)))
    const reachScale = [0.9, 1, 1.15][i % 3]
    const legacyWinner = nextContact(source, others, reachScale)?.id ?? null
    const reportWinner = inspectContacts(source, others, { reachScale }).winnerId
    cases += 1
    if (legacyWinner !== reportWinner) {
      mismatches += 1
      console.error(`    mismatch case ${i}: legacy=${legacyWinner} report=${reportWinner}`)
    }
  }
  check(`400 组随机布局胜出者一致（实际 ${cases} 组）`, () => assert.equal(mismatches, 0))
}

console.log('\nF. 从旧运行返回当前构筑：useReview 状态流')
{
  const run = ref<SimulationRun | null>(null)
  const review = useReview(run)
  check('默认回放覆盖画布', () => assert.equal(review.canvasAttached.value, true))
  check('backToBuild 摘除覆盖并停止播放状态', () => {
    review.backToBuild()
    assert.equal(review.canvasAttached.value, false)
    assert.equal(review.playing.value, false)
  })
  check('attachCanvas / focusEvent 重新挂回旧运行对照', () => {
    review.attachCanvas()
    assert.equal(review.canvasAttached.value, true)
    review.backToBuild()
    review.focusEvent('whatever')
    assert.equal(review.canvasAttached.value, true)
  })
  check('exitReview 是同义动作', () => {
    review.exitReview()
    assert.equal(review.canvasAttached.value, false)
  })
}

console.log('\nG. 内置示例「逆风转角」回归与真实中断取证')
{
  const d = createDefaultDocument()
  const result = propagate(d)
  const sequence = result.events.map(e => `${e.pieceId}:${e.kind}`)
  check('示例场景保持基线结果：下分支 d10 中断（上分支仍到达 t1）', () => {
    assert.equal(result.status, 'interrupted')
    assert.equal(result.interruptedPieceId, 'd10')
  })
  check('倒下/机制/中断事件顺序与原始实现逐字一致', () => {
    assert.deepEqual(sequence, [
      'd1:fall', 'd2:fall', 'd3:fall', 'd4:fall', 'd5:fall',
      'r1:fall', 'd6:fall', 's1:mechanism',
      'd7:fall', 'd9:fall', 'd10:fall', 'd10:interrupted',
      'd8:fall', 't1:mechanism',
    ])
  })
  check('每次空间传递都带取证报告，胜出 id 均为真实元件', () => {
    assert.ok(result.contactReports.length >= 8)
    for (const report of result.contactReports) {
      if (report.winnerId) assert.ok(d.pieces.some(p => p.id === report.winnerId))
    }
  })
  const d10Report = result.events.find(e => e.kind === 'interrupted')!.contactReport!
  check('d10：最近的 d8 是 90° 正侧邻牌而非失败原因（距离不算近身，判朝向不符）', () => {
    assert.equal(d10Report.nearestPieceId, 'd8')
    const d8 = d10Report.candidates.find(c => c.pieceId === 'd8')!
    approx(d8.distance, 1.75)
    approx(d8.alignment, 90, 0.1)
    assert.equal(d8.orientationPassed, false)
    assert.equal(d8.graze, false)
    assert.equal(d8.reasonCode, 'bad-angle')
  })
  check('d10：真正的失手是 t1，间距 2.37>2.27 且夹角 47.56°≥47°，两项均差一点', () => {
    const t1 = d10Report.candidates.find(c => c.pieceId === 't1')!
    approx(t1.distance, 2.37, 0.01)
    approx(t1.alignment, 47.56, 0.05)
    assert.equal(t1.distancePassed, false)
    assert.equal(t1.orientationPassed, false)
    assert.equal(t1.reasonCode, 'unreachable')
    assert.deepEqual(d10Report.blockerIds, ['d8', 't1'])
  })
}

console.log(`\n${process.exitCode ? '有校验失败' : `全部 ${passed} 项断言组通过`}.\n`)
