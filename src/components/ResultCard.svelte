<script lang="ts">
  import { duration, minutesUntil } from '../lib/format'
  import { checkLeg, isTransit } from '../lib/realtime'
  import type { Annotated } from '../lib/state.svelte'
  import { lineName, platformLabel } from '../lib/lines'
  import TimeBadge from './TimeBadge.svelte'
  import LegStrip from './LegStrip.svelte'

  let { a, onopen }: { a: Annotated; onopen: () => void } = $props()

  const legs = $derived(a.it.legs)
  const firstTransit = $derived(legs.find(isTransit))
  const dep = $derived(checkLeg(legs[0]).dep)
  const arr = $derived(checkLeg(legs[legs.length - 1]).arr)
  const boardDep = $derived(firstTransit ? checkLeg(firstTransit).dep : null)
  const leaveIn = $derived(minutesUntil(dep.time))
  const c = $derived(a.confidence)
  const walkOnly = $derived(!firstTransit)
</script>

<button class="card result" class:dim={a.risk === 'missed' || c.cancelled > 0 || c.broken.length > 0} onclick={onopen}>
  <div class="row top">
    <div class="times">
      <TimeBadge t={dep} big /> <span class="muted">–</span> <TimeBadge t={arr} big />
    </div>
    <div class="dur tabular">{duration(a.it.duration)}</div>
  </div>

  <LegStrip it={a.it} />

  <div class="row meta small">
    {#if walkOnly}
      <span class="muted">Walk the whole way</span>
    {:else if firstTransit && boardDep}
      <span class="muted">
        {lineName(firstTransit)} from <b>{firstTransit.from.name}</b>{#if platformLabel(firstTransit.from, firstTransit.mode)}, {platformLabel(firstTransit.from, firstTransit.mode)}{/if}
      </span>
    {/if}
    <span class="leave tabular" class:soon={leaveIn <= 5}>{leaveIn <= 0 ? 'Leave now' : `Leave in ${leaveIn} min`}</span>
  </div>

  <div class="flags small">
    {#if a.it.transfers === 0 && !walkOnly}<span class="flag">Direct</span>{:else if !walkOnly}<span class="flag">{a.it.transfers} change{a.it.transfers > 1 ? 's' : ''}</span>{/if}
    {#if c.cancelled}<span class="flag bad">Cancelled leg</span>{/if}
    {#if c.broken.length}<span class="flag bad">Live data contradicts itself</span>{/if}
    {#if a.risk === 'missed'}<span class="flag bad">Connection likely not possible</span>
    {:else if a.risk === 'risky'}<span class="flag bad">Risky transfer</span>
    {:else if a.risk === 'tight'}<span class="flag warn">Tight transfer</span>{/if}
    {#if a.fallback}
      <span class="flag warn">Timetable only: live data for {a.fallback.join(', ')} is unreliable</span>
    {:else if c.transitLegs}
      {#if c.unverified}<span class="flag warn">{c.unverified} time{c.unverified > 1 ? 's' : ''} uncertain</span>
      {:else if c.live === c.transitLegs}<span class="flag ok">All live</span>
      {:else if c.live === 0}<span class="flag">Timetable only</span>
      {:else}<span class="flag">{c.live}/{c.transitLegs} live</span>{/if}
    {/if}
  </div>
</button>

<style>
  .result {
    display: grid; gap: 10px; width: 100%; text-align: left; border: 0; padding: 14px;
  }
  .result:active { transform: scale(.995); }
  .dim { opacity: .6; }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .times { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .dur { font-weight: 600; }
  .meta { align-items: flex-end; }
  .meta b { color: var(--text); font-weight: 600; }
  .leave { flex: none; color: var(--accent); font-weight: 600; }
  .leave.soon { color: var(--warn); }
  .flags { display: flex; gap: 6px; flex-wrap: wrap; }
  .flag { padding: 2px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted); }
  .flag.ok { background: var(--ok-soft); color: var(--ok); }
  .flag.warn { background: var(--warn-soft); color: var(--warn); }
  .flag.bad { background: var(--bad-soft); color: var(--bad); }
</style>
