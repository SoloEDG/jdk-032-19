<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  AlertTriangle, CheckCircle2, ChevronRight, CircleStop, FastForward,
  PenLine, Pause, Play, RotateCcw, SkipBack, ScanSearch,
} from '@lucide/vue'
import type { SimulationEvent, SimulationRun } from '@/shared/document'
import { formatSeconds } from '@/shared/time'
import { getEventReport, isLegacyRun } from '../lib/runArchive'
import ContactEvidencePanel from './ContactEvidencePanel.vue'

const props = defineProps<{
  run: SimulationRun | null
  events: SimulationEvent[]
  time: number
  playing: boolean
  currentEvent: SimulationEvent | null
  stale: boolean
  canvasAttached?: boolean
  currentRevision?: number
}>()
const emit = defineEmits<{
  toggle: []
  seek: [number]
  restart: []
  event: [string]
  backBuild: []
  attachCanvas: []
}>()

const expandedIds = ref<Set<string>>(new Set())

watch(() => props.run?.id, () => {
  const interrupted = props.run?.events.find(event => event.kind === 'interrupted')
  expandedIds.value = interrupted ? new Set([interrupted.id]) : new Set()
}, { immediate: true })

function isExpanded(id: string) { return expandedIds.value.has(id) }
function toggleExpanded(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}
function onRowClick(event: SimulationEvent) {
  emit('event', event.id)
  toggleExpanded(event.id)
}
function locateInterruption(eventId: string) {
  if (eventId && !expandedIds.value.has(eventId)) toggleExpanded(eventId)
  emit('event', eventId)
}

const iconFor = (kind: SimulationEvent['kind']) => kind === 'interrupted' ? AlertTriangle
  : kind === 'mechanism' ? FastForward : CheckCircle2
</script>

