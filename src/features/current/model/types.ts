export interface Point { x: number; y: number }

export type CandidateId = 'eddy' | 'channel'
export type DrifterRole = 'train' | 'holdout'

export interface Fix {
  id: string
  /** Actual observation time in minutes after the first fix. */
  time: number
  position: Point
}

export interface Drifter {
  id: string
  name: string
  color: string
  role: DrifterRole
  enabled: boolean
  /** First fix is the water-entry event. */
  fixes: Fix[]
}

export interface CurrentVector {
  /** Direction clockwise from north, degrees. */
  bearing: number
  knots: number
  /** Components in chart coordinates, knots. */
  vector: Point
}

export interface EvidenceSegment {
  drifterId: string
  fromFixId: string
  toFixId: string
  from: Point
  to: Point
  midpoint: Point
  dt: number
  distance: number
  speedKnots: number
  bearing: number
  directCrossesLand: boolean
}

export interface PathCheck {
  points: Point[]
  maxError: number
  rmsError: number
  shoreHits: number
  sampledSteps: number
  observations: { time: number; observed: Point; predicted: Point; error: number }[]
}

export interface CandidateReport {
  id: CandidateId
  name: string
  fit: boolean
  maxError: number
  rmsError: number
  shoreHits: number
  checks: Record<string, PathCheck>
  preview: Point[]
  reason: string
}

export interface SupportZone {
  id: string
  name: string
  bearing: number
  speedKnots: number
  segments: number
  center: Point
  confidence: '强支持' | '中等支持' | '待加密'
}

export interface Reconstruction {
  evidence: EvidenceSegment[]
  zones: SupportZone[]
  candidates: Record<CandidateId, CandidateReport>
  bothFit: boolean
  divergence: Point[]
  tolerance: number
  checkedAt: number
}

export interface HoldoutResult {
  drifterId: string
  reports: Record<CandidateId, { maxError: number; rmsError: number; shoreHits: number; fit: boolean; path: Point[] }>
  preferred: CandidateId | 'inconclusive'
  message: string
}

export interface TrialState {
  candidate: CandidateId
  position: Point
  heading: number
  speedKnots: number
  elapsed: number
  running: boolean
  track: Point[]
  grounded: boolean
  distance: number
}
