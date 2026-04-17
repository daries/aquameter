import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,          // aktif di dev mode agar bisa test install
        type: 'module',
      },
      includeAssets: [
        'favicon.ico', 'favicon.svg',
        'apple-touch-icon-180x180.png',
        'pwa-64x64.png', 'pwa-192x192.png', 'pwa-512x512.png',
        'maskable-icon-512x512.png',
      ],
      manifest: {
        name: 'AquaMeter - Sistem Meteran Air',
        short_name: 'AquaMeter',
        description: 'Aplikasi manajemen meteran air PDAM: baca meteran, tagihan, laporan keuangan',
        theme_color: '#0B4F6C',
        background_color: '#F4F9FC',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        lang: 'id',
        categories: ['utilities', 'business', 'finance'],
        icons: [
          { src: 'pwa-64x64.png',           sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',          sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',          sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png',sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Baca Meteran',
            short_name: 'Baca',
            description: 'Input pembacaan meteran',
            url: '/meters',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Tagihan',
            short_name: 'Tagihan',
            description: 'Lihat daftar tagihan',
            url: '/billing',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Cache local API (NetworkFirst agar selalu fresh saat online)
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Cache Google Fonts
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-cache' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
