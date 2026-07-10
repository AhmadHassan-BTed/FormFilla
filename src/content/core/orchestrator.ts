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

export function startOrchestrator() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_FILL') {
      (async () => {
        try {
          const profile = await getProfile();
          const fields = scanForFields(document.body);
          const results = await processFields(fields, profile);

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

  watch(document.body, async (newFields) => {
    try {
      // Guard: extension context may have been invalidated (e.g. after reload)
      if (!chrome?.runtime?.id) {
        console.warn('FormFilla: Extension context invalidated, skipping dynamic fill.');
        return;
      }
      const profile = await getProfile();
      if (profile && profile.personal && profile.personal.email) {
        await processFields(newFields, profile);
      }
    } catch (err) {
      // Suppress "Extension context invalidated" errors silently
      if (err instanceof Error && err.message.includes('Extension context invalidated')) {
        console.warn('FormFilla: Extension context invalidated, dynamic fill stopped.');
        return;
      }
      console.error('Error filling dynamic fields:', err);
    }
  });

  console.log('FormFilla content script active.');
}
export { getValueByPath };
