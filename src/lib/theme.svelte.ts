import { load, save } from './storage'
import { BONN, solarElevation } from './sun'

/** 'sun' follows sunrise and sunset in Bonn. */
export type ThemeChoice = 'system' | 'light' | 'dark' | 'sun'

const media = matchMedia('(prefers-color-scheme: dark)')

export const theme = $state({
  choice: load<ThemeChoice>('ontrack.theme', 'system'),
  systemDark: media.matches,
  /** Sun elevation in Bonn (degrees), refreshed every minute; drives 'sun' and the map tint. */
  elevation: solarElevation(new Date(), BONN.lat, BONN.lon),
  /** Launched from the home screen: iOS draws white status-bar text over the page. */
  standalone: matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
  /** Effective: what the app is actually showing. Dark from about civil dusk to dawn in 'sun'. */
  get dark() {
    if (this.choice === 'sun') return this.elevation < -3
    return this.choice === 'dark' || (this.choice === 'system' && this.systemDark)
  },
})

media.addEventListener('change', e => (theme.systemDark = e.matches))

/** Applied before first paint (main.ts) and on every change. */
export function applyTheme() {
  const root = document.documentElement
  if (theme.choice === 'system') delete root.dataset.theme
  else root.dataset.theme = theme.choice === 'sun' ? (theme.dark ? 'dark' : 'light') : theme.choice
}

export function setTheme(choice: ThemeChoice) {
  theme.choice = choice
  save('ontrack.theme', choice)
  applyTheme()
}

// The sun moves: update once a minute (cheap), and re-apply when 'sun' crosses dusk/dawn.
setInterval(() => {
  const wasDark = theme.dark
  theme.elevation = solarElevation(new Date(), BONN.lat, BONN.lon)
  if (theme.choice === 'sun' && theme.dark !== wasDark) applyTheme()
}, 60000)

// Dev only: lets the time-of-day tint be previewed (`__theme.elevation = 2`). Stripped from builds.
if (import.meta.env.DEV) (window as unknown as { __theme: typeof theme }).__theme = theme
