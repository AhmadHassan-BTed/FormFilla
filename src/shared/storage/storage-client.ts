import { Profile } from '../types/index.js';
import profileTemplate from '../dictionary/profile-template.json' with { type: 'json' };

let memoryProfile: Profile | null = null;
const memoryLearnedMappings: Record<string, Record<string, string>> = {};
const memoryFiles: Record<string, ArrayBuffer> = {};

function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && chrome.storage !== undefined && chrome.storage.local !== undefined;
}

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

export async function getProfile(): Promise<Profile> {
  let profile: Profile | null = null;
  if (isChromeStorageAvailable()) {
    const data = await chrome.storage.local.get('profile');
    profile = (data as any).profile || null;
  } else {
    profile = memoryProfile;
  }

  if (!profile) {
    return createEmptyProfile();
  }

  const empty = createEmptyProfile();
  return {
    ...empty,
    ...profile,
    personal: { ...empty.personal, ...profile.personal },
    address: { ...empty.address, ...profile.address },
    links: { ...empty.links, ...profile.links },
    workAuthorization: {
      requiresSponsorship: profile.workAuthorization?.requiresSponsorship ?? empty.workAuthorization!.requiresSponsorship,
      authorizedInUS: profile.workAuthorization?.authorizedInUS ?? empty.workAuthorization!.authorizedInUS,
      visaType: profile.workAuthorization?.visaType ?? empty.workAuthorization!.visaType,
      willingToRelocate: profile.workAuthorization?.willingToRelocate ?? empty.workAuthorization!.willingToRelocate,
      willingToTravel: profile.workAuthorization?.willingToTravel ?? empty.workAuthorization!.willingToTravel
    },
    compensation: { ...empty.compensation, ...profile.compensation },
    availability: { ...empty.availability, ...profile.availability },
    source: { ...empty.source, ...profile.source },
    legal: { ...empty.legal, ...profile.legal },
    eeo: { ...empty.eeo, ...profile.eeo },
    academics: { ...empty.academics, ...profile.academics },
    optIns: { ...empty.optIns, ...profile.optIns }
  };
}

export async function saveProfile(profile: Profile): Promise<void> {
  if (isChromeStorageAvailable()) {
    await chrome.storage.local.set({ profile });
  } else {
    memoryProfile = JSON.parse(JSON.stringify(profile));
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
  const template = JSON.parse(JSON.stringify(profileTemplate));
  delete template.__meta__;
  const optIns = template.optIns;

  const clean = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      return [];
    }
    if (typeof obj === 'object') {
      const newObj: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
          newObj[k] = '';
        } else if (typeof v === 'boolean') {
          newObj[k] = false;
        } else if (typeof v === 'number') {
          newObj[k] = 0;
        } else if (typeof v === 'object') {
          newObj[k] = clean(v);
        } else {
          newObj[k] = v;
        }
      }
      return newObj;
    }
    return obj;
  };

  const cleanProfile = clean(template) as Profile;
  cleanProfile.optIns = optIns;
  return cleanProfile;
}
