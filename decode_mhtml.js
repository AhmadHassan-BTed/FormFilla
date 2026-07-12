import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { scanForFields } from './src/content/dom/field-scanner.js';
import { detectRepeatedBlocks } from './src/content/dom/repeated-block.js';
import { extractSignals } from './src/content/dom/signal-extractor.js';
import { resolveAllFields } from './src/content/matching/scorer.js';
import { FIELD_RULES } from './src/shared/dictionary/rules.js';

// Decodes quoted-printable string
function decodeQuotedPrintable(str) {
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
  console.error("Boundary not found");
  process.exit(1);
}

const boundary = boundaryMatch[1];
const parts = rawContent.split('--' + boundary);

const htmlPart = parts.find(p => p.includes('Content-Type: text/html'));
if (!htmlPart) {
  console.error("HTML part not found");
  process.exit(1);
}

const separatorIndex = htmlPart.indexOf('\r\n\r\n');
const body = htmlPart.substring(separatorIndex + 4);
const cleanHtml = decodeQuotedPrintable(body);

fs.writeFileSync('./clean_webpage.html', cleanHtml);
console.log("Decoded HTML written to clean_webpage.html");

const dom = new JSDOM(cleanHtml);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

dom.window.Element.prototype.getBoundingClientRect = function() {
  return { width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100 };
};

const defaultGetComputedStyle = dom.window.getComputedStyle;
dom.window.getComputedStyle = function(el) {
  const s = defaultGetComputedStyle(el);
  s.display = 'block';
  s.visibility = 'visible';
  return s;
};

globalThis.chrome = {
  runtime: { id: 'mock' }
};

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
      }
    };
  }
  return {
    element: f,
    signals: extractSignals(f, blocks)
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
    if (!mappedElements.has(f)) {
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
