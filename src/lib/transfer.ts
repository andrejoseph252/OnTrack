import type { Itinerary, Leg } from './api/types'
import { checkLeg, isTransit } from './realtime'

export type RiskLevel = 'ok' | 'tight' | 'risky' | 'missed'

export interface Transfer {
  /** Index into itinerary.legs of the arriving transit leg. */
  fromIndex: number
  /** Index into itinerary.legs of the departing transit leg. */
  toIndex: number
  arriving: Leg
  departing: Leg
  walkMin: number
  slackMin: number
  level: RiskLevel
  reasons: string[]
}

const ORDER: RiskLevel[] = ['ok', 'tight', 'risky', 'missed']
/** Uncertainty raises risk but never claims a connection is missed. */
const bump = (l: RiskLevel): RiskLevel => (l === 'ok' ? 'tight' : l === 'tight' ? 'risky' : l)

/**
 * Slack = time between arrival and next departure, minus the walk between.
 * Uncertain arrival data (no live data, or implausible live data) makes a
 * short connection one step riskier, because a delay may not be visible yet.
 */
export function analyseTransfers(it: Itinerary): Transfer[] {
  const out: Transfer[] = []
  let prev = -1
  let walkSec = 0
  it.legs.forEach((leg, i) => {
    if (!isTransit(leg)) {
      if (prev >= 0) walkSec += leg.duration
      return
    }
    if (prev >= 0) out.push(assess(it, prev, i, walkSec))
    prev = i
    walkSec = 0
  })
  return out
}

function assess(it: Itinerary, fromIndex: number, toIndex: number, walkSec: number): Transfer {
  const arriving = it.legs[fromIndex]
  const departing = it.legs[toIndex]
  const a = checkLeg(arriving).arr
  const d = checkLeg(departing).dep
  const walkMin = Math.ceil(walkSec / 60)
  const slackMin = Math.round((d.time.getTime() - a.time.getTime()) / 60000) - walkMin
  const reasons: string[] = []

  let level: RiskLevel = slackMin < 0 ? 'missed' : slackMin < 2 ? 'risky' : slackMin < 5 ? 'tight' : 'ok'
  if (slackMin < 0 && a.status === 'unverified') reasons.push(`Likely missed: estimated arrival is ${-slackMin} min too late. ${a.reason ?? ''}`.trim())
  else if (slackMin < 0) reasons.push(`With current delays you arrive ${-slackMin} min too late.`)
  else reasons.push(`${slackMin} min to spare after a ${walkMin} min walk.`)

  if (level !== 'missed' && slackMin < 8 && a.status !== 'live') {
    level = bump(level)
    reasons.push(a.status === 'scheduled'
      ? `${label(arriving)} has no live data, so a delay would not show here.`
      : `${label(arriving)} live data looks unreliable.`)
  }
  if (a.status === 'live' && a.delayMin >= 3 && level !== 'ok') {
    reasons.push(`${label(arriving)} is already running ${a.delayMin} min late.`)
  }
  if (d.status === 'cancelled' || a.status === 'cancelled') {
    level = 'missed'
    reasons.unshift(`${label(d.status === 'cancelled' ? departing : arriving)} is cancelled.`)
  }
  return { fromIndex, toIndex, arriving, departing, walkMin, slackMin, level, reasons }
}

export function label(leg: Leg) {
  return leg.displayName || leg.routeShortName || leg.mode
}

export function worstRisk(ts: Transfer[]): RiskLevel {
  return ts.reduce<RiskLevel>((w, t) => (ORDER.indexOf(t.level) > ORDER.indexOf(w) ? t.level : w), 'ok')
}
