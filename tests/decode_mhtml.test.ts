import fs from 'fs';
import { JSDOM } from 'jsdom';
import { scanForFields } from '../src/content/dom/field-scanner.js';
import { detectRepeatedBlocks } from '../src/content/dom/repeated-block.js';
import { extractSignals } from '../src/content/dom/signal-extractor.js';
import { resolveAllFields } from '../src/content/matching/scorer.js';
import { test } from 'vitest';

test('debug Airblue page fields', () => {
  function decodeQuotedPrintable(str: string): string {
    let decoded = str.replace(/=\r?\n/g, '');
    decoded = decoded.replace(/=([0-9A-F]{2})/gi, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    return decoded;
  }

  const mhtmlPath = 'p:\\JobApplier\\.sample_webpage\\_ _ _ airline _ _ _ Opportunities.mhtml';
  const mhtmlContent = fs.readFileSync(mhtmlPath, 'utf8');

  // Simple extraction of the HTML part from MHTML
  const htmlParts = mhtmlContent.split('Content-Type: text/html');
  if (htmlParts.length < 2) {
    throw new Error('No HTML part found in MHTML');
  }
  const bodyPart = htmlParts[1].split('------=')[0];
  const bodyContent = bodyPart.substring(bodyPart.indexOf('\n\n') + 2);
  const html = decodeQuotedPrintable(bodyContent);

  const dom = new JSDOM(html, { url: 'https://www.airblue.com/Jobs/openings-app.asp?esid=160' });
  const doc = dom.window.document;

  // Mock getBoundingClientRect
  dom.window.Element.prototype.getBoundingClientRect = function() {
    return {
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {}
    };
  };

  const fields = scanForFields(doc);
  const blocks = detectRepeatedBlocks(doc);

  const fieldsWithSignals = fields.map(f => {
    if ('type' in f && f.type === 'date-group') {
      return {
        element: f as any,
        signals: {
          id: f.container.id || f.monthEl.id || undefined,
          name: f.container.getAttribute('name') || f.monthEl.getAttribute('name') || undefined,
          type: 'date',
          tagName: 'INPUT',
          label: 'Birth Date',
          blockIndex: undefined,
          blockType: undefined
        } as any
      };
    } else {
      const signals = extractSignals(f as Element, blocks);
      return { element: f as Element, signals };
    }
  });

  const mockProfile = {
    personal: {
      firstName: 'Ahmad',
      lastName: 'Hassan',
      middleName: 'M.',
      email: 'ahmadhassan.bted@gmail.com',
      phone: '+923225522383',
      dateOfBirth: '1995-10-12',
      nationalId: '37405-1234567-8',
      namePrefix: 'Mr'
    },
    family: {
      fatherName: 'Hassan Shah'
    },
    languages: [
      { language: 'English', proficiency: 'Native' },
      { language: 'Urdu', proficiency: 'Native' }
    ],
    optIns: {
      sensitiveEeo: true,
      autoFillCritical: true
    }
  };

  const scoredFields = resolveAllFields(fieldsWithSignals, mockProfile as any);

  console.log("\nMatch results:");
  console.log("==========================================");
  for (const sf of scoredFields) {
    const el = sf.element as any;
    const nameOrId = el.name || el.id || (el.type === 'date-group' ? 'date-group' : 'unknown');
    console.log(`- Field: ${nameOrId} -> Key: ${sf.key} [Gate: ${sf.gate}, Confidence: ${sf.confidence}, Score: ${sf.score}]`);
  }
});
