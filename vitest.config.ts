import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Конфиг Vitest (TDD — настраивается ПЕРВЫМ в фазе 0).
//
// Окружение jsdom: даже pure-logic тесты (config/game.ts, benchmark/prepareBodies)
// импортируют Phaser. Phaser на этапе импорта читает device/OS.js, которому нужен window;
// и требует стаб canvas-контекста (см. setup.ts).
//
// Алиас phaser → phaser-shim.ts: Vitest по умолчанию резолвит 'phaser' через `main`
// (src/phaser.js), где есть статический require('phaser3spectorjs') в WebGLRenderer.js —
// Vite падает на резолве этой зависимости. Shim реэкспортирует ESM-bundle
// (dist/phaser.esm.js, который без phaser3spectorjs) и даёт default-экспорт для
// совместимости с `import Phaser from 'phaser'`.
// Vite build этот алиас НЕ использует — там условие резолва правильное по умолчанию.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^phaser$/,
        replacement: fileURLToPath(
          new URL('./src/__tests__/phaser-shim.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: false,
    // Явно запрещаем watch-режим в CI/скрипте test:run.
    watch: false,
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
    },
  },
});


