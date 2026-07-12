import { getValueByPath } from '../src/content/core/value-path.js';
import { test, expect } from 'vitest';

test('phone area code extraction fallbacks', () => {
  const profile = {
    personal: {
      phone: '+92 3225522383'
    }
  };

  const areaCode = getValueByPath(profile, 'personal.phoneAreaCode');
  expect(areaCode).toBe('+92');

  const profile2 = {
    personal: {
      phone: '+1-555-1234'
    }
  };
  expect(getValueByPath(profile2, 'personal.phoneAreaCode')).toBe('+1');
});
