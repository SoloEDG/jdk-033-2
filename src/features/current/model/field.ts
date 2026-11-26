import { KNOT_UNITS_PER_MINUTE, TRIAL_START, isWater, segmentCrossesLand } from './bay'
import type {
  CandidateId, CurrentVector, Drifter, EvidenceSegment, Fix, PathCheck, Point,
} from './types'

interface FieldAnchor extends Point {
  vector: Point
  weight: number
}

export function bearingToVector(bearing: number, knots = 1): Point {
  const radians = bearing * Math.PI / 180
  return { x: Math.sin(radians) * knots, y: -Math.cos(radians) * knots }
}

export function vectorToBearing(vector: Point): number {
  return (Math.atan2(vector.x, -vector.y) * 180 / Math.PI + 360) % 360
}

export function describeVector(vector: Point): CurrentVector {
  const knots = Math.hypot(vector.x, vector.y)
  return { bearing: vectorToBearing(vector), knots, vector }
}

function densifyRoute(points: Point[], speedKnots: number, spacing = 18, weight = 4.8): FieldAnchor[] {
  const anchors: FieldAnchor[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length < 1) continue
    const vector = { x: dx / length * speedKnots, y: dy / length * speedKnots }
    const pieces = Math.max(1, Math.ceil(length / spacing))
    for (let j = 0; j <= pieces; j += 1) {
      if (i > 0 && j === 0) continue
      const t = j / pieces
      anchors.push({ x: a.x + dx * t, y: a.y + dy * t, vector, weight })
    }
  }
  return anchors
}

const northApproach: Point[] = [
  { x: 790, y: 270 },
  { x: 742, y: 262 },
  { x: 685, y: 268 },
  { x: 635, y: 282 },
  { x: 604, y: 298 },
]

const southChannel: Point[] = [
  { x: 790, y: 337 },
  { x: 735, y: 358 },
  { x: 676, y: 376 },
  { x: 612, y: 394 },
  { x: 545, y: 408 },
  { x: 480, y: 398 },
  { x: 420, y: 356 },
  { x: 350, y: 344 },
  { x: 282, y: 358 },
  { x: 214, y: 374 },
  { x: 164, y: 392 },
]

const sharedAnchors: FieldAnchor[] = [
  ...densifyRoute(northApproach, 0.96, 16, 6.2),
  ...densifyRoute(southChannel, 1.12, 16, 8.2),
]

// A tangential anchor ring makes the northern backwater explicit.
const gyreCenter: Point = { x: 455, y: 300 }
const gyreRx = 145
const gyreRy = 61
for (let i = 0; i < 22; i += 1) {
  const theta = (i / 22) * Math.PI * 2
  const x = gyreCenter.x + gyreRx * Math.cos(theta)
  const y = gyreCenter.y + gyreRy * Math.sin(theta)
  // Motion is east -> north -> west -> south on the chart.
  const tangent = { x: gyreRx * Math.sin(theta), y: -gyreRy * Math.cos(theta) }
  const norm = Math.hypot(tangent.x, tangent.y)
  sharedAnchors.push({
    x, y,
    vector: { x: tangent.x / norm * 0.84, y: tangent.y / norm * 0.84 },
    weight: 4.2,
  })
}

const eddyBranch: Point[] = [
  TRIAL_START,
  { x: 681, y: 292 },
  { x: 657, y: 282 },
  { x: 625, y: 284 },
  { x: 604, y: 298 },
]

const channelBranch: Point[] = [
  TRIAL_START,
  { x: 690, y: 334 },
  { x: 660, y: 364 },
  { x: 626, y: 389 },
  { x: 590, y: 397 },
]

const candidateAnchors: Record<CandidateId, FieldAnchor[]> = {
  eddy: densifyRoute(eddyBranch, 1.02, 13, 7.2),
  channel: densifyRoute(channelBranch, 1.08, 13, 7.2),
}

export const candidateNames: Record<CandidateId, string> = {
  eddy: '候选 A · 北部分水',
  channel: '候选 B · 南槽顺流',
}

function sampleAnchorSet(position: Point, anchors: FieldAnchor[]): Point {
  let vx = 0
  let vy = 0
  let weightSum = 0
  for (const anchor of anchors) {
    const dx = position.x - anchor.x
    const dy = position.y - anchor.y
    const d2 = dx * dx + dy * dy
    if (d2 < 0.7) return { ...anchor.vector }
    const weight = anchor.weight / (d2 + 260)
    vx += anchor.vector.x * weight
    vy += anchor.vector.y * weight
    weightSum += weight
  }
  return { x: vx / weightSum, y: vy / weightSum }
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function divergenceInfluence(position: Point): number {
  // Elliptical feather around the unresolved split. Candidate fields are
  // identical outside this area, so all disagreement is geographically retained.
  const q = Math.sqrt(((position.x - 697) / 54) ** 2 + ((position.y - 312) / 40) ** 2)
  return 1 - smoothStep(0.62, 0.98, q)
}

export function sampleCurrent(position: Point, candidate: CandidateId): CurrentVector {
  const base = sampleAnchorSet(position, sharedAnchors)
  const influence = divergenceInfluence(position)
  if (influence <= 0.001) return describeVector(base)
  const alternative = sampleAnchorSet(position, candidateAnchors[candidate])
  return describeVector({
    x: base.x * (1 - influence) + alternative.x * influence,
    y: base.y * (1 - influence) + alternative.y * influence,
  })
}

export function displacementPerMinute(current: CurrentVector): Point {
  return {
    x: current.vector.x * KNOT_UNITS_PER_MINUTE,
    y: current.vector.y * KNOT_UNITS_PER_MINUTE,
  }
}

export interface IntegrationResult {
  points: Point[]
  shoreHits: number
  endedOnLand: boolean
}

/** Integrate a drifter with small fixed sub-steps, checking every segment. */
export function integratePath(
  candidate: CandidateId,
  start: Point,
  minutes: number,
  maxStep = 0.12,
): IntegrationResult {
  const points: Point[] = [{ ...start }]
  let current = { ...start }
  let remaining = Math.max(0, minutes)
  let shoreHits = 0
  while (remaining > 1e-9) {
    const dt = Math.min(maxStep, remaining)
    const drift = displacementPerMinute(sampleCurrent(current, candidate))
    const next = { x: current.x + drift.x * dt, y: current.y + drift.y * dt }
    if (segmentCrossesLand(current, next)) {
      shoreHits += 1
      // Keep the check alive without allowing a displayed track through land.
      const midpoint = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 }
      if (isWater(midpoint)) current = midpoint
      break
    }
    current = next
    points.push({ ...current })
    remaining -= dt
  }
  return { points, shoreHits, endedOnLand: !isWater(current) }
}

