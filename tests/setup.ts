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
