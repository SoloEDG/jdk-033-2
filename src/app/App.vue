<script setup lang="ts">
import { computed } from 'vue'
import {
  Anchor, CheckCircle2, Crosshair, FlaskConical, GitBranch, Pause, Play,
  Plus, RotateCcw, Trash2, Waves, XCircle,
} from 'lucide-vue-next'
import CurrentMap from '../features/current/ui/CurrentMap.vue'
import { useCurrentSurvey } from './useCurrentSurvey'
import { trialForces } from '../features/current/model/trial'
import type { CandidateId } from '../features/current/model/types'

const {
  drifters, selectedDrifterId, selectedDrifter, selectedCandidate, reconstruction,
  holdoutResult, trial, trialStart, draft, pickPurpose, notice, dirty, fixTime, fixX, fixY,
  selectDrifter, armPick, handleMapPick, addDrifterAt, addFix, removeFix, removeDrifter,
  setRole, rebuild, runHoldoutCheck, chooseCandidate, resetTrial, toggleTrial, setHeading,
} = useCurrentSurvey()

const activeReport = computed(() => reconstruction.value.candidates[selectedCandidate.value])
const crossingSegments = computed(() => reconstruction.value.evidence.filter(segment => segment.directCrossesLand))
const forces = computed(() => trialForces(trial.value))
const candidateIds: CandidateId[] = ['eddy', 'channel']
const candidateTitles: Record<CandidateId, string> = {
  eddy: 'A · 北部分水 / 回水',
  channel: 'B · 南槽顺流',
}

function formatBearing(value: number) {
  return `${Math.round(value)}°`
}

function intervalText(drifter: { fixes: { time: number }[] }) {
  const times = drifter.fixes.map(fix => fix.time).sort((a, b) => a - b)
  return times.slice(1).map((time, index) => `${time - times[index]}′`).join(' / ')
}
</script>