<template>
  <section class="replay-panel" aria-labelledby="replay-title">
    <div class="replay-heading">
      <div class="section-kicker"><span>05 / REVIEW</span><h2 id="replay-title">结果回看</h2></div>
      <div class="replay-heading-side">
        <span v-if="run" class="replay-revision" :class="{ stale }">{{ stale ? '旧版布局' : `R${run.revision}` }}</span>
        <button v-if="run" type="button" class="back-build-button" data-testid="back-to-build"
          title="停止对照旧回放，画布回到当前构筑并继续编辑" @click="emit('backBuild')">
          <PenLine :size="12" /><span>返回当前构筑</span>
        </button>
      </div>
    </div>

    <template v-if="run">
      <div v-if="canvasAttached === false" class="live-build-banner" data-testid="live-build-banner">
        <PenLine :size="13" />
        <span>画布已是<strong>当前构筑{{ currentRevision ? ` R${currentRevision}` : '' }}</strong>，可继续摆放与调整；旧运行和取证仍保留在此。</span>
        <button type="button" data-testid="attach-canvas" @click="emit('attachCanvas')">
          <ScanSearch :size="12" />在画布对照
        </button>
      </div>

      <div class="replay-summary" :class="run.status">
        <div class="summary-symbol"><CircleStop v-if="run.status === 'interrupted'" :size="17" /><CheckCircle2 v-else :size="17" /></div>
        <div>
          <strong>{{ run.status === 'interrupted' ? '找到中断点' : run.status === 'complete' ? '连锁已完成' : '场景暂无元件' }}</strong>
          <!-- 始终渲染运行时保存的原始说明，新取证字段不覆盖它。 -->
          <small data-testid="run-reason">{{ run.interruptionReason ?? '所有触发事件均已记录' }}</small>
        </div>
        <span v-if="isLegacyRun(run)" class="archive-badge" data-testid="legacy-run-badge">历史回放</span>
        <span v-else class="archive-badge evidence" data-testid="evidence-run-badge">碰撞取证 v{{ run.evidenceVersion ?? 1 }}</span>
      </div>
      <div class="replay-controls">
        <button class="replay-icon" aria-label="回到开头" @click="emit('restart')"><SkipBack :size="15" /></button>
        <button class="replay-play" :aria-label="playing ? '暂停回放' : '播放回放'" @click="emit('toggle')">
          <Pause v-if="playing" :size="16" fill="currentColor" /><Play v-else :size="16" fill="currentColor" />
        </button>
        <span class="replay-clock mono">{{ formatSeconds(time) }}</span>
        <input aria-label="回放进度" class="replay-range" type="range" min="0" :max="run.duration || 0.01" step="0.01" :value="time"
          @input="emit('seek', Number(($event.target as HTMLInputElement).value))" />
        <span class="replay-clock mono">{{ formatSeconds(run.duration) }}</span>
      </div>
      <div class="event-list-heading"><span>事件轨迹 · 点击展开碰撞取证</span><span>{{ events.length }} EVENTS</span></div>
      <ol class="event-list">
        <li v-for="event in events" :key="event.id" class="event-item">
          <button type="button" class="event-row"
            :class="{ current: currentEvent?.id === event.id, interrupted: event.kind === 'interrupted', expanded: isExpanded(event.id) }"
            :aria-current="currentEvent?.id === event.id ? 'step' : undefined"
            :aria-expanded="isExpanded(event.id)" :aria-controls="`event-evidence-${event.id}`"
            data-testid="event-row" :data-event-id="event.id"
            @click="onRowClick(event)">
            <ChevronRight :size="12" class="event-chevron" />
            <span class="event-time mono">{{ formatSeconds(event.time) }}</span>
            <span class="event-icon"><component :is="iconFor(event.kind)" :size="14" /></span>
            <span class="event-copy"><strong>{{ run.events.find(item => item.id === event.id)?.pieceId === run.startPieceId ? '启动点' : event.detail.split(' · ')[0] }}</strong><small>{{ event.detail.split(' · ')[1] ?? event.pieceId }}</small></span>
            <span class="evidence-dot" :class="{ off: !getEventReport(event) }" title="含碰撞取证"></span>
            <span v-if="event.kind === 'interrupted'" class="event-flag">中断</span>
            <span class="sr-only">{{ isExpanded(event.id) ? '收起该事件的碰撞取证' : '展开该事件的碰撞取证' }}</span>
          </button>

          <div v-if="isExpanded(event.id)" :id="`event-evidence-${event.id}`" class="event-evidence"
            data-testid="event-evidence" :data-event-id="event.id">
            <p class="event-stored-detail">{{ event.detail }}</p>
            <ContactEvidencePanel v-if="getEventReport(event)" :report="getEventReport(event)!" />
            <div v-else class="evidence-legacy" data-testid="legacy-event-note">
              <AlertTriangle :size="13" />
              <p>这是{{ typeof run.evidenceVersion === 'number' && run.evidenceVersion < 1 ? '更早版本' : '历史' }}生成的回放，未记录邻牌间距与朝向取证。该事件仍按当时场景解释，上方说明保持运行时原文，不会按当前构筑重新推算，也不会被新属性覆盖。</p>
            </div>
          </div>
        </li>
      </ol>
      <div v-if="run.interruptedPieceId" class="interruption-card">
        <span class="interrupt-icon"><AlertTriangle :size="16" /></span>
        <div><strong>中断位置 · {{ run.interruptedPieceId }}</strong>
          <p>{{ run.events.find(event => event.kind === 'interrupted')?.pieceId }} 这一轮没有胜出接触。展开中断事件可查看它尝试触碰的每枚邻牌、实际间距、朝向条件与同刻未胜出的其他接触；不要只按最近对象判断原因。</p>
        </div>
        <button type="button" :aria-label="'展开取证并定位到 ' + run.interruptedPieceId"
          data-testid="interruption-locate"
          @click="locateInterruption(run.events.find(event => event.kind === 'interrupted')?.id ?? '')">取证</button>
      </div>
      <div v-if="stale" class="stale-note" data-testid="stale-note"><RotateCcw :size="13" /> 当前布局已做局部修正；旧回放仍按当时场景解释，结果与取证均为运行时快照、不按新布局重算。重新模拟即可查看新证据。</div>
    </template>
    <div v-else class="replay-empty">
      <div class="empty-orbit"><i></i><i></i><i></i><span></span></div>
      <strong>等待第一次模拟</strong><p>点击「运行模拟」，倒下顺序、中断位置与每次接触的间距/朝向取证会显示在这里。</p>
    </div>
  </section>
</template>
