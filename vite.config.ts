import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'keep-private-tv-time-data-out-of-site',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue
          if (Object.keys(output.modules).some((path) => /[\\/]src[\\/]data[\\/]tvTimeImport\.ts$/.test(path))) {
            this.error('The private TV Time export must never be bundled into the public site.')
          }
        }
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'The Watcher',
        short_name: 'Watcher',
        description: 'A personal entertainment tracking & discovery app',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              // Big libraries show well over 500 posters.
              expiration: { maxEntries: 2500, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
            },
          },
          {
            // Book covers (Open Library; older entries Google Books) and game art (IGDB).
            urlPattern: /^https:\/\/(covers\.openlibrary\.org\/|books\.google\.com\/books\/(content|publisher)|images\.igdb\.com\/)/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cover-images',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Book APIs and the IGDB proxy: instant answers, refreshed in the background.
            urlPattern: /^https:\/\/(openlibrary\.org\/(search|trending|works)|[^/]+\/functions\/v1\/igdb)/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'books-games-api',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 12, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.themoviedb\.org\/.*/i,
            // Show the last answer instantly and refresh it in the background.
            // Answers older than 12h are never shown (the expiration check
            // drops them), so new episodes appear within half a day at most.
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tmdb-api-v2',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 12, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
})
