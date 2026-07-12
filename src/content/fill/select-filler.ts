import { bestMatch } from '../matching/fuzzy.js';

export function fillSelect(el: HTMLSelectElement, value: string | string[]): boolean {
  const options = Array.from(el.options);
  if (options.length === 0) return false;

  const isMultiple = el.multiple || Array.isArray(value);
  const valuesToSelect = Array.isArray(value) ? value : [value];

  let anySelected = false;

  // Clear selections first if we are doing multiple selections
  if (isMultiple) {
    for (const opt of options) {
      opt.selected = false;
    }
  }

  for (const singleVal of valuesToSelect) {
    if (typeof singleVal !== 'string') continue;
    const lowerVal = singleVal.trim().toLowerCase();
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
        opt => (opt.text || opt.value || '').trim().toLowerCase() === singleVal.toLowerCase()
      );
    }

    if (matchIndex === -1) {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const valLower = singleVal.toLowerCase().trim();
      const monthIdx = months.findIndex(m => m.startsWith(valLower) || (valLower.length >= 3 && m.includes(valLower)));
      if (monthIdx !== -1) {
        const monthNumStr = (monthIdx + 1).toString();
        const monthNumPadded = monthNumStr.padStart(2, '0');
        matchIndex = options.findIndex(opt => {
          const valStr = (opt.value || '').trim().toLowerCase();
          const textStr = (opt.text || '').trim().toLowerCase();
          return valStr === monthNumStr || valStr === monthNumPadded ||
                 textStr === monthNumStr || textStr === monthNumPadded;
        });
      }
    }

    if (matchIndex === -1) {
      const optionTexts = options.map(opt => (opt.text || opt.value || '').trim());
      const matchRes = bestMatch(optionTexts, singleVal);
      if (matchRes.score > 0.6) {
        matchIndex = matchRes.index;
      }
    }

    if (matchIndex !== -1) {
      if (isMultiple) {
        options[matchIndex].selected = true;
        anySelected = true;
      } else {
        const matchedValue = options[matchIndex].value;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        const nativeSetter = descriptor?.set;
        if (nativeSetter) {
          nativeSetter.call(el, matchedValue);
        } else {
          el.value = matchedValue;
        }
        anySelected = true;
        break;
      }
    }
  }

  if (anySelected) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}
