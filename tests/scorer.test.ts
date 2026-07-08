// @vitest-environment jsdom
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

// Mock chrome extension APIs for JSDOM test context
globalThis.chrome = {
  runtime: {
    onMessage: {
      addListener: () => {}
    }
  }
} as any;

import { scanForFields } from '../src/content/dom/field-scanner.js';
import { detectRepeatedBlocks } from '../src/content/dom/repeated-block-detector.js';
import { extractSignals } from '../src/content/dom/signal-extractor.js';
import { resolveAllFields } from '../src/content/matching/scorer.js';
import { Profile } from '../src/shared/types.js';

let getValueByPath: any;

beforeAll(async () => {
  const mod = await import('../src/content/index.js');
  getValueByPath = mod.getValueByPath;
});

const mockProfile: Profile = {
  personal: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+15550192834',
    nationalId: '123-456-7890'
  },
  optIns: {
    sensitiveEeo: false
  }
};

const genericFormHTML = `
<form id="application-form">
  <div>
    <label for="first_name">First Name</label>
    <input type="text" id="first_name" name="first_name" autocomplete="given-name">
  </div>
  <div>
    <label for="last_name">Last Name</label>
    <input type="text" id="last_name" name="last_name" autocomplete="family-name">
  </div>
  <div>
    <label for="email">Email Address</label>
    <input type="email" id="email" name="email">
  </div>
  <div>
    <label for="phone">Phone Number</label>
    <input type="tel" id="phone" name="phone">
  </div>
  <div>
    <label for="ssn">Social Security Number (SSN)</label>
    <input type="password" id="ssn" name="ssn">
  </div>
  <div>
    <label for="degree">Highest Level of Education</label>
    <select id="degree" name="degree">
      <option value="">Select...</option>
      <option value="highschool">High School</option>
      <option value="bachelors">Bachelor's Degree</option>
      <option value="masters">Master's Degree</option>
      <option value="phd">Ph.D. / Doctorate</option>
    </select>
  </div>
</form>
`;

describe('ApplyEngine Scoring and Alignment Pipeline', () => {
  beforeEach(() => {
    document.body.innerHTML = genericFormHTML;
  });

  it('correctly maps form inputs to profile keys with correct gates', () => {
    const fields = scanForFields(document.body);
    const blocks = detectRepeatedBlocks(document.body);

    const fieldsWithSignals = fields.map(f => {
      const el = f as Element;
      return {
        element: el,
        signals: extractSignals(el, blocks)
      };
    });

    const results = resolveAllFields(fieldsWithSignals, mockProfile);

    // 1. Assert First Name maps to personal.firstName
    const firstNameResult = results.find(r => r.element.id === 'first_name');
    expect(firstNameResult).toBeDefined();
    expect(firstNameResult!.key).toBe('personal.firstName');
    expect(firstNameResult!.gate).toBe('confident');

    // 2. Assert Email maps to personal.email
    const emailResult = results.find(r => r.element.id === 'email');
    expect(emailResult).toBeDefined();
    expect(emailResult!.key).toBe('personal.email');
    expect(emailResult!.gate).toBe('confident');

    // 3. Assert SSN/National ID maps to personal.nationalId and triggers needs-confirm
    const ssnResult = results.find(r => r.element.id === 'ssn');
    expect(ssnResult).toBeDefined();
    expect(ssnResult!.key).toBe('personal.nationalId');
    expect(ssnResult!.gate).toBe('needs-confirm');

    // 4. Assert Degree dropdown maps to education.highest.degree (due to highest context bonus)
    const degreeResult = results.find(r => r.element.id === 'degree');
    expect(degreeResult).toBeDefined();
    expect(degreeResult!.key).toBe('education.highest.degree');
  });

  it('correctly reduces to the highest-ranked education degree using getValueByPath', () => {
    const testProfile: Profile = {
      personal: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '123'
      },
      education: [
        {
          school: 'State University',
          degree: 'Bachelor of Science',
          fieldOfStudy: 'Engineering'
        },
        {
          school: 'Ivy College',
          degree: 'Master of Science',
          fieldOfStudy: 'Computer Science'
        },
        {
          school: 'Local High',
          degree: 'High School Diploma',
          fieldOfStudy: 'General'
        }
      ],
      optIns: {
        sensitiveEeo: false
      }
    };

    const highestDegree = getValueByPath(testProfile, 'education.highest.degree');
    const highestSchool = getValueByPath(testProfile, 'education.highest.school');

    expect(highestDegree).toBe('Master of Science');
    expect(highestSchool).toBe('Ivy College');
  });
});
