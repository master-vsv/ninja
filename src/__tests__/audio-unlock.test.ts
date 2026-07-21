import { describe, it, expect } from 'vitest';
import { AudioUnlockState } from '../input/AudioUnlockState';

/**
 * Тесты стейт-машины аудио-unlock (фаза 1, риск №6 в плане).
 *
 * Мобильные браузеры блокируют автостарт AudioContext. Unlock выполняется на
 * первом pointerdown через Phaser this.sound.unlock(). Состояние отслеживается,
 * чтобы не вызывать unlock повторно (он дорогой и может прерывать текущий звук).
 *
 * Состояние:
 *   - locked (начальное) → первый onPointerDown → unlocked, вернуть true (требуется unlock);
 *   - последующие onPointerDown остаются в unlocked, возвращают false;
 *   - reset() возвращает в locked (для restart игры).
 */
describe('AudioUnlockState', () => {
  it('начальное состояние audioUnlocked=false', () => {
    const s = new AudioUnlockState();
    expect(s.isUnlocked).toBe(false);
  });

  it('первый pointerdown: переход в unlocked, вернуть true (нужно вызвать sound.unlock)', () => {
    const s = new AudioUnlockState();
    expect(s.onPointerDown()).toBe(true);
    expect(s.isUnlocked).toBe(true);
  });

  it('повторные pointerdown не меняют состояние и не требуют повторного unlock', () => {
    const s = new AudioUnlockState();
    s.onPointerDown();
    expect(s.onPointerDown()).toBe(false);
    expect(s.onPointerDown()).toBe(false);
    expect(s.isUnlocked).toBe(true);
  });

  it('reset возвращает состояние в locked', () => {
    const s = new AudioUnlockState();
    s.onPointerDown();
    s.reset();
    expect(s.isUnlocked).toBe(false);
  });

  it('после reset первый pointerdown снова триггерит unlock', () => {
    const s = new AudioUnlockState();
    s.onPointerDown();
    s.reset();
    expect(s.onPointerDown()).toBe(true);
    expect(s.isUnlocked).toBe(true);
  });

  it('reset без предшествующего pointerdown: состояние остаётся locked', () => {
    const s = new AudioUnlockState();
    s.reset();
    expect(s.isUnlocked).toBe(false);
    expect(s.onPointerDown()).toBe(true);
  });

  it('несколько reset подряд идемпотентны', () => {
    const s = new AudioUnlockState();
    s.onPointerDown();
    s.reset();
    s.reset();
    s.reset();
    expect(s.isUnlocked).toBe(false);
  });

  it('дважды вызванный onPointerDown после reset: только первый вернёт true', () => {
    const s = new AudioUnlockState();
    s.onPointerDown();
    s.reset();
    expect(s.onPointerDown()).toBe(true);
    expect(s.onPointerDown()).toBe(false);
    expect(s.isUnlocked).toBe(true);
  });
});
