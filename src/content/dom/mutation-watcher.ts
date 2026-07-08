import { DEBOUNCE_MS } from '../../shared/constants/constants.js';
import { scanForFields } from './field-scanner.js';
import { DateFieldGroup } from '../../shared/types/index.js';

export function watch(
  root: Node,
  onNewFields: (newFields: (Element | DateFieldGroup)[]) => void
): () => void {
  const pending = new Set<Element>();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timeoutId = null;
    const nodes = Array.from(pending);
    pending.clear();

    const newFields: (Element | DateFieldGroup)[] = [];
    for (const node of nodes) {
      const fields = scanForFields(node);
      newFields.push(...fields);
    }

    if (newFields.length > 0) {
      onNewFields(newFields);
    }
  };

  const observer = new MutationObserver(mutations => {
    let hasAdditions = false;
    for (const m of mutations) {
      for (let i = 0; i < m.addedNodes.length; i++) {
        const node = m.addedNodes[i];
        if (node.nodeType === Node.ELEMENT_NODE) {
          pending.add(node as Element);
          hasAdditions = true;
        }
      }
    }

    if (hasAdditions) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(flush, DEBOUNCE_MS);
    }
  });

  observer.observe(root, { childList: true, subtree: true });

  return () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    observer.disconnect();
  };
}