export function evaluateDrifter(
  drifter: Drifter,
  candidate: CandidateId,
  tolerance = 22,
): PathCheck {
  const fixes = [...drifter.fixes].sort((a, b) => a.time - b.time)
  const observations: PathCheck['observations'] = []
  const dense: Point[] = fixes[0] ? [{ ...fixes[0].position }] : []
  let shoreHits = 0
  let squaredSum = 0
  let maxError = 0

  if (fixes.length > 0) {
    let predicted = { ...fixes[0].position }
    for (let i = 0; i < fixes.length; i += 1) {
      const target = fixes[i]
      if (i === 0) {
        const error = Math.hypot(predicted.x - target.position.x, predicted.y - target.position.y)
        observations.push({ time: target.time, observed: target.position, predicted, error })
        continue
      }

      const previousTime = fixes[i - 1].time
      const dt = Math.max(0, target.time - previousTime)
      const pieces = Math.max(1, Math.ceil(dt / 0.12))
      const step = dt / pieces
      for (let j = 0; j < pieces; j += 1) {
        const drift = displacementPerMinute(sampleCurrent(predicted, candidate))
        const next = { x: predicted.x + drift.x * step, y: predicted.y + drift.y * step }
        if (segmentCrossesLand(predicted, next)) {
          shoreHits += 1
          break
        }
        predicted = next
        dense.push({ ...predicted })
      }

      const error = Math.hypot(predicted.x - target.position.x, predicted.y - target.position.y)
      maxError = Math.max(maxError, error)
      squaredSum += error * error
      observations.push({ time: target.time, observed: target.position, predicted: { ...predicted }, error })
    }
  }

  const countable = Math.max(1, observations.length - 1)
  return {
    points: dense,
    maxError,
    rmsError: Math.sqrt(squaredSum / countable),
    shoreHits,
    sampledSteps: dense.length,
    observations,
  }
}

export function buildEvidence(drifters: Drifter[]): EvidenceSegment[] {
  const evidence: EvidenceSegment[] = []
  for (const drifter of drifters) {
    if (drifter.role !== 'train' || !drifter.enabled) continue
    const fixes = [...drifter.fixes].sort((a, b) => a.time - b.time)
    for (let i = 1; i < fixes.length; i += 1) {
      const a = fixes[i - 1]
      const b = fixes[i]
      const dt = b.time - a.time
      if (dt <= 0) continue
      const dx = b.position.x - a.position.x
      const dy = b.position.y - a.position.y
      const distance = Math.hypot(dx, dy)
      evidence.push({
        drifterId: drifter.id,
        fromFixId: a.id,
        toFixId: b.id,
        from: a.position,
        to: b.position,
        midpoint: { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 },
        dt,
        distance,
        speedKnots: distance / (KNOT_UNITS_PER_MINUTE * dt),
        bearing: vectorToBearing({ x: dx / dt, y: dy / dt }),
        directCrossesLand: segmentCrossesLand(a.position, b.position),
      })
    }
  }
  return evidence
}

let fixSequence = 0
export function newFixId(): string {
  fixSequence += 1
  return `fix-${Date.now().toString(36)}-${fixSequence}`
}

function rounded(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

function fixesFromTimes(candidate: CandidateId, start: Point, times: number[]): Fix[] {
  const fixes: Fix[] = [{ id: newFixId(), time: times[0] ?? 0, position: rounded(start) }]
  for (let i = 1; i < times.length; i += 1) {
    const result = integratePath(candidate, start, times[i], 0.05)
    fixes.push({ id: newFixId(), time: times[i], position: rounded(result.points.at(-1) ?? start) })
  }
  return fixes
}

export function createSeedDrifters(): Drifter[] {
  return [
    {
      id: 'D01',
      name: '北回水球',
      color: '#ffb454',
      role: 'train',
      enabled: true,
      fixes: fixesFromTimes('channel', { x: 790, y: 270 }, [0, 6, 15, 27, 41]),
    },
    {
      id: 'D02',
      name: '南槽球',
      color: '#67d7ff',
      role: 'train',
      enabled: true,
      fixes: fixesFromTimes('channel', { x: 790, y: 337 }, [0, 4, 12, 23, 36]),
    },
    {
      id: 'D03',
      name: '西湾球',
      color: '#9be564',
      role: 'train',
      enabled: true,
      fixes: fixesFromTimes('channel', { x: 545, y: 408 }, [0, 5, 11, 17]),
    },
    {
      id: 'D04',
      name: '封存检验球',
      color: '#e879f9',
      role: 'holdout',
      enabled: true,
      fixes: fixesFromTimes('channel', TRIAL_START, [0, 5, 13, 24]),
    },
  ]
}
