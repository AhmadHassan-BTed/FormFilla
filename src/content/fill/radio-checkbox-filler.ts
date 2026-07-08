import { bestMatch } from '../matching/fuzzy.js';

export function fillChoiceGroup(elements: Element[], value: string): boolean {
  if (elements.length === 0) return false;

  const optionsInfo = elements.map(el => {
    const htmlEl = el as HTMLInputElement;
    let labelText = '';

    if (htmlEl.id) {
      const label = document.querySelector(`label[for="${htmlEl.id}"]`);
      if (label && label.textContent) {
        labelText = label.textContent.trim();
      }
    }

    if (!labelText) {
      let parent = htmlEl.parentElement;
      while (parent) {
        if (parent.tagName === 'LABEL') {
          labelText = parent.textContent ? parent.textContent.trim() : '';
          break;
        }
        parent = parent.parentElement;
      }
    }

    if (!labelText) {
      labelText = htmlEl.value || htmlEl.name || '';
    }

    return { element: htmlEl, labelText };
  });

  const lowerVal = value.toLowerCase().trim();
  const isTrueVal = ['true', 'yes', 'y', '1'].includes(lowerVal);
  const isFalseVal = ['false', 'no', 'n', '0'].includes(lowerVal);

  if (isTrueVal || isFalseVal) {
    const yesPattern = /\byes\b|\btrue\b|\bagree\b|\baccept\b|\bauthorized\b|\bwilling\b|\bwill\b/i;
    const noPattern = /\bno\b|\bfalse\b|\bdisagree\b|\bdecline\b|\bunauthorized\b|\bnot\b/i;

    let foundIndex = -1;
    if (isTrueVal) {
      foundIndex = optionsInfo.findIndex(opt => {
        const text = opt.labelText;
        return yesPattern.test(text) && !noPattern.test(text);
      });
    } else {
      foundIndex = optionsInfo.findIndex(opt => {
        const text = opt.labelText;
        return noPattern.test(text);
      });
    }

    if (foundIndex !== -1) {
      optionsInfo[foundIndex].element.click();
      return true;
    }
  }

  const texts = optionsInfo.map(o => o.labelText);
  const matchRes = bestMatch(texts, value);

  if (matchRes.score > 0.6) {
    optionsInfo[matchRes.index].element.click();
    return true;
  }

  return false;
}
