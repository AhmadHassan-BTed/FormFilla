import { getProfile, getFileBlob } from '../../shared/storage/storage-client.js';
import { scanForFields } from '../dom/field-scanner.js';
import { detectRepeatedBlocks } from '../dom/repeated-block.js';
import { extractSignals } from '../dom/signal-extractor.js';
import { resolveAllFields } from '../matching/scorer.js';
import { setNativeValue } from '../fill/native-setter.js';
import { fillSelect } from '../fill/select-filler.js';
import { fillChoiceGroup } from '../fill/radio-checkbox-filler.js';
import { fillDate } from '../fill/date-filler.js';
import { fillFileInput } from '../fill/file-filler.js';
import { fillCombobox } from '../fill/combobox-adapter.js';
import { tagField } from '../ui/review-highlighter.js';
import { watch } from '../dom/mutation-watcher.js';
import { FieldSignals, FillResult, ScoredField } from '../../shared/types/index.js';
import { getValueByPath } from './value-path.js';


export async function processFields(
  fields: any[],
  profile: any
): Promise<FillResult> {
  const fieldsWithSignals = fields.map(f => {
    if ('type' in f && f.type === 'date-group') {
      const blocks = detectRepeatedBlocks(document.body);
      const monthSignals = extractSignals(f.monthEl, blocks);
      const groupSignals: FieldSignals = {
        id: f.container.id || f.monthEl.id || undefined,
        name: f.container.getAttribute('name') || f.monthEl.getAttribute('name') || undefined,
        placeholder: f.monthEl.getAttribute('placeholder') || undefined,
        type: 'date',
        tagName: 'INPUT',
        label: monthSignals.label || undefined,
        legend: monthSignals.legend || undefined,
        blockIndex: monthSignals.blockIndex,
        blockType: monthSignals.blockType
      };
      return { element: f, signals: groupSignals };
    } else {
      const blocks = detectRepeatedBlocks(document.body);
      return { element: f as Element, signals: extractSignals(f as Element, blocks) };
    }
  });

  const scoredFields = resolveAllFields(fieldsWithSignals, profile);

  let confident = 0;
  let review = 0;
  let unmapped = 0;
  let needsConfirm = 0;

  const choiceGroups: Record<string, { elements: HTMLInputElement[]; scored: ScoredField[] }> = {};
  const singleFields: ScoredField[] = [];

  for (const sf of scoredFields) {
    const el = sf.element as HTMLElement;
    const isChoice = el.tagName === 'INPUT' &&
      ((el as HTMLInputElement).type === 'radio' || (el as HTMLInputElement).type === 'checkbox');

    if (isChoice) {
      if (!choiceGroups[sf.key]) {
        choiceGroups[sf.key] = { elements: [], scored: [] };
      }
      choiceGroups[sf.key].elements.push(el as HTMLInputElement);
      choiceGroups[sf.key].scored.push(sf);
    } else {
      singleFields.push(sf);
    }
  }

  async function fillSingleField(sf: ScoredField, val: any): Promise<boolean> {
    if (val === undefined || val === null || val === '') return false;
    const el = sf.element;
    const tagName = el.tagName.toUpperCase();

    if ('type' in el && (el as any).type === 'date-group') {
      return fillDate(el as any, String(val));
    }

    if (tagName === 'SELECT') {
      return fillSelect(el as HTMLSelectElement, String(val));
    }

    if (el.getAttribute('role') === 'combobox' || el.classList.contains('select2') || el.classList.contains('combobox')) {
      return await fillCombobox(el, String(val));
    }

    if (tagName === 'INPUT' && (el as HTMLInputElement).type === 'file') {
      const docMetadata = getValueByPath(profile, sf.key);
      if (docMetadata && docMetadata.name) {
        try {
          const fileBytes = await getFileBlob(sf.key);
          if (fileBytes) {
            return await fillFileInput(el as HTMLInputElement, fileBytes, docMetadata.name, docMetadata.type);
          }
        } catch (e) {
          console.warn(`Could not load binary bytes for ${sf.key} from database`, e);
        }
      }
      return false;
    }

    if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
      setNativeValue(el as HTMLInputElement | HTMLTextAreaElement, String(val));
      return true;
    }

    return false;
  }

  for (const sf of singleFields) {
    const value = getValueByPath(profile, sf.key);

    if (sf.gate === 'confident') confident++;
    else if (sf.gate === 'review') review++;
    else if (sf.gate === 'needs-confirm') needsConfirm++;
    else unmapped++;

    if (sf.gate === 'needs-confirm') {
      tagField(sf.element, sf.gate, async () => {
        await fillSingleField(sf, value);
      });
    } else if (sf.gate === 'confident' || sf.gate === 'review') {
      const ok = await fillSingleField(sf, value);
      if (ok) {
        tagField(sf.element, sf.gate);
      } else {
        tagField(sf.element, 'unmapped');
      }
    } else {
      tagField(sf.element, 'unmapped');
    }

    await new Promise(requestAnimationFrame);
  }

  for (const [key, group] of Object.entries(choiceGroups)) {
    const value = getValueByPath(profile, key);
    const primaryGate = group.scored[0].gate;

    if (primaryGate === 'confident') confident++;
    else if (primaryGate === 'review') review++;
    else if (primaryGate === 'needs-confirm') needsConfirm++;
    else unmapped++;

    if (primaryGate === 'needs-confirm') {
      group.elements.forEach(el => {
        tagField(el, primaryGate, () => {
          fillChoiceGroup(group.elements, String(value));
        });
      });
    } else if (primaryGate === 'confident' || primaryGate === 'review') {
      const ok = fillChoiceGroup(group.elements, String(value));
      group.elements.forEach(el => {
        tagField(el, ok ? primaryGate : 'unmapped');
      });
    } else {
      group.elements.forEach(el => {
        tagField(el, 'unmapped');
      });
    }

    await new Promise(requestAnimationFrame);
  }

  return { confident, review, unmapped, needsConfirm };
}

