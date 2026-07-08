import { FieldSignals, RepeatedBlock } from '../../shared/types.js';

export function extractSignals(el: Element, blocks: RepeatedBlock[]): FieldSignals {
  const htmlEl = el as HTMLElement;
  const tagName = el.tagName.toUpperCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  
  // 1. Resolve label text
  let label = findLabel(htmlEl);

  // 2. Resolve fieldset legend
  let legend = findLegend(el);

  // 3. Resolve select options if select element
  let options: string[] = [];
  if (tagName === 'SELECT') {
    const select = el as HTMLSelectElement;
    options = Array.from(select.options).map(opt => (opt.text || opt.value || '').trim());
  }

  // 4. Find if element is part of a repeated block
  let blockIndex: number | undefined;
  let blockType: 'education' | 'experience' | 'references' | undefined;

  for (const block of blocks) {
    if (block.fields.includes(el)) {
      blockIndex = block.index;
      blockType = block.arrayKey;
      break;
    }
  }

  return {
    id: el.id || undefined,
    name: el.getAttribute('name') || undefined,
    placeholder: el.getAttribute('placeholder') || undefined,
    autocomplete: el.getAttribute('autocomplete') || undefined,
    type: tagName === 'INPUT' ? type : tagName.toLowerCase(),
    tagName,
    label: label || undefined,
    legend: legend || undefined,
    options: options.length > 0 ? options : undefined,
    blockIndex,
    blockType
  };
}

function findLabel(el: HTMLElement): string | null {
  // A. Try label[for="id"]
  if (el.id) {
    const doc = el.ownerDocument || document;
    const label = doc.querySelector(`label[for="${el.id}"]`);
    if (label && label.textContent) {
      return label.textContent.trim();
    }
  }

  // B. Try wrapping <label>
  let parent = el.parentElement;
  while (parent) {
    if (parent.tagName === 'LABEL') {
      return parent.textContent ? parent.textContent.trim() : null;
    }
    parent = parent.parentElement;
  }

  // C. Try aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel.trim();
  }

  // D. Try aria-labelledby
  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const doc = el.ownerDocument || document;
    const labelElement = doc.getElementById(ariaLabelledBy);
    if (labelElement && labelElement.textContent) {
      return labelElement.textContent.trim();
    }
  }

  // E. Proximity fallback
  // Look at the text content of the immediately preceding sibling or parent text node
  let prev = el.previousElementSibling;
  if (prev && (prev.tagName === 'SPAN' || prev.tagName === 'LABEL' || prev.tagName === 'DIV')) {
    const text = prev.textContent?.trim();
    if (text) return text;
  }

  const parentEl = el.parentElement;
  if (parentEl) {
    const children = Array.from(parentEl.childNodes);
    const index = children.indexOf(el);
    if (index > 0) {
      for (let i = index - 1; i >= 0; i--) {
        const node = children[i];
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) return text;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const text = (node as Element).textContent?.trim();
          if (text) return text;
        }
      }
    }
  }

  return null;
}

function findLegend(el: Element): string | null {
  let parent = el.parentElement;
  while (parent) {
    if (parent.tagName === 'FIELDSET') {
      const legendEl = parent.querySelector('legend');
      if (legendEl && legendEl.textContent) {
        return legendEl.textContent.trim();
      }
    }
    parent = parent.parentElement;
  }
  return null;
}
