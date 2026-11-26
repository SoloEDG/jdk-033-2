import { TRIAL_START } from './bay'
import {
  buildEvidence, candidateNames, evaluateDrifter, integratePath,
} from './field'
import type {
  CandidateId, CandidateReport, Drifter, HoldoutResult, Point, Reconstruction, SupportZone,
} from './types'

export const FIT_TOLERANCE = 18

const ZONE_SPECS: { id: string; name: string; center: Point; radius: number }[] = [
  { id: 'mouth', name: '湾口分流段', center: { x: 770, y: 302 }, radius: 105 },
  { id: 'eddy', name: '北回水涡', center: { x: 455, y: 292 }, radius: 185 },
  { id: 'south', name: '南槽顺流带', center: { x: 505, y: 397 }, radius: 185 },
  { id: 'west', name: '西湾水道', center: { x: 286, y: 365 }, radius: 145 },
]

function buildSupportZones(drifters: Drifter[]): SupportZone[] {
  const evidence = buildEvidence(drifters)
  return ZONE_SPECS.flatMap(spec => {
    const inside = evidence.filter(segment =>
      Math.hypot(segment.midpoint.x - spec.center.x, segment.midpoint.y - spec.center.y) <= spec.radius)
    if (inside.length === 0) return []

    let sinSum = 0
    let cosSum = 0
    let speedWeight = 0
    let weightSum = 0
    for (const segment of inside) {
      const weight = Math.max(segment.dt, 0.1)
      const radians = segment.bearing * Math.PI / 180
      sinSum += Math.sin(radians) * weight
      cosSum += Math.cos(radians) * weight
      speedWeight += segment.speedKnots * weight
      weightSum += weight
    }
    const bearing = (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360
    return [{
      id: spec.id,
      name: spec.name,
      center: spec.center,
      bearing,
      speedKnots: speedWeight / weightSum,
      segments: inside.length,
      confidence: inside.length >= 3 ? '强支持' : inside.length === 2 ? '中等支持' : '待加密',
    } satisfies SupportZone]
  })
}

function candidateReport(
  id: CandidateId,
  drifters: Drifter[],
  tolerance: number,
): CandidateReport {
  const training = drifters.filter(d => d.role === 'train' && d.enabled && d.fixes.length >= 2)
  const checks: CandidateReport['checks'] = {}
  let maxError = 0
  let squared = 0
  let observationCount = 0
  let shoreHits = 0

  for (const drifter of training) {
    const check = evaluateDrifter(drifter, id, tolerance)
    checks[drifter.id] = check
    maxError = Math.max(maxError, check.maxError)
    shoreHits += check.shoreHits
    for (let i = 1; i < check.observations.length; i += 1) {
      squared += check.observations[i].error ** 2
      observationCount += 1
    }
  }

  const rmsError = observationCount ? Math.sqrt(squared / observationCount) : Number.POSITIVE_INFINITY
  const fit = training.length > 0 && maxError <= tolerance && shoreHits === 0
  const preview = integratePath(id, TRIAL_START, 24, 0.1).points
  const reason = training.length === 0
    ? '缺少至少一条含两个时刻的重建漂球。'
    : fit
      ? `整段积分最大偏差 ${maxError.toFixed(1)} 图上单位，未穿岸。`
      : shoreHits > 0
        ? `积分轨迹有 ${shoreHits} 次触及/穿越岸线。`
        : `最大偏差 ${maxError.toFixed(1)} 超过容差 ${tolerance}。`

  return {
    id,
    name: candidateNames[id],
    fit,
    maxError,
    rmsError,
    shoreHits,
    checks,
    preview,
    reason,
  }
}

export function reconstruct(drifters: Drifter[]): Reconstruction {
  const candidates = {
    eddy: candidateReport('eddy', drifters, FIT_TOLERANCE),
    channel: candidateReport('channel', drifters, FIT_TOLERANCE),
  } satisfies Record<CandidateId, CandidateReport>

  return {
    evidence: buildEvidence(drifters),
    zones: buildSupportZones(drifters),
    candidates,
    bothFit: candidates.eddy.fit && candidates.channel.fit,
    divergence: [
      { x: 668, y: 292 }, { x: 696, y: 281 }, { x: 728, y: 291 }, { x: 740, y: 314 },
      { x: 724, y: 334 }, { x: 690, y: 342 }, { x: 662, y: 330 }, { x: 654, y: 310 },
    ],
    tolerance: FIT_TOLERANCE,
    checkedAt: Date.now(),
  }
}

export function testHoldoutDrifters(
  drifters: Drifter[],
  tolerance = FIT_TOLERANCE,
): HoldoutResult {
  const holdouts = drifters.filter(d => d.role === 'holdout' && d.enabled && d.fixes.length >= 2)
  const make = (id: CandidateId) => {
    let maxError = 0
    let squared = 0
    let count = 0
    let shoreHits = 0
    let path: Point[] = []
    for (const drifter of holdouts) {
      const result = evaluateDrifter(drifter, id, tolerance)
      maxError = Math.max(maxError, result.maxError)
      shoreHits += result.shoreHits
      path = result.points
      for (let i = 1; i < result.observations.length; i += 1) {
        squared += result.observations[i].error ** 2
        count += 1
      }
    }
    const rmsError = count ? Math.sqrt(squared / count) : Number.POSITIVE_INFINITY
    return {
      maxError,
      rmsError,
      shoreHits,
      fit: holdouts.length > 0 && maxError <= tolerance && shoreHits === 0,
      path,
    }
  }

  const reports = { eddy: make('eddy'), channel: make('channel') }
  let preferred: HoldoutResult['preferred'] = 'inconclusive'
  let message: string

  if (holdouts.length === 0) {
    message = '没有可用于检验的封存漂球。'
  } else if (reports.channel.fit && !reports.eddy.fit) {
    preferred = 'channel'
    message = `独立漂球支持候选 B：最大偏差 ${reports.channel.maxError.toFixed(1)}，候选 A 为 ${reports.eddy.maxError.toFixed(1)}。`
  } else if (reports.eddy.fit && !reports.channel.fit) {
    preferred = 'eddy'
    message = `独立漂球支持候选 A：最大偏差 ${reports.eddy.maxError.toFixed(1)}，候选 B 为 ${reports.channel.maxError.toFixed(1)}。`
  } else if (reports.eddy.fit && reports.channel.fit) {
    const ratio = Math.min(reports.eddy.maxError, reports.channel.maxError)
      / Math.max(1, Math.max(reports.eddy.maxError, reports.channel.maxError))
    if (ratio < 0.45) {
      preferred = reports.channel.maxError < reports.eddy.maxError ? 'channel' : 'eddy'
      message = `两种流场都在容差内，但${preferred === 'channel' ? '候选 B' : '候选 A'}误差明显更小。`
    } else {
      message = '独立漂球仍不足以区分两种流场，分歧水域继续保留。'
    }
  } else {
    message = '两种候选都未通过独立检验，需要补测或修正岸线/观测。'
  }

  return {
    drifterId: holdouts.map(d => d.id).join(',') || 'none',
    reports,
    preferred,
    message,
  }
}
