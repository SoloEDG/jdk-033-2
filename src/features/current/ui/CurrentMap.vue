<script setup lang="ts">
import { computed } from 'vue'
import {
  CHART, DIVERGENCE_ZONE, isWater, linePath, polygonPoints, landPolygons, northCoast, southCoast,
} from '../model/bay'
import { sampleCurrent } from '../model/field'
import { trialForces } from '../model/trial'
import type { CandidateId, Drifter, HoldoutResult, Point, Reconstruction, TrialState } from '../model/types'

const props = defineProps<{
  drifters: Drifter[]
  reconstruction: Reconstruction
  candidate: CandidateId
  holdout: HoldoutResult | null
  trial: TrialState
  trialStart: Point
  draft: Point
  pickPurpose: string
}>()

const emit = defineEmits<{ pick: [point: Point] }>()

const landPoints = landPolygons.map(polygonPoints)
const divergencePath = polygonPoints(DIVERGENCE_ZONE)

const fieldArrows = computed(() => {
  const arrows: { x: number; y: number; bearing: number; opacity: number; speed: number }[] = []
  for (let x = 34; x < CHART.width - 20; x += 62) {
    for (let y = 34; y < CHART.height - 18; y += 56) {
      const p = { x, y }
      if (!isWater(p)) continue
      if (!isWater({ x: x + 15, y }) || !isWater({ x: x - 15, y })
        || !isWater({ x, y: y + 12 }) || !isWater({ x, y: y - 12 })) continue
      const current = sampleCurrent(p, props.candidate)
      arrows.push({ x, y, bearing: current.bearing, speed: current.knots, opacity: 0.18 + Math.min(0.34, current.knots * 0.22) })
    }
  }
  return arrows
})

const sortedFixes = (drifter: Drifter) => [...drifter.fixes].sort((a, b) => a.time - b.time)
const directPath = (drifter: Drifter) => linePath(sortedFixes(drifter).map(f => f.position))
const rebuiltPath = (drifter: Drifter) => {
  const check = props.reconstruction.candidates[props.candidate].checks[drifter.id]
  return check ? linePath(check.points) : ''
}
const holdoutPath = computed(() => props.holdout ? linePath(props.holdout.reports[props.candidate].path) : '')
const trialPath = computed(() => linePath(props.trial.track))
const forces = computed(() => trialForces(props.trial))
const vectorScale = 25
const currentEnd = computed<Point>(() => ({
  x: props.trial.position.x + forces.value.current.vector.x * vectorScale,
  y: props.trial.position.y + forces.value.current.vector.y * vectorScale,
}))
const leewayEnd = computed<Point>(() => ({
  x: props.trial.position.x + forces.value.leewayKnots.x * vectorScale,
  y: props.trial.position.y + forces.value.leewayKnots.y * vectorScale,
}))
const headingEnd = computed<Point>(() => {
  const r = props.trial.heading * Math.PI / 180
  return { x: props.trial.position.x + Math.sin(r) * 48, y: props.trial.position.y - Math.cos(r) * 48 }
})

function previewEnd(id: CandidateId): Point {
  return props.reconstruction.candidates[id].preview.at(-1) ?? { x: 0, y: 0 }
}

function onSvgClick(event: MouseEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  emit('pick', {
    x: (event.clientX - rect.left) / rect.width * CHART.width,
    y: (event.clientY - rect.top) / rect.height * CHART.height,
  })
}
</script>

