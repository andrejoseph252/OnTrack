import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Shown in Settings, so it's obvious which build a phone is running.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const sha = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' } })()

// Relative base so the build works at https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(sha),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'OnTrack',
        short_name: 'OnTrack',
        description: 'Door-to-door public transport for Bonn and Germany',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json,png}'],
        // Changes daily and is only needed on departure boards: fetch fresh, don't precache.
        globIgnores: ['**/data/replacements.json'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Live data must never come from a cache; map tiles may.
        runtimeCaching: [
          { urlPattern: /^https:\/\/tiles\.openfreemap\.org\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'tiles', expiration: { maxEntries: 2000, maxAgeSeconds: 14 * 86400 } } },
        ],
      },
    }),
  ],
})
