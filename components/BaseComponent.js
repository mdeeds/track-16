export class BaseComponent extends HTMLElement {
  constructor() {
    super();
    this._state = {};
    this._props = {};
  }

  get props() { return this._props; }
  set props(value) {
    this._props = value;
    this.render();
  }

  get state() { return this._state; }
  set state(value) {
    this._state = { ...this._state, ...value };
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    // Override in subclass
  }

  // Helper to safely bind events after innerHTML updates
  bind(selector, event, handler) {
    const el = this.querySelector(selector);
    if (el) el.addEventListener(event, handler);
  }
  
  bindAll(selector, event, handler) {
    this.querySelectorAll(selector).forEach(el => {
        el.addEventListener(event, (e) => handler(e, el));
    });
  }
}