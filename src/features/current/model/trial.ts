import { KNOT_UNITS_PER_MINUTE, moveWithoutShore } from './bay'
import { describeVector, sampleCurrent } from './field'
import type { CandidateId, Point, TrialState } from './types'

export const BOAT_SPEED_KNOTS = 3.2

export function createTrial(candidate: CandidateId, start: Point, heading = 188): TrialState {
  return {
    candidate,
    position: { ...start },
    heading,
    speedKnots: BOAT_SPEED_KNOTS,
    elapsed: 0,
    running: false,
    track: [{ ...start }],
    grounded: false,
    distance: 0,
  }
}

export function headingVector(heading: number, knots = 1): Point {
  const radians = heading * Math.PI / 180
  return { x: Math.sin(radians) * knots, y: -Math.cos(radians) * knots }
}

export function rightVector(heading: number): Point {
  const radians = heading * Math.PI / 180
  // Clockwise/right perpendicular on the screen chart.
  return { x: Math.cos(radians), y: Math.sin(radians) }
}

export interface TrialForces {
  current: ReturnType<typeof sampleCurrent>
  own: Point
  groundKnots: Point
  leewayKnots: Point
  longitudinalKnots: number
  lateralKnots: number
}

export function trialForces(state: TrialState): TrialForces {
  const current = sampleCurrent(state.position, state.candidate)
  const own = headingVector(state.heading, state.speedKnots)
  const groundKnots = { x: own.x + current.vector.x, y: own.y + current.vector.y }
  const right = rightVector(state.heading)
  const lateralKnots = current.vector.x * right.x + current.vector.y * right.y
  const forward = headingVector(state.heading, 1)
  const longitudinalKnots = current.vector.x * forward.x + current.vector.y * forward.y
  return {
    current,
    own,
    groundKnots,
    leewayKnots: { x: right.x * lateralKnots, y: right.y * lateralKnots },
    longitudinalKnots,
    lateralKnots,
  }
}

export function stepTrial(state: TrialState, dtMinutes: number): TrialState {
  if (!state.running) return state
  const forces = trialForces(state)
  const delta = {
    x: forces.groundKnots.x * KNOT_UNITS_PER_MINUTE * dtMinutes,
    y: forces.groundKnots.y * KNOT_UNITS_PER_MINUTE * dtMinutes,
  }
  const moved = moveWithoutShore(state.position, delta)
  const stepDistance = Math.hypot(moved.position.x - state.position.x, moved.position.y - state.position.y)
  return {
    ...state,
    position: moved.position,
    elapsed: state.elapsed + dtMinutes,
    track: [...state.track, { ...moved.position }],
    grounded: moved.grounded,
    distance: state.distance + stepDistance * 2,
  }
}

export function groundBearing(forces: TrialForces): number {
  return describeVector(forces.groundKnots).bearing
}
