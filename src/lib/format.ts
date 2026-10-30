import { prefs } from './prefs.svelte'

const time24 = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
const time12 = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/Berlin' })
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' })

/** Clock time in Berlin, 12- or 24-hour per Settings ("3:52 PM" / "15:52"). Reactive to the setting. */
export const hm = (d: Date | string) => (prefs.clock === '12' ? time12 : time24).format(typeof d === 'string' ? new Date(d) : d)
export const day = (d: Date) => dayFmt.format(d)

export function duration(sec: number) {
  const m = Math.round(sec / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export function metres(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
}

export function minutesUntil(d: Date, now = new Date()) {
  return Math.round((d.getTime() - now.getTime()) / 60000)
}

/** Value for <input type="datetime-local"> in Berlin time. */
export function toLocalInput(d: Date) {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)
  return p.replace(' ', 'T')
}