let mutationWatcherCleanup: (() => void) | null = null;
let watcherActivated = false;

/**
 * Returns true once the extension's own context is gone — e.g. the
 * extension was reloaded/updated while this tab was already open.
 * Long-lived SPAs (WhatsApp Web, Gmail, Notion, etc.) never navigate,
 * so a content script injected before an update/reload just keeps
 * running with a dead connection to the extension.
 *
 * chrome.runtime.id is the reliable signal: it throws synchronously
 * the moment the context is invalidated. Other chrome.* calls (like
 * chrome.storage.local.get, used inside getProfile()) fail in less
 * consistent ways across Chrome versions — sometimes a rejected
 * promise, sometimes a synchronous throw, with wording that has
 * changed between releases — so they aren't safe to string-match on.
 * Checking chrome.runtime.id directly, at each point we care about,
 * is what actually catches every case.
 */
function isExtensionContextInvalidated(): boolean {
  try {
    return !chrome?.runtime?.id;
  } catch {
    return true;
  }
}

function stopWatcher(): void {
  if (mutationWatcherCleanup) {
    mutationWatcherCleanup();
    mutationWatcherCleanup = null;
  }
}

/**
 * Activate the mutation watcher to handle dynamically-loaded fields.
 * This is called after the first user-initiated fill so the watcher
 * does not run on irrelevant pages (e.g. WhatsApp, email, etc.).
 */
function activateWatcher(): void {
  if (watcherActivated) return;
  watcherActivated = true;

  mutationWatcherCleanup = watch(document.body, async (newFields) => {
    // Check #1: bail before touching any chrome.* API at all.
    if (isExtensionContextInvalidated()) {
      console.log('FormFilla: extension context invalidated, stopping dynamic fill watcher.');
      stopWatcher();
      return;
    }

    try {
      const profile = await getProfile();

      // Check #2: getProfile() awaits a chrome.storage call, so the
      // context can go invalid in the gap between check #1 and here.
      if (isExtensionContextInvalidated()) {
        console.log('FormFilla: extension context invalidated, stopping dynamic fill watcher.');
        stopWatcher();
        return;
      }

      if (profile?.personal?.email) {
        await processFields(newFields, profile);
      }
    } catch (err) {
      // Check #3: if the context is confirmed dead, this error is
      // expected — stop the watcher instead of retrying on every
      // subsequent DOM mutation (WhatsApp Web mutates constantly, so
      // without this the same failure would otherwise repeat forever).
      if (isExtensionContextInvalidated()) {
        stopWatcher();
        return;
      }
      // Context is still alive, so this is a real, unexpected failure.
      console.error('FormFilla: dynamic fill failed', err);
    }
  });
}

export function startOrchestrator() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_FILL') {
      (async () => {
        try {
          const profile = await getProfile();
          const fields = scanForFields(document.body);
          const results = await processFields(fields, profile);

          // Activate the mutation watcher after the first fill
          // so that multi-step forms are handled on subsequent steps
          activateWatcher();

          sendResponse({ type: 'FILL_RESULT', result: results });
        } catch (err) {
          console.error('Error during form fill execution:', err);
          sendResponse({
            type: 'FILL_RESULT',
            result: { confident: 0, review: 0, unmapped: 0, needsConfirm: 0 }
          });
        }
      })();
      return true;
    }
  });

  // No mutation watcher on startup — only activates after user triggers first fill.
  // This avoids running DOM observers on irrelevant pages (WhatsApp, email, etc.).

  console.log('FormFilla content script active. Use the popup to fill forms.');
}
export { getValueByPath };