import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// Setup Mock DOM global variables before importing content scripts
const baseDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = baseDom.window;
global.document = baseDom.window.document;
global.Node = baseDom.window.Node;
global.Element = baseDom.window.Element;
global.HTMLElement = baseDom.window.HTMLElement;
global.HTMLInputElement = baseDom.window.HTMLInputElement;
global.HTMLSelectElement = baseDom.window.HTMLSelectElement;
global.HTMLTextAreaElement = baseDom.window.HTMLTextAreaElement;
global.NodeFilter = baseDom.window.NodeFilter;

// Set up prototypes
baseDom.window.Element.prototype.getBoundingClientRect = function() {
  return { width: 100, height: 40, top: 100, left: 100, right: 200, bottom: 140 };
};

// Import content pipeline modules
import { scanForFields } from '../src/content/dom/field-scanner.ts';
import { detectRepeatedBlocks } from '../src/content/dom/repeated-block.ts';
import { extractSignals } from '../src/content/dom/signal-extractor.ts';
import { resolveAllFields } from '../src/content/matching/scorer.ts';
import { getValueByPath } from '../src/content/core/value-path.ts';

const SAMPLE_PATH = 'scratch/mind2web_sample.json';

function camelCaseLabel(text) {
  if (!text) return '';
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w, idx) => idx === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function getElementBestLabel(el, doc) {
  // Check label tag associated with element
  if (el.labels && el.labels.length > 0) {
    const text = el.labels[0].textContent?.trim();
    if (text) return text;
  }
  
  // Try finding a <label> with for="id"
  const id = el.getAttribute('id');
  if (id) {
    const labelEl = doc.querySelector(`label[for="${id}"]`);
    if (labelEl) {
      const text = labelEl.textContent?.trim();
      if (text) return text;
    }
  }

  // Fallbacks
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const name = el.getAttribute('name');
  if (name) return name;

  if (id) return id;

  return '';
}

function setValueAtPath(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const arrayMatch = part.match(/^([a-zA-Z0-9_-]+)\[(\d+)\]$/);
    if (arrayMatch) {
      const arrayKey = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      if (!current[arrayKey]) {
        current[arrayKey] = [];
      }
      while (current[arrayKey].length <= index) {
        current[arrayKey].push({});
      }
      current = current[arrayKey][index];
    } else {
      const cleanKey = part.replace('[]', '');
      if (!current[cleanKey]) {
        current[cleanKey] = {};
      }
      current = current[cleanKey];
    }
  }
  
  const lastPart = parts[parts.length - 1];
  const arrayMatch = lastPart.match(/^([a-zA-Z0-9_-]+)\[(\d+)\]$/);
  if (arrayMatch) {
    const arrayKey = arrayMatch[1];
    const index = parseInt(arrayMatch[2], 10);
    if (!current[arrayKey]) {
      current[arrayKey] = [];
    }
    current[arrayKey][index] = value;
  } else {
    const cleanKey = lastPart.replace('[]', '');
    current[cleanKey] = value;
  }
}

