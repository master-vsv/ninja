/**
 * Interop-shim для Phaser в тестах.
 *
 * Контекст: ESM-bundle Phaser (`dist/phaser.esm.js`) имеет ТОЛЬКО named exports
 * (Game, Scene, Scale, ...), без default. Исходный же код проекта использует
 * CommonJS-style `import Phaser from 'phaser'` (оправдано: типы Phaser объявлены как
 * `declare module 'phaser' { export = Phaser; }` и работают через esModuleInterop).
 *
 * В production-build Vite сам разрешает это корректно, выбирая точку входа `main`
 * (src/phaser.js), где module.exports = Phaser целиком. В Vitest же мы форсируем
 * ESM-bundle (чтобы обойти статический require('phaser3spectorjs') в WebGLRenderer.js),
 * и там default-экспорта нет.
 *
 * Shim реэкспортирует всё namespace из ESM-bundle как default, сохраняя и named exports.
 * Импорт идёт по абсолютному пути — алиас `phaser` на этот shim рекурсии не создаёт.
 */

// Прямой импорт из файла ESM-bundle (не через имя пакета 'phaser').
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — у esm-файла нет описанных типов для такого импорта, используются типы из 'phaser'.
import * as PhaserNS from '../../node_modules/phaser/dist/phaser.esm.js';

// Phaser как default — совместимость с `import Phaser from 'phaser'`.
export default PhaserNS;

// Реэкспорт named — совместимость с `import { Scene } from 'phaser'`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export * from '../../node_modules/phaser/dist/phaser.esm.js';
