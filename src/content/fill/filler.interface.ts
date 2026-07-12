import { Profile } from '../../shared/types/index.js';

export interface FillContext {
  profile: Profile;
  key: string;
  getFileBlob: (key: string) => Promise<ArrayBuffer>;
  getValueByPath: (obj: any, path: string) => any;
  stringifyValue: (val: any) => string;
}

export interface FieldFiller {
  /**
   * Returns whether this filler supports the given DOM element and path key.
   */
  supports(el: any, key: string, val: any): boolean;

  /**
   * Performs the filling operation on the element.
   */
  fill(el: any, val: any, context: FillContext): Promise<boolean> | boolean;
}
