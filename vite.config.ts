import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the build works at https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'OnTrack',
        short_name: 'OnTrack',
        description: 'Door-to-door public transport for Bonn and Germany',
        theme_color: '#0b6bcb',
        background_color: '#f6f7f9',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Live data must never come from a cache; map tiles may.
        runtimeCaching: [
          { urlPattern: /^https:\/\/tiles\.openfreemap\.org\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'tiles', expiration: { maxEntries: 2000, maxAgeSeconds: 14 * 86400 } } },
        ],
      },
    }),
  ],
})
