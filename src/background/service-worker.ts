import { getProfile, saveProfile } from '../shared/storage/storage-client.js';

chrome.runtime.onInstalled.addListener(async () => {
  console.log('FormFilla extension installed.');
  try {
    const profile = await getProfile();
    if (!profile.personal.email) {
      await saveProfile(profile);
      console.log('Seeded default empty profile.');
    }
  } catch (err) {
    console.error('Error seeding default profile on install:', err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PERMISSION_NEEDED') {
    console.log(`Content script reported blocked frame origin: ${message.origin}`);
  }
});
