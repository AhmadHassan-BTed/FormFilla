function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && chrome.storage !== undefined && chrome.storage.local !== undefined;
}

let memoryLearnedMappings: Record<string, Record<string, string>> = {};

export async function getLearnedMapping(domain: string): Promise<Record<string, string> | null> {
  if (isChromeStorageAvailable()) {
    const key = `mapping:${domain}`;
    const data = await chrome.storage.local.get(key);
    return (data as any)[key] || null;
  }
  return memoryLearnedMappings[domain] || null;
}

export async function saveLearnedMapping(domain: string, map: Record<string, string>): Promise<void> {
  if (isChromeStorageAvailable()) {
    const key = `mapping:${domain}`;
    await chrome.storage.local.set({ [key]: map });
  } else {
    memoryLearnedMappings[domain] = { ...map };
  }
}

