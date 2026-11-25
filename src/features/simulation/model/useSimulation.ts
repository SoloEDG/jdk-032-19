import { computed, ref, shallowRef, type Ref } from 'vue'
import type { DominoDocument, SimulationRun } from '@/shared/document'
import { propagate } from '../lib/propagate'
import { buildSimulationRun } from '../lib/runFactory'

export function useSimulation(document: Ref<DominoDocument>, initialRun: SimulationRun | null = null) {
  const run = shallowRef<SimulationRun | null>(initialRun)
  const busy = ref(false)
  const issue = ref('')
  const current = computed(() => run.value)
  const stale = computed(() => Boolean(run.value && run.value.revision !== document.value.revision))

  async function simulate() {
    busy.value = true
    issue.value = ''
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    try {
      const snapshot = structuredClone(document.value)
      const result = propagate(snapshot)
      run.value = buildSimulationRun(snapshot, result)
      if (result.status === 'empty') issue.value = '场景里没有可运行的触发点。'
    } catch {
      issue.value = '场景计算未能完成，请检查元件连接。'
    } finally {
      busy.value = false
    }
  }

  /** 恢复一份旧运行归档（归一化由调用方完成），不会改动当前构筑。 */
  function restore(next: SimulationRun | null) { run.value = next }

  function clear() { run.value = null; issue.value = '' }
  return { run, current, stale, busy, issue, simulate, restore, clear }
}
