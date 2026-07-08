import { FieldSignals } from '../../shared/types.js';
import { ABBREVIATION_MAP } from '../../shared/constants.js';

export function tokenize(text: string): string[] {
  // Convert camelCase to space separated, replace hyphens and underscores with spaces
  let formatted = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase();

  // Strip non-alphanumeric except spaces
  formatted = formatted.replace(/[^a-z0-9\s]/g, ' ');

  // Split on whitespace
  const rawTokens = formatted.split(/\s+/).filter(t => t.length > 0);

  // Expand abbreviations
  const expandedTokens: string[] = [];
  for (const token of rawTokens) {
    if (ABBREVIATION_MAP[token]) {
      const expanded = ABBREVIATION_MAP[token].split(/\s+/);
      expandedTokens.push(...expanded);
    } else {
      expandedTokens.push(token);
    }
  }

  return expandedTokens;
}

export function normalize(signals: FieldSignals): string[] {
  const sources = [
    signals.label || '',
    signals.placeholder || '',
    signals.name || '',
    signals.id || '',
    signals.legend || '',
    signals.autocomplete || ''
  ];

  // Join all with spaces and tokenize
  const combinedText = sources.filter(s => s.trim() !== '').join(' ');
  return tokenize(combinedText);
}
