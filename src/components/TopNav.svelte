<script lang="ts">
  import { app, go, type View } from '../lib/state.svelte'

  const TABS: { view: View; label: string; icon: string }[] = [
    { view: 'search', label: 'Route', icon: 'M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 15V9a4 4 0 0 1 4-4h6M19 9v6a4 4 0 0 1-4 4H9' },
    { view: 'lines', label: 'Lines', icon: 'M4 6h16M4 12h16M4 18h10M18 16v4m-2-2h4' },
    { view: 'places', label: 'Saved', icon: 'M6 3h12v18l-6-4-6 4V3Z' },
  ]
</script>

<nav class="nav">
  <div class="seg" role="tablist">
    {#each TABS as t}
      <button role="tab" aria-selected={app.view === t.view} onclick={() => go(t.view)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>
        {t.label}
      </button>
    {/each}
  </div>
  <button class="icon-btn" onclick={() => go('settings', 'full')} aria-label="Settings">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
  </button>
</nav>

<style>
  .nav { display: flex; gap: 10px; align-items: center; padding: 2px 0 12px; }
  .seg { flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); background: var(--surface-2); border-radius: 13px; padding: 3px; }
  .seg button {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    border: 0; background: none; padding: 8px 6px; border-radius: 10px; font-size: 14px; font-weight: 600; color: var(--muted);
    transition: background .2s, color .2s, box-shadow .2s;
  }
  .seg button[aria-selected='true'] { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
  svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .icon-btn svg { width: 19px; height: 19px; }
</style>
