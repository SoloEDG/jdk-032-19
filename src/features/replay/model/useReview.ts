import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { SimulationRun } from '@/shared/document'
import { previousEvent } from '../lib/eventOrder'

export function useReview(run: Ref<SimulationRun | null>) {
  const time = ref(0)
  const playing = ref(false)
  /**
   * 旧运行是否覆盖到画布。查看旧回放时保持 true；
   * 用户选择“返回当前构筑”后置 false，画布回到实时文档，
   * 旧运行对象与取证快照仍保留在回放面板中。
   */
  const canvasAttached = ref(true)
  let timer = 0
  const events = computed(() => run.value?.events ?? [])
  const currentEvent = computed(() => previousEvent(events.value, time.value))
  const focusPieceId = computed(() => currentEvent.value?.pieceId ?? null)

  function stop() {
    playing.value = false
    if (timer) window.clearInterval(timer)
    timer = 0
  }
  function pause() { stop() }
  function seek(value: number) {
    stop()
    time.value = Math.max(0, Math.min(run.value?.duration ?? 0, value))
  }
  function play() {
    if (!run.value || run.value.duration <= 0 || playing.value) return
    if (time.value >= run.value.duration) time.value = 0
    playing.value = true
    timer = window.setInterval(() => {
      time.value = Math.min(run.value?.duration ?? 0, time.value + 0.04)
      if (time.value >= (run.value?.duration ?? 0)) stop()
    }, 40)
  }
  function toggle() { if (playing.value) pause(); else play() }
  function restart() { seek(0) }

  /** 让旧运行重新覆盖画布（点击事件/定位时自动调用）。 */
  function attachCanvas() { canvasAttached.value = true }

  /** 从旧运行回到当前构筑：停止播放、摘除旧回放覆盖层，但保留运行记录。 */
  function backToBuild() {
    stop()
    time.value = 0
    canvasAttached.value = false
  }
  /** backToBuild 的语义化别名，兼容“退出回看”的调用习惯。 */
  function exitReview() { backToBuild() }

  function focusEvent(eventId: string) {
    canvasAttached.value = true
    const event = events.value.find(item => item.id === eventId)
    if (event) seek(event.time)
  }
  watch(run, () => { time.value = 0; stop(); canvasAttached.value = true })
  onBeforeUnmount(stop)
  return {
    time, playing, events, currentEvent, focusPieceId, canvasAttached,
    seek, play, pause, toggle, restart, focusEvent,
    attachCanvas, backToBuild, exitReview, stop,
  }
}
