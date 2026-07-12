// Mock Chrome Extension APIs globally for Vitest JSDOM tests
globalThis.chrome = {
  runtime: {
    onMessage: {
      addListener: () => {}
    },
    sendMessage: () => {}
  },
  storage: {
    local: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve()
    }
  }
} as any;

// Mock getBoundingClientRect globally in JSDOM since JSDOM does not perform layout
if (typeof window !== 'undefined' && window.Element) {
  window.Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 100,
      right: 100,
      width: 100,
      height: 100,
      toJSON: () => {}
    } as any;
  };
}

