import { load, save } from './storage'

export type ThemeChoice = 'system' | 'light' | 'dark'

const media = matchMedia('(prefers-color-scheme: dark)')

export const theme = $state({
  choice: load<ThemeChoice>('ontrack.theme', 'system'),
  systemDark: media.matches,
  /** Launched from the home screen: iOS draws white status-bar text over the page. */
  standalone: matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
  /** Effective: what the app is actually showing. */
  get dark() {
    return this.choice === 'dark' || (this.choice === 'system' && this.systemDark)
  },
})

media.addEventListener('change', e => (theme.systemDark = e.matches))

/** Applied before first paint (main.ts) and on every change. */
export function applyTheme() {
  const root = document.documentElement
  if (theme.choice === 'system') delete root.dataset.theme
  else root.dataset.theme = theme.choice
}

export function setTheme(choice: ThemeChoice) {
  theme.choice = choice
  save('ontrack.theme', choice)
  applyTheme()
}
