import { FieldFiller } from './filler.interface.js';
import { DateFiller } from './date-filler.js';
import { SelectFiller } from './select-filler.js';
import { ComboboxFiller } from './combobox-adapter.js';
import { FileFiller } from './file-filler.js';
import { TextInputFiller, ContentEditableFiller } from './native-setter.js';

export * from './filler.interface.js';
export { fillSelect } from './select-filler.js';
export { fillFileInput } from './file-filler.js';
export { fillChoiceGroup } from './radio-checkbox-filler.js';
export { setNativeValue } from './native-setter.js';

export const FIELD_FILLERS: FieldFiller[] = [
  new DateFiller(),
  new SelectFiller(),
  new ComboboxFiller(),
  new FileFiller(),
  new TextInputFiller(),
  new ContentEditableFiller()
];
