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
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json,png}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Live data must never come from a cache; map tiles may.
        runtimeCaching: [
          { urlPattern: /^https:\/\/tiles\.openfreemap\.org\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'tiles', expiration: { maxEntries: 2000, maxAgeSeconds: 14 * 86400 } } },
        ],
      },
    }),
  ],
})