async function runEvaluation() {
  if (!fs.existsSync(SAMPLE_PATH)) {
    console.error(`Error: compact dataset not found at ${SAMPLE_PATH}. Run python scripts/filter_mind2web.py first.`);
    process.exit(1);
  }

  const tasks = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));

  let totalActions = 0;
  let correctActions = 0;
  let skippedActions = 0;
  let failedActions = 0;

  const failures = [];

  console.log(`\n======================================================`);
  console.log(`            MIND2WEB STRESS TEST RUNNER               `);
  console.log(`======================================================`);
  console.log(`Total Tasks Loaded: ${tasks.length}`);

  for (const task of tasks) {
    // We run each action step as its own test case
    for (const act of task.actions) {
      totalActions++;

      const dom = new JSDOM(act.html);
      const doc = dom.window.document;
      
      // Inject JSDOM prototypes to return a valid viewport boundary
      dom.window.Element.prototype.getBoundingClientRect = function() {
        return { width: 100, height: 40, top: 100, left: 100, right: 200, bottom: 140 };
      };

      // Find the targeted element in this action
      const targetEl = doc.querySelector(`[backend_node_id="${act.backend_node_id}"]`);
      if (!targetEl) {
        skippedActions++;
        continue;
      }

      // Check if target is a fillable element type
      const tagName = targetEl.tagName.toUpperCase();
      if (tagName !== 'INPUT' && tagName !== 'SELECT' && tagName !== 'TEXTAREA') {
        skippedActions++;
        continue;
      }

      // Reconstruct mock profile
      const rawLabel = getElementBestLabel(targetEl, doc);
      const cleanKey = camelCaseLabel(rawLabel);
      if (!cleanKey) {
        skippedActions++;
        continue; // Cannot construct a rule without a label/name signal
      }

      const mockProfile = {
        personal: {}, address: {}, links: {}, academics: {}, documents: {}, custom: {},
        education: [{}, {}, {}], experience: [{}, {}, {}], references: [{}, {}, {}]
      };

      // PASS 1: Dry run to find where scorer maps the elements in empty profile
      const fields = scanForFields(doc);
      
      // Check if targetEl was scanned
      const scannedTarget = fields.find(el => el.getAttribute('backend_node_id') === act.backend_node_id);
      if (!scannedTarget) {
        failedActions++;
        failures.push({
          task: task.confirmed_task,
          website: task.website,
          label: rawLabel,
          key: 'None',
          expected: act.value,
          got: 'None',
          error: 'Element skipped by scanner (invisible or layout constraints)'
        });
        continue;
      }

      const blocks = detectRepeatedBlocks(doc);
      const fieldsWithSignals = fields.map(f => ({
        element: f,
        signals: extractSignals(f, blocks)
      }));

      // Find signals of target element
      const targetSignals = fieldsWithSignals.find(f => f.element.getAttribute('backend_node_id') === act.backend_node_id)?.signals;

      const preScored = resolveAllFields(fieldsWithSignals, mockProfile);
      const preScoredMatch = preScored.find(sf => sf.element.getAttribute('backend_node_id') === act.backend_node_id);

      let targetPath = '';
      if (preScoredMatch && preScoredMatch.gate !== 'unmapped') {
        targetPath = preScoredMatch.key;
      } else {
        // Fall back to custom dynamic property matching path
        targetPath = `custom.${cleanKey}`;
      }

      // Set value at the resolved profile key path
      setValueAtPath(mockProfile, targetPath, act.value);

      // PASS 2: Scorer run with populated profile
      const resolved = resolveAllFields(fieldsWithSignals, mockProfile);

      // Verify final mapping
      const matchedField = resolved.find(sf => sf.element.getAttribute('backend_node_id') === act.backend_node_id);

      if (matchedField && matchedField.gate !== 'unmapped') {
        const val = getValueByPath(mockProfile, matchedField.key);
        if (String(val) === String(act.value)) {
          correctActions++;
        } else {
          failedActions++;
          failures.push({
            task: task.confirmed_task,
            website: task.website,
            label: rawLabel,
            key: matchedField.key,
            expected: act.value,
            got: val,
            error: `Value mismatch (Expected "${act.value}", Got "${val}" at key "${matchedField.key}")`,
            signals: targetSignals
          });
        }
      } else {
        failedActions++;
        failures.push({
          task: task.confirmed_task,
          website: task.website,
          label: rawLabel,
          key: 'Unmapped',
          expected: act.value,
          got: 'None',
          error: `Scorer unmapped the element (target path proposed: "${targetPath}")`,
          signals: targetSignals
        });
      }
    }
  }

  const activeActions = totalActions - skippedActions;
  const matchRate = activeActions > 0 ? (correctActions / activeActions) * 100 : 100;

  console.log(`\n======================================================`);
  console.log(`            MIND2WEB STRESS TEST RESULTS              `);
  console.log(`======================================================`);
  console.log(`Total Actions:           ${totalActions}`);
  console.log(`Skipped (Non-fillable):  ${skippedActions}`);
  console.log(`Active Stress Cases:     ${activeActions}`);
  console.log(`Correctly Mapped/Filled: ${correctActions}`);
  console.log(`Failed/Missed Mappings:  ${failedActions}`);
  console.log(`Stress Test Success Rate: ${matchRate.toFixed(1)}%`);
  console.log(`======================================================`);

  if (failures.length > 0) {
    console.log(`\nDETAILED FAILURES:`);
    failures.forEach((fail, idx) => {
      console.log(`\n[${idx + 1}] Website: ${fail.website}`);
      console.log(`    Task:     ${fail.task}`);
      console.log(`    Label:    "${fail.label}"`);
      console.log(`    Mapped:   ${fail.key}`);
      console.log(`    Expected: "${fail.expected}"`);
      console.log(`    Got:      "${fail.got}"`);
      console.log(`    Reason:   ${fail.error}`);
      if (fail.signals) {
        console.log(`    Signals:  Label="${fail.signals.label}", Name="${fail.signals.name}", Placeholder="${fail.signals.placeholder}", ID="${fail.signals.id}"`);
      }
    });
  }
}

runEvaluation().catch(err => {
  console.error(err);
  process.exit(1);
});
