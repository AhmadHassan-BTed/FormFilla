import { PlatformAdapter } from '../../shared/types.js';

export class GenericAdapter implements PlatformAdapter {
  matches(): boolean {
    return true;
  }
}
