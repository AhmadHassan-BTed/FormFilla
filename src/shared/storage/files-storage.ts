function isContentScript(): boolean {
  return typeof chrome !== 'undefined' &&
         chrome.runtime !== undefined &&
         chrome.runtime.sendMessage !== undefined &&
         typeof window !== 'undefined' &&
         window.location.protocol !== 'chrome-extension:';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

let memoryFiles: Record<string, ArrayBuffer> = {};

const DB_NAME = 'FormFillaFiles';
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

export async function getFileBlob(key: string): Promise<ArrayBuffer> {
  if (isContentScript()) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'GET_FILE_BLOB', key },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(base64ToArrayBuffer(response.base64));
          } else {
            reject(new Error(response?.error || 'Failed to retrieve file blob via message'));
          }
        }
      );
    });
  }

  try {
    const db = await openDB();
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result instanceof ArrayBuffer) {
          resolve(request.result);
        } else if (request.result && (request.result as any).data instanceof ArrayBuffer) {
          resolve((request.result as any).data);
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
  if (isContentScript()) {
    return new Promise<void>((resolve, reject) => {
      const base64 = arrayBufferToBase64(bytes);
      chrome.runtime.sendMessage(
        { type: 'SAVE_FILE_BLOB', key, base64 },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response?.error || 'Failed to save file blob via message'));
          }
        }
      );
    });
  }

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

