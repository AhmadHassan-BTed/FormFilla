import { bestMatch } from '../matching/fuzzy.js';

export async function fillCombobox(triggerEl: Element, value: string): Promise<boolean> {
  try {
    const htmlTrigger = triggerEl as HTMLElement;
    htmlTrigger.click();

    await new Promise(requestAnimationFrame);

    const proxyInput = (triggerEl.querySelector('input') || triggerEl) as HTMLElement;

    if (proxyInput instanceof HTMLInputElement) {
      proxyInput.value = '';
      proxyInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    for (const char of value) {
      dispatchKeyEvent(proxyInput, 'keydown', char);
      dispatchKeyEvent(proxyInput, 'keypress', char);
      
      if (proxyInput instanceof HTMLInputElement) {
        proxyInput.value += char;
        proxyInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      dispatchKeyEvent(proxyInput, 'keyup', char);
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const options = await waitForElements('[role="option"], li[data-option], .select2-results__option, .autocomplete-suggestion', 1500);
    
    if (options.length > 0) {
      const optionTexts = options.map(opt => (opt.textContent || '').trim());
      const matchRes = bestMatch(optionTexts, value);

      if (matchRes.score > 0.6) {
        const selectedOption = options[matchRes.index] as HTMLElement;
        selectedOption.click();
        return true;
      }
    }

    dispatchKeyEvent(proxyInput, 'keydown', 'Escape');
    dispatchKeyEvent(proxyInput, 'keyup', 'Escape');
    return false;
  } catch (err) {
    console.error('Failed to fill combobox:', err);
    return false;
  }
}

function dispatchKeyEvent(el: HTMLElement, eventName: string, key: string) {
  const keyCode = key === 'Escape' ? 27 : key.charCodeAt(0);
  const ev = new KeyboardEvent(eventName, {
    key,
    code: key === 'Escape' ? 'Escape' : `Key${key.toUpperCase()}`,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true
  });
  el.dispatchEvent(ev);
}

async function waitForElements(selector: string, timeoutMs: number): Promise<Element[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const els = Array.from(document.querySelectorAll(selector));
    if (els.length > 0) {
      return els;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return [];
}
