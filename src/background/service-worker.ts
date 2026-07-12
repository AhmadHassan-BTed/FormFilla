import { getProfile, saveProfile } from '../shared/storage/storage-client.js';
import { initializeApp } from 'firebase/app';
import { initializeAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, limit, query } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

let app: any;
let db: any;
let auth: any;

function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== 'your-api-key' &&
    firebaseConfig.apiKey.trim().length > 0
  );
}

function getFirebaseDb() {
  if (!db && isFirebaseConfigured()) {
    try {
      app = initializeApp(firebaseConfig);
      // Initialize Auth with no persistence (in-memory) to avoid IndexedDB issues in MV3 service worker
      auth = initializeAuth(app, {});
      db = getFirestore(app);
    } catch (err) {
      console.error('FormFilla: Failed to initialize Firebase client', err);
    }
  }
  return db;
}

async function checkAndSyncRules() {
  if (!isFirebaseConfigured()) return;

  try {
    const result = await chrome.storage.local.get(['lastRulesSync', 'syncedRuleKeys', 'learnedRules']) as any;
    const lastRulesSync = Number(result.lastRulesSync || 0);
    const syncedRuleKeys = (result.syncedRuleKeys || []) as string[];
    const learnedRules = (result.learnedRules || {}) as Record<string, any>;

    const now = Date.now();
    // 24 hours = 86400000 ms
    if (now - lastRulesSync < 86400000) {
      return; // Already synced today
    }

    const unsyncedKeys = Object.keys(learnedRules).filter(k => !syncedRuleKeys.includes(k));
    if (unsyncedKeys.length === 0) {
      await chrome.storage.local.set({ lastRulesSync: now });
      return;
    }

    const firestore = getFirebaseDb();
    if (!firestore) return;

    if (auth && !auth.currentUser) {
      await signInAnonymously(auth);
    }

    const rulesCol = collection(firestore, 'suggested_rules');
    for (const key of unsyncedKeys) {
      const rule = learnedRules[key];
      await addDoc(rulesCol, {
        key: rule.key,
        exactPhrases: rule.exactPhrases,
        regexPatterns: rule.regexPatterns,
        timestamp: new Date().toISOString()
      });
      syncedRuleKeys.push(key);
    }

    await chrome.storage.local.set({
      lastRulesSync: now,
      syncedRuleKeys
    });
    console.log(`FormFilla: Synced ${unsyncedKeys.length} new custom rules to Firebase.`);
  } catch (err) {
    console.error('FormFilla: Failed to sync rules to Firebase', err);
  }
}

async function fetchCommunityRules() {
  if (!isFirebaseConfigured()) {
    return {};
  }
  const firestore = getFirebaseDb();
  if (!firestore) return {};

  if (auth && !auth.currentUser) {
    await signInAnonymously(auth);
  }

  const rulesCol = collection(firestore, 'suggested_rules');
  const q = query(rulesCol, limit(500));
  const snapshot = await getDocs(q);

  const rules: Record<string, any> = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data && data.key) {
      rules[data.key] = {
        key: data.key,
        exactPhrases: data.exactPhrases || [],
        regexPatterns: data.regexPatterns || [],
        sensitivityTier: 'standard'
      };
    }
  });
  return rules;
}

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
    return;
  }

  if (message.type === 'FETCH_COMMUNITY_RULES') {
    // Run rule sync check in the background once a day
    checkAndSyncRules().catch((err) => console.error('FormFilla: Background rules check failed', err));

    fetchCommunityRules()
      .then((rules) => sendResponse({ success: true, rules }))
      .catch((err) => {
        console.error('FormFilla: Fetching community rules failed', err);
        sendResponse({ success: false, rules: {}, error: err.message });
      });
    return true; // async response
  }
});
