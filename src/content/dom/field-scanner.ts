import { DateFieldGroup } from '../../shared/types.js';

export function scanForFields(root: Document | Element): (Element | DateFieldGroup)[] {
  const fields: (Element | DateFieldGroup)[] = [];
  const blockedOrigins = new Set<string>();

  // 1. Helper to recursively scan DOM and accessible iframes
  function traverse(node: Document | Element) {
    // Find all potential fields at this level
    const candidates = node.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), select, textarea, [contenteditable], [role=combobox], [role=radiogroup] input'
    );

    // Group date inputs/selects in this level if they appear together
    const processedElements = new Set<Element>();
    
    // Group three-part date fields (Month, Day, Year) in same containers
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
        // Try to identify month, day, and year elements
        let monthEl: HTMLSelectElement | HTMLInputElement | null = null;
        let dayEl: HTMLSelectElement | HTMLInputElement | null = null;
        let yearEl: HTMLSelectElement | HTMLInputElement | null = null;

        for (const child of children) {
          const name = (child.name || '').toLowerCase();
          const id = (child.id || '').toLowerCase();
          const placeholder = (child.getAttribute('placeholder') || '').toLowerCase();
          const text = (name + ' ' + id + ' ' + placeholder);

          // Test for month
          if (/month|mo\b|mm/i.test(text) || (child.tagName === 'SELECT' && hasSelectOptionMatching(child as HTMLSelectElement, /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i))) {
            if (!monthEl) monthEl = child;
          }
          // Test for day
          else if (/day|dd/i.test(text) || (child.tagName === 'SELECT' && hasSelectOptionMatching(child as HTMLSelectElement, /^[0-3]?\d$/) && !hasSelectOptionMatching(child as HTMLSelectElement, /19\d{2}|20\d{2}/))) {
            if (!dayEl) dayEl = child;
          }
          // Test for year
          else if (/year|yr|yyyy/i.test(text) || (child.tagName === 'SELECT' && hasSelectOptionMatching(child as HTMLSelectElement, /19\d{2}|20\d{2}/))) {
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

    // Add remaining fields that were not grouped into a date group
    candidates.forEach(el => {
      if (!processedElements.has(el)) {
        fields.push(el);
      }
    });

    // Check for iframes
    const iframes = node.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          traverse(iframeDoc);
        }
      } catch (err) {
        // Cross-origin iframe blocked
        if (iframe.src) {
          try {
            const url = new URL(iframe.src);
            blockedOrigins.add(url.origin);
          } catch {
            // Invalid URL in src
          }
        }
      }
    }
  }

  traverse(root);

  // Send message back if there are blocked cross-origin frames
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
