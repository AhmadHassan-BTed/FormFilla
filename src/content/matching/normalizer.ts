import { FieldSignals } from '../../shared/types/index.js';
import { ABBREVIATION_MAP } from '../../shared/constants/constants.js';

export function tokenize(text: string): string[] {
  let formatted = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase();

  formatted = formatted.replace(/[^a-z0-9\s]/g, ' ');

  const rawTokens = formatted.split(/\s+/).filter(t => t.length > 0);

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

  const combinedText = sources.filter(s => s.trim() !== '').join(' ');
  return tokenize(combinedText);
}
