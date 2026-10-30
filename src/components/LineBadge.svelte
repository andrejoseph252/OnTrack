<script lang="ts">
  import { findLine, lineKey, net } from '../lib/network.svelte'
  import { app, go } from '../lib/state.svelte'

  let { name, mode, bg, fg, headsign }: { name: string; mode: string; bg: string; fg: string; headsign?: string } = $props()

  const line = $derived(net.status === 'ready' ? findLine(name, mode) : undefined)
  const tram = $derived(mode === 'TRAM' || mode === 'SUBWAY' || mode === 'METRO')

  function open(e: MouseEvent) {
    if (!line) return
    e.stopPropagation()
    // Show the direction this vehicle is going, if its headsign matches one.
    const p = headsign ? line.patterns.find(p => headsign.includes(p.headsign) || p.headsign.includes(headsign.replace(/^Bonn\s+/, ''))) : undefined
    app.line = { key: lineKey(line), dir: p?.dir ?? line.patterns[0].dir }
    go('line', 'half')
  }
</script>

{#if line}
  <button class="line-badge" class:tram style:background={bg} style:color={fg} onclick={open} title="Show line {name} on the map">{name}</button>
{:else}
  <span class="line-badge" class:tram style:background={bg} style:color={fg}>{name}</span>
{/if}

<style>
  button { cursor: pointer; box-shadow: inset 0 -1px 0 rgb(0 0 0 / 12%); }
  button:active { transform: scale(.94); }
</style>
