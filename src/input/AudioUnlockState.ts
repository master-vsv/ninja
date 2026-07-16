/**
 * AudioUnlockState (фаза 1, риск №6 в плане).
 *
 * Мобильные браузеры блокируют автостарт AudioContext. По политикам autoplay
 * аудио можно запустить только из обработчика пользовательского ввода.
 * В Phaser для этого есть `scene.sound.unlock()`.
 *
 * Состояние отслеживается, чтобы:
 *   - вызывать unlock ровно один раз (на первом pointerdown);
 *   - не дёргать повторно (повторный вызов может прерывать текущий звук и стоит дорого);
 *   - уметь reset по restart игры.
 *
 * Чистая логика — отлично тестируется. Phaser-зависимый вызов `sound.unlock()`
 * живёт в `systems/InputSystem.ts`, здесь только стейт-машина.
 *
 * Состояния:
 *   - locked (начальное) → onPointerDown возвращает true и переводит в unlocked;
 *   - unlocked → onPointerDown возвращает false (no-op);
 *   - reset() возвращает в locked.
 */
export class AudioUnlockState {
  private unlocked = false;

  /** true, если аудио уже разблокировано. */
  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Вызывается при pointerdown. Возвращает true, если это первый
   * pointerdown с момента последнего reset — в этом случае вызывающий
   * код (InputSystem) должен вызвать `scene.sound.unlock()`.
   * Последующие вызовы возвращают false (no-op).
   */
  onPointerDown(): boolean {
    if (this.unlocked) {
      return false;
    }
    this.unlocked = true;
    return true;
  }

  /** Сбрасывает состояние в locked. Вызывается при restart игры. */
  reset(): void {
    this.unlocked = false;
  }
}
