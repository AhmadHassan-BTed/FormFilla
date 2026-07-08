import { Profile } from './types.js';

// Fallback memory storage for environments without chrome.storage.local (like Vitest)
let memoryProfile: Profile | null = null;
const memoryLearnedMappings: Record<string, Record<string, string>> = {};
const memoryFiles: Record<string, ArrayBuffer> = {};

// Helper to check if chrome extension storage is available
function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && chrome.storage !== undefined && chrome.storage.local !== undefined;
}

// --- IndexedDB Helper for Binary Blobs ---
const DB_NAME = 'JobApplierFiles';
const STORE_NAME = 'files';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Storage Client Functions ---

export async function getProfile(): Promise<Profile> {
  if (isChromeStorageAvailable()) {
    const data = await chrome.storage.local.get('profile');
    return (data as any).profile || createEmptyProfile();
  }
  return memoryProfile || createEmptyProfile();
}

export async function saveProfile(profile: Profile): Promise<void> {
  if (isChromeStorageAvailable()) {
    await chrome.storage.local.set({ profile });
  } else {
    memoryProfile = JSON.parse(JSON.stringify(profile)); // Deep copy
  }
}

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

export async function getFileBlob(key: string): Promise<ArrayBuffer> {
  try {
    const db = await openDB();
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result instanceof ArrayBuffer) {
          resolve(request.result);
        } else if (request.result && request.result.data instanceof ArrayBuffer) {
          // In case we saved it wrapped
          resolve(request.result.data);
        } else {
          reject(new Error(`File not found or invalid type for key: ${key}`));
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    if (memoryFiles[key]) {
      return memoryFiles[key];
    }
    throw new Error(`Failed to retrieve file from DB: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function saveFileBlob(key: string, bytes: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(bytes, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    memoryFiles[key] = bytes;
    console.warn('Saved file to memory fallback because IndexedDB is unavailable.', err);
  }
}

function createEmptyProfile(): Profile {
  return {
    personal: {
      firstName: '',
      lastName: '',
      email: '',
      phone: ''
    },
    optIns: {
      sensitiveEeo: false
    }
  };
}
