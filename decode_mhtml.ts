import fs from 'fs';
import { JSDOM } from 'jsdom';
import { scanForFields } from './src/content/dom/field-scanner.js';
import { detectRepeatedBlocks } from './src/content/dom/repeated-block.js';
import { extractSignals } from './src/content/dom/signal-extractor.js';
import { resolveAllFields } from './src/content/matching/scorer.js';
import { test, expect } from 'vitest';

test('debug Airblue page fields', () => {
  // Decodes quoted-printable string
  function decodeQuotedPrintable(str: string): string {
    let decoded = str.replace(/=\r?\n/g, '');
    decoded = decoded.replace(/=([0-9A-F]{2})/gi, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    decoded = decoded.replace(/=3D/g, '=');
    return decoded;
  }

  const mhtmlPath = './.sample_webpage/_ _ _ airline _ _ _ Opportunities.mhtml';
  const rawContent = fs.readFileSync(mhtmlPath, 'utf-8');

  const boundaryMatch = rawContent.match(/boundary="([^"]+)"/);
  if (!boundaryMatch) {
    throw new Error("Boundary not found");
  }

  const boundary = boundaryMatch[1];
  const parts = rawContent.split('--' + boundary);

  const htmlPart = parts.find(p => p.includes('Content-Type: text/html'));
  if (!htmlPart) {
    throw new Error("HTML part not found");
  }

  const separatorIndex = htmlPart.indexOf('\r\n\r\n');
  const body = htmlPart.substring(separatorIndex + 4);
  const cleanHtml = decodeQuotedPrintable(body);

  fs.writeFileSync('./clean_webpage.html', cleanHtml);
  console.log("Decoded HTML written to clean_webpage.html");

  const dom = new JSDOM(cleanHtml);
  globalThis.window = dom.window as any;
  globalThis.document = dom.window.document as any;
  globalThis.Element = dom.window.Element as any;
  globalThis.Node = dom.window.Node as any;
  globalThis.NodeFilter = dom.window.NodeFilter as any;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement as any;
  globalThis.HTMLSelectElement = dom.window.HTMLSelectElement as any;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement as any;

  dom.window.Element.prototype.getBoundingClientRect = function() {
    return { width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100 } as any;
  };

  const defaultGetComputedStyle = dom.window.getComputedStyle;
  dom.window.getComputedStyle = function(el) {
    const s = defaultGetComputedStyle(el);
    s.display = 'block';
    s.visibility = 'visible';
    return s;
  } as any;

  globalThis.chrome = {
    runtime: { id: 'mock' }
  } as any;

  const fields = scanForFields(dom.window.document.body);
  console.log(`\nScan complete. Found ${fields.length} candidate fields.`);

  const blocks = detectRepeatedBlocks(dom.window.document.body);
  console.log(`Found ${blocks.length} repeated blocks.`);

  const fieldsWithSignals = fields.map(f => {
    if (f.type === 'date-group') {
      return {
        element: f,
        signals: {
          id: f.container.id || f.monthEl.id || undefined,
          name: f.container.getAttribute('name') || f.monthEl.getAttribute('name') || undefined,
          type: 'date',
          tagName: 'INPUT',
          label: 'Birth Date'
        } as any
      };
    }
    return {
      element: f,
      signals: extractSignals(f as Element, blocks)
    };
  });

  const mockProfile = {
    personal: {
      firstName: 'Ahmad',
      lastName: 'Hassan',
      email: 'ahmadhassan.bted@gmail.com',
      phone: '+923225522383'
    },
    optIns: {
      sensitiveEeo: true,
      autoFillCritical: true
    }
  };

  const scoredFields = resolveAllFields(fieldsWithSignals, mockProfile);

  console.log("\nMatch results:");
  console.log("==========================================");
  for (const sf of scoredFields) {
    const idStr = sf.element.id || sf.element.name || sf.element.tagName;
    console.log(`- Field: ${idStr} -> Key: ${sf.key} [Gate: ${sf.gate}, Confidence: ${sf.confidence}, Score: ${sf.score}]`);
  }

  console.log("\nUnmapped fields:");
  console.log("==========================================");
  const mappedElements = new Set(scoredFields.map(sf => sf.element));
  for (const f of fields) {
    if (f.type === 'date-group') {
      if (!mappedElements.has(f as any)) {
        console.log(`- Date Group container: ${f.container.id || f.container.className}`);
      }
      continue;
    }
    if (!mappedElements.has(f)) {
      const label = f.labels?.[0]?.textContent || f.getAttribute('name') || f.id || f.tagName;
      const parentText = f.parentElement?.textContent?.trim().replace(/\s+/g, ' ').substring(0, 80);
      console.log(`- Tag: ${f.tagName}, type: ${f.type || 'N/A'}, id: ${f.id || 'N/A'}, name: ${f.getAttribute('name') || 'N/A'}, label text: "${label}", Context: "${parentText}"`);
    }
  }
  
  expect(true).toBe(true);
});
