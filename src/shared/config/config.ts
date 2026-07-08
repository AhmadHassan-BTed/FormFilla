declare const process: {
  env?: {
    DEBUG_MODE?: string;
    MOCK_STORAGE?: string;
    BYPASS_CONFIRMATIONS?: string;
  };
};

export interface AppConfig {
  debugMode: boolean;
  mockStorage: boolean;
  bypassConfirmations: boolean;
}

export const config: AppConfig = {
  debugMode: typeof process !== 'undefined' && process.env?.DEBUG_MODE === 'true',
  mockStorage: typeof process !== 'undefined' && process.env?.MOCK_STORAGE === 'true',
  bypassConfirmations: typeof process !== 'undefined' && process.env?.BYPASS_CONFIRMATIONS === 'true'
};