<template>
  <svg
    class="current-map"
    :class="`pick-${pickPurpose}`"
    :viewBox="`0 0 ${CHART.width} ${CHART.height}`"
    data-testid="current-map"
    role="img"
    aria-label="针岬湾漂球测流海图"
    @click="onSvgClick"
  >
    <defs>
      <pattern id="current-grid" width="48" height="48" patternUnits="userSpaceOnUse">
        <path d="M48 0H0V48" fill="none" stroke="#8fb4b5" stroke-opacity=".2"/>
      </pattern>
      <pattern id="land-hatch-current" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0V10" stroke="#8d805d" stroke-width="1" opacity=".38"/>
      </pattern>
      <marker id="arrow-evidence" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
        <path d="M0 0L8 4.5L0 9Z" fill="#fff0a8"/>
      </marker>
      <marker id="arrow-current" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
        <path d="M0 0L8 4.5L0 9Z" fill="#67e8f9"/>
      </marker>
      <marker id="arrow-leeway" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
        <path d="M0 0L8 4.5L0 9Z" fill="#ff9f43"/>
      </marker>
    </defs>

    <rect :width="CHART.width" :height="CHART.height" fill="#24545a"/>
    <rect :width="CHART.width" :height="CHART.height" fill="url(#current-grid)"/>

    <g class="field-arrows" data-testid="field-arrows" :data-candidate="candidate">
      <g v-for="(arrow, index) in fieldArrows" :key="index" :transform="`translate(${arrow.x} ${arrow.y}) rotate(${arrow.bearing})`" :opacity="arrow.opacity">
        <path d="M0 15V-13M-5 -7L0 -14L5 -7" fill="none" stroke="#c9f3ef" stroke-width="1.5" stroke-linecap="round"/>
      </g>
    </g>

    <g class="land-layer">
      <polygon v-for="(points, index) in landPoints" :key="`land-${index}`" :points="points" fill="#b7ab82" stroke="#efe4bd" stroke-width="2.2" stroke-linejoin="round"/>
      <polygon v-for="(points, index) in landPoints" :key="`hatch-${index}`" :points="points" fill="url(#land-hatch-current)" opacity=".7"/>
      <path :d="linePath(northCoast)" fill="none" stroke="#f6edcf" stroke-width="2.4"/>
      <path :d="linePath(southCoast)" fill="none" stroke="#f6edcf" stroke-width="2.4"/>
    </g>

    <text x="318" y="337" class="bay-label">针 岬 湾</text>
    <text x="824" y="292" class="place-label">湾口</text>
    <text x="392" y="226" class="place-label">北回水</text>
    <text x="462" y="424" class="place-label">南槽</text>
    <text x="205" y="344" class="place-label">西湾</text>

    <polygon :points="divergencePath" class="divergence-zone" data-testid="divergence-zone"/>
    <text x="697" y="315" text-anchor="middle" class="divergence-label">分歧水域</text>

    <path :d="linePath(reconstruction.candidates.eddy.preview)" class="preview-path preview-eddy" data-testid="preview-eddy"/>
    <path :d="linePath(reconstruction.candidates.channel.preview)" class="preview-path preview-channel" data-testid="preview-channel"/>
    <circle :cx="previewEnd('eddy').x" :cy="previewEnd('eddy').y" r="5" fill="#ffb454" stroke="#2b3f40" stroke-width="2"/>
    <circle :cx="previewEnd('channel').x" :cy="previewEnd('channel').y" r="5" fill="#67d7ff" stroke="#2b3f40" stroke-width="2"/>
    <text :x="previewEnd('eddy').x - 8" :y="previewEnd('eddy').y - 10" text-anchor="end" class="preview-label eddy-text">A 北侧</text>
    <text :x="previewEnd('channel').x + 9" :y="previewEnd('channel').y + 18" class="preview-label channel-text">B 南侧</text>

    <g v-for="(segment, index) in reconstruction.evidence" :key="`evidence-${segment.drifterId}-${index}`" :transform="`translate(${segment.midpoint.x} ${segment.midpoint.y}) rotate(${segment.bearing})`" class="evidence-arrow">
      <line x1="0" y1="16" x2="0" y2="-18" stroke="#fff0a8" stroke-width="3.4" stroke-linecap="round" marker-end="url(#arrow-evidence)"/>
    </g>
    <g v-for="(segment, index) in reconstruction.evidence.filter(item => item.directCrossesLand)" :key="`crossing-${index}`" :transform="`translate(${segment.midpoint.x} ${segment.midpoint.y})`" pointer-events="none">
      <circle r="10" fill="none" stroke="#ff5d5d" stroke-width="2.4"/>
      <path d="M-6 -6L6 6M6 -6L-6 6" stroke="#ff5d5d" stroke-width="2"/>
    </g>

    <g v-for="drifter in drifters" :key="drifter.id" class="drifter-layer" :data-drifter="drifter.id">
      <path :d="directPath(drifter)" fill="none" :stroke="drifter.color" stroke-width="1.4" stroke-dasharray="2 7" opacity=".55"/>
      <path v-if="rebuiltPath(drifter)" :d="rebuiltPath(drifter)" fill="none" :stroke="drifter.color" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/>
      <path v-if="drifter.role === 'holdout' && holdoutPath" :d="holdoutPath" fill="none" :stroke="candidate === 'eddy' ? '#ffb454' : '#67d7ff'" stroke-width="2.4" stroke-dasharray="8 6" opacity=".95"/>
      <g v-for="(fix, index) in sortedFixes(drifter)" :key="fix.id">
        <circle :cx="fix.position.x" :cy="fix.position.y" :r="index === 0 ? 8 : 4.8" :fill="drifter.color" stroke="#12383b" stroke-width="2"/>
        <circle v-if="index === 0" :cx="fix.position.x" :cy="fix.position.y" r="12" fill="none" :stroke="drifter.color" stroke-width="1.4" opacity=".8"/>
        <text :x="fix.position.x + 9" :y="fix.position.y - 8" class="fix-label">{{ fix.time }}′</text>
      </g>
      <text :x="sortedFixes(drifter)[0]?.position.x" :y="(sortedFixes(drifter)[0]?.position.y ?? 0) - 20" text-anchor="middle" class="drifter-name" :fill="drifter.color">{{ drifter.id }}</text>
    </g>

    <path :d="trialPath" class="trial-track" data-testid="trial-track"/>
    <g :transform="`translate(${trialStart.x} ${trialStart.y}) rotate(45)`">
      <rect x="-6" y="-6" width="12" height="12" fill="none" stroke="#ffffff" stroke-width="2"/>
    </g>
    <line :x1="trial.position.x" :y1="trial.position.y" :x2="headingEnd.x" :y2="headingEnd.y" stroke="#ffd455" stroke-width="1.8" stroke-dasharray="5 5"/>
    <line data-testid="boat-current-vector" :x1="trial.position.x" :y1="trial.position.y" :x2="currentEnd.x" :y2="currentEnd.y" stroke="#67e8f9" stroke-width="2.5" marker-end="url(#arrow-current)"/>
    <line data-testid="boat-leeway-vector" :x1="trial.position.x" :y1="trial.position.y" :x2="leewayEnd.x" :y2="leewayEnd.y" stroke="#ff9f43" stroke-width="5" stroke-linecap="round" marker-end="url(#arrow-leeway)"/>
    <g :transform="`translate(${trial.position.x} ${trial.position.y}) rotate(${trial.heading})`" class="boat-glyph" data-testid="trial-boat">
      <path d="M0 -17 L9 13 L0 8 L-9 13 Z" fill="#f8f5e6" stroke="#17383b" stroke-width="2"/>
      <line x1="0" y1="-8" x2="0" y2="7" stroke="#31585a" stroke-width="2"/>
    </g>

    <g v-if="pickPurpose !== 'inspect'" :transform="`translate(${draft.x} ${draft.y})`" stroke="#ff5d5d" fill="none" stroke-width="1.8" pointer-events="none">
      <circle r="13"/>
      <path d="M-20 0h9M11 0h9M0-20v9M0 11v9"/>
    </g>

    <g transform="translate(884 54)" stroke="#f1e9cd" fill="none" pointer-events="none">
      <circle r="23" opacity=".5"/>
      <path d="M0 17V-15M-11 0H11M-4-9L0-16 4-9"/>
      <text x="0" y="-29" text-anchor="middle" fill="#f1e9cd" stroke="none" class="depth-label">N</text>
    </g>
    <g transform="translate(34 552)" stroke="#c4d8ce" fill="none" pointer-events="none">
      <path d="M0-5V0H50V-5M25 0V-5"/>
      <text y="-10" fill="#c4d8ce" stroke="none" class="depth-label">100 m</text>
    </g>
  </svg>
</template>
