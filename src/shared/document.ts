export type PieceKind = 'domino' | 'ramp' | 'splitter' | 'trigger'
export type Axis = 'north' | 'east' | 'south' | 'west'

export interface Vec2 { x: number; y: number }

export interface Piece {
  id: string
  kind: PieceKind
  x: number
  y: number
  angle: number
  facing: Axis
  label: string
  height: number
  width: number
  fallThreshold: number
  friction: number
}

export interface MechanismConnection {
  id: string
  from: string
  to: string
  delay: number
  enabled: boolean
}

export interface SceneSettings {
  gravity: number
  friction: number
  width: number
  height: number
  showGrid: boolean
}

export interface DominoDocument {
  id: string
  title: string
  revision: number
  updatedAt: number
  pieces: Piece[]
  connections: MechanismConnection[]
  scene: SceneSettings
  startPieceId: string
}

export interface SimulationEvent {
  id: string
  pieceId: string
  time: number
  causeId: string | null
  kind: 'trigger' | 'fall' | 'mechanism' | 'interrupted'
  detail: string
  /**
   * 碰撞取证快照（v1 新增）。
   * 只在模拟发生时写入，回看旧运行时直接渲染这份快照，
   * 绝不按当前构筑重新推算，也不允许用它覆盖 detail 中的历史说明。
   */
  contactReport?: ContactReport | null
  /** 碰撞取证的兼容别名，与 contactReport 指向同一份快照。 */
  collision?: ContactReport | null
  /** 便捷字段：本次判定评估过的邻牌，等同 contactReport.candidates。 */
  contacts?: ContactCandidate[]
  /** 事件级取证版本；缺失视为 0（历史事件）。 */
  evidenceVersion?: number
}

/** 单枚邻牌在一次接触判定中的结论代码。 */
export type ContactVerdict =
  | 'selected'        // 同刻胜出，成为下一块
  | 'eligible-lost'   // 间距与朝向均合格，但同刻排序未胜出
  | 'side-graze'      // 距离进入触及半径，却偏出前倒接触锥（侧向擦过）
  | 'out-of-reach'    // 朝向合格，实际间距超出触及半径
  | 'bad-angle'       // 间距足够近，但朝向夹角超出锥角
  | 'unreachable'     // 间距与朝向条件均不满足
  | 'outside-lane'    // 坡道：偏离滑行通道
  | 'behind-source'   // 坡道：位于传递起点后方

export type ContactZone = 'head-on' | 'oblique' | 'side' | 'back' | 'ahead' | 'lane' | 'behind'

/** 一枚“它尝试触碰的邻牌”的完整取证数据。 */
export interface ContactCandidate {
  pieceId: string
  label: string
  /** 运行时快照坐标（旧回放按当时场景解释，不读当前构筑坐标）。 */
  x: number
  y: number
  /** 实际中心间距（判定公式使用的同一数值）。 */
  distance: number
  /** 与倒下朝向的夹角（度，0 为正面）。 */
  alignment: number
  /** 本次判定使用的触及半径（世界单位）；坡道规则下为 null。 */
  reach: number | null
  /** 朝向锥阈值（度）；坡道规则下为 null。 */
  angleLimit: number | null
  /** reach - distance，正数表示间距有余量，负数表示差多少。 */
  clearance: number | null
  /** 间距条件是否通过；null 表示该规则不适用（坡道）。 */
  distancePassed: boolean | null
  /** 朝向条件是否通过；null 表示该规则不适用（坡道）。 */
  orientationPassed: boolean | null
  /** 坡道：是否位于起点前方。 */
  aheadPassed: boolean | null
  /** 坡道：横向通道条件是否通过。 */
  lanePassed: boolean | null
  /** 是否满足成为传递目标的全部条件。 */
  eligible: boolean
  /** 是否为同刻胜出的那一枚。 */
  selected: boolean
  /** 合格候选中的距离排序（1 为胜出者），不合格为 null。 */
  rank: number | null
  zone: ContactZone
  /** 是否属于“距离够近但偏出前倒锥”的侧向擦过。 */
  graze: boolean
  /** 按模拟速度估算的接触行程耗时与绝对时刻。 */
  estimatedTravel: number | null
  contactTime: number | null
  reasonCode: ContactVerdict
  /** 该候选自己的失败/胜出说明（运行时生成的快照文案）。 */
  reason: string
}

/** 一次倒下/传递瞬间对全部邻牌的接触判定快照。 */
export interface ContactReport {
  schemaVersion: 1
  rule: 'fall-cone' | 'ramp-lane'
  sourceId: string
  sourceLabel: string
  sourceX: number
  sourceY: number
  time: number
  reach: number | null
  reachScale: number | null
  angleLimit: number | null
  laneLimit: number | null
  speed: number | null
  candidates: ContactCandidate[]
  winnerId: string | null
  /** 同刻未胜出的其他接触：合格落选 + 侧向擦过。 */
  otherContactIds: string[]
  /** 条件合格但距离/编号排序未胜出。 */
  eligibleLoserIds: string[]
  /** 侧向擦过、未进入传递锥。 */
  grazedIds: string[]
  /** 所有未通过条件的邻牌（每枚都带独立原因，不能只取最近对象）。 */
  blockerIds: string[]
  nearestPieceId: string | null
  /** 运行时生成的完整文字说明，逐枚列出间距与朝向。 */
  summary: string
}

export interface SimulationRun {
  id: string
  documentId: string
  revision: number
  startedAt: number
  startPieceId: string
  status: 'complete' | 'interrupted' | 'empty'
  events: SimulationEvent[]
  interruptedPieceId: string | null
  interruptionReason: string | null
  duration: number
  /** 运行归档结构版本；历史运行缺失视为 0。 */
  schemaVersion?: number
  /** 取证版本：0 = 无碰撞取证的旧回放，1 = 含 ContactReport 快照。 */
  evidenceVersion?: number
  /** 本次运行全部接触判定快照（与事件内的 report 相同）。 */
  contactReports?: ContactReport[]
  /** contactReports 的兼容别名。 */
  collisions?: ContactReport[]
  /** 归一化后标记：来自没有取证字段的旧运行。 */
  legacy?: boolean
}
