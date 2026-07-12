import { JSDOM } from 'jsdom';
import { scanForFields } from '../src/content/dom/field-scanner.js';
import { detectRepeatedBlocks } from '../src/content/dom/repeated-block.js';
import { extractSignals } from '../src/content/dom/signal-extractor.js';
import { resolveAllFields } from '../src/content/matching/scorer.js';
import { test, expect } from 'vitest';

test('diagnose city and state matching', () => {
  const html = `
    <form>
      <div>
        <label>First name</label>
        <input type="text" name="first_name" id="fn">
      </div>
      <div>
        <label>Last name</label>
        <input type="text" name="last_name" id="ln">
      </div>
      <div>
        <label>Street address</label>
        <input type="text" name="street" id="addr">
      </div>
      <div>
        <label>City</label>
        <input type="text" name="city_input" id="city">
      </div>
      <div>
        <label>State</label>
        <select name="state_select" id="state">
          <option>Choose...</option>
          <option>Punjab</option>
          <option>Federal</option>
        </select>
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
    address: {
      street: 'KH-308, Street no 3, Farooq-e-Azam Road, Shamsabad',
      city: 'Islamabad',
      state: 'Federal',
      postalCode: '45740',
      country: 'Pakistan'
    }
  };

  const scoredFields = resolveAllFields(fieldsWithSignals, mockProfile as any);

  console.log("\nCity/State Match results:");
  for (const sf of scoredFields) {
    const el = sf.element as any;
    console.log(`- Field ${el.tagName} (id=${el.id}, name=${el.name}) -> Key: ${sf.key} [Gate: ${sf.gate}, Score: ${sf.score}]`);
  }

  const cityMatch = scoredFields.find(f => f.key === 'address.city');
  const stateMatch = scoredFields.find(f => f.key === 'address.state');

  expect(cityMatch).toBeDefined();
  expect(stateMatch).toBeDefined();
});
