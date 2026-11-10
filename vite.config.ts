import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Adds a Content Security Policy to production builds only, because the dev server needs inline scripts. */
const csp = (allowEmulators: boolean): Plugin => ({
  name: 'osama-hub-csp',
  apply: 'build',
  transformIndexHtml() {
    const local = allowEmulators ? ' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:*' : ''
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      'img-src * data: blob:',
      `media-src 'self' blob: https://firebasestorage.googleapis.com${local}`,
      `connect-src 'self' https://*.googleapis.com${local}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ].join('; ')
    return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }]
  },
})

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  // The GitHub Actions workflow sets VITE_BASE to "/<repo>/" for project pages. The relative default
  // also works from any folder, because HashRouter keeps the document path fixed.
  const base = env.VITE_BASE || './'

  return {
    base,
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: { target: 'es2022', chunkSizeWarningLimit: 900 },
    plugins: [
      react(),
      tailwindcss(),
      csp(env.VITE_USE_EMULATORS === 'true'),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icons/*.png', 'icons/*.svg', 'boot.js'],
        manifest: {
          name: 'OSAMA HUB',
          short_name: 'OSAMA HUB',
          description: 'مركزك الشخصي لإدارة العيادة والمهام والأفكار والحياة',
          lang: 'ar',
          dir: 'rtl',
          display: 'standalone',
          orientation: 'any',
          start_url: './',
          scope: './',
          theme_color: '#0E0E10',
          background_color: '#0E0E10',
          categories: ['productivity', 'finance', 'lifestyle'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'ملاحظة جديدة', url: './#/notes?new=1', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
            { name: 'إيراد جديد', url: './#/clinic?add=income', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
            { name: 'تسجيل صوتي', url: './#/voice?record=1', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          ],
        },
        workbox: {
          // Application shell only. Private Firestore and Storage responses are cross-origin and are
          // never cached by the service worker: user data lives in the user's own IndexedDB database.
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
          // The Excel library is large and only needed when exporting, so it is cached on first use.
          globIgnores: ['data/**', '**/exceljs*.js'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          // The first install takes control at once, so today's content is cached on the first visit.
          // Updates still wait for the user, because skipWaiting stays off in prompt mode.
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.includes('/assets/exceljs'),
              handler: 'CacheFirst',
              options: { cacheName: 'excel-lib-v1', expiration: { maxEntries: 4 } },
            },
            {
              // The public Quran and Hadith dataset is fetched per day and kept for offline reading.
              urlPattern: ({ url }) => url.pathname.includes('/data/deen/'),
              handler: 'CacheFirst',
              options: { cacheName: 'deen-data-v1', expiration: { maxEntries: 400 } },
            },
          ],
        },
      }),
    ],
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  }
})
