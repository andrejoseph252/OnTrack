import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { loadQuays } from './lib/quays.svelte'

loadQuays()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