<template>
  <main class="survey-shell">
    <header class="masthead">
      <div class="brand">
        <Anchor :size="31" :stroke-width="1.8" />
        <div>
          <h1>漂球测流图</h1>
          <span>DRIFT BUOY CURRENT CHART · 针岬湾</span>
        </div>
      </div>
      <div class="mast-status" data-testid="ambiguity-status" :data-ambiguous="reconstruction.bothFit">
        <GitBranch :size="17" />
        <span v-if="reconstruction.bothFit">两种候选流场均能解释重建采样</span>
        <span v-else>候选流场已按整段校核筛选</span>
      </div>
    </header>

    <section class="workflow-bar">
      <div class="workflow-step"><b>1</b><span>不同位置入水，按真实时刻录入</span></div>
      <div class="workflow-arrow">→</div>
      <div class="workflow-step"><b>2</b><span>沿整段运动校核并保留 A/B 分歧</span></div>
      <div class="workflow-arrow">→</div>
      <div class="workflow-step"><b>3</b><span>封存球检验，或选候选试航</span></div>
      <button class="primary rebuild-button" data-testid="reconstruct-button" type="button" @click="rebuild">
        <Waves :size="16" />整段核对并重建
      </button>
    </section>

    <div class="workspace">
      <section class="map-column">
        <CurrentMap
          :drifters="drifters"
          :reconstruction="reconstruction"
          :candidate="selectedCandidate"
          :holdout="holdoutResult"
          :trial="trial"
          :trial-start="trialStart"
          :draft="draft"
          :pick-purpose="pickPurpose"
          @pick="handleMapPick"
        />
        <div class="map-legend" data-testid="map-legend">
          <span><i class="legend-line evidence"></i>采样段支持流向</span>
          <span><i class="legend-dash eddy"></i>A 预测新球</span>
          <span><i class="legend-dash channel"></i>B 预测新球</span>
          <span><i class="legend-line track"></i>试航航迹</span>
          <span><i class="legend-zone"></i>分歧水域</span>
        </div>
        <p class="notice" role="status" data-testid="notice">{{ notice }}</p>
      </section>

      <aside class="deck" aria-label="测流与试航控制台">
        <section class="card observation-card">
          <div class="card-heading">
            <h2><Crosshair :size="17" />观测录入</h2>
            <button type="button" class="small-button" :aria-pressed="pickPurpose === 'drifter'" data-testid="arm-add-drifter" @click="armPick('drifter')">
              <Plus :size="14" />点图放球
            </button>
          </div>

          <div class="drifter-list" data-testid="drifter-list">
            <div
              v-for="drifter in drifters"
              :key="drifter.id"
              class="drifter-row"
              :class="{ selected: drifter.id === selectedDrifterId }"
            >
              <button type="button" class="drifter-select" @click="selectDrifter(drifter.id)">
                <i :style="{ background: drifter.color }"></i>
                <span class="drifter-id">{{ drifter.id }}</span>
                <span class="drifter-name">{{ drifter.name }}</span>
                <em :data-role="drifter.role">{{ drifter.role === 'train' ? '重建' : '封存检验' }}</em>
              </button>
              <button
                type="button"
                class="icon-delete"
                :title="`删除 ${drifter.id}`"
                :aria-label="`删除 ${drifter.id}`"
                @click="removeDrifter(drifter.id)"
              ><Trash2 :size="14" /></button>
            </div>
          </div>

          <div v-if="selectedDrifter" class="drifter-editor" data-testid="fix-form">
            <div class="editor-title">
              <strong>{{ selectedDrifter.id }} · {{ selectedDrifter.fixes.length }} 个时刻</strong>
              <button type="button" class="text-button" @click="setRole(selectedDrifter.id, selectedDrifter.role === 'train' ? 'holdout' : 'train')">
                设为{{ selectedDrifter.role === 'train' ? '封存检验球' : '参与重建' }}
              </button>
            </div>
            <p class="interval-line" data-testid="interval-line">实际间隔：{{ intervalText(selectedDrifter) || '至少需要两个时刻' }}</p>

            <div class="fix-list">
              <div v-for="fix in [...selectedDrifter.fixes].sort((a, b) => a.time - b.time)" :key="fix.id" class="fix-row">
                <time>{{ fix.time.toFixed(0) }}′</time>
                <span>x {{ Math.round(fix.position.x) }}</span>
                <span>y {{ Math.round(fix.position.y) }}</span>
                <button
                  type="button"
                  :disabled="selectedDrifter.fixes.length <= 1"
                  :aria-label="`删除 ${fix.time} 分钟观测`"
                  @click="removeFix(fix.id)"
                ><XCircle :size="14" /></button>
              </div>
            </div>

            <div class="form-grid">
              <label>观测时刻(分)
                <input v-model.number="fixTime" type="number" min="0" step="1" data-testid="fix-time" />
              </label>
              <label>图上 X
                <input v-model.number="fixX" type="number" min="0" max="960" step="1" data-testid="fix-x" />
              </label>
              <label>图上 Y
                <input v-model.number="fixY" type="number" min="0" max="600" step="1" data-testid="fix-y" />
              </label>
            </div>
            <div class="form-actions">
              <button type="button" class="small-button" :aria-pressed="pickPurpose === 'fix'" @click="armPick('fix')">图上取坐标</button>
              <button type="button" class="primary small" data-testid="add-fix" @click="addFix">录入该时刻位置</button>
            </div>
            <button type="button" class="text-button wide" @click="addDrifterAt(draft)">
              以当前红色准星位置直接放球
            </button>
          </div>
        </section>

        <section class="card reconstruction-card">
          <div class="card-heading">
            <h2><Waves :size="17" />流向支持与候选</h2>
            <span v-if="dirty" class="dirty-pill" data-testid="dirty-warning">待重新核对</span>
          </div>

          <div class="zone-list" data-testid="support-zones">
            <div v-for="zone in reconstruction.zones" :key="zone.id" class="zone-row">
              <div>
                <strong>{{ zone.name }}</strong>
                <small>{{ zone.segments }} 段轨迹 · {{ zone.confidence }}</small>
              </div>
              <output>{{ formatBearing(zone.bearing) }} / {{ zone.speedKnots.toFixed(2) }} kn</output>
            </div>
          </div>

          <div class="candidate-grid">
            <button
              v-for="id in candidateIds"
              :key="id"
              type="button"
              class="candidate-card"
              :class="[id, { selected: selectedCandidate === id, rejected: !reconstruction.candidates[id].fit }]"
              :aria-pressed="selectedCandidate === id"
              :data-testid="`candidate-${id}`"
              @click="chooseCandidate(id)"
            >
              <div class="candidate-title">
                <GitBranch :size="15" />{{ candidateTitles[id] }}
                <CheckCircle2 v-if="reconstruction.candidates[id].fit" class="fit-icon" :size="16" />
                <XCircle v-else class="fit-icon bad" :size="16" />
              </div>
              <p>{{ reconstruction.candidates[id].reason }}</p>
              <div class="metric-line">
                <span>RMSE <b>{{ Number.isFinite(reconstruction.candidates[id].rmsError) ? reconstruction.candidates[id].rmsError.toFixed(1) : '—' }}</b></span>
                <span>最大 <b>{{ reconstruction.candidates[id].maxError.toFixed(1) }}</b></span>
                <span>穿岸 <b>{{ reconstruction.candidates[id].shoreHits }}</b></span>
              </div>
            </button>
          </div>

          <div class="segment-checks" data-testid="segment-checks">
            <div v-for="(check, drifterId) in activeReport.checks" :key="drifterId" class="check-row">
              <strong>{{ drifterId }}</strong>
              <span>{{ check.sampledSteps }} 个积分子步</span>
              <span>最大误差 {{ check.maxError.toFixed(1) }}</span>
              <span :class="{ bad: check.shoreHits > 0 }">穿岸 {{ check.shoreHits }}</span>
            </div>
          </div>
          <p v-if="crossingSegments.length" class="shore-warning" data-testid="crossing-warning">
            有 {{ crossingSegments.length }} 段采样直线穿越岸线；直线只用于估流，不能作为真实轨迹，候选积分已做岸线校核。
          </p>
          <p class="ambiguity-note" data-testid="ambiguity-note">
            <template v-if="reconstruction.bothFit">
              A/B 在琥珀色分歧水域外共用同一流场；分歧区内 A 把新球送入北回水，B 送入南槽。两种可能均保留。
            </template>
            <template v-else>当前采样只支持通过校核的候选；可补测分歧水域或使用封存球检验。</template>
          </p>
        </section>

        <section class="card holdout-card">
          <div class="card-heading">
            <h2><FlaskConical :size="17" />未参与重建的漂球</h2>
            <button class="primary small" type="button" data-testid="holdout-button" @click="runHoldoutCheck">独立检验</button>
          </div>
          <p class="card-copy">D04 为封存球，重建过程不读取它。检验会沿其真实观测时刻逐段积分比较。</p>
          <div v-if="holdoutResult" class="holdout-result" :data-preferred="holdoutResult.preferred" data-testid="holdout-result">
            <p>{{ holdoutResult.message }}</p>
            <div class="metric-line">
              <span>A 最大误差 <b>{{ holdoutResult.reports.eddy.maxError.toFixed(1) }}</b></span>
              <span>B 最大误差 <b>{{ holdoutResult.reports.channel.maxError.toFixed(1) }}</b></span>
            </div>
          </div>
        </section>

        <section class="card trial-card">
          <div class="card-heading">
            <h2><Play :size="17" />候选试航</h2>
            <span class="candidate-pill" :data-candidate="selectedCandidate">{{ candidateTitles[selectedCandidate] }}</span>
          </div>
          <p class="card-copy">海图箭头、船的流压/侧漂分解和白色航迹都由当前选中的同一份流场积分产生。</p>

          <div class="trial-readouts">
            <div><span>流</span><strong>{{ formatBearing(forces.current.bearing) }} · {{ forces.current.knots.toFixed(2) }} kn</strong></div>
            <div><span>侧漂</span><strong :class="{ warning: Math.abs(forces.lateralKnots) > 0.15 }">{{ forces.lateralKnots >= 0 ? '右' : '左' }} {{ Math.abs(forces.lateralKnots).toFixed(2) }} kn</strong></div>
            <div><span>对地航向</span><strong>{{ formatBearing((Math.atan2(forces.groundKnots.x, -forces.groundKnots.y) * 180 / Math.PI + 360) % 360) }}</strong></div>
            <div><span>航程</span><strong>{{ trial.distance.toFixed(0) }} m</strong></div>
          </div>

          <label class="heading-slider">操船航向 <output>{{ Math.round(trial.heading) }}°</output>
            <input
              type="range" min="0" max="359" step="1"
              :value="trial.heading"
              data-testid="heading-slider"
              @input="setHeading(Number(($event.target as HTMLInputElement).value))"
            />
          </label>

          <div class="trial-actions">
            <button class="primary" type="button" data-testid="trial-toggle" @click="toggleTrial">
              <component :is="trial.running ? Pause : Play" :size="16" />
              {{ trial.running ? '暂停试航' : trial.elapsed > 0 ? '继续试航' : '开始试航' }}
            </button>
            <button class="icon-button" type="button" title="重置试航" aria-label="重置试航" data-testid="trial-reset" @click="resetTrial">
              <RotateCcw :size="17" />
            </button>
            <button type="button" class="small-button" :aria-pressed="pickPurpose === 'trial-start'" @click="armPick('trial-start')">
              <Crosshair :size="14" />图上设起点
            </button>
          </div>
          <div class="trial-meta">
            <span>模拟时间 <b data-testid="trial-time">{{ trial.elapsed.toFixed(1) }}′</b></span>
            <span v-if="trial.grounded" class="grounded" data-testid="grounded-warning">岸线阻挡：已沿岸滑动</span>
          </div>
        </section>
      </aside>
    </div>
  </main>
</template>
