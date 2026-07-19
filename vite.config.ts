import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Конфиг сборки NDT-Ninja.
// Phaser тянет собственный bundle, поэтому специальных плагинов не требуется —
// Vite собирает TypeScript-исходники как ESM.
export default defineConfig({
  // Относительный base — игра должна работать и из подпути (например, GitHub Pages).
  base: './',
  // Канвас Phaser сам управляется через DOM, корневой элемент указывается в main.ts.
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    // Phaser — крупный пакет; chunk-splitting оставляем дефолтным, Vite вынесет vendor.
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-*.png', 'bg-*.png', 'Sound/**/*'],
      manifest: {
        name: 'NDT Ninja',
        short_name: 'NDT Ninja',
        description: 'Клон Fruit Ninja в теме неразрушающего контроля (NDT)',
        start_url: '/',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#0a0a1a',
        theme_color: '#0a0a1a',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      strategies: 'generateSW',
    }),
  ],
});
