import { defineConfig } from 'vite';

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
});
