<script setup lang="ts">
import { computed } from 'vue'
import { Check, CheckCircle2, Crosshair, Minus, X } from '@lucide/vue'
import type { ContactReport, ContactVerdict } from '@/shared/document'

const props = defineProps<{ report: ContactReport }>()

const verdictLabel: Record<ContactVerdict, string> = {
  selected: '胜出接触',
  'eligible-lost': '合格 · 同刻未胜出',
  'side-graze': '侧边擦过',
  'out-of-reach': '超出触及半径',
  'bad-angle': '朝向条件不符',
  unreachable: '间距与朝向均不符',
  'outside-lane': '偏离坡道通道',
  'behind-source': '位于坡道后方',
}

const winner = computed(() => props.report.candidates.find(item => item.selected) ?? null)
const otherContacts = computed(() =>
  props.report.otherContactIds
    .map(id => props.report.candidates.find(item => item.pieceId === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item)),
)

function markClass(value: boolean | null) {
  return value === null ? 'na' : value ? 'pass' : 'fail'
}
</script>

<template>
  <div class="contact-evidence" data-testid="contact-evidence" :data-rule="report.rule"
    :data-winner-id="report.winnerId" :data-evidence-schema="report.schemaVersion">
    <p class="evidence-summary" data-testid="evidence-summary">{{ report.summary }}</p>

    <div class="evidence-ruleline">
      <template v-if="report.rule === 'fall-cone'">
        <span><Crosshair :size="11" />触及半径 <b class="mono">R {{ report.reach?.toFixed(2) }}m</b></span>
        <span>朝向条件 <b class="mono">夹角 &lt; {{ report.angleLimit }}°</b></span>
      </template>
      <template v-else>
        <span><Crosshair :size="11" />坡道前方传递</span>
        <span>横向通道 <b class="mono">|Δy| &lt; {{ report.laneLimit?.toFixed(1) }}</b></span>
      </template>
    </div>

    <div v-if="winner" class="evidence-winner" data-testid="contact-winner" :data-piece-id="winner.pieceId">
      <CheckCircle2 :size="13" />
      <span><strong>{{ winner.label }}</strong>（{{ winner.pieceId }}）胜出 ·
        实际间距 <b class="mono">{{ winner.distance.toFixed(2) }}m</b> ·
        朝向夹角 <b class="mono">{{ winner.alignment.toFixed(1) }}°</b></span>
    </div>

    <div v-if="otherContacts.length" class="evidence-other" data-testid="other-contacts">
      <div class="evidence-group-title">同刻未胜出的其他接触（{{ otherContacts.length }}）</div>
      <div v-for="candidate in otherContacts" :key="`other-${candidate.pieceId}`" class="other-chip"
        :class="[candidate.reasonCode, { graze: candidate.graze }]" data-testid="other-contact"
        :data-piece-id="candidate.pieceId" :data-verdict="candidate.reasonCode">
        <span class="other-name">{{ candidate.label }}<i>{{ candidate.pieceId }}</i></span>
        <span class="other-metric mono">{{ candidate.distance.toFixed(2) }}m · {{ candidate.alignment.toFixed(0) }}°</span>
        <span class="other-verdict">{{ verdictLabel[candidate.reasonCode] }}</span>
      </div>
    </div>

    <div class="evidence-group-title">
      它尝试触碰的邻牌 · 实际间距 / 朝向条件（{{ report.candidates.length }}）
    </div>
    <p v-if="!report.candidates.length" class="evidence-empty">判定瞬间已没有其他未倒下的邻牌。</p>

    <div class="candidate-list" data-testid="candidate-list">
      <article v-for="candidate in report.candidates" :key="candidate.pieceId" class="candidate-card"
        :class="[candidate.reasonCode, { selected: candidate.selected, graze: candidate.graze }]"
        data-testid="contact-candidate" :data-piece-id="candidate.pieceId"
        :data-verdict="candidate.reasonCode" :data-selected="candidate.selected"
        :data-distance="candidate.distance" :data-alignment="candidate.alignment">
        <div class="candidate-headline">
          <span class="candidate-name">{{ candidate.label }}<i class="mono">{{ candidate.pieceId }}</i></span>
          <span class="verdict-tag">{{ verdictLabel[candidate.reasonCode] }}</span>
        </div>

        <div v-if="report.rule === 'fall-cone'" class="candidate-metrics">
          <span :class="['metric', markClass(candidate.distancePassed)]" data-testid="metric-distance">
            实际间距 <b class="mono">{{ candidate.distance.toFixed(2) }}m</b>
            <em class="mono">/ R{{ candidate.reach?.toFixed(2) }}</em>
            <Check v-if="candidate.distancePassed === true" :size="11" />
            <X v-else-if="candidate.distancePassed === false" :size="11" />
            <Minus v-else :size="11" />
          </span>
          <span :class="['metric', markClass(candidate.orientationPassed)]" data-testid="metric-alignment">
            朝向条件 <b class="mono">{{ candidate.alignment.toFixed(1) }}°</b>
            <em class="mono">/ &lt;{{ candidate.angleLimit }}°</em>
            <Check v-if="candidate.orientationPassed === true" :size="11" />
            <X v-else-if="candidate.orientationPassed === false" :size="11" />
            <Minus v-else :size="11" />
          </span>
        </div>

        <div v-else class="candidate-metrics">
          <span :class="['metric', markClass(candidate.aheadPassed)]">
            前方传递
            <Check v-if="candidate.aheadPassed === true" :size="11" />
            <X v-else-if="candidate.aheadPassed === false" :size="11" />
          </span>
          <span :class="['metric', markClass(candidate.lanePassed)]">
            横向通道 |Δy| &lt; {{ report.laneLimit?.toFixed(1) }}
            <Check v-if="candidate.lanePassed === true" :size="11" />
            <X v-else-if="candidate.lanePassed === false" :size="11" />
          </span>
        </div>

        <p class="candidate-reason">{{ candidate.reason }}</p>
      </article>
    </div>
  </div>
</template>
