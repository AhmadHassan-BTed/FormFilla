import { bestMatch } from '../matching/fuzzy.js';

export function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const options = Array.from(el.options);
  if (options.length === 0) return false;

  const lowerVal = value.trim().toLowerCase();
  const isTrueVal = ['true', 'yes', 'y', '1'].includes(lowerVal);
  const isFalseVal = ['false', 'no', 'n', '0'].includes(lowerVal);

  let matchIndex = -1;

  if (isTrueVal || isFalseVal) {
    const yesPattern = /\byes\b|\btrue\b|\bagree\b|\baccept\b|\bauthorized\b|\bwilling\b|\bwill\b/i;
    const noPattern = /\bno\b|\bfalse\b|\bdisagree\b|\bdecline\b|\bunauthorized\b|\bnot\b/i;

    if (isTrueVal) {
      matchIndex = options.findIndex(opt => {
        const text = (opt.text || opt.value || '').trim();
        return yesPattern.test(text) && !noPattern.test(text);
      });
    } else {
      matchIndex = options.findIndex(opt => {
        const text = (opt.text || opt.value || '').trim();
        return noPattern.test(text);
      });
    }
  }

  if (matchIndex === -1) {
    matchIndex = options.findIndex(
      opt => (opt.text || opt.value || '').trim().toLowerCase() === value.toLowerCase()
    );
  }

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
