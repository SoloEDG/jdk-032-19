import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { DominoDocument, SimulationRun } from '@/shared/document'
import { createDefaultDocument } from '@/shared/defaults'
import { useLayout } from '@/features/layout'
import { useMechanisms } from '@/features/mechanisms'
import { useScene, clampToScene } from '@/features/scene'
import { useSimulation } from '@/features/simulation'
import { useReview, normalizeSimulationRun } from '@/features/replay'

const storageKey = 'chainline-jdk032-project-v1'
const runStorageKey = 'chainline-jdk032-last-run-v1'

function loadProject() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return createDefaultDocument()
    const parsed = JSON.parse(saved) as DominoDocument
    if (!Array.isArray(parsed.pieces) || !Array.isArray(parsed.connections) || !parsed.scene) return createDefaultDocument()
    return parsed
  } catch {
    return createDefaultDocument()
  }
}

/** 恢复上次运行；经归一化保留旧事件的原始说明，绝不按当前构筑补算取证。 */
function loadRun(): SimulationRun | null {
  try {
    const saved = localStorage.getItem(runStorageKey)
    if (!saved) return null
    return normalizeSimulationRun(JSON.parse(saved))
  } catch {
    return null
  }
}

export function useWorkspace() {
  const document = shallowRef<DominoDocument>(loadProject())
  const savedRun = loadRun()
  const saveState = ref<'saved' | 'saving' | 'unsaved'>('saved')
  const focusPieceId = ref<string | null>(null)
  let saveTimer = 0

  function changed() {
    document.value = {
      ...document.value,
      revision: document.value.revision + 1,
      updatedAt: Date.now(),
    }
    saveState.value = 'unsaved'
  }

  const layout = useLayout(document, changed)
  const mechanisms = useMechanisms(document, changed)
  const scene = useScene(document, changed)
  const simulation = useSimulation(document, savedRun)
  const review = useReview(simulation.run)

  watch(document, next => {
    saveState.value = 'saving'
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
        saveState.value = 'saved'
      } catch {
        saveState.value = 'unsaved'
      }
    }, 380)
  })

  // 运行快照（含碰撞取证）单独持久化；旧 JSON 由 normalizeSimulationRun 兜底。
  watch(simulation.run, run => {
    try {
      if (run) localStorage.setItem(runStorageKey, JSON.stringify(run))
      else localStorage.removeItem(runStorageKey)
    } catch {
      /* 存储不可用时仅保留内存态，不影响构筑操作。 */
    }
  }, { immediate: true })

  function place(kind: Parameters<typeof layout.add>[0], x: number, y: number) {
    const piece = { x, y, width: kind === 'ramp' ? 1.7 : 0.42, id: '', kind, label: '', height: 1, angle: 0, facing: 'east' as const, fallThreshold: 0.8, friction: 0.55 }
    const safe = clampToScene(document.value, piece)
    layout.add(kind, safe.x, safe.y)
  }
  function move(id: string, x: number, y: number) {
    const piece = document.value.pieces.find(item => item.id === id)
    if (!piece) return
    const safe = clampToScene(document.value, { ...piece, x, y })
    layout.move(id, safe.x, safe.y)
  }
  function focusEvent(id: string) {
    const event = simulation.run.value?.events.find(item => item.id === id)
    if (!event) return
    focusPieceId.value = event.pieceId
    layout.select(event.pieceId)
    review.focusEvent(id)
  }
  /** 从旧运行回到当前构筑：摘除回放覆盖、停止播放并解除定位焦点，保留旧运行记录。 */
  function backToBuild() {
    review.backToBuild()
    focusPieceId.value = null
    layout.select(null)
  }
  function onKeydown(event: KeyboardEvent) {
    const target = event.target
    if (target instanceof HTMLElement && target.matches('input, select, textarea, button')) return
    if (event.code === 'Space') {
      event.preventDefault()
      review.toggle()
    } else if (event.key === 'Escape') {
      layout.chooseTool(null)
      layout.select(null)
      focusPieceId.value = null
      review.backToBuild()
    } else {
      layout.handleKey(event)
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    window.clearTimeout(saveTimer)
  })

  return {
    document, saveState, focusPieceId, layout, mechanisms, scene, simulation, review,
    place, move, focusEvent, backToBuild,
  }
}
