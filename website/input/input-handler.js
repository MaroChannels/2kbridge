/**
 * Input handler for the VIEWER side.
 *
 * Captures keyboard and gamepad events, then calls onInput(inputEvent)
 * so the app can forward them to the host via socket.
 *
 * robotjs key name reference: https://robotjs.io/docs/syntax#keys
 */

// Special (non-printable) keys: e.code → robotjs key name
const SPECIAL_KEY_MAP = {
  Space: 'space', Enter: 'enter', Escape: 'escape', Backspace: 'backspace',
  Tab: 'tab', Delete: 'delete', Insert: 'insert',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
  F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4', F5: 'f5', F6: 'f6',
  F7: 'f7', F8: 'f8', F9: 'f9', F10: 'f10', F11: 'f11', F12: 'f12',
  ShiftLeft: 'shift', ShiftRight: 'shift',
  ControlLeft: 'control', ControlRight: 'control',
  AltLeft: 'alt', AltRight: 'alt',
  Numpad0: 'numpad_0', Numpad1: 'numpad_1', Numpad2: 'numpad_2',
  Numpad3: 'numpad_3', Numpad4: 'numpad_4', Numpad5: 'numpad_5',
  Numpad6: 'numpad_6', Numpad7: 'numpad_7', Numpad8: 'numpad_8',
  Numpad9: 'numpad_9',
};

// Xbox gamepad button mapping (standard layout)
const GAMEPAD_BUTTON_NAMES = [
  'a', 'b', 'x', 'y',               // 0-3
  'lb', 'rb',                         // 4-5
  'lt', 'rt',                         // 6-7 (as buttons)
  'back', 'start',                    // 8-9
  'ls', 'rs',                         // 10-11 stick click
  'up', 'down', 'left', 'right',     // 12-15 dpad
];

export class InputHandler {
  constructor() {
    this._onInput = null;
    this._keydownListener = null;
    this._keyupListener = null;
    this._gamepadInterval = null;
    this._prevGamepadState = {};
    this._active = false;
  }

  onInput(cb) {
    this._onInput = cb;
  }

  start() {
    if (this._active) return;
    this._active = true;

    // Keyboard — use e.key for printable chars (layout-aware: AZERTY/QWERTY transparent)
    const resolveKey = (e) => {
      if (e.key.length === 1) return e.key.toLowerCase(); // printable char (layout-aware)
      return SPECIAL_KEY_MAP[e.code] || null;             // special key by physical position
    };
    this._keydownListener = (e) => {
      e.preventDefault();
      const key = resolveKey(e);
      if (!key) return;
      this._emit({ type: 'keyboard', subtype: 'keydown', key });
    };
    this._keyupListener = (e) => {
      e.preventDefault();
      const key = resolveKey(e);
      if (!key) return;
      this._emit({ type: 'keyboard', subtype: 'keyup', key });
    };

    window.addEventListener('keydown', this._keydownListener, { capture: true });
    window.addEventListener('keyup',   this._keyupListener,   { capture: true });

    // Gamepad polling (60fps)
    this._gamepadInterval = setInterval(() => this._pollGamepads(), 16);

    console.log('[Input] Input capture started');
  }

  stop() {
    if (!this._active) return;
    this._active = false;

    if (this._keydownListener) {
      window.removeEventListener('keydown', this._keydownListener, { capture: true });
      window.removeEventListener('keyup',   this._keyupListener,   { capture: true });
    }
    if (this._gamepadInterval) {
      clearInterval(this._gamepadInterval);
      this._gamepadInterval = null;
    }
    this._prevGamepadState = {};
    console.log('[Input] Input capture stopped');
  }

  _emit(input) {
    if (this._onInput) this._onInput(input);
  }

  _pollGamepads() {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp) continue;

      // Apply deadzone to analog axes to avoid noise spam
      const applyDeadzone = (v) => Math.abs(v) < 0.05 ? 0 : parseFloat(v.toFixed(3));

      const buttons = gp.buttons.map(b => ({ pressed: b.pressed, value: parseFloat(b.value.toFixed(3)) }));
      const axes    = gp.axes.map(applyDeadzone);

      // Only send when something actually changed
      const prev = this._prevGamepadState[gp.index];
      let changed = !prev;
      if (prev) {
        for (let i = 0; i < buttons.length; i++) {
          if (buttons[i].pressed !== prev.buttons[i]?.pressed ||
              Math.abs(buttons[i].value - (prev.buttons[i]?.value || 0)) > 0.01) { changed = true; break; }
        }
        if (!changed) {
          for (let i = 0; i < axes.length; i++) {
            if (Math.abs(axes[i] - (prev.axes[i] || 0)) > 0.01) { changed = true; break; }
          }
        }
      }

      if (!changed) continue;

      const state = { buttons, axes };
      this._prevGamepadState[gp.index] = state;
      this._emit({ type: 'gamepad', subtype: 'state', state });
    }
  }
}
