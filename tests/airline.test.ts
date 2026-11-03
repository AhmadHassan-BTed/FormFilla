import { JSDOM } from 'jsdom';
import { scanForFields } from '../src/content/dom/field-scanner.js';
import { detectRepeatedBlocks } from '../src/content/dom/repeated-block.js';
import { extractSignals } from '../src/content/dom/signal-extractor.js';
import { resolveAllFields } from '../src/content/matching/scorer.js';
import { getValueByPath } from '../src/content/core/value-path.js';
import { test, expect } from 'vitest';

test('diagnose airline opportunities files section', () => {
  const html = `
    <form>
      <div>
        <label>Attach Photograph</label>
        <input type="file" name="photograph" id="photograph">
      </div>
      <div>
        <label>Attach Photo ID (CNIC)</label>
        <input type="file" name="photo_id" id="photo_id">
      </div>
      <div>
        <label>Attach educational document files (Resume, CV, Certificates, etc.)</label>
        <input type="file" name="files" id="files">
      </div>
    </form>
  `;

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  dom.window.Element.prototype.getBoundingClientRect = function() {
    return { width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 } as any;
  };

  const fields = scanForFields(doc);
  const blocks = detectRepeatedBlocks(doc);
  const fieldsWithSignals = fields.map(f => ({
    element: f as Element,
    signals: extractSignals(f as Element, blocks)
  }));

  const mockProfile = {
    documents: {
      "documents.resume": { name: 'resume.pdf' },
      "documents.photo": { name: 'photo.jpg' },
      "documents.cnic": { name: 'cnic.pdf' }
    }
  };

  const scoredFields = resolveAllFields(fieldsWithSignals, mockProfile as any);

  console.log("\nAirline Match results:");
  for (const sf of scoredFields) {
    const el = sf.element as any;
    console.log(`- Field ${el.tagName} (id=${el.id}, name=${el.name}) -> Key: ${sf.key} [Gate: ${sf.gate}, Score: ${sf.score}]`);
  }

  const resumeMatch = scoredFields.find(f => f.key === 'documents.resume');
  const photoMatch = scoredFields.find(f => f.key === 'documents.photo');

  expect(resumeMatch).toBeDefined();
  expect(photoMatch).toBeDefined();

  // Test getValueByPath with the fix
  const resumeMeta = getValueByPath(mockProfile, 'documents.resume');
  expect(resumeMeta).toBeDefined();
  expect(resumeMeta.name).toBe('resume.pdf');
});
