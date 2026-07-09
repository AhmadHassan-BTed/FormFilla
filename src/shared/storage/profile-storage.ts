import { Profile } from '../types/index.js';

let memoryProfile: Profile | null = null;

function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && chrome.storage !== undefined && chrome.storage.local !== undefined;
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

// ---- Template cleaning / normalization ----
import profileTemplate from '../dictionary/profile-template.json' with { type: 'json' };

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

