import { FieldSignals, RepeatedBlock, ArrayBlockType } from '../../shared/types/index.js';

export function extractSignals(el: Element, blocks: RepeatedBlock[]): FieldSignals {
  const htmlEl = el as HTMLElement;
  const tagName = el.tagName.toUpperCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  
  let label = findLabel(htmlEl);
  let legend = findLegend(el);

  let options: string[] = [];
  if (tagName === 'SELECT') {
    const select = el as HTMLSelectElement;
    options = Array.from(select.options).map(opt => (opt.text || opt.value || '').trim());
  }

  let blockIndex: number | undefined;
  let blockType: ArrayBlockType | undefined;

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
  if (el.id) {
    const doc = el.ownerDocument || document;
    const label = doc.querySelector(`label[for="${el.id}"]`);
    if (label && label.textContent) {
      return label.textContent.trim();
    }
  }

  let parent = el.parentElement;
  while (parent) {
    if (parent.tagName === 'LABEL') {
      return parent.textContent ? parent.textContent.trim() : null;
    }
    parent = parent.parentElement;
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel.trim();
  }

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const doc = el.ownerDocument || document;
    const labelElement = doc.getElementById(ariaLabelledBy);
    if (labelElement && labelElement.textContent) {
      return labelElement.textContent.trim();
    }
  }

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

  // Table cell layout fallback: if the element is inside a table cell (TD/TH),
  // check if there is a preceding cell in the same row containing text.
  const cell = el.closest('td, th');
  if (cell) {
    const row = cell.closest('tr');
    if (row) {
      const cells = Array.from((row as HTMLTableRowElement).cells);
      const cellIndex = cells.indexOf(cell as HTMLTableCellElement);
      if (cellIndex > 0) {
        for (let i = cellIndex - 1; i >= 0; i--) {
          const text = cells[i].textContent?.trim();
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
