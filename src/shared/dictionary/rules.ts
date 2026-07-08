import { SensitivityTier } from '../types/index.js';
import rawRules from './rules.json' with { type: 'json' };

export interface FieldRule {
  sensitivityTier: SensitivityTier;
  requiresOptIn?: boolean;
  optInKey?: string;
  typeCompatible(type: string, tagName: string): boolean;
  exactPhrases: string[];
  regexPatterns: RegExp[];
  autocompleteTokens: string[];
  negativePatterns?: RegExp[];
}

function defaultTypeCompatible(type: string, tagName: string, allowedTypes?: string[], allowedTags?: string[]): boolean {
  const normType = type.toLowerCase();
  const normTag = tagName.toUpperCase();
  
  if (normType === 'file') {
    return allowedTypes?.includes('file') || false;
  }
  
  if (allowedTypes && allowedTypes.includes('file') && normType !== 'file') {
    return false;
  }

  if (allowedTags && !allowedTags.includes(normTag)) {
    return false;
  }

  if (allowedTypes && !allowedTypes.includes(normType)) {
    const isTextLikeInput = ['text', 'email', 'tel', 'url', 'number', 'date', 'password'].includes(normType) && normTag === 'INPUT';
    const isTextLikeAllowed = allowedTypes.some(t => ['text', 'email', 'tel', 'url', 'number', 'date', 'password'].includes(t));
    if (isTextLikeInput && isTextLikeAllowed) {
      return true;
    }
    return false;
  }

  return true;
}

const compiledRules: Record<string, FieldRule> = {};

for (const [key, raw] of Object.entries(rawRules)) {
  if (key.startsWith('__')) continue;
  const rawRule = raw as any;
  compiledRules[key] = {
    sensitivityTier: rawRule.sensitivityTier || 'standard',
    requiresOptIn: rawRule.requiresOptIn,
    optInKey: rawRule.optInKey,
    typeCompatible: (type: string, tagName: string) =>
      defaultTypeCompatible(type, tagName, rawRule.allowedTypes, rawRule.allowedTags),
    exactPhrases: rawRule.exactPhrases || [],
    regexPatterns: (rawRule.regexPatterns || []).map((pat: string) => new RegExp(pat, 'i')),
    autocompleteTokens: rawRule.autocompleteTokens || [],
    negativePatterns: rawRule.negativePatterns
      ? rawRule.negativePatterns.map((pat: string) => new RegExp(pat, 'i'))
      : undefined
  };
}

export const FIELD_RULES = compiledRules;

export const arrayShapeSignatures = {
  education: ['school', 'degree', 'major', 'date', 'gpa', 'university', 'college'],
  experience: ['company', 'title', 'location', 'date', 'description', 'employer'],
  references: ['name', 'relationship', 'company', 'email', 'phone', 'relation']
};
