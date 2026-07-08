import { bestMatch } from '../matching/fuzzy.js';

export function fillChoiceGroup(elements: Element[], value: string): boolean {
  if (elements.length === 0) return false;

  const optionsInfo = elements.map(el => {
    const htmlEl = el as HTMLInputElement;
    let labelText = '';

    // Try finding label via "for" attribute
    if (htmlEl.id) {
      const label = document.querySelector(`label[for="${htmlEl.id}"]`);
      if (label && label.textContent) {
        labelText = label.textContent.trim();
      }
    }

    // Try finding wrapping label
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

    // Fallback to value or name
    if (!labelText) {
      labelText = htmlEl.value || htmlEl.name || '';
    }

    return { element: htmlEl, labelText };
  });

  const lowerVal = value.toLowerCase().trim();
  const isTrueVal = ['true', 'yes', 'y', '1'].includes(lowerVal);
  const isFalseVal = ['false', 'no', 'n', '0'].includes(lowerVal);

  // Special handling for boolean fields (Yes/No prompts)
  if (isTrueVal || isFalseVal) {
    for (const opt of optionsInfo) {
      const optText = opt.labelText.toLowerCase();
      if (isTrueVal && (optText === 'yes' || optText === 'y' || optText === 'true')) {
        opt.element.click();
        return true;
      }
      if (isFalseVal && (optText === 'no' || optText === 'n' || optText === 'false')) {
        opt.element.click();
        return true;
      }
    }
  }

  // Normal matching
  const texts = optionsInfo.map(o => o.labelText);
  const matchRes = bestMatch(texts, value);

  if (matchRes.score > 0.6) {
    optionsInfo[matchRes.index].element.click();
    return true;
  }

  return false;
}
