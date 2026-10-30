import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { loadQuays } from './lib/quays.svelte'
import { applyTheme } from './lib/theme.svelte'

applyTheme()

loadQuays()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
