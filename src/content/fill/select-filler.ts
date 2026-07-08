import { bestMatch } from '../matching/fuzzy.js';

export function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const options = Array.from(el.options);
  if (options.length === 0) return false;

  let matchIndex = options.findIndex(
    opt => (opt.text || opt.value || '').trim().toLowerCase() === value.toLowerCase()
  );

  if (matchIndex === -1) {
    const optionTexts = options.map(opt => (opt.text || opt.value || '').trim());
    const matchRes = bestMatch(optionTexts, value);
    if (matchRes.score > 0.6) {
      matchIndex = matchRes.index;
    }
  }

  if (matchIndex !== -1) {
    const matchedValue = options[matchIndex].value;
    
    const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    const nativeSetter = descriptor?.set;
    
    if (nativeSetter) {
      nativeSetter.call(el, matchedValue);
    } else {
      el.value = matchedValue;
    }
    
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}
