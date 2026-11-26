import type { Point } from './types'

export const CHART = {
  width: 960,
  height: 600,
  /** One SVG/chart unit represents two metres. */
  metersPerUnit: 2,
} as const

/** One knot expressed in chart units per minute. */
export const KNOT_UNITS_PER_MINUTE = 1852 / 60 / CHART.metersPerUnit

export const DIVERGENCE_ZONE: Point[] = [
  { x: 668, y: 292 },
  { x: 696, y: 281 },
  { x: 728, y: 291 },
  { x: 740, y: 314 },
  { x: 724, y: 334 },
  { x: 690, y: 342 },
  { x: 662, y: 330 },
  { x: 654, y: 310 },
]

export const TRIAL_START: Point = { x: 704, y: 307 }

const northCoastControls: Point[] = [
  { x: 0, y: 238 },
  { x: 62, y: 248 },
  { x: 126, y: 276 },
  { x: 188, y: 272 },
  { x: 252, y: 239 },
  { x: 322, y: 203 },
  { x: 401, y: 184 },
  { x: 486, y: 196 },
  { x: 560, y: 229 },
  { x: 626, y: 252 },
  { x: 691, y: 245 },
  { x: 749, y: 217 },
  { x: 801, y: 177 },
  { x: 858, y: 132 },
  { x: 960, y: 112 },
]

const southCoastControls: Point[] = [
  { x: 0, y: 392 },
  { x: 69, y: 372 },
  { x: 136, y: 382 },
  { x: 201, y: 403 },
  { x: 270, y: 392 },
  { x: 340, y: 365 },
  { x: 410, y: 382 },
  { x: 480, y: 425 },
  { x: 555, y: 452 },
  { x: 632, y: 438 },
  { x: 696, y: 394 },
  { x: 755, y: 374 },
  { x: 812, y: 398 },
  { x: 872, y: 462 },
  { x: 960, y: 492 },
]

const westCapeControls: Point[] = [
  { x: -8, y: 224 },
  { x: 48, y: 246 },
  { x: 101, y: 291 },
  { x: 124, y: 326 },
  { x: 101, y: 362 },
  { x: 50, y: 391 },
  { x: -8, y: 407 },
]

function sampleSpline(controls: Point[], samplesPerSegment = 7, closed = false): Point[] {
  if (controls.length < 3) return controls
  const result: Point[] = []
  const n = controls.length
  const segmentCount = closed ? n : n - 1
  for (let i = 0; i < segmentCount; i += 1) {
    const p1 = controls[i]
    const p2 = controls[(i + 1) % n]
    const p0 = closed ? controls[(i - 1 + n) % n] : controls[Math.max(0, i - 1)]
    const p3 = closed ? controls[(i + 2) % n] : controls[Math.min(n - 1, i + 2)]
    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment
      const t2 = t * t
      const t3 = t2 * t
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t
          + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
          + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t
          + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
          + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  if (!closed) result.push(controls[n - 1])
  return result
}

export const northCoast = sampleSpline(northCoastControls, 8)
export const southCoast = sampleSpline(southCoastControls, 8)
const westCape = sampleSpline(westCapeControls, 8, true)

export const landPolygons: Point[][] = [
  [{ x: 0, y: 0 }, { x: CHART.width, y: 0 }, ...[...northCoast].reverse()],
  [{ x: 0, y: CHART.height }, { x: CHART.width, y: CHART.height }, ...[...southCoast].reverse()],
  westCape,
]

export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const intersects = ((a.y > p.y) !== (b.y > p.y))
      && (p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
    if (intersects) inside = !inside
  }
  return inside
}

export function isLand(p: Point): boolean {
  if (p.x < 0 || p.x > CHART.width || p.y < 0 || p.y > CHART.height) return true
  return landPolygons.some(polygon => pointInPolygon(p, polygon))
}

export function isWater(p: Point): boolean {
  return !isLand(p)
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.min(a.x, b.x) - 0.01 <= p.x && p.x <= Math.max(a.x, b.x) + 0.01
    && Math.min(a.y, b.y) - 0.01 <= p.y && p.y <= Math.max(a.y, b.y) + 0.01
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const c1 = cross(a, b, c)
  const c2 = cross(a, b, d)
  const c3 = cross(c, d, a)
  const c4 = cross(c, d, b)
  if (Math.abs(c1) < 1e-9 && onSegment(a, b, c)) return true
  if (Math.abs(c2) < 1e-9 && onSegment(a, b, d)) return true
  if (Math.abs(c3) < 1e-9 && onSegment(c, d, a)) return true
  if (Math.abs(c4) < 1e-9 && onSegment(c, d, b)) return true
  return (c1 > 0) !== (c2 > 0) && (c3 > 0) !== (c4 > 0)
}

/** True when a straight chart segment meets mapped land. */
export function segmentCrossesLand(a: Point, b: Point): boolean {
  if (isLand(a) || isLand(b)) return true
  for (const polygon of landPolygons) {
    for (let i = 0; i < polygon.length; i += 1) {
      const c = polygon[i]
      const d = polygon[(i + 1) % polygon.length]
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }
  // A very short segment could lie entirely inside a polygon without crossing.
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return isLand(mid)
}

/** Move while refusing to cross a shoreline; axis slides are allowed. */
export function moveWithoutShore(from: Point, delta: Point): { position: Point; grounded: boolean } {
  const full = { x: from.x + delta.x, y: from.y + delta.y }
  if (!segmentCrossesLand(from, full)) return { position: full, grounded: false }

  const xOnly = { x: full.x, y: from.y }
  if (delta.x !== 0 && !segmentCrossesLand(from, xOnly)) {
    const yThen = { x: full.x, y: full.y }
    if (!segmentCrossesLand(xOnly, yThen)) return { position: yThen, grounded: true }
    return { position: xOnly, grounded: true }
  }

  const yOnly = { x: from.x, y: full.y }
  if (delta.y !== 0 && !segmentCrossesLand(from, yOnly)) {
    const xThen = { x: full.x, y: full.y }
    if (!segmentCrossesLand(yOnly, xThen)) return { position: xThen, grounded: true }
    return { position: yOnly, grounded: true }
  }

  return { position: from, grounded: true }
}

export function polygonPoints(points: readonly Point[]): string {
  return points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

export function linePath(points: readonly Point[]): string {
  if (points.length === 0) return ''
  return `M ${points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`
}

export function closedSvgPath(points: readonly Point[]): string {
  if (points.length < 3) return linePath(points)
  return `${linePath(points)} Z`
}
