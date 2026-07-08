import { DateFieldGroup } from '../../shared/types/index.js';

export function scanForFields(root: Document | Element): (Element | DateFieldGroup)[] {
  const fields: (Element | DateFieldGroup)[] = [];
  const blockedOrigins = new Set<string>();

  function traverse(node: Document | Element) {
    const candidates = node.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), select, textarea, [contenteditable], [role=combobox], [role=radiogroup] input'
    );

    const processedElements = new Set<Element>();
    const containers = new Set<Element>();
    
    candidates.forEach(el => {
      if (el.parentElement) {
        containers.add(el.parentElement);
      }
    });

    for (const container of containers) {
      const children = Array.from(container.children).filter(child => 
        child.tagName === 'SELECT' || 
        (child.tagName === 'INPUT' && !['hidden', 'submit', 'button', 'radio', 'checkbox'].includes((child as HTMLInputElement).type))
      ) as (HTMLSelectElement | HTMLInputElement)[];

      if (children.length >= 3) {
        let monthEl: HTMLSelectElement | HTMLInputElement | null = null;
        let dayEl: HTMLSelectElement | HTMLInputElement | null = null;
        let yearEl: HTMLSelectElement | HTMLInputElement | null = null;

        for (const child of children) {
          const name = (child.name || '').toLowerCase();
          const id = (child.id || '').toLowerCase();
          const placeholder = (child.getAttribute('placeholder') || '').toLowerCase();
          const text = (name + ' ' + id + ' ' + placeholder);

          if (/month|mo\b|mm/i.test(text) || (child.tagName === 'SELECT' && hasSelectOptionMatching(child as HTMLSelectElement, /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i))) {
            if (!monthEl) monthEl = child;
          } else if (/day|dd/i.test(text) || (child.tagName === 'SELECT' && hasSelectOptionMatching(child as HTMLSelectElement, /^[0-3]?\d$/) && !hasSelectOptionMatching(child as HTMLSelectElement, /19\d{2}|20\d{2}/))) {
            if (!dayEl) dayEl = child;
          } else if (/year|yr|yyyy/i.test(text) || (child.tagName === 'SELECT' && hasSelectOptionMatching(child as HTMLSelectElement, /19\d{2}|20\d{2}/))) {
            if (!yearEl) yearEl = child;
          }
        }

        if (monthEl && dayEl && yearEl) {
          fields.push({
            type: 'date-group',
            monthEl,
            dayEl,
            yearEl,
            container
          });
          processedElements.add(monthEl);
          processedElements.add(dayEl);
          processedElements.add(yearEl);
        }
      }
    }

    candidates.forEach(el => {
      if (!processedElements.has(el)) {
        fields.push(el);
      }
    });

    const iframes = node.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          traverse(iframeDoc);
        }
      } catch (err) {
        if (iframe.src) {
          try {
            const url = new URL(iframe.src);
            blockedOrigins.add(url.origin);
          } catch {
            // Ignored
          }
        }
      }
    }
  }

  traverse(root);

  if (blockedOrigins.size > 0 && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    blockedOrigins.forEach(origin => {
      chrome.runtime.sendMessage({
        type: 'PERMISSION_NEEDED',
        origin
      });
    });
  }

  return fields;
}

function hasSelectOptionMatching(select: HTMLSelectElement, regex: RegExp): boolean {
  for (let i = 0; i < select.options.length; i++) {
    const text = select.options[i].text || select.options[i].value;
    if (regex.test(text)) {
      return true;
    }
  }
  return false;
}
