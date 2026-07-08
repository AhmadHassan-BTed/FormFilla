import { DateFieldGroup } from '../../shared/types/index.js';
import { setNativeValue } from './native-setter.js';
import { fillSelect } from './select-filler.js';

export function fillDate(field: HTMLInputElement | DateFieldGroup, isoDate: string): boolean {
  const parts = isoDate.split('-');
  if (parts.length < 2) return false;

  const year = parts[0];
  const month = parts[1];
  const day = parts[2] || '01';

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = monthIndex >= 0 && monthIndex < 12 ? monthNames[monthIndex] : '';

  function fillSubEl(el: HTMLElement, val: string, nameVal: string): boolean {
    if (el.tagName === 'SELECT') {
      const select = el as HTMLSelectElement;
      let ok = fillSelect(select, val);
      if (!ok) {
        ok = fillSelect(select, parseInt(val, 10).toString());
      }
      if (!ok && nameVal) {
        ok = fillSelect(select, nameVal);
        if (!ok) {
          ok = fillSelect(select, nameVal.substring(0, 3));
        }
      }
      return ok;
    } else if (el.tagName === 'INPUT') {
      setNativeValue(el as HTMLInputElement, val);
      return true;
    }
    return false;
  }

  if ('type' in field && (field as any).type === 'date-group') {
    const group = field as DateFieldGroup;
    const mOk = fillSubEl(group.monthEl, month, monthName);
    const dOk = fillSubEl(group.dayEl, day, '');
    const yOk = fillSubEl(group.yearEl, year, '');
    return mOk && dOk && yOk;
  }

  const input = field as HTMLInputElement;
  const inputType = (input.type || '').toLowerCase();

  if (inputType === 'date') {
    setNativeValue(input, `${year}-${month}-${day}`);
    return true;
  }

  const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
  
  if (placeholder.includes('yyyy') && placeholder.includes('mm') && placeholder.includes('dd')) {
    const divider = placeholder.includes('/') ? '/' : '-';
    if (placeholder.startsWith('mm')) {
      setNativeValue(input, `${month}${divider}${day}${divider}${year}`);
    } else if (placeholder.startsWith('dd')) {
      setNativeValue(input, `${day}${divider}${month}${divider}${year}`);
    } else {
      setNativeValue(input, `${year}${divider}${month}${divider}${day}`);
    }
    return true;
  }

  if (placeholder.includes('yyyy') && placeholder.includes('mm')) {
    const divider = placeholder.includes('/') ? '/' : '-';
    if (placeholder.startsWith('mm')) {
      setNativeValue(input, `${month}${divider}${year}`);
    } else {
      setNativeValue(input, `${year}${divider}${month}`);
    }
    return true;
  }

  setNativeValue(input, isoDate);
  return true;
}
