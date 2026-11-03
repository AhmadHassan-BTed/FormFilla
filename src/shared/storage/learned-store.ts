import { SensitivityTier } from '../types/index.js';

export interface CustomRuleData {
  key: string;
  exactPhrases: string[];
  regexPatterns: string[];
  sensitivityTier: SensitivityTier;
}

export interface LearnedData {
  rules: Record<string, CustomRuleData>;
  profileFields: Record<string, any>;
  abbreviations: Record<string, string>;
  degrees: string[];
}

export async function getLearnedData(): Promise<LearnedData> {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return { rules: {}, profileFields: {}, abbreviations: {}, degrees: [] };
  }
  const result = await chrome.storage.local.get([
    'learnedRules',
    'learnedProfileFields',
    'learnedAbbreviations',
    'learnedDegrees'
  ]) as any;
  return {
    rules: (result.learnedRules || {}) as Record<string, CustomRuleData>,
    profileFields: (result.learnedProfileFields || {}) as Record<string, any>,
    abbreviations: (result.learnedAbbreviations || {}) as Record<string, string>,
    degrees: (result.learnedDegrees || []) as string[]
  };
}

export async function saveLearnedRule(key: string, label: string, name: string, id: string): Promise<void> {
  const data = await getLearnedData();
  const ruleKey = key.trim();

  if (!data.rules[ruleKey]) {
    data.rules[ruleKey] = {
      key: ruleKey,
      exactPhrases: [],
      regexPatterns: [],
      sensitivityTier: 'standard'
    };
  }

  const rule = data.rules[ruleKey];
  const words = [label, name, id].filter(w => w && w.trim().length > 0);
  for (const word of words) {
    const cleanWord = word.trim().toLowerCase();
    if (!rule.exactPhrases.includes(cleanWord)) {
      rule.exactPhrases.push(cleanWord);
    }
    const escaped = cleanWord.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    if (!rule.regexPatterns.includes(escaped)) {
      rule.regexPatterns.push(escaped);
    }
  }

  await chrome.storage.local.set({ learnedRules: data.rules });
}

export async function saveLearnedProfileValue(key: string, value: any): Promise<void> {
  const data = await getLearnedData();
  data.profileFields[key] = value;
  await chrome.storage.local.set({ learnedProfileFields: data.profileFields });

  const profileResult = await chrome.storage.local.get('profile');
  if (profileResult.profile) {
    const profile = profileResult.profile;
    setValueByPath(profile, key, value);
    await chrome.storage.local.set({ profile });
  }
}

export function setValueByPath(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arrName = arrayMatch[1];
      const arrIdx = parseInt(arrayMatch[2], 10);
      if (!curr[arrName]) curr[arrName] = [];
      if (!curr[arrName][arrIdx]) curr[arrName][arrIdx] = {};
      curr = curr[arrName][arrIdx];
    } else {
      if (!curr[part]) curr[part] = {};
      curr = curr[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  const arrayMatch = lastPart.match(/^(\w+)\[(\d+)\]$/);
  if (arrayMatch) {
    const arrName = arrayMatch[1];
    const arrIdx = parseInt(arrayMatch[2], 10);
    if (!curr[arrName]) curr[arrName] = [];
    curr[arrName][arrIdx] = value;
  } else {
    curr[lastPart] = value;
  }
}
