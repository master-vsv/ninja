/**
 * Реэкспорт pure-logic 3D-движка (wireframe-рендер NDT-объектов).
 *
 *   Mesh3D     — типы 3D-меши + bbox/нормализация/валидация;
 *   Projection — вращения (rotateX/Y/Z), compose, ортографическая проекция;
 *   NDTMeshes  — меши 5 видов (bolt, nut, ruler, standard, pipe).
 *
 * Модуль НЕ импортирует Phaser — только математика. Phaser-обёртка живёт в
 * src/systems/SpawnDirector.ts (drawWireframe).
 */

export * from './Mesh3D';
export * from './Projection';
export * from './NDTMeshes';
