import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const domInstance = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = domInstance.window;
global.document = domInstance.window.document;
global.Node = domInstance.window.Node;
global.Element = domInstance.window.Element;
global.HTMLElement = domInstance.window.HTMLElement;
global.HTMLInputElement = domInstance.window.HTMLInputElement;
global.HTMLSelectElement = domInstance.window.HTMLSelectElement;
global.HTMLTextAreaElement = domInstance.window.HTMLTextAreaElement;
global.NodeFilter = domInstance.window.NodeFilter;

import { scanForFields } from '../src/content/dom/field-scanner.js';
import { detectRepeatedBlocks } from '../src/content/dom/repeated-block.js';
import { extractSignals } from '../src/content/dom/signal-extractor.js';
import { resolveAllFields } from '../src/content/matching/scorer.js';
import { getValueByPath } from '../src/content/core/value-path.js';
import { compileRule } from '../src/shared/dictionary/rules.js';

// Load raw rules json to have access to types mapping
import rawRules from '../src/shared/dictionary/rules.json' with { type: 'json' };

const FORM_MAPPINGS = [
  { template: 'A11.html', data: 'job_applications.json', name: 'Job Application' },
  { template: 'A12.html', data: 'grant_applications.json', name: 'Grant Application' },
  { template: 'A13.html', data: 'scholarship_applications.json', name: 'Scholarship Application' },
  { template: 'A14.html', data: 'paper_submissions.json', name: 'Paper Submission' },
  { template: 'A15.html', data: 'student_courses.json', name: 'Student Course Registration' },
  { template: 'B11.html', data: 'startup_funding_applications.json', name: 'Startup Funding' },
  { template: 'B12.html', data: 'real_estate_rental_applications.json', name: 'Real Estate Rental' },
  { template: 'B13.html', data: 'workshop_registrations.json', name: 'Workshop Registration' },
  { template: 'B14.html', data: 'membership_application.json', name: 'Membership Application' },
  { template: 'C11.html', data: 'Art_Exhibition_Submission_Form.json', name: 'Art Exhibition' },
  { template: 'C12.html', data: 'Literary_Magazine_Submission.json', name: 'Literary Magazine' },
  { template: 'C13.html', data: 'Conference_Speaker_Application.json', name: 'Conference Speaker' },
  { template: 'D11.html', data: 'Bug_report.json', name: 'Bug Report' },
  { template: 'D12.html', data: 'IT_support.json', name: 'IT Support' },
  { template: 'E11.html', data: 'person_loan_applications.json', name: 'Personal Loan' },
  { template: 'E12.html', data: 'bank_account_applications.json', name: 'Bank Account' },
  { template: 'E13.html', data: 'financial_planning.json', name: 'Financial Planning' },
  { template: 'F11.html', data: 'Patient_Consent.json', name: 'Patient Consent' },
  { template: 'F12.html', data: 'Medical_study_Form.json', name: 'Medical Study' },
  { template: 'F13.html', data: 'Health_Insurance.json', name: 'Health Insurance' },
  { template: 'G11.html', data: 'NDA.json', name: 'NDA Submission' },
  { template: 'G12.html', data: 'Background_check.json', name: 'Background Check' },
  { template: 'G13.html', data: 'Contrator_onboard.json', name: 'Contractor Onboarding' },
  { template: 'H11.html', data: 'Project_Bid.json', name: 'Project Bid' },
  { template: 'H12.html', data: 'Manufacturing_Order.json', name: 'Manufacturing Order' }
];

const TEMPLATE_DIR = 'formfactory/templates';
const DATA_DIR = 'formfactory/data/data1';

// Dynamic form field creator simulation to handle A12.html and dynamic fields
function compileJinjaTemplate(templateContent, baseContent) {
  // Extract block content
  const contentMatch = templateContent.match(/{% block content %}([\s\S]*?){% endblock %}/);
  const blockContent = contentMatch ? contentMatch[1] : templateContent;
  
  if (baseContent) {
    return baseContent.replace(/{% block content %}[\s\S]*?{% endblock %}/, blockContent);
  }
  return blockContent;
}

// Flatten options label texts helper
function cleanLabel(text) {
  return (text || '').replace(/[:*]/g, '').trim().toLowerCase();
}

function matchesLabel(goldKey, cleanFieldName) {
  const cleanGold = cleanLabel(goldKey);
  if (cleanGold === cleanFieldName) return true;
  
  const goldWords = cleanGold.split(/[^a-z0-9]+/);
  const fieldWords = cleanFieldName.split(/[^a-z0-9]+/);

  const fieldWordSet = new Set(fieldWords);
  const allWordsMatch = goldWords.every(w => fieldWordSet.has(w));
  if (allWordsMatch) return true;

  const goldWordSet = new Set(goldWords);
  const allFieldWordsMatch = fieldWords.every(w => goldWordSet.has(w));
  if (allFieldWordsMatch && fieldWords.length > 0) return true;

  return false;
}

