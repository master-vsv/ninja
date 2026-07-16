import { describe, it, expect } from 'vitest';
import type { MissEvent } from '../events/MissEvent';
import type { NDTObjectKind } from '../events/types';

/**
 * Тесты контракта MissEvent (фаза 2).
 *
 * Контракт зафиксирован в плане:
 *   { bodyId: number, kind: NDTObjectKind, isBomb: boolean }
 *
 * Создание через фабрику DespawnChecker.createMissEvent проверяется в
 * despawn-checker.test.ts. Здесь — только контракт типа/структуры.
 */

describe('MissEvent contract', () => {
  it('имеет поля bodyId, kind, isBomb', () => {
    const ev: MissEvent = { bodyId: 1, kind: 'bolt', isBomb: false };
    expect(ev.bodyId).toBe(1);
    expect(ev.kind).toBe('bolt');
    expect(ev.isBomb).toBe(false);
  });

  it('поддерживает все NDTObjectKind', () => {
    const kinds: ReadonlyArray<NDTObjectKind> = [
      'bolt',
      'nut',
      'ruler',
      'standard',
      'pipe',
    ];
    for (const kind of kinds) {
      const ev: MissEvent = { bodyId: 0, kind, isBomb: kind === 'pipe' };
      expect(ev.kind).toBe(kind);
      expect(ev.isBomb).toBe(kind === 'pipe');
    }
  });

  it('bodyId — числовое (id Matter-тела)', () => {
    const ev: MissEvent = { bodyId: 12345, kind: 'nut', isBomb: false };
    expect(typeof ev.bodyId).toBe('number');
    expect(ev.bodyId).toBe(12345);
  });

  it('isBomb=true для трубы (штраф не накладывается, но факт эмитится)', () => {
    const ev: MissEvent = { bodyId: 7, kind: 'pipe', isBomb: true };
    expect(ev.isBomb).toBe(true);
    expect(ev.kind).toBe('pipe');
  });
});
