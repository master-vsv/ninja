import { describe, it, expect } from 'vitest';
import { GameOverGate } from '../game/GameOverGate';

/**
 * Тесты GameOverGate (фаза 4) — pure-logic идемпотентного вентиля game-over.
 *
 * Назначение (план, раздел «GameOverFlow»):
 *   - и BombSystem, и LifeSystem могут перевести игру в game over;
 *   - обе эмитят EventBus.emit('game-over', { reason });
 *   - GameScene — единственный консамер; его обработчик идемпотентен;
 *   - защита от двойного эмитта (BombSystem+LifeSystem в одном кадре).
 *
 * GameOverGate реализует эту идемпотентность на стороне эмитента:
 * первый markGameOver возвращает true (нужно перейти в GameOver), последующие
 * в той же игре возвращают false (дублирующий эмит подавлен).
 *
 * Модуль НЕ зависит от Phaser.
 */

describe('GameOverGate / начальное состояние', () => {
  it('при создании mark не срабатывал', () => {
    const g = new GameOverGate();
    expect(g.isGameOver).toBe(false);
  });
});

describe('GameOverGate.markGameOver — идемпотентность', () => {
  it('первый вызов возвращает true', () => {
    const g = new GameOverGate();
    expect(g.markGameOver('bomb')).toBe(true);
  });

  it('второй вызов с той же причиной возвращает false', () => {
    const g = new GameOverGate();
    g.markGameOver('bomb');
    expect(g.markGameOver('bomb')).toBe(false);
  });

  it('второй вызов с другой причиной всё равно false (один game-over на игру)', () => {
    const g = new GameOverGate();
    g.markGameOver('bomb');
    expect(g.markGameOver('no-lives')).toBe(false);
  });

  it('последующие вызовы (3, 4, …) продолжают возвращать false', () => {
    const g = new GameOverGate();
    g.markGameOver('bomb');
    g.markGameOver('no-lives');
    g.markGameOver('bomb');
    expect(g.markGameOver('no-lives')).toBe(false);
  });

  it('isGameOver=true после первого mark', () => {
    const g = new GameOverGate();
    g.markGameOver('bomb');
    expect(g.isGameOver).toBe(true);
  });
});

describe('GameOverGate.markGameOver — причины', () => {
  it('mark с reason="bomb" → first call true', () => {
    const g = new GameOverGate();
    expect(g.markGameOver('bomb')).toBe(true);
  });

  it('mark с reason="no-lives" → first call true', () => {
    const g = new GameOverGate();
    expect(g.markGameOver('no-lives')).toBe(true);
  });
});

describe('GameOverGate.reset', () => {
  it('reset возвращает gate в начальное состояние', () => {
    const g = new GameOverGate();
    g.markGameOver('bomb');
    expect(g.isGameOver).toBe(true);
    g.reset();
    expect(g.isGameOver).toBe(false);
  });

  it('после reset первый mark снова возвращает true', () => {
    const g = new GameOverGate();
    g.markGameOver('bomb');
    g.markGameOver('no-lives');
    g.reset();
    expect(g.markGameOver('no-lives')).toBe(true);
  });

  it('после reset второй mark снова возвращает false', () => {
    const g = new GameOverGate();
    g.markGameOver('bomb');
    g.reset();
    g.markGameOver('no-lives');
    expect(g.markGameOver('bomb')).toBe(false);
  });
});

describe('GameOverGate — изоляция инстансов', () => {
  it('два независимых gate не влияют друг на друга', () => {
    const a = new GameOverGate();
    const b = new GameOverGate();
    expect(a.markGameOver('bomb')).toBe(true);
    // b не должен был среагировать на mark в a.
    expect(b.markGameOver('no-lives')).toBe(true);
  });
});
