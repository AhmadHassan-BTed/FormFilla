import { RepeatedBlock } from '../../shared/types.js';
import { scanForFields } from './field-scanner.js';
import { arrayShapeSignatures } from '../matching/dictionary.js';
import { tokenize } from '../matching/normalizer.js';

export function detectRepeatedBlocks(root: Document | Element): RepeatedBlock[] {
  const blocks: RepeatedBlock[] = [];
  
  // 1. Gather all fillable fields
  const allFields = scanForFields(root);
  const elements = allFields.map(f => {
    if ('type' in f && f.type === 'date-group') {
      return f.container;
    }
    return f as Element;
  });

  // 2. Find ancestors and identify candidate containers.
  // We look for parents that have 2 or more child elements (siblings),
  // where each child contains 2 or more form elements.
  const parentCandidates = new Set<Element>();
  elements.forEach(el => {
    let parent = el.parentElement;
    while (parent && parent !== root) {
      parentCandidates.add(parent);
      parent = parent.parentElement;
    }
  });

  const repeatedBlockGroups: Element[][] = [];

  for (const parent of parentCandidates) {
    const siblings = Array.from(parent.children);
    if (siblings.length < 2) continue;

    // Filter siblings that contain >= 2 fields
    const validSiblings = siblings.filter(sib => {
      const sibFields = scanForFields(sib);
      return sibFields.length >= 2;
    });

    if (validSiblings.length >= 2) {
      // Fingerprint each sibling based on child field tags and types
      const fingerprintMap = new Map<string, Element[]>();
      
      for (const sib of validSiblings) {
        const sibFields = scanForFields(sib);
        const fingerprint = sibFields.map(f => {
          if ('type' in f && f.type === 'date-group') {
            return 'date-group';
          }
          const el = f as HTMLInputElement;
          return `${el.tagName}:${el.type || 'text'}`;
        }).join('|');

        if (!fingerprintMap.has(fingerprint)) {
          fingerprintMap.set(fingerprint, []);
        }
        fingerprintMap.get(fingerprint)!.push(sib);
      }

      // Keep groups of size >= 2
      for (const [_, group] of fingerprintMap.entries()) {
        if (group.length >= 2) {
          // Avoid nested/duplicate group registrations by checking if any sibling
          // in the group is already registered.
          const alreadyRegistered = repeatedBlockGroups.some(g => 
            g.some(el => group.includes(el))
          );
          if (!alreadyRegistered) {
            repeatedBlockGroups.push(group);
          }
        }
      }
    }
  }

  // 3. Classify groups and build RepeatedBlock items
  for (const group of repeatedBlockGroups) {
    // Sort by document position
    group.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    // Determine type: education, experience, references
    const arrayKey = classifyBlockType(group[0]);

    group.forEach((container, index) => {
      // Find all elements inside this container
      const fieldsInContainer: Element[] = [];
      const scanned = scanForFields(container);
      scanned.forEach(f => {
        if ('type' in f && f.type === 'date-group') {
          fieldsInContainer.push(f.monthEl, f.dayEl, f.yearEl);
        } else {
          fieldsInContainer.push(f as Element);
        }
      });

      blocks.push({
        index,
        arrayKey,
        container,
        fields: fieldsInContainer
      });
    });
  }

  return blocks;
}

function classifyBlockType(container: Element): 'education' | 'experience' | 'references' {
  // Extract text from labels, names, ids inside the container
  const fields = scanForFields(container);
  const textSignals: string[] = [];

  fields.forEach(f => {
    if ('type' in f && f.type === 'date-group') {
      textSignals.push(f.container.textContent || '');
    } else {
      const el = f as HTMLElement;
      textSignals.push(el.id || '', el.getAttribute('name') || '', el.getAttribute('placeholder') || '');
      // Find label
      const label = findLabelText(el);
      if (label) textSignals.push(label);
    }
  });

  const combinedText = textSignals.join(' ').toLowerCase();
  const tokens = tokenize(combinedText);

  // Score each category based on signature hits
  let bestScore = -1;
  let bestCategory: 'education' | 'experience' | 'references' = 'education';

  for (const [category, keywords] of Object.entries(arrayShapeSignatures)) {
    let score = 0;
    for (const token of tokens) {
      if (keywords.includes(token)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as 'education' | 'experience' | 'references';
    }
  }

  return bestCategory;
}

function findLabelText(el: HTMLElement): string | null {
  // Try <label for="...">
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent;
  }
  // Try wrapping label
  let parent = el.parentElement;
  while (parent) {
    if (parent.tagName === 'LABEL') {
      return parent.textContent;
    }
    parent = parent.parentElement;
  }
  // Try aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  
  return null;
}
