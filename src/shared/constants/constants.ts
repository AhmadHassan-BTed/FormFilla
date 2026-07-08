import rawAbbreviations from './abbreviations.json' with { type: 'json' };
import rawDegrees from './degrees.json' with { type: 'json' };

export const HIGH_THRESHOLD = 70;
export const LOW_THRESHOLD = 40;
export const DEBOUNCE_MS = 400;

export const CONFIRM_PATTERN = /confirm|repeat|verify/i;

const compiledAbbreviations: Record<string, string> = {};
for (const [key, val] of Object.entries(rawAbbreviations)) {
  if (key.startsWith('__')) continue;
  compiledAbbreviations[key] = val as string;
}

const compiledDegrees: Record<string, number> = {};
for (const [key, val] of Object.entries(rawDegrees)) {
  if (key.startsWith('__')) continue;
  compiledDegrees[key] = val as number;
}

export const ABBREVIATION_MAP = compiledAbbreviations;
export const DEGREE_RANK = compiledDegrees;