async function runEvaluation() {
  const baseContent = fs.readFileSync(path.join(TEMPLATE_DIR, 'base.html'), 'utf8');
  
  let totalFields = 0;
  let correctFields = 0;
  let unmappedFields = 0;
  let mismatchedFields = 0;

  const results = [];

  for (const mapping of FORM_MAPPINGS) {
    const templatePath = path.join(TEMPLATE_DIR, mapping.template);
    const dataPath = path.join(DATA_DIR, mapping.data);
    
    if (!fs.existsSync(templatePath) || !fs.existsSync(dataPath)) {
      console.warn(`Skipping ${mapping.name} - files not found.`);
      continue;
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const dataList = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const goldProfile = dataList[0]; // Evaluate against first test candidate profile in dataset
    
    // Compile templates
    const fullHtml = compileJinjaTemplate(templateContent, baseContent);
    const dom = new JSDOM(fullHtml);
    const doc = dom.window.document;

    // JSDOM mock layout dimensions
    dom.window.Element.prototype.getBoundingClientRect = function() {
      return { width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 };
    };

    // If template has dynamic configurator, simulate it
    if (mapping.template === 'A12.html') {
      // Grant Application fields
      const form = doc.getElementById('dynamicForm');
      if (form) {
        const fields = [
          { name: "first_name", label: "First Name", type: "string" },
          { name: "last_name", label: "Last Name", type: "string" },
          { name: "email", label: "Email", type: "email" },
          { name: "dob", label: "Date of Birth", type: "date" },
          { name: "gender", label: "Gender", type: "radio", options: ["Male", "Female"] },
          { name: "subscribe", label: "Subscribe to Newsletter", type: "checkbox" }
        ];
        fields.forEach(field => {
          const group = doc.createElement('div');
          const label = doc.createElement('label');
          label.setAttribute('for', field.name);
          label.textContent = field.label;
          group.appendChild(label);
          if (field.type === 'radio' || field.type === 'checkbox') {
            (field.options || [field.name]).forEach(opt => {
              const input = doc.createElement('input');
              input.type = field.type;
              input.name = field.name;
              input.value = opt;
              group.appendChild(input);
            });
          } else {
            const input = doc.createElement('input');
            input.type = field.type === 'string' ? 'text' : field.type;
            input.name = field.name;
            input.id = field.name;
            group.appendChild(input);
          }
          form.appendChild(group);
        });
      }
    }

    const fields = scanForFields(doc);
    const blocks = detectRepeatedBlocks(doc);
    const fieldsWithSignals = fields.map(f => ({
      element: f,
      signals: extractSignals(f, blocks)
    }));

    // Construct a mock FormFilla profile object populated with FormFactory gold values.
    // To do this, we map standard FormFactory label names to FormFilla profile paths.
    const mockProfile = {
      personal: {},
      address: {},
      links: {},
      workAuthorization: {},
      academics: {},
      documents: {},
      custom: {},
      education: [{}, {}, {}],
      experience: [{}, {}, {}],
      references: [{}, {}, {}]
    };

    // Auto-map gold values to profile paths by checking labels
    const mappedGold = new Map(); // field elements -> gold value
    
    fieldsWithSignals.forEach(({ element, signals }) => {
      const cleanFieldName = cleanLabel(signals.label || signals.name || signals.id || '');
      // Look up closest label match in goldProfile
      let bestKey = '';
      let bestValue = null;
      for (const [goldKey, goldVal] of Object.entries(goldProfile)) {
        if (matchesLabel(goldKey, cleanFieldName)) {
          bestKey = goldKey;
          bestValue = goldVal;
          break;
        }
      }
      if (bestValue !== null) {
        mappedGold.set(element, bestValue);
      }
    });

    // 1. Pre-pass: run resolver with empty profile to identify standard field mappings
    const preScored = resolveAllFields(fieldsWithSignals, mockProfile);

    // 2. Populate mockProfile with standard and custom gold values
    const matchedElements = new Set();
    
    preScored.forEach(sf => {
      if (sf.gate !== 'unmapped') {
        const goldVal = mappedGold.get(sf.element);
        if (goldVal !== undefined) {
          matchedElements.add(sf.element);
          // Set value at the resolved profile key path
          const keyParts = sf.key.split('.');
          let current = mockProfile;
          for (let i = 0; i < keyParts.length - 1; i++) {
            const part = keyParts[i];
            if (part.includes('[')) {
              const arrayName = part.split('[')[0];
              const idx = parseInt(part.match(/\[(\d+)\]/)[1]);
              if (!current[arrayName]) current[arrayName] = [];
              if (!current[arrayName][idx]) current[arrayName][idx] = {};
              current = current[arrayName][idx];
            } else {
              if (!current[part]) current[part] = {};
              current = current[part];
            }
          }
          const lastPart = keyParts[keyParts.length - 1];
          current[lastPart] = goldVal;
        }
      }
    });

    // For any field elements that were NOT matched by standard rules, clean their label and store under mockProfile.custom
    fieldsWithSignals.forEach(({ element, signals }) => {
      if (matchedElements.has(element)) return;

      const goldVal = mappedGold.get(element);
      if (goldVal !== undefined) {
        // Find corresponding gold key
        let matchedGoldKey = '';
        const cleanFieldName = cleanLabel(signals.label || signals.name || signals.id || '');
        for (const goldKey of Object.keys(goldProfile)) {
          if (matchesLabel(goldKey, cleanFieldName)) {
            matchedGoldKey = goldKey;
            break;
          }
        }
        if (matchedGoldKey) {
          // convert to camelCase
          const camelCaseKey = matchedGoldKey
            .replace(/[^a-zA-Z0-9]/g, ' ')
            .trim()
            .split(/\s+/)
            .map((w, idx) => idx === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join('');
          
          mockProfile.custom[camelCaseKey] = goldVal;
        }
      }
    });

    // 3. Real resolution: resolve fields using the fully populated profile (standard + custom)
    const finalScored = resolveAllFields(fieldsWithSignals, mockProfile);
    
    let formTotal = 0;
    let formCorrect = 0;
    let formUnmapped = 0;
    let formMismatched = 0;

    const formDetails = [];

    fieldsWithSignals.forEach(({ element, signals }) => {
      const goldVal = mappedGold.get(element);
      if (goldVal === undefined) return; // Skip fields not present in FormFactory ground truth

      formTotal++;
      totalFields++;

      const sf = finalScored.find(f => f.element === element);
      if (!sf || sf.gate === 'unmapped') {
        formUnmapped++;
        unmappedFields++;
        formDetails.push({
          label: signals.label || signals.name || 'Unnamed',
          gold: goldVal,
          mappedKey: 'None',
          status: 'UNMAPPED'
        });
      } else {
        const filledVal = getValueByPath(mockProfile, sf.key);
        // Normalize comparison for comparison check
        const filledStr = String(filledVal || '').trim().toLowerCase();
        const goldStr = String(goldVal || '').trim().toLowerCase();
        
        // Simple boolean and exact string normalization check
        const isMatch = (filledStr === goldStr) || 
                        (goldStr === 'true' && (filledStr === 'yes' || filledStr === 'true')) ||
                        (goldStr === 'false' && (filledStr === 'no' || filledStr === 'false')) ||
                        ((goldStr === 'none' || goldStr === '') && (filledStr === '' || filledStr === 'undefined'));

        if (isMatch) {
          formCorrect++;
          correctFields++;
          formDetails.push({
            label: signals.label || signals.name || 'Unnamed',
            gold: goldVal,
            mappedKey: sf.key,
            status: 'CORRECT'
          });
        } else {
          formMismatched++;
          mismatchedFields++;
          formDetails.push({
            label: signals.label || signals.name || 'Unnamed',
            gold: goldVal,
            mappedKey: sf.key,
            filled: filledVal,
            status: 'MISMATCHED'
          });
        }
      }
    });

    results.push({
      name: mapping.name,
      total: formTotal,
      correct: formCorrect,
      unmapped: formUnmapped,
      mismatched: formMismatched,
      rate: formTotal > 0 ? (formCorrect / formTotal * 100).toFixed(1) + '%' : '0%',
      details: formDetails
    });
  }

  console.log('\n======================================================');
  console.log('            FORMFACTORY BENCHMARK AUDIT               ');
  console.log('======================================================');
  console.log(`Total Scanned Forms: ${results.length}`);
  console.log(`Total Fields Checked: ${totalFields}`);
  console.log(`Correctly Mapped/Filled: ${correctFields} (${(correctFields/totalFields*100).toFixed(1)}%)`);
  console.log(`Unmapped (Missed): ${unmappedFields} (${(unmappedFields/totalFields*100).toFixed(1)}%)`);
  console.log(`Mismatched/Wrong Key: ${mismatchedFields} (${(mismatchedFields/totalFields*100).toFixed(1)}%)`);
  console.log('------------------------------------------------------\n');

  console.log(String.prototype.padEnd ? '' : 'Polyfill warning');
  console.log('Form Name'.padEnd(30) + ' | Total | Correct | Missed | Wrong | Match Rate');
  console.log('-'.repeat(75));
  results.forEach(r => {
    console.log(
      r.name.padEnd(30) + ' | ' +
      String(r.total).padEnd(5) + ' | ' +
      String(r.correct).padEnd(7) + ' | ' +
      String(r.unmapped).padEnd(6) + ' | ' +
      String(r.mismatched).padEnd(5) + ' | ' +
      r.rate
    );
  });
  console.log('\n======================================================');

  // Print details on unmapped or mismatched fields to help us iterate!
  console.log('\nDETAILED MISSES AND MISMATCHES BY FORM:');
  console.log('======================================================');
  results.forEach(r => {
    const issues = r.details.filter(d => d.status !== 'CORRECT');
    if (issues.length > 0) {
      console.log(`\n> ${r.name}:`);
      issues.forEach(issue => {
        if (issue.status === 'UNMAPPED') {
          console.log(`  [Missed] Label: "${issue.label}" (Expected Value: "${issue.gold}")`);
        } else {
          console.log(`  [Wrong]  Label: "${issue.label}" Mapped Key: "${issue.mappedKey}" (Expected: "${issue.gold}", Filled: "${issue.filled}")`);
        }
      });
    }
  });
}

runEvaluation().catch(err => console.error(err));
